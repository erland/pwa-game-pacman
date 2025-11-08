// src/game/entities/ghost/states/Base.ts
import { GhostMode, TilePoint } from '../GhostTypes';
import { allowedDirections, atTileCenter, pickLeavingDirection } from '../GhostUtils';
import { PacManDirection } from '../../common/direction';
import type { Ghost } from '../GhostBase';

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

  protected stepTo(g: Ghost, target: TilePoint, dtMs: number) {
    (g as any).stepTowards(target, dtMs);
  }

  protected choosePreferredLeaving(g: Ghost, target: TilePoint, allowed: PacManDirection[]): PacManDirection | null {
    const here = g.getTile();
    return pickLeavingDirection(here, target, allowed);
  }

  protected canTurnOut(g: Ghost, out: PacManDirection): boolean {
    const dirs = allowedDirections(g);
    return dirs.includes(out);
  }

  protected atCenter(g: Ghost): boolean { return atTileCenter(g); }
}