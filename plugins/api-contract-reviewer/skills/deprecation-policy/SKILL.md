---
name: deprecation-policy
description: "Ensure removals of public API surface follow a deprecate-then-remove policy instead of silent deletion — a deprecation marker, a migration note, and a kept alias for a grace period. Use when a PR removes or replaces a route, field, param, or exported symbol that clients may use."
type: rubric
---

# deprecation-policy

When a public surface must go away, it should be **deprecated first, removed
later** — never deleted silently in the same release that introduces the
replacement. This skill checks the removal followed that policy.

## What a proper deprecation includes

1. A visible **marker**: `@deprecated` JSDoc, an OpenAPI `deprecated: true`, a
   `Deprecation`/`Sunset` response header, or a logged warning.
2. A **replacement pointer**: what to use instead (the new field/route/param).
3. A **grace period**: the old surface keeps working (an alias / shim) for at
   least one minor release before removal.

## Directive — when reviewing a diff

1. If the diff **removes** a public symbol, check whether a prior release marked
   it deprecated. No prior deprecation → report: "remove only after a deprecation
   period; add an alias + `@deprecated` now and remove next major."
2. If the diff **introduces a replacement**, check the old surface is kept and
   marked deprecated, not deleted. Deleting both in one PR → WARNING/CRITICAL
   (combine with [[breaking-change]] severity).
3. Reward the correct pattern: a PR that adds `@deprecated` + alias is GOOD —
   do not flag it as a break.
4. Cite `file:line` of the removal (or the missing marker).

## Good / Bad

❌ **Bad — silent removal:**
```diff
- app.get('/v1/users/:id/avatar', getAvatar); // gone, no notice
```
Clients calling it get a 404 with no warning. → CRITICAL: deprecate before removing.

❌ **Bad — replace + delete in one step:**
```diff
- return { fullName: u.name };
+ return { name: u.name };
```
Old field dropped the moment the new one lands. → no grace period.

✅ **Good — deprecate, keep alias, point to replacement:**
```ts
/** @deprecated use `name`; `fullName` is removed in v3. */
return { name: u.name, fullName: u.name };
```
Old field still works and is clearly marked. → policy followed.

✅ **Good — route deprecation with a header + sunset:**
```ts
reply.header('Deprecation', 'true');
reply.header('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT'); // use /v2/users/:id
```
Clients are warned and given a date + replacement. → policy followed.
