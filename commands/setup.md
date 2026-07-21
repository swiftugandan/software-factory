---
description: Prepare this project for the factory — docs/BDD/, config, helper scripts, optional permissions preset.
argument-hint: "[optional: hands-off]"
allowed-tools: Read, Write, Edit, Bash, Glob
model: sonnet
---

Bootstrap the current project so the factory can run. Argument: $ARGUMENTS

1. Mirror the helper scripts into the project:
   `!bash "${CLAUDE_PLUGIN_ROOT}/hooks/sync-project.sh"`
2. Create `docs/BDD/` if missing, and copy `${CLAUDE_PLUGIN_ROOT}/docs/BDD/README.md`
   into it (only if the project has no `docs/BDD/README.md`).
3. Copy `${CLAUDE_PLUGIN_ROOT}/config/factory.json` to `config/factory.json` if the
   project doesn't have one — it holds the mutation threshold, traceability prefix, and
   the `assumptions.autoApproveOneWay` autonomy switch.
4. Permissions: a plugin cannot ship a permissions policy, so unattended runs will stall
   on Bash approvals unless the project allows the commands the pipeline uses. If the
   user passed `hands-off` (or asks for it), merge ONLY the `permissions` object from
   `${CLAUDE_PLUGIN_ROOT}/templates/settings.json` into this project's
   `.claude/settings.json` — preserve any existing keys, and do NOT copy the `hooks`
   object from that template (the plugin already provides the hooks; wiring them twice
   runs every gate twice). Otherwise just mention the option.
5. Run the preflight: `!bash .claude/hooks/doctor.sh 2>/dev/null || true` — report what
   it says.

Finish by telling the user: drop the BDD and supporting docs into `docs/BDD/`, then run
`/software-factory:factory`. Suggest committing the generated files so teammates share
the same setup.
