import { PacManDirection, DIRECTION_VECTORS, OPPOSITES } from '../common/direction';
import type { GridEnv } from './BlockProbe';
import {CENTER_TOLERANCE_PX} from '../common/grid';

export type WorldPoint = { x: number; y: number };

export type GridMoverOptions = {
  /** Speed in pixels/second (matches your original Pac-Man). */
  speedPxPerSec: number;
  /** Snap tolerance to consider “at center”. Default CENTER_TOLERANCE_PX. */
  snapTolerancePx?: number;
  /** Perpendicular snap threshold. Default 1.5 px. */
  perpendicularSnapPx?: number;
};

export class GridMover {
  private dir: PacManDirection | null = null;
  private queued: PacManDirection | null = null;
  private speedPx: number;
  private snapTol: number;
  private perpSnap: number;

  constructor(private env: GridEnv, opts: GridMoverOptions) {
    this.speedPx = opts.speedPxPerSec;
    this.snapTol = opts.snapTolerancePx ?? CENTER_TOLERANCE_PX;
    this.perpSnap = opts.perpendicularSnapPx ?? 1.5;
  }

  direction(): PacManDirection | null { return this.dir; }
  queue(d: PacManDirection) { this.queued = d; }
  force(d: PacManDirection | null) { this.dir = d; if (d != null) this.queued = null; }
  setSpeedPxPerSec(px: number) { this.speedPx = px; }

  private atTileCenter(pos: WorldPoint): boolean {
    const { tx, ty } = this.env.worldToTile(pos.x, pos.y);
    const c = this.env.tileCenterWorld(tx, ty);
    return Math.abs(pos.x - c.x) <= this.snapTol && Math.abs(pos.y - c.y) <= this.snapTol;
  }
  private alignToTileCenter(pos: WorldPoint): void {
    const { tx, ty } = this.env.worldToTile(pos.x, pos.y);
    const c = this.env.tileCenterWorld(tx, ty);
    pos.x = c.x; pos.y = c.y;
  }
  private snapPerpendicularAxis(pos: WorldPoint): void {
    const { tx, ty } = this.env.worldToTile(pos.x, pos.y);
    const c = this.env.tileCenterWorld(tx, ty);
    if (this.dir === PacManDirection.Left || this.dir === PacManDirection.Right) {
      if (Math.abs(pos.y - c.y) < this.perpSnap) pos.y = c.y;
    } else if (this.dir === PacManDirection.Up || this.dir === PacManDirection.Down) {
      if (Math.abs(pos.x - c.x) < this.perpSnap) pos.x = c.x;
    }
  }
  private canMoveInDirection(pos: WorldPoint, direction: PacManDirection, requireCenter = true): boolean {
    if (requireCenter && !this.atTileCenter(pos)) return false;
    const { tx, ty } = this.env.worldToTile(pos.x, pos.y);
    const v = DIRECTION_VECTORS[direction];
    return this.env.canEnterTile(tx + v.x, ty + v.y);
  }
  private willCollide(nextX: number, nextY: number): boolean {
    const half = this.env.tileSize * 0.5 - 1;
    if (this.dir === PacManDirection.Left || this.dir === PacManDirection.Right) {
      const sign = this.dir === PacManDirection.Right ? 1 : -1;
      const frontX = nextX + half * sign;
      const topY = nextY - half;
      const bottomY = nextY + half;
      return this.env.isBlocked(frontX, topY) || this.env.isBlocked(frontX, bottomY);
    }
    if (this.dir === PacManDirection.Up || this.dir === PacManDirection.Down) {
      const sign = this.dir === PacManDirection.Down ? 1 : -1;
      const frontY = nextY + half * sign;
      const leftX = nextX - half;
      const rightX = nextX + half;
      return this.env.isBlocked(leftX, frontY) || this.env.isBlocked(rightX, frontY);
    }
    return false;
  }

  /** Mirrors your original tryApplyQueuedDirection + advance. */
  step(dtMs: number, pos: WorldPoint): void {
    // tryApplyQueuedDirection
    if (this.queued) {
      const queued = this.queued;

      if (this.dir === null) {
        if (this.canMoveInDirection(pos, queued)) {
          this.dir = queued;
          this.queued = null;
          this.alignToTileCenter(pos);    // starting from rest: ok to align
        }
      } else {
        const isOpposite = OPPOSITES[this.dir] === queued;

        if (isOpposite) {
          if (this.canMoveInDirection(pos, queued, false)) {
            this.dir = queued;
            this.queued = null;           // reverse mid-corridor: don't align
          }
        } else if (this.atTileCenter(pos) && this.canMoveInDirection(pos, queued)) {
          if (queued !== this.dir) {
            this.dir = queued;
            this.queued = null;
            this.alignToTileCenter(pos);  // align only when actually turning
          } else {
            // same dir at center → accept but DO NOT realign
            this.queued = null;
          }
        }
      }
    }

    // advance (unchanged)
    if (this.dir === null) return;
    const v = DIRECTION_VECTORS[this.dir];
    const distance = (this.speedPx * dtMs) / 1000;
    const nextX = pos.x + v.x * distance;
    const nextY = pos.y + v.y * distance;

    if (this.willCollide(nextX, nextY)) {
      this.alignToTileCenter(pos);
      this.dir = null;
      return;
    }

    pos.x = nextX;
    pos.y = nextY;
    this.snapPerpendicularAxis(pos);
  }
}