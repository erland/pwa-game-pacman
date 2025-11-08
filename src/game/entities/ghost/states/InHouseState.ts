// src/game/entities/ghost/states/InHouseState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

export class InHouseState extends GhostState {
  readonly id = GhostMode.InHouse;

  enter(g: Ghost): void {
    g.setReverseAllowed(false);
    g.setSpeedMultiplier(1);
    // Classic idle facing
    g.setCurrentDirection(PacManDirection.Up);
  }

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    // Keep the ghost centered inside the pen while waiting for releaseFromHouse()
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    const center: TilePoint = { x: Math.round(pt.x), y: Math.round(pt.y) };

    // If we're already at a tile center, no need to move each tick.
    // Otherwise, step toward the pen center (door is blocked in InHouse, so we won't exit).
    if (!this.atCenter(g)) {
      this.stepTo(g, center, dtMs);
    }
  }
}