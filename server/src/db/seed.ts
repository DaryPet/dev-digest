import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,


  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  PR_QUALITY_RUBRIC,
  NO_THEN_CHAINS,
  SECRET_LEAKAGE_GATE,
  LETHAL_TRIFECTA,
  TEST_COVERAGE_NUDGE,
  UNCOVERED_BRANCHES,
  EDGE_CASE_COVERAGE,
  MOCK_OVERUSE_GATE,
  PHANTOM_API_GATE_MARKDOWN,
} from './seed-skills.js';
import { parseSkillImport } from '../modules/skills/import.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (starter presets + L-skills demo agents) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks test coverage: uncovered branches, missed corner cases, over-mocking, flaky-test smells.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Catches breaking changes to route signatures and shared contracts before they ship.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  const agentIdByName = new Map<string, string>();
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (existing) {
      agentIdByName.set(a.name, existing.id);
    } else {
      const [inserted] = await db.insert(t.agents).values(a).returning();
      agentIdByName.set(a.name, inserted!.id);
    }
  }

  // ---- skills (Skills Lab demo catalog) ----
  // `phantom-api-gate` is run through the REAL import parser
  // (server/src/modules/skills/import.ts) on a markdown fixture with
  // frontmatter — not hand-typed with source: 'extracted' — so the actual
  // import code path the UI's "Import from file" flow uses is exercised, per
  // the course TЗ's "принаймні один заводимо через імпорт".
  const phantomApiImport = parseSkillImport(
    'phantom-api-gate.md',
    Buffer.from(PHANTOM_API_GATE_MARKDOWN, 'utf8'),
  );

  const seedSkills: Array<{
    name: string;
    description: string;
    type: 'rubric' | 'convention' | 'security' | 'custom';
    source: 'manual' | 'imported_url' | 'extracted' | 'community';
    body: string;
  }> = [
    {
      name: 'pr-quality-rubric',
      description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
      type: 'rubric',
      source: 'manual',
      body: PR_QUALITY_RUBRIC,
    },
    {
      name: 'no-then-chains',
      description: 'Flag .then()/.catch() chains; prefer async/await for readability and error handling.',
      type: 'convention',
      source: 'manual',
      body: NO_THEN_CHAINS,
    },
    {
      name: 'secret-leakage-gate',
      description: 'Detects sk_live, service_role, and NEXT_PUBLIC_ keys committed in plaintext.',
      type: 'security',
      source: 'community',
      body: SECRET_LEAKAGE_GATE,
    },
    {
      name: 'lethal-trifecta',
      description: 'Flags PRs combining private data access, untrusted input, and an exfiltration path.',
      type: 'security',
      source: 'community',
      body: LETHAL_TRIFECTA,
    },
    {
      name: phantomApiImport.draft.name,
      description: phantomApiImport.draft.description,
      type: phantomApiImport.draft.type,
      source: phantomApiImport.draft.source,
      body: phantomApiImport.draft.body,
    },
    {
      name: 'test-coverage-nudge',
      description: 'Nudge reviewers to flag changed code without tests for its failure and branch paths.',
      type: 'rubric',
      source: 'manual',
      body: TEST_COVERAGE_NUDGE,
    },
    {
      name: 'uncovered-branches',
      description: 'Flag conditional branches with no corresponding test exercising the non-default path.',
      type: 'rubric',
      source: 'manual',
      body: UNCOVERED_BRANCHES,
    },
    {
      name: 'edge-case-coverage',
      description: 'Check for missing edge-case tests: empty, null, boundary, and large inputs.',
      type: 'rubric',
      source: 'manual',
      body: EDGE_CASE_COVERAGE,
    },
    {
      name: 'mock-overuse-gate',
      description: 'Detect excessive mocking that makes tests pass regardless of real behavior.',
      type: 'custom',
      source: 'manual',
      body: MOCK_OVERUSE_GATE,
    },
  ];

  // Which skills each agent links, in prompt-block order.
  const agentSkillMap: Record<string, string[]> = {
    'General Reviewer': ['pr-quality-rubric', 'no-then-chains'],
    'Security Reviewer': ['secret-leakage-gate', 'lethal-trifecta'],
    'API Contract Reviewer': ['phantom-api-gate'],
    'Test Quality Reviewer': [
      'test-coverage-nudge',
      'uncovered-branches',
      'edge-case-coverage',
      'mock-overuse-gate',
    ],
  };

  const skillIdByName = new Map<string, string>();
  for (const sk of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (existing) {
      skillIdByName.set(sk.name, existing.id);
    } else {
      const [inserted] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: sk.name,
          description: sk.description,
          type: sk.type,
          source: sk.source,
          body: sk.body,
          enabled: true,
          version: 1,
        })
        .returning();
      skillIdByName.set(sk.name, inserted!.id);
      await db
        .insert(t.skillVersions)
        .values({ skillId: inserted!.id, version: 1, body: sk.body })
        .onConflictDoNothing();
    }
  }

  for (const [agentName, skillNames] of Object.entries(agentSkillMap)) {
    const agentId = agentIdByName.get(agentName);
    if (!agentId) continue;
    for (let order = 0; order < skillNames.length; order++) {
      const skillId = skillIdByName.get(skillNames[order]!);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order })
        .onConflictDoNothing();
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
