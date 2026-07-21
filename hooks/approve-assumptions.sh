#!/usr/bin/env bash
# Resolve one-way assumptions awaiting review. Used by /approve-assumptions.
#   approve-assumptions.sh --list                 show pending one-way rows
#   approve-assumptions.sh --approve N [N ...]     mark rows APPROVED
#   approve-assumptions.sh --reject  N --note "…"  mark REJECTED with a note
#   approve-assumptions.sh --approve-all           approve every pending row
set -uo pipefail
LEDGER="docs/assumptions.md"
[ -f "$LEDGER" ] || { echo "no ledger yet"; exit 0; }

case "${1:-}" in
  --list|"")
    echo "One-way assumptions awaiting review:"
    grep -nE '^\| [0-9]+ .*REVIEW \|$' "$LEDGER" | sed -E 's/^([0-9]+):\| ([0-9]+) \| (.*)/  #\2  \3/' || echo "  (none)"
    ;;
  --approve-all)
    sed -i 's/REVIEW |$/APPROVED |/' "$LEDGER"
    echo "all pending one-way assumptions approved"
    ;;
  --approve)
    shift
    for n in "$@"; do
      sed -i -E "s/^(\| $n \|.*)REVIEW \|$/\1APPROVED |/" "$LEDGER"
      echo "approved #$n"
    done
    ;;
  --reject)
    n="$2"; note=""
    shift 2
    [ "${1:-}" = "--note" ] && note="$2"
    sed -i -E "s/^(\| $n \|.*)REVIEW \|$/\1REJECTED |/" "$LEDGER"
    echo "rejected #$n — reopen this decision. Note: ${note:-none}"
    ;;
  *) echo "usage: approve-assumptions.sh --list | --approve N | --reject N --note '…' | --approve-all"; exit 1 ;;
esac
