#!/usr/bin/env bash
# PreToolUse hook on Write|Edit|MultiEdit. Program-mode invariants, enforced the way every
# factory invariant is — deterministically, not by the model's restraint:
#   (a) Contracts are program-level artifacts. Only refine-program-planner (or the human's
#       main session) may write docs/contracts/; a module-side copy under docs/BDD/contracts/
#       is read-only for EVERYONE — it is assembled by the program run (cp, not Write) and
#       revised only at program level. A locally-patched contract certifies a module against
#       a spec its neighbors don't share, which is worse than the defect it papers over.
#   (b) docs/standing-decisions.md rows exist only by human approval (via
#       /approve-assumptions in the main session). Subagents may not write the file — an
#       agent-authored SD row would let one-way decisions skip the approval gate.
set -uo pipefail
INPUT="$(cat)"

field() { # field <jq-path> <key> — pull a string value without hard-depending on jq
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$1 // empty" 2>/dev/null
  else
    printf '%s' "$INPUT" | grep -oE "\"${2}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*"([^"]*)"$/\1/'
  fi
}

agent="$(field '.agent_type' agent_type)"
path="$(field '.tool_input.file_path' file_path)"
[ -z "$path" ] && exit 0

case "$path" in
  docs/BDD/contracts/*|*/docs/BDD/contracts/*)
    echo "program-guard: contract copies under docs/BDD/contracts/ are read-only ($path). A contract is revised at program level — log a one-way row naming it, stop the affected task, and report upward for /integrate to route (contract-protocol skill)." >&2
    exit 2 ;;
  docs/contracts/*|*/docs/contracts/*)
    case "$agent" in ""|refine-program-planner) exit 0 ;; esac
    echo "program-guard: only refine-program-planner revises contracts ($agent may not write $path). Report the defect as a contract-change instead — /integrate routes it through the planner and /approve-assumptions." >&2
    exit 2 ;;
  docs/standing-decisions.md|*/docs/standing-decisions.md)
    [ -z "$agent" ] && exit 0
    echo "program-guard: standing decisions exist only by human approval ($agent may not write $path). Log the gap as an assumption and flag it for promotion at /approve-assumptions." >&2
    exit 2 ;;
esac
exit 0
