---
name: onion-architecture
description: "Forces the DevDigest backend Onion layering for new server modules: presentation (routes) → application (service) → domain → infrastructure (repository/adapters), with dependencies pointing inward only. Use when creating a new module under server/src/modules, deciding which layer a file/type/dependency belongs to, adding a new external integration (port + adapter), wiring the container, or reviewing a backend change for layering violations. Maps Fastify, Drizzle, Zod and the @devdigest/shared ports onto Onion layers and enforces the dependency rule with dependency-cruiser. Trigger terms: new module, onion architecture, layering, ports and adapters, repository, service, adapter, container, dependency rule, where does this go."
metadata:
  tags: onion-architecture, clean-architecture, hexagonal, ports-and-adapters, backend, layering, dependency-rule, fastify, drizzle, dependency-cruiser
---

# Onion Architecture (DevDigest backend)

The "which layer does this belong in, and which way may it import" layer for
`server/`. DevDigest's backend already follows Onion / ports-and-adapters — this
skill names that mapping, makes it the **mandatory template for new modules**,
and points at the tool that enforces it (`dependency-cruiser`).

This skill deliberately stays out of framework-implementation detail:
- Fastify routes, plugins, JSON-schema, hooks → `fastify-best-practices`
- Drizzle schema, queries, transactions, migrations → `drizzle-orm-patterns`
- Postgres table/index design → `postgresql-table-design`
- Zod schema authoring → `zod`

When a question is about *how* to write code in one of those tools, defer to that
skill. This skill only decides **where that code lives and what it may depend on.**

## The one rule (memorize this)

> **Dependencies point inward only.** An inner layer must never import from an
> outer layer. Inner layers depend on **abstractions** (the `@devdigest/shared`
> ports); outer layers implement them. The only place that names concrete outer
> classes is the composition root (`platform/container.ts`).

Everything else in this skill is a consequence of that rule.

## Layer map (the canonical DevDigest mapping)

From innermost (knows nothing) to outermost (knows everything):

| Onion layer | Lives in | May import | Must NOT import |
|---|---|---|---|
| **Domain core** | `reviewer-core/` | only TS + `@devdigest/shared` types | Fastify, Drizzle, `postgres`, `fs`, anything in `server/src` |
| **Ports / contracts** | `@devdigest/shared` (`server/src/vendor/shared`) | only Zod + TS | any concrete adapter, DB, Fastify |
| **Application service** | `modules/<name>/service.ts` | repository, `platform/*` types, `@devdigest/shared`, `reviewer-core` | `adapters/*` concretely, another module's folder, Fastify `reply` |
| **Data access (infra)** | `modules/<name>/repository.ts` | `db/*`, `@devdigest/shared` | Fastify, `adapters/*`, another module's repo |
| **External adapters (infra)** | `adapters/<x>/` | its SDK + the port it implements | `modules/*`, `db/*` (unless it IS a db adapter) |
| **Presentation** | `modules/<name>/routes.ts` | service, `_shared/*`, `platform/errors` | `db/*`, `adapters/*` directly |
| **Composition root** | `platform/container.ts` | EVERYTHING (this is where wiring is allowed) | — |

Full per-layer responsibilities and the allowed-import matrix: see
[rules/layers.md](rules/layers.md). The why behind the inward rule and how it
maps to Clean/Hexagonal: [rules/dependency-rule.md](rules/dependency-rule.md).

## Anatomy of a module (the forced template)

Every feature module is a folder under `server/src/modules/<name>/` with this
fixed file set. Do not invent new layer names; do not collapse layers.

```
modules/<name>/
  routes.ts       # PRESENTATION — Fastify plugin; HTTP in/out; calls the service.
  service.ts      # APPLICATION  — use-case orchestration; depends on Container interfaces.
  repository.ts   # DATA ACCESS  — the ONLY file in the module that touches the DB.
  helpers.ts      # pure mappers (row → DTO) and small pure helpers. No I/O.
  constants.ts    # module-local constants.
  types.ts        # module-local types (cross-package types live in @devdigest/shared).
```

Not every module needs every file (a read-only module may have no
`repository.ts`), but when a responsibility exists it goes in the file named for
it — never in another layer. Copy-paste skeletons:
[rules/module-template.md](rules/module-template.md).

## Add-a-module checklist

1. Create `modules/<name>/` with the files above (start from
   [rules/module-template.md](rules/module-template.md)).
2. `routes.ts` exports a **default Fastify plugin**; HTTP validation uses Zod
   via `withTypeProvider<ZodTypeProvider>()` (see `fastify-best-practices`).
3. Resolve tenancy with `getContext(container, req)` from `_shared/context.ts` —
   never read workspace/user ad hoc. Repositories take `workspaceId` and scope
   every query by it.
4. The service depends on `Container` (interfaces), not on concrete adapters.
   Need an adapter? Resolve it from the container (`container.github()`,
   `container.llm(id)`, …). Never `new SomeAdapter()` inside a service.
5. Register the module: add one import + one entry in
   `server/src/modules/index.ts` (static registry — no filesystem autoload).
6. Shared cross-module repos (agents, reviews/pulls) are reached via the
   container (`container.agentsRepo`), never by importing another module's
   `repository.ts`.
7. Run the architecture check: `pnpm arch:check` (see
   [rules/enforcement.md](rules/enforcement.md)). Fix any violation before PR.

## Add-an-external-dependency checklist (port + adapter)

New side effect (an API, a CLI tool, a clock, a queue)? It goes behind a port —
never inline in a service.

1. Define the **port** (an interface) in `@devdigest/shared`
   (`server/src/vendor/shared/adapters.ts` or a new contract file).
2. Implement the **adapter** under `server/src/adapters/<x>/<impl>.ts`. It
   imports its SDK and the port; nothing else from the app reaches into it.
3. Wire it in `platform/container.ts`: a lazily-constructed getter, with a
   matching `ContainerOverrides` field so tests inject a mock.
4. Services/routes consume it through the container interface only.

Worked example and the rationale: [rules/ports-and-adapters.md](rules/ports-and-adapters.md).

## Enforcement (this is the "forcing" part)

TypeScript will happily compile a forbidden cross-layer import. So the rule is
enforced by **`dependency-cruiser`** (already a server dependency):

- Config: `server/.dependency-cruiser.cjs` — `forbidden` rules tailored to these
  folders (routes↛db, service↛adapters, no cross-module reach, reviewer-core
  purity, no cycles).
- Run locally / in CI: `pnpm arch:check`.

Rules reference and how to extend them: [rules/enforcement.md](rules/enforcement.md).
*(CI-matrix wiring of `arch:check` is a documented follow-up — see `TESTING.md`.)*

## Recommended reading order

- **New module?** `rules/module-template.md` → `rules/layers.md`
- **Adding an integration?** `rules/ports-and-adapters.md`
- **Why these rules / reviewing a violation?** `rules/dependency-rule.md` → `rules/enforcement.md`
