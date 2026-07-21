# ADR-0003 — Frontend approach

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #21

## Context

The UI is four pages (tasks T024–T028): sign-in, create-link, link list/dashboard, and the
route-guard behavior. There is no requirement for offline use, rich client state, or a
mobile app. AC-1 requires UI unauthenticated requests to redirect to sign-in with a
validated in-app return-to (Ledger #16); AC-20 requires an explicit empty-state. "Keep it
lean" is an explicit constraint.

## Decision

**Server-rendered HTML using EJS templates**, rendered by the same Express process
(ADR-0002). No SPA framework, no bundler, no separate frontend dev server.

- Templates live in `src/frontend/views/`; static assets (a small stylesheet, optional
  progressive-enhancement JS) in `src/frontend/public/` served via `express.static`.
- Pages POST HTML forms to the same endpoints the JSON API exposes; endpoints
  content-negotiate (HTML redirect/render for browser form posts, JSON for API clients) or
  expose thin page routes that call the same service layer. Validation errors (AC-5) render
  inline; the API contract (ADR-0008) is the source of truth for messages.
- Auth uses the session cookie (ADR-0009); the route guard (T025) is Express middleware that
  redirects unauthenticated page requests to sign-in with a validated return-to param.

## Alternatives considered

- **React/Vue SPA (separate frontend app).** Adds a bundler, a build step, a dev server, and
  a client/server data contract to maintain — all disproportionate to four pages, and the
  build step complicates the mutation probe (ADR-0001). Rejected.
- **HTMX over templates.** Reasonable, but adds a dependency for interactions this app
  doesn't need (there is no partial-update requirement). Rejected; plain forms suffice.

## Consequences

- The "frontend app" is the view layer inside the single Express service, not a separate
  deployable. `src/frontend/` still exists as the directory tasks T001/T024–T028 expect.
- No JS build pipeline; nothing to bundle, nothing to serve from a CDN.
- Reversible: because the JSON API (ADR-0008) is a clean seam, a future SPA could consume it
  without backend changes. The view layer is the only thing that would be replaced.
