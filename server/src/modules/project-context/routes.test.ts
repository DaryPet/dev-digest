import { describe, it, expect } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';

/**
 * No-DB route smoke tests via app.inject() (same technique as
 * `test/routes-smoke.test.ts`) — request validation happens before the DB is
 * ever touched, so these run without Docker.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('project-context routes (no DB, validation only)', () => {
  it('GET /repos/:id/context — rejects a non-uuid repo id (422)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/context' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /repos/:id/context — rejects a non-uuid agent_id query param (422)', async () => {
    const app = await buildApp({ config });
    const id = '11111111-1111-1111-1111-111111111111';
    const res = await app.inject({ method: 'GET', url: `/repos/${id}/context?agent_id=not-a-uuid` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET /repos/:id/context/preview — requires a `path` query param (422)', async () => {
    const app = await buildApp({ config });
    const id = '11111111-1111-1111-1111-111111111111';
    const res = await app.inject({ method: 'GET', url: `/repos/${id}/context/preview` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
