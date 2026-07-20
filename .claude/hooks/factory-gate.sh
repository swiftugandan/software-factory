#!/usr/bin/env bash
# Stop hook. Refuses to let the run end while an objective gate is red or the ledger is
# missing once code exists. Exit 2 tells Claude Code to keep working; stdout on exit 2 is
# fed back as the reason. Guarded by stop_hook_active so it can't loop forever.
set -uo pipefail

INPUT="$(cat)"
if command -v jq >/dev/null 2>&1; then
  active="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
else
  printf '%s' "$INPUT" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && active=true || active=false
fi
if [ "$active" = "true" ]; then
  # We already blocked once this turn; let the model stop so we don't spin.
  exit 0
fi

block() { echo "$1"; exit 2; }

# The factory is only "engaged" once a task plan exists. Before that, never interfere —
# this keeps the gate inert in a pre-existing repo until the user runs the pipeline.
[ -f docs/tasks.md ] || exit 0

# 1) If any source has been written, a ledger must exist. Empty ledger is allowed only
#    before refinement starts.
if [ -d src ] && [ -n "$(find src -type f 2>/dev/null | head -1)" ]; then
  [ -f docs/assumptions.md ] || block \
    "Code exists but docs/assumptions.md is missing. Log the decisions made so far with .claude/hooks/log-assumption.sh before finishing."
fi

# 2) Objective gates. Run whatever the repo actually configures; skip cleanly if absent.
has_script() { # has_script <name>: true if package.json defines that npm script
  if command -v jq >/dev/null 2>&1; then
    jq -e --arg s "$1" '.scripts[$s]' package.json >/dev/null 2>&1
  else
    grep -qE "\"$1\"[[:space:]]*:" package.json
  fi
}
if [ -f package.json ]; then
  if has_script lint; then
    npm run -s lint >/tmp/factory-lint.log 2>&1 || block \
      "Lint is failing. Fix it (or route to fix-minimal-change) before finishing:
$(tail -n 20 /tmp/factory-lint.log)"
  fi
  if has_script test; then
    npm test --silent >/tmp/factory-test.log 2>&1 || block \
      "Tests are failing. This is a defect, not a stopping point:
$(tail -n 30 /tmp/factory-test.log)"
  fi
fi

# 3) Python projects: run pytest if a test dir exists.
if [ -d tests ] && command -v pytest >/dev/null 2>&1; then
  if ls tests/*.py tests/**/*.py >/dev/null 2>&1; then
    pytest -q >/tmp/factory-pytest.log 2>&1 || block \
      "pytest is failing. Fix before finishing:
$(tail -n 30 /tmp/factory-pytest.log)"
  fi
fi

exit 0
