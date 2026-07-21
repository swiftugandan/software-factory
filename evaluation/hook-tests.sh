#!/usr/bin/env bash
# Deterministic unit tests for the software-factory enforcement hooks.
# Each test simulates the JSON Claude Code feeds a hook and asserts on the exit code
# (0 = allow, 2 = block) and on side effects. Run from anywhere.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/hooksandbox.XXXX")"
mkdir -p "$SANDBOX/.claude"
cp -r "$REPO/hooks" "$SANDBOX/.claude/hooks"
cd "$SANDBOX"

pass=0; fail=0; results=""
check() { # check <name> <expected_exit> <actual_exit>
  local name="$1" want="$2" got="$3"
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); results="$results PASS  $name (exit $got)"$'\n'
  else
    fail=$((fail+1)); results="$results FAIL  $name (want exit $want, got $got)"$'\n'
  fi
}

hook() { # hook <script> <json-on-stdin>
  printf '%s' "$2" | bash ".claude/hooks/$1" >/dev/null 2>&1; echo $?
}

### 0. scoping: side-effect hooks are inert outside a factory project (no docs/BDD,
###    docs/tasks.md, or config/factory.json — the plugin may be enabled globally)
hook ledger-guard.sh '{"tool_input":{"file_path":"src/x.js"}}' >/dev/null
[ ! -f docs/assumptions.md ] && check "ledger-guard inert outside factory project" 0 0 \
  || check "ledger-guard inert outside factory project" 0 1
printf '{"agent_type":"build-backend"}' | bash .claude/hooks/run-log.sh >/dev/null 2>&1
[ ! -f docs/run-log.md ] && check "run-log inert outside factory project" 0 0 \
  || check "run-log inert outside factory project" 0 1

# Everything below runs in an engaged factory project.
mkdir -p docs/BDD

### 1. blind-guard: adversarial tester must not read implementation
check "blind-guard blocks tester reading src/" 2 \
  "$(hook blind-guard.sh '{"agent_type":"gate-adversarial-tester","tool_input":{"file_path":"src/index.js"}}')"
check "blind-guard blocks tester globbing lib/" 2 \
  "$(hook blind-guard.sh '{"agent_type":"gate-adversarial-tester","tool_input":{"path":"lib/util.ts"}}')"
check "blind-guard allows tester reading docs/PRD.md" 0 \
  "$(hook blind-guard.sh '{"agent_type":"gate-adversarial-tester","tool_input":{"file_path":"docs/PRD.md"}}')"
check "blind-guard allows tester reading tests/" 0 \
  "$(hook blind-guard.sh '{"agent_type":"gate-adversarial-tester","tool_input":{"file_path":"tests/app.test.js"}}')"
check "blind-guard ignores other agents on src/" 0 \
  "$(hook blind-guard.sh '{"agent_type":"build-backend","tool_input":{"file_path":"src/index.js"}}')"
check "blind-guard blocks integration tester on module src/" 2 \
  "$(hook blind-guard.sh '{"agent_type":"gate-integration-tester","tool_input":{"file_path":"modules/auth/src/index.js"}}')"
check "blind-guard allows integration tester on contracts" 0 \
  "$(hook blind-guard.sh '{"agent_type":"gate-integration-tester","tool_input":{"file_path":"docs/contracts/001-auth.md"}}')"
check "blind-guard allows integration tester on module docs" 0 \
  "$(hook blind-guard.sh '{"agent_type":"gate-integration-tester","tool_input":{"file_path":"modules/auth/docs/PRD.md"}}')"

### 1b. spike-guard: spike code is throwaway by contract
check "spike-guard blocks spike engineer writing src/" 2 \
  "$(hook spike-guard.sh '{"agent_type":"refine-spike-engineer","tool_input":{"file_path":"src/index.ts","content":"export const x = 1"}}')"
check "spike-guard allows spike engineer writing spikes/" 0 \
  "$(hook spike-guard.sh '{"agent_type":"refine-spike-engineer","tool_input":{"file_path":"spikes/001-ajv-coercion/probe.ts","content":"..."}}')"
check "spike-guard allows spike engineer writing docs/spikes/" 0 \
  "$(hook spike-guard.sh '{"agent_type":"refine-spike-engineer","tool_input":{"file_path":"docs/spikes/001-ajv-coercion.md","content":"..."}}')"
check "spike-guard blocks src/ importing from spikes/" 2 \
  "$(hook spike-guard.sh '{"agent_type":"build-backend","tool_input":{"file_path":"src/app.ts","content":"import { probe } from \"../spikes/001/probe.js\";"}}')"
check "spike-guard allows clean src/ writes" 0 \
  "$(hook spike-guard.sh '{"agent_type":"build-backend","tool_input":{"file_path":"src/app.ts","content":"export const clean = true;"}}')"
check "spike-guard allows builders writing tests/" 0 \
  "$(hook spike-guard.sh '{"agent_type":"gate-test-automation","tool_input":{"file_path":"tests/app.test.ts","content":"it(\"works\")"}}')"
check "spike-guard blocks archaeologist writing src/" 2 \
  "$(hook spike-guard.sh '{"agent_type":"refine-codebase-archaeologist","tool_input":{"file_path":"src/index.ts","content":"export {}"}}')"
check "spike-guard allows archaeologist writing docs/ + probes" 0 \
  "$(hook spike-guard.sh '{"agent_type":"refine-codebase-archaeologist","tool_input":{"file_path":"docs/current-state.md","content":"# map"}}')"

### 2. ledger-guard: creates the ledger so agents always have somewhere to log
rm -f docs/assumptions.md
hook ledger-guard.sh '{"tool_input":{"file_path":"src/x.js"}}' >/dev/null
[ -f docs/assumptions.md ] && check "ledger-guard creates missing ledger" 0 0 \
  || check "ledger-guard creates missing ledger" 0 1

### 3. log-assumption: rows, numbering, one-way => REVIEW
rm -f docs/assumptions.md
bash .claude/hooks/log-assumption.sh --gap g1 --assumption a1 --reversibility cheap --basis b --owner o >/dev/null 2>&1
bash .claude/hooks/log-assumption.sh --gap g2 --assumption a2 --reversibility one-way --basis b --owner o >/dev/null 2>&1
rows=$(grep -cE '^\| [0-9]+ \|' docs/assumptions.md)
[ "$rows" = 2 ] && check "log-assumption appends numbered rows" 0 0 || check "log-assumption appends numbered rows" 0 1
grep -qE '^\| 2 \|.*one-way.*REVIEW \|$' docs/assumptions.md \
  && check "one-way row gets REVIEW status" 0 0 || check "one-way row gets REVIEW status" 0 1
bash .claude/hooks/log-assumption.sh --gap g3 --assumption a3 --reversibility maybe 2>/dev/null
check "log-assumption rejects bad reversibility" 1 $?

### 4. approval-guard: one-way REVIEW blocks implementation writes, not docs/tests
mkdir -p config && echo '{"assumptions":{"autoApproveOneWay":false}}' > config/factory.json
check "approval-guard blocks src/ write while REVIEW pending" 2 \
  "$(hook approval-guard.sh '{"tool_input":{"file_path":"src/index.js"}}')"
check "approval-guard allows docs/ write while REVIEW pending" 0 \
  "$(hook approval-guard.sh '{"tool_input":{"file_path":"docs/PRD.md"}}')"
check "approval-guard allows tests/ write while REVIEW pending" 0 \
  "$(hook approval-guard.sh '{"tool_input":{"file_path":"tests/app.test.js"}}')"
echo '{"assumptions":{"autoApproveOneWay":true}}' > config/factory.json
check "approval-guard honors autoApproveOneWay escape hatch" 0 \
  "$(hook approval-guard.sh '{"tool_input":{"file_path":"src/index.js"}}')"
echo '{"assumptions":{"autoApproveOneWay":false}}' > config/factory.json

### 5. approve-assumptions: approval clears the block
bash .claude/hooks/approve-assumptions.sh --approve 2 >/dev/null 2>&1
check "approval-guard unblocks after /approve-assumptions" 0 \
  "$(hook approval-guard.sh '{"tool_input":{"file_path":"src/index.js"}}')"
grep -qE '^\| 2 \|.*APPROVED \|$' docs/assumptions.md \
  && check "approve marks row APPROVED" 0 0 || check "approve marks row APPROVED" 0 1

### 6. factory-gate (Stop hook): inert pre-plan, blocks on red tests, respects stop_hook_active
rm -f docs/tasks.md
check "factory-gate inert before docs/tasks.md exists" 0 \
  "$(hook factory-gate.sh '{"stop_hook_active":false}')"
echo '- [ ] T1 (PRD-001)' > docs/tasks.md
cat > package.json <<'EOF'
{"name":"sbx","version":"1.0.0","scripts":{"test":"node -e \"process.exit(1)\""}}
EOF
check "factory-gate blocks stop while npm test is red" 2 \
  "$(hook factory-gate.sh '{"stop_hook_active":false}')"
check "factory-gate yields when stop_hook_active (no infinite loop)" 0 \
  "$(hook factory-gate.sh '{"stop_hook_active":true}')"
cat > package.json <<'EOF'
{"name":"sbx","version":"1.0.0","scripts":{"test":"node -e \"process.exit(0)\""}}
EOF
check "factory-gate allows stop when tests green" 0 \
  "$(hook factory-gate.sh '{"stop_hook_active":false}')"
rm -f docs/assumptions.md; mkdir -p src && echo 'x' > src/index.js
check "factory-gate blocks stop when code exists without ledger" 2 \
  "$(hook factory-gate.sh '{"stop_hook_active":false}')"

### 7. traceability: catches missing task/test coverage and orphan ids
mkdir -p docs tests
printf '# PRD\n- PRD-001 does a thing\n- PRD-002 does another\n' > docs/PRD.md
printf '# Tasks\n- [ ] T1 build thing (PRD-001)\n' > docs/tasks.md
printf '// covers PRD-001\n' > tests/a.test.js
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability fails on uncovered criterion (PRD-002)" 1 $?
printf '# Tasks\n- [ ] T1 (PRD-001)\n- [ ] T2 (PRD-002)\n- [ ] T3 (PRD-999)\n' > docs/tasks.md
printf '// covers PRD-001 and PRD-002\n' > tests/a.test.js
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability fails on orphan task id (PRD-999)" 1 $?
printf '# Tasks\n- [ ] T1 (PRD-001)\n- [ ] T2 (PRD-002)\n' > docs/tasks.md
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability passes when fully mapped" 0 $?

### 8. mutation-probe: hollow tests fail the probe, real tests pass it
rm -rf src tests; mkdir -p src tests
cat > src/calc.js <<'EOF'
function isAdult(age) { return age >= 18; }
function bothTrue(a, b) { return a && b; }
module.exports = { isAdult, bothTrue };
EOF
# Hollow suite: runs the code, asserts nothing meaningful
cat > tests/calc.test.js <<'EOF'
const { isAdult, bothTrue } = require('../src/calc');
isAdult(30); bothTrue(true, true);
console.log('ok');
EOF
cat > package.json <<'EOF'
{"name":"sbx","version":"1.0.0","scripts":{"test":"node tests/calc.test.js"}}
EOF
bash .claude/hooks/mutation-probe.sh --test-cmd "npm test --silent" --threshold 0.8 --max 10 >/tmp/probe-hollow.log 2>&1
check "mutation-probe flags hollow test suite" 1 $?
# Real suite: asserts behavior
cat > tests/calc.test.js <<'EOF'
const assert = require('assert');
const { isAdult, bothTrue } = require('../src/calc');
assert.strictEqual(isAdult(18), true);
assert.strictEqual(isAdult(17), false);
assert.strictEqual(bothTrue(true, false), false);
assert.strictEqual(bothTrue(true, true), true);
console.log('ok');
EOF
bash .claude/hooks/mutation-probe.sh --test-cmd "npm test --silent" --threshold 0.8 --max 10 >/tmp/probe-real.log 2>&1
check "mutation-probe passes assertive test suite" 0 $?

### 9. traceability is scheme-robust (F1 fix): auto-detects the criterion prefix
rm -rf src tests package.json; mkdir -p docs config
echo '{"traceability":{"idPrefix":""}}' > config/factory.json
mkdir -p tests
# AC-scheme PRD (the scheme that bricked the real run) must now be handled
printf '# PRD\n- AC-1 a\n- AC-2 b\n' > docs/PRD.md
printf '# Tasks\n- [ ] T1 (AC-1)\n- [ ] T2 (AC-2)\n' > docs/tasks.md
printf '// covers AC-1 and AC-2\n' > tests/a.test.js
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability handles AC-scheme (was fatal before fix)" 0 $?
# PRD-scheme still works
printf '# PRD\n- PRD-1 a\n- PRD-2 b\n' > docs/PRD.md
printf '# Tasks\n- [ ] T1 (PRD-1)\n- [ ] T2 (PRD-2)\n' > docs/tasks.md
printf '// covers PRD-1 and PRD-2\n' > tests/a.test.js
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability still handles canonical PRD-scheme" 0 $?
# explicit config pin is honored
printf '# PRD\n- AC-1 a\n' > docs/PRD.md; printf '# Tasks\n- [ ] T1 (AC-1)\n' > docs/tasks.md; printf '// AC-1\n' > tests/a.test.js
echo '{"traceability":{"idPrefix":"AC"}}' > config/factory.json
bash .claude/hooks/traceability.sh >/dev/null 2>&1
check "traceability honors config idPrefix pin" 0 $?

### 10. run-log never logs a blank name (F2 fix)
rm -f docs/run-log.md
printf '{"agent_type":""}' | bash .claude/hooks/run-log.sh >/dev/null 2>&1
printf '{"agent_id":"orch-1"}' | bash .claude/hooks/run-log.sh >/dev/null 2>&1
printf '{}' | bash .claude/hooks/run-log.sh >/dev/null 2>&1
blanks=$(grep -c 'finished \*\*\*\*' docs/run-log.md 2>/dev/null || true); blanks="${blanks:-0}"
[ "$blanks" -eq 0 ] && check "run-log: empty agent_type falls back, no blank entries" 0 0 \
                    || check "run-log: empty agent_type falls back, no blank entries" 0 1
grep -q 'finished \*\*orch-1\*\*' docs/run-log.md \
  && check "run-log: agent_id used when agent_type absent" 0 0 || check "run-log: agent_id used when agent_type absent" 0 1

### 11. mutation-probe wall-clock budget stops cleanly, no divide-by-zero (F4 fix)
rm -rf src tests; mkdir -p src
cat > src/calc.js <<'EOF'
function isAdult(age){ return age >= 18; }
module.exports={isAdult};
EOF
cat > mtest.js <<'EOF'
const assert=require('assert');const{isAdult}=require('./src/calc');
assert.strictEqual(isAdult(18),true);assert.strictEqual(isAdult(17),false);
EOF
echo '{"mutation":{"threshold":0.8,"targets":["src"],"maxSeconds":900,"testCommand":"node mtest.js"}}' > config/factory.json
bash .claude/hooks/mutation-probe.sh --max 6 --max-seconds 0 >/tmp/probe-budget.log 2>&1
check "mutation-probe budget=0 exits cleanly (no divide-by-zero)" 0 $?
grep -q 'skipping' /tmp/probe-budget.log \
  && check "mutation-probe reports skipped mutants (no silent cap)" 0 0 || check "mutation-probe reports skipped mutants (no silent cap)" 0 1
bash .claude/hooks/mutation-probe.sh --max 6 >/tmp/probe-prog.log 2>&1
grep -qE 'mutation-probe: \[[0-9]+/[0-9]+\]' /tmp/probe-prog.log \
  && check "mutation-probe logs per-mutant progress" 0 0 || check "mutation-probe logs per-mutant progress" 0 1

### 12. program-traceability: modules ↔ contracts ↔ guarantees ↔ integration tests
rm -rf docs/contracts tests/integration
mkdir -p docs/contracts tests/integration
cat > docs/modules.md <<'EOF'
- [ ] M01 auth — prefix AUTH- · wave 1 · deps: none · contracts: 001
- [ ] M02 billing — prefix BILL- · wave 2 · deps: M01 · contracts: 001
EOF
printf '# 001\nCON-001-1: opaque token\n' > docs/contracts/001-auth.md
printf '// CON-001-1\n' > tests/integration/seams.test.js
bash .claude/hooks/program-traceability.sh >/dev/null 2>&1
check "program-traceability passes when fully mapped" 0 $?
printf '// nothing\n' > tests/integration/seams.test.js
bash .claude/hooks/program-traceability.sh >/dev/null 2>&1
check "program-traceability fails on untested guarantee" 1 $?
printf '// CON-001-1\n' > tests/integration/seams.test.js
printf '# 002 no ids\n' > docs/contracts/002-orphan.md
bash .claude/hooks/program-traceability.sh >/dev/null 2>&1
check "program-traceability fails on orphan/id-less contract" 1 $?
rm -f docs/contracts/002-orphan.md
sed -i.bak 's/deps: M01/deps: M09/' docs/modules.md && rm -f docs/modules.md.bak
bash .claude/hooks/program-traceability.sh >/dev/null 2>&1
check "program-traceability fails on unknown dep (M09)" 1 $?

echo "==== RESULTS ===="
printf '%s' "$results"
echo "================="
echo "passed: $pass  failed: $fail  (sandbox: $SANDBOX)"
[ "$fail" -eq 0 ]
