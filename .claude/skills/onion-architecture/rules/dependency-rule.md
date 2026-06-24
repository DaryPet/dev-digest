# The dependency rule (and how Onion relates to Clean / Hexagonal)

## The rule

> Source-code dependencies point **inward only**. Inner layers know nothing about
> outer layers.

Concretely, in DevDigest:

- The domain core (`reviewer-core`) and ports (`@devdigest/shared`) have **zero**
  knowledge of Fastify, Drizzle, the DB, or any adapter.
- A service knows the *interface* `LLMProvider`; it does not know
  `AnthropicProvider`.
- A route knows the service; it does not know the DB.
- Only `platform/container.ts` knows everything and wires concretes to ports.

If an inner layer needs something from the outside, it declares an **interface**
(a port) and the outer layer **implements** it. This is the Dependency Inversion
Principle: both sides depend on the abstraction, and the abstraction lives inside.

## Why TypeScript needs a tool for this

Unlike .NET project references, nothing in TypeScript stops a developer writing
`import { db } from '../../db/client.js'` inside a route — it compiles and runs.
So the architecture is unenforceable by the compiler alone. We enforce it
statically with `dependency-cruiser` (`forbidden` rules) — see
[enforcement.md](enforcement.md). The rule lives in code, not in tribal memory.

## Why it pays off here

- **Testability** — inner layers depend on abstractions, so tests inject mock
  adapters via `ContainerOverrides` and never touch a real DB/LLM/GitHub.
- **Swappable infrastructure** — swapping `octokit` for another GitHub client, or
  OpenAI for Anthropic, touches one adapter + the container, nothing else. The
  course adds features (skills, memory, smart-diff…) as new modules without
  touching existing ones or the shared schema.
- **Stable core** — review logic (`reviewer-core`) is reused by both the server
  and the CI runner precisely because it imports no infrastructure.

## Naming: Onion vs Clean vs Hexagonal

These are the same idea with different vocabularies; don't introduce a fourth.

- **Hexagonal (Ports & Adapters)** — emphasizes ports (interfaces) and adapters
  (implementations) around a core. DevDigest's `@devdigest/shared` ports +
  `adapters/` are exactly this.
- **Clean Architecture** — emphasizes the inward dependency rule across concentric
  layers (entities → use cases → interface adapters → frameworks).
- **Onion** — takes the DDD layers (domain model, domain/application services) and
  drops them inside the ports-and-adapters ring; dependencies point to the centre.

DevDigest is best described as **ports-and-adapters wearing Onion's layer names**:
`reviewer-core` = domain, `service.ts` = application service, `@devdigest/shared`
= ports, `adapters/` + `repository.ts` = infrastructure, `routes.ts` =
presentation, `container.ts` = composition root. Use these terms; map any external
article onto them rather than importing its naming.

## Smells that mean the rule is being broken

- A SQL/Drizzle import in `routes.ts` or `service.ts`.
- `new SomeAdapter()` or an `adapters/*` import inside a service.
- One module importing another module's `service.ts` / `repository.ts`.
- A Fastify, Drizzle, `fs`, or `postgres` import anywhere in `reviewer-core`.
- A type that two modules share defined in one module's `types.ts` instead of
  `@devdigest/shared`.
- A circular import between layers.

All of the above are caught by `pnpm arch:check`.
