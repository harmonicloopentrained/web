#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js first, then run this again."
  exit 1
fi
npm install
npm run pack:mac:air2019
echo "Created release/Chrysalis-darwin-x64/Chrysalis.app"
