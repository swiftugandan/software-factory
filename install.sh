#!/usr/bin/env bash
# Copy-in install of the factory (the alternative to installing it as a plugin), then preflight.
#
#   ./install.sh /path/to/repo        # from a local clone of the factory
#   curl -fsSL https://raw.githubusercontent.com/swiftugandan/software-factory/main/install.sh | bash
#                                     # from inside any project — installs into $PWD
#   curl -fsSL .../install.sh | bash -s -- /path/to/repo
#
# Env: FACTORY_REPO (owner/name, default swiftugandan/software-factory),
#      FACTORY_REF  (branch or tag, default main).
#
# Prefer the plugin instead?  /plugin marketplace add swiftugandan/software-factory
#                             /plugin install software-factory@software-factory
set -euo pipefail

dest="${1:-$PWD}"
repo="${FACTORY_REPO:-swiftugandan/software-factory}"
ref="${FACTORY_REF:-main}"

# Source tree: the directory this script lives in when run from a checkout;
# otherwise (piped from curl) a shallow clone of the factory repo.
src="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
tmp=""
if [ ! -f "$src/agents/factory-orchestrator.md" ]; then
  command -v git >/dev/null 2>&1 || { echo "install.sh: git is required to fetch the factory" >&2; exit 1; }
  tmp="$(mktemp -d)"
  trap '[ -n "$tmp" ] && rm -rf "$tmp"' EXIT
  echo "Fetching $repo@$ref ..."
  git clone --quiet --depth 1 --branch "$ref" "https://github.com/$repo.git" "$tmp/factory"
  src="$tmp/factory"
fi

mkdir -p "$dest/docs/BDD" "$dest/.claude/agents" "$dest/.claude/commands" "$dest/.claude/skills" "$dest/.claude/hooks"

cp -R "$src/agents/." "$dest/.claude/agents/"
cp -R "$src/skills/." "$dest/.claude/skills/"
# All hook scripts, but not hooks.json — copy-in installs wire hooks via settings.json.
for f in "$src/hooks/"*.sh; do cp "$f" "$dest/.claude/hooks/"; done

# Commands, minus /setup (plugin-only), with plugin-root references rewritten to .claude/.
for f in "$src/commands/"*.md; do
  base="$(basename "$f")"
  [ "$base" = "setup.md" ] && continue
  sed 's|${CLAUDE_PLUGIN_ROOT}|.claude|g' "$f" > "$dest/.claude/commands/$base"
done

# Keep a project's own settings.json reachable; the factory's must win or the hooks don't run.
if [ -f "$dest/.claude/settings.json" ] && ! cmp -s "$src/templates/settings.json" "$dest/.claude/settings.json"; then
  cp "$dest/.claude/settings.json" "$dest/.claude/settings.json.pre-factory"
  echo "note: existing .claude/settings.json saved as settings.json.pre-factory — merge back anything you still need."
fi
cp "$src/templates/settings.json" "$dest/.claude/settings.json"

# Keep a project's own CLAUDE.md; import the factory's instead of overwriting.
if [ -f "$dest/CLAUDE.md" ] && ! cmp -s "$src/CLAUDE.md" "$dest/CLAUDE.md"; then
  cp "$src/CLAUDE.md" "$dest/CLAUDE.factory.md"
  grep -q '@CLAUDE.factory.md' "$dest/CLAUDE.md" || printf '\n@CLAUDE.factory.md\n' >> "$dest/CLAUDE.md"
  echo "note: kept your CLAUDE.md; factory instructions installed as CLAUDE.factory.md and imported from it."
else
  cp "$src/CLAUDE.md" "$dest/CLAUDE.md"
fi

[ -f "$dest/docs/BDD/README.md" ] || cp "$src/docs/BDD/README.md" "$dest/docs/BDD/"
if [ ! -f "$dest/config/factory.json" ]; then
  mkdir -p "$dest/config"
  cp "$src/config/factory.json" "$dest/config/"
fi
chmod +x "$dest/.claude/hooks/"*.sh

echo "Factory installed into $dest"
( cd "$dest" && bash .claude/hooks/doctor.sh ) || true
