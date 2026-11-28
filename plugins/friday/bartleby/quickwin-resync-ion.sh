#!/bin/bash
# Resyncs Bartleby's ion stack to quickwin's current checkout, then (optionally)
# runs Cypress specs. Run AS quickwin, as a file:
#   sudo -u quickwin -H bash -l /srv/quickwin/bin/quickwin-resync-ion.sh [spec ...] < /dev/null
# The old dev server on :3000 must be stopped first (it may belong to Mike).
set -euo pipefail
umask 002
cd /srv/quickwin/work/ion
step() { echo; echo "=== $(date +%H:%M:%S) $*"; }

step "yarn install"
yarn install 2>&1 | tail -2
# Yarn on Linux prunes macOS-only packages from the committed cache.
git checkout -- .yarn/cache

step "cypress binary"
npx cypress verify >/dev/null 2>&1 || npx cypress install 2>&1 | tail -2

step "hasura: migrate, reload, setup"
# Hasura caches enum-table values; a migration that adds one needs a reload.
(cd packages/hasura && PW=$(sed -n 's/^ADMIN_PW := //p' Makefile) \
  && hasura migrate apply --admin-secret "$PW" 2>&1 | tail -1 \
  && hasura metadata reload --admin-secret "$PW" 2>&1 | tail -1 \
  && make setup 2>&1 | tail -3)

step "app dev server"
for pid in $(pgrep -u "$(id -u)" -f 'yarn start --client-web-socket-url-port' || true) $(pgrep -u "$(id -u)" -x webpack || true); do kill "$pid" || true; done
sleep 2
mkdir -p "$HOME/logs"
setsid nohup yarn app > "$HOME/logs/app.log" 2>&1 < /dev/null &
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" = 200 ] && break
  sleep 5
done
echo "app http 200 after ~$((i * 5))s"
sleep 15
echo "missing modules: $(curl -s http://localhost:3000/main.js | grep -c webpackMissingModule || true)"

if [ "$#" -gt 0 ]; then
  step "cypress: $*"
  npx cypress run --spec "$(IFS=,; echo "$*")" 2>&1 | tail -12
fi
