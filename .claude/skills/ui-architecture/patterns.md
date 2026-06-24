# Architectural Patterns

## Container / Presentational — as a project-wide pattern

`react-best-practices` already states the per-component rule ("container
components fetch data; presentational components receive props and render
UI"). At the architecture level, the relevant point is what replaced the
classic implementation of this pattern:

Custom hooks now do the job that class-based "container components" used to
do. Instead of a `<UserListContainer>` wrapping a `<UserList>`, a hook
(`useUserList()`) returns the data/handlers and *any* component can call it
directly. This removes a whole layer of wrapper components that existed only
to fetch data and pass it down — if a component's only job is "call a hook,
return null, or just forward props," it's probably that legacy pattern and
can be flattened.

Escalate beyond hooks + container/presentational only when that genuinely
isn't enough — compound components, state reducers, or a state library
(Zustand/Redux) for shared state that many unrelated components need. Don't
reach for these by default.

## Atomic Design (optional, complementary)

An alternative lens for organizing `components/`, useful for component
libraries / design-system-heavy projects:

- **Atoms** — smallest building blocks (Button, Input, Label)
- **Molecules** — small combinations of atoms (SearchInput = Input + Button)
- **Organisms** — larger, more complete UI sections (Header, ProductCard)
- **Templates / Pages** — layout structure and real-content instances

This works well layered *inside* `components/` of a feature-based or
colocated structure — it's not a replacement for feature folders, it's a
way to organize the purely-presentational layer. Applying it rigidly from
day one on a small app adds folders without adding clarity; introduce it
once `components/` actually has enough atoms/molecules to justify the split.

## Barrel files (`index.ts` re-exports)

A barrel file only re-exports other files in its folder, so consumers can
import from the folder path instead of the specific file.

**What they buy you**: shorter import paths, and moving a file inside the
folder doesn't break external imports.

**What they cost**:
- Break tree-shaking — bundlers often can't tell what's actually used
  through a barrel, so unused code ships anyway.
- Slow down dev server startup and increase bundle size (real-world reports
  of 10x+ bundle size differences between barrel and direct imports).
- Create circular-import risk: a file inside the barrel importing *from* the
  barrel that re-exports it is an easy mistake to make.
- Hurt "go to definition" — landing in a generic `index.ts` instead of the
  actual file.

**Recommendation**: use a barrel at the **public boundary of a published
package** (one entry point is the whole point of a library). Inside
application code, import directly from the specific file. If the goal was
"shorter imports," a path alias (`@/features/auth`) gets the same ergonomics
without the tree-shaking/circular-import cost.
