---
description: Run the whole factory from the BDD in docs/BDD/ to certified software.
argument-hint: "[optional note or focus]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: fable
---

Run the software factory end to end.

Inputs are in `docs/BDD/`. Additional focus for this run: $ARGUMENTS

First, if `.claude/hooks/log-assumption.sh` or `docs/BDD/` is missing, bootstrap by
running `bash "${CLAUDE_PLUGIN_ROOT}/hooks/sync-project.sh"` and creating `docs/BDD/`
(and `config/factory.json` from `${CLAUDE_PLUGIN_ROOT}/config/factory.json` if absent).
If `docs/BDD/` is empty, stop and ask for the BDD — that input is the one thing the
factory cannot assume.

Dispatch `factory-orchestrator` and let it drive the full pipeline: refine → plan → ADRs →
build → per-change gates → test coverage → reality-checker certification → docs. Do not stop
for product questions; resolve gaps via the `assumption-ledger` policy and log them. Stop only
if the objective gate is red and cannot be made green.

When the run completes, report: criteria certified, tasks shipped, and the count of `REVIEW`
rows in `docs/assumptions.md` a human should look at.
