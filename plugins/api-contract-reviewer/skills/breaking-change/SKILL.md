---
name: breaking-change
description: "Detect breaking changes to a public API contract in a PR diff — removed or renamed routes, fields, params, or enum values; tightened validation; changed status codes. Use when reviewing any change to a route handler, request/response type, public function signature, or shared schema."
type: rubric
---

# breaking-change

Flag any change that **removes or alters a public contract** an existing client
already depends on. A consumer that worked before the PR must keep working after
it — unless the change is an additive, backward-compatible extension.

## What counts as a public contract

- HTTP routes: method + path, path/query params, request body fields, response
  body fields, status codes, headers a client reads.
- Exported function/type signatures consumed across a package boundary.
- Shared schemas (Zod/JSON-Schema/OpenAPI), enum values, error `code` strings.

## Directive — when reviewing a diff

1. For every removed or renamed identifier in a public surface, assume a client
   depends on it. **Report it CRITICAL** unless the PR also keeps a
   backward-compatible alias or the symbol is provably private.
2. Tightening is breaking: a field going optional → required, a widened type
   narrowed (`string` → `'a' | 'b'`), a relaxed validation made stricter, a
   `200` becoming `4xx` for a previously-valid input.
3. Additive is safe: a NEW optional field, a NEW route, a NEW enum value a
   client isn't required to handle.
4. Cite the exact `file:line` of the offending change and name the consumer
   contract that breaks. If you cannot point to a real line, do not flag.

## Good / Bad

❌ **Bad — breaking (rename a response field, silently):**
```diff
- return { userId: u.id, displayName: u.name };
+ return { id: u.id, name: u.name };
```
Every client reading `userId`/`displayName` breaks. → CRITICAL breaking-change.

❌ **Bad — breaking (make a request field required):**
```diff
- body: z.object({ name: z.string(), email: z.string().optional() })
+ body: z.object({ name: z.string(), email: z.string() })
```
Existing callers omitting `email` now get a 4xx. → CRITICAL breaking-change.

✅ **Good — additive, backward compatible:**
```diff
  body: z.object({ name: z.string() })
+   .extend({ nickname: z.string().optional() })
```
New optional field; old callers unaffected. → not a breaking change.

✅ **Good — breaking but mitigated with an alias:**
```diff
- return { userId: u.id };
+ return { id: u.id, userId: u.id }; // deprecated alias kept for one release
```
Old field retained alongside the new one. → note as deprecation, not a break.
