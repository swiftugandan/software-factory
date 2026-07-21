# Spike 001 — protocol

**Claim under test** (from the roster proposal): a refinement agent can produce an
evidence-derived map of an existing codebase that (a) is accurate, (b) resists going
narrative, and (c) gives the factory what it needs downstream (guard paths, test
commands, de-facto contracts).

**Method**: run the draft prompt (draft-agent.md) as a subagent against a real brownfield
target (expressjs/express, shallow clone, 141 JS files, mature test suite), with a
realistic extension mission (built-in rate-limiting middleware). Then verify:

1. Sample ≥10 [E] claims; check each against the repo. Accuracy = correct / sampled.
2. Count labeling discipline: unlabeled claims, [I] presented load-bearing.
3. Check downstream fit: does §4 give the guards and gates what they actually consume?
4. Record cost (tokens, wall-clock).

**Verdicts**: VERIFIED (accuracy ≥ 90%, discipline holds, downstream-fit yes) /
REFUTED (systematic hallucination or narrative drift) / INCONCLUSIVE.
Findings → docs/spikes/001-archaeologist.md; the real agent file ships only on VERIFIED,
amended by whatever failure modes the spike exposes.
