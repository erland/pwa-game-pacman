// src/game/entities/ghost/states/LeavingHouseState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint, DIR_VECS } from '../GhostTypes';
import { PacManDirection } from '../../common/direction';
import type { Ghost } from '../GhostBase';
import Phaser from 'phaser';
import { allowedDirections, atTileCenter } from '../GhostUtils';

export class LeavingHouseState extends GhostState {
  readonly id = GhostMode.LeavingHouse;

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    const doorTile: TilePoint = { x: Math.round(pt.x), y: Math.round(pt.y) };

    const inDoorNow = Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y);
    if (inDoorNow) g.setLeavingDoorEntered(true);

    if (inDoorNow && g.getLeavingOutDir() == null) {
      g.setLeavingOutDir((g.y <= g.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up);
    }

    const outDir = g.getLeavingOutDir() ?? ((g.y <= g.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up);
    const outVec = DIR_VECS[outDir];
    const doorOutTile: TilePoint = { x: doorTile.x + (outVec.x as number), y: doorTile.y + (outVec.y as number) };
    const target = inDoorNow ? doorOutTile : doorTile;

    if (inDoorNow && atTileCenter(g)) {
      const allowedNow = allowedDirections(g);
      if (allowedNow.includes(outDir)) {
        g.setCurrentDirection(outDir);
      }
    }

    this.stepTo(g, target, dtMs);

    if (!inDoorNow && g.hasLeavingDoorEntered() && atTileCenter(g)) {
      g.setMode(ctx.schedulerMode, 'exited doorway after entering it');
      g.setLeavingDoorEntered(false);
      g.setLeavingOutDir(null);
    }
  }
}