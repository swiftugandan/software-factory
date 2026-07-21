# Software Factory — a Claude Code crew

A subagent pipeline that turns a Business Design Document into reviewed, tested software,
making and recording reasonable assumptions instead of stopping to ask a human. Built on the
agent roster in [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents);
each subagent here maps to one of those roles and is wired for Claude Code.

## Point a project at the factory

This repo is a Claude Code **plugin** (and its own marketplace). From any Claude Code
session, once:

```
/plugin marketplace add swiftugandan/software-factory
/plugin install software-factory@software-factory
```

Then, inside any project — new (`git init && cd` into it) or existing:

```
/software-factory:setup
```

That creates `docs/BDD/`, copies the default `config/factory.json`, mirrors the helper
scripts into `.claude/hooks/`, and runs preflight. Drop your BDD and supporting docs into
`docs/BDD/`, then run `/software-factory:factory`. The plugin's guard hooks (approval,
blind-tester, ledger, Stop gate) come with the install and stay inert in projects that
don't use the factory. `/plugin update software-factory` pulls the latest — the plugin
intentionally omits a semver pin, so every commit to this repo is an updatable version.

### Copy-in install (alternative)

If you'd rather vendor the factory into the project (no plugin, files in git, plus the
hands-off permissions preset — see below):

```
curl -fsSL https://raw.githubusercontent.com/swiftugandan/software-factory/main/install.sh | bash
```

The installer fetches this repo and copies `agents/`, `commands/`, `skills/`, and
`hooks/` into the project's `.claude/`, plus `CLAUDE.md` and `config/factory.json`, then
runs preflight. It is safe on existing projects: a project's own `CLAUDE.md` is kept (the
factory's is imported via `CLAUDE.factory.md`) and a pre-existing `.claude/settings.json`
is saved as `settings.json.pre-factory` before the factory's hooks take over. Re-run the
same one-liner any time to update. Pin a version or fork with
`FACTORY_REF=<branch-or-tag> FACTORY_REPO=<owner/name>` before the `bash`. From a local
clone, `./install.sh /path/to/your/repo` does the same thing. Commands are un-namespaced
in this mode (`/factory`, not `/software-factory:factory`) — don't run both modes in one
project or the gates fire twice.

`jq` is recommended (the standard hook dependency; scripts degrade without it but are less
precise). Node and git are needed only if you build a JS project and want commit-per-task.
The preflight tells you what's missing.

## Run

Plugin installs prefix each command with `software-factory:`; copy-in installs use the
bare names.

- `/factory` — the whole pipeline, BDD to certified software.
- `/program` — program mode for BDDs too large for one run: decompose into modules +
  contracts, gate the decomposition, then run `/factory` per module in waves.
- `/integrate` — post-wave program verification: blind integration tests against the
  composed system, contract traceability, contract-change routing.
- `/refine` — refinement only (PRD, workflows, task plan). The checkpoint to review before building.
- `/approve-assumptions` — sign off on one-way (irreversible) decisions before they're built.
- `/build [task-id]` — build from an existing task plan.
- `/harden` — independent verification: adversarial tests, mutation probe, traceability.
- `/certify` — certify against the PRD and write handoff docs.
- `/assumptions` — read the ledger, one-way decisions first.
- `/setup` — bootstrap the current project (plugin installs only).

Try it against the bundled example: `cp examples/BDD-link-shortener.md docs/BDD/` then `/factory`.

Hands-off operation: `templates/settings.json` ships `defaultMode: acceptEdits` and an
allow-list covering every command the pipeline runs (npm/pytest/node/git plus the ledger
helper), so an unattended run doesn't stall on approvals. `git push` and `gh` still
prompt; `rm -rf`, `sudo`, `curl`, `wget`, and reading `.env` are denied. The copy-in
installer applies it as the project's `.claude/settings.json`; plugins cannot ship a
permissions policy, so plugin users get it by running `/software-factory:setup hands-off`
(which merges only the `permissions` block into project settings). For a fully headless
run: `claude -p "/factory" --permission-mode acceptEdits`.

Two things to expect on first use: Claude Code asks you to trust hooks once (they run
shell commands — inspect `hooks/` first), and the Stop gate stays inert until you actually
start the pipeline, so installing into an existing repo won't touch it.

## How the pipeline maps to agency-agents

| Stage | Subagent | agency-agents source |
|---|---|---|
| PRD | `refine-product-manager` | product/product-manager |
| Path mapping | `refine-workflow-architect` | specialized/specialized-workflow-architect |
| Task graph | `refine-task-planner` | project-management/project-manager-senior |
| Drift audit | `refine-assumption-auditor` | (composite check — no single source) |
| Reality spikes | `refine-spike-engineer` | (composite role — no single source) |
| Brownfield map | `refine-codebase-archaeologist` | (composite role — no single source) |
| Program decomposition | `refine-program-planner` | (composite role — no single source) |
| Integration tests | `gate-integration-tester` | (blind contract-derived verification) |
| Orchestration | `factory-orchestrator` | specialized/agents-orchestrator |
| ADRs | `build-software-architect` | engineering/engineering-software-architect |
| Backend | `build-backend` | engineering/engineering-backend-architect |
| Frontend | `build-frontend` | engineering/engineering-frontend-developer |
| Schema | `build-database` | engineering/engineering-database-optimizer |
| CI/deploy | `build-devops` | engineering/engineering-devops-automator |
| Review | `gate-code-reviewer` | engineering/engineering-code-reviewer |
| Security | `gate-secops` | security/security-senior-secops |
| Tests | `gate-test-automation` | testing/testing-test-automation-engineer |
| Independent tests | `gate-adversarial-tester` | (blind spec-derived verification) |
| Certification | `gate-reality-checker` | testing/testing-reality-checker |
| Defect fixes | `fix-minimal-change` | engineering/engineering-minimal-change-engineer |
| Handoff docs | `doc-technical-writer` | engineering/engineering-technical-writer |

Model tiers: Fable (the top intelligence tier) for the roles where a wrong call
cascades irreversibly — orchestration, architecture (ADRs the builders never
re-decide), and program decomposition (module boundaries nothing downstream can undo);
Opus for the next rung — product refinement, the assumption audit, and
adversarial/integration testing; Sonnet for builders and tests; Haiku for the read-only
per-diff gates. Tiers are aliases, not pinned IDs, so each resolves to the current model in
that tier as new versions ship. Read-only gates carry `disallowedTools:
Write, Edit` so a reviewer cannot rewrite the thing it is reviewing.

## What makes it autonomous

The `assumption-ledger` skill (`skills/assumption-ledger/`) is preloaded into every
agent that faces gaps. It classifies each gap as reversible-with-a-default, product-shaped,
or irreversible, and says what to do with each. Agents log decisions with
`.claude/hooks/log-assumption.sh` (mirrored into the project by the plugin's SessionStart
hook, or copied in by the installer), which writes a structured row to `docs/assumptions.md`.
One-way decisions land behind a config flag or interface and are flagged `REVIEW`.

Determinism the model cannot override lives in the hooks (`hooks/hooks.json` for the
plugin; the same wiring via `templates/settings.json` for copy-in installs):

- **PreToolUse** on writes guarantees the ledger file exists.
- **SubagentStop** appends a run trail to `docs/run-log.md`.
- **SessionStart** injects open `REVIEW` items and unchecked tasks into a resumed run.
- **Stop** runs the real gates — lint, tests, pytest — and refuses to let the run end on a
  red gate (exit 2), guarded by `stop_hook_active` so it can't loop. It is scoped to an
  active run (only fires once `docs/tasks.md` exists), so it never interferes with a repo
  before the pipeline starts. This is why "make reasonable assumptions and keep going" never
  becomes "skip the tests": product questions get answered and logged, objective failures
  get blocked.

`bash .claude/hooks/doctor.sh` checks dependencies and that hooks are executable.

## Independent verification — the part that isn't self-authored

The builders test their own code, so their tests inherit their blind spots. Three mechanisms
break that circularity, and none of them trust "the tests pass" at face value.

`gate-adversarial-tester` writes tests from `docs/PRD.md` and `docs/workflows.md` only. The
`blind-guard` hook blocks it from reading `src/`, `lib/`, `app/` — enforced, not requested —
so its tests attack the spec rather than mirror the implementation. Anything it breaks is a
defect the builder's suite missed.

`mutation-probe.sh` injects small faults into the code one at a time (`===`→`!==`,
`||`→`&&`, boolean flips) and confirms the suite catches each. Surviving mutants mean the
tests are green but hollow — passing without proving anything. The kill-rate must clear the
threshold in `config/factory.json` (default 0.8). No external mutation tool required.

`traceability.sh` verifies every `PRD-NNN` maps to a task and to a named test, and that no
task cites a criterion that doesn't exist. This catches the slow drift where many
locally-reasonable steps build a coherent product that no longer matches the spec.

`refine-spike-engineer` attacks the problem from the front instead: before the ADRs commit
to any empirically-checkable claim — how a library behaves, what a platform actually does —
it runs the smallest throwaway experiment that could refute it (`spikes/`, findings in
`docs/spikes/`, ledger rows re-based on `spike NNN`). Refinement otherwise runs entirely on
priors, and an unverified prior that reaches a "contractual" ADR becomes a defect a builder
faithfully implements. The `spike-guard` hook makes spike code throwaway by contract:
implementation files cannot reference `spikes/`, and the spike engineer cannot write product
code. Budget and the (default-off) network switch live in `config/factory.json` (`spikes.*`).

## The approval gate — human sign-off where it's irreversible

Reversible assumptions the factory just makes and logs. One-way assumptions — data-model
semantics, money movement, anything a migration can't cleanly undo — get a human decision
*before* code is built on them. While any one-way row is `REVIEW`, the `approval-guard` hook
blocks writes to implementation paths (docs, config, and tests stay open, so refinement
proceeds). `refine-assumption-auditor` writes `docs/assumption-audit.md` so the human approves
or redirects in minutes via `/approve-assumptions`, rather than reading forty rows after the
fact. For fully autonomous runs, set `assumptions.autoApproveOneWay: true` in
`config/factory.json` — the trade is explicit.

Tune thresholds and the autonomy switch in `config/factory.json`.

## Scaling to large programs — many small runs, not one big one

The factory scales recursively: never a run larger than a human can review the assumptions
of. `/program` applies the same refine → audit → approve → spike loop one level up, and the
unmodified factory runs per module underneath it.

**Decomposition goes through the gate, not around it.** `refine-program-planner` splits the
BDD into bounded-context modules (`docs/modules.md`) and blind-testable seam contracts
(`docs/contracts/NNN-*.md`) — and logs every boundary and contract as a `one-way` ledger
row. Module boundaries are the most expensive irreversible decision in a program, so they
get the same human sign-off as any other one-way call, then a mandatory walking-skeleton
spike passes one message across every seam before the contracts become contractual.

**Modules run the ordinary pipeline.** Each module is its own factory project
(`modules/<name>/` or its own repo) with its own PRD, ledger, gates, and a unique
`traceability.idPrefix`. Modules in the same wave share no dependency edge and run as
separate concurrent sessions — parallelism comes from independent runs, not from
parallelizing inside one run, so the ledger and run-log never race. Later waves enter each
module through the brownfield path (the archaeologist maps only that module).

**Recomposition is verified, not assumed.** Module certification proves the parts against
their own PRDs; after each wave `/integrate` proves the whole: `gate-integration-tester`
writes tests from the program BDD and the contracts alone (the blind-guard hook keeps it
out of every implementation), and `program-traceability.sh` checks the layer above the
per-module gate — modules ↔ contracts ↔ guarantees ↔ integration tests. A contract defect
is never patched inside a module: it becomes a new one-way row through approval, and the
certification of every module citing that contract is voided until re-verified.

**Decisions scale by inheritance, not repetition.** `docs/standing-decisions.md` holds
pre-approved program-wide policies (`SD-NNN`) so recurring one-way gaps stop re-raising
approval — the human signs a policy once instead of the same instance forty times.
`docs/adr/program/` is the inherited ADR tier: module architects cite it and may narrow but
never contradict it — the builders-don't-re-decide rule, one level up.

**Gates stay fast by delegation.** Each module's `testCommand` and `mutation.targets` are
scoped to the module; in a monorepo, scoping is delegated to the build tool's affected
graph (`turbo run test --filter=…`, `nx affected -t test`) instead of path logic in hooks.
The full unscoped suite runs at `/integrate`, so nothing rots unwatched.

## The deliverable that replaces the meetings

After a run, `docs/assumptions.md` is what a human reads instead of having been interrupted
forty times. `/assumptions` surfaces the one-way rows first, each with the flag or seam that
lets you change the decision. `docs/run-log.md`, `docs/PRD.md`, `docs/adr/`, and the handoff
docs from `doc-technical-writer` round out the audit trail.
