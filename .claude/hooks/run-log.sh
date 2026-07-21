#!/usr/bin/env bash
# SubagentStop hook. Records which subagent finished, for a readable run trail.
# Non-blocking: always exit 0.
set -uo pipefail
INPUT="$(cat)"
if command -v jq >/dev/null 2>&1; then
  # NOTE: jq's `//` treats an empty string as a present value, so `.agent_type // .agent_id`
  # would log a blank name when agent_type is "". Select the first non-null, non-empty field.
  agent="$(printf '%s' "$INPUT" | jq -r '[.agent_type, .agent_id] | map(select(. != null and . != "")) | first // empty' 2>/dev/null || echo "")"
else
  agent="$(printf '%s' "$INPUT" | grep -oE '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
fi
# Final guard: empty from any path (unset, null, or "") falls back to a generic label.
[ -z "$agent" ] && agent="subagent"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p docs
[ -f docs/run-log.md ] || printf '# Run Log\n\n' > docs/run-log.md
printf -- '- %s  finished **%s**\n' "$ts" "$agent" >> docs/run-log.md
exit 0
