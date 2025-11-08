import Phaser from 'phaser';

export enum PacManDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

export const DIRECTION_VECTORS: Record<PacManDirection, Phaser.Math.Vector2Like> = {
  [PacManDirection.Up]: { x: 0, y: -1 },
  [PacManDirection.Down]: { x: 0, y: 1 },
  [PacManDirection.Left]: { x: -1, y: 0 },
  [PacManDirection.Right]: { x: 1, y: 0 },
};

export const OPPOSITES: Record<PacManDirection, PacManDirection> = {
  [PacManDirection.Up]: PacManDirection.Down,
  [PacManDirection.Down]: PacManDirection.Up,
  [PacManDirection.Left]: PacManDirection.Right,
  [PacManDirection.Right]: PacManDirection.Left,
};