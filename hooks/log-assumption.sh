#!/usr/bin/env bash
# Append a structured row to docs/assumptions.md. Creates the file + header if missing.
# Usage:
#   log-assumption.sh --gap "..." --assumption "..." \
#                     --reversibility one-way|cheap --basis "BDD 4.2" --owner agent-name
set -euo pipefail

LEDGER="docs/assumptions.md"
gap="" assumption="" reversibility="" basis="" owner=""

while [ $# -gt 0 ]; do
  case "$1" in
    --gap)           gap="$2"; shift 2 ;;
    --assumption)    assumption="$2"; shift 2 ;;
    --reversibility) reversibility="$2"; shift 2 ;;
    --basis)         basis="$2"; shift 2 ;;
    --owner)         owner="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$gap" ] || [ -z "$assumption" ] || [ -z "$reversibility" ]; then
  echo "log-assumption: --gap, --assumption, and --reversibility are required" >&2
  exit 1
fi
case "$reversibility" in
  one-way|cheap) ;;
  *) echo "log-assumption: --reversibility must be 'one-way' or 'cheap'" >&2; exit 1 ;;
esac

mkdir -p docs
if [ ! -f "$LEDGER" ]; then
  cat > "$LEDGER" <<'HEADER'
# Assumptions Ledger

Every non-obvious decision the factory made instead of stopping to ask. Review the
`one-way` rows first — each names the flag or interface that lets you change it.

| # | Gap in source docs | Assumption made | Reversibility | BDD basis | Owner | Status |
|---|---|---|---|---|---|---|
HEADER
fi

# Next row number = existing data rows + 1
n=$(grep -cE '^\| [0-9]+ \|' "$LEDGER" || true)
n=$((n + 1))
status="ok"
[ "$reversibility" = "one-way" ] && status="REVIEW"

# Escape pipes so the table stays valid
esc() { printf '%s' "$1" | sed 's/|/\\|/g'; }
printf '| %s | %s | %s | %s | %s | %s | %s |\n' \
  "$n" "$(esc "$gap")" "$(esc "$assumption")" "$reversibility" \
  "$(esc "${basis:-—}")" "$(esc "${owner:-—}")" "$status" >> "$LEDGER"

echo "logged assumption #$n ($reversibility)"
