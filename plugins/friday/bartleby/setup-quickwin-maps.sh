#!/bin/bash
# Installs MAPS for the quickwin user, and the /maps command and agents into
# quickwin's clones (excluded from git). Run as Mike, as a file; safe to rerun:
#   ssh bartleby.local 'bash -l /srv/quickwin/bin/setup-quickwin-maps.sh < /dev/null'
set -euo pipefail
umask 002
cd "$HOME"
M=/srv/quickwin/maps

# MAPS itself, kept current from GitHub with Mike's access.
if [ ! -d "$M/.git" ]; then
  git clone --quiet git@github.com:gravitycar/mike_agentic_programming_system.git "$M"
fi
git -C "$M" fetch --quiet origin
git -C "$M" checkout --quiet --force origin/main
# Only files Mike owns: build output belongs to quickwin, and chmod on it fails.
find "$M" -user "$(id -u)" -exec chmod g+rwX {} +
git config --global --get-all safe.directory | grep -qxF "$M" || git config --global --add safe.directory "$M"
sudo -n -u quickwin -H bash -lc "cd ~; git config --global --get-all safe.directory | grep -qxF '$M' || git config --global --add safe.directory '$M'"

# Build it as quickwin, with quickwin's node.
sudo -n -u quickwin -H bash -lc "cd '$M' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent" < /dev/null

# The /maps command and agents in each work clone, never committed.
for repo in ion roost; do
  W=/srv/quickwin/work/$repo
  sudo -n -u quickwin -H bash -lc "
    mkdir -p '$W/.claude/agents' '$W/.claude/commands'
    cp '$M'/.claude/agents/*.md '$W/.claude/agents/'
    cp '$M'/.claude/commands/*.md '$W/.claude/commands/'
    # Never change a file the repo itself tracks (roost commits its own agents).
    git -C '$W' checkout -- .claude 2>/dev/null || true
    EX=\$(git -C '$W' rev-parse --git-common-dir)/info/exclude
    cd '$W' && for p in .maps/ .claude/ '.yarn/cache/*-linux-*'; do grep -qxF \"\$p\" \"\$EX\" || echo \"\$p\" >> \"\$EX\"; done
    git -C '$W' status --short | head -3
  " < /dev/null
done

install -m 755 "$M/plugins/friday/bartleby/quickwin-claude.sh" /srv/quickwin/bin/quickwin-claude.sh
echo "MAPS at $(git -C "$M" log -1 --format='%h %s')"
sudo -n -u quickwin -H bash -lc "test -f '$M/dist/index.js' && echo 'MAPS built for quickwin'"
