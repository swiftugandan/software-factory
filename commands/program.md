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
   `docs/contracts/`, and one `one-way` ledger row per boundary and contract. Then run
   `!bash .claude/hooks/program-traceability.sh --plan` and fix anything it reports before
   proceeding — a malformed decomposition caught now costs minutes; caught at `/integrate`
   it costs a wave.
2. Dispatch `refine-spike-engineer` for the walking-skeleton spike: stub every module and
   pass one message across every seam exactly as its contract specifies. A contract the
   skeleton cannot exercise is REFUTED — route it back to `refine-program-planner` to revise
   the contract before anything is approved against it. This deliberately inverts the
   module pipeline's approve-then-spike order: at program level the human's attention is
   the scarce resource and the spike budget is cheap, so the seams get exercised first and
   the human approves with evidence in hand instead of approving twice. (Mechanically safe:
   approval-guard blocks implementation paths while one-way rows are pending, but `spikes/`
   is not an implementation path.) The accepted cost is spike time spent on a decomposition
   the human may still reject.
3. Dispatch `refine-assumption-auditor`, then stop for `/approve-assumptions`. The
   decomposition rows are one-way, so the approval-guard blocks implementation writes until
   a human signs off — this is the same deliberate pause as ever, now guarding the most
   expensive decision in the program, with the skeleton's verdicts (`spike NNN`) attached to
   the rows they verify. Recurring gaps get promoted to `docs/standing-decisions.md` here.
4. Dispatch `build-software-architect` to write `docs/adr/program/` — the cross-cutting
   decisions (stack, error envelope, telemetry, authn) every module architect inherits and
   may not re-decide. Empirical claims cite the skeleton spike.
5. Set up each module as its own factory project in wave order: `modules/<name>/` (or its
   own repo) with its own `docs/`, `config/factory.json` (with the module's
   `traceability.idPrefix` from `docs/modules.md`), and `docs/BDD/` assembled mechanically
   from the module's row — its BDD sections plus the contracts it touches, copied into
   `docs/BDD/contracts/` (the program-guard hook makes that path read-only inside the
   module: contracts are revised at program level or not at all). Symlink or copy
   `docs/standing-decisions.md` and `docs/adr/program/` into each module so the inheritance
   is visible to its agents. Scope each module's gates to the module, not
   the program: its `testCommand` and `mutation.targets` cover its own code only, and in a
   monorepo with a build tool, delegate scoping to the tool's affected-graph
   (`turbo run test --filter=<module>...`, `nx affected -t test`) rather than encoding path
   logic in hooks — the hooks stay dumb, the tool computes what changed. The full unscoped
   suite runs at `/integrate`, so a scoped module gate can never let the whole rot unwatched.
6. Run `/factory` inside each module of the current wave. Modules in the same wave share no
   dependency edge — run them as separate concurrent sessions; do not interleave two module
   runs in one session. On later waves, each module run's archaeologist maps only that
   module. Check off module rows in `docs/modules.md` as their runs certify.
7. After each wave, run `/integrate` at the program root before starting the next wave —
   module certification says the parts are right; only integration says the whole is.

A module run that discovers a contract is wrong does not patch it locally: that is a
contract-change, handled at program level (see `/integrate`). Report per wave: modules
certified, integration result, open `REVIEW` rows, and standing-decision promotions.
