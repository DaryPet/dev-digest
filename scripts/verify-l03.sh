#!/usr/bin/env bash
#
# Lesson 03 verification — Smart Diff (specs/smart-diff.md).
#
#   ./scripts/verify-l03.sh
#
# Runs the four checks the feature's definition-of-done requires:
#   1. server typecheck        (tsc --noEmit)
#   2. server smart-diff tests (classify + service composition, 53 tests)
#   3. client typecheck        (tsc --noEmit)
#   4. client viewer tests     (SmartDiffViewer, 17 tests)
#
# NOTE: there is no root package.json in this repo (packages are standalone),
# so this lives as a script, not a `pnpm verify:l03` workspace task. It calls
# the local binaries directly because `pnpm test`/`pnpm typecheck` abort in
# some envs on ERR_PNPM_IGNORED_BUILDS (see server/INSIGHTS.md, Tooling Notes).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

step "server: typecheck"
(cd "$ROOT/server" && ./node_modules/.bin/tsc --noEmit -p tsconfig.json)

step "server: smart-diff tests"
(cd "$ROOT/server" && ./node_modules/.bin/vitest run smart-diff)

step "client: typecheck"
(cd "$ROOT/client" && ./node_modules/.bin/tsc --noEmit)

step "client: SmartDiffViewer tests"
(cd "$ROOT/client" && ./node_modules/.bin/vitest run SmartDiffViewer)

printf '\n\033[32m✓ L03 Smart Diff verification green\033[0m\n'
