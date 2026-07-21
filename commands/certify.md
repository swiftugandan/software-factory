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
pass, write the certification marker `docs/certified.md`: the UTC date and criteria count,
plus — when `docs/BDD/contracts/` exists (this project is one module of a program) — one
line per contract copy in the form `NNN sha256=<hash>` (from
`sha256sum docs/BDD/contracts/NNN-*.md`), recording exactly which contract text this module
was certified against. The program-level `program-traceability.sh` compares those hashes
against the current `docs/contracts/` to void certifications that predate a contract
revision. Then dispatch `refine-assumption-auditor` for a final drift check, and
`doc-technical-writer` to produce the README, architecture overview, and the review summary
of assumptions. Report the certification result, the mutation kill-rate, and where the
handoff docs landed.
