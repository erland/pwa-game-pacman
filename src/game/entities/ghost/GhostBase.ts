// src/game/entities/ghost/GhostBase.ts
import Phaser from 'phaser';
import { TILE_SIZE, GHOST_FRAME, GhostName } from '../../config';
import { PacManDirection } from '../common/direction';
import { CENTER_TOLERANCE_PX } from '../common/grid';
import {
  GhostMode, TilePoint, DIRS, DIR_VECS,
  dirName, opposite, DEBUG_GHOSTS, LOG_GHOSTS
} from './GhostTypes';
import {
  GhostNavCtx, atTileCenter, currentTileCenterWorld, allowedDirections,
  blockReason, distance2, nextDirBFS
} from './GhostUtils';
import { ensureDebugDrawables, clearDebugDraw, drawGhostDebug, DebugHandles } from './GhostDebug';
import { GhostMover } from './movement/GhostMover';

// New: state machine + states
import { StateMachine } from './states/StateMachine';
import { UpdateCtx } from './states/Base';
import { InHouseState } from './states/InHouseState';
import { LeavingHouseState } from './states/LeavingHouseState';
import { ScatterState } from './states/ScatterState';
import { ChaseState } from './states/ChaseState';
import { FrightenedState } from './states/FrightenedState';
import { EatenState } from './states/EatenState';

export interface GhostOptions {
  name: GhostName;
  scatterTarget: TilePoint;
  mazeLayer: Phaser.Tilemaps.TilemapLayer;
  doorRect: Phaser.Geom.Rectangle;
  startX: number;
  startY: number;
  baseSpeed?: number; // px/sec
}

export abstract class Ghost extends Phaser.GameObjects.Sprite implements GhostNavCtx {
  private mover!: GhostMover;
  public name: GhostName;
  protected mazeLayer: Phaser.Tilemaps.TilemapLayer;
  protected doorRect: Phaser.Geom.Rectangle;

  protected currentDirection: PacManDirection | null = null;

  protected mode: GhostMode = GhostMode.InHouse;
  protected frozen = false;
  protected baseSpeed = 70;

  protected scatterTarget: TilePoint;
  protected frightenedTimerMs = 0;

  // debug
  private debug = DEBUG_GHOSTS;
  private logEnabled = LOG_GHOSTS;
  private dbg: DebugHandles = {};
  private lastStallKey?: string;
  private lastMode?: GhostMode;
  private reverseAllowed = false;
  private speedMultiplier = 1;

  // leaving-door bookkeeping (used by states)
  private leavingDoorEntered = false;
  private leavingOutDir: PacManDirection | null = null;

  // state machine
  private fsm!: StateMachine<Ghost, GhostMode>;

  constructor(scene: Phaser.Scene, opts: GhostOptions) {
    super(scene, opts.startX, opts.startY, 'pacman-characters', GHOST_FRAME[opts.name]);

    this.name = opts.name;
    this.scatterTarget = opts.scatterTarget;
    this.mazeLayer = opts.mazeLayer;
    this.doorRect = opts.doorRect;
    if (opts.baseSpeed) this.baseSpeed = opts.baseSpeed;

    this.setOrigin(0.5, 0.5);
    scene.add.existing(this);
    // Movement adapter over the generic GridMover
    this.mover = new GhostMover(this as unknown as Ghost, this.getSpeedPxPerSec());

    // build the state machine
    this.fsm = new StateMachine<Ghost, GhostMode>({
      [GhostMode.InHouse]:        new InHouseState(),
      [GhostMode.LeavingHouse]:   new LeavingHouseState(),
      [GhostMode.Scatter]:        new ScatterState(),
      [GhostMode.Chase]:          new ChaseState(),
      [GhostMode.Frightened]:     new FrightenedState(),
      [GhostMode.Eaten]:          new EatenState(),
      [GhostMode.ReturningHome]:  new EatenState(), // alias
    }, this.mode);

    if (this.logEnabled) {
      const t = this.getTile();
      // eslint-disable-next-line no-console
      console.log(
        `[${this.name}] ctor: start world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y} baseSpeed=${this.baseSpeed} doorRect=(${this.doorRect.x},${this.doorRect.y},${this.doorRect.width},${this.doorRect.height})`
      );
    }

    if (this.debug) this.dbg = ensureDebugDrawables(this.scene, this.dbg);
  }

  // --- GhostNavCtx
  public getTile(): TilePoint {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) };
  }
  get modeCtx() { return this.mode; }
  // --- end GhostNavCtx

  // --- helpers exposed for states (minimal API)
  public setMode(next: GhostMode, why: string) {
    if (this.mode !== next) {
      this.logModeTransition(this.mode, next, why);
      this.mode = next;
      this.lastMode = next;
      this.fsm.set(next, this);
    }
  }
  public getCurrentDirection(): PacManDirection | null { return this.currentDirection; }
  public setCurrentDirection(d: PacManDirection | null) { this.currentDirection = d; }
  public hasLeavingDoorEntered(): boolean { return this.leavingDoorEntered; }
  public setLeavingDoorEntered(v: boolean) { this.leavingDoorEntered = v; }
  public getLeavingOutDir(): PacManDirection | null { return this.leavingOutDir; }
  public setLeavingOutDir(d: PacManDirection | null) { this.leavingOutDir = d; }
  public setReverseAllowed(v: boolean) { this.reverseAllowed = v; }
  public isReverseAllowed(): boolean { return this.reverseAllowed; }
  public setSpeedMultiplier(m: number) { 
    this.speedMultiplier = m;
    // keep GridMover speed in sync
    if (this.mover) this.mover.setSpeedPxPerSec(this.getSpeedPxPerSec());
  }
  protected getSpeedPxPerSec(): number { return this.baseSpeed * this.speedMultiplier; }
  // ---

  // tiny logging helpers
  private log(msg: string) {
    if (!this.logEnabled) return;
    // eslint-disable-next-line no-console
    console.log(`[${this.name}] ${msg}`);
  }
  private logModeTransition(from: GhostMode, to: GhostMode, why: string) {
    if (!this.logEnabled) return;
    const t = this.getTile();
    // eslint-disable-next-line no-console
    console.log(
      `[${this.name}] MODE ${from} -> ${to} (${why}) | world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y} dir=${dirName(this.currentDirection)}`
    );
  }

  // public API
  public getMode(): GhostMode { return this.mode; }
  public setFrozen(value: boolean) { this.frozen = value; }
  public isInHouse(): boolean { return this.mode === GhostMode.InHouse || this.mode === GhostMode.LeavingHouse; }

  public setDebug(on: boolean) {
    this.debug = on;
    if (on) this.dbg = ensureDebugDrawables(this.scene, this.dbg);
    else clearDebugDraw(this.dbg);
  }

  public releaseFromHouse(): void {
    if (this.mode === GhostMode.InHouse) {
      const t = this.getTile();
      this.log(`releaseFromHouse(): -> LeavingHouse | start world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y}`);
      this.leavingDoorEntered = false;
      this.leavingOutDir = null; // reset latch
      this.setMode(GhostMode.LeavingHouse, 'releaseFromHouse');
      this.currentDirection = null;
    }
  }

  public frighten(durationSec: number) {
    // Do NOT frighten in-pen, leaving, or when already eyes
    if (
      this.mode === GhostMode.InHouse ||
      this.mode === GhostMode.LeavingHouse ||
      this.mode === GhostMode.Eaten ||
      this.mode === GhostMode.ReturningHome
    ) {
      return;
    }

    this.setMode(GhostMode.Frightened, `frighten(${durationSec}s)`);
    this.frightenedTimerMs = durationSec * 1000;

    // Immediate reverse on entry (classic behavior)
    if (this.currentDirection) this.currentDirection = opposite(this.currentDirection);
  }

  public setEaten(): void {
    this.setMode(GhostMode.Eaten, 'eaten by Pac-Man');
    if (this.currentDirection) this.currentDirection = opposite(this.currentDirection);
  }

  /** Entry point called each tick from the scene. */
  public updateGhost(
    dtMs: number,
    schedulerMode: GhostMode,
    pacTile: TilePoint,
    pacFacing: Phaser.Math.Vector2,
    blinkyTile: TilePoint
  ) {
    if (this.frozen) { if (this.debug) clearDebugDraw(this.dbg); return; }

    const ctx: UpdateCtx = { schedulerMode, pacTile, pacFacing, blinkyTile };

    // delegate to FSM
    this.fsm.update(this, dtMs, ctx);

    if (this.debug) {
      this.dbg = ensureDebugDrawables(this.scene, this.dbg);
      drawGhostDebug(this.scene, { ...this, name: this.name, currentDirection: this.currentDirection }, pacTile, this.dbg);
    }

    this.updateFrameForMode();
  }

  public getFrightenedTimerMs(): number { return this.frightenedTimerMs; }
  public setFrightenedTimerMs(ms: number) { this.frightenedTimerMs = ms; }

  // --- Movement logic: shared grid stepper ---
  protected stepTowards(target: TilePoint, dtMs: number) {
    // Pre-turn: if we'll hit the next center within this frame, queue the BFS turn now.
    if (!atTileCenter(this) && this.currentDirection != null) {
      const here = this.getTile();
      const vcur = DIR_VECS[this.currentDirection];
      const nextTile = { x: here.x + (vcur.x as number), y: here.y + (vcur.y as number) };
      const nextCx = this.mazeLayer.tileToWorldX(nextTile.x) + TILE_SIZE / 2;
      const nextCy = this.mazeLayer.tileToWorldY(nextTile.y) + TILE_SIZE / 2;
      const reachPx = this.getSpeedPxPerSec() * (dtMs / 1000);
      const preTurnPx = Math.max(CENTER_TOLERANCE_PX, reachPx + 0.1); // “I’ll reach it next tick”
      const axisDist =
        (this.currentDirection === PacManDirection.Left || this.currentDirection === PacManDirection.Right)
          ? Math.abs(this.x - nextCx)
          : Math.abs(this.y - nextCy);

      if (axisDist <= preTurnPx) {
        let candidates = allowedDirections(this);
        if (this.currentDirection && !this.reverseAllowed) {
          const rev = opposite(this.currentDirection);
          candidates = candidates.filter((d) => d !== rev);
          if (candidates.length === 0) candidates = allowedDirections(this); // fail-safe
        }
        if (candidates.length > 0) {
          const bfsDir = nextDirBFS(this, here, target, this.reverseAllowed ? null : this.currentDirection);
          if (bfsDir != null && candidates.includes(bfsDir)) {
            // Queue now; GhostMover will apply it at the next tile center
            this.mover.queue(bfsDir);
          }
        }
      }
    }

    // Decide/queue a direction only when centered on a tile
    if (atTileCenter(this)) {
      const allowed = allowedDirections(this);
      let candidates = allowed;

      // Classic no-reverse rule (unless current state allows it)
      if (this.currentDirection && !this.reverseAllowed) {
        const rev = opposite(this.currentDirection);
        candidates = allowed.filter((d) => d !== rev);
        if (candidates.length === 0) candidates = allowed; // fail-safe
      }

      if (candidates.length === 0) {
        // Keep your useful stall logging
        const h = this.getTile();
        const stallKey = `${this.name}@${h.x},${h.y}:${this.mode}`;
        if (this.logEnabled && stallKey !== this.lastStallKey) {
          this.lastStallKey = stallKey;
          const reasons: string[] = [];
          for (const d of DIRS) {
            const v = DIR_VECS[d];
            const nx = h.x + (v.x as number);
            const ny = h.y + (v.y as number);
            reasons.push(`${dirName(d)} -> ${blockReason(this, nx, ny)}`);
          }
          this.log(
            `STALL at ${h.x},${h.y} mode=${this.mode} dir=${dirName(this.currentDirection)} | neighbors: ${reasons.join(' | ')}`
          );
        }
      } else {
        // 1) Tile-first BFS for the next *tile* toward target (clean, no ping-pong).
        const here = this.getTile();
        const bfsDir = nextDirBFS(
          this,
          here,
          target,
          this.reverseAllowed ? null : this.currentDirection ?? null
        );

        if (bfsDir != null && candidates.includes(bfsDir)) {
          this.currentDirection = bfsDir;
          this.mover.queue(bfsDir); // GridMover keeps motion smooth (sub-tile)
        } else {
          // 2) Fallback: greedy neighbor minimizing distance² to target
          let bestDir = candidates[0];
          let bestDist = Number.POSITIVE_INFINITY;
          for (const d of candidates) {
            const v = DIR_VECS[d];
            const nxt = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
            const dist = distance2(nxt, target);
            if (dist < bestDist) { bestDist = dist; bestDir = d; }
          }
          this.currentDirection = bestDir;
          this.mover.queue(bestDir);
        }
      }
    }
  
    // Keep mover speed synced with current multipliers/policies
    this.mover.setSpeedPxPerSec(this.getSpeedPxPerSec());
  
    // Advance using the generic mover (handles snapping & collision guards)
    this.mover.step(dtMs);
  
    // Reflect actual direction (may be null if we stopped at a center)
    this.currentDirection = this.mover.direction();
  }


  protected alignToTileCenter() {
    const c = currentTileCenterWorld(this);
    this.setPixel(c.x, c.y);
  }

  protected setPixel(x: number, y: number) { this.x = x; this.y = y; }
  protected abstract getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, blinkyTile: TilePoint): TilePoint;

  protected updateFrameForMode() {
    if (this.mode === GhostMode.Frightened) {
      this.setTint(0x0000ff);
    } else if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) {
      this.clearTint(); this.setAlpha(0.7);
    } else {
      this.clearTint(); this.setAlpha(1);
      this.setFrame(GHOST_FRAME[this.name], true, false);
      this.setOrigin(0.5, 0.5);
    }
  }
}