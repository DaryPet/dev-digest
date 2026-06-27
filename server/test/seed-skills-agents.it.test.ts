import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[seed-skills-agents] Docker not available — skipping integration tests.');
}

/**
 * Proves the TЗ requirement end-to-end against a REAL Postgres (not just
 * typecheck): seeding creates the full Skills Lab demo catalog (9 skills),
 * Test Quality Reviewer + API Contract Reviewer, with skills linked via
 * agent_skills in order, and `phantom-api-gate` is the product of the REAL
 * import parser (source: 'extracted'), exercising the actual import code path.
 */
d('seed — Skills Lab demo catalog + agents', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const linkedSkillNames = async (agentName: string): Promise<string[]> => {
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, agentName));
    const links = await pg.handle.db
      .select({ name: t.skills.name, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agent!.id))
      .orderBy(t.agentSkills.order);
    return links.map((l) => l.name);
  };

  it('seeds the full 9-skill catalog', async () => {
    const rows = await pg.handle.db.select().from(t.skills);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(
      [
        'edge-case-coverage',
        'lethal-trifecta',
        'mock-overuse-gate',
        'no-then-chains',
        'phantom-api-gate',
        'pr-quality-rubric',
        'secret-leakage-gate',
        'test-coverage-nudge',
        'uncovered-branches',
      ].sort(),
    );
  });

  it('creates both new agents, enabled', async () => {
    const [tq] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Test Quality Reviewer'));
    expect(tq?.enabled).toBe(true);
    expect(tq?.systemPrompt).toContain('Uncovered branches');

    const [api] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'API Contract Reviewer'));
    expect(api?.enabled).toBe(true);
  });

  it('links each agent to its skills in order', async () => {
    expect(await linkedSkillNames('Test Quality Reviewer')).toEqual([
      'test-coverage-nudge',
      'uncovered-branches',
      'edge-case-coverage',
      'mock-overuse-gate',
    ]);
    expect(await linkedSkillNames('API Contract Reviewer')).toEqual(['phantom-api-gate']);
    expect(await linkedSkillNames('Security Reviewer')).toEqual([
      'secret-leakage-gate',
      'lethal-trifecta',
    ]);
    expect(await linkedSkillNames('General Reviewer')).toEqual([
      'pr-quality-rubric',
      'no-then-chains',
    ]);
  });

  it('phantom-api-gate is sourced via the real import parser', async () => {
    const [skill] = await pg.handle.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.name, 'phantom-api-gate'));
    // Must be the literal output of parseSkillImport (same parser POST
    // /skills/import uses), not a hand-typed body.
    expect(skill?.source).toBe('extracted');
    expect(skill?.type).toBe('security');
    expect(skill?.body).toContain('Phantom API Gate');
    expect(skill?.body).toContain('What NOT to flag');
  });

  it('every skill body is a premium rubric (substantial + structured)', async () => {
    const rows = await pg.handle.db.select().from(t.skills);
    for (const r of rows) {
      // Premium = a complete rubric, not a 3-line stub.
      expect(r.body.length, `${r.name} body too short`).toBeGreaterThan(900);
      // Every body carries the false-positive guardrail section that makes a
      // skill precise instead of noisy.
      expect(r.body, `${r.name} missing 'What NOT to flag'`).toContain('What NOT to flag');
    }
    // Spot-check the stack-/pattern-specific signals are present.
    const byName = new Map(rows.map((r) => [r.name, r.body]));
    expect(byName.get('secret-leakage-gate')).toContain('sk_live');
    expect(byName.get('lethal-trifecta')).toContain('exfiltration');
    expect(byName.get('mock-overuse-gate')).toContain('I/O boundaries');
    expect(byName.get('phantom-api-gate')).toContain('@devdigest/shared');
  });

  it('is idempotent — re-running seed does not duplicate skills/links', async () => {
    await seed(pg.handle.db); // second run

    const skillRows = await pg.handle.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.name, 'phantom-api-gate'));
    expect(skillRows).toHaveLength(1);

    const [api] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'API Contract Reviewer'));
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, api!.id), eq(t.agentSkills.skillId, skillRows[0]!.id)));
    expect(links).toHaveLength(1);
  });
});
