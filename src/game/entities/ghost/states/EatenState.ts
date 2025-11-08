// src/game/entities/ghost/states/EatenState.ts
import Phaser from 'phaser';
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint, DIR_VECS } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

export class EatenState extends GhostState {
  readonly id = GhostMode.Eaten;

  private doorTile(g: Ghost): TilePoint {
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    return { x: Math.round(pt.x), y: Math.round(pt.y) };
  }

  /** Compute the tile one step *inside* the pen using the latched door direction. */
  private innerTileFromDir(door: TilePoint, dir: PacManDirection): TilePoint {
    const v = DIR_VECS[dir];
    return { x: door.x + (v.x as number), y: door.y + (v.y as number) };
  }

  /** If we haven't latched a direction yet, infer which way is "into the pen". */
  private inferInDir(g: Ghost): PacManDirection {
    // Door is vertical in classic layouts: if ghost is above center, inside is Down; otherwise Up.
    return (g.y < g.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up;
  }

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    const door = this.doorTile(g);
    const inDoorNow = Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y);

    // Latch: once the ghost is in the doorway, remember which way is "in".
    if (inDoorNow) {
      g.setLeavingDoorEntered(true);
      if (g.getLeavingOutDir() == null) {
        // reuse the same latch field for a "through-door direction"
        g.setLeavingOutDir(this.inferInDir(g));
      }
    }

    // Choose target:
    //  - Before entering the door: head to the door tile (to align).
    //  - After entering (or once we've latched): always head to the inner tile.
    const hasLatched = g.hasLeavingDoorEntered() || g.getLeavingOutDir() != null;
    const inDir = g.getLeavingOutDir() ?? this.inferInDir(g);
    const inner = this.innerTileFromDir(door, inDir);
    const target = hasLatched ? inner : door;

    // Move using the shared stepper (Eaten speed handled by getSpeedPxPerSec()).
    this.stepTo(g, target, dtMs);

    // Promote to InHouse when centered exactly on the inner tile (no dependency on door rectangle).
    if (this.atCenter(g)) {
      const here = g.getTile();
      if (here.x === inner.x && here.y === inner.y) {
        g.setMode(GhostMode.InHouse, 'reached inner pen tile (eaten)');
        g.setCurrentDirection(PacManDirection.Up); // classic idle direction
        // Clear latches
        g.setLeavingDoorEntered(false);
        g.setLeavingOutDir(null);
      }
    }
  }
}