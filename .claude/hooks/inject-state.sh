#!/usr/bin/env bash
# SessionStart hook. Surfaces open one-way (REVIEW) assumptions and remaining tasks into
# context so a resumed run knows what still needs a human eye. Emits additionalContext.
set -uo pipefail
cat >/dev/null  # drain stdin

ctx=""
if [ -f docs/assumptions.md ]; then
  reviews="$(grep -c 'REVIEW |$' docs/assumptions.md 2>/dev/null || true)"; reviews="${reviews:-0}"
  if [ "$reviews" -gt 0 ]; then
    noun="assumptions need"; [ "$reviews" -eq 1 ] && noun="assumption needs"
    ctx="${ctx}${reviews} one-way ${noun} human review in docs/assumptions.md (search REVIEW). "
  fi
fi
if [ -f docs/tasks.md ]; then
  open="$(grep -cE '^\- \[ \]' docs/tasks.md 2>/dev/null || true)"; open="${open:-0}"
  if [ "$open" -gt 0 ]; then
    noun="tasks remain"; [ "$open" -eq 1 ] && noun="task remains"
    ctx="${ctx}${open} ${noun} unchecked in docs/tasks.md. "
  fi
fi
[ -z "$ctx" ] && exit 0

if command -v jq >/dev/null 2>&1; then
  jq -n --arg c "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  esc="${ctx//\"/\\\"}"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$esc"
fi
exit 0
