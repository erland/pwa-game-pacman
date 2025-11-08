// src/game/entities/ghost/states/FrightenedState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint, DIR_VECS } from '../GhostTypes';
import type { Ghost } from '../GhostBase';

export class FrightenedState extends GhostState {
  readonly id = GhostMode.Frightened;

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    let target: TilePoint;

    if (this.atCenter(g)) {
      // Choose a random legal direction when centered on a tile.
      const allowed = this.allowed(g);
      if (allowed.length === 0) {
        // Nowhere to go; just step (will align to center)
        this.stepTo(g, g.getTile(), dtMs);
        return;
      }

      // Pick one at random (original game allows reversal while frightened).
      const choice = allowed[(Math.random() * allowed.length) | 0];

      // Aim the "next tile" in that direction so the shared mover honors our choice.
      const here = g.getTile();
      const v = DIR_VECS[choice];
      target = { x: here.x + (v.x as number), y: here.y + (v.y as number) };

      // Hint the mover about current direction (not strictly required but helps readability/debug).
      g.setCurrentDirection(choice);
    } else {
      // Between centers: target doesn't matter for direction choice; keep stepping.
      target = g.getTile();
    }

    // Move using the shared, grid-aware stepper (already slower in Frightened via getSpeedPxPerSec()).
    this.stepTo(g, target, dtMs);
  }
}