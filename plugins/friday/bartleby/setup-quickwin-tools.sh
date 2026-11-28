#!/bin/bash
# Installs quickwin's own tools on Bartleby. Run AS quickwin (no sudo needed):
#   sudo -u quickwin -H env QW_GIT_NAME=... QW_GIT_EMAIL=... bash -l /srv/quickwin/bin/setup-quickwin-tools.sh < /dev/null
# Run it as a file, not through stdin. Node and Go come from /srv/quickwin/toolchains,
# which Mike's user copies from its own asdf installs (asdf install fails silently
# for quickwin).
# Safe to rerun. quickwin gets no GitLab credentials: NPM_READ_TOKEN is a
# placeholder, because ion installs packages from its committed Yarn cache.
set -euo pipefail
umask 002
cd "$HOME"   # sudo keeps the caller's folder, which quickwin cannot read

BIN=/srv/quickwin/bin
TOOLS=/srv/quickwin/toolchains
export PATH="$BIN:$HOME/.local/bin:$TOOLS/node-22.23.4/bin:$TOOLS/go-1.26.10/bin:$PATH"

# Claude Code, in ~/.local/bin.
if ! command -v claude >/dev/null 2>&1; then
  # The installer must not read this script's own input (it arrives on stdin).
  bash -c "$(curl -fsSL https://claude.ai/install.sh)" < /dev/null
fi

# Node (with Yarn through corepack) and Go come from the shared toolchains.
for t in "$TOOLS/node-22.23.4/bin/node" "$TOOLS/go-1.26.10/bin/go"; do
  [ -x "$t" ] || { echo "missing $t: copy it from Mike's asdf installs first" >&2; exit 1; }
done

# Login environment for every quickwin shell, including non-interactive ones.
PROFILE="$HOME/.profile"
MARK="# --- friday quickwin ---"
if ! grep -qF "$MARK" "$PROFILE"; then
  cat >> "$PROFILE" <<'EOF'
# --- friday quickwin ---
export PATH="/srv/quickwin/bin:$HOME/.local/bin:/srv/quickwin/toolchains/node-22.23.4/bin:/srv/quickwin/toolchains/go-1.26.10/bin:$PATH"
export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$HOME/.claude-oauth-token")"
# Placeholder: ion installs from its committed Yarn cache; quickwin holds no GitLab token.
export NPM_READ_TOKEN=unused-quickwin-has-no-gitlab-access
EOF
fi

# Git: trust the shared mirrors, and commit as Mike's worker.
# Identity comes from the caller (Mike's own git config), never from this file.
: "${QW_GIT_NAME:?pass QW_GIT_NAME}" "${QW_GIT_EMAIL:?pass QW_GIT_EMAIL}"
git config --global user.name "$QW_GIT_NAME"
git config --global user.email "$QW_GIT_EMAIL"

echo "quickwin tools:"
claude --version
node --version
go version
yarn --version 2>/dev/null || echo "yarn: shim ready (needs a repo with packageManager)"
