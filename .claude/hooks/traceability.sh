#!/usr/bin/env bash
# Deterministic anti-drift check. Every PRD criterion must be claimed by a task and exercised
# by a named test; every task must cite a real PRD id. Catches the slow drift where forty
# locally-reasonable steps build a coherent product that no longer matches the spec.
# Exit 0 if fully traceable, else 1 with the gaps.
set -uo pipefail

[ -f docs/PRD.md ]   || { echo "traceability: docs/PRD.md missing"; exit 1; }
[ -f docs/tasks.md ] || { echo "traceability: docs/tasks.md missing"; exit 1; }

ids="$(grep -oE 'PRD-[0-9]+' docs/PRD.md | sort -u)"
[ -z "$ids" ] && { echo "traceability: no PRD-NNN ids found in docs/PRD.md"; exit 1; }

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

# Tasks citing a PRD id that doesn't exist.
orphan=""
for tid in $(grep -oE 'PRD-[0-9]+' docs/tasks.md | sort -u); do
  printf '%s\n' "$ids" | grep -qx "$tid" || orphan="$orphan $tid"
done

fail=0
[ -n "$miss_task" ] && { echo "PRD criteria with no task:$miss_task"; fail=1; }
[ -n "$miss_test" ] && { echo "PRD criteria with no covering test:$miss_test"; fail=1; }
[ -n "$orphan" ]    && { echo "Tasks citing unknown PRD ids:$orphan"; fail=1; }

[ "$fail" -eq 0 ] && echo "traceability: every PRD criterion maps to a task and a test."
exit $fail
