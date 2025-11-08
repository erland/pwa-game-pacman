// src/game/entities/ghost/states/FrightenedState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode } from '../GhostTypes';
import type { Ghost } from '../GhostBase';

export class FrightenedState extends GhostState {
  readonly id = GhostMode.Frightened;

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    // Timer is decremented in GhostBase; when finished we switch back via scheduler.
    const target = {
      x: ctx.pacTile.x + Math.round((Math.random() - 0.5) * 14),
      y: Math.round(ctx.pacTile.y + (Math.random() - 0.5) * 14),
    };
    this.stepTo(g, target, dtMs);
  }
}