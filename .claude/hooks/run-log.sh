#!/usr/bin/env bash
# SubagentStop hook. Records which subagent finished, for a readable run trail.
# Non-blocking: always exit 0.
set -uo pipefail
INPUT="$(cat)"
if command -v jq >/dev/null 2>&1; then
  agent="$(printf '%s' "$INPUT" | jq -r '.agent_type // .agent_id // "subagent"' 2>/dev/null || echo subagent)"
else
  agent="$(printf '%s' "$INPUT" | grep -oE '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
  [ -z "$agent" ] && agent="subagent"
fi
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p docs
[ -f docs/run-log.md ] || printf '# Run Log\n\n' > docs/run-log.md
printf -- '- %s  finished **%s**\n' "$ts" "$agent" >> docs/run-log.md
exit 0
