#!/usr/bin/env bash
# Prints a stable hash of the ENTIRE working tree — tracked changes (staged AND
# unstaged) plus untracked files, respecting .gitignore — independent of the
# real index/HEAD state.
#
# Used by BOTH the pr-self-review skill (to write the PASS marker) and the gate
# hook (to verify it), so the hash MUST be computed identically in both places.
# That is why the logic lives here and is not inlined.
#
# How: stage everything into a throwaway index and write its tree object. The
# resulting tree SHA changes if any tracked or untracked (non-ignored) file
# changes — exactly the "what would go up in the PR" surface, unlike
# `git diff`, which misses untracked and staged files.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT
# git rejects a zero-byte index ("smaller than expected"); remove the empty file
# mktemp made so git initialises a fresh index at this path itself.
rm -f "$tmp_index"

# Fresh empty index → add -A stages the full working tree (minus ignored files).
# Exclude the marker itself: it is untracked and not gitignored, so without the
# exclusion writing the marker would change the very hash it records, and the
# gate would always see a "changed" tree right after a PASS.
GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" add -A -- ':(exclude).claude/.pr-self-review-pass'
GIT_INDEX_FILE="$tmp_index" git -C "$repo_root" write-tree
