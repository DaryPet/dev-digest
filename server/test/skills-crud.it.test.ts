import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-crud] Docker not available — skipping integration tests.');
}

/**
 * A1 — skills module CRUD + versioning + import preview, over a real Postgres.
 * Covers: create (201), list, get, body-edit bumps version (+ skill_versions),
 * metadata-only edit does NOT, enabled toggle, delete + 404s, and the pure
 * import-preview path (markdown + zip, executables ignored, no persistence).
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'No then chains',
    description: 'Forbid .then() chains; prefer async/await.',
    type: 'convention' as const,
    body: '# Rule\nNever use .then() chaining.',
  };

  it('creates a skill (201) at version 1, then lists and fetches it', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.source).toBe('manual'); // default when not given
    expect(skill.enabled).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const one = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().name).toBe('No then chains');
    await app.close();
  });

  it('bumps version + records a snapshot only when body changes', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id;

    // metadata-only edit → no version bump
    const meta = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { description: 'updated copy' },
    });
    expect(meta.json().version).toBe(1);

    // body edit → version 2
    const bodyEdit = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule v2\nstricter' },
    });
    expect(bodyEdit.json().version).toBe(2);

    const versions = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().map((v: { version: number }) => v.version)).toEqual([2, 1]);
    await app.close();
  });

  it('toggles enabled without versioning, deletes, then 404s', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id;

    const off = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(off.json().enabled).toBe(false);
    expect(off.json().version).toBe(1);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({ method: 'GET', url: `/skills/${id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.code).toBe('not_found');
    await app.close();
  });

  it('GET /skills/:id/agents lists agents linking the skill (and 404s for unknown skill)', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id;

    const noAgents = await app.inject({ method: 'GET', url: `/skills/${id}/agents` });
    expect(noAgents.statusCode).toBe(200);
    expect(noAgents.json()).toEqual([]);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Uses Skill', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [id] } });

    const withAgent = await app.inject({ method: 'GET', url: `/skills/${id}/agents` });
    expect(withAgent.statusCode).toBe(200);
    expect(withAgent.json()).toEqual([{ id: agent.id, name: 'Uses Skill', enabled: true }]);

    const notFound = await app.inject({ method: 'GET', url: '/skills/00000000-0000-0000-0000-000000000000/agents' });
    expect(notFound.statusCode).toBe(404);
    await app.close();
  });

  it('import preview parses markdown without persisting', async () => {
    const app = await makeApp();
    const md = '---\nname: Secret Gate\ntype: security\n---\n# Body\nno sk_live keys';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'secret.md', content_base64: Buffer.from(md).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().draft.name).toBe('Secret Gate');
    expect(res.json().draft.type).toBe('security');
    expect(res.json().draft.source).toBe('extracted');

    // preview did NOT write — no skill with that name exists yet
    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().some((s: { name: string }) => s.name === 'Secret Gate')).toBe(false);
    await app.close();
  });

  it('import preview extracts a zip core and ignores executable entries', async () => {
    const app = await makeApp();
    const zip = makeZip([
      { name: 'SKILL.md', method: 8, content: '---\nname: Zip Skill\ntype: rubric\n---\n# B\nbranches' },
      { name: 'hack.sh', content: 'rm -rf /' },
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'bundle.zip', content_base64: zip.toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().draft.name).toBe('Zip Skill');
    expect(res.json().ignored_files).toEqual(['hack.sh']);
    await app.close();
  });
});

// ---- minimal ZIP builder (stored + raw-deflate), CRC left zero -------------
function makeZip(inputs: Array<{ name: string; content: string; method?: 0 | 8 }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, content, method = 0 } of inputs) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localChunk = Buffer.concat([local, nameBuf, data]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    locals.push(localChunk);
    offset += localChunk.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(inputs.length, 8);
  eocd.writeUInt16LE(inputs.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}
