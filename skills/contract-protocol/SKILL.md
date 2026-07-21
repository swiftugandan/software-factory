---
name: contract-protocol
description: "The routing policy for seam defects in program mode. Consult when an integration test fails, when a contract in docs/contracts/ (or a module's read-only copy in docs/BDD/contracts/) seems wrong or unimplementable, or when a module cannot conform without reinterpreting the contract text. Tells you how to classify the defect, who fixes it, and what a contract revision entails. This file is the single owner of this policy — agent prompts and commands reference it, they do not restate it."
---

# Module defect or contract defect

Every seam failure is one of two things, and they route differently. Classify first.

**Module defect** — one module observably violates the contract text. The contract is fine;
the implementation isn't.

- Route: a new task in that module's `docs/tasks.md`, fixed by `fix-minimal-change` inside
  that module's run, then re-run the integration suite. Keep the failing test.
- Bounded like every defect loop: at most two focused attempts, then stop and report the
  gate, its output, and the smallest change that would fix it.

**Contract defect** — modules that each conform to the text still disagree, or a guarantee
is untestable or unimplementable as written. The text itself is wrong.

- Never patched locally, never bent in a test, never "clarified" inside one module — a
  locally-patched contract certifies a module against a spec its neighbors don't share,
  which is worse than the defect. (The program-guard hook blocks the write regardless.)
- Route: `refine-program-planner` revises the contract at program level — a new `one-way`
  ledger row through `/approve-assumptions`, like the original decomposition.
- When the revision is approved, the certification of every module citing that contract is
  void — it certified conformance to the old text. Uncheck those module rows in
  `docs/modules.md`, queue a re-verification task in each affected module, and re-run their
  gates before re-integrating. `program-traceability.sh` catches missed voids by comparing
  each module's certified contract hashes (`docs/certified.md`) against the current text.

**If you are inside a module run** and discover a contract defect: log a `one-way` row
naming the contract, stop the affected task, and report upward for `/integrate` to route.
Do not build a workaround that encodes your reinterpretation — that is the local patch with
extra steps.
