// src/game/entities/ghost/states/ChaseState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode } from '../GhostTypes';
import type { Ghost } from '../GhostBase';

export class ChaseState extends GhostState {
  readonly id = GhostMode.Chase;
  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    if (ctx.schedulerMode !== GhostMode.Chase) {
      g.setMode(ctx.schedulerMode, 'scheduler tick');
      return;
    }
    const target = g['getChaseTarget'](ctx.pacTile, ctx.pacFacing, ctx.blinkyTile);
    this.stepTo(g, target, dtMs);
  }
}