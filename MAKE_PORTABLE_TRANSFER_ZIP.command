#!/bin/zsh
set -e
cd "$(dirname "$0")"
mkdir -p portable-transfer
if command -v node >/dev/null 2>&1; then
  node tools/write-portable-manifest.mjs || true
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="portable-transfer/chrysalis-pages-macos-v0_3_48-${STAMP}.zip"

echo "Writing $OUT"
/usr/bin/zip -qr "$OUT" . \
  -x "portable-transfer/*" \
  -x ".git/*" \
  -x "release/*" \
  -x "dist/*" \
  -x "*.log" \
  -x ".DS_Store" \
  -x "**/.DS_Store" \
  -x "runtime/user-data/*"

echo "Done: $OUT"
echo "Move this zip to the target machine or repository, unzip, then use GitHub Pages or the macOS Electron launcher."
