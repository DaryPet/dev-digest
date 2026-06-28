import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions Extractor over a real Postgres. The model + git + repo-intel are
 * mocked (hermetic, key-free). Covers the feature's core guarantee: CODE
 * verification drops unverifiable candidates, re-scan does not resurrect a
 * rejected rule, and skill-preview builds a body from accepted candidates only.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let repoId: string;

  // 5-line source file the valid candidate cites.
  const USERS_TS = [
    'export async function getUser(id) {',
    '  const user = await db.users.find(id);',
    '  const posts = await db.posts.findMany({ userId });',
    '  return { user, posts };',
    '}',
  ].join('\n');

  const RULE_ASYNC = 'Always use async/await instead of .then() chains';

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions);
  });

  /** A repo-intel facade that only answers getConventionSamples (all the
      service touches); the rest is never called in these flows. */
  const repoIntel = {
    getConventionSamples: async () => ['src/api/users.ts'],
  } as unknown as RepoIntel;

  function makeApp(structured: unknown) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/api/users.ts': USERS_TS } }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
        repoIntel,
      },
    });
  }

  const candidate = (rule: string, file: string, line: number, confidence = 0.9) => ({
    category: 'style',
    rule,
    evidence: { file, line },
    confidence,
  });

  it('extract verifies evidence in code — drops out-of-range and missing-file candidates', async () => {
    const app = await makeApp({
      candidates: [
        candidate(RULE_ASYNC, 'src/api/users.ts', 2, 0.91), // real line → survives
        candidate('Out of range', 'src/api/users.ts', 999), // line out of range → dropped
        candidate('Ghost file', 'src/ghost.ts', 50), // file absent → dropped
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.items).toHaveLength(1);
    const only = body.items[0];
    expect(only.rule).toBe(RULE_ASYNC);
    expect(only.status).toBe('pending');
    expect(only.evidence_path).toMatch(/^src\/api\/users\.ts:\d/);
    expect(only.evidence_snippet).toContain('await db.users.find(id)');
    expect(body.meta.sampleCount).toBe(1); // one file actually read
    await app.close();
  });

  it('patch accepts/rejects and edits the rule wording', async () => {
    const app = await makeApp({ candidates: [candidate(RULE_ASYNC, 'src/api/users.ts', 2)] });
    const id = (
      await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json().items[0].id;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${id}`,
      payload: { rule: 'Prefer async/await over .then()' },
    });
    expect(edited.json().rule).toBe('Prefer async/await over .then()');

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.json().status).toBe('accepted');

    const missing = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { status: 'rejected' },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('re-scan does not resurrect a rejected rule as pending', async () => {
    // First scan → reject the survivor.
    const app1 = await makeApp({ candidates: [candidate(RULE_ASYNC, 'src/api/users.ts', 2)] });
    const id = (
      await app1.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json().items[0].id;
    await app1.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${id}`,
      payload: { status: 'rejected' },
    });
    await app1.close();

    // Second scan re-proposes the same rule → must be deduped, not re-added.
    const app2 = await makeApp({ candidates: [candidate(RULE_ASYNC, 'src/api/users.ts', 2)] });
    const list = (
      await app2.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json();

    const sameRule = list.items.filter((c: { rule: string }) => c.rule === RULE_ASYNC);
    expect(sameRule).toHaveLength(1);
    expect(sameRule[0].status).toBe('rejected'); // still rejected, no new pending dup
    await app2.close();
  });

  it('skill-preview builds a body from accepted candidates only', async () => {
    const app = await makeApp({ candidates: [candidate(RULE_ASYNC, 'src/api/users.ts', 2)] });
    const id = (
      await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json().items[0].id;

    // not yet accepted → preview rejects it
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-preview`,
      payload: { candidateIds: [id] },
    });
    expect(tooEarly.statusCode).toBe(422);

    await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${id}`,
      payload: { status: 'accepted' },
    });

    const preview = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-preview`,
      payload: { candidateIds: [id], name: 'payments-api-conventions' },
    });
    expect(preview.statusCode).toBe(200);
    const p = preview.json();
    expect(p.name).toBe('payments-api-conventions');
    expect(p.body).toContain('# payments-api-conventions');
    expect(p.body).toContain(RULE_ASYNC);
    expect(p.body).toContain('Detected in `src/api/users.ts:');
    expect(p.evidence_files).toContain('src/api/users.ts');
    await app.close();
  });
});
