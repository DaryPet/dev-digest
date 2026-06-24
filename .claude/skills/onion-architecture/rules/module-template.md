# Module template — copy-paste skeletons

Start a new module by copying these into `server/src/modules/<name>/`. Replace
`<name>` / `Thing` and delete files you genuinely don't need (a read-only module
may omit `repository.ts`; a module with no DTO mapping may omit `helpers.ts`).
Keep the file→layer mapping intact — never move a responsibility across files.

Framework specifics are out of scope here: route/plugin/Zod details →
`fastify-best-practices`; query details → `drizzle-orm-patterns`.

## `routes.ts` — presentation

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ThingService } from './service.js';

/**
 * <name> module.
 *   GET  /things        → list things for the workspace
 *   POST /things        → create a thing
 */
export default async function thingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ThingService(container);

  app.get('/things', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post('/things', { schema: { body: CreateThing } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.create(workspaceId, req.body);
  });
}
```

No DB, no adapters, no business rules here — parse, contextualize, delegate,
respond.

## `service.ts` — application

```ts
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ThingRepository } from './repository.js';
import { thingToDto, type ThingDto } from './helpers.js';

/** Thing use cases. Orchestrates the repository + ports; returns DTOs. */
export class ThingService {
  private repo: ThingRepository;

  constructor(private container: Container) {
    this.repo = new ThingRepository(container.db);
  }

  async list(workspaceId: string): Promise<ThingDto[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(thingToDto);
  }

  async create(workspaceId: string, input: CreateThingInput): Promise<ThingDto> {
    const row = await this.repo.insert(workspaceId, input);
    // Need an external effect? Resolve a PORT from the container — never `new`:
    //   const gh = await this.container.github();
    return thingToDto(row);
  }
}
```

Depends on `Container` interfaces. Resolve adapters via `container.*`; never
`new SomeAdapter()`, never an `adapters/*` import.

## `repository.ts` — data access (the only DB file)

```ts
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export type ThingRow = typeof t.things.$inferSelect;

/** The ONLY layer touching the DB for the <name> domain. Workspace-scoped. */
export class ThingRepository {
  constructor(private db: Db) {}

  list(workspaceId: string): Promise<ThingRow[]> {
    return this.db.select().from(t.things)
      .where(eq(t.things.workspaceId, workspaceId))
      .orderBy(desc(t.things.createdAt));
  }

  async insert(workspaceId: string, input: CreateThingInput): Promise<ThingRow> {
    const [row] = await this.db.insert(t.things)
      .values({ ...input, workspaceId }).returning();
    return row;
  }
}
```

Every query scoped by `workspaceId`. No Fastify, no adapters.

## `helpers.ts` — pure mappers

```ts
import type { ThingRow } from './repository.js';

export interface ThingDto { id: string; name: string; createdAt: string; }

/** Row → API DTO. Pure: no I/O, no DB, no container. */
export function thingToDto(row: ThingRow): ThingDto {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}
```

## `constants.ts` / `types.ts`

```ts
// constants.ts — module-local constants only.
export const MAX_THINGS_PER_PAGE = 50;
```

```ts
// types.ts — types used ONLY in this module.
// Types shared across modules/packages go in @devdigest/shared, not here.
export interface CreateThingInput { name: string; }
```

## Final step — register the module

```ts
// server/src/modules/index.ts
import things from './things/routes.js';

export const modules: Record<string, FastifyPluginAsync> = {
  // …existing…
  things,
};
```

Then run `pnpm arch:check` to confirm no layer was crossed.
