#!/bin/zsh
set -e
cd "$(dirname "$0")"
APP="release/Chrysalis-darwin-x64/Chrysalis.app"
if [ ! -d "$APP" ]; then
  echo "Chrysalis.app is not installed yet. Run INSTALL_MAC_APP.command first."
  exit 1
fi
open "$APP"
