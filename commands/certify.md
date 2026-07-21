---
description: Certify the current build against the PRD and write handoff docs.
allowed-tools: Task, Read, Bash, Glob, Grep
model: sonnet
---

Before certifying, confirm the independent checks have run — if `/harden` hasn't been run
this cycle, run it now (adversarial tests, mutation probe, traceability). Do not certify on a
build that only passes its own tests.

Dispatch `gate-reality-checker` to certify the build against every criterion in `docs/PRD.md`
using real evidence. Run the suite; do not trust prior claims. Also run
`!bash .claude/hooks/traceability.sh` and treat any gap as a failed criterion.

If criteria fail, list them as defects for the orchestrator to route and stop there. If all
pass, dispatch `refine-assumption-auditor` for a final drift check, then `doc-technical-writer`
to produce the README, architecture overview, and the review summary of assumptions. Report
the certification result, the mutation kill-rate, and where the handoff docs landed.
