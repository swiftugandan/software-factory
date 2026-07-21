---
description: Program-level verification after a wave — blind integration tests against the composed system, contract traceability, contract-change routing.
argument-hint: "[optional wave number or focus]"
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, TodoWrite
model: opus
---

Verify the recomposition. Run at the program root after each wave of module runs — module
certification proves the parts against their own PRDs; only this stage proves the whole
against the program BDD and the contracts. Focus: $ARGUMENTS

Requires `docs/modules.md` and `docs/contracts/` (from `/program`). Every module in the
current wave should be certified before integrating — if one isn't, finish its run first.

1. Ensure the composed system can run: the harness the program ADRs define (compose file,
   process supervisor, whatever `docs/adr/program/` says). If no ADR defines one, dispatch
   `build-devops` to build it at the program root — a compose harness is program
   infrastructure, not a module's job.
2. Dispatch `gate-integration-tester` to write tests from the program BDD and
   `docs/contracts/` (blind to every implementation — the blind-guard hook enforces it) and
   run them against the composed system. It classifies each failure as a module defect or a
   contract defect.
3. Run `!bash .claude/hooks/program-traceability.sh`. Close any gap it reports — an uncited
   contract, an untested guarantee — before certifying the wave.

Route what fails per the `contract-protocol` skill — load it before routing anything; it is
the single owner of the module-defect vs contract-defect classification and of what a
contract revision entails (planner → approval → void and re-verify every module citing the
contract). The integration tester and the orchestrator carry the same skill, so all three
levels route by one policy.

Report: integration tests passing/failing by contract, defects routed (module vs contract),
program-traceability result, and whether the wave is clear to proceed. A wave is done only
when the integration suite is green and program traceability is clean.
