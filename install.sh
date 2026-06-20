#!/usr/bin/env bash
# Symlink this repo's agents and skills into ~/.claude so they're available
# in every project. Idempotent — safe to re-run. Matches the existing
# convention (your ~/.claude/skills/* are already symlinks).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_AGENTS="$HOME/.claude/agents"
CLAUDE_SKILLS="$HOME/.claude/skills"

mkdir -p "$CLAUDE_AGENTS" "$CLAUDE_SKILLS"

# Agents: one symlink per .md file.
for f in "$REPO_DIR"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sfn "$f" "$CLAUDE_AGENTS/$(basename "$f")"
  echo "agent  → $CLAUDE_AGENTS/$(basename "$f")"
done

# Skills: one symlink per skill directory.
for d in "$REPO_DIR"/skills/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  ln -sfn "${d%/}" "$CLAUDE_SKILLS/$name"
  echo "skill  → $CLAUDE_SKILLS/$name"
done

echo "Done. Restart Claude Code (or start a new session) to pick them up."
