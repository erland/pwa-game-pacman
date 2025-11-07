import { GhostMode, LEVEL_TIMINGS } from './config';

interface ModePhase {
  mode: GhostMode;
  durationMs: number; // -1 for infinite
}

export class GhostModeScheduler {
  private phases: ModePhase[] = [];
  private index = 0;
  private elapsedMs = 0;
  private paused = false;

  constructor(private level: number) {
    this.phases = this.buildPhases(level);
  }

  public update(dtMs: number): void {
    if (this.paused) {
      return;
    }

    const phase = this.phases[this.index];
    if (!phase || phase.durationMs < 0) {
      return;
    }

    this.elapsedMs += dtMs;
    if (this.elapsedMs >= phase.durationMs) {
      this.index = Math.min(this.index + 1, this.phases.length - 1);
      this.elapsedMs = 0;
    }
  }

  public getMode(): GhostMode {
    return this.phases[this.index]?.mode ?? GhostMode.Chase;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public reset(level: number): void {
    this.level = level;
    this.index = 0;
    this.elapsedMs = 0;
    this.paused = false;
    this.phases = this.buildPhases(level);
  }

  private buildPhases(level: number): ModePhase[] {
    const config = LEVEL_TIMINGS[Math.min(level - 1, LEVEL_TIMINGS.length - 1)];
    const phases: ModePhase[] = [];

    const scatter = config.scatter;
    const chase = config.chase;

    for (let i = 0; i < scatter.length && i < chase.length; i += 1) {
      phases.push({ mode: GhostMode.Scatter, durationMs: scatter[i] * 1000 });
      const chaseDuration = chase[i] < 0 ? -1 : chase[i] * 1000;
      phases.push({ mode: GhostMode.Chase, durationMs: chaseDuration });
    }

    if (phases.length === 0) {
      phases.push({ mode: GhostMode.Chase, durationMs: -1 });
    } else if (phases[phases.length - 1].mode !== GhostMode.Chase) {
      phases.push({ mode: GhostMode.Chase, durationMs: -1 });
    } else {
      phases[phases.length - 1].durationMs = -1;
    }

    return phases;
  }
}
