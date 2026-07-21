#!/usr/bin/env bash
# Preflight: confirm the factory's dependencies are present. Run once after install/setup.
# Usage: bash .claude/hooks/doctor.sh   (checks the project in the current directory)
ok=0
check() { if command -v "$1" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  MISS $1 — $2"; ok=1; fi; }
echo "Factory preflight:"
check jq   "hooks degrade without it but are less precise; install via apt/brew"
check node "needed if you build a JS/TS project + run npm test gates"
check git  "recommended for commit-per-task discipline"
if [ -x .claude/hooks/log-assumption.sh ]; then
  echo "  ok   helper scripts present and executable (.claude/hooks/)"
else
  echo "  MISS .claude/hooks/log-assumption.sh — plugin mode: run /software-factory:setup (or restart the session); copy-in mode: re-run install.sh or chmod +x .claude/hooks/*.sh"
  ok=1
fi
[ -d docs/BDD ] && echo "  ok   docs/BDD/ exists" || { echo "  MISS docs/BDD/ — create it and add your BDD"; ok=1; }
echo
[ "$ok" = 0 ] && echo "Ready. Add your BDD to docs/BDD/ and run /factory." || echo "Resolve the MISS lines above, then re-run."
exit $ok
