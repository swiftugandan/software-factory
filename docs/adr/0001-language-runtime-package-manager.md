# ADR-0001 — Backend language, runtime, and package manager

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #20

## Context

The PRD, workflows, and BDD name Postgres (AC-24) and UTC (AC-22) but do not name an
implementation language, runtime, or web framework. The environment provides Node.js 22.22
and Python 3.11. The factory's objective gates are Node-first: `factory-gate.sh` runs
`npm run lint` / `npm test`, and `mutation-probe.sh` defaults to `npm test` and mutates
`.js/.ts/.py` files in place, re-running the test command each time. A stack with no
compile/build step keeps that mutate-and-rerun loop correct (no stale build artifact) and
keeps the app lean for its narrow four-behavior scope.

## Decision

- **Runtime:** Node.js 22 LTS.
- **Language:** plain JavaScript authored as ES modules (`"type": "module"` in
  `package.json`). No TypeScript, no transpiler, no bundler — source files are executed
  directly by Node and by the test runner.
- **Package manager:** npm (bundled with Node; `package-lock.json` committed).

All build agents write JavaScript ESM and cite this ADR; they do not introduce TypeScript,
Babel, or a build step.

## Alternatives considered

- **Python 3.11 + FastAPI/Flask.** Equally viable and equally lean. Rejected only because
  the factory hooks are Node-first (default `npm test`, `package.json` script probing);
  choosing Node keeps the gate tooling on its happy path with no adapters.
- **TypeScript on Node.** Adds a compile step (`tsc`/`tsx`). The mutation probe edits source
  and re-runs tests with no rebuild, so a compiled `dist/` would be mutated-but-not-executed,
  silently inflating the kill-rate. Rejected to keep mutation results honest.

## Consequences

- Zero-build: `node --test` and `mutation-probe.sh` operate directly on `src/` files.
- No static type checking; correctness leans on tests (ADR-0007) and runtime validation
  (ADR-0008). Acceptable at this scope.
- Reversible: language is a code-level choice with no data-model coupling. Swapping to
  Python would be a rewrite of `src/` but leaves the schema (ADR-0005) intact.
