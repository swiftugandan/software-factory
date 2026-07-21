# ADR-0002 — Web framework

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #20

## Context

Building on ADR-0001 (Node.js/JS), TinyLink needs an HTTP layer that serves a public
redirect (`GET /{code}`, AC-9..AC-12), a small JSON API (`POST /links`, `GET /links`,
`POST /auth/sign-in`, OAuth callback), and server-rendered pages (ADR-0003). The redirect
path has a p95 < 100 ms server-time budget (AC-12). The surface is small and stable.

## Decision

Use **Express 5** as the single HTTP framework for both the JSON API and the server-rendered
UI, running in one Node process.

- Routing, middleware, cookie parsing, and view rendering all go through Express.
- Middleware order is fixed: request-id/logging → cookie/session resolver (ADR-0009) →
  route handlers → centralized error handler (ADR-0008).
- The public redirect route is registered before auth middleware so it stays auth-free
  (AC-10) and short (AC-12).

## Alternatives considered

- **Fastify.** Faster JSON throughput and built-in schema validation. Rejected: the extra
  performance is unnecessary for this load, and Express is more widely known, reducing the
  chance a build agent re-decides mid-stream.
- **Node core `http` with a hand-rolled router.** Leanest possible, but re-implements
  cookies, body parsing, and view rendering that Express gives for free. Rejected as false
  economy.
- **Nest/Koa/Hapi.** More structure/ceremony than a four-route app needs. Rejected.

## Consequences

- One process serves API + UI + redirect; no cross-service networking, simplest deploy.
- Redirect handler stays a thin path (single indexed lookup, ADR-0005) to meet AC-12; the
  latency threshold is config-backed (ADR-0013) so AC-12 can be asserted, not hardcoded.
- Express is a well-understood seam; swapping frameworks would touch only the HTTP edge in
  `src/backend/http/`, not services or the repository layer.
