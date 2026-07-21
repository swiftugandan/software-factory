---
description: Run only the refinement phase — PRD, workflows, task plan — from docs/BDD/.
argument-hint: "[optional scope note]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: opus
---

Refine the inputs in `docs/BDD/` without building anything yet. Scope note: $ARGUMENTS

If `.claude/hooks/log-assumption.sh` is missing, first run
`bash "${CLAUDE_PLUGIN_ROOT}/hooks/sync-project.sh"` so assumption logging works. If
`docs/BDD/` is empty, stop and ask for the BDD.

Dispatch `factory-orchestrator` scoped to refinement only: run its loop through the
refinement stages and stop once `docs/tasks.md` exists — no spikes, no ADRs, no building.
The stage order and gap policy are the orchestrator's own; do not restate them here.

When it returns, summarize the PRD criteria count, the workflows covered, the number of
tasks, and any `REVIEW` assumptions raised. This is the checkpoint to eyeball before
committing to a build.
