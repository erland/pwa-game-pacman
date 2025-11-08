// src/game/entities/ghost/GhostTypes.ts
import { PacManDirection, DIRECTION_VECTORS, OPPOSITES } from '../common/direction';

/** Overall ghost modes (high-level state). */
export enum GhostMode {
  InHouse = 'in-house',
  LeavingHouse = 'leaving-house',
  Scatter = 'scatter',
  Chase = 'chase',
  Frightened = 'frightened',
  Eaten = 'eaten',
  ReturningHome = 'returning-home',
}

export type TilePoint = { x: number; y: number };

/** Direction list in a fixed order (useful for iteration / debug). */
export const DIRS: PacManDirection[] = [
  PacManDirection.Up,
  PacManDirection.Left,
  PacManDirection.Down,
  PacManDirection.Right,
];

/** Direction → unit vector (reuses shared mapping). */
export const DIR_VECS = DIRECTION_VECTORS;

/** Opposite direction (reuses shared mapping). */
export function opposite(d: PacManDirection): PacManDirection {
  return OPPOSITES[d];
}

/** Pretty name for logs/debug. */
export function dirName(dir: PacManDirection | null): string {
  switch (dir) {
    case PacManDirection.Up: return 'Up';
    case PacManDirection.Down: return 'Down';
    case PacManDirection.Left: return 'Left';
    case PacManDirection.Right: return 'Right';
    default: return '—';
  }
}

/** Local debug flags (unchanged defaults). */
export const DEBUG_GHOSTS = false;
export const LOG_GHOSTS = false;
/** When true, logs every tick while in LeavingHouse (noisy). */
export const LOG_LEAVING_EVERY_TICK = false;