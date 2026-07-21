#!/usr/bin/env bash
# PreToolUse hook on Write|Edit|MultiEdit. Guarantees the ledger file exists so no agent
# ever lacks a place to record a decision. Non-blocking: always exit 0.
# Scoped to factory projects so a globally-enabled plugin never creates files elsewhere.
set -uo pipefail
cat >/dev/null  # drain stdin

{ [ -d docs/BDD ] || [ -f docs/tasks.md ] || [ -f config/factory.json ]; } || exit 0

if [ ! -f docs/assumptions.md ]; then
  mkdir -p docs
  cat > docs/assumptions.md <<'HEADER'
# Assumptions Ledger

Every non-obvious decision the factory made instead of stopping to ask. Review the
`one-way` rows first — each names the flag or interface that lets you change it.

| # | Gap in source docs | Assumption made | Reversibility | BDD basis | Owner | Status |
|---|---|---|---|---|---|---|
HEADER
fi
exit 0
