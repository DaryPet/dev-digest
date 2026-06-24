# Layers — responsibilities and the allowed-import matrix

Each layer has ONE job and a fixed set of things it may import. The list below
is the source of truth that `server/.dependency-cruiser.cjs` enforces.

## Domain core — `reviewer-core/`

Pure review logic: `diff → prompt → LLM → grounded findings`. The only side
effect is an LLM call through an **injected** `LLMProvider` port.

- **May import:** TypeScript stdlib, `@devdigest/shared` *types*.
- **Must NOT import:** Fastify, Drizzle, `postgres`, `fs`, `octokit`,
  `simple-git`, or anything under `server/src`.
- New side effect? It goes behind an injected port, never inline. (`reviewer-core`
  emits no JS — `build` is just a type-check.)

## Ports / contracts — `@devdigest/shared` (`server/src/vendor/shared`)

The abstractions every inner layer codes against: `LLMProvider`, `GitHubClient`,
`GitClient`, `AuthProvider`, `SecretsProvider`, `Embedder`, `CodeIndex`, plus the
Zod contracts (`Review`, `Finding`, `RunTrace`, …).

- **May import:** Zod, TypeScript.
- **Must NOT import:** any concrete adapter, the DB, Fastify, a module.
- The barrel (`index.ts`) is **stable**: extend with new files, do not rewrite
  existing exports. It is vendored — do not hand-edit without coordination.

## Application service — `modules/<name>/service.ts`

Orchestrates a use case: validates intent, calls the repository and the ports it
needs, applies domain rules, returns DTOs. It is the public method surface of the
module.

- **May import:** its own `repository.ts`, `helpers.ts`, `platform/*` *types*
  (`Container`, `AppError`/`NotFoundError`, the run bus), `@devdigest/shared`,
  `@devdigest/reviewer-core`.
- **Must NOT import:** `adapters/*` concretely (resolve via the container),
  another module's folder (use `container.agentsRepo` etc.), Fastify
  `request`/`reply` (HTTP is the route's job).
- Depends on the `Container` **interfaces**, so tests swap implementations via
  `ContainerOverrides`.

## Data access — `modules/<name>/repository.ts`

The ONLY file in the module that touches the database. Owns its aggregate's
tables and enforces workspace scoping on every query.

- **May import:** `db/*` (the Drizzle client + schema + row types),
  `@devdigest/shared` types.
- **Must NOT import:** Fastify, `adapters/*`, another module's repository.
- Large query sets may be split under `repository/<aggregate>.repo.js` and
  composed by the class — the public API stays identical (see the reviews
  module). Drizzle usage itself → `drizzle-orm-patterns`.

## External adapters — `adapters/<x>/`

Concrete implementations of a port: `adapters/github/octokit.ts`,
`adapters/git/simple-git.ts`, `adapters/llm/{openai,anthropic}.ts`,
`adapters/codeindex/ripgrep.ts`, …

- **May import:** its third-party SDK, and the port interface it implements.
- **Must NOT import:** `modules/*`, and (unless it is itself a DB adapter)
  `db/*`. An adapter knows its SDK and its port — nothing about the app.

## Presentation — `modules/<name>/routes.ts`

A Fastify plugin. Parses/validates HTTP input (Zod via `ZodTypeProvider`),
resolves context, calls the service, shapes the HTTP response. Thin — no
business logic, no DB.

- **May import:** its `service.ts`, `_shared/*` (`getContext`, shared schemas),
  `platform/errors`, `@devdigest/shared`.
- **Must NOT import:** `db/*`, `adapters/*` directly, another module's `service`.
- Registered in `modules/index.ts` (static registry). Route/plugin mechanics →
  `fastify-best-practices`.

## Composition root — `platform/container.ts`

The ONE place allowed to import concrete adapters and wire them to ports. Holds
config, db, the job runner, the SSE bus; lazily constructs adapters resolved
through `SecretsProvider`; exposes shared repositories.

- **May import:** everything — that is its job.
- Every adapter has a `ContainerOverrides` field so tests inject a mock; services
  receive the `Container` and read interfaces off it.

## `platform/*` (cross-cutting, not a layer)

`errors`, `config`, `sse`, `grounding`, `prompt`, `resilience`, `price-book`, …
— framework-agnostic cross-cutting helpers usable from services and routes. Keep
them free of module-specific logic; they are leaf utilities, not orchestration.

## Quick "where does it go?" table

| You are adding… | It goes in |
|---|---|
| An HTTP endpoint | `routes.ts` |
| A use-case / business step | `service.ts` |
| A SQL/Drizzle query | `repository.ts` |
| Row→DTO mapping, pure transform | `helpers.ts` |
| A call to an external API/tool | new **port** in `@devdigest/shared` + **adapter** in `adapters/` |
| A cross-cutting helper (errors, config) | `platform/*` |
| A type used across packages | `@devdigest/shared` contract |
| A type used only in this module | `types.ts` |
| Wiring an adapter to the app | `platform/container.ts` |
