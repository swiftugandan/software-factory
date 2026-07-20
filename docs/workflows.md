# Workflows: TinyLink

Derives from `docs/PRD.md` and `docs/BDD/BDD-link-shortener.md`. Every path a member,
visitor, or the system itself can take through the four core behaviors (sign in, create
short link, redirect visit, view link list), including the branches the BDD leaves
unstated. Each step cites the PRD acceptance criterion (`AC-N`) it serves. Branches that
required a product decision the source docs didn't make are marked **[ASSUMPTION #N]**
and are recorded in `docs/assumptions.md`.

Legend: `member` = authenticated user, `visitor` = unauthenticated agent, `system` =
server-side actor (API, background retry, etc).

---

## WF-1 Sign in

**Trigger:** an unauthenticated user opens the app, or is bounced here by an
unauthenticated request to a member-only page (see WF-5).

### WF-1a Happy path — email/password
1. Visitor opens sign-in page.
2. Visitor submits email + password.
3. System validates credentials, creates a session. — *AC-2*
4. System redirects to the link list, or to the originally requested page if one exists.
   — *AC-2* **[ASSUMPTION #16]**

### WF-1b Happy path — OAuth
1. Visitor selects a supported OAuth provider.
2. Visitor authenticates with the provider and grants consent.
3. Provider redirects back with an authorization result; system exchanges it for an
   identity and creates a session, scoped to that member. — *AC-2*
4. System redirects to the link list, or to the originally requested page. — *AC-2*
   **[ASSUMPTION #16]**

### Unhappy branches
- **Wrong password / unknown email.** System re-renders sign-in with a generic
  "invalid email or password" message; no account enumeration; no session created.
  — *AC-2 (failure case)* **[ASSUMPTION #14]**
- **OAuth provider error or user cancels consent.** System returns to sign-in with a
  generic "sign-in was not completed, try again" notice; no partial session or account
  is created. — *AC-2 (failure case)* **[ASSUMPTION #14]**
- **Double-submit of the sign-in form.** Second submission is processed independently;
  at most one session results per successful attempt (later attempts either no-op on an
  existing valid session or authenticate again). No PRD criterion at risk — sign-in is
  idempotent by construction (session creation, not resource creation).
- **Already-authenticated member re-visits sign-in.** System redirects straight to the
  link list (or pending return-to) without re-prompting. Least-surprise UX; not a
  distinct PRD criterion.

---

## WF-2 Create a short link

**Trigger:** an authenticated member submits a long URL via the creation form/API.

### WF-2a Happy path
1. Member (authenticated per AC-2) submits an absolute `http(s)://` URL ≤ 2048 chars.
   — *AC-4*
2. System generates a candidate 7-char base62 code. — *AC-4*
3. System attempts to persist a link row owned by the member with that code. — *AC-4*
4. System returns HTTP 201 with short code, fully-qualified short URL (built from the
   configured base host, *AC-8* **[ASSUMPTION #15]**), original long URL, and a UTC
   creation timestamp. — *AC-8, AC-22*

### Unhappy / edge branches
- **Unauthenticated request.** HTTP 401 (API) or redirect to sign-in with return-to set
  to the creation page (UI); no link is created. — *AC-1* **[ASSUMPTION #16]**
- **Empty URL.** HTTP 422, validation error, no link created. — *AC-5*
- **Not absolute (relative path, missing scheme).** HTTP 422, no link created. — *AC-5*
- **Scheme other than http/https** (`javascript:`, `ftp:`, `mailto:`, etc). HTTP 422, no
  link created. — *AC-5*
- **URL exceeds 2048 characters.** HTTP 422, no link created. — *AC-5*
- **Candidate code collides with an existing code.** System retries generation
  transparently to the member; the member sees only the final successful 201. — *AC-6*
- **Collisions exhaust the retry budget** (pathological contention / code-space
  pressure). System returns HTTP 503 with a generic "try again" error; no row is
  persisted; the AC-6 uniqueness invariant is never compromised. — *AC-6*
  **[ASSUMPTION #12]**
- **Same member submits the same long URL twice** (including a genuine double-click
  double-submit of the form). Each submission independently produces a new link with
  its own code and its own zero-based click count; no dedupe, no idempotency key. —
  *AC-7* (this is explicit PRD behavior, not a gap)
- **Two members (or the same member from two tabs) create links at the same instant.**
  Each creation is an independent insert; the unique constraint on `code` plus retry-on-
  collision (WF-2a step 2) guarantees both succeed with distinct codes even if their
  candidate codes happened to collide with each other. — *AC-6*
- **Client disconnects / times out after the server persisted the row but before the
  201 response arrives.** The link still exists; a member-initiated retry behaves per
  AC-7 (produces a second, distinct link) rather than silently duplicating state
  invisibly — this is intentional, not a special case.

---

## WF-3 Redirect visit

**Trigger:** any agent (member or visitor, signed in or not) issues `GET /{code}`.

### WF-3a Happy path
1. Visitor (no auth required — *AC-10*) requests `GET /{code}`.
2. System looks up an active (non-soft-deleted) link by code. — *AC-9, AC-23*
3. System responds 302 Found with `Location` set to the stored long URL, unchanged
   (query string/fragment on the request is not appended). — *AC-9* **[ASSUMPTION #17]**
4. System records exactly one click event with a UTC timestamp for that link. — *AC-13,
   AC-22*
5. p95 server time for a resolved redirect is under 100ms (config-backed threshold). —
   *AC-12*

### Unhappy / edge branches
- **Code does not exist.** HTTP 404; no click recorded. — *AC-11, AC-15*
- **Code is malformed** (wrong length, characters outside `[0-9A-Za-z]`). HTTP 404; no
  click recorded; system may short-circuit before a DB lookup as a performance optimization
  in service of AC-12, but the observable contract is the same 404. — *AC-11, AC-15*
- **Code belongs to a soft-deleted link** (`deleted_at` set). HTTP 404, indistinguishable
  from "never existed"; no click recorded. — *AC-11, AC-15, AC-23*
- **Query string or fragment appended to the short URL** (e.g. `/{code}?utm=x`). Ignored
  for lookup; not forwarded to the destination. — **[ASSUMPTION #17]**
- **Click-event persistence fails transiently** (e.g. DB hiccup) after the link was
  found. The 302 redirect is still served to the visitor; the miss on the count is
  accepted rather than blocking or delaying the redirect. — *AC-16*
- **Two visitors hit the same code simultaneously.** Each request resolves
  independently; each records its own click-event row (insert, not read-increment-write),
  so concurrent redirects cannot lose or double-count each other's clicks. — *AC-13,
  AC-14*
- **Destination long URL is itself unreachable, broken, or malicious.** Out of scope —
  TinyLink redirects to the stored URL as-is; no reachability check or malware scan is
  performed. — *PRD Out of scope (rate limiting / URL scanning)*

---

## WF-4 View link list

**Trigger:** an authenticated member requests their link list (dashboard load, page
navigation, or "load more").

### WF-4a Happy path
1. Member (authenticated per AC-2) requests their link list. — *AC-17*
2. System returns only that member's own, non-soft-deleted links. — *AC-17, AC-23*
3. Each entry includes short code, short URL, long URL, creation timestamp, and total
   click count. — *AC-17, AC-21*
4. Links are ordered newest-first by creation time. — *AC-18*
5. Results are paginated at 25/page with a stable next-page mechanism. — *AC-19*

### Unhappy / edge branches
- **Unauthenticated request.** HTTP 401 (API) or redirect to sign-in with return-to set
  to the list page (UI); no read of link data occurs. — *AC-1* **[ASSUMPTION #16]**
- **Member has created no links.** HTTP 200 with an empty collection — not an error,
  not a 404. UI renders an explicit empty-dashboard state (e.g. "no links yet, create
  your first one") rather than a blank screen. — *AC-20*
- **Member A requests member B's link** (by direct link-detail id, if such an endpoint
  exists, or by tampering with a list request). System responds 404 and does not
  disclose that the link exists at all (not 403 — existence itself is not confirmed to a
  non-owner). — *AC-3*
- **Member has more than 25 links.** List is paginated; requesting the next page returns
  links 26–50, still newest-first. — *AC-19*
- **Page parameter is out of range** (beyond the last page). HTTP 200 with an empty
  collection, consistent with the AC-20 empty-is-not-an-error precedent. — *AC-19, AC-20*
  **[ASSUMPTION #13]**
- **Page parameter is malformed** (non-numeric, negative). Normalized to page 1 rather
  than erroring. — *AC-19* **[ASSUMPTION #13]**
- **A listed link has zero redirects.** Its click count renders as `0`, not blank/null/
  omitted. — *AC-21*
- **List is requested mid-creation of a new link by the same member (race between
  WF-2 and WF-4).** No special handling: the new link either is or isn't in the result
  depending on whether its insert committed before the list query ran; no partial or
  torn row is ever visible (insert is atomic; AC-4). Not a distinct criterion — ordinary
  read/write ordering.

---

## WF-5 Unauthenticated access to a member-only page/endpoint (cross-cutting)

**Trigger:** any request to link creation or link list (UI page or API endpoint) with no
valid session/token.

1. System detects missing/invalid/expired credentials.
2. **API:** responds HTTP 401; performs no create or read of link data. — *AC-1*
3. **UI:** redirects to sign-in, preserving the originally requested page as a
   validated in-app return-to target so the member lands back there after
   authenticating. — *AC-1* **[ASSUMPTION #16]**
4. Redirect (`GET /{code}`) is explicitly exempt from this workflow — it is always
   public regardless of session state. — *AC-10*

---

## Concurrency summary

| Scenario | Mechanism that resolves it | PRD criterion |
|---|---|---|
| Two links created at the same instant, candidate codes collide | Unique constraint on `code` + generate-and-retry-on-conflict, not read-then-write | AC-6 |
| Two visitors redirect through the same code at the same instant | Each redirect inserts its own click-event row; no shared counter to race | AC-13, AC-14 |
| Member re-submits create form twice (double-click or client retry after timeout) | No idempotency key; each submission is a legitimate distinct link per AC-7 | AC-7 |
| List query races a concurrent create by the same member | Ordinary atomic insert visibility; no torn reads | AC-4, AC-17 (implied) |

---

## Gaps found and how they were resolved

All were product-shaped (reversible, no industry-standard default in the BDD/PRD) and
resolved via the assumption-ledger policy rather than halting the run. Full detail in
`docs/assumptions.md`.

| Ledger # | Gap | Resolution |
|---|---|---|
| 12 | No bound on collision-retry attempts (AC-6) | Configurable cap (default 10); exhaustion returns 503, no row persisted |
| 13 | No behavior for invalid/out-of-range pagination params (AC-19) | Out-of-range → empty 200; malformed → normalize to page 1 |
| 14 | No sign-in failure paths defined (AC-2) | Generic invalid-credentials / sign-in-not-completed messages, no enumeration, no partial session |
| 15 | No short-URL host/domain named (AC-8) | Configurable base host, environment-specific, not hardcoded |
| 16 | No post-login return-to behavior defined (AC-1) | Validated in-app return-to param, defaults to link list |
| 17 | No behavior for query string/fragment on `/{code}` (AC-9, AC-11) | Ignored for lookup, not forwarded to destination |

No missing PRD criteria were found that couldn't be resolved this way — every branch in
this document either cites an existing `AC-N` or is covered by one of the assumptions
above. If a future BDD revision adds custom codes, expiry, or link editing/deletion
(currently non-goals), this document will need corresponding new workflows for their
create/edit/expire failure paths.
