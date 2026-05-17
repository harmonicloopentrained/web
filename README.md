# Chrysalis Frontier Reduced Ship Branch v0.3.48

This branch is the reduced GitHub Pages + macOS Sonoma build. It preserves the core Chrysalis organism, autonomous mode, Projective Subspace, Escher Portal navigation, World Dig, save/load, pixel-resolution controls, render controls, reticle toggle, and the Electron shell.

## Current branch profile

- Browser-first root layout for GitHub Pages.
- macOS Sonoma Electron launch path.
- Frame capture export removed.
- Batch launchers removed from the portable zip.
- Mipmaps default to none/off.

## GitHub Pages deploy

1. Push the contents of this folder to the target branch or repository root.
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select the branch and `/root`.
5. Open the published Pages URL.

The Pages build uses `index.html` plus `src/`. No build step is required for browser hosting. The `.nojekyll` file is included so GitHub Pages serves the folder exactly as-is.

## macOS Sonoma Electron install

From Terminal inside this folder:

```bash
npm install
npm run start:mac:metal
```

To install a launchable `.app` into the folder:

```bash
npm install
npm run pack:mac:air2019
open release/Chrysalis-darwin-x64/Chrysalis.app
```

You can also double-click `INSTALL_MAC_APP.command` to create the app bundle, then double-click `RUN_MAC_APP.command` to launch it after the bundle exists.

## Kept systems

- Full Autonomy and Riemann Autonomy modes, including the 1→13 capped autonomy ladder.
- Manual step regimes, including 42, 108, and 112 probe regimes.
- Projective Subspace: bounded child-world W-pointer gates with parent sample → child seed and bounded parent backflow.
- Escher Portal navigation and portal ladder controls.
- World Dig and Half Zoom Dig, including dwell, manual commit, abort, autonomy probe permission, and reticle toggle.
- Save State and Load State.
- PBO/RAM backflow and render-quality controls.

## Controls

The UI is organized into collapsible sections: Core Run, Reset + Autonomy, Portal Navigation, World Dig + Subspace, Render + Simulation, and Files.

- **A**: Autonomous Chunking Reset
- **R**: regular reset at selected step regime
- **P**: Pinned Descent reset
- **E/J**: toggle Escher Portal
- **U**: open raw Projective Subspace
- **G**: begin World Dig
- **B**: begin Half Zoom Dig
- **Shift+G**: commit World Dig after dwell
- **Alt+G**: abort World Dig
- **Q**: hide/show reticle
- **S**: save state
- **H**: hide/show UI
- **F**: fullscreen

## Validation

Run:

```bash
npm run check
```

The branch guard verifies that deprecated public terminology is absent, autonomy remains present, World Dig remains present, Projective Subspace remains present, save/load remain present, frame-capture export remains absent, and reset forces stripped subsystem switches off.
