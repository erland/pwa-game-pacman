// src/game/entities/ghost/GhostUtils.ts
import Phaser from 'phaser';
import { TILE_SIZE, TileIndex } from '../../config';
import { GhostMode, TilePoint, DIRS, DIR_VECS, opposite } from './GhostTypes';
import { PacManDirection } from '../common/direction';
import { CENTER_TOLERANCE_PX } from '../common/grid';

export interface GhostNavCtx {
  mode: GhostMode;
  mazeLayer: Phaser.Tilemaps.TilemapLayer;
  doorRect: Phaser.Geom.Rectangle;
  x: number;
  y: number;
  getTile(): TilePoint;
}


// ---
// Tile-based BFS pathfinding to select the *first* move toward a target tile.
// Honors door passability via isBlockedTile(ctx, tx, ty) and can optionally
// forbid immediately reversing direction (classic arcade rule). Neighbor order
// uses Up, Left, Down, Right to match Pac‑Man tie-breaking.
export function nextDirBFS(
  ctx: GhostNavCtx,
  start: TilePoint,
  goal: TilePoint,
  forbidReverseOf?: PacManDirection | null,
  maxExplored: number = 4096
): PacManDirection | null {
  if (start.x === goal.x && start.y === goal.y) return null;

  const key = (p: TilePoint) => p.x + ',' + p.y;
  const startKey = key(start);

  const q: TilePoint[] = [start];
  const seen = new Set<string>([startKey]);
  const firstMove = new Map<string, PacManDirection>();

  let explored = 0;

  while (q.length) {
    const cur = q.shift()!;
    if (++explored > maxExplored) break;

    const curKey = key(cur);
    if (cur.x === goal.x && cur.y === goal.y) {
      return firstMove.get(curKey) ?? null;
    }

    for (const d of DIRS) {
      // Forbid reverse only for the very first step out of 'start'.
      if (curKey === startKey && forbidReverseOf && d === opposite(forbidReverseOf)) continue;

      const v = DIR_VECS[d];
      const nx = cur.x + (v.x as number);
      const ny = cur.y + (v.y as number);
      const k2 = nx + ',' + ny;

      if (seen.has(k2)) continue;
      // Bounds check from the tilemap itself:
      const map = ctx.mazeLayer.tilemap;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (isBlockedTile(ctx, nx, ny)) continue;

      seen.add(k2);
      // Propagate the first move we took leaving 'start' to reach this node.
      const fm = firstMove.get(curKey) ?? d;
      firstMove.set(k2, fm);
      q.push({ x: nx, y: ny });
    }
  }

  return null;
}

// Math helpers
export function atTileCenter(ctx: GhostNavCtx): boolean {
  const pt = ctx.mazeLayer.worldToTileXY(ctx.x, ctx.y);
  const tx = Math.floor(pt.x);
  const ty = Math.floor(pt.y);
  const cx = ctx.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
  const cy = ctx.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
  // Use shared tolerance so center detection stays consistent project-wide.
  return Math.abs(ctx.x - cx) < CENTER_TOLERANCE_PX && Math.abs(ctx.y - cy) < CENTER_TOLERANCE_PX;
}

export function currentTileCenterWorld(ctx: GhostNavCtx): Phaser.Math.Vector2 {
  const pt = ctx.mazeLayer.worldToTileXY(ctx.x, ctx.y);
  const tx = Math.floor(pt.x);
  const ty = Math.floor(pt.y);
  const cx = ctx.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
  const cy = ctx.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
  return new Phaser.Math.Vector2(cx, cy);
}

export function distance2(a: TilePoint, b: TilePoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Collision & tiles (unchanged rules)
export function isBlockedTile(ctx: GhostNavCtx, tx: number, ty: number): boolean {
  const map = ctx.mazeLayer.tilemap;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;

  const tile = ctx.mazeLayer.getTileAt(tx, ty); // may be null (corridor)
  const px = ctx.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
  const py = ctx.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
  const inDoor = Phaser.Geom.Rectangle.Contains(ctx.doorRect, px, py);

  const canPassDoor =
    ctx.mode === GhostMode.LeavingHouse ||
    ctx.mode === GhostMode.Eaten ||
    ctx.mode === GhostMode.ReturningHome;

  if (inDoor && canPassDoor) return false;
  if (!tile) return false; // empty corridor

  if (tile.index === TileIndex.Wall) return true;
  if (tile.index === TileIndex.GhostDoor) return !canPassDoor;

  return false;
}

export function allowedDirections(ctx: GhostNavCtx): PacManDirection[] {
  const tile = ctx.getTile();
  const out: PacManDirection[] = [];
  for (const d of DIRS) {
    const v = DIR_VECS[d];
    const nx = tile.x + (v.x as number);
    const ny = tile.y + (v.y as number);
    if (!isBlockedTile(ctx, nx, ny)) out.push(d);
  }
  return out;
}

export function blockReason(ctx: GhostNavCtx, tx: number, ty: number): string {
  const map = ctx.mazeLayer.tilemap;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'OOB';

  const tile = ctx.mazeLayer.getTileAt(tx, ty); // null => corridor
  const px = ctx.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
  const py = ctx.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
  const inDoor = Phaser.Geom.Rectangle.Contains(ctx.doorRect, px, py);

  const canPassDoor =
    ctx.mode === GhostMode.LeavingHouse ||
    ctx.mode === GhostMode.Eaten ||
    ctx.mode === GhostMode.ReturningHome;

  if (inDoor && canPassDoor) return 'DOOR pass';
  if (!tile) return 'empty';
  if (tile.index === TileIndex.Wall) return `WALL idx=${tile.index}`;
  if (tile.index === TileIndex.GhostDoor) return canPassDoor ? 'Door pass' : 'Door blocked';
  return `open idx=${tile.index}`;
}

// Movement helpers (still used by GhostBase)
export function willCollide(
  ctx: GhostNavCtx,
  dir: PacManDirection,
  nextX: number,
  nextY: number
): boolean {
  const v = DIR_VECS[dir];
  const aheadX = nextX + (v.x as number) * (TILE_SIZE * 0.25);
  const aheadY = nextY + (v.y as number) * (TILE_SIZE * 0.25);
  const pt = ctx.mazeLayer.worldToTileXY(aheadX, aheadY);
  return isBlockedTile(ctx, Math.floor(pt.x), Math.floor(pt.y));
}

export function pickLeavingDirection(
  here: TilePoint,
  target: TilePoint,
  allowed: PacManDirection[]
): PacManDirection | null {
  const dx = target.x - here.x;
  const dy = target.y - here.y;
  if (dy !== 0) {
    const vert = dy < 0 ? PacManDirection.Up : PacManDirection.Down;
    if (allowed.includes(vert)) return vert;
  }
  if (dx !== 0) {
    const horiz = dx < 0 ? PacManDirection.Left : PacManDirection.Right;
    if (allowed.includes(horiz)) return horiz;
  }
  return null;
}