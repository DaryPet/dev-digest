/**
 * review-command — orchestration for `devdigest review`.
 *
 * Injectable deps allow unit tests to stub git, agents, and LLM without
 * any real I/O. The production entry (index.ts) wires the real container.
 *
 * Exit code semantics (frozen, §5.5):
 *   0 — reviewed, no blockers (or empty diff)
 *   1 — blockers >= agent.ciFailOn gate
 *   2 — usage/config errors (bad args, unknown agent, not a git repo, ConfigError)
 */
import { basename } from 'node:path';
import type { LLMProvider, CiFailOn } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import type { ReviewInput, ReviewOutcome } from '@devdigest/reviewer-core';
import type { AgentRow } from '../db/rows.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { REVIEW_STRATEGY } from '../modules/reviews/constants.js';
import { ConfigError } from '../platform/errors.js';
import { NotAGitRepoError } from './git-diff.js';
import { formatReviewOutput } from './format.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ReviewCommandOptions {
  mode: string;
  agentName: string;
  targetDir: string;
}

export interface ReviewCommandDeps {
  /** Get the raw unified diff for the given directory. */
  getGitDiff: (cwd: string) => Promise<string>;
  /** List all agents for the given workspace. */
  listAgents: (workspaceId: string) => Promise<AgentRow[]>;
  /** Resolve the current workspace (no auth needed — local mode). */
  getCurrentWorkspace: () => Promise<{ id: string }>;
  /** Resolve an LLM provider by id. May throw ConfigError. */
  getLlm: (provider: string) => Promise<LLMProvider>;
  /** Review engine. Defaults to reviewPullRequest; injectable for tests. */
  doReview?: (input: ReviewInput) => Promise<ReviewOutcome>;
  /** Progress / event output → stderr. */
  stderr: (msg: string) => void;
  /** Final review output → stdout. */
  stdout: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Run the review command. Returns the exit code (0, 1, or 2).
 * Never calls process.exit — the caller (index.ts) does that.
 */
export async function runReviewCommand(
  opts: ReviewCommandOptions,
  deps: ReviewCommandDeps,
): Promise<number> {
  const doReview = deps.doReview ?? reviewPullRequest;

  try {
    // 1. Resolve workspace
    const ws = await deps.getCurrentWorkspace();

    // 2. Resolve agent by name
    const agents = await deps.listAgents(ws.id);
    const agent = agents.find((a) => a.name === opts.agentName);
    if (!agent) {
      const available = agents.map((a) => a.name).join(', ');
      deps.stderr(`Error: agent "${opts.agentName}" not found.`);
      deps.stderr(`Available agents: ${available || '(none)'}`);
      return 2;
    }

    // 3. Get git diff
    let rawDiff: string;
    try {
      rawDiff = await deps.getGitDiff(opts.targetDir);
    } catch (e: unknown) {
      if (e instanceof NotAGitRepoError) {
        deps.stderr(`Error: ${opts.targetDir} is not a git repository.`);
        return 2;
      }
      throw e;
    }

    // Empty diff → clean exit
    if (!rawDiff.trim()) {
      deps.stdout('No changes in working tree.');
      return 0;
    }

    const diff = parseUnifiedDiff(rawDiff);

    // 4. Resolve LLM provider (ConfigError → exit 2)
    let llm: LLMProvider;
    try {
      llm = await deps.getLlm(agent.provider);
    } catch (e: unknown) {
      if (e instanceof ConfigError) {
        deps.stderr(`Error: ${e.message}`);
        return 2;
      }
      throw e;
    }

    // 5. Run the review (progress events → stderr)
    const outcome = await doReview({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? REVIEW_STRATEGY,
      task: `Review the local ${opts.mode} diff (${diff.files.length} changed files).`,
      sessionId: `cli:${basename(opts.targetDir)}:${opts.mode}`,
      onEvent: (e) => deps.stderr(`[${e.kind}] ${e.msg}`),
    });

    // 6. Format and emit output
    const ciFailOn = (agent.ciFailOn ?? 'critical') as CiFailOn;
    const { output, exitCode } = formatReviewOutput(outcome, ciFailOn, {
      mode: opts.mode,
      agentName: agent.name,
      agentProvider: agent.provider,
      agentModel: agent.model,
      filesCount: diff.files.length,
    });

    deps.stdout(output);
    return exitCode;
  } catch (e: unknown) {
    // Top-level ConfigError catch (e.g. from getCurrentWorkspace or listAgents)
    if (e instanceof ConfigError) {
      deps.stderr(`Error: ${(e as ConfigError).message}`);
      return 2;
    }
    throw e;
  }
}
