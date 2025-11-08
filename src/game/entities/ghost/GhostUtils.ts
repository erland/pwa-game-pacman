// src/game/entities/ghost/GhostUtils.ts
import Phaser from 'phaser';
import { TILE_SIZE, TileIndex } from '../../config';
import { GhostMode, TilePoint, DIRS, DIR_VECS } from './GhostTypes';
import { PacManDirection } from '../common/direction';

export interface GhostNavCtx {
  mode: GhostMode;
  mazeLayer: Phaser.Tilemaps.TilemapLayer;
  doorRect: Phaser.Geom.Rectangle;
  x: number;
  y: number;
  getTile(): TilePoint;
}

// Math helpers
export function atTileCenter(ctx: GhostNavCtx): boolean {
  const pt = ctx.mazeLayer.worldToTileXY(ctx.x, ctx.y);
  const tx = Math.floor(pt.x);
  const ty = Math.floor(pt.y);
  const cx = ctx.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
  const cy = ctx.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
  // Keep your original tighter tolerance (pairs with ghost logic)
  return Math.abs(ctx.x - cx) < 0.25 && Math.abs(ctx.y - cy) < 0.25;
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