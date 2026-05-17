# Chrysalis Core - Reduced Ship Branch

This reduced branch keeps the simulation organism and navigation stack focused on the systems needed for shipping tests.

## Core loop

The renderer advances the 12-density state through fixed-timestep WebGL2 passes, applies portal/subspace backflow, refreshes render mipmaps, and displays the selected witness view. Autonomy runs as a bounded controller over live matrix diagnostics and selected route pressure; it changes step regime through the capped autonomy ladder without reseeding the field.

## Preserved architecture

- **Autonomy:** Full Autonomy and Riemann Autonomy remain available from the dropdown and the Autonomous Chunking Reset button.
- **Step regimes:** 1, 2, 3, 4, 6, 7, and 13 remain in the autonomy ladder; 42, 108, and 112 remain manual probe regimes.
- **Projective Subspace:** child chunks are lazy and bounded; parent cells mark W-pointers; child worlds initialize from parent samples; backflow is mixed rather than summed.
- **World Dig:** a higher-level child-world workflow that can open, dwell, commit, abort, and promote a child patch into the parent field.
- **Portal navigation:** Escher Portal navigation remains a visual/structural navigator over the same substrate.
- **I/O:** save/load remains available for handoff and restoration.

## Reduced reset contract

Every reset clears portal/subspace transient state, resets simulation time, resets autonomy controller state, and forces the stripped auxiliary subsystem switches off. This keeps the branch clean for shipping: no legacy import stack, no extra reset mode, and no hidden auto-arm path.

## Shipping target

The branch is prepared for GitHub Pages from the repository root and for macOS Sonoma through the Electron shell. The standalone manual and autostart HTML builds are generated from the same source files.
