# Software Factory — Effectiveness Evaluation

**Subject:** The `software-factory` subagent pipeline (this repo)
**Method:** One end-to-end run against a throwaway BDD (bundled `examples/BDD-link-shortener.md`,
"TinyLink"), plus deterministic unit-testing of the enforcement hooks, plus behavioral
verification of the built software against a live Postgres + HTTP server.
**Run window:** 2026-07-20 20:54Z → build stall → evaluator takeover 2026-07-21.
**Branch:** `claude/factory-testing-evaluation-gftxz0`

---

## TL;DR

The factory **produced correct, working, behaviorally-verified software** for a non-trivial
brief: a full auth'd link shortener on Express/EJS/Postgres, 118 passing tests, coverage over
threshold, a 100% mutation kill-rate, and every core acceptance criterion confirmed against a
running server. The refinement artifacts (PRD, workflows, task graph, assumption ledger) are
high quality and the human-in-the-loop approval checkpoint worked exactly as designed.

It was undone at the finish line by **one shallow bug with an outsized blast radius**: the
product-manager labeled acceptance criteria `AC-N` while the entire downstream contract —
its own agent spec, the README, and the `traceability.sh` gate — expects `PRD-NNN`. Because
the factory has **no per-subagent timeout or circuit-breaker**, the resulting traceability
failure sent a fix agent into a **7.5-hour (455-minute) wedge** that produced zero changes and
never surfaced to the operator. Both problems are cheap to fix and neither is architectural.

**Verdict: effective at building; not yet robust at failing.** The generative pipeline is
strong; the failure-handling envelope is the gap.

---

## What was measured, and the result

| Dimension | How | Result |
|---|---|---|
| Hook enforcement (the deterministic guarantees) | 25 simulated-JSON unit tests | **25/25 pass** |
| Refinement quality | Inspect PRD/workflows/tasks/ledger | 24 ACs, 12 KB workflows, 28 tasks, **100% criterion→task coverage, 0 orphan ids** |
| Approval checkpoint | Observe the one deliberate pause | **Worked**: halted, surfaced 3 one-way rows behind named seams, audit verdict ALIGNED |
| Build output | Inspect tree | 13 ADRs, 35 src files, 22 test files, all 28 tasks checked off |
| Test suite | `node --test`, real Postgres | **118/118 pass** (107 s) |
| Coverage | `c8`, 70% thresholds | **Pass (exit 0)**; only OAuth HTTP client low (behind a seam) |
| Mutation probe | `mutation-probe.sh`, real code | **6/6 killed (100%)**, threshold 80% — tests are not hollow |
| Behavioral reality check | `fetch` against live server | **6/6 core behaviors correct** (see below) |
| Secops hygiene | Inspect tracking | `.env` untracked + gitignored; `config/.env.example` template; config validated centrally |
| Traceability gate | `traceability.sh` | **FAILS on real run** (id mismatch); passes once labels reconciled |

### Live-app reality check (the part that isn't "tests pass")
Driven with Node `fetch` against `node src/backend/server.js` on a real Postgres:

| Criterion | Observed |
|---|---|
| AC-9 redirect active code | `302` → `Location: https://example.com/target` |
| AC-11 unknown code | `404` |
| AC-11 soft-deleted link | `404` (read-filter honors `deleted_at`) |
| AC-1 protected list, no auth | `401` |
| AC-10 redirect requires no auth | `302` |
| AC-13/14 click counting | active link = 2 clicks (2 redirects), deleted = 0 |
| Schema constraint | `varchar(7)` rejected an 8-char code |

The software does what the BDD asked. This is the strongest signal in the evaluation.

---

## Findings

### F1 — HIGH — `AC-N` vs `PRD-NNN`: an internal contract violated silently
The `refine-product-manager` spec says *"Number them (PRD-001, PRD-002, …)"*; the README says
`traceability.sh` verifies every **`PRD-NNN`**; `gate-test-automation` and
`gate-adversarial-tester` say to name tests `PRD-NNN`. The PM instead emitted `AC-1…AC-24`, and
the planner and 22 test files (178 references) faithfully propagated it. Because every *LLM*
stage agreed on `AC-N`, nothing looked wrong — only the deterministic gate disagreed.

- Empirical: `traceability.sh` → exit 1, `"no PRD-NNN ids found in docs/PRD.md"`.
- The gate is the *only* thing that would catch this, and it runs at `/harden` — long after
  refinement. **No early check validates the PRD id format.**
- Demonstrated fix (in a copy): `sed 's/\bAC-/PRD-/g'` over docs+tests makes traceability run,
  and it then correctly flags a *real* residual gap — **PRD-24 (Postgres datastore) has no
  named test** (23/24 fully traceable). So the gate does its job the moment it's unblocked.

**Fix (pick one):** (a) enforce `PRD-NNN` at PM output with a cheap format check in the
orchestrator/a PostToolUse hook; or (b) make `traceability.sh` scheme-agnostic
(`(PRD|AC)-[0-9]+`). (a) is more aligned with the documented contract.

### F1b — HIGH — No watchdog: a shallow failure caused a 455-minute stall
This is the "traceability stuck 450m" the operator saw. After the frontend gates finished
(22:44:55Z), a single subagent — the attempt to fix the traceability failure — ran **~7.5
hours**, changed **no files** (only `run-log.md` was touched by the stop hook), and ended at
06:15:57Z. `fix-minimal-change` is chartered for "the smallest diff for one defect"; the actual
remedy (rename across 100+ files, or edit a hook) is arguably outside that charter, so it
thrashed with no exit condition.

The factory has **no per-subagent timeout, no max-retry, no circuit-breaker**. A defect that is
trivial but unfixable-in-scope burns unbounded wall-clock instead of failing fast to a human.

**Fix:** bound subagent wall-clock/turns; on exhaustion, stop and surface to the operator with
the gate output. A 10-minute cap would have turned a 7.5-hour stall into a 10-minute escalation.

### F4 — MEDIUM — The mutation probe is impractically slow on an integration suite
The suite is ~107 s per run; the probe does baseline + up to `maxMutants` (default **20**) full
runs ≈ **36 minutes**, indistinguishable from a hang and with no per-mutant progress output.
(Capped to 6 mutants here, it still passed 100%.)

**Fix:** sample a fast unit subset for mutation, or cap wall-clock and `log()` progress per
mutant so a slow probe is legible rather than alarming.

### F2 — LOW — Blank agent names in the run trail
4 `docs/run-log.md` entries read `finished ****`. `run-log.sh` resolves
`.agent_type // .agent_id // "subagent"`, but an **empty string** isn't caught by `//`, so the
`"subagent"` fallback never fires and those steps are unattributable.
**Fix:** treat empty as null (`(.agent_type // "") | if . == "" then "subagent" else . end`).

### F3 — LOW — "Commit per task" is prose-only, unenforced
`CLAUDE.md` says commits reference the task id and PRD criterion; the run left **98 files
uncommitted** in one heap. No hook enforces it. Either wire a per-task commit into the
orchestrator loop or drop the claim. (The evaluator committed the output in checkpoints.)

---

## What worked well (keep these)

- **Refinement depth.** 24 testable criteria with given/when/then, a 12 KB workflow map covering
  error/empty/permission/concurrency states, and a 28-task dependency graph where every task
  cites an agent *and* a criterion and every criterion is covered.
- **The approval checkpoint.** The one deliberate pause behaved precisely: it stopped before any
  `src/` write, surfaced 3 irreversible data-model calls each behind a named seam, ran an
  aggregate-drift audit (verdict ALIGNED), and even flagged a non-blocking "who may sign up"
  onboarding asymmetry. `approval-guard` blocks implementation writes deterministically, proven
  in the hook tests.
- **Real software, not a demo.** Parameterized SQL, no ORM, central validated config, soft
  deletes, server-side sessions, an OAuth seam, `varchar(7)` code constraint — and it all runs.
- **Gate discipline.** Per-diff `gate-secops` + `gate-code-reviewer` fired on every build task;
  the `fix-minimal-change` defect loop engaged twice during the build.
- **Security hygiene by default.** Secrets kept out of git, config centralized and validated.
- **The verification gates are real** — mutation probe and (once unblocked) traceability both do
  exactly what they claim; the tests are not hollow.

---

## Recommendation

Two ~1-hour fixes convert this from "impressive but fragile" to "trustworthy unattended":

1. **A watchdog (F1b)** — bound each subagent's time/turns and escalate on exhaustion. This is
   the single highest-value change; it caps the worst case.
2. **Reconcile the id scheme (F1)** — enforce `PRD-NNN` at PM output (or make the gate
   scheme-agnostic), so the anti-drift gate can actually run.

Then re-run: with those in place this TinyLink build would have reached `gate-reality-checker`
certification on its own, since the underlying software already satisfies the criteria by
behavior.

*Full raw notes: `evaluation/findings.md`. Hook unit-test harness: `evaluation/hook-tests.sh`.*
