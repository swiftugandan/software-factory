# ADR-0009 — Authentication model

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #25 (implements approved Ledger #9, #18, #19)

## Context

AC-1/AC-2 require email/password plus a supported OAuth provider, sessions scoped to a
member, and requests acting only on the member's own links. Ledger #9 (email/password +
OAuth) is approved; Ledger #18 fixes Google as the single default OAuth provider behind a
pluggable interface; Ledger #19 makes email/password accounts provisioned out-of-band with a
nullable `password_hash`, and OAuth auto-provisioning on first login. Tables `members`,
`oauth_identities`, `sessions` exist (T004–T006). Sign-in failure paths must not enumerate
accounts and must create no partial session (Ledger #14).

## Decision

- **Session transport:** server-side sessions. On successful auth, insert a `sessions` row
  (`id`, `member_id`, `created_at`, `expires_at`, all UTC) and set an opaque session-id
  cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`. The cookie carries only the random
  session id (≥128 bits from `crypto.randomBytes`), never member data.
- **Session resolver middleware:** looks up the session by cookie, checks `expires_at > now()`
  UTC, attaches the current member (or none). Expired/absent → treated as unauthenticated.
- **Auth-required middleware (T012):** link create/list endpoints without a valid session →
  401 `unauthenticated` (API, ADR-0008) or redirect to sign-in with a validated in-app
  return-to (UI, Ledger #16); no create/read of link data occurs (AC-1). `GET /:code` is
  exempt (AC-10).
- **Password hashing:** Node `crypto.scrypt` (built-in, no native build) with a per-user
  random salt and stored parameters. Verification is constant-time (`crypto.timingSafeEqual`).
  The algorithm sits behind a `passwordHasher` interface in `src/backend/lib/` so it can be
  swapped (e.g. to argon2) without touching call sites.
- **OAuth:** a `config/auth-providers.js` registry maps a provider key → an OIDC/OAuth2
  strategy object. Google is the only registered provider this release (Ledger #18).
  First successful login with no matching `oauth_identities` row auto-provisions a `members`
  row + identity row (Ledger #19). The provider client is injected, so integration tests
  supply a fake provider and never hit Google's network.
- **Failure handling (Ledger #14):** wrong password / unknown email → generic
  "invalid email or password", no session, no enumeration (identical response + timing for
  both). OAuth error/cancel → generic "sign-in was not completed", no partial member or
  session created.

## Alternatives considered

- **Stateless JWT sessions.** No server session table, but revocation and the "expired →
  unauthenticated" story are weaker, and a `sessions` table is already mandated (T006).
  Rejected; server sessions are simpler to reason about here.
- **bcrypt/argon2 via native modules.** Fine algorithms, but add a native build step to an
  otherwise no-build stack (ADR-0001). Rejected in favor of built-in scrypt behind the
  `passwordHasher` seam, which keeps upgrade paths open.
- **Multiple OAuth providers now.** Out of scope; Ledger #18 fixes one. The registry seam
  makes adding more a config change, not a schema/workflow change.

## Consequences

- Sessions are revocable (delete the row) and expiry is explicit UTC.
- `password_hash` nullable supports OAuth-only members and future self-service registration
  with no migration (Ledger #19).
- Two reversible seams (`passwordHasher`, `config/auth-providers.js`) isolate the hash
  algorithm and provider set; the `oauth_identities` schema is provider-agnostic.
