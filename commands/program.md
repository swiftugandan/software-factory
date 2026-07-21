---
description: Decompose a large BDD into modules + contracts, gate the decomposition, then run the factory per module in waves.
argument-hint: "[optional focus, or a wave number to resume]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: fable
---

Run the factory in program mode — for a BDD too large for one run. Focus: $ARGUMENTS

Program mode is the ordinary refinement loop applied one level up: decompose, gate the
decomposition like any other one-way decision, verify the seams empirically, then run the
unmodified factory per module. If the BDD plausibly fits one run (one bounded context, a
ledger a human can review in one sitting), say so and run `/factory` instead — decomposition
you don't need is pure overhead.

First, bootstrap as `/factory` does: if `.claude/hooks/log-assumption.sh` or `docs/BDD/` is
missing, run `bash "${CLAUDE_PLUGIN_ROOT}/hooks/sync-project.sh"` and create `docs/BDD/`
(and `config/factory.json` from the plugin default if absent). If `docs/BDD/` is empty, stop
and ask for the BDD.

Then, in order:

1. If `docs/modules.md` is absent, dispatch `refine-program-planner` → `docs/modules.md`,
   `docs/contracts/`, and one `one-way` ledger row per boundary and contract.
2. Dispatch `refine-assumption-auditor`, then stop for `/approve-assumptions`. The
   decomposition rows are one-way, so the approval-guard blocks implementation writes until
   a human signs off — this is the same deliberate pause as ever, now guarding the most
   expensive decision in the program. Recurring gaps get promoted to
   `docs/standing-decisions.md` here.
3. Dispatch `refine-spike-engineer` for the walking-skeleton spike: stub every module and
   pass one message across every seam exactly as its contract specifies. A contract the
   skeleton cannot exercise is REFUTED — route it back to `refine-program-planner` to revise
   the contract (a new one-way row) before anything is built against it.
4. Dispatch `build-software-architect` to write `docs/adr/program/` — the cross-cutting
   decisions (stack, error envelope, telemetry, authn) every module architect inherits and
   may not re-decide. Empirical claims cite the skeleton spike.
5. Set up each module as its own factory project in wave order: `modules/<name>/` (or its
   own repo) with its own `docs/`, `config/factory.json` (with the module's
   `traceability.idPrefix` from `docs/modules.md`), and `docs/BDD/` assembled mechanically
   from the module's row — its BDD sections plus the contracts it touches, copied read-only.
   Symlink or copy `docs/standing-decisions.md` and `docs/adr/program/` into each module so
   the inheritance is visible to its agents.
6. Run `/factory` inside each module of the current wave. Modules in the same wave share no
   dependency edge — run them as separate concurrent sessions; do not interleave two module
   runs in one session. On later waves, each module run's archaeologist maps only that
   module. Check off module rows in `docs/modules.md` as their runs certify.
7. After each wave, run `/integrate` at the program root before starting the next wave —
   module certification says the parts are right; only integration says the whole is.

A module run that discovers a contract is wrong does not patch it locally: that is a
contract-change, handled at program level (see `/integrate`). Report per wave: modules
certified, integration result, open `REVIEW` rows, and standing-decision promotions.
