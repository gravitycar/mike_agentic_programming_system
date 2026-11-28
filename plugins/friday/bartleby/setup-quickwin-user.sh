#!/bin/bash
# One-time root setup for Friday's quick-win worker on Bartleby. Safe to rerun.
#
# Creates the `quickwin` user, which runs the worker with NO GitLab credentials
# (no SSH key, no glab login) and no docker or sudo access. Mike's user can run
# commands as quickwin (never as root) without a password, so Friday can start
# the worker over SSH. Friday pushes finished branches with Mike's own access.
#
# Run from the Mac:
#   ssh -t bartleby.local 'sudo bash ~/setup-quickwin-user.sh'
set -euo pipefail

OWNER=mike
QW=quickwin

if ! id "$QW" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "Friday quick-win worker" "$QW"
fi

# Mike's user joins quickwin's group, so it can read quickwin's work and write
# the shared repo mirrors. quickwin gets no extra groups.
usermod -aG "$QW" "$OWNER"
for g in docker sudo adm; do gpasswd -d "$QW" "$g" >/dev/null 2>&1 || true; done

# Mike may run commands as quickwin (not as root) without a password.
SUDOERS=/etc/sudoers.d/friday-quickwin
echo "$OWNER ALL=($QW) NOPASSWD: ALL" > "$SUDOERS"
chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS"

# Shared area: repo mirrors (written by Mike's user from GitLab) and
# quickwin's working clones. setgid, so new files keep the quickwin group.
install -d -o "$QW" -g "$QW" -m 2770 /srv/quickwin /srv/quickwin/mirrors /srv/quickwin/work

# quickwin's own copy of the Claude token, readable only by quickwin.
install -o "$QW" -g "$QW" -m 600 "/home/$OWNER/.claude-oauth-token" "/home/$QW/.claude-oauth-token"

# Tools that live in Mike's private home and are needed system-wide.
if [ -x "/home/$OWNER/.local/bin/hasura" ]; then
  install -m 755 "/home/$OWNER/.local/bin/hasura" /usr/local/bin/hasura
fi

echo
echo "quickwin is ready:"
id "$QW"
echo "Mike's groups now: $(id -nG "$OWNER")"
