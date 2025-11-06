# Pac-Man Game Specification

## Overview
- **Genre:** Classic maze chase arcade game.
- **Platform Targets:** Desktop (keyboard controls) and iOS Safari on iPhone/iPad (touch controls and optional hardware keyboards).
- **Framework:** Phaser via `@erlandlindmark/pwa-game-2d-framework` within the existing Vite project setup.
- **Objective:** Guide Pac-Man through enclosed mazes to eat all pellets while avoiding ghosts, using power pellets to temporarily turn the tables.

## Core Gameplay
1. **Maze Layouts**
   - Use a single maze layout styled after the 1980 Pac-Man board for the initial release.
   - Include corridors, walls, ghost house (pen), tunnel/wraparound passages, and designated spawn points.
   - Ensure tile-based movement grid (at least 28x31 tiles) aligned with sprite sizes for collision and pathfinding.
2. **Player Character (Pac-Man)**
   - Moves continuously along grid lines with 4-directional input and smooth turning at intersections when the next direction is buffered.
   - Mouth animation cycles as Pac-Man moves.
   - Starting lives: 3, with life counter displayed in HUD.
3. **Ghosts (Blinky, Pinky, Inky, Clyde)**
   - Each ghost has distinct AI behavior (scatter, chase, frightened) consistent with the original game.
   - Maintain ghost movement speeds and phase timing tables (scatter/chase) tuned for mobile responsiveness.
   - Ghost colors and personalities must be distinguishable.
   - Ghosts start inside the ghost house; release logic matches arcade behavior (timed and pellet-count triggers).
4. **Pellets and Power Pellets**
   - Standard pellets placed throughout the maze; power pellets in the four corners.
   - Consuming pellets increases score (10 points) and clears them from the map.
   - Power pellets grant frightened mode for ghosts: ghosts turn blue, slow down, and become vulnerable.
5. **Scoring and Progression**
   - Scoring: pellets (10), power pellets (50), frightened ghost (200, 400, 800, 1600 sequentially), bonus fruit (see below).
   - Display score and high score in HUD (top center) with responsive layout.
   - Level progression triggered when all pellets are eaten. Next level restarts maze with increased difficulty (ghost speed, frightened duration reductions).
6. **Bonus Items (Fruit)**
   - Spawn bonus fruit twice per level after specific pellet counts. Fruit type and score value depend on level number.
   - Fruit appears in the ghost house entrance for a limited time.
7. **Lives and Game Over**
   - Losing a life occurs when Pac-Man collides with a non-frightened ghost.
   - Upon life loss, reset positions and continue until lives depleted.
   - Game Over screen with option to restart.

## Controls
- **Desktop:** Arrow keys / WASD for movement. Support keyboard buffer at intersections. Optional pause via `P` key.
- **Touch (iPhone/iPad):** Swipe gestures for direction changes. Provide on-screen indicator for buffered input. Tap dedicated pause button.
- **Accessibility:** Maintain consistent input latency (<100ms). Provide audio toggle button.

## User Interface
- Responsive layout that scales maze to available viewport while preserving aspect ratio. Letterbox background when necessary.
- HUD elements:
  - Current score, high score, level indicator.
  - Remaining lives shown as mini Pac-Man icons.
  - Pause button (touch) and audio mute button.
- Menus:
  - Title screen with "Tap/Press to Start" and instructions.
  - Pause overlay with resume/restart buttons.
  - Game over screen summarizing final score and high score.

## Audio & Visuals
- Use authentic-sounding chomp, power pellet, ghost, and death effects.
- Background music or ambient loop optional; ensure mute toggle works globally.
- Sprites should emulate classic arcade look while supporting high-resolution displays (vector or high-DPI bitmaps).
- Provide simple particle/flash effect when ghosts are eaten.

## Technical Requirements
- Phaser scene architecture from the framework (Boot, Preload, Game, UI scenes).
- Tilemap-driven maze loaded from JSON or CSV exported from Tiled or equivalent.
- Physics: Use Arcade physics with precise tile collision for walls and ghost house door.
- Pathfinding for ghosts using tile-based node graph.
- Maintain 60 FPS on modern desktop browsers and recent iOS devices. Optimize texture atlases and avoid heavy allocations during gameplay.
- Persist high scores using local storage.
- Support progressive web app (PWA) capabilities already provided by the framework (offline play, install prompts).

## Testing & Quality
- Implement unit or integration tests for core logic (e.g., ghost state transitions, pellet consumption) where feasible.
- Perform manual testing on desktop (Chrome, Safari) and iOS Safari. Verify touch controls, orientation changes, and performance.
- Ensure no gameplay-critical controls rely solely on hover or right-click interactions.

## Roadmap Considerations
- Future enhancements (not in initial scope): additional mazes, difficulty settings, leaderboards, customizable controls.
- Keep architecture modular to allow extensions after base game completion.
