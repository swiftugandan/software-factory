---
description: Build from an existing task plan — walk docs/tasks.md through gates.
argument-hint: "[task id, or blank for all unchecked]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: fable
---

Build against the existing `docs/tasks.md`. Target: $ARGUMENTS (a task id, or all unchecked
tasks if blank).

Requires `docs/PRD.md`, `docs/workflows.md`, and `docs/tasks.md` to exist — if any is
missing, run `/refine` first. Ensure `docs/adr/` is populated (dispatch
`build-software-architect` if empty), then dispatch the build agent each task names, followed
by `gate-code-reviewer`, `gate-secops`, and `gate-test-automation`. Check off tasks only when
their PRD criterion has a passing test. Route defects to `fix-minimal-change`.
