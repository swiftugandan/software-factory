# Software Factory — a Claude Code crew

A subagent pipeline that turns a Business Design Document into reviewed, tested software,
making and recording reasonable assumptions instead of stopping to ask a human. Built on the
agent roster in [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents);
each subagent here maps to one of those roles and is wired for Claude Code.

## Point a project at the factory

From inside any project — new (`git init && cd` into it) or existing — run:

```
curl -fsSL https://raw.githubusercontent.com/swiftugandan/software-factory/main/install.sh | bash
```

The installer fetches this repo, copies `.claude/` + `CLAUDE.md` + `config/factory.json` in,
and runs preflight. It is safe on existing projects: a project's own `CLAUDE.md` is kept
(the factory's is imported via `CLAUDE.factory.md`) and a pre-existing `.claude/settings.json`
is saved as `settings.json.pre-factory` before the factory's hooks take over. Re-run the same
one-liner any time to update to the latest factory. To pin a version or fork:

```
curl -fsSL https://raw.githubusercontent.com/swiftugandan/software-factory/main/install.sh \
  | FACTORY_REF=main FACTORY_REPO=swiftugandan/software-factory bash
```

From a local clone of this repo, `./install.sh /path/to/your/repo` does the same thing.
Or copy `.claude/` and `CLAUDE.md` in by hand and run `bash .claude/hooks/doctor.sh`.
Then drop your BDD and supporting docs into `docs/BDD/`, open Claude Code, and run `/factory`.

`jq` is recommended (the standard hook dependency; scripts degrade without it but are less
precise). Node and git are needed only if you build a JS project and want commit-per-task.
The preflight tells you what's missing.

## Run

- `/factory` — the whole pipeline, BDD to certified software.
- `/refine` — refinement only (PRD, workflows, task plan). The checkpoint to review before building.
- `/approve-assumptions` — sign off on one-way (irreversible) decisions before they're built.
- `/build [task-id]` — build from an existing task plan.
- `/harden` — independent verification: adversarial tests, mutation probe, traceability.
- `/certify` — certify against the PRD and write handoff docs.
- `/assumptions` — read the ledger, one-way decisions first.

Try it against the bundled example: `cp examples/BDD-link-shortener.md docs/BDD/` then `/factory`.

Hands-off operation is the default. `settings.json` ships with `defaultMode: acceptEdits`
and an allow-list covering every command the pipeline runs (npm/pytest/node/git plus the
ledger helper), so an unattended run doesn't stall on approvals. `git push` and `gh` still
prompt; `rm -rf`, `sudo`, `curl`, `wget`, and reading `.env` are denied. For a fully headless
run: `claude -p "/factory" --permission-mode acceptEdits`.

Two things to expect on first use: Claude Code asks you to trust the project's hooks once
(they run shell commands — inspect `.claude/hooks/` first), and the Stop gate stays inert
until you actually start the pipeline, so installing into an existing repo won't touch it.

## How the pipeline maps to agency-agents

| Stage | Subagent | agency-agents source |
|---|---|---|
| PRD | `refine-product-manager` | product/product-manager |
| Path mapping | `refine-workflow-architect` | specialized/specialized-workflow-architect |
| Task graph | `refine-task-planner` | project-management/project-manager-senior |
| Drift audit | `refine-assumption-auditor` | (composite check — no single source) |
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

Model tiers: Opus for orchestration, product, and architecture; Sonnet for builders and
tests; Haiku for the read-only per-diff gates. Read-only gates carry `disallowedTools:
Write, Edit` so a reviewer cannot rewrite the thing it is reviewing.

## What makes it autonomous

The `assumption-ledger` skill (`.claude/skills/assumption-ledger/`) is preloaded into every
agent that faces gaps. It classifies each gap as reversible-with-a-default, product-shaped,
or irreversible, and says what to do with each. Agents log decisions with
`.claude/hooks/log-assumption.sh`, which writes a structured row to `docs/assumptions.md`.
One-way decisions land behind a config flag or interface and are flagged `REVIEW`.

Determinism the model cannot override lives in the hooks (`.claude/settings.json`):

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

## The deliverable that replaces the meetings

After a run, `docs/assumptions.md` is what a human reads instead of having been interrupted
forty times. `/assumptions` surfaces the one-way rows first, each with the flag or seam that
lets you change the decision. `docs/run-log.md`, `docs/PRD.md`, `docs/adr/`, and the handoff
docs from `doc-technical-writer` round out the audit trail.
