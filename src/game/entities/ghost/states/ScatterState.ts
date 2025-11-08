import type { Ghost } from '../GhostBase';
import { GhostMode } from '../GhostTypes';
import { GhostState, UpdateCtx } from './Base';

/** Scatter = head to your corner. */
export class ScatterState extends GhostState {
  readonly id = GhostMode.Scatter;

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    // Obey the global scheduler (keeps your current behavior)
    if (ctx.schedulerMode !== GhostMode.Scatter) {
      g.setMode(ctx.schedulerMode, 'scheduler tick');
      return;
    }

    // Use the existing movement with the scatter corner as target.
    this.stepTo(g, g.scatterTarget, dtMs);
  }
}