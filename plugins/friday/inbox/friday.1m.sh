#!/usr/bin/env bash
# <xbar.title>Friday</xbar.title>
# <xbar.desc>Open escalations from Friday's background agents.</xbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
export PATH="$HOME/.asdf/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
SRC="${BASH_SOURCE[0]}"
while [ -L "$SRC" ]; do
  DIR="$(cd -P "$(dirname "$SRC")" && pwd)"
  SRC="$(readlink "$SRC")"
  case "$SRC" in /*) ;; *) SRC="$DIR/$SRC" ;; esac
done
FRIDAY="$(cd -P "$(dirname "$SRC")/../bin" && pwd)/friday"
exec "$FRIDAY" inbox --swiftbar
