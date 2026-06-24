# Enforcement — making the dependency rule fail the build

TypeScript compiles forbidden cross-layer imports happily, so the rule is
enforced statically by **`dependency-cruiser`** (already a `server` dependency).
The config lives at `server/.dependency-cruiser.cjs`; run it with
`pnpm arch:check`.

## What it forbids

Each rule below maps 1:1 to a row in [layers.md](layers.md):

| Rule | Meaning |
|---|---|
| `no-routes-to-db` | `routes.ts` must not import `db/*` — go through the service/repository. |
| `no-routes-to-adapters` | `routes.ts` must not import `adapters/*` directly. |
| `no-service-to-adapters` | `service.ts` must not import a concrete `adapters/*` — resolve the port from the container. |
| `no-repo-to-fastify` | `repository.ts` must not import Fastify — it is pure data access. |
| `no-cross-module` | A module folder must not import another module's internals; share via `container.*` or `_shared/`. |
| `reviewer-core-purity` | `reviewer-core` must not import Fastify, Drizzle, `postgres`, or `fs`. |
| `no-circular` | No dependency cycles between any files. |

The composition root (`platform/container.ts`) is intentionally **exempt** — it
is the one place allowed to import concrete adapters and module repositories.

## The config

`server/.dependency-cruiser.cjs` (paths are relative to `server/`, so module
sources are matched as `^src/...`):

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cyclic dependency — break the cycle (usually a misplaced import).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-routes-to-db',
      severity: 'error',
      comment: 'Presentation must not touch the DB. Call the service/repository.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/db/' },
    },
    {
      name: 'no-routes-to-adapters',
      severity: 'error',
      comment: 'Presentation must not import adapters directly. Use the service.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-service-to-adapters',
      severity: 'error',
      comment: 'Services depend on PORTS (resolved via the container), not concrete adapters.',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-repo-to-fastify',
      severity: 'error',
      comment: 'Repositories are pure data access — no web framework.',
      from: { path: '^src/modules/[^/]+/repository(\\.ts$|/)' },
      to: { path: 'node_modules/fastify' },
    },
    {
      name: 'no-cross-module',
      severity: 'error',
      comment: 'A module must not reach into another module. Share via container.* or _shared/.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: '^src/modules/(\\1|_shared)/',
      },
    },
    {
      name: 'reviewer-core-purity',
      severity: 'error',
      comment: 'The domain core stays pure: no Fastify / Drizzle / postgres / fs.',
      from: { path: 'reviewer-core/src/' },
      to: { path: 'node_modules/(fastify|drizzle-orm|postgres)|^node:fs|^fs$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      // Resolve the @devdigest/* path aliases from tsconfig so cross-package
      // imports (e.g. reviewer-core, shared) are analysed, not skipped.
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
```

## The script

In `server/package.json`:

```json
"scripts": {
  "arch:check": "depcruise src --config .dependency-cruiser.cjs"
}
```

Run it: `pnpm arch:check`. Non-zero exit = a layering violation; the message
names the rule and the offending edge.

## Extending the rules

- Adding a layer or folder? Add a matching `forbidden` rule here **and** a row in
  [layers.md](layers.md) — keep the doc and the linter in lockstep.
- Need a one-off, reviewed exception? Prefer narrowing the rule's `pathNot` over
  scattering `dependency-cruiser-disable` comments.
- A visual graph helps when a violation is non-obvious:
  `depcruise src --config .dependency-cruiser.cjs --output-type dot | dot -T svg > arch.svg`.

## CI (documented follow-up)

`arch:check` is currently a local gate. To make it block PRs, add it to the CI
matrix per `TESTING.md` (run it in the `server` job alongside `typecheck`). Left
out of this skill's initial scope to avoid touching CI without sign-off.
