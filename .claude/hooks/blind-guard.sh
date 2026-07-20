#!/usr/bin/env bash
# PreToolUse hook on Read|Grep|Glob. The adversarial tester must write tests from the spec
# without seeing the implementation, or its tests inherit the code's blind spots. This blocks
# gate-adversarial-tester from reading implementation source (tests, docs, and the PRD stay
# readable). Enforced deterministically so the guarantee doesn't rest on the model's restraint.
set -uo pipefail
INPUT="$(cat)"

field() { # field <key> — pull a string value from the JSON without hard-depending on jq
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$1 // empty" 2>/dev/null
  else
    printf '%s' "$INPUT" | grep -oE "\"${2:-}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*"([^"]*)"$/\1/'
  fi
}

agent="$(field '.agent_type' agent_type)"
[ "$agent" = "gate-adversarial-tester" ] || exit 0   # only constrains that one agent

path="$(field '.tool_input.file_path' file_path)"
[ -z "$path" ] && path="$(field '.tool_input.path' path)"
[ -z "$path" ] && path="$(field '.tool_input.pattern' pattern)"
[ -z "$path" ] && exit 0

# Allowed: tests, docs (the spec), config. Blocked: everything that looks like implementation.
case "$path" in
  *.test.*|*.spec.*|*__tests__*|*/tests/*|*/test/*|docs/*|*/docs/*|config/*|*/config/*) exit 0 ;;
esac
case "$path" in
  src/*|*/src/*|lib/*|*/lib/*|app/*|*/app/*|server/*|client/*|api/*|packages/*)
    echo "blind-guard: gate-adversarial-tester may not read implementation ($path). Write tests from docs/PRD.md and docs/workflows.md only. Read tests/ and docs/ freely." >&2
    exit 2 ;;
esac
exit 0
