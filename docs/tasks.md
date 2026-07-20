# Build Plan: TinyLink

Derives from `docs/PRD.md` and `docs/workflows.md`. Tasks are ordered top to bottom so the
orchestrator can walk them in sequence: devops scaffold → database schema → backend
endpoints → frontend. Each task is scoped to a single reviewable diff, names the build
agent that owns it, cites the PRD acceptance criterion/criteria it satisfies, and lists its
task dependencies by id. Stack decisions (language, framework, ORM, hosting) are left to
`build-software-architect`'s ADRs; tasks below stay stack-agnostic while following the
CLAUDE.md conventions (Postgres, UTC, soft deletes for user-owned rows, email/password +
OAuth).

Two sequencing gaps the PRD/workflows left open were resolved per the assumption-ledger
policy and logged as ledger #18 (OAuth provider choice) and #19 (registration/provisioning
scope) — see `docs/assumptions.md`.

## Foundation

- [ ] T001 (build-devops) — Scaffold project structure: backend service, frontend app, and shared `config/` directory, with a root package manifest; wire `lint` and `test` scripts so CI gates have commands to call. · covers AC-24 · deps: none
- [ ] T002 (build-devops) — Add an environment/config layer for values that must never be hardcoded: `DATABASE_URL`, `SHORT_LINK_BASE_URL` (Ledger #15), `CODE_RETRY_MAX` (Ledger #12), redirect p95 latency threshold (AC-12), session secret, OAuth provider credentials (Ledger #18). · covers AC-8, AC-6, AC-12 · deps: T001
- [ ] T003 (build-devops) — Set up CI: run lint, unit tests, and a secrets scan on every push; apply pending DB migrations against a disposable test database before the test step. · covers AC-24 · deps: T001

## Database schema

- [ ] T004 (build-database) — Migration: `members` table (`id`, `email` unique, `password_hash` nullable, `created_at` timestamptz UTC) as the identity backing AC-2; `password_hash` stays nullable per Ledger #19 so OAuth-only members and future registration both fit without a later migration. · covers AC-2 · deps: T002, T003
- [ ] T005 (build-database) — Migration: `oauth_identities` table (`id`, `member_id` fk, `provider`, `provider_subject`, `created_at` UTC; unique on `(provider, provider_subject)`) linking members to OAuth accounts (Ledger #18: provider-agnostic columns). · covers AC-2 · deps: T004
- [ ] T006 (build-database) — Migration: `sessions` table (`id`, `member_id` fk, `created_at`, `expires_at`, all UTC) for server-side session tracking. · covers AC-2 · deps: T004
- [ ] T007 (build-database) — Migration: `links` table (`id`, `member_id` fk, `code` varchar(7) unique, `long_url` varchar(2048), `created_at` timestamptz UTC, `deleted_at` nullable timestamptz per soft-delete convention) with an index on `(member_id, created_at)` for list ordering. · covers AC-4, AC-6, AC-22, AC-23, AC-24 · deps: T004
- [ ] T008 (build-database) — Migration: `click_events` table (`id`, `link_id` fk, `created_at` timestamptz UTC), insert-only, indexed on `link_id` for count aggregation. · covers AC-13, AC-14, AC-22, AC-24 · deps: T007

## Backend — authentication

- [ ] T009 (build-backend) — Session helper: issue a session row plus an httpOnly session cookie on successful authentication; middleware that resolves the current member from a valid session (or none). · covers AC-2 · deps: T006
- [ ] T010 (build-backend) — `POST /auth/sign-in` (email/password): verify credentials against `members`, create a session via T009; on failure, return a generic "invalid email or password" error with no account enumeration and no session created (Ledger #14). · covers AC-2 · deps: T004, T009
- [ ] T011 (build-backend) — OAuth sign-in flow for the provider selected in Ledger #18: initiate redirect, handle callback, exchange for a provider identity, auto-provision a member on first login via `oauth_identities` (Ledger #19), create a session via T009; on provider error or user cancellation, return a generic "sign-in was not completed" notice with no partial session or account created (Ledger #14). · covers AC-2 · deps: T005, T009
- [ ] T012 (build-backend) — Auth-required middleware: requests to link-creation or link-list endpoints without a valid session get HTTP 401 and perform no create/read of link data. · covers AC-1 · deps: T009

## Backend — create a short link (G1)

- [ ] T013 (build-backend) — URL validator: reject empty, non-absolute, non-http(s)-scheme, or >2048-character URLs with HTTP 422 and create no link. · covers AC-5 · deps: T001
- [ ] T014 (build-backend) — Short-code generator: 7-character base62 (`[0-9A-Za-z]`) candidate generator behind a pluggable strategy (Ledger #1). · covers AC-4 · deps: T002
- [ ] T015 (build-backend) — `POST /links` create endpoint: require auth (T012), validate the URL (T013), generate and insert a code with retry-on-collision up to the configured max (Ledger #12) relying on the unique constraint from T007 as the source of truth, returning HTTP 503 with no row persisted if the retry budget is exhausted; each call is an independent insert, so repeated submissions of the same long URL each yield their own distinct link and click count. · covers AC-4, AC-6, AC-7 · deps: T007, T012, T013, T014
- [ ] T016 (build-backend) — Create-response shape: HTTP 201 body with short code, fully-qualified short URL (base host from config, Ledger #15), original long URL, and UTC `created_at`. · covers AC-8, AC-22 · deps: T015, T002

## Backend — redirect (G2)

- [ ] T017 (build-backend) — `GET /{code}`: short-circuit malformed codes (wrong length or characters outside `[0-9A-Za-z]`) with HTTP 404 before any DB lookup, recording no click. · covers AC-11, AC-15 · deps: T014
- [ ] T018 (build-backend) — Extend `GET /{code}`: look up an active (non-soft-deleted) link by code; respond HTTP 302 with `Location` set to the stored long URL unchanged, ignoring any query string/fragment on the request for lookup and not forwarding it (Ledger #17); respond HTTP 404 with no click recorded for a missing or soft-deleted code; no authentication required. · covers AC-9, AC-10, AC-11, AC-15, AC-23 · deps: T017, T007
- [ ] T019 (build-backend) — Click recording: on a successful redirect, insert exactly one `click_events` row with a UTC timestamp; a transient insert failure does not block or delay the 302 response. · covers AC-13, AC-16, AC-22 · deps: T018, T008
- [ ] T020 (build-backend) — Latency guard for the redirect path: instrument server time against the configured p95 threshold (default 100ms, from T002) so it can be measured and asserted under load. · covers AC-12 · deps: T018, T002

## Backend — view link list (G3)

- [ ] T021 (build-backend) — `GET /links` list endpoint: require auth (T012); return only the requester's own non-soft-deleted links (the `member_id`-scoped query never discloses another member's links or counts, satisfying the no-existence-disclosure rule for list/detail/count) with short code, short URL, long URL, `created_at`, and total click count aggregated from `click_events`. · covers AC-17, AC-21, AC-23, AC-3, AC-14 · deps: T012, T007, T008, T016
- [ ] T022 (build-backend) — Order list results by `created_at` descending (newest first). · covers AC-18 · deps: T021
- [ ] T023 (build-backend) — Paginate the list endpoint at 25/page with a stable page parameter: a member with no links or an out-of-range page gets HTTP 200 with an empty collection; a malformed or non-numeric/negative page normalizes to page 1 (Ledger #13). · covers AC-19, AC-20 · deps: T022

## Frontend

- [ ] T024 (build-frontend) — Sign-in page: email/password form plus OAuth button, wired to T010/T011; shows the API's generic error message on failure; on success, redirects to the validated in-app return-to target or the link list (Ledger #16). · covers AC-2 · deps: T010, T011
- [ ] T025 (build-frontend) — Route guard for member-only pages (create-link, link list): an unauthenticated visit redirects to sign-in with the requested page preserved as a validated in-app-only return-to parameter. · covers AC-1 · deps: T012, T024
- [ ] T026 (build-frontend) — Create-link page: form to submit a URL; renders the 422 validation message inline on failure; on success, renders the short code, short URL, long URL, and creation timestamp from T016's response. · covers AC-4, AC-5, AC-8 · deps: T016, T025
- [ ] T027 (build-frontend) — Link list/dashboard page: renders each link's short code, short URL, long URL, `created_at`, and click count (zero renders as `0`, never blank); explicit empty-state message when the member has no links yet. · covers AC-17, AC-20, AC-21 · deps: T021, T025
- [ ] T028 (build-frontend) — List ordering/pagination UI: displays results newest-first and wires a "load more"/next-page control to the page parameter at 25/page. · covers AC-18, AC-19 · deps: T027, T023
