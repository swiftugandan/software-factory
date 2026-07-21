#!/usr/bin/env bash
# Lightweight secrets scan for CI (T003).
#
# No dedicated secret-scanning binary (gitleaks/trufflehog/detect-secrets) is available in
# this sandbox/proxy environment; this pattern-based scan plus a tracked-.env check is the
# reversible fallback (logged in docs/assumptions.md). Swapping in a real scanner later only
# means replacing this script's body — callers (scripts/ci.sh, .github/workflows/ci.yml) are
# unaffected.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

fail=0

echo "== secrets-scan: no committed .env file =="
# config/.env.example documents variable names with placeholder values only (ADR-0013); any
# other .env* path being tracked by git is a leak.
tracked_env="$(git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.[^.]*$)' | grep -v '\.env\.example$' || true)"
if [ -n "$tracked_env" ]; then
  echo "FAIL: .env file(s) are tracked by git:"
  echo "$tracked_env"
  fail=1
fi

echo "== secrets-scan: pattern scan of working tree =="
# Scan the full working tree (not just already-staged/committed files) so a secret is caught
# before it is ever committed, not just after.
common_excludes=(! -path './node_modules/*' ! -path './.git/*' ! -path './coverage/*' \
  ! -name 'package-lock.json' ! -path './config/.env.example' ! -name '.env' ! -name '.env.*')
all_files="$(find . -type f "${common_excludes[@]}")"
# tests/ intentionally assigns dummy values to SECRET/TOKEN-named env vars to exercise
# config/app.js's own validation (T002); exclude it from the generic keyword heuristic below,
# but not from the high-signal absolute patterns (a real key/token shape is never legitimate
# test fixture data).
non_test_files="$(printf '%s\n' "$all_files" | grep -Ev '(^|/)tests/' || true)"

# High-signal patterns (checked everywhere, including tests/): cloud access keys, PEM private
# keys, GitHub/Slack tokens -- these shapes are never legitimate fixture data.
HIGH_SIGNAL='AKIA[0-9A-Z]{16}'
HIGH_SIGNAL="$HIGH_SIGNAL|-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
HIGH_SIGNAL="$HIGH_SIGNAL|gh[pousr]_[A-Za-z0-9]{20,}"
HIGH_SIGNAL="$HIGH_SIGNAL|xox[baprs]-[A-Za-z0-9-]{10,}"

# Generic "SECRET/TOKEN/PASSWORD/API_KEY = <real-looking value>" assignment heuristic
# (checked outside tests/ only, to avoid flagging intentional test fixtures).
GENERIC="(SECRET|PASSWORD|TOKEN|API_KEY|APIKEY|PRIVATE_KEY)[A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9/+_=.-]{12,}['\"]"

if [ -n "$all_files" ]; then
  matches="$(printf '%s\n' "$all_files" | xargs -r grep -nEI "$HIGH_SIGNAL" -- 2>/dev/null || true)"
  if [ -n "$non_test_files" ]; then
    matches="$matches
$(printf '%s\n' "$non_test_files" | xargs -r grep -nEI "$GENERIC" -- 2>/dev/null || true)"
  fi
  matches="$(printf '%s\n' "$matches" | sed '/^$/d')"
  if [ -n "$matches" ]; then
    echo "FAIL: possible secret(s) found:"
    echo "$matches"
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "secrets-scan: FAILED"
  exit 1
fi

echo "secrets-scan: OK (no committed .env, no pattern matches)"
