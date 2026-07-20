# Software Factory

This project turns a Business Design Document (BDD) and supporting docs into working,
reviewed, tested software with minimal human interruption. The pipeline is a set of
subagents coordinated by `factory-orchestrator`, gated by hooks that run real checks.

## Inputs

- `docs/BDD/` — the Business Design Document and any supporting material (specs, wireframes,
  data dictionaries, brand notes). Drop files here before running `/factory`.
- If a referenced input is missing, that is itself an assumption to log — do not stop.

## The one rule that makes this autonomous

**Never halt to ask a question a competent contractor could answer.** When the source
docs leave a gap, resolve it, record the decision in the ledger, and keep moving. Use the
`assumption-ledger` skill for the decision policy. The only thing that stops the run is a
failing objective gate (tests, lint, secrets scan), never an unanswered product question.

Recording is not optional. Log every non-obvious decision with:

```
./.claude/hooks/log-assumption.sh \
  --gap "what the source docs left unspecified" \
  --assumption "what we decided to do" \
  --reversibility one-way|cheap \
  --basis "BDD 4.2" \
  --owner refine-product-manager
```

Entries marked `one-way` are implemented behind a config flag or an interface seam so a
human can flip them after the run. Read `docs/assumptions.md` before finishing.

## Pipeline order

1. `refine-product-manager` → `docs/PRD.md` (acceptance criteria, one per testable behavior)
2. `refine-workflow-architect` → `docs/workflows.md` (every path, including error/empty/permission states)
3. `refine-task-planner` → `docs/tasks.md` (dependency-ordered checklist, each task cites a PRD criterion)
4. `refine-assumption-auditor` → `docs/assumption-audit.md`, then the approval checkpoint:
   one-way assumptions signed off via `/approve-assumptions` before any code is written
   (enforced by the approval-guard hook)
5. `build-software-architect` → `docs/adr/NNNN-*.md` (decisions cited by number; builders never re-decide)
6. Build agents implement tasks: `build-backend`, `build-frontend`, `build-database`, `build-devops`
7. Per change: `gate-code-reviewer`, `gate-secops`
8. Continuously: `gate-test-automation` writes tests tied to PRD criteria
9. Independent verification (`/harden`): `gate-adversarial-tester` (blind to the code) + mutation probe + traceability
10. `gate-reality-checker` certifies against acceptance criteria, not "tests pass"
11. Defects loop back through `fix-minimal-change`, never a rewrite
12. `doc-technical-writer` produces handoff docs from ADRs + ledger

## Conventions the whole factory follows

- Postgres unless the BDD names a datastore. UTC everywhere. Soft deletes for user-owned rows.
- Email/password + OAuth unless the BDD specifies SSO. English-only until it mentions locales.
- Every irreversible choice lands behind a flag in `config/` or an interface, never inline.
- Tasks are done when their PRD criterion has a passing test AND the reality checker signs off.
- Commits reference the task id and PRD criterion. No scope beyond the task in the diff.

## What lives where

- `docs/PRD.md`, `docs/workflows.md`, `docs/tasks.md`, `docs/adr/` — refinement outputs
- `docs/assumptions.md` — the ledger (the deliverable that replaces stakeholder meetings)
- `docs/run-log.md` — appended by the SubagentStop hook; observability for the run
- `src/`, `tests/`, `config/` — the software
