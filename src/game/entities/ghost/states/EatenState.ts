// src/game/entities/ghost/states/EatenState.ts
import Phaser from 'phaser';
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

export class EatenState extends GhostState {
  readonly id = GhostMode.Eaten;

  /** Resolve the door tile precisely from world coords. */
  private doorTile(g: Ghost): TilePoint {
    const t = g.mazeLayer.getTileAtWorldXY(g.doorRect.centerX, g.doorRect.centerY);
    if (t) return { x: t.x, y: t.y };
    // Fallback (shouldn’t normally happen)
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) };
  }

  /** For classic vertical doorway: pen is below the door -> inner tile = (x, y+1). */
  private innerPenTile(g: Ghost, door: TilePoint): TilePoint {
    return { x: door.x, y: door.y + 1 };
  }

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    const door = this.doorTile(g);
    const here = g.getTile();
    const inDoorNow = Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y);

    // Latch "entered door" as soon as we touch the door tile or its rectangle.
    if (inDoorNow || (here.x === door.x && here.y === door.y)) {
      g.setLeavingDoorEntered(true);
    }

    const inner = this.innerPenTile(g, door);
    // Before we’ve entered the doorway: align to the door tile. After that: always target the inner tile.
    const target = g.hasLeavingDoorEntered() ? inner : door;

    // Move using the shared grid stepper (Eaten speed handled in getSpeedPxPerSec()).
    this.stepTo(g, target, dtMs);

    // When centered exactly on the inner pen tile, switch to InHouse.
    if (this.atCenter(g)) {
      const pos = g.getTile();
      if (pos.x === inner.x && pos.y === inner.y) {
        g.setMode(GhostMode.InHouse, 'reached inner pen tile (eaten)');
        g.setCurrentDirection(PacManDirection.Up); // classic idle
        // Clear latches so LeavingHouse can reuse them later
        g.setLeavingDoorEntered(false);
        g.setLeavingOutDir(null);
      }
    }
  }
}