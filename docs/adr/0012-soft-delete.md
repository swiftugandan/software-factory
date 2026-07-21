# ADR-0012 — Soft delete for links

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: implements approved Ledger #11

## Context

CLAUDE.md mandates soft deletes for user-owned rows. The BDD does not mention deletion;
user-facing delete is a non-goal this release, but AC-23 requires a nullable `deleted_at` on
`links` (null = active) and requires all list and redirect reads to exclude rows where
`deleted_at` is set. AC-11 requires a soft-deleted code to resolve to 404, indistinguishable
from "never existed". Ledger #11 (`one-way`, APPROVED) records this as a data-model decision.

## Decision

- **Column (T007):** `links.deleted_at timestamptz NULL`; `NULL` means active. Only `links`
  (the user-owned aggregate) carries it; `click_events` and `sessions` are append-only /
  operational and do not (ADR-0005).
- **Read filter is centralized:** the links repository (ADR-0004) applies
  `WHERE deleted_at IS NULL` on every read path — redirect lookup (AC-9/AC-11/AC-23) and
  owner list (AC-17/AC-23). Handlers never query links without going through the repository,
  so no path can accidentally surface a deleted link.
- **Redirect of a soft-deleted code → 404, no click (AC-11, AC-15):** the filtered lookup
  misses, so it is treated exactly like a nonexistent code (no existence disclosure).
- **No user-facing delete this release:** there is no delete endpoint or UI (PRD non-goal).
  The column and read filter exist so the capability can be turned on later behind a new
  endpoint without a migration or a change to read semantics.

## Alternatives considered

- **Hard delete (`DELETE FROM links`).** Violates CLAUDE.md and would cascade/restrict
  against `click_events`; loses history irreversibly. Rejected.
- **Separate `deleted_links` archive table.** More moving parts and a two-place read story
  for zero current benefit. Rejected; a nullable timestamp column is the standard soft-delete.
- **A boolean `is_deleted` flag.** Loses the "when" and is no simpler. Rejected in favor of
  `deleted_at` (also gives an audit timestamp for free).

## Consequences

- All active-row reads funnel through one filter, so AC-23 holds uniformly and is testable
  by inserting a `deleted_at` row and asserting list-exclusion + redirect-404.
- This is a `one-way` data-model choice (Ledger #11); recorded here so builders cite
  ADR-0012. Enabling deletion later is additive (a new endpoint), not a migration.
