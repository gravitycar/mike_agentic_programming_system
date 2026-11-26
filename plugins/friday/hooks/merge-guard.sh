#!/bin/sh
# Runs the merge guard with a node that works, whatever node the current repo
# pins. Inside a Friday agent, a guard that cannot run blocks the command
# (exit 2). In Mike's own sessions it lets the command through with a warning.
HERE="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"
for NODE in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node "$HOME"/.asdf/installs/nodejs/*/bin/node /usr/local/bin/node; do
  [ -n "$NODE" ] && [ -x "$NODE" ] || continue
  "$NODE" -e '' >/dev/null 2>&1 || continue
  printf '%s' "$INPUT" | "$NODE" "$HERE/merge-guard.mjs"
  STATUS=$?
  [ $STATUS -eq 0 ] && exit 0
  break
done
if [ "$FRIDAY_AGENT" = "1" ]; then
  echo "Friday's merge guard could not run, so this command is blocked." >&2
  exit 2
fi
echo "Warning: Friday's merge guard could not run." >&2
exit 0
