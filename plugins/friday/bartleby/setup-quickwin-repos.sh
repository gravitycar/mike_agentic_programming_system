#!/bin/bash
# Creates the GitLab mirrors (as Mike, with his GitLab access) and quickwin's
# working clones (as quickwin, from the mirrors only). Safe to rerun.
#   ssh bartleby.local 'bash -l /srv/quickwin/bin/setup-quickwin-repos.sh < /dev/null'
# Run it as a file, not through stdin (tools inside read stdin).
set -euo pipefail
umask 002

MIRRORS=/srv/quickwin/mirrors
WORK=/srv/quickwin/work

# Each user trusts the other's repos by exact path (Ubuntu 24.04's git predates
# safe.directory wildcards).
trust() { git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$1" || git config --global --add safe.directory "$1"; }
qwtrust() { sudo -n -u quickwin -H bash -lc "cd ~; git config --global --get-all safe.directory | grep -qxF '$1' || git config --global --add safe.directory '$1'"; }

for repo in ion roost; do
  mirror="$MIRRORS/$repo.git"
  trust "$WORK/$repo"
  qwtrust "$mirror"
  if [ ! -d "$mirror" ]; then
    # Seed from Mike's local clone (fast), then point at GitLab.
    git clone --quiet --mirror "$HOME/metarouter/$repo" "$mirror"
  fi
  git -C "$mirror" remote set-url origin "git@gitlab.com:metarouter/$repo.git"
  git -C "$mirror" config core.sharedRepository group
  git -C "$mirror" fetch --quiet --prune origin
  chmod -R g+rwX "$mirror"

  if [ ! -d "$WORK/$repo/.git" ]; then
    sudo -n -u quickwin -H bash -lc "cd ~; umask 002; git clone --quiet '$mirror' '$WORK/$repo'"
  fi
  sudo -n -u quickwin -H bash -lc "cd '$WORK/$repo' && git fetch --quiet origin && git checkout --quiet master 2>/dev/null || git checkout --quiet main; git log -1 --format='$repo: %h %ad %s' --date=short"
done

# ion's local environment files (Auth0 test user, local Hasura URL). Copied from
# Mike's checkout; readable by quickwin and Mike's group only.
for f in .env packages/app/.env; do
  install -m 640 -g quickwin "$HOME/metarouter/ion/$f" "$WORK/ion/$f"
done
grep -h '^HASURA_URL=' "$WORK/ion/.env" "$WORK/ion/packages/app/.env"
