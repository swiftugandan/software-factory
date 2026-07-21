# ADR-0005 — Schema conventions

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #23

## Context

Tasks T004–T008 define five tables. CLAUDE.md mandates UTC timestamps and soft deletes for
user-owned rows. AC-6 requires code uniqueness enforced by a constraint; AC-22 requires UTC;
AC-23 requires a nullable `deleted_at`; AC-18/AC-19 require newest-first ordering and
pagination; AC-14 requires click counts. These need consistent, stated conventions so every
migration looks the same and builders never re-decide id/type/naming.

## Decision

- **Identifiers:** every table has `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. The
  short `code` is a separate, externally visible business key (ADR-0010), not the PK. Internal
  ids are never exposed in URLs or API bodies.
- **Naming:** `snake_case` tables (plural) and columns; foreign keys named `<referenced>_id`.
- **Timestamps:** all time columns are `timestamptz`, written as UTC (`now()` at UTC / app
  passes UTC). `created_at timestamptz NOT NULL DEFAULT now()`. Satisfies AC-22.
- **Soft delete (user-owned rows):** `links.deleted_at timestamptz NULL` (null = active).
  All list and redirect reads filter `deleted_at IS NULL` (AC-23, ADR-0012). Append-only
  tables (`click_events`, `sessions`) do not get `deleted_at`.
- **Foreign keys:** `ON DELETE RESTRICT` (soft delete is the only removal path; hard deletes
  are not part of this release).
- **Uniqueness / indexes:**
  - `links.code` — `UNIQUE` (AC-6 invariant, ADR-0010).
  - `links (member_id, created_at DESC)` — index for owner-scoped newest-first listing
    (AC-17, AC-18, AC-19).
  - `oauth_identities (provider, provider_subject)` — `UNIQUE` (Ledger #18).
  - `members.email` — `UNIQUE`; `members.password_hash` NULLABLE (Ledger #19).
  - `click_events (link_id)` — index for count aggregation (AC-14).

## Alternatives considered

- **UUID primary keys.** Useful when ids are exposed or generated client-side; here the
  external key is the short code, so a UUID PK adds width and index cost for no gain.
  Rejected in favor of bigint identity.
- **Storing a denormalized `click_count` on `links`.** Faster reads, but read-modify-write
  races (WF-3 concurrency) and it duplicates truth. Rejected: counts are derived from
  `click_events` rows (ADR-0011). Revisitable behind the repository if reads ever need it.
- **`timestamp` (no tz) with an app convention.** Rejected; `timestamptz` makes UTC explicit
  and unambiguous per AC-22.

## Consequences

- Migrations are uniform and mechanical to review.
- Changing the PK type after data exists would require a migration — treated as a one-way
  aspect, but there is no data yet and internal ids are not externally coupled, so the risk
  is contained.
- The unique `code` constraint is the concurrency source of truth for AC-6 (ADR-0010), not
  application-level locking.
