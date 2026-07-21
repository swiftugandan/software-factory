---
description: Review and sign off on one-way (irreversible) assumptions before they're built.
argument-hint: "[optional: all]"
allowed-tools: Task, Read, Bash
model: sonnet
---

Present the irreversible decisions for a human call. Argument: $ARGUMENTS

1. If `docs/assumption-audit.md` exists, summarize its findings first — especially any drift
   or load-bearing one-way assumptions it flagged.
2. Show the pending rows: `!bash .claude/hooks/approve-assumptions.sh --list`.
3. For each, state the decision, why it's one-way, and the flag or interface that would let a
   human change it later. Recommend approve or reject.

Then act on the user's decision with
`.claude/hooks/approve-assumptions.sh --approve N` / `--reject N --note "…"` /
`--approve-all`. Until pending one-way rows are cleared (or autoApproveOneWay is set), the
approval-guard hook blocks writes to implementation paths — so this is the gate that lets the
build proceed.
