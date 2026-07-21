# ADR-0013 — Configuration and secrets management

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: implements Ledger #12, #15; supports #18

## Context

Task T002 requires an env/config layer for values that must never be hardcoded:
`DATABASE_URL`, `SHORT_LINK_BASE_URL` (Ledger #15, AC-8), `CODE_RETRY_MAX` (Ledger #12,
AC-6), the redirect p95 latency threshold (AC-12), the session secret, and OAuth provider
credentials (Ledger #18). CLAUDE.md requires every irreversible choice to live behind a flag
in `config/` or an interface. The secrets-scan gate (T003) fails the build on any leaked
secret. Postgres uses peer auth on a socket locally, so the local DSN carries no password.

## Decision

- **12-factor env vars, one loader:** `config/app.js` reads `process.env`, validates required
  keys at startup (fail fast with a clear message if missing), coerces types, and exports a
  frozen config object. Application code imports the config object, never `process.env`
  directly.
- **No secret in source or in git.** Local/dev values come from a `.env` file loaded by
  `dotenv` (dev only) and from real environment variables in CI/prod. `.env` is gitignored; a
  committed `config/.env.example` documents every key with placeholder (non-secret) values.
- **Keys (initial set):**
  - `DATABASE_URL` — e.g. `postgresql:///tinylink` (socket peer auth; `tinylink_test` for CI).
  - `SHORT_LINK_BASE_URL` — base host for building fully-qualified short URLs (AC-8, #15).
  - `CODE_RETRY_MAX` — default `10` (AC-6, #12; consumed by ADR-0010).
  - `REDIRECT_P95_BUDGET_MS` — default `100` (AC-12); the threshold is config-backed so it is
    asserted, not hardcoded.
  - `SESSION_SECRET` — signs/derives session-id handling (ADR-0009).
  - `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GOOGLE_REDIRECT_URI`
    (Ledger #18) — required only when Google auth is enabled.
  - `PORT`, `NODE_ENV`.
- **Interface-seam config, separate from secrets:** non-secret reversible choices live as
  code modules under `config/` — `config/link-generation.js` (ADR-0010),
  `config/auth-providers.js` (ADR-0009) — reading their tunables from `config/app.js`. This
  keeps `one-way`/tunable decisions (retry cap, code shape, provider set, latency budget)
  flippable in one place, per CLAUDE.md.

## Alternatives considered

- **Hardcoded defaults in code.** Violates T002 and CLAUDE.md and risks leaked secrets.
  Rejected.
- **A committed JSON/YAML config with secrets inlined.** Would be caught by the secrets scan
  and is the anti-pattern. Rejected; secrets are env-only, structure is code.
- **A secrets manager (Vault/SSM).** No such external service is available or warranted at
  this scope. Env vars are the standard, portable choice. Rejected for now; `config/app.js`
  is the seam where a manager could be introduced later.

## Consequences

- The secrets-scan gate stays green because no secret is ever committed; `.env.example`
  documents the contract.
- Startup validation turns a missing/misconfigured secret into an immediate, obvious failure
  rather than a runtime surprise.
- Every reversible tunable (Ledger #12/#15/#18, AC-12) is centralized and flippable without a
  code change to call sites, satisfying the CLAUDE.md flag/interface rule.
