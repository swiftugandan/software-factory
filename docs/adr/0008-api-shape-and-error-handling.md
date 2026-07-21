# ADR-0008 — API shape and error handling

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: —

## Context

The PRD specifies exact HTTP statuses per behavior: 201 create (AC-4), 422 validation
(AC-5), 401 unauthenticated API (AC-1), 404 not-found / not-owned / soft-deleted (AC-3,
AC-11), 503 retry-exhausted (AC-6/Ledger #12), 302 redirect (AC-9), 200 list incl. empty
(AC-20). AC-3 requires non-owned links to be indistinguishable from non-existent (404, never
403). Builders need one consistent request/response and error contract so each endpoint
doesn't invent its own.

## Decision

- **Style:** REST-ish JSON over HTTP, plus the public redirect and the server-rendered pages
  (ADR-0003). JSON request/response bodies are `application/json`; browser form posts are
  handled by the same services and rendered/redirected.
- **Endpoints (fixed):**
  - `POST /auth/sign-in` — email/password (AC-2)
  - `GET /auth/oauth/:provider` and `GET /auth/oauth/:provider/callback` — OAuth (AC-2)
  - `POST /auth/sign-out`
  - `POST /links` — create (AC-4) → 201
  - `GET /links?page=N` — list (AC-17..AC-21) → 200
  - `GET /:code` — public redirect (AC-9) → 302; registered last so it can't shadow the
    reserved prefixes above.
- **Success bodies:** create returns `{ code, short_url, long_url, created_at }` (AC-8);
  list returns `{ links: [...], page, page_size: 25, has_next }` (AC-19). Timestamps are
  ISO-8601 UTC (`Z`).
- **Error body (uniform):** `{ "error": { "code": "<machine_code>", "message": "<human>" } }`.
  Codes: `unauthenticated` (401), `not_found` (404), `validation_error` (422 — includes a
  `fields` array), `retry_exhausted` (503).
- **Status mapping is exhaustive and centralized:** handlers throw typed domain errors
  (`ValidationError`, `NotFoundError`, `UnauthenticatedError`, `RetryExhaustedError`); a
  single Express error middleware (ADR-0002) maps each to its status + body. Unmapped errors
  → 500 with a generic body and no internal detail leaked.
- **Ownership / disclosure:** a link the requester does not own returns the same
  `not_found` 404 as a missing link (AC-3). No 403 is ever returned for links.
- **Reserved-prefix safety:** the `:code` route only matches strings of the exact code
  shape (ADR-0010); malformed codes 404 before any DB lookup (AC-11, T017).

## Alternatives considered

- **RFC 7807 problem+json.** More standard but heavier than a four-endpoint app needs; the
  reality checker asserts statuses and a simple shape. Rejected for simplicity, but the
  centralized mapper makes adopting it later a one-file change.
- **403 for not-owned resources.** Directly violates AC-3's no-existence-disclosure rule.
  Rejected.

## Consequences

- One error-mapping seam means every endpoint's status behavior is consistent and testable
  against the PRD; adding an endpoint means throwing the right domain error, nothing else.
- The redirect (302, AC-9) and validation (422, AC-5) contracts are pinned, so builders and
  the adversarial tester share one source of truth.
