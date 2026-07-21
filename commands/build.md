---
description: Build from an existing task plan — walk docs/tasks.md through gates.
argument-hint: "[task id, or blank for all unchecked]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: opus
---

Build against the existing `docs/tasks.md`. Target: $ARGUMENTS (a task id, or all unchecked
tasks if blank).

Requires `docs/PRD.md`, `docs/workflows.md`, and `docs/tasks.md` to exist — if any is
missing, run `/refine` first and stop.

Dispatch `factory-orchestrator` scoped to building: skip refinement (the docs exist), start
from its ADR step, and walk the task list — only the target task and its unchecked
dependencies when a task id was given. The build loop, per-task gates, check-off rules, and
bounded defect routing are the orchestrator's own; do not restate or override them here.

When it returns, report: tasks completed, gates run, and any defect loop it stopped with.
