# ADR-0007 — Test strategy and CI command

Status: Accepted
Date: 2026-07-20
Owner: build-software-architect
Ledger: #24

## Context

`config/factory.json` sets `coverage.threshold = 0.7` and `mutation.threshold = 0.8`, and
`mutation-probe.sh` runs the configured `testCommand` repeatedly against mutated `src/`
files (no rebuild between runs). Tests must be tied to PRD acceptance criteria and must
exercise real behavior, including Postgres (AC-24) and HTTP status contracts. The chosen
runner must (a) run source directly with no build step (ADR-0001), (b) produce coverage the
0.7 gate can read, and (c) return a clean exit code the mutation probe can trust.

## Decision

- **Runner:** Node's built-in `node:test` with `node:assert/strict`. No Jest/Mocha/Vitest.
- **HTTP tests:** `supertest` drives the Express app in-process (no listening port needed).
- **Integration DB:** tests run against a real `tinylink_test` Postgres. Each integration
  test isolates state by running inside a transaction that is rolled back in teardown (or
  truncating between tests); tests never touch `tinylink` (dev DB).
- **Test taxonomy:** `tests/unit/` for pure logic (URL validator AC-5, code generator AC-4,
  pagination normalization Ledger #13); `tests/integration/` for endpoint + DB behavior
  (create/redirect/list/auth, click counting, soft-delete exclusion, ownership 404).
- **Coverage:** `c8` (V8 coverage) wraps the runner and emits `text` + `lcov`. The coverage
  gate command enforces 0.7:
  `c8 --check-coverage --lines 70 --branches 70 --functions 70 --reporter=text --reporter=lcov node --test tests/`.
- **Traceability:** every test name/file references the `AC-N` it proves so the traceability
  and reality-checker gates can map tests to criteria.
- **CI order (T003):** install → apply migrations to `tinylink_test` → lint → `npm test` →
  coverage check → secrets scan. The mutation probe runs in `/harden` using the same
  `testCommand`.

### Exact commands

- `package.json` `"test"`: `node --test --test-concurrency=1 tests/`
- `package.json` `"coverage"`: the `c8 …` command above.
- **`config/factory.json` `testCommand`:** `node --test --test-concurrency=1 tests/`

`--test-concurrency=1` serializes test files so integration tests do not contend on the
shared `tinylink_test` database, keeping both the suite and the mutation probe deterministic.

## Alternatives considered

- **Jest.** Popular, built-in coverage, but its transform/module system fights ESM-no-build
  and adds weight; its own coverage instrumentation complicates the in-place mutation loop.
  Rejected in favor of the native runner + c8.
- **Vitest.** Fast, good DX, but a bundler-adjacent dependency for a no-build app. Rejected.
- **A dedicated mutation tool (Stryker) instead of the factory probe.** The factory already
  ships `mutation-probe.sh`; adding Stryker duplicates it and needs its own runner
  integration. Rejected — use the provided probe.

## Consequences

- Zero test-framework dependency beyond `c8` and `supertest`; native runner executes source
  directly, so mutants under `src/` are actually run (honest kill-rate for the 0.8 gate).
- Coverage is emitted as lcov for the 0.7 gate and any reporting.
- Integration tests require Postgres to be up and `tinylink_test` migrated — encoded in the
  CI step (T003), not mocked.
