#!/usr/bin/env bash
# Mutation smoke test. Injects small faults into implementation files one at a time and
# confirms the test suite catches each. Surviving mutants mean the tests are hollow — green
# but not proving anything. No external mutation tool required.
#
# Usage: mutation-probe.sh [--test-cmd "npm test"] [--threshold 0.8] [--max 20]
# Reads defaults from config/factory.json. Exit 0 if kill-rate >= threshold, else 1.
set -uo pipefail

cfg="config/factory.json"
getcfg() { # getcfg <jq-path> <fallback>
  if command -v jq >/dev/null 2>&1 && [ -f "$cfg" ]; then
    v="$(jq -r "$1 // empty" "$cfg" 2>/dev/null)"; [ -n "$v" ] && { echo "$v"; return; }
  fi
  echo "$2"
}

TEST_CMD=""; THRESHOLD=""; MAX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --test-cmd) TEST_CMD="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -z "$TEST_CMD" ]  && TEST_CMD="$(getcfg '.testCommand' '')"
[ -z "$TEST_CMD" ]  && { [ -f package.json ] && TEST_CMD="npm test --silent" || TEST_CMD="pytest -q"; }
[ -z "$THRESHOLD" ] && THRESHOLD="$(getcfg '.mutation.threshold' '0.8')"
[ -z "$MAX" ]       && MAX="$(getcfg '.mutation.maxMutants' '20')"

targets="$(getcfg '.mutation.targets | join(" ")' 'src lib app')"

# Collect implementation files (exclude tests).
files=""
for d in $targets; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do files="$files$f"$'\n'; done < <(
    find "$d" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.jsx' -o -name '*.tsx' -o -name '*.py' \) \
      | grep -vE '\.(test|spec)\.|/__tests__/|(^|/)tests?/'
  )
done
files="$(printf '%s' "$files" | sed '/^$/d')"
[ -z "$files" ] && { echo "mutation-probe: no implementation files under: $targets — skipping"; exit 0; }

run_tests() { eval "$TEST_CMD" >/dev/null 2>&1; }

echo "mutation-probe: baseline run ($TEST_CMD)"
run_tests || { echo "mutation-probe: suite is RED before mutation — fix that first"; exit 1; }

# Mutation catalog: "pattern::replacement". Delimiter :: never appears in the operators, and
# patterns are space-padded to reduce false hits.
catalog=(
  " === :: !== "  " !== :: === "  " == :: != "
  " && :: || "    " || :: && "
  " > :: <= "      " < :: >= "      " >= :: < "      " <= :: > "
  "true::false"   "false::true"
)

# Build a mutant list: file:line:pattern:replacement (tab-separated to survive spaces)
mutants=()
while IFS= read -r f; do
  for entry in "${catalog[@]}"; do
    pat="${entry%%::*}"; rep="${entry##*::}"
    while IFS= read -r ln; do
      [ -n "$ln" ] && mutants+=("$f"$'\t'"$ln"$'\t'"$pat"$'\t'"$rep")
    done < <(grep -nF -- "$pat" "$f" 2>/dev/null | cut -d: -f1)
  done
done <<< "$files"

total=${#mutants[@]}
[ "$total" -eq 0 ] && { echo "mutation-probe: no mutable sites found — treat as inconclusive pass"; exit 0; }

# Cap and sample deterministically (take an even stride so it's not all one file).
if [ "$total" -gt "$MAX" ]; then
  stride=$(( total / MAX )); [ "$stride" -lt 1 ] && stride=1
  sampled=(); i=0
  while [ ${#sampled[@]} -lt "$MAX" ] && [ $i -lt $total ]; do sampled+=("${mutants[$i]}"); i=$((i+stride)); done
  mutants=("${sampled[@]}")
fi

applied=0; killed=0; survivors=()
for m in "${mutants[@]}"; do
  IFS=$'\t' read -r f ln pat rep <<< "$m"
  cp "$f" "$f.mutbak"
  # Escape & (special in sed replacement); use # as delimiter (absent from the operators).
  rep_esc="${rep//&/\\&}"
  sed -i "${ln}s#${pat}#${rep_esc}#" "$f"
  applied=$((applied+1))
  if run_tests; then
    survivors+=("$f:$ln  '$pat' -> '$rep'  survived")
  else
    killed=$((killed+1))
  fi
  mv "$f.mutbak" "$f"
done

# integer percentage to avoid needing bc
score_pct=$(( killed * 100 / applied ))
thr_pct=$(awk "BEGIN{printf \"%d\", $THRESHOLD*100}")
echo "mutation-probe: killed $killed / $applied  (${score_pct}%, threshold ${thr_pct}%)"

if [ "$score_pct" -lt "$thr_pct" ]; then
  echo "HOLLOW TESTS — these injected faults were not caught:"
  printf '  - %s\n' "${survivors[@]}"
  echo "The suite is green but does not prove the behavior. Strengthen the tests (route to gate-test-automation / gate-adversarial-tester)."
  exit 1
fi
exit 0
