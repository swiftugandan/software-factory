---
name: assumption-ledger
description: "The decision policy for resolving gaps in source docs without stopping to ask a human. Consult whenever the BDD, PRD, or a task leaves something unspecified: which datastore, what an unstated error path should do, a field's validation rule, a default, a naming choice, anything a competent contractor would just decide. Tells you how to classify the gap, what to do, and how to record it."
---

# Resolving gaps without halting

A gap is anything the source docs don't answer that you need answered to make progress.
Classify it, act, and log it. You never stop the run for a gap.

## Classify

**Reversible + has an industry default.** Datastore, timestamp format, delete semantics,
auth method, id strategy, pagination style, log format. Pick the default in CLAUDE.md or
the obvious industry norm and proceed. Log it, reversibility `cheap`.

**Reversible but product-shaped.** A workflow the BDD doesn't cover — what happens when a
user cancels mid-checkout, what an empty dashboard shows, whether an admin can edit a
locked record. `refine-workflow-architect` picks the path with least user surprise;
`refine-product-manager` checks it against the PRD's intent. Log it, reversibility `cheap`.

**Irreversible.** Data-model semantics, money movement, anything that deletes user data,
anything a later migration can't cleanly undo. Still proceed — but implement behind a
config flag in `config/` or behind an interface seam, and log it with reversibility
`one-way`. The ledger entry is what a human reviews and flips after the run.

## Decide well

- Prefer the choice that a later change can revise without a data migration.
- Prefer the narrowest interpretation of the BDD over an expansive one; a smaller build
  that matches intent beats a larger one that guesses at scope.
- When two defaults compete, pick the one already implied elsewhere in the source docs,
  then the one most common in the target stack.
- Cite the BDD section that makes your assumption reasonable. If nothing supports it, that
  is a signal the gap may be product-shaped — route it accordingly.

## Record

Append an entry with the helper (it creates the ledger and header if absent):

```
./.claude/hooks/log-assumption.sh \
  --gap "..." --assumption "..." \
  --reversibility one-way|cheap \
  --basis "BDD 4.2" --owner <your-agent-name>
```

Each entry carries: the gap, the assumption, reversibility, the BDD basis, and the owner.
`one-way` entries must name the flag or interface that makes them reversible in practice.

## The line you do stop for

Objective gates. A failing test, a lint error, a leaked secret, a broken build. Those are
not product questions — they are defects. Fix them (or route to `fix-minimal-change`) and
continue. The Stop hook enforces this; it will not let the run end on a red gate.
