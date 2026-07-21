#!/usr/bin/env bash
# PreToolUse hook on Read|Grep|Glob. The blind testers must write tests from the spec
# without seeing the implementation, or their tests inherit the code's blind spots. This
# blocks gate-adversarial-tester (spec = PRD + workflows) and gate-integration-tester
# (spec = program BDD + contracts) from reading implementation source (tests, docs, config
# stay readable). Enforced deterministically so the guarantee doesn't rest on the model's
# restraint.
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
case "$agent" in
  gate-adversarial-tester|gate-integration-tester) ;;  # only constrains the blind testers
  *) exit 0 ;;
esac

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
    echo "blind-guard: $agent may not read implementation ($path). Write tests from the spec only — docs/PRD.md and docs/workflows.md (adversarial), or docs/BDD/ and docs/contracts/ (integration). Read tests/ and docs/ freely." >&2
    exit 2 ;;
esac
exit 0
