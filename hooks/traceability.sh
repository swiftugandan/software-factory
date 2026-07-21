#!/usr/bin/env bash
# Deterministic anti-drift check. Every acceptance criterion must be claimed by a task and
# exercised by a named test; every task must cite a real criterion id. Catches the slow drift
# where forty locally-reasonable steps build a coherent product that no longer matches the spec.
# Exit 0 if fully traceable, else 1 with the gaps.
#
# The canonical criterion id scheme is PRD-NNN (see refine-product-manager). But rather than
# brick the whole gate when a PM emits a reasonable variant (AC-1, REQ-007, …), this hook
# DETECTS the scheme actually used in docs/PRD.md and checks against that. Override explicitly
# with `traceability.idPrefix` in config/factory.json when you want to pin one.
set -uo pipefail

[ -f docs/PRD.md ]   || { echo "traceability: docs/PRD.md missing"; exit 1; }
[ -f docs/tasks.md ] || { echo "traceability: docs/tasks.md missing"; exit 1; }

# 1) Determine the criterion-id prefix. Prefer an explicit config pin; else auto-detect the
#    most frequent [A-Z]{2,}-<number> token in the PRD (ADR-/BDD-space refs won't outvote the
#    two dozen real criteria). This is what makes a label choice non-fatal.
prefix=""
if command -v jq >/dev/null 2>&1 && [ -f config/factory.json ]; then
  prefix="$(jq -r '.traceability.idPrefix // empty' config/factory.json 2>/dev/null || true)"
fi
if [ -z "$prefix" ]; then
  prefix="$(grep -oE '[A-Z]{2,}-[0-9]+' docs/PRD.md \
    | sed -E 's/-[0-9]+$//' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')"
fi
[ -z "$prefix" ] && { echo "traceability: no criterion ids (e.g. PRD-001) found in docs/PRD.md"; exit 1; }

idre="${prefix}-[0-9]+"
ids="$(grep -oE "$idre" docs/PRD.md | sort -u)"
[ -z "$ids" ] && { echo "traceability: no ${prefix}-NNN ids found in docs/PRD.md"; exit 1; }

# Test files to search for id references.
testfiles="$(find . -type f \( -name '*.test.*' -o -name '*.spec.*' -o -path '*/tests/*' -o -path '*/test/*' \) 2>/dev/null | grep -v node_modules || true)"

miss_task=""; miss_test=""
for id in $ids; do
  grep -qF "$id" docs/tasks.md || miss_task="$miss_task $id"
  if [ -n "$testfiles" ]; then
    grep -qFl "$id" $testfiles >/dev/null 2>&1 || miss_test="$miss_test $id"
  else
    miss_test="$miss_test $id"
  fi
done

# Tasks citing a criterion id that doesn't exist.
orphan=""
for tid in $(grep -oE "$idre" docs/tasks.md | sort -u); do
  printf '%s\n' "$ids" | grep -qx "$tid" || orphan="$orphan $tid"
done

fail=0
[ -n "$miss_task" ] && { echo "${prefix} criteria with no task:$miss_task"; fail=1; }
[ -n "$miss_test" ] && { echo "${prefix} criteria with no covering test:$miss_test"; fail=1; }
[ -n "$orphan" ]    && { echo "Tasks citing unknown ${prefix} ids:$orphan"; fail=1; }

[ "$fail" -eq 0 ] && echo "traceability: every ${prefix} criterion maps to a task and a test."
exit $fail
