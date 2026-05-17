#!/bin/zsh
set -e
cd "$(dirname "$0")"
APP_DIR="$PWD"
export CHRYSALIS_TARGET="macbook-air-2019-intel"
export CHRYSALIS_PORTABLE_PROFILE="macbook-air-2019-intel-metal"
export CHRYSALIS_PORTABLE_ROOT="$APP_DIR"
export CHRYSALIS_ANGLE_BACKEND="metal"
export CHRYSALIS_ZERO_COPY="1"

ELECTRON_BIN=""
if [[ -x "$APP_DIR/runtime/electron/Electron.app/Contents/MacOS/Electron" ]]; then
  ELECTRON_BIN="$APP_DIR/runtime/electron/Electron.app/Contents/MacOS/Electron"
elif [[ -x "$APP_DIR/runtime/electron/electron" ]]; then
  ELECTRON_BIN="$APP_DIR/runtime/electron/electron"
elif [[ -d "$APP_DIR/runtime/electron" ]]; then
  ELECTRON_BIN="$(find "$APP_DIR/runtime/electron" -path "*/Electron.app/Contents/MacOS/Electron" -perm -111 -print -quit 2>/dev/null || true)"
fi
if [[ -z "$ELECTRON_BIN" && -x "$APP_DIR/node_modules/.bin/electron" ]]; then
  ELECTRON_BIN="$APP_DIR/node_modules/.bin/electron"
elif [[ -z "$ELECTRON_BIN" ]] && command -v electron >/dev/null 2>&1; then
  ELECTRON_BIN="$(command -v electron)"
fi

if [[ -z "$ELECTRON_BIN" ]]; then
  echo "ERROR: Could not find Electron."
  echo "Expected one of:"
  echo "  runtime/electron/Electron.app/Contents/MacOS/Electron"
  echo "  node_modules/.bin/electron"
  echo "or a global electron command."
  read "?Press Return to close..."
  exit 1
fi

echo "Electron: $ELECTRON_BIN"
echo "App: $APP_DIR"
echo "Target: $CHRYSALIS_TARGET"
echo "Profile: $CHRYSALIS_PORTABLE_PROFILE"
echo "ANGLE: metal"
"$ELECTRON_BIN" "$APP_DIR" --enable-logging --v=1
