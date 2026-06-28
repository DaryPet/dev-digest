---
name: semver-discipline
description: "Decide whether an API change requires a MAJOR / MINOR / PATCH version bump and check the PR bumped accordingly. Use when a PR changes a public contract and touches (or should touch) a version field — package.json version, an API version segment (/v1/), or an OpenAPI `info.version`."
type: rubric
---

# semver-discipline

Map the change to the version bump it demands, then check the PR actually made
that bump. Silent breaking changes shipped under a patch bump are the failure
this skill prevents.

## The rule (SemVer)

| Change | Required bump |
|--------|---------------|
| Remove/rename/retype a public contract; tighten a requirement (see [[breaking-change]], [[response-schema]]) | **MAJOR** |
| Add a new route / optional field / enum value — backward compatible | **MINOR** |
| Bug fix, internal refactor, no contract change | **PATCH** |

## Directive — when reviewing a diff

1. Classify the contract change (none / additive / breaking).
2. Find the version bump in the diff (`package.json`, `/vN/` path, OpenAPI
   `info.version`). Compare it to the required bump above.
3. **Report a mismatch:**
   - Breaking change with only a minor/patch bump → CRITICAL: "breaking change
     requires a MAJOR bump."
   - Additive change with no minor bump → WARNING.
   - No contract change but a major bump → note (probably unintended).
4. If the repo has no version field at all, say so once and assess the change
   class anyway (so reviewers know a major-level break is being shipped).
5. Cite the version line (or its absence) plus the contract change that drives
   the requirement.

## Good / Bad

❌ **Bad — breaking change under a patch bump:**
```diff
- "version": "2.4.1"
+ "version": "2.4.2"
```
…in a PR that renames a response field. → CRITICAL: needs `3.0.0`, not `2.4.2`.

❌ **Bad — new route, no bump:**
A PR adds `POST /v1/exports` but leaves `"version": "2.4.1"`. → WARNING: an
additive feature should bump the MINOR (`2.5.0`).

✅ **Good — breaking change correctly bumped:**
```diff
- "version": "2.4.1"
+ "version": "3.0.0"
```
…paired with a removed field and a `/v2/` route. → version discipline upheld.

✅ **Good — pure refactor, patch bump:**
Internal rename of a private helper, identical public surface, `2.4.1 → 2.4.2`.
→ correct.
