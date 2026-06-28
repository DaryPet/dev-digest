---
name: response-schema
description: "Detect changes to the SHAPE of an API response — field added/removed/renamed, a field's type changed, a field's nullability/optionality changed, or array vs object restructuring. Use when a PR touches a response DTO, serializer, route return value, or response Zod/OpenAPI schema."
type: rubric
---

# response-schema

Watch the **shape of what the server returns**. Clients deserialize responses
against an expected schema; any change to field presence, name, type, or
nullability can break parsing even when the route path is untouched.

## Directive — when reviewing a diff

1. Diff the response object/schema before vs after. For each field, classify:
   - **Removed / renamed** → breaking (clients read the old key). CRITICAL.
   - **Type changed** (`number` → `string`, object → array, scalar → object)
     → breaking. CRITICAL.
   - **Became nullable / optional** when it was always present → breaking for
     clients that assume presence. WARNING.
   - **New required field** → safe to add, but note it (clients ignoring extra
     keys are fine).
2. Check serializers, not just schemas — a changed `.map()`/`toDto()` can alter
   the shape without touching the declared schema.
3. Confirm the response schema and the actual returned object still agree after
   the change; a drift between them is a bug to report.
4. Cite `file:line` of the field whose shape changed.

## Good / Bad

❌ **Bad — type of a field changed (number → string):**
```diff
- return { total: cents };           // number
+ return { total: formatUsd(cents) }; // "$12.00"
```
Clients doing arithmetic on `total` break. → CRITICAL response-schema change.

❌ **Bad — field becomes nullable without warning:**
```diff
- avatarUrl: z.string()
+ avatarUrl: z.string().nullable()
```
Clients rendering `avatarUrl` unconditionally now hit `null`. → WARNING.

❌ **Bad — structure changed (object → array):**
```diff
- return { items: { first, second } };
+ return { items: [first, second] };
```
Shape change; `items.first` is now `undefined`. → CRITICAL.

✅ **Good — additive optional field, schema + serializer in sync:**
```diff
  const Dto = z.object({ id: z.string() })
+   .extend({ avatarUrl: z.string().optional() });
- return { id: u.id };
+ return { id: u.id, avatarUrl: u.avatar ?? undefined };
```
New optional field; existing consumers unaffected. → not a regression.
