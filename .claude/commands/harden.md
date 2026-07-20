---
description: Independent verification pass — adversarial tests, mutation probe, traceability.
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep
model: opus
---

Run the checks the build did not write for itself, before certifying.

1. Dispatch `gate-adversarial-tester` to write spec-derived tests (blind to the
   implementation) and run them against the build. Any failure is a real defect — route it to
   `fix-minimal-change` and keep the test.
2. Run the mutation probe: `!bash .claude/hooks/mutation-probe.sh`. Survivors mean the tests
   are green but hollow; strengthen them via `gate-test-automation` and re-run until the
   kill-rate clears the threshold in config/factory.json.
3. Run traceability: `!bash .claude/hooks/traceability.sh`. Close any PRD criterion that lacks
   a task or a test before proceeding.

Report: adversarial defects found and fixed, mutation kill-rate, and traceability result.
Only when all three are clean should the run move to `/certify`.
