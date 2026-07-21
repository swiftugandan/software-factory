#!/usr/bin/env bash
# Mirror the model-invoked helper scripts into the project's .claude/hooks/ so every
# reference to `.claude/hooks/<helper>.sh` works identically whether the factory was
# installed as a plugin or copied in by install.sh. Runs from SessionStart (plugin mode)
# and from /setup. Only touches its own named scripts; never deletes anything else.
# The guard hooks (ledger/approval/blind/factory-gate/run-log/inject-state) are NOT
# mirrored — in plugin mode those run from the plugin itself via hooks/hooks.json.
set -uo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${1:-.}/.claude/hooks"

helpers="log-assumption.sh approve-assumptions.sh mutation-probe.sh traceability.sh program-traceability.sh doctor.sh"

mkdir -p "$dest" 2>/dev/null || exit 0
for h in $helpers; do
  [ -f "$src/$h" ] || continue
  cmp -s "$src/$h" "$dest/$h" 2>/dev/null || cp "$src/$h" "$dest/$h" 2>/dev/null || true
  chmod +x "$dest/$h" 2>/dev/null || true
done
exit 0
