# Factory evaluation — live findings

## Bench setup
- Hooks unit-tested deterministically: 25/25 PASS (see hook-tests.sh).
- Postgres 16 started locally (peer auth) as the test datastore.
- BDD seeded: examples/BDD-link-shortener.md (TinyLink), committed cc1009f.
- Run started 20:54:28Z via factory-orchestrator (refinement phase, pause at approval checkpoint).

## Findings

### F1 (HIGH) — PM emits `AC-N`, whole factory contract expects `PRD-NNN`
- refine-product-manager.md line 13 explicitly instructs: "Number them (PRD-001, PRD-002, ...)".
- Generated docs/PRD.md instead uses AC-1 … AC-24.
- Consumers that hardcode PRD-NNN: traceability.sh (greps `PRD-[0-9]+`), gate-test-automation
  ("Name tests after the criterion e.g. PRD-014"), gate-adversarial-tester ("e.g. PRD-004"),
  refine-task-planner example ("covers PRD-014").
- EMPIRICAL: traceability.sh against the real PRD -> "no PRD-NNN ids found" exit 1.
  => One of the three /harden verification gates is dead on arrival for this run.
- Root cause class: instruction-following drift by a subagent, with NO early gate to catch a
  malformed PRD id scheme. The mismatch only surfaces at /harden, long after refinement.

### F2 (LOW) — SubagentStop run-log emitted a blank agent name
- docs/run-log.md: "2026-07-20T20:57:14Z finished ****" (empty).
- run-log.sh reads .agent_type // .agent_id // "subagent"; one subagent produced neither,
  and the empty-string branch isn't guarded, so the fallback "subagent" wasn't used.
- Observability gap: the run trail can't attribute that step.

### Positive: refinement quality is high
- PRD: 24 acceptance criteria, given/when/then, each citing ledger basis; covers auth, validation,
  redirect, click model, listing/pagination/empty-state, UTC, soft-delete, Postgres.
- workflows.md 12KB (error/empty/permission/concurrency paths).
- tasks.md: 28 tasks, dependency-ordered, every task cites a build agent AND a criterion (0 missing),
  every AC-1..AC-24 covered by >=1 task (0 uncovered). Planner propagated AC-N consistently.
- Ledger: 17 rows, structured, sensible bases. 3 one-way rows correctly flagged REVIEW.

### F1 detail: planner propagated AC-N (not PRD-NNN) — chain is self-consistent but hook-incompatible
- Because PM and planner agree on AC-N, no LLM stage sees a problem; only the deterministic
  traceability.sh disagrees. Coherence among agents masks the break against the hard gate.

## Approval checkpoint (the one deliberate pause) — WORKED AS DESIGNED
- Orchestrator correctly stopped at the checkpoint and returned control with 3 one-way REVIEW
  rows surfaced (#2 unique-code constraint, #4 click_events table, #11 soft-delete column),
  each with a named seam. assumption-audit.md verdict: ALIGNED. 19 ledger entries total.
- Auditor also surfaced a "cheap" judgment call worth a human eye: onboarding asymmetry
  (#18/#19 — open Google OAuth auto-provisioning vs admin-seeded email/password). Good catch:
  it silently decides *who may use the product*, and the audit flagged it without blocking.
- As evaluator/operator I approved #2/#4/#11 (all standard link-shortener data-model choices,
  each behind a seam) to let the run proceed. 0 REVIEW rows remain. approval-guard now permits src/.

## Build phase — observing (resumed orchestrator, AC-N scheme intact on purpose)
- 13 ADRs (0001-0013), ~40 src files (Express/EJS/Postgres backend + frontend views),
  19 test files, all 28 tasks checked off. Per-diff gate-secops + gate-code-reviewer fired
  on every build task; fix-minimal-change ran twice (defect loop works).

## MEASUREMENTS (taken by evaluator after run stalled)
- Tests: 118/118 pass under canonical `node --test` command, real Postgres. Duration 107s.
- Coverage: c8 passes 70% line/branch/func thresholds (exit 0). Weak spots (honest, behind
  OAuth seam): google-client.js 21% lines, oauth-service.js 65% branch. Everything else >90%.
- LIVE APP reality check (node fetch against running server, real DB):
    AC-9 active code   -> 302 Location=https://example.com/target   PASS
    AC-11 unknown code -> 404                                        PASS
    AC-11 soft-deleted -> 404 (read-filter honors deleted_at)        PASS
    AC-1 /links no auth-> 401                                        PASS
    AC-10 redirect no-auth (2nd hit) -> 302                          PASS
    AC-13/14 click counting: active=2 (2 redirects), deleted=0       PASS
    schema: varchar(7) rejected an 8-char code                       PASS
- Secops hygiene: .env untracked + gitignored; config/.env.example is the tracked template;
  app reads validated config/app.js, never process.env directly. Good.

## FINDINGS (final)
### F1 (HIGH) — id-scheme mismatch breaks traceability
- PM/planner/tests all use AC-N; README+agent specs+traceability.sh require PRD-NNN.
- REAL traceability: exit 1 "no PRD-NNN ids found". DEMO fix (sed AC->PRD in a copy):
  traceability then WORKS and surfaces a real gap -> PRD-24 (Postgres) has no covering test.
  So the gate does its job once unblocked; 23/24 criteria fully traceable.
- Root cause: PM ignored its own "Number them PRD-001..." instruction; NO early gate validates
  the PRD id format, so the break only surfaces at /harden.

### F1b (HIGH, the "455m" symptom) — no watchdog; a trivial gate failure caused a 7.5h stall
- After frontend gates (22:44:55Z) a single subagent ran ~7.5h and finished 06:15:57Z with
  ZERO content changes (only run-log.md touched). This is the fix-for-traceability attempt
  wedging. Factory has no per-subagent timeout / circuit-breaker / max-retry, so a shallow,
  unfixable-in-scope defect burned 455 minutes instead of failing fast to the operator.
- fix-minimal-change is scoped to "smallest diff for one defect"; the real fix (rename across
  100+ files or edit the hook) is arguably out of its charter, so it likely thrashed.

### F4 (MED) — mutation-probe is impractically slow on an integration suite
- Suite is 107s/run; probe does baseline + up to maxMutants(20) full runs = ~36 min default.
  On this run it looks indistinguishable from a hang. Probe should sample a fast unit subset
  or cap wall-clock, and log progress per mutant.

### F2 (LOW) — 3 run-log entries have blank agent names (SubagentStop couldn't resolve agent_type)
### F3 (LOW) — commit-per-task convention (CLAUDE.md) is prose-only, unenforced; run left 98 files uncommitted
### Positives — refinement quality, approval checkpoint behavior, working certified-by-behavior
  software, per-diff gate discipline, secops hygiene, and (once unblocked) the traceability gate.
- Mutation kill-rate: 6/6 killed (100%), threshold 80% -> PASS. Tests are not hollow.
- NOTE on "450m stuck": no live process; orchestrator's fix-trace subagent ended 06:15:57Z.
  Stale UI readout. Confirmed via ps (nothing >30min except session host + eval's app server).
