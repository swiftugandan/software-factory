#!/usr/bin/env bash
# PreToolUse hook on Write|Edit|MultiEdit. Irreversible (one-way) assumptions get a human
# sign-off BEFORE they are built into the code, not a summary after. While any one-way row is
# still REVIEW and auto-approve is off, writes to implementation paths are blocked; docs,
# config, and tests stay writable so refinement and setup proceed. Set
# assumptions.autoApproveOneWay=true in config/factory.json for fully autonomous runs.
set -uo pipefail
INPUT="$(cat)"

# Auto-approve escape hatch.
auto="false"
if command -v jq >/dev/null 2>&1 && [ -f config/factory.json ]; then
  auto="$(jq -r '.assumptions.autoApproveOneWay // false' config/factory.json 2>/dev/null || echo false)"
elif [ -f config/factory.json ]; then
  grep -qE '"autoApproveOneWay"[[:space:]]*:[[:space:]]*true' config/factory.json && auto=true
fi
[ "$auto" = "true" ] && exit 0

# Any one-way assumptions still awaiting review?
[ -f docs/assumptions.md ] || exit 0
pending="$(grep -c 'REVIEW |$' docs/assumptions.md 2>/dev/null || true)"; pending="${pending:-0}"
[ "$pending" -eq 0 ] && exit 0

# Target path
if command -v jq >/dev/null 2>&1; then
  path="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
else
  path="$(printf '%s' "$INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
fi
[ -z "$path" ] && exit 0

# Allow docs/config/tests; block implementation.
case "$path" in
  docs/*|*/docs/*|config/*|*/config/*|*.test.*|*.spec.*|*__tests__*|*/tests/*|*/test/*) exit 0 ;;
esac
case "$path" in
  src/*|*/src/*|lib/*|*/lib/*|app/*|*/app/*|server/*|client/*|api/*|packages/*)
    echo "approval-guard: $pending one-way assumption(s) still marked REVIEW. These are irreversible calls that need a human decision before code is built on them. Run /approve-assumptions (or set assumptions.autoApproveOneWay=true in config/factory.json to build anyway)." >&2
    exit 2 ;;
esac
exit 0
