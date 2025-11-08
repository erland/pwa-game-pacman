import Phaser from 'phaser';
import { PacManDirection } from '../PacMan';

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

// ---- DEBUG / LOGGING toggles (central place) -------------------------------
export const DEBUG_GHOSTS = false;         // overlay + on-canvas helpers
export const LOG_GHOSTS = false;           // console tracing
export const LOG_LEAVING_EVERY_TICK = false; // extra detail while leaving

// Colors used by debug overlay
export const DBG_COLORS = {
  door: 0xff66cc,
  here: 0x00ffff,
  target: 0x00ff00,
  allowed: 0xffff00,
  blocked: 0xff4444,
  open: 0x55ff55,
  currentDir: 0x00aaff,
  text: '#00ffff',
};

// Direction helpers
export const DIRS: PacManDirection[] = [
  PacManDirection.Up,
  PacManDirection.Left,
  PacManDirection.Down,
  PacManDirection.Right,
];

export const DIR_VECS: Record<PacManDirection, Phaser.Math.Vector2Like> = {
  [PacManDirection.Up]: { x: 0, y: -1 },
  [PacManDirection.Down]: { x: 0, y: 1 },
  [PacManDirection.Left]: { x: -1, y: 0 },
  [PacManDirection.Right]: { x: 1, y: 0 },
};

export function opposite(dir: PacManDirection): PacManDirection {
  switch (dir) {
    case PacManDirection.Up: return PacManDirection.Down;
    case PacManDirection.Down: return PacManDirection.Up;
    case PacManDirection.Left: return PacManDirection.Right;
    case PacManDirection.Right: return PacManDirection.Left;
  }
}

export function dirName(dir: PacManDirection | null): string {
  switch (dir) {
    case PacManDirection.Up: return 'Up';
    case PacManDirection.Down: return 'Down';
    case PacManDirection.Left: return 'Left';
    case PacManDirection.Right: return 'Right';
    default: return '—';
  }
}