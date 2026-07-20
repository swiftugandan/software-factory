---
description: Run the whole factory from the BDD in docs/BDD/ to certified software.
argument-hint: "[optional note or focus]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: opus
---

Run the software factory end to end.

Inputs are in `docs/BDD/`. Additional focus for this run: $ARGUMENTS

Dispatch `factory-orchestrator` and let it drive the full pipeline: refine → plan → ADRs →
build → per-change gates → test coverage → reality-checker certification → docs. Do not stop
for product questions; resolve gaps via the `assumption-ledger` policy and log them. Stop only
if the objective gate is red and cannot be made green.

When the run completes, report: criteria certified, tasks shipped, and the count of `REVIEW`
rows in `docs/assumptions.md` a human should look at.
