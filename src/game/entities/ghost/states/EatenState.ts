// src/game/entities/ghost/states/EatenState.ts
import Phaser from 'phaser';
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

export class EatenState extends GhostState {
  readonly id = GhostMode.Eaten;

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    // Target the pen (doorway) center tile.
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    const target: TilePoint = { x: Math.round(pt.x), y: Math.round(pt.y) };

    // Move using shared grid stepper (Eaten speed handled in getSpeedPxPerSec).
    this.stepTo(g, target, dtMs);

    // When inside the door rectangle and centered, reform in the pen.
    const inDoor = Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y);
    if (inDoor && this.atCenter(g)) {
      g.setMode(GhostMode.InHouse, 'reached house center (eaten)');
      // Face up after reforming (classic behavior).
      g.setCurrentDirection(PacManDirection.Up);
      // NOTE: Re-release timing is up to your scheduler/logic.
    }
  }
}