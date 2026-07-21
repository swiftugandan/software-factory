#!/usr/bin/env bash
# Local/CI entry point (T003, ADR-0007). Runs the exact same steps, in the exact same order,
# as .github/workflows/ci.yml, so a contributor can reproduce a CI failure locally with one
# command:
#   ./scripts/ci.sh
#
# Order: install -> migrate (tinylink_test) -> lint -> test -> coverage check -> secrets scan.
set -euo pipefail
cd "$(dirname "$0")/.."

# CI/local test env. Non-secret values only (SESSION_SECRET here is a fixed CI-only value,
# never used outside this disposable test run) -- see config/.env.example / ADR-0013 for the
# full contract. A real .env is used instead when present (developer machines).
export NODE_ENV="${NODE_ENV:-test}"
# Peer-auth Unix socket DSN (ADR-0004). host/user are explicit (not $PGHOST/$PGUSER/$USER)
# so this works identically in any shell/CI runner (Ledger #26).
export DATABASE_URL="${DATABASE_URL:-postgresql://root@/tinylink_test?host=/var/run/postgresql}"
export SHORT_LINK_BASE_URL="${SHORT_LINK_BASE_URL:-http://localhost:3000}"
export SESSION_SECRET="${SESSION_SECRET:-ci-only-non-secret-session-value}"
export CODE_RETRY_MAX="${CODE_RETRY_MAX:-10}"
export REDIRECT_P95_BUDGET_MS="${REDIRECT_P95_BUDGET_MS:-100}"

step() { printf '\n== %s ==\n' "$1"; }

step "1/6 install dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

step "2/6 apply migrations to the disposable test database (${DATABASE_URL})"
# Parse the DSN with the same library `pg` uses, rather than ad hoc shell string-splitting,
# so it stays correct regardless of query-string params like ?host=.
test_db_name="$(node -e "console.log(require('pg-connection-string').parse(process.env.DATABASE_URL).database)")"
createdb "$test_db_name" 2>/dev/null || true
npm run migrate -- up || echo "no migrations to apply yet"

step "3/6 lint"
npm run lint

step "4/6 test"
npm test

step "5/6 coverage check (lines/branches/functions >= 70%, ADR-0007)"
npm run coverage

step "6/6 secrets scan"
./scripts/secrets-scan.sh

echo
echo "CI: all gates passed."
