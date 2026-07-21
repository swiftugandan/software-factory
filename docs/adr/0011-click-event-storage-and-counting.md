# ADR-0011 — Click-event storage and counting

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: implements approved Ledger #4

## Context

AC-13 requires exactly one click event per successful redirect with a UTC timestamp; AC-14
requires a link's total to equal N after N redirects; AC-15 requires 404s to leave the total
unchanged; AC-16 requires the redirect to still succeed if click persistence fails
transiently (a missed count is acceptable, a missed redirect is not); AC-21 requires zero to
render as `0`. Ledger #4 (`one-way`, APPROVED) fixes click granularity as one row per click
in a `click_events` table (vs a bare counter). WF-3 requires concurrent redirects to neither
lose nor double-count.

## Decision

- **Storage (T008):** append-only `click_events (id, link_id, created_at timestamptz UTC)`,
  one row per successful redirect. No counter column on `links` (ADR-0005) — the count is
  derived, so there is no shared value to race (WF-3).
- **Recording:** after the link is resolved and the 302 is decided, insert one row. Insert,
  not read-increment-write, so concurrent redirects each add their own row (AC-13, AC-14).
- **Availability over accuracy (AC-16):** the redirect response does not depend on the insert
  committing. The handler serves the 302 and records the click such that a transient insert
  failure is caught/logged and does not block or delay the redirect. A 404 path records
  nothing (AC-11, AC-15).
- **Counting:** totals are computed by `COUNT(*)` over `click_events` grouped by `link_id`,
  joined into the list query (ADR-0012); links with no rows return `0` (AC-21), never
  null/blank.

## Alternatives considered

- **Denormalized `links.click_count` incremented per redirect.** O(1) reads, but a
  read-modify-write hot spot that can lose concurrent increments and duplicates truth.
  Rejected (WF-3, AC-14). Revisitable later behind the repository seam if list reads ever
  need it, without changing the event table.
- **Fire-and-forget to a queue/async worker.** Better decoupling of AC-16, but adds
  infrastructure this scope doesn't warrant and no external services are available. Rejected;
  a best-effort synchronous insert with a swallowed transient error meets AC-16.

## Consequences

- Click semantics are auditable (one row per click) and future per-click analytics (a
  non-goal now) could read the same rows without a migration.
- Counts are always consistent with recorded events; no counter drift.
- The event-row model is `one-way` (Ledger #4) — captured here so builders cite ADR-0011
  rather than re-choosing a counter.
