---
description: Run only the refinement phase — PRD, workflows, task plan — from docs/BDD/.
argument-hint: "[optional scope note]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep
model: opus
---

Refine the inputs in `docs/BDD/` without building anything yet. Scope note: $ARGUMENTS

Dispatch in order: `refine-product-manager` → `refine-workflow-architect` →
`refine-task-planner`. Each reads the prior output. Resolve gaps via the `assumption-ledger`
policy and log them.

When done, summarize the PRD criteria count, the workflows covered, the number of tasks, and
any `REVIEW` assumptions raised during refinement. This is the checkpoint to eyeball before
committing to a build.
