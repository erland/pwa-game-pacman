import type { Ghost } from '../GhostBase';
import { GhostMode, TilePoint } from '../GhostTypes';
import { GhostState, UpdateCtx } from './Base';

/** Chase = per-ghost targeting toward Pac-Man (your getChaseTarget). */
export class ChaseState extends GhostState {
  readonly id = GhostMode.Chase;

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    // Obey the global scheduler (keeps your current behavior)
    if (ctx.schedulerMode !== GhostMode.Chase) {
      g.setMode(ctx.schedulerMode, 'scheduler tick');
      return;
    }

    // Delegate to your existing per-ghost targeting.
    const target: TilePoint = (g as any).getChaseTarget(ctx.pacTile, ctx.pacFacing, ctx.blinkyTile);
    this.stepTo(g, target, dtMs);
  }
}