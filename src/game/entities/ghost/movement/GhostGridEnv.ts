// src/game/entities/ghost/movement/GhostGridEnv.ts
import type { GridEnv } from '../../movement/BlockProbe';
import { TILE_SIZE } from '../../../config';
import { isBlockedTile } from '../GhostUtils';
import type { GhostNavCtx } from '../GhostUtils';

/**
 * Bridges a Ghost (GhostNavCtx) to the generic GridEnv used by GridMover.
 * It applies the *current ghost mode* to door passability, etc.
 */
export class GhostGridEnv implements GridEnv {
  constructor(private readonly g: GhostNavCtx) {}

  tileSize = TILE_SIZE;

  worldToTile(x: number, y: number) {
    const p = this.g.mazeLayer.worldToTileXY(x, y);
    return { tx: Math.floor(p.x), ty: Math.floor(p.y) };
  }

  tileCenterWorld(tx: number, ty: number) {
    return {
      x: this.g.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2,
      y: this.g.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2,
    };
  }

  isBlocked(worldX: number, worldY: number): boolean {
    const { tx, ty } = this.worldToTile(worldX, worldY);
    return isBlockedTile(this.g, tx, ty);
  }

  canEnterTile(tx: number, ty: number): boolean {
    return !isBlockedTile(this.g, tx, ty);
  }
}