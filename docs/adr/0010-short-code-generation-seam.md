# ADR-0010 — Short-code generation seam

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: implements approved Ledger #2; cheap Ledger #1, #12

## Context

AC-4 requires a 7-character base62 (`[0-9A-Za-z]`) code returned on create. AC-6 requires
retry-on-collision until unique, with the persisted code unique across all links. Ledger #1
(format behind config) is `cheap`; Ledger #2 (permanent uniqueness invariant) is `one-way`
and APPROVED; Ledger #12 caps retries (default 10) and returns 503 on exhaustion. Custom
user-chosen codes are a non-goal but the BDD flags them as a possible future addition, so the
generator must be pluggable without a schema change.

## Decision

- **Interface seam:** a `CodeGenerator` interface with `generate() -> string`, resolved from
  `config/link-generation.js`. The default strategy produces a 7-char string over the base62
  alphabet using `crypto.randomInt` (uniform, no modulo bias). Alphabet and length are config
  values, not literals.
- **Uniqueness is enforced by the database (ADR-0005):** `links.code UNIQUE`. Creation is
  generate → `INSERT` → on unique-violation (`23505`) regenerate and retry, up to
  `CODE_RETRY_MAX` (config, default 10). This is the AC-6 source of truth; no application
  lock or read-then-write (safe under WF-2 concurrency).
- **Exhaustion (Ledger #12):** hitting `CODE_RETRY_MAX` throws `RetryExhaustedError` → 503
  (ADR-0008); no row is persisted, and the uniqueness invariant is never weakened.
- **Codes are host-independent and immutable:** the stored value is just the code; the
  fully-qualified short URL is built at response time from `SHORT_LINK_BASE_URL` (ADR-0013,
  Ledger #15), so the base host can change per deployment without touching stored codes.
- **Custom-code seam only, no path:** because generation is an injected strategy, a future
  custom-code feature swaps/extends the strategy; no user-facing custom-code endpoint is
  built this release (PRD non-goal).

## Alternatives considered

- **Monotonic id encoded to base62 (Hashids/sqids).** Guarantees uniqueness with no retry,
  but leaks creation order/volume and couples the code to the internal id. Rejected;
  random + unique-constraint keeps codes opaque and the id private (ADR-0005).
- **Application-level pre-check `SELECT` before insert.** Racy (TOCTOU) and an extra query on
  the hot create path. Rejected in favor of insert-and-catch-`23505`.
- **Longer/shorter fixed code.** 7 base62 chars ≈ 3.5e12 space — ample headroom to keep the
  collision-retry rare at this scope; length stays config-adjustable.

## Consequences

- Collision handling is correct under concurrency by construction (unique index + retry).
- The 503 exhaustion path is testable (inject a generator that always collides) and never
  persists a row (AC-6 invariant intact).
- Generator and code shape are reversible via `config/link-generation.js`; existing codes are
  unaffected by future format changes.
