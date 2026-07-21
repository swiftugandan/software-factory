# ADR-0004 — Database access and migrations

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #22

## Context

Postgres is dictated (AC-24, CLAUDE.md). Postgres 16 runs locally on the Unix socket
`/var/run/postgresql:5432` with peer auth as the OS user; databases `tinylink` and
`tinylink_test` can be created. The data model is small (members, oauth_identities,
sessions, links, click_events — tasks T004–T008) with hot paths that are simple indexed
lookups (redirect, AC-12) and one aggregate (click counts, AC-14). No connection string is
allowed to be hardcoded (T002, ADR-0013).

## Decision

- **Driver:** `pg` (node-postgres) with a shared `Pool`. All queries are parameterized SQL
  (`$1, $2 …`); no string interpolation of user input.
- **No ORM.** Data access is wrapped in a thin repository module per aggregate under
  `src/backend/db/` (e.g. `linksRepo`, `membersRepo`, `clickEventsRepo`). Handlers and
  services call repositories, never the pool directly.
- **Migrations:** `node-pg-migrate`, migrations under `migrations/`, run via an npm script
  (`npm run migrate`). Migrations are forward-only and idempotent to re-run against an empty
  DB; CI applies pending migrations to `tinylink_test` before tests (T003).
- **Connection:** the pool reads `DATABASE_URL` from the config module (ADR-0013). Local dev
  and CI use the peer-auth socket DSN (e.g.
  `postgresql:///tinylink` / `postgresql:///tinylink_test`).

## Alternatives considered

- **Prisma.** Generates a client and owns migrations, but adds a codegen/build step and a
  heavy dependency, and its generated client sits awkwardly with the in-place mutation probe.
  Rejected as too much for five tables.
- **Knex / Sequelize / TypeORM.** Query-builder/ORM overhead with no payoff at this scale;
  hand SQL for one aggregate query is clearer. Rejected.
- **Raw SQL files + custom runner for migrations.** Fewer deps, but re-implements ordering,
  checksums, and up/down that node-pg-migrate already provides. Rejected.

## Consequences

- SQL is explicit and reviewable; the click-count aggregate and the collision unique
  constraint (ADR-0011, ADR-0010) are expressed directly.
- The repository layer is the seam: swapping driver or adding read replicas touches only
  `src/backend/db/`.
- Tests run against a real `tinylink_test` Postgres (ADR-0007), so migrations and SQL are
  exercised, not mocked.
