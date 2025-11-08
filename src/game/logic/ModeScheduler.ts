
import { LEVEL_TIMINGS } from '../config';
import { GhostMode } from '../entities/Ghost';

export class ModeScheduler {
  private levelIndex: number;
  private timeMs = 0;
  private phaseIndex = 0;
  private frightenedOverrideMs = 0;

  constructor(level: number) {
    this.levelIndex = Math.max(0, Math.min(LEVEL_TIMINGS.length - 1, level - 1));
  }

  /** Advance scheduler clock; returns current mode (scatter/chase). */
  public tick(dtMs: number): GhostMode {
    if (this.frightenedOverrideMs > 0) {
      this.frightenedOverrideMs = Math.max(0, this.frightenedOverrideMs - dtMs);
      // Still return the underlying mode to keep phaseIndex progression paused
      return this.currentBaseMode();
    }

    this.timeMs += dtMs;

    // Switch phases according to level timing config
    const cfg = LEVEL_TIMINGS[this.levelIndex];
    const scatterDur = cfg.scatter[this.phaseIndex] ?? 0;
    const chaseDur = cfg.chase[this.phaseIndex] ?? 0;

    const cycleDur = (scatterDur > 0 ? scatterDur : 0) + (chaseDur > 0 ? chaseDur : 0);
    let elapsed = this.timeMs / 1000;

    // Advance phaseIndex when we've consumed both scatter and chase
    if (cycleDur > 0) {
      while (elapsed >= (scatterDur + chaseDur) && this.phaseIndex < cfg.scatter.length - 1) {
        this.phaseIndex++;
        this.timeMs = 0;
        elapsed = 0;
      }
    }

    return this.currentBaseMode();
  }

  private currentBaseMode(): GhostMode {
    const cfg = LEVEL_TIMINGS[this.levelIndex];
    const scatterDur = cfg.scatter[this.phaseIndex] ?? 0;
    const elapsed = this.timeMs / 1000;
    if (scatterDur > 0 && elapsed < scatterDur) return GhostMode.Scatter;
    return GhostMode.Chase;
  }

  public frightenedSeconds(level: number): number {
    const idx = Math.max(0, Math.min(LEVEL_TIMINGS.length - 1, level - 1));
    return LEVEL_TIMINGS[idx].frightened;
  }

  public startFrightenedOverride(seconds: number) {
    this.frightenedOverrideMs = Math.max(this.frightenedOverrideMs, seconds * 1000);
  }
}
