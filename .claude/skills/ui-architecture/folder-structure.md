# Folder Structure

## Feature-based structure vs colocation

Two complementary strategies, not competing ones:

- **Feature-based** — group everything for a domain (`features/auth/`,
  `features/billing/`) together: components, hooks, helpers, types, tests.
  Best for code reused or read together across multiple routes/pages.
- **Colocation** — keep a piece of code physically next to the one place
  that uses it (e.g. a helper used only by `app/dashboard/page.tsx` lives in
  `app/dashboard/`, not in a shared folder). In Next.js App Router this is
  the default mode — `app/` already colocates routes with their UI.

Mix both: colocate logic that's truly local to one route; promote it to a
`features/` folder the moment a second route needs it. Don't pre-create
feature folders for code that has one consumer — that's premature structure,
not architecture.

Keep nesting shallow — beyond 3-4 folder levels, navigation cost outweighs
the organizational benefit.

> Component design rules (max lines/props, one component per file, splitting
> logic into hooks) are covered in `react-best-practices` — this file is only
> about *where* things go, not how a component should be written.

## `lib/` vs `utils/` vs `services/`

These three get conflated constantly. The distinction that actually matters:

| Folder | Contains | Test: |
|---|---|---|
| `utils/` | Pure, framework-agnostic functions, no side effects | Could this run unmodified in a plain Node/JS project with no React/Next? |
| `lib/` | Framework- or infra-specific code: DB client setup, third-party SDK wrappers, integrations | Does it connect this app to something outside it (DB, S3, payment provider)? |
| `services/` | Modules whose job is communicating with a specific external API/system (often built on top of a `lib/` client) | Is its purpose "talk to system X," not "do generic task Y"? |

`formatCurrency()`, `slugify()`, `isValidEmail()` → `utils/`.
`prisma.ts`, an S3 upload helper, an Axios instance with interceptors → `lib/`.
A module exposing `getUserOrders()`, `createInvoice()` against a billing API → `services/`.

Pick one convention and apply it consistently — the exact folder names matter
less than not mixing two mental models in the same codebase.

## Constants

- Small/medium project: one `constants.ts` (or `constants/index.ts`) at
  `src/` root — app-wide values, style tokens (breakpoints, colors), public
  keys.
- Larger project: split by context instead of one growing file —
  `constants/api.ts`, `constants/routes.ts`, `constants/i18n.ts`. Split when
  the single file becomes a place where unrelated values pile up, not on a
  fixed line count.
- Goal: remove magic strings/numbers from components and stop the same
  literal from being retyped (and silently drifting) across files.

## Types / interfaces

- **Co-location is the default**: define a type where it's used. A
  component's prop type lives in that component's file, directly above the
  component.
- Promote a type to a shared `types/` folder (split by domain, e.g.
  `types/api.ts`, `types/models.ts`) only once **multiple features** depend
  on it — typically API response shapes and core domain models.
- Don't create a type file pre-emptively "in case it's needed elsewhere" —
  that's the same premature-abstraction trap as feature folders.

## Data Access Layer (DAL)

A DAL is a server-only module that owns **auth checks + database/external
data access**, sitting between your UI/route layer and the data source.

```
lib/dal/orders.ts
  export async function getOrderForUser(userId, orderId) {
    await requireAuth(userId)        // auth check lives here
    return db.order.findFirst({ where: { id: orderId, userId } })
  }
```

Server Actions and Route Handlers then call into the DAL instead of doing
auth + queries inline:

```
'use server'
export async function deleteOrder(orderId: string) {
  const userId = await getCurrentUserId()
  await dal.orders.deleteForUser(userId, orderId)  // thin wrapper
}
```

Why this matters architecturally: without a DAL, the same
auth-check-then-query logic gets copy-pasted across every Server
Action/Route Handler that touches `orders`, and a missed check in one copy
is a security bug. With a DAL, the check exists in exactly one place.

> *Which* Next.js primitive to call from (Server Action vs Route Handler vs
> Server Component fetch) is covered in `next-best-practices` →
> `data-patterns.md`. The DAL is about where the auth+query logic itself
> lives, independent of which primitive triggers it.

## Env variables / config

- Only `NEXT_PUBLIC_`-prefixed variables reach the client bundle — everything
  else stays server-only. Don't add the prefix out of habit; it's a public
  exposure decision, not a convenience one.
- `.env` / `.env.development` / `.env.production` — non-secret defaults and
  per-environment config, committed to the repo.
- `.env.local` — secrets and machine-local overrides, gitignored, never
  committed.
- Recommended pattern: one config module that reads `process.env`, validates
  required variables at startup (e.g. with Zod), and exports typed constants.
  Failing fast at startup beats discovering a missing var as `undefined` in
  production.
