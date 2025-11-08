// src/game/entities/ghost/movement/GhostMover.ts
import { GridMover } from '../../movement/GridMover';
import { GhostGridEnv } from './GhostGridEnv';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

/** Thin wrapper so GhostBase doesn’t talk to GridMover directly. */
export class GhostMover {
  private mover: GridMover;

  constructor(private readonly ghost: Ghost, speedPxPerSec: number) {
    this.mover = new GridMover(new GhostGridEnv(ghost), { speedPxPerSec });
  }

  setSpeedPxPerSec(px: number) {
    this.mover.setSpeedPxPerSec(px);
  }

  /** Queue a desired direction; GridMover will apply it at center/safely. */
  queue(dir: PacManDirection) {
    this.mover.queue(dir);
  }

  /** Force direction immediately (used rarely). */
  force(dir: PacManDirection | null) {
    this.mover.force(dir);
  }

  /** Current effective direction (may be null when blocked/at center). */
  direction(): PacManDirection | null {
    return this.mover.direction();
  }

  /** Advance the ghost’s Sprite position (x,y) by dt. */
  step(dtMs: number) {
    this.mover.step(dtMs, this.ghost);
  }
}