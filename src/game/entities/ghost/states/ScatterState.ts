// src/game/entities/ghost/states/ScatterState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode } from '../GhostTypes';
import type { Ghost } from '../GhostBase';

export class ScatterState extends GhostState {
  readonly id = GhostMode.Scatter;
  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    if (ctx.schedulerMode !== GhostMode.Scatter) {
      g.setMode(ctx.schedulerMode, 'scheduler tick');
      return;
    }
    this.stepTo(g, g.scatterTarget, dtMs);
  }
}