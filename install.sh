#!/usr/bin/env bash
# Symlink this repo's skills into ~/.claude/skills so they're available in
# every project. Idempotent — safe to re-run. Matches the existing convention
# (your ~/.claude/skills/* are already symlinks).
#
# Agents live in the sibling `enjunear/agents` repo — grill-team needs its four
# personas from there; run that repo's install.sh too.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_SKILLS="$HOME/.claude/skills"

mkdir -p "$CLAUDE_SKILLS"

# Skills: one symlink per skill directory.
for d in "$REPO_DIR"/skills/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  ln -sfn "${d%/}" "$CLAUDE_SKILLS/$name"
  echo "skill  → $CLAUDE_SKILLS/$name"
done

echo "Done. Restart Claude Code (or start a new session) to pick them up."
