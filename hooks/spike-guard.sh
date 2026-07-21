#!/usr/bin/env bash
# PreToolUse hook on Write|Edit|MultiEdit. Spike code is throwaway by contract, and the
# contract is enforced two ways:
#   (a) implementation files may not reference spikes/ — experiments cannot ooze into the
#       product via an import or require;
#   (b) refine-spike-engineer writes only inside spikes/, docs/, and config/ — the agent
#       that runs experiments cannot touch the product.
# Deterministic, like blind-guard: the guarantee doesn't rest on the model's restraint.
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

# (b) Containment: the spike engineer stays in its sandbox.
if [ "$agent" = "refine-spike-engineer" ]; then
  case "$path" in
    spikes/*|*/spikes/*|docs/*|*/docs/*|config/*|*/config/*) exit 0 ;;
    src/*|*/src/*|lib/*|*/lib/*|app/*|*/app/*|server/*|client/*|api/*|packages/*|tests/*|*/tests/*|test/*|*/test/*)
      echo "spike-guard: refine-spike-engineer writes only under spikes/, docs/, and config/ ($path is product code). Record findings in docs/spikes/ and the ledger; builders act on them." >&2
      exit 2 ;;
    *) exit 0 ;;
  esac
fi

# (a) No spike references in implementation code.
case "$path" in
  src/*|*/src/*|lib/*|*/lib/*|app/*|*/app/*|server/*|client/*|api/*|packages/*)
    if command -v jq >/dev/null 2>&1; then
      content="$(printf '%s' "$INPUT" | jq -r '(.tool_input.content // .tool_input.new_string // "")' 2>/dev/null)"
    else
      content="$INPUT"  # degrade: scan the whole payload
    fi
    if printf '%s' "$content" | grep -qE '(from|require\(|import)[[:space:]("'"'"']*[^"'"'"')]*spikes/'; then
      echo "spike-guard: implementation code may not reference spikes/ ($path). Spikes are throwaway experiments — port the LESSON into src/ (citing the spike number in the ADR), never the code." >&2
      exit 2
    fi ;;
esac
exit 0
