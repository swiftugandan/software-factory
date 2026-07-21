# ADR-0006 — Repository and directory layout

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #20

## Context

CLAUDE.md expects `src/`, `tests/`, and `config/`. Task T001 asks for a backend service, a
frontend app, and a shared `config/`, with a root package manifest wiring `lint` and `test`
scripts. The mutation probe scans `src`, `lib`, `app` for implementation files and excludes
anything matching `tests?/` or `__tests__/`. This is a single Node process (ADR-0002/0003),
not a multi-service monorepo, so one package manifest at the root is correct.

## Decision

Single root npm package. Layout:

```
/
├── package.json            # root manifest: scripts (lint, test, coverage, migrate, start)
├── package-lock.json
├── config/
│   ├── factory.json        # gate thresholds (pre-existing)
│   ├── app.js              # loads + validates env into a typed config object (ADR-0013)
│   ├── link-generation.js  # code length/alphabet/retry-max seam (ADR-0010, Ledger #1/#12)
│   └── auth-providers.js   # OAuth provider registry seam (ADR-0009, Ledger #18)
├── migrations/             # node-pg-migrate files (ADR-0004)
├── src/
│   ├── backend/
│   │   ├── server.js       # Express app assembly + startup
│   │   ├── http/           # routers, middleware, error handler (ADR-0002, ADR-0008)
│   │   ├── services/       # link creation, redirect, listing, auth (business logic)
│   │   ├── db/             # pg pool + per-aggregate repositories (ADR-0004)
│   │   └── lib/            # code generator, url validator, session helpers
│   └── frontend/
│       ├── views/          # EJS templates (ADR-0003)
│       └── public/         # static css/js
└── tests/
    ├── unit/               # pure-logic tests (validator, code gen, pagination)
    └── integration/        # HTTP + Postgres tests against tinylink_test (ADR-0007)
```

- Business logic lives in `src/backend/services/` and `src/backend/lib/` and is import-safe
  (no side effects at module load) so unit tests can exercise it without a server or DB.
- The mutation probe's `targets` remain `["src", ...]`; all mutable implementation code is
  under `src/`, and all tests are under `tests/` (excluded by the probe's filter).

## Alternatives considered

- **npm workspaces (separate `backend` and `frontend` packages).** Real value only when
  there are independently versioned/deployed packages; here it is one process. Rejected as
  overhead; a single manifest keeps `npm run lint/test` trivial for the gates.
- **Flat `src/` with no backend/frontend split.** Loses the clear seam T001 asks for.
  Rejected.

## Consequences

- One `npm install`, one lockfile, one test command — the gates (`factory-gate.sh`,
  mutation probe) work with no per-package orchestration.
- Clear seams: HTTP edge (`http/`), logic (`services/`,`lib/`), persistence (`db/`), view
  (`frontend/views/`), and reversible decisions (`config/`).
