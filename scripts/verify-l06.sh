#!/usr/bin/env bash
#
# Lesson 06 verification — Eval Pipeline (specs/eval-pipeline.md).
#
#   ./scripts/verify-l06.sh
#
# Runs the four checks the feature's definition-of-done requires:
#   1. server typecheck        (tsc --noEmit)
#   2. server eval tests       (routes + service + repository)
#   3. client typecheck        (tsc --noEmit)
#   4. client eval tests       (EvalsTab + EvalDashboard + FindingCard)
#
# NOTE: no root package.json (packages are standalone), calls local binaries
# directly because pnpm test/typecheck abort on ERR_PNPM_IGNORED_BUILDS.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

step "server: typecheck"
(cd "$ROOT/server" && ./node_modules/.bin/tsc --noEmit -p tsconfig.json)

step "server: eval module tests"
(cd "$ROOT/server" && ./node_modules/.bin/vitest run src/modules/eval)

step "client: typecheck"
(cd "$ROOT/client" && ./node_modules/.bin/tsc --noEmit)

step "client: EvalsTab + EvalDashboard + FindingCard tests"
# vitest run's CLI filter is a plain substring, not an alternation regex — a
# combined "A|B|C" pattern matches zero files (confirmed: matches no path
# literally containing "|"). Run each suite separately instead. "eval-dashboard"
# already covers CompareRunsModal (nested under eval-dashboard/_components/).
(cd "$ROOT/client" && ./node_modules/.bin/vitest run "EvalsTab")
(cd "$ROOT/client" && ./node_modules/.bin/vitest run "eval-dashboard")
(cd "$ROOT/client" && ./node_modules/.bin/vitest run "FindingCard")

printf '\n\033[32m✓ L06 Eval Pipeline verification green\033[0m\n'