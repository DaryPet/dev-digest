# e2e — insights

Decisions/insights log for `@devdigest/e2e` — the *why* behind a non-obvious
choice (tradeoffs considered, what was rejected and why), not the *what*
(that's [`specs/`](./specs/)) or the *how it works* (that's [`docs/`](./docs/)).

## Codebase Patterns & Tool/Library Notes

- **2026-06-24** — agent-browser commands share ONE browser session across
  invocations, even across separate process invocations (not just within one
  script run) — the daemon keeps the page between calls. Running the test
  runner (`cd e2e && npm test` / `./scripts/e2e.sh`) in the background while
  also driving `agent-browser` manually from another shell makes both fight
  over the same tab: one's navigation/clicks land mid-flow of the other. This
  produces failures (`ERR_CONNECTION_REFUSED` screenshots, wrong-page
  screenshots) that look like app bugs but are purely a session-sharing
  artifact. Never run the e2e runner and manual `agent-browser` commands
  concurrently; finish and tear down one (`agent-browser close`) before
  starting the other.
- **2026-06-24** — Don't save screenshots/logs meant for the user under
  `/tmp` — that path is local to the agent's sandboxed tool environment and is
  NOT visible on the user's actual machine, even though the repo working tree
  (e.g. `e2e/test-results/`) is shared and mirrors what the user sees.
  User-facing verification artifacts always go inside the repo (e.g.
  `e2e/test-results/`), never `/tmp`.

## Recurring Errors & Fixes

- **2026-06-24** — `04-pr-findings.flow.json` and `05-pr-diff.flow.json` were
  missing a `wait --text "<seeded PR title>"` step before the
  `find text ... click` that opens the PR row, unlike
  `02-repo-pulls-detail.flow.json` which has it — a race condition where the
  click can fire before the PR list (populated by a client-side fetch after
  the route loads) has rendered, intermittently failing with "Command failed:
  agent-browser find text ... click". Any new flow that clicks something
  populated by an async fetch needs its own `wait --text`/`wait --url` for
  that content; `wait --url "/pulls"` alone only proves the route changed, not
  that the list rendered.

## What Doesn't Work

- **2026-06-24** — `pkill -f "scripts/e2e.sh"` to stop a backgrounded
  `./scripts/e2e.sh &` does NOT kill the child `npm test` (`tsx run.ts`)
  process — its command line doesn't match the pattern, so it keeps running
  orphaned, sharing the agent-browser session with whatever runs next (see
  session-sharing note above). `./scripts/e2e.sh` is designed to run in the
  foreground to completion and self-teardown — don't background it; if it's
  already backgrounded, kill the actual runner (`pkill -f "tsx.*run.ts"`) too,
  not just the shell script's name.
