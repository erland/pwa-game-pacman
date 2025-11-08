// src/game/entities/ghost/GhostBase.ts
import Phaser from 'phaser';
import { TILE_SIZE, GHOST_FRAME, GhostName } from '../../config';
// ⬇️ decouple from PacMan.ts – use shared directions
import { PacManDirection } from '../common/direction';
import {
  GhostMode, TilePoint, DIRS, DIR_VECS,
  dirName, opposite, DEBUG_GHOSTS, LOG_GHOSTS, LOG_LEAVING_EVERY_TICK
} from './GhostTypes';
import {
  GhostNavCtx, atTileCenter, currentTileCenterWorld, allowedDirections,
  isBlockedTile, blockReason, distance2, willCollide, pickLeavingDirection
} from './GhostUtils';
import { ensureDebugDrawables, clearDebugDraw, drawGhostDebug, DebugHandles } from './GhostDebug';

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
  private lastTickKey?: string;
  private lastMode?: GhostMode;

  // leaving-door bookkeeping
  private leavingDoorEntered = false;
  private leavingOutDir: PacManDirection | null = null;

  constructor(scene: Phaser.Scene, opts: GhostOptions) {
    super(scene, opts.startX, opts.startY, 'pacman-characters', GHOST_FRAME[opts.name]);

    this.name = opts.name;
    this.scatterTarget = opts.scatterTarget;
    this.mazeLayer = opts.mazeLayer;
    this.doorRect = opts.doorRect;
    if (opts.baseSpeed) this.baseSpeed = opts.baseSpeed;

    this.setOrigin(0.5, 0.5);
    scene.add.existing(this);

    if (this.logEnabled) {
      const t = this.getTile();
      // eslint-disable-next-line no-console
      console.log(
        `[${this.name}] ctor: start world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y} baseSpeed=${this.baseSpeed} doorRect=(${this.doorRect.x},${this.doorRect.y},${this.doorRect.width},${this.doorRect.height})`
      );
    }

    if (this.debug) this.dbg = ensureDebugDrawables(this.scene, this.dbg);
  }

  // GhostNavCtx
  public getTile(): TilePoint {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) };
  }
  get modeCtx() { return this.mode; } // not used; compatibility
  // end GhostNavCtx members

  // tiny logging helpers
  private log(msg: string) {
    if (!this.logEnabled) return;
    // eslint-disable-next-line no-console
    console.log(`[${this.name}] ${msg}`);
  }
  private logModeTransition(from: GhostMode, to: GhostMode, why: string) {
    if (!this.logEnabled) return;
    const t = this.getTile();
    console.log(
      `[${this.name}] MODE ${from} -> ${to} (${why}) | world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y} dir=${dirName(this.currentDirection)}`
    );
  }
  private setMode(next: GhostMode, why: string) {
    if (this.mode !== next) {
      this.logModeTransition(this.mode, next, why);
      this.mode = next;
      this.lastMode = next;
    }
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

  /** Called by scheduler to update global mode (scatter/chase) when not in special states. */
  public applyScheduledMode(mode: GhostMode) {
    if (this.mode === GhostMode.Scatter || this.mode === GhostMode.Chase) {
      if (this.mode !== mode) this.setMode(mode, 'scheduler tick');
    }
  }

  public frighten(durationSec: number) {
    if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) return;
    this.setMode(GhostMode.Frightened, `frighten(${durationSec}s)`);
    this.frightenedTimerMs = durationSec * 1000;
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

    // mode-change trace
    if (this.logEnabled && this.lastMode !== this.mode) {
      this.log(`tick: mode=${this.mode}`);
      this.lastMode = this.mode;
    }

    // frightened timer
    if (this.mode === GhostMode.Frightened) {
      this.frightenedTimerMs -= dtMs;
      if (this.frightenedTimerMs <= 0) this.setMode(schedulerMode, 'frightened timeout');
    } else if (this.mode !== GhostMode.LeavingHouse && this.mode !== GhostMode.Eaten) {
      this.applyScheduledMode(schedulerMode);
    }

    // Decide target
    let target: TilePoint;
    if (this.mode === GhostMode.Scatter) {
      target = this.scatterTarget;
    } else if (this.mode === GhostMode.Chase) {
      target = this.getChaseTarget(pacTile, pacFacing, blinkyTile);
    } else if (this.mode === GhostMode.Frightened) {
      target = {
        x: pacTile.x + Math.round((Math.random() - 0.5) * 14),
        y: Math.round(pacTile.y + (Math.random() - 0.5) * 14),
      };
    } else if (this.mode === GhostMode.LeavingHouse) {
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.centerY);
      const doorTile = { x: Math.round(pt.x), y: Math.round(pt.y) };

      const inDoorNow = Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y);
      if (inDoorNow) this.leavingDoorEntered = true;

      if (inDoorNow && this.leavingOutDir == null) {
        this.leavingOutDir = (this.y <= this.doorRect.centerY)
          ? PacManDirection.Down
          : PacManDirection.Up;
      }

      const outDir = this.leavingOutDir ?? ((this.y <= this.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up);
      const outVec = DIR_VECS[outDir];
      const doorOutTile = { x: doorTile.x + (outVec.x as number), y: doorTile.y + (outVec.y as number) };
      target = inDoorNow ? doorOutTile : doorTile;

      if (inDoorNow && atTileCenter(this)) {
        const allowedNow = allowedDirections(this);
        if (allowedNow.includes(outDir)) this.currentDirection = outDir;
      }

      if (this.logEnabled && LOG_LEAVING_EVERY_TICK) {
        const here = this.getTile();
        const allowed = allowedDirections(this).map(d => dirName(d)).join(', ');
        const neighborReasons = DIRS.map(d => {
          const v = DIR_VECS[d];
          const nx = here.x + (v.x as number);
          const ny = here.y + (v.y as number);
          return `${dirName(d)}:${blockReason(this, nx, ny)}`;
        }).join(' | ');
        const tickKey = `${here.x},${here.y}:${this.mode}:${dirName(this.currentDirection)}:${inDoorNow}:${this.leavingDoorEntered}:out=${dirName(outDir)}`;
        if (tickKey !== this.lastTickKey) {
          this.lastTickKey = tickKey;
          this.log(
            `LEAVING: world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${here.x},${here.y} ` +
            `target=${target.x},${target.y} (door=${doorTile.x},${doorTile.y} out=${dirName(outDir)}) ` +
            `atCenter=${atTileCenter(this)} inDoor=${inDoorNow} enteredDoor=${this.leavingDoorEntered} ` +
            `dir=${dirName(this.currentDirection)} allowed=[${allowed}] | neighbors { ${neighborReasons} }`
          );
        }
      }

      if (!inDoorNow && this.leavingDoorEntered && atTileCenter(this)) {
        this.setMode(schedulerMode, 'exited doorway after entering it');
        this.leavingDoorEntered = false;
        this.leavingOutDir = null;
      }
    } else {
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.centerY);
      target = { x: Math.round(pt.x), y: Math.round(pt.y) };
      if (Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y) && atTileCenter(this)) {
        this.setMode(GhostMode.InHouse, 'reached house center');
        this.currentDirection = PacManDirection.Up;
      }
    }

    // Step movement (unchanged stepping logic)
    this.stepTowards(target, dtMs);

    if (this.debug) {
      this.dbg = ensureDebugDrawables(this.scene, this.dbg);
      drawGhostDebug(this.scene, { ...this, name: this.name, currentDirection: this.currentDirection }, target, this.dbg);
    }

    this.updateFrameForMode();
  }

  protected stepTowards(target: TilePoint, dtMs: number) {
    const chooseDirIfCenter = () => {
      if (!atTileCenter(this)) return;
      const allowed = allowedDirections(this);
      let candidates = allowed;

      if (this.currentDirection && this.mode !== GhostMode.Frightened && this.mode !== GhostMode.LeavingHouse) {
        const rev = opposite(this.currentDirection);
        candidates = allowed.filter((d) => d !== rev);
        if (candidates.length === 0) candidates = allowed;
      }

      if (candidates.length === 0) {
        const h = this.getTile();
        const stallKey = `${this.name}@${h.x},${h.y}:%${this.mode}`;
        if (this.logEnabled && stallKey !== this.lastStallKey) {
          this.lastStallKey = stallKey;
          const reasons: string[] = [];
          for (const d of DIRS) {
            const v = DIR_VECS[d];
            const nx = h.x + (v.x as number);
            const ny = h.y + (v.y as number);
            reasons.push(`${dirName(d)} -> ${blockReason(this, nx, ny)}`);
          }
          this.log(`STALL at ${h.x},${h.y} mode=${this.mode} dir=${dirName(this.currentDirection)} | neighbors: ${reasons.join(' | ')}`);
        }
        return;
      }

      if (this.mode === GhostMode.LeavingHouse) {
        const here = this.getTile();
        const preferred = pickLeavingDirection(here, target, candidates);
        if (preferred) { this.currentDirection = preferred; return; }
      }

      let bestDir = candidates[0];
      let bestDist = Number.POSITIVE_INFINITY;
      const here = this.getTile();
      for (const d of candidates) {
        const v = DIR_VECS[d];
        const nxt = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
        const dist = distance2(nxt, target);
        if (dist < bestDist) { bestDist = dist; bestDir = d; }
      }
      this.currentDirection = bestDir;
    };

    // if centered, decide first
    chooseDirIfCenter();
    if (!this.currentDirection) return;

    const speed = this.getSpeedPxPerSec();
    let remaining = (speed * dtMs) / 1000;

    let guards = 0;
    while (remaining > 0.0001 && guards++ < 8) {
      chooseDirIfCenter();
      if (!this.currentDirection) break;

      const dir = this.currentDirection;
      const v = DIR_VECS[dir];
      const hereTile = this.getTile();
      const center = currentTileCenterWorld(this);

      const aheadTx = hereTile.x + (v.x as number);
      const aheadTy = hereTile.y + (v.y as number);
      const aheadBlocked = isBlockedTile(this, aheadTx, aheadTy);

      let targetCenterX = center.x;
      let targetCenterY = center.y;

      if (dir === PacManDirection.Left) {
        targetCenterX = (this.x > center.x) ? center.x : (aheadBlocked ? center.x : center.x - TILE_SIZE);
      } else if (dir === PacManDirection.Right) {
        targetCenterX = (this.x < center.x) ? center.x : (aheadBlocked ? center.x : center.x + TILE_SIZE);
      } else if (dir === PacManDirection.Up) {
        targetCenterY = (this.y > center.y) ? center.y : (aheadBlocked ? center.y : center.y - TILE_SIZE);
      } else if (dir === PacManDirection.Down) {
        targetCenterY = (this.y < center.y) ? center.y : (aheadBlocked ? center.y : center.y + TILE_SIZE);
      }

      const dx = (dir === PacManDirection.Left || dir === PacManDirection.Right) ? Math.abs(targetCenterX - this.x) : 0;
      const dy = (dir === PacManDirection.Up   || dir === PacManDirection.Down)  ? Math.abs(targetCenterY - this.y) : 0;
      const toNextCenter = dx + dy;

      const step = Math.min(remaining, toNextCenter);

      const nx = this.x + (v.x as number) * step;
      const ny = this.y + (v.y as number) * step;
      this.setPixel(nx, ny);
      remaining -= step;

      if (Math.abs((dir === PacManDirection.Left || dir === PacManDirection.Right ? targetCenterX - this.x : targetCenterY - this.y)) < 0.01) {
        this.setPixel(
          (dir === PacManDirection.Left || dir === PacManDirection.Right) ? targetCenterX : this.x,
          (dir === PacManDirection.Up   || dir === PacManDirection.Down)  ? targetCenterY : this.y
        );
      }

      if (aheadBlocked && atTileCenter(this)) {
        this.currentDirection = null;
      }
    }

    if (this.currentDirection) {
      if (willCollide(this, this.currentDirection, this.x, this.y)) {
        if (this.logEnabled) {
          const h = this.getTile();
          this.log(
            `COLLIDE ahead from ${h.x},${h.y} dir=${dirName(this.currentDirection)} ` +
            `-> because ${blockReason(this, h.x, h.y)} | aligning & re-choose`
          );
        }
        this.alignToTileCenter();
        this.currentDirection = null;
      }
    }
  }

  protected getSpeedPxPerSec(): number {
    if (this.mode === GhostMode.Frightened) return this.baseSpeed * 0.6;
    if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) return this.baseSpeed * 1.6;
    return this.baseSpeed;
  }

  protected alignToTileCenter() {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    const tx = Math.floor(pt.x);
    const ty = Math.floor(pt.y);
    const cx = this.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
    const cy = this.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
    this.setPixel(cx, cy);
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