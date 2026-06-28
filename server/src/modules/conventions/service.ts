import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  ConventionsRepository,
  type InsertConvention,
  type RepoBasics,
} from './repository.js';
import { toConventionDto, fingerprint, sliceSnippet, buildSkillBody } from './helpers.js';
import { RawCandidatesEnvelope, type ConventionsMeta, type SkillPreview } from './types.js';
import {
  SAMPLE_FILE_COUNT,
  CONFIG_FILES,
  MAX_SAMPLE_LINES,
  EXTRACT_SYSTEM_PROMPT,
  EXTRACT_SCHEMA_NAME,
} from './constants.js';

/**
 * Conventions Extractor — application service (spec §§2–6).
 *
 * extract(): mechanical sample bundle (top-ranked files + tooling configs, read
 * through the `git` port) → one structured model call → CODE verification of
 * every cited evidence (file exists + line in range, via the `git` port again)
 * → re-scan dedup against rejected → insert survivors as `pending`. The model
 * never decides what survives; unverifiable claims are dropped before the UI.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(
    workspaceId: string,
    repoId: string,
  ): Promise<{ items: ConventionCandidate[]; meta: ConventionsMeta }> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    const last = await this.repo.lastScanAt(workspaceId, repoId);
    return {
      items: rows.map(toConventionDto),
      meta: { sampleCount: rows.length, lastScanAt: last ? last.toISOString() : null },
    };
  }

  async extract(
    workspaceId: string,
    repoId: string,
  ): Promise<{ items: ConventionCandidate[]; meta: ConventionsMeta }> {
    const repo = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // §2 — mechanical sample selection (no model).
    const { bundle, contents, sampleCount } = await this.buildSampleBundle(repo, repoId);

    // §3.2 — one structured model call on the cheap `conventions` feature model.
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const result = await llm.completeStructured({
      model,
      schema: RawCandidatesEnvelope,
      schemaName: EXTRACT_SCHEMA_NAME,
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: bundle },
      ],
    });

    // §3.3 — verify each candidate's evidence in code; §3.4 — dedup vs rejected.
    const rejected = await this.repo.rejectedFor(workspaceId, repoId);
    const rejectedFp = new Set(rejected.map((r) => fingerprint(r.evidencePath ?? '', r.rule)));

    const toInsert: InsertConvention[] = [];
    const seen = new Set<string>();
    for (const c of result.data.candidates) {
      const content = contents.get(c.evidence.file) ?? (await this.tryRead(repo, c.evidence.file));
      if (content == null) continue; // file doesn't exist → drop
      const lineCount = content.split('\n').length;
      if (c.evidence.line < 1 || c.evidence.line > lineCount) continue; // line out of range → drop

      const { snippet, range } = sliceSnippet(content, c.evidence.line);
      const evidencePath = `${c.evidence.file}:${range}`;
      const fp = fingerprint(evidencePath, c.rule);
      if (rejectedFp.has(fp) || seen.has(fp)) continue; // previously rejected / dup in batch
      seen.add(fp);

      toInsert.push({
        workspaceId,
        repoId,
        category: c.category ?? null,
        rule: c.rule,
        evidencePath,
        evidenceSnippet: snippet,
        confidence: c.confidence,
      });
    }

    await this.repo.insertMany(toInsert);
    // sampleCount reflects files actually read, not the row count.
    const listed = await this.list(workspaceId, repoId);
    return { items: listed.items, meta: { ...listed.meta, sampleCount } };
  }

  async patchStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionCandidate> {
    const row = await this.repo.setStatus(workspaceId, id, status);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async patchRule(workspaceId: string, id: string, rule: string): Promise<ConventionCandidate> {
    const row = await this.repo.setRule(workspaceId, id, rule);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  /** §6 — preview generator only; the Skill row is created via `POST /skills`. */
  async skillPreview(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
    name?: string,
  ): Promise<SkillPreview> {
    const repo = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const rows = await this.repo.getAcceptedByIds(workspaceId, candidateIds);
    if (rows.length !== candidateIds.length) {
      throw new ValidationError('All selected candidates must be accepted');
    }

    const skillName = (name && name.trim()) || `${repo.name}-conventions`;
    const body = buildSkillBody(skillName, repo.fullName, rows);
    const evidence_files = [...new Set(rows.map((r) => (r.evidencePath ?? '').replace(/:\d+(-\d+)?$/, '')))];
    return { name: skillName, body, evidence_files };
  }

  // ---- internals ----

  private async buildSampleBundle(
    repo: RepoBasics,
    repoId: string,
  ): Promise<{ bundle: string; contents: Map<string, string>; sampleCount: number }> {
    const paths = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    const contents = new Map<string, string>();
    const parts: string[] = [];

    for (const path of paths) {
      const content = await this.tryRead(repo, path);
      if (content == null) continue;
      contents.set(path, content);
      parts.push(this.numberedBlock(path, content));
    }
    const sampleCount = contents.size;

    for (const cfg of CONFIG_FILES) {
      const content = await this.tryRead(repo, cfg);
      if (content == null) continue;
      contents.set(cfg, content);
      parts.push(this.numberedBlock(cfg, content));
    }

    const bundle =
      `Repository: ${repo.fullName}\n` +
      `Below are sample source files and tooling configs. Each line is prefixed "N| " — cite that N as the evidence line.\n\n` +
      parts.join('\n\n');
    return { bundle, contents, sampleCount };
  }

  /** A file block with 1-based line-number prefixes, capped at MAX_SAMPLE_LINES. */
  private numberedBlock(path: string, content: string): string {
    const lines = content.split('\n').slice(0, MAX_SAMPLE_LINES);
    const numbered = lines.map((l, i) => `${i + 1}| ${l}`).join('\n');
    return `===== FILE: ${path} =====\n${numbered}`;
  }

  /** Read a file from the clone through the git port; null when it doesn't exist. */
  private async tryRead(repo: RepoBasics, path: string): Promise<string | null> {
    try {
      return await this.container.git.readFile({ owner: repo.owner, name: repo.name }, path);
    } catch {
      return null;
    }
  }
}
