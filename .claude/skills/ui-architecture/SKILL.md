---
name: ui-architecture
description: "Where frontend code should physically live and how it should be named: folder structure, lib/ vs utils/ vs services/ boundaries, constants and types placement, env/config organization, naming conventions (components, files, hooks, utils, constants, props), and architectural patterns (container/presentational, Data Access Layer, barrel files, atomic design). Use when deciding where a new file or folder should go, naming something, splitting a project into features, or reviewing a project for structural consistency. Does NOT cover component correctness, hooks rules, performance, or Next.js routing/data-fetching mechanics — see react-best-practices and next-best-practices for those."
version: 1.0.0
---

# UI Architecture & Code Organization

Structure and naming conventions for React/Next.js frontends — the "where does
this file go and what do we call it" layer. For full scope, rationale, and how
this relates to other skills, see [README.md](README.md).

This skill deliberately stays out of component-implementation rules (purity,
hooks correctness, memoization, accessibility — `react-best-practices`) and
Next.js routing/rendering mechanics (Server Components vs Actions vs Route
Handlers, `error.tsx`/`not-found.tsx`, RSC boundaries — `next-best-practices`).
When a question touches those, defer to those skills instead of repeating
their content here.

## Folder Structure

See [folder-structure.md](folder-structure.md) for:
- Feature-based structure vs colocation, and when to mix them
- `lib/` vs `utils/` vs `services/` — what belongs in each
- Where constants live (single file vs split-by-context)
- Where types/interfaces live (co-location principle)
- Data Access Layer (DAL) — keeping auth/DB access out of UI and route code
- Env variable / config organization

## Naming Conventions

See [naming-conventions.md](naming-conventions.md) for:
- Components, files, hooks, utils, constants, props
- Why hook naming (`use` prefix) isn't just style — lint rules depend on it

## Architectural Patterns

See [patterns.md](patterns.md) for:
- Container/presentational as a project-wide pattern (not a single-component rule)
- Barrel files (`index.ts` re-exports) — when they help vs when they hurt
- Atomic Design as an alternative/complementary organizing principle

## Quick decision guide

- **New reusable UI piece, no business logic** → `components/` (or `components/ui/`)
- **New piece of state/behavior used by 1+ components** → custom hook (`hooks/` or colocated)
- **Pure function, no React, no framework** → `utils/`
- **Talks to an external system (DB, third-party API, SDK)** → `lib/` or `services/`
- **Hardcoded value used in 2+ places** → `constants/`
- **Type/interface used by only one file** → keep it in that file
- **Type/interface shared across features** → `types/`
- **Auth/DB access that a Server Action or Route Handler needs** → DAL module, not inline in the action/handler
