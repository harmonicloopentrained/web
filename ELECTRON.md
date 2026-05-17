# Chrysalis Electron on macOS Sonoma

## Direct Electron run

```bash
npm install
npm run start:mac:metal
```

Use this while developing or testing the branch locally. The Electron shell points at the same `index.html` used by GitHub Pages.

## Install a launchable app bundle into this folder

```bash
npm install
npm run pack:mac:air2019
open release/Chrysalis-darwin-x64/Chrysalis.app
```

The generated app lives inside `release/` and can be launched directly from Finder.

## Helper commands

- `INSTALL_MAC_APP.command`: installs dependencies and creates `release/Chrysalis-darwin-x64/Chrysalis.app`.
- `RUN_MAC_APP.command`: opens the generated app bundle.
- `RUN_MAC_ELECTRON_METAL.command`: runs the local folder directly through Electron with the Metal ANGLE profile.
- `RUN_MAC_ELECTRON_DEFAULT.command`: runs the local folder directly through Electron using Chromium's default backend.
