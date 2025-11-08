// src/game/entities/ghost/states/LeavingHouseState.ts
import Phaser from 'phaser';
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint, DIR_VECS } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

export class LeavingHouseState extends GhostState {
  readonly id = GhostMode.LeavingHouse;

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    g.setReverseAllowed(true);
    g.setSpeedMultiplier(1);
    // Doorway center (tile)
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    const doorTile: TilePoint = { x: Math.round(pt.x), y: Math.round(pt.y) };

    const inDoorNow = Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y);
    if (inDoorNow) g.setLeavingDoorEntered(true);

    // Latch which way is "out" the moment we are inside the doorway
    if (inDoorNow && g.getLeavingOutDir() == null) {
      // If we're above the door center, we must go Down through it; otherwise Up.
      g.setLeavingOutDir((g.y <= g.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up);
    }

    const outDir = g.getLeavingOutDir()
      ?? ((g.y <= g.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up);
    const outVec = DIR_VECS[outDir];
    const doorOutTile: TilePoint = {
      x: doorTile.x + (outVec.x as number),
      y: doorTile.y + (outVec.y as number),
    };

    // While we are "in the doorway", target the tile just outside;
    // otherwise target the doorway tile to align with it.
    const target = inDoorNow ? doorOutTile : doorTile;

    // If centered inside the doorway and the outward dir is legal, pick it now.
    if (inDoorNow && this.atCenter(g)) {
      const allowedNow = this.allowed(g);
      if (allowedNow.includes(outDir)) {
        g.setCurrentDirection(outDir);
      }
    }

    // Use existing movement
    this.stepTo(g, target, dtMs);

    // Once we have exited the doorway after having entered it, hand control to scheduler mode.
    if (!inDoorNow && g.hasLeavingDoorEntered() && this.atCenter(g)) {
      g.setMode(ctx.schedulerMode, 'exited doorway after entering it');
      g.setLeavingDoorEntered(false);
      g.setLeavingOutDir(null);
    }
  }
}