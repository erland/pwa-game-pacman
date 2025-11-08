import type { Ghost } from '../GhostBase';
import { GhostMode, TilePoint } from '../GhostTypes';
import { atTileCenter, allowedDirections, pickLeavingDirection } from '../GhostUtils';
import { PacManDirection } from '../../common/direction';

export type UpdateCtx = {
  schedulerMode: GhostMode;
  pacTile: TilePoint;
  pacFacing: Phaser.Math.Vector2;
  blinkyTile: TilePoint;
};

export abstract class GhostState {
  abstract readonly id: GhostMode;

  enter(_g: Ghost): void {}
  exit(_g: Ghost): void {}
  abstract update(g: Ghost, dtMs: number, ctx: UpdateCtx): void;

  /** Call the ghost’s existing movement (keeps behavior identical). */
  protected stepTo(g: Ghost, target: TilePoint, dtMs: number) {
    (g as any).stepTowards(target, dtMs);
  }

  // Small helpers some states use:
  protected atCenter(g: Ghost): boolean { return atTileCenter(g); }
  protected allowed(g: Ghost): PacManDirection[] { return allowedDirections(g); }
  protected leavingPick(g: Ghost, target: TilePoint, allowed: PacManDirection[]) {
    return pickLeavingDirection(g.getTile(), target, allowed);
  }
}