// src/game/entities/ghost/states/FrightenedState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode, TilePoint, DIR_VECS, opposite } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import { PacManDirection } from '../../common/direction';

/** Feed the mover and keep ghost bookkeeping in sync. */
function queueDirOnMover(g: any, dir: PacManDirection) {
  const mover = g.mover ?? g.gridMover;
  mover?.queue?.(dir);
  g.setCurrentDirection?.(dir);
}

const ALL_DIRS: PacManDirection[] = [
  PacManDirection.Up,
  PacManDirection.Right,
  PacManDirection.Down,
  PacManDirection.Left,
];

export class FrightenedState extends GhostState {
  readonly id = GhostMode.Frightened;
  private centerLatch = new WeakMap<Ghost, string>();

  enter(g: Ghost): void {
    g.setReverseAllowed(true);
    g.setSpeedMultiplier(0.6);

    // Classic: immediate reverse on enter
    const cur = g.getCurrentDirection();
    if (cur) queueDirOnMover(g, opposite(cur));

    this.centerLatch.delete(g);
  }

  exit(g: Ghost): void {
    this.centerLatch.delete(g);
  }

  update(g: Ghost, dtMs: number, ctx: UpdateCtx): void {
    // Timer
    const remaining = g.getFrightenedTimerMs() - dtMs;
    g.setFrightenedTimerMs(remaining);
    if (remaining <= 0) {
      g.setMode(ctx.schedulerMode, 'frightened timeout');
      return;
    }

    const atCenter = this.atCenter(g);
    const here = g.getTile();
    const key = `${here.x},${here.y}`;
    const latchedKey = this.centerLatch.get(g);

    // If we’ve left center, allow a new decision at the next center
    if (!atCenter && latchedKey) this.centerLatch.delete(g);

    let target: TilePoint;

    if (atCenter) {
      if (!latchedKey || latchedKey !== key) {
        let candidates = this.allowed(g);

        // Prefer non-reverse unless it’s the only way out
        const cur = g.getCurrentDirection();
        if (cur) {
          const nonReverse = candidates.filter(d => d !== opposite(cur as PacManDirection));
          if (nonReverse.length > 0) candidates = nonReverse;
        }

        if (candidates.length === 0) {
          // Avoid target=here; try reverse if we have a current dir, else last-resort random
          const fallback = (cur ? opposite(cur) : ALL_DIRS[(Math.random() * ALL_DIRS.length) | 0]);
          const v = DIR_VECS[fallback];
          target = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
          queueDirOnMover(g, fallback);
        } else {
          // Slight keep-straight bias; else random among allowed
          let choice: PacManDirection;
          if (cur && candidates.includes(cur)) {
            choice = cur;
          } else {
            choice = candidates[(Math.random() * candidates.length) | 0];
          }
          const v = DIR_VECS[choice];
          target = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
          queueDirOnMover(g, choice);
        }

        this.centerLatch.set(g, key); // latch this node
      } else {
        // Already decided at this center → continue toward next tile in current dir
        const cur = g.getCurrentDirection();
        target = cur
          ? { x: here.x + (DIR_VECS[cur].x as number), y: here.y + (DIR_VECS[cur].y as number) }
          : here;
      }
    } else {
      // Between centers: keep going straight
      const cur = g.getCurrentDirection();
      target = cur
        ? { x: here.x + (DIR_VECS[cur].x as number), y: here.y + (DIR_VECS[cur].y as number) }
        : here;
    }

    // Step; if movement was canceled (collision → dir=null), clear latch so we can re-decide here
    const mover = (g as any).mover ?? (g as any).gridMover;
    const beforeDir = mover?.direction?.() ?? null;

    this.stepTo(g, target, dtMs);

    const afterDir = mover?.direction?.() ?? null;
    if (beforeDir && afterDir === null) {
      this.centerLatch.delete(g);
    }
  }
}