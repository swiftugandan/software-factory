# Assumption Audit: TinyLink

Reviewer: refine-assumption-auditor · Date: 2026-07-20
Sources: `docs/BDD/BDD-link-shortener.md`, `docs/PRD.md`, `docs/workflows.md`,
`docs/tasks.md`, `docs/assumptions.md` (entries #1–#19).

This is the approval checkpoint. Read the three one-way rows below, then approve or redirect.

## Drift verdict: ALIGNED (with two onboarding decisions to confirm)

The BDD's whole intent is three behaviors: create a short link, redirect `/{code}`, and let
a member see their own links with total clicks. The 19 assumptions, taken together, still
build exactly that. The two named non-goals are held:

- **Custom codes — out of scope, preserved.** #1 makes the generator pluggable but PRD
  "Out of scope" and tasks build no user-facing custom-code path. Good.
- **Expiry — out of scope, preserved.** No column, endpoint, or workflow introduces it.

No assumption or combination expands the product past the BDD's narrow intent. The added
machinery (sessions, pagination, latency guard, click_events, soft-delete column) all serves
one of the three core behaviors or a CLAUDE.md convention — none invents a new feature.

Two places where accumulated defaults quietly shape the product beyond what the BDD says —
both worth a stakeholder glance, neither a scope break:

1. **Onboarding asymmetry (#18 + #19).** The BDD says only "signed-in users." The factory
   defaulted to *two* auth systems and *two different* onboarding rules: Google OAuth
   **auto-provisions** any new member on first login (open self-service signup), while
   email/password accounts exist **only** if an admin seeds them (no registration this
   release). The net effect: TinyLink is effectively "anyone with a Google account can sign
   up," which the BDD never stated and a stakeholder may not intend (invite-only? single
   org? email/password-only?). This is the single most likely thing a stakeholder would have
   answered differently — see the last section.
2. **Soft-delete surface (#11).** CLAUDE.md convention, not the BDD, added `deleted_at` plus
   the "soft-deleted → 404, excluded from lists" read behavior (AC-11, AC-23). Deletion
   stays out of scope with no UI, so this is contained, but it is convention-driven, not
   BDD-driven.

## One-way (load-bearing, irreversible) assumptions — REVIEW THESE FIRST

All three are correctly marked `Status: REVIEW` in the ledger; no Status fix was needed.
Each is behind a genuine data-model seam and each is expensive to reverse once code and data
depend on it.

| # | One-line | Why it is load-bearing / seam |
|---|---|---|
| **#2** | Short `code` carries a permanent global **unique constraint**; generation retries on collision | Every create path (AC-6, T007, T015) and every redirect lookup assume it. Reversing after links exist means reasoning about collisions retroactively. Seam: constraint + retry, cap in `config/link-generation`. |
| **#4** | Clicks are stored as **one row per click** in a `click_events` table (event granularity), not a bare counter | Counting (AC-13/14), concurrency safety (no read-increment-write race), and storage growth all flow from this. Switching to a counter later is a data migration + re-derivation. Seam: dedicated table. |
| **#11** | `links.deleted_at` **soft-delete column**; deletion out of scope this release but schema + all read filters assume it | Every list and redirect query filters on it (AC-11, AC-17, AC-23). Baked into indexes and query shape. Seam: nullable column, no UI. |

These three are what the human signs off before code is written. They are sound; the reason
to gate them is cost-of-reversal, not suspected error.

## Contradiction check: no hard conflicts

No two assumptions directly contradict each other, and none conflicts with a stated
convention. One **tension** worth noting (not a contradiction):

- **#18 vs #19** (see Drift #1). #19 declares "self-service registration is out of scope,"
  yet #18's OAuth auto-provisioning *is* self-service registration for anyone with a Google
  account. The two are internally consistent as written but present a split onboarding
  policy the BDD never chose. Flagged for the stakeholder, not for rejection.
- (No ADRs exist yet — `docs/adr/` is empty — so no assumption-vs-ADR conflict is possible
  at this checkpoint.)

## What a stakeholder would most likely have answered differently

**Ledger #19 (and its partner #18): who is allowed to become a member?** The factory quietly
decided open Google signup + no email/password registration. A stakeholder shipping an
internal or invite-only link shortener would very likely have said "email/password only,"
"invite-only," or "our SSO," not "open Google signup." Because this shapes the product's
entire user boundary, confirm it now even though both rows are logged as `cheap`.

## Recommendation

- **Approve** one-way rows **#2, #4, #11** — sound, correctly seamed, correctly marked
  REVIEW. No ledger Status change was required.
- **Confirm intent** on the onboarding policy behind **#18/#19** before build. It is logged
  `cheap`/`ok`, but it silently sets who can use TinyLink. If the answer is "not open Google
  signup," redirect now: it is cheap in schema (nullable `password_hash` already planned) but
  expensive in rework if discovered after the auth tasks (T009–T012, T024) ship.
- No rows recommended for rejection on scope grounds. Custom codes and expiry remain out of
  scope; core intent is intact.
