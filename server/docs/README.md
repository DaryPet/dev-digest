# server/docs/

Reference docs for `@devdigest/api` — how things in this package work, not
what to build (see [`specs/`](../specs/)) or why a decision was made (see
[`INSIGHTS.md`](../INSIGHTS.md)).

| Doc | Covers |
|-----|--------|
| [`smart-diff.md`](./smart-diff.md) | `modules/smart-diff` — risk-ordered diff endpoint (`GET /pulls/:id/smart-diff`): classification rules, composition, split suggestion, token-free guarantee |

Add docs here as the server grows (e.g. DI container, adapters, migrations).
