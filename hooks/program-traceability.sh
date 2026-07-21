#!/usr/bin/env bash
# Deterministic anti-drift check for program mode, run at the program root. The per-module
# traceability.sh proves criterion → task → test inside one module; this proves the layer
# above it: every module row is well-formed and uniquely prefixed, dependencies name real
# modules in EARLIER waves (same-wave deps would break wave concurrency), every cited
# contract exists (and none is orphaned), every contract guarantee (CON-NNN-M) is exercised
# by a named integration test, and no checked-off module was certified against a contract
# that has since been revised. Catches the program-level drift where certified parts stop
# adding up to the specified whole.
#
# Two moments, two modes:
#   --plan  right after /program writes docs/modules.md — structural checks only (format,
#           prefixes, waves, deps, contract files, guarantee ids). Catches a malformed
#           decomposition at write time instead of a wave later.
#   (full)  at /integrate — everything above PLUS guarantee→test coverage and stale
#           certification.
# Exit 0 if fully traceable, else 1 with the gaps.
set -uo pipefail

plan=0
[ "${1:-}" = "--plan" ] && plan=1

[ -f docs/modules.md ] || { echo "program-traceability: docs/modules.md missing (run /program first)"; exit 1; }
[ -d docs/contracts ]  || { echo "program-traceability: docs/contracts/ missing"; exit 1; }

rows="$(grep -E '^- \[[ xX]\] M[0-9]+' docs/modules.md || true)"
[ -z "$rows" ] && { echo "program-traceability: no module rows ('- [ ] MNN name — prefix X- · wave N · deps: … · contracts: …') in docs/modules.md"; exit 1; }

mids="$(printf '%s\n' "$rows" | sed -E 's/^- \[[ xX]\] (M[0-9]+).*/\1/' | sort -u)"

# Field extractors — tolerant of label case and 1-3 digit contract numbers (normalized to
# three digits), the way traceability.sh tolerates criterion-id scheme variants.
row_field() { # row_field <row> <label-regex> — the text between "label:" and the next ·
  printf '%s' "$1" | sed -nE "s/.*$2:[[:space:]]*//p" | sed 's/·.*//'
}
norm3() { printf '%03d' "$((10#$1))" 2>/dev/null || printf '%s' "$1"; }

fail=0

# 1) Unique id prefix per module (AUTH-, BILL-, …).
dup_prefix="$(printf '%s\n' "$rows" | grep -oiE 'prefix [A-Z]{2,}-' | tr a-z A-Z | sort | uniq -d | sed 's/PREFIX //')"
[ -n "$dup_prefix" ] && { echo "Duplicate module id prefixes:" $dup_prefix; fail=1; }

# 2) Dependencies name real modules in strictly earlier waves.
wave_of() { # wave_of <MNN> — the wave number on that module's row, empty if absent
  printf '%s\n' "$rows" | grep -E "^- \[[ xX]\] $1 " | head -1 | grep -oiE 'wave [0-9]+' | grep -oE '[0-9]+' | head -1
}
bad_dep=""; bad_wave=""
while IFS= read -r row; do
  mid="$(printf '%s' "$row" | sed -E 's/^- \[[ xX]\] (M[0-9]+).*/\1/')"
  mwave="$(printf '%s' "$row" | grep -oiE 'wave [0-9]+' | grep -oE '[0-9]+' | head -1)"
  deps="$(row_field "$row" "[Dd]eps")"
  for d in $(printf '%s' "$deps" | grep -oE 'M[0-9]+' || true); do
    if ! printf '%s\n' "$mids" | grep -qx "$d"; then
      bad_dep="$bad_dep $mid→$d"
    elif [ -n "$mwave" ]; then
      dwave="$(wave_of "$d")"
      [ -n "$dwave" ] && [ "$dwave" -ge "$mwave" ] && bad_wave="$bad_wave $mid(wave $mwave)→$d(wave $dwave)"
    fi
  done
done <<EOF
$rows
EOF
[ -n "$bad_dep" ]  && { echo "Deps naming unknown modules:$bad_dep"; fail=1; }
[ -n "$bad_wave" ] && { echo "Deps in the same or a later wave (breaks wave concurrency):$bad_wave"; fail=1; }

# 3) Cited contracts exist; existing contracts are cited by at least one module.
cited=""
while IFS= read -r row; do
  for c in $(row_field "$row" "[Cc]ontracts" | grep -oE '[0-9]{1,3}' || true); do
    cited="$cited $(norm3 "$c")"
  done
done <<EOF
$rows
EOF
cited="$(printf '%s\n' $cited | sort -u)"
have="$(find docs/contracts -maxdepth 1 -name '[0-9][0-9][0-9]-*.md' 2>/dev/null \
  | sed -E 's|.*/([0-9]{3})-.*|\1|' | sort -u)"
miss_file=""; orphan=""
for c in $cited; do printf '%s\n' "$have" | grep -qx "$c" || miss_file="$miss_file $c"; done
for c in $have;  do printf '%s\n' "$cited" | grep -qx "$c" || orphan="$orphan $c"; done
[ -n "$miss_file" ] && { echo "Modules cite contracts with no docs/contracts/ file:$miss_file"; fail=1; }
[ -n "$orphan" ]    && { echo "Contract files no module cites:$orphan"; fail=1; }

# 4) Contract guarantees: a contract with no CON-NNN-M ids is unverifiable by construction
#    (plan + full); every id must be exercised by a named integration test (full only).
testfiles="$(find tests/integration -type f 2>/dev/null | grep -v node_modules || true)"
no_ids=""; miss_test=""
for f in $(find docs/contracts -maxdepth 1 -name '[0-9][0-9][0-9]-*.md' 2>/dev/null); do
  ids="$(grep -oE 'CON-[0-9]+-[0-9]+' "$f" | sort -u || true)"
  [ -z "$ids" ] && { no_ids="$no_ids $(basename "$f")"; continue; }
  [ "$plan" -eq 1 ] && continue
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

# 5) Stale certification (full only): a checked-off module whose docs/certified.md recorded
#    contract hashes that no longer match docs/contracts/ was certified against revised
#    text — its certification is void until re-verified. Modules living in their own repos
#    (no modules/<name>/ dir here) are skipped; monorepo modules without a marker are noted.
if [ "$plan" -eq 0 ]; then
  shatool=""
  command -v sha256sum >/dev/null 2>&1 && shatool="sha256sum"
  [ -z "$shatool" ] && command -v shasum >/dev/null 2>&1 && shatool="shasum -a 256"
  stale=""; unmarked=""
  while IFS= read -r row; do
    printf '%s' "$row" | grep -qE '^- \[[xX]\]' || continue   # only certified (checked) rows
    mid="$(printf '%s' "$row" | sed -E 's/^- \[[ xX]\] (M[0-9]+).*/\1/')"
    name="$(printf '%s' "$row" | sed -E 's/^- \[[ xX]\] M[0-9]+ +([A-Za-z0-9_-]+).*/\1/')"
    [ -d "modules/$name" ] || continue
    cert="modules/$name/docs/certified.md"
    [ -f "$cert" ] || { unmarked="$unmarked $mid"; continue; }
    [ -z "$shatool" ] && continue
    for c in $(row_field "$row" "[Cc]ontracts" | grep -oE '[0-9]{1,3}' || true); do
      c="$(norm3 "$c")"
      cf="$(find docs/contracts -maxdepth 1 -name "${c}-*.md" 2>/dev/null | head -1)"
      [ -z "$cf" ] && continue
      cur="$($shatool "$cf" | awk '{print $1}')"
      rec="$(grep -E "^${c} sha256=" "$cert" | head -1 | sed 's/.*sha256=//')"
      [ -n "$rec" ] && [ "$rec" != "$cur" ] && stale="$stale $mid:contract-$c"
    done
  done <<EOF
$rows
EOF
  [ -n "$stale" ]    && { echo "Modules certified against since-revised contracts (re-verify):$stale"; fail=1; }
  [ -n "$unmarked" ] && echo "note: checked modules with no docs/certified.md marker (staleness unverifiable):$unmarked"
fi

if [ "$fail" -eq 0 ]; then
  [ "$plan" -eq 1 ] && echo "program-traceability (--plan): decomposition is structurally sound." \
                    || echo "program-traceability: every module, contract, and guarantee maps cleanly."
fi
exit $fail
