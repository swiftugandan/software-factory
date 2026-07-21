# Spike 001 — refine-codebase-archaeologist prototype

**Claim tested**: a refinement agent can map an existing codebase evidence-first —
accurate, resistant to narrative drift, and directly consumable by the factory's guards
and builders. (Protocol: `spikes/001-archaeologist/protocol.md`.)

**Experiment**: draft prompt (`spikes/001-archaeologist/draft-agent.md`) run as a subagent
against a shallow clone of expressjs/express (5.2.1, 141 JS files), mission-weighted
toward a hypothetical "add built-in per-route rate limiting" extension. The agent ran the
real suite (`npm test` → 1260 passing), executed 6 behavioral probes, and produced a
59-line map with 32 [E] and 12 [I] claims.

**Verification**: 16 claims sampled across all sections and checked against the repo
(citations at file:line, eslint rules, negative-evidence grep, one probe re-run).
15/16 exact; the one miss ("73 test files", actual 70) was also the only sampled claim
lacking a command citation. Probe-02 reproduced. Cost: ~60k subagent tokens, ~3.6 min
wall-clock plus one `npm install`.

**Verdict: VERIFIED** — with amendments the run itself surfaced:

1. Line cap is a ceiling, not a target ("hard cap 150; shorter is better") — the 59-line
   map was complete; padding pressure is real.
2. Claim granularity defined: one claim = one labeled bullet.
3. Negative evidence needs a sanctioned citation form — the most decision-relevant claim
   ("suite has zero rate/429/timing coverage") cites a grep returning nothing:
   `[E: absence — <command> → 0 hits]`.
4. Dependency boundary made explicit: the observed, probe-verified contract of a
   dependency is in scope (Express 5's entire router lives in `router@2.2.0`); dependency
   internals go to Unknowns.
5. Canonical output locations fixed: map → `docs/current-state.md`, probes →
   `spikes/000-archaeology/` (reserved number), both under spike-guard containment;
   "change nothing" applies to implementation paths, which the hook now enforces rather
   than requests.
6. Probes resolve the target's modules by absolute path; probes bring no dependencies of
   their own.
7. Every quantitative claim needs a command citation (the one verification miss was an
   uncited count).

**Roster consequence**: `refine-codebase-archaeologist` ships (agents/), spike-guard
extends its containment to it, orchestrator gains a brownfield step 1, and the map may
record the detected test command into `config/factory.json` so the Stop gate runs the
*existing* suite on brownfield projects.
