# Pac-Man Game Development Plan

This plan describes how an LLM coding assistant will implement the Pac-Man game defined in `docs/pacman-game-spec.md`. It is organized chronologically with checkpoints that can be requested individually by the project owner.

## Phase 0 – Project Assessment & Tooling
1. Review the existing `@erlandlindmark/pwa-game-2d-framework` integration in `src/` to understand boot, preload, game, and UI scenes.
2. Audit dependencies in `package.json`; update Phaser or tooling only if necessary.
3. Inventory existing assets under `public/` or `src/assets/`; document gaps (sprites, sound effects, tilemap).

## Phase 1 – Asset & Data Preparation
1. Source or create Pac-Man–style spritesheets (Pac-Man, ghosts, pellets, fruit, UI icons) sized for a 28x31 tile grid.
   - Use [LibreSprite](https://libresprite.github.io/) or Aseprite to author 16×16 frames, keeping each character on a separate layer.
   - Export `public/sprites/pacman-characters.png` through **File → Export → Sprite Sheet** with "By rows" layout and 1 px spacing.
2. Author a Tiled map (`public/maps/pacman.json`) matching the classic maze, including object layers for spawn points, tunnel exits, and pellet positions.
   - Install [Tiled 1.10+](https://www.mapeditor.org/), recreate the 28×31 maze using a 16×16 tileset, and export JSON via **File → Export As… → JSON**.
   - Include object layers named `pellets`, `powerPellets`, `ghostHouse`, and `spawns` to preserve gameplay metadata.
3. Generate tileset and audio placeholders instead of committing binaries:
   - Tileset: render a 16×16 tile atlas in your sprite tool and export to `public/tiles/pacman-tiles.png` with transparent background.
   - Audio: run `pnpm run generate-audio` to synthesize placeholder WAV files into `public/audio/`.
4. Define constants/enums for tile indices, ghost names, modes, and gameplay timings in `src/game/config.ts`.
5. Add preload logic for textures, audio, and tilemap in the Preload scene.

> **Note:** Treat files under `public/` as generated artifacts. Maintain editable sources (sprite projects, Tiled maps) outside the repository and regenerate assets locally before testing.

## Phase 2 – Core Game Loop & Player Control
1. Implement a dedicated `GameScene` with state management for Ready, Playing, LevelComplete, and LifeLost.
2. Create a `PacMan` class handling movement, buffered direction input, animation, and collision checks against tilemap layers.
3. Wire desktop input (keyboard) and touch swipe gestures via Phaser pointer events, normalizing to the direction buffer.
4. Add pellet collision detection that removes pellets, updates score, and triggers level-complete checks.

## Phase 3 – Ghost Systems
1. Implement a `Ghost` base class with shared properties (mode state, target tile, scatter tile, speed multipliers).
2. Add mode scheduler following arcade scatter/chase timings using timers configured per level.
3. Code individual targeting logic:
   - **Blinky:** target Pac-Man’s current tile during chase.
   - **Pinky:** four tiles ahead of Pac-Man’s direction.
   - **Inky:** vector calculation using Pac-Man and Blinky positions.
   - **Clyde:** chase when far, scatter when near Pac-Man.
4. Support frightened and eaten states triggered by power pellets, including color swaps and home-return logic.
5. Ensure ghosts respect ghost house door collisions and release rules (timer/pellet thresholds).

## Phase 4 – Scoring, Progression, and HUD
1. Track scores, high score, level, and remaining lives in a `GameState` store (singleton or scene data).
2. Render HUD text and life icons via a UI scene or overlays responsive to viewport size.
3. Spawn bonus fruit entities according to pellet counters; handle collection scoring.
4. Implement level advancement: reset map, speed modifiers, frightened duration adjustments.
5. Handle life loss, Game Over, and restart flows.

## Phase 5 – Audio, FX, and Polish
1. Trigger sound effects for pellet chomp, power pellet, frightened ghost capture, death, start, and fruit spawn.
2. Add visual feedback: Pac-Man death animation, frightened ghost flashing, particle/flash effect on ghost capture.
3. Integrate pause/resume, mute toggle, and responsive scaling with letterboxing per spec.
4. Verify 60 FPS performance by profiling sprite batching and update loops; optimize allocations.

## Phase 6 – Testing & Delivery
1. Implement automated tests for critical logic (mode scheduler, score progression, input buffer) using Jest.
2. Create manual test checklists for desktop Chrome/Safari and iOS Safari, covering controls, performance, and orientation changes.
3. Package documentation updates summarizing architecture, assets, and testing procedures.
4. Provide final build instructions and ensure PWA manifest/service worker remain functional.

## Iteration & Feedback Loop
- After each phase, run `pnpm test` (when applicable) and `pnpm build` to confirm stability.
- Demo intermediate builds to gather feedback before moving to the next phase.
- Keep branches small; open PRs per phase with clear summaries and testing notes.

## Risks & Mitigations
- **Touch Input Latency:** Use Phaser’s pointer events with throttling and predictive buffering.
- **Ghost AI Complexity:** Start with simplified chase logic, then refine toward arcade-accurate behavior; build debugging overlays to visualize targets.
- **Asset Licensing:** Confirm that all sprite/audio assets are cleared for use; consider recreating assets if licensing is unclear.
- **Performance on iOS:** Test on actual hardware early; minimize texture size and rely on Web Audio where supported.

## Completion Criteria
- All gameplay features in `docs/pacman-game-spec.md` implemented and verified on desktop and iOS.
- Automated tests cover key logic paths with passing CI runs.
- Documentation updated, including controls, build/test instructions, and release notes.
