#!/usr/bin/env bash
# PreToolUse gate for the pr-self-review skill.
#
# Wired in .claude/settings.json as a PreToolUse hook on the Bash tool. It reads
# the hook JSON from stdin, and if the command is a push / open-PR / merge, it
# allows it ONLY when the pr-self-review skill has recorded a clean PASS against
# the current working-tree diff. Otherwise it blocks (exit 2) and tells the
# agent to run pr-self-review first.
#
# Marker file (.claude/.pr-self-review-pass), written by the skill on PASS:
#   line 1: PASS | BLOCKED
#   line 2: working-tree hash that passed  (scripts/pr-self-review-snapshot.sh)

set -euo pipefail

# Hook payload arrives on stdin as JSON; the Bash command is at .tool_input.command.
# Parse with jq (robust) and fall back to a sed extraction only if jq is absent.
payload="$(cat || true)"
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"
else
  cmd="$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')"
fi

# Only gate commands that actually reach GitHub. Done BEFORE any git call so
# the overwhelming majority of Bash commands (ls, npm, …) exit with zero extra work.
case "$cmd" in
  *"git push"*|*"gh pr create"*|*"gh pr merge"*) ;;
  *) exit 0 ;;  # not a GitHub-bound command — allow
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
marker="$repo_root/.claude/.pr-self-review-pass"

block() {
  # Exit code 2 makes Claude Code treat stderr as a blocking reason shown to the agent.
  echo "pr-self-review gate: $1" >&2
  echo "Run the pr-self-review skill on the current diff; it must report PASS before this command is allowed." >&2
  exit 2
}

[ -f "$marker" ] || block "no pass marker found — this diff has not been self-reviewed."

status="$(sed -n '1p' "$marker")"
passed_hash="$(sed -n '2p' "$marker")"
current_hash="$(bash "$repo_root/scripts/pr-self-review-snapshot.sh")"

[ "$status" = "PASS" ] || block "last self-review verdict was '$status', not PASS."
[ "$passed_hash" = "$current_hash" ] || block "the diff changed since the last PASS — re-review required."

exit 0  # clean PASS for the current diff — allow the command
