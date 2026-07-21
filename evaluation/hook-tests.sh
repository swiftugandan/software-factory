#!/usr/bin/env bash
# Deterministic unit tests for the software-factory enforcement hooks.
# Each test simulates the JSON Claude Code feeds a hook and asserts on the exit code
# (0 = allow, 2 = block) and on side effects. Run from anywhere.
set -uo pipefail

REPO=/home/user/software-factory
SANDBOX="$(mktemp -d /tmp/claude-0/-home-user-software-factory/a655bb20-09fd-5cd3-bcb9-193d68c18c17/scratchpad/hooksandbox.XXXX)"
mkdir -p "$SANDBOX/.claude"
cp -r "$REPO/.claude/hooks" "$SANDBOX/.claude/hooks"
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

echo "==== RESULTS ===="
printf '%s' "$results"
echo "================="
echo "passed: $pass  failed: $fail  (sandbox: $SANDBOX)"
[ "$fail" -eq 0 ]
