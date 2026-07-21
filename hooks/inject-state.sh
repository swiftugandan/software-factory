#!/usr/bin/env bash
# SessionStart hook. In a factory project it (a) mirrors the model-invoked helper scripts
# into .claude/hooks/ so documented paths work in plugin mode, (b) injects a compact
# operating briefing (plugin installs can't ship CLAUDE.md), and (c) surfaces open one-way
# (REVIEW) assumptions and remaining tasks so a resumed run knows what still needs a human
# eye. Emits additionalContext. Inert outside factory projects.
set -uo pipefail
cat >/dev/null  # drain stdin

# Only engage in a project that uses the factory.
is_factory=false
{ [ -d docs/BDD ] || [ -f docs/tasks.md ] || [ -f config/factory.json ] || [ -f docs/assumptions.md ]; } && is_factory=true
[ "$is_factory" = "true" ] || exit 0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ctx=""
# Plugin mode: the helpers aren't at .claude/hooks/ until mirrored, and CLAUDE.md isn't
# loaded from a plugin — inject the essentials instead.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  bash "$here/sync-project.sh" >/dev/null 2>&1 || true
  ctx="This project uses the software-factory plugin. Pipeline: /software-factory:factory (full run), :refine, :approve-assumptions, :build, :harden, :certify, :assumptions, :setup. Inputs live in docs/BDD/. The one rule: never halt on a question a competent contractor could answer — resolve the gap via the assumption-ledger skill and record it with ./.claude/hooks/log-assumption.sh --gap '...' --assumption '...' --reversibility one-way|cheap --basis '...' --owner <agent>. One-way decisions go behind a config flag or interface seam and need /software-factory:approve-assumptions before implementation code is written. Conventions: Postgres unless the BDD names a datastore, UTC everywhere, soft deletes for user-owned rows, email/password + OAuth unless SSO is specified, English-only until locales appear. "
fi
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
