# Product Requirements: TinyLink

Derives from `docs/BDD/BDD-link-shortener.md`. Each acceptance criterion is written so a
test can assert it. Criteria cite the assumption ledger (`docs/assumptions.md`) where they
resolve a gap the BDD left open. IDs are stable; tasks and tests cite them.

## Goals

- G1. A signed-in member can turn a long URL into a short link and receive a short code.
- G2. Visiting `/{code}` redirects to the original long URL.
- G3. A member can see a list of their own links, each with its total click count.
- G4. Redirects feel fast (BDD: "Should feel fast").

## Non-goals

- Custom (user-chosen) short codes.
- Link expiry.
- Editing or deleting links through the UI (schema supports soft delete; no user-facing action this release).
- Per-click analytics beyond a total count (no referrer, geo, or time-series reporting).
- Anonymous link creation.

## Personas

- **Member** — an authenticated user. Creates links, and views and counts clicks on their own links only.
- **Visitor** — any unauthenticated agent (human or bot) that follows a short link. Can resolve `/{code}` but cannot create or view links.

## Acceptance criteria

### Authentication and ownership

- **AC-1** — Given an unauthenticated request to a link-creation or link-list endpoint, when it is made, then the system responds 401 (API) or redirects to sign-in (UI) and performs no create/read of link data. (Ledger #9)
- **AC-2** — Given a member authenticated via email/password or a supported OAuth provider, when they call a link endpoint, then the request is authorized and scoped to that member's identity. (Ledger #9)
- **AC-3** — Given a member requesting another member's link (list, detail, or count), when the link is not owned by the requester, then the system responds 404 and does not disclose the link's existence.

### Create a short link (G1)

- **AC-4** — Given an authenticated member submitting a valid absolute `http://` or `https://` URL of at most 2048 characters, when they create a link, then the system persists a link owned by that member and returns a 7-character base62 (`[0-9A-Za-z]`) short code with HTTP 201. (Ledger #1, #3)
- **AC-5** — Given a submitted URL that is empty, not absolute, uses a scheme other than http/https, or exceeds 2048 characters, when the member submits it, then the system responds 422 with a validation error and creates no link. (Ledger #3)
- **AC-6** — Given a generated candidate code that collides with an existing code, when the link is created, then the system retries generation until a unique code is stored; the persisted code is unique across all links (unique constraint enforced). (Ledger #1, #2)
- **AC-7** — Given a member who submits the same long URL more than once, when each submission is processed, then each produces a new, distinct link with its own code and its own independent click count. (Ledger #8)
- **AC-8** — Given a successful creation, when the response is returned, then it contains the short code, the fully-qualified short URL, the original long URL, and a UTC creation timestamp. (CLAUDE.md: UTC)

### Redirect (G2)

- **AC-9** — Given an existing, non-deleted code, when a visitor issues `GET /{code}`, then the system responds 302 Found with a `Location` header equal to the stored long URL. (Ledger #5, #6)
- **AC-10** — Given `GET /{code}`, when the request is made, then no authentication is required to resolve and follow the redirect. (Ledger #6)
- **AC-11** — Given a code that does not exist, is malformed, or belongs to a soft-deleted link, when `GET /{code}` is issued, then the system responds 404 and records no click. (Ledger #7, #11)
- **AC-12** — Given the redirect endpoint, when a p95 latency measurement is taken under nominal load, then a resolved redirect responds in under 100 ms server time (excludes network), satisfying "should feel fast" (threshold behind config). (BDD Notes)

### Click counting (G3)

- **AC-13** — Given a successful redirect (AC-9), when it completes, then exactly one click event is recorded for that link with a UTC timestamp. (Ledger #4)
- **AC-14** — Given N successful redirects for a link, when the member views that link's total, then the total click count equals N. (Ledger #4)
- **AC-15** — Given a request that returns 404 (AC-11), when it is processed, then the link's total click count is unchanged. (Ledger #7)
- **AC-16** — Given click recording fails transiently, when a redirect is served, then the visitor is still redirected (redirect availability is not blocked by count persistence); a missed count is acceptable, a missed redirect is not.

### View link list (G3)

- **AC-17** — Given an authenticated member, when they request their link list, then the response contains only links they own that are not soft-deleted, each with its short code, short URL, long URL, creation timestamp, and total click count. (Ledger #10, #11)
- **AC-18** — Given a member's link list, when it is returned, then links are ordered by creation time, newest first. (Ledger #10)
- **AC-19** — Given a member with more than 25 links, when they request the list, then results are paginated at 25 per page with a stable way to request subsequent pages. (Ledger #10)
- **AC-20** — Given a member who has created no links, when they request their list, then the system responds 200 with an empty collection (not an error). (Ledger #10)
- **AC-21** — Given a member's list containing a link with zero redirects, when it is returned, then that link's total click count is 0.

### Data and platform invariants

- **AC-22** — Given any persisted link or click event, when its timestamps are stored, then they are stored in UTC. (CLAUDE.md)
- **AC-23** — Given a link row, when it is created, then it carries a `deleted_at` column (nullable, null = active); all list and redirect reads exclude rows where `deleted_at` is set. (Ledger #11)
- **AC-24** — Given the datastore, when links and click events are persisted, then they are stored in Postgres. (CLAUDE.md)

## Out of scope

- Custom short codes (BDD Notes: "may add ... later"). Ledger seam: code generation is pluggable, but no user-facing custom-code path is built.
- Link expiry (BDD Notes: "may add ... later").
- User-facing link editing/deletion.
- Advanced click analytics (referrers, unique visitors, geography, time series).
- Rate limiting and abuse/malware URL scanning beyond scheme/length validation.
