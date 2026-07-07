import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
// Intent is both a Zod schema (runtime value) and a TypeScript type — import the value.
import { Intent } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { approxTokens } from '../../adapters/tokenizer/index.js';
import { extractHunkHeaders, extractSpecPaths } from './helpers.js';
import {
  INTENT_SYSTEM_PROMPT,
  INTENT_SCHEMA_NAME,
  MAX_SPEC_PATHS,
  MAX_SPEC_BYTES,
} from './constants.js';

/**
 * Intent classifier service (spec `specs/intent-layer.md` §7 T-A).
 *
 * computeIntent(): gathers internal signals (title + body, linked issue,
 * in-repo spec files, hunk headers) → one structured LLM call → persists
 * via ReviewRepository → returns { intent }.
 *
 * getIntent(): reads the stored intent (never throws when absent — returns null).
 */
export class IntentService {
  private repo: ReviewRepository;

  constructor(private container: Container) {
    this.repo = container.reviewRepo;
  }

  // ---- public API -----------------------------------------------------------

  async computeIntent(
    workspaceId: string,
    prId: string,
    log: FastifyBaseLogger,
  ): Promise<{ intent: Intent }> {
    // §7 T-A step 1: resolve pull + repo (workspace-scoped).
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    // §7 T-A step 2a: linked issue via GitHub adapter (optional; absent offline).
    let linkedIssueBlock = '';
    try {
      const gh = await this.container.github();
      const prDetail = await gh.getPullRequest(repoRef, pull.number);
      if (prDetail.linked_issue) {
        const issue = prDetail.linked_issue;
        linkedIssueBlock =
          `\n## Linked issue #${issue.number}: ${issue.title}\n` +
          (issue.body ? issue.body.slice(0, 2_000) : '(no body)');
      }
    } catch {
      // Offline / no GitHub token — treat linked issue as absent (§11 "Offline path").
    }

    // §7 T-A step 2b: in-repo spec files referenced by path in the PR body.
    const specPaths = extractSpecPaths(pull.body ?? '').slice(0, MAX_SPEC_PATHS);
    let specBlock = '';
    for (const specPath of specPaths) {
      try {
        const content = await this.container.git.readFile(repoRef, specPath);
        // MockGitClient returns '' for unknown paths (INSIGHTS 2026-06-28).
        if (!content) continue;
        const trimmed = Buffer.byteLength(content, 'utf8') > MAX_SPEC_BYTES
          ? content.slice(0, MAX_SPEC_BYTES) + '\n… (truncated)'
          : content;
        specBlock += `\n## In-repo file: ${specPath}\n${trimmed}`;
      } catch {
        // Silently drop paths that error (shouldn't happen with the git port).
      }
    }

    // §7 T-A step 2c: hunk headers from each changed file (no diff bodies).
    const prFiles = await this.repo.getPrFiles(prId);
    const fullPatches: string[] = [];
    const hunkHeaderParts: string[] = [];

    for (const file of prFiles) {
      const patch = file.patch ?? '';
      fullPatches.push(patch);
      const headers = extractHunkHeaders(patch);
      if (headers) {
        hunkHeaderParts.push(`## File: ${file.path}\n${headers}`);
      }
    }
    const hunkHeadersBlock = hunkHeaderParts.join('\n\n');

    // §7 T-A step 3: build classifier prompt.
    const userContent = [
      `## PR title\n${pull.title}`,
      pull.body ? `## PR description\n${pull.body}` : '',
      linkedIssueBlock,
      specBlock,
      hunkHeadersBlock ? `## Diff hunk headers (structure only)\n${hunkHeadersBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // §7 T-A step 4: one structured LLM call.
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);
    const result = await llm.completeStructured({
      model,
      schema: Intent,
      schemaName: INTENT_SCHEMA_NAME,
      temperature: 0,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    // §7 T-A step 5: persist.
    await this.repo.upsertIntent(prId, result.data);

    // §7 T-A step 6 / Acceptance #4: token-savings log line.
    const fullPatchText = fullPatches.join('\n');
    const hunkHeaderText = hunkHeaderParts.join('\n');
    const fullPatchTokens = approxTokens(fullPatchText);
    const hunkHeaderTokens = approxTokens(hunkHeaderText);
    const tokensSaved = fullPatchTokens - hunkHeaderTokens;
    log.info({ hunkHeaderTokens, fullPatchTokens, tokensSaved }, 'intent:token-savings');

    return { intent: result.data };
  }

  async getIntent(workspaceId: string, prId: string): Promise<{ intent: Intent | null }> {
    // Workspace-scoped: verify the PR belongs to this workspace first.
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const intent = await this.repo.getIntent(prId);
    return { intent: intent ?? null };
  }
}
