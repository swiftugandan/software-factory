#!/usr/bin/env bash
# Deterministic anti-drift check for program mode, run at the program root. The per-module
# traceability.sh proves criterion → task → test inside one module; this proves the layer
# above it: every module row is well-formed and uniquely prefixed, every cited contract
# exists (and none is orphaned), every dependency names a real module, and every contract
# guarantee (CON-NNN-M) is exercised by a named integration test. Catches the program-level
# drift where certified parts stop adding up to the specified whole.
# Exit 0 if fully traceable, else 1 with the gaps.
set -uo pipefail

[ -f docs/modules.md ] || { echo "program-traceability: docs/modules.md missing (run /program first)"; exit 1; }
[ -d docs/contracts ]  || { echo "program-traceability: docs/contracts/ missing"; exit 1; }

rows="$(grep -E '^- \[[ xX]\] M[0-9]+' docs/modules.md || true)"
[ -z "$rows" ] && { echo "program-traceability: no module rows ('- [ ] MNN …') in docs/modules.md"; exit 1; }

mids="$(printf '%s\n' "$rows" | sed -E 's/^- \[[ xX]\] (M[0-9]+).*/\1/' | sort -u)"

fail=0

# 1) Unique id prefix per module (AUTH-, BILL-, …).
dup_prefix="$(printf '%s\n' "$rows" | grep -oE 'prefix [A-Z]{2,}-' | sort | uniq -d | sed 's/prefix //')"
[ -n "$dup_prefix" ] && { echo "Duplicate module id prefixes:" $dup_prefix; fail=1; }

# 2) Dependencies name real modules.
bad_dep=""
while IFS= read -r row; do
  mid="$(printf '%s' "$row" | sed -E 's/^- \[[ xX]\] (M[0-9]+).*/\1/')"
  deps="$(printf '%s' "$row" | sed -n 's/.*deps:[[:space:]]*//p' | sed 's/·.*//')"
  for d in $(printf '%s' "$deps" | grep -oE 'M[0-9]+' || true); do
    printf '%s\n' "$mids" | grep -qx "$d" || bad_dep="$bad_dep $mid→$d"
  done
done <<EOF
$rows
EOF
[ -n "$bad_dep" ] && { echo "Deps naming unknown modules:$bad_dep"; fail=1; }

# 3) Cited contracts exist; existing contracts are cited by at least one module.
cited="$(printf '%s\n' "$rows" | sed -n 's/.*contracts:[[:space:]]*//p' | grep -oE '[0-9]{3}' | sort -u || true)"
have="$(find docs/contracts -maxdepth 1 -name '[0-9][0-9][0-9]-*.md' 2>/dev/null \
  | sed -E 's|.*/([0-9]{3})-.*|\1|' | sort -u)"
miss_file=""; orphan=""
for c in $cited; do printf '%s\n' "$have" | grep -qx "$c" || miss_file="$miss_file $c"; done
for c in $have;  do printf '%s\n' "$cited" | grep -qx "$c" || orphan="$orphan $c"; done
[ -n "$miss_file" ] && { echo "Modules cite contracts with no docs/contracts/ file:$miss_file"; fail=1; }
[ -n "$orphan" ]    && { echo "Contract files no module cites:$orphan"; fail=1; }

# 4) Every contract guarantee id is exercised by an integration test; a contract file with
#    no guarantee ids at all is unverifiable by construction.
testfiles="$(find tests/integration -type f 2>/dev/null | grep -v node_modules || true)"
no_ids=""; miss_test=""
for f in $(find docs/contracts -maxdepth 1 -name '[0-9][0-9][0-9]-*.md' 2>/dev/null); do
  ids="$(grep -oE 'CON-[0-9]+-[0-9A-Za-z]+' "$f" | sort -u || true)"
  [ -z "$ids" ] && { no_ids="$no_ids $(basename "$f")"; continue; }
  for id in $ids; do
    if [ -n "$testfiles" ]; then
      grep -qFl "$id" $testfiles >/dev/null 2>&1 || miss_test="$miss_test $id"
    else
      miss_test="$miss_test $id"
    fi
  done
done
[ -n "$no_ids" ]    && { echo "Contracts with no CON-NNN-M guarantee ids (unverifiable):$no_ids"; fail=1; }
[ -n "$miss_test" ] && { echo "Contract guarantees with no integration test:$miss_test"; fail=1; }

[ "$fail" -eq 0 ] && echo "program-traceability: every module, contract, and guarantee maps cleanly."
exit $fail
