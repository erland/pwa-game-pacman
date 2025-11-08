import Phaser from 'phaser';
import { TILE_SIZE, TileIndex, GhostName, GHOST_FRAME } from '../config';
import { PacManDirection } from './PacMan';

/** Overall ghost modes (high-level state). */
export enum GhostMode {
  InHouse = 'in-house',          // Waiting before release
  LeavingHouse = 'leaving-house',// Passing through the door to exit
  Scatter = 'scatter',           // Head to corner
  Chase = 'chase',               // Target Pac-Man
  Frightened = 'frightened',     // Blue/random
  Eaten = 'eaten',               // Eyes returning home
  ReturningHome = 'returning-home', // Alias of Eaten for clarity
}

export type TilePoint = { x: number; y: number };

// ---- DEBUG / LOGGING -------------------------------------------------------
const DEBUG_GHOSTS = false;        // overlay + on-canvas helpers
const LOG_GHOSTS = false;           // console tracing (independent of overlay)
const LOG_LEAVING_EVERY_TICK = false; // extra detail while in LeavingHouse

const C = {
  door: 0xff66cc,
  here: 0x00ffff,
  target: 0x00ff00,
  allowed: 0xffff00,
  blocked: 0xff4444,
  open: 0x55ff55,
  currentDir: 0x00aaff,
  text: '#00ffff',
};

function dirName(dir: PacManDirection | null): string {
  switch (dir) {
    case PacManDirection.Up: return 'Up';
    case PacManDirection.Down: return 'Down';
    case PacManDirection.Left: return 'Left';
    case PacManDirection.Right: return 'Right';
    default: return '—';
  }
}
// ---------------------------------------------------------------------------

const DIRS: PacManDirection[] = [
  PacManDirection.Up,
  PacManDirection.Left,
  PacManDirection.Down,
  PacManDirection.Right,
];

const DIR_VECS: Record<PacManDirection, Phaser.Math.Vector2Like> = {
  [PacManDirection.Up]: { x: 0, y: -1 },
  [PacManDirection.Down]: { x: 0, y: 1 },
  [PacManDirection.Left]: { x: -1, y: 0 },
  [PacManDirection.Right]: { x: 1, y: 0 },
};

function opposite(dir: PacManDirection): PacManDirection {
  switch (dir) {
    case PacManDirection.Up: return PacManDirection.Down;
    case PacManDirection.Down: return PacManDirection.Up;
    case PacManDirection.Left: return PacManDirection.Right;
    case PacManDirection.Right: return PacManDirection.Left;
  }
}

export interface GhostOptions {
  name: GhostName;
  scatterTarget: TilePoint;
  mazeLayer: Phaser.Tilemaps.TilemapLayer;
  doorRect: Phaser.Geom.Rectangle;
  startX: number;
  startY: number;
  baseSpeed?: number;           // px/sec
}

export abstract class Ghost extends Phaser.GameObjects.Sprite {
  public name: GhostName;
  protected mazeLayer: Phaser.Tilemaps.TilemapLayer;
  protected doorRect: Phaser.Geom.Rectangle;

  protected currentDirection: PacManDirection | null = null;
  protected queuedDirection: PacManDirection | null = null;

  protected mode: GhostMode = GhostMode.InHouse;
  protected frozen = false;
  protected baseSpeed = 70;

  /** Scatter corner */
  protected scatterTarget: TilePoint;

  /** When frightened, wander randomly (avoid reversing if possible). */
  protected frightenedTimerMs = 0;

  // --- debug overlay state
  private debug = DEBUG_GHOSTS;
  private logEnabled = LOG_GHOSTS;
  private dbgGfx?: Phaser.GameObjects.Graphics;
  private dbgText?: Phaser.GameObjects.Text;
  private lastStallKey?: string;

  // small dedup for per-tick logs
  private lastTickKey?: string;
  private lastMode?: GhostMode;

  // NEW: ensure we only exit LeavingHouse after actually passing through the doorway once
  private leavingDoorEntered = false;
  // Direction that leads OUT of the house through the door (computed from spawn vs door)
  private leaveOutDir: PacManDirection;
  // NEW: remember outward dir once we enter the door (don’t recompute every tick)
  private leavingOutDir: PacManDirection | null = null;

  constructor(scene: Phaser.Scene, opts: GhostOptions) {
    super(scene, opts.startX, opts.startY, 'pacman-characters', GHOST_FRAME[opts.name]);
    this.name = opts.name;
    this.scatterTarget = opts.scatterTarget;
    this.mazeLayer = opts.mazeLayer;
    this.doorRect = opts.doorRect;
    // If we start above the door center, outward is Down; otherwise Up (works if your map flips)
    this.leaveOutDir = (opts.startY < opts.doorRect.centerY)
      ? PacManDirection.Down
      : PacManDirection.Up;
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

    if (this.debug) this.ensureDebugDrawables();
  }

  // ---- tiny logging helpers -------------------------------------------------
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
  private setMode(next: GhostMode, why: string) {
    if (this.mode !== next) {
      this.logModeTransition(this.mode, next, why);
      this.mode = next;
      this.lastMode = next;
    }
  }
  // --------------------------------------------------------------------------

  // --- public control for overlay
  public setDebug(on: boolean) {
    this.debug = on;
    if (on) this.ensureDebugDrawables();
    else this.clearDebugDraw();
  }

  private ensureDebugDrawables() {
    if (!this.dbgGfx) {
      this.dbgGfx = this.scene.add.graphics().setDepth(1000);
    }
    if (!this.dbgText) {
      this.dbgText = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: C.text,
        align: 'left',
      }).setDepth(1001);
    }
  }
  private clearDebugDraw() {
    this.dbgGfx?.clear();
    this.dbgText?.setText('');
  }

  public getMode(): GhostMode {
    return this.mode;
  }

  public setFrozen(value: boolean) {
    this.frozen = value;
  }

  public isInHouse(): boolean {
    return this.mode === GhostMode.InHouse || this.mode === GhostMode.LeavingHouse;
  }

  public releaseFromHouse(): void {
    if (this.mode === GhostMode.InHouse) {
      const t = this.getTile();
      this.log(`releaseFromHouse(): -> LeavingHouse | start world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${t.x},${t.y}`);
      this.leavingDoorEntered = false;       // reset doorway tracking
      this.leavingOutDir = null;   // <— reset latched outward direction
      this.setMode(GhostMode.LeavingHouse, 'releaseFromHouse');
      // IMPORTANT: avoid biasing initial direction (Up blocked your only exit)
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
    // If already eaten/returning home, ignore.
    if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) return;
    this.setMode(GhostMode.Frightened, `frighten(${durationSec}s)`);
    this.frightenedTimerMs = durationSec * 1000;
    // Reverse immediately on frighten for that classic flip
    if (this.currentDirection) {
      this.currentDirection = opposite(this.currentDirection);
      this.log(`frighten: reverse to ${dirName(this.currentDirection)}`);
    }
  }

  public setEaten(): void {
    this.setMode(GhostMode.Eaten, 'eaten by Pac-Man');
    // Run fast back to door
    if (this.currentDirection) {
      this.currentDirection = opposite(this.currentDirection);
      this.log(`eaten: reverse to ${dirName(this.currentDirection)}`);
    }
  }

  public getTile(): TilePoint {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) }; // center 12.5 -> 12
  }

  protected setPixel(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  protected atTileCenter(): boolean {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    const tx = Math.floor(pt.x);
    const ty = Math.floor(pt.y);
    const cx = this.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
    const cy = this.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
    // small epsilon to avoid float jitter
    return Math.abs(this.x - cx) < 0.25 && Math.abs(this.y - cy) < 0.25;
  }

  /** Center of the current tile in world coordinates. */
  private currentTileCenterWorld(): Phaser.Math.Vector2 {
    const pt = this.mazeLayer.worldToTileXY(this.x, this.y);
    const tx = Math.floor(pt.x);
    const ty = Math.floor(pt.y);
    const cx = this.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
    const cy = this.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
    return new Phaser.Math.Vector2(cx, cy);
  }

  /** is blocked for ghosts depending on state (door closed in normal modes). */
  protected isBlockedTile(tx: number, ty: number): boolean {
    // 1) Bounds check first
    const map = this.mazeLayer.tilemap;
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  
    const tile = this.mazeLayer.getTileAt(tx, ty); // may be null for empty corridor
  
    // 2) Door rectangle has priority (allow passing in special modes)
    const px = this.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
    const py = this.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
    const inDoor = Phaser.Geom.Rectangle.Contains(this.doorRect, px, py);
  
    const canPassDoor =
      this.mode === GhostMode.LeavingHouse ||
      this.mode === GhostMode.Eaten ||
      this.mode === GhostMode.ReturningHome;
  
    if (inDoor && canPassDoor) return false;
  
    // 3) Empty tile (no tile placed on the layer) = corridor = passable
    if (!tile) return false;
  
    // 4) Actual blocking tiles
    if (tile.index === TileIndex.Wall) return true;
    if (tile.index === TileIndex.GhostDoor) return !canPassDoor;
  
    return false;
  }

  /** Return a list of allowed directions from current tile. */
  protected allowedDirections(): PacManDirection[] {
    const tile = this.getTile();
    const out: PacManDirection[] = [];
    for (const d of DIRS) {
      const v = DIR_VECS[d];
      const nx = tile.x + (v.x as number);
      const ny = tile.y + (v.y as number);
      if (!this.isBlockedTile(nx, ny)) out.push(d);
    }
    return out;
  }

  protected distance2(a: TilePoint, b: TilePoint): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx*dx + dy*dy;
  }

  // NEW: prefer vertical toward the door, else horizontal to align, else no preference
  private pickLeavingDirection(here: TilePoint, target: TilePoint, allowed: PacManDirection[]): PacManDirection | null {
    const dx = target.x - here.x;
    const dy = target.y - here.y;

    // prefer vertical toward target first
    if (dy !== 0) {
      const vert = dy < 0 ? PacManDirection.Up : PacManDirection.Down;
      if (allowed.includes(vert)) return vert;
    }
    // then align horizontally with the door column
    if (dx !== 0) {
      const horiz = dx < 0 ? PacManDirection.Left : PacManDirection.Right;
      if (allowed.includes(horiz)) return horiz;
    }
    return null;
  }

  /** Override in subclasses to provide chase target. */
  protected abstract getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, blinkyTile: TilePoint): TilePoint;

  /** Entry point called each tick from the scene. */
  public updateGhost(
    dtMs: number,
    schedulerMode: GhostMode,
    pacTile: TilePoint,
    pacFacing: Phaser.Math.Vector2,
    blinkyTile: TilePoint
  ) {
    if (this.frozen) { if (this.debug) this.clearDebugDraw(); return; }

    // mode-change trace
    if (this.logEnabled && this.lastMode !== this.mode) {
      this.log(`tick: mode=${this.mode}`);
      this.lastMode = this.mode;
    }

    // Handle frightened timer
    if (this.mode === GhostMode.Frightened) {
      this.frightenedTimerMs -= dtMs;
      if (this.frightenedTimerMs <= 0) {
        this.setMode(schedulerMode, 'frightened timeout');
      }
    } else if (this.mode !== GhostMode.LeavingHouse && this.mode !== GhostMode.Eaten) {
      // Track scheduler unless in special states
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
      // Door center tile
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.centerY);
      const doorTile = { x: Math.round(pt.x), y: Math.round(pt.y) };

      const inDoorNow = Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y);
      if (inDoorNow) this.leavingDoorEntered = true;

      // LATCH outward direction on the FIRST frame we are inside the door
      if (inDoorNow && this.leavingOutDir == null) {
        // Heuristic: if we start above the door center, we must go Down to exit; else Up.
        this.leavingOutDir = (this.y <= this.doorRect.centerY)
          ? PacManDirection.Down
          : PacManDirection.Up;
      }

      // Compute the tile one step beyond the door in the latched outward direction
      const outDir = this.leavingOutDir ?? (
        // if not yet inside the door, bias toward the side we’ll likely need
        (this.y <= this.doorRect.centerY) ? PacManDirection.Down : PacManDirection.Up
      );
      const outVec = DIR_VECS[outDir];
      const doorOutTile = {
        x: doorTile.x + (outVec.x as number),
        y: doorTile.y + (outVec.y as number),
      };

      // Before entering: aim for door center; once inside: aim one tile beyond (keeps going out)
      target = inDoorNow ? doorOutTile : doorTile;

      // When centered inside the door, force the outward direction if legal
      if (inDoorNow && this.atTileCenter()) {
        const allowedNow = this.allowedDirections();
        if (allowedNow.includes(outDir)) this.currentDirection = outDir;
      }

      if (this.logEnabled && LOG_LEAVING_EVERY_TICK) {
        const here = this.getTile();
        const allowed = this.allowedDirections().map(d => dirName(d)).join(', ');
        const neighborReasons = DIRS.map(d => {
          const v = DIR_VECS[d];
          const nx = here.x + (v.x as number);
          const ny = here.y + (v.y as number);
          return `${dirName(d)}:${this.blockReason(nx, ny)}`;
        }).join(' | ');
        const tickKey =
          `${here.x},${here.y}:${this.mode}:${dirName(this.currentDirection)}:` +
          `${inDoorNow}:${this.leavingDoorEntered}:out=${dirName(outDir)}`;
        if (tickKey !== this.lastTickKey) {
          this.lastTickKey = tickKey;
          this.log(
            `LEAVING: world=(${this.x.toFixed(1)},${this.y.toFixed(1)}) tile=${here.x},${here.y} ` +
            `target=${target.x},${target.y} (door=${doorTile.x},${doorTile.y} out=${dirName(outDir)}) ` +
            `atCenter=${this.atTileCenter()} inDoor=${inDoorNow} enteredDoor=${this.leavingDoorEntered} ` +
            `dir=${dirName(this.currentDirection)} allowed=[${allowed}] | neighbors { ${neighborReasons} }`
          );
        }
      }

      // Only finish leaving AFTER we've actually been inside the doorRect once
      if (!inDoorNow && this.leavingDoorEntered && this.atTileCenter()) {
        this.setMode(schedulerMode, 'exited doorway after entering it');
        this.leavingDoorEntered = false;
        this.leavingOutDir = null; // ready for next cycle
      }
    } else { // Eaten / ReturningHome
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.centerY);
      target = { x: Math.round(pt.x), y: Math.round(pt.y) };
      if (Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y) && this.atTileCenter()) {
        this.setMode(GhostMode.InHouse, 'reached house center');
        this.currentDirection = PacManDirection.Up;
      }
    }

    // Step movement
    this.stepTowards(target, dtMs);

    // Debug overlay after we decided/stepped
    if (this.debug) this.drawDebug(target);

    this.updateFrameForMode();
  }

  protected stepTowards(target: TilePoint, dtMs: number) {
    // Choose direction when exactly centered
    const chooseDirIfCenter = () => {
      if (!this.atTileCenter()) return;
  
      const allowed = this.allowedDirections();
      let candidates = allowed;
  
      // Avoid reversing except in frightened — BUT allow reversing while LeavingHouse
      if (this.currentDirection && this.mode !== GhostMode.Frightened && this.mode !== GhostMode.LeavingHouse) {
        const rev = opposite(this.currentDirection);
        candidates = allowed.filter((d) => d !== rev);
        if (candidates.length === 0) candidates = allowed; // dead end, allow reverse
      }
  
      if (candidates.length === 0) {
        // STALL: log once per tile/mode
        const h = this.getTile();
        const stallKey = `${this.name}@${h.x},${h.y}:${this.mode}`;
        if (this.logEnabled && stallKey !== this.lastStallKey) {
          this.lastStallKey = stallKey;
          const reasons: string[] = [];
          for (const d of DIRS) {
            const v = DIR_VECS[d];
            const nx = h.x + (v.x as number);
            const ny = h.y + (v.y as number);
            reasons.push(`${dirName(d)} -> ${this.blockReason(nx, ny)}`);
          }
          this.log(`STALL at ${h.x},${h.y} mode=${this.mode} dir=${dirName(this.currentDirection)} | neighbors: ${reasons.join(' | ')}`);
        }
        return;
      }
  
      if (this.mode === GhostMode.LeavingHouse) {
        const here = this.getTile();
        const preferred = this.pickLeavingDirection(here, target, candidates);
        if (preferred) {
          this.currentDirection = preferred;
          return;
        }
        // fall through to distance chooser
      }
  
      // Distance-minimizing chooser
      let bestDir = candidates[0];
      let bestDist = Number.POSITIVE_INFINITY;
      const here = this.getTile();
      for (const d of candidates) {
        const v = DIR_VECS[d];
        const nxt = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
        const dist = this.distance2(nxt, target);
        if (dist < bestDist) {
          bestDist = dist;
          bestDir = d;
        }
      }
      this.currentDirection = bestDir;
    };
  
    // If we start the tick on a center, decide first.
    chooseDirIfCenter();
    if (!this.currentDirection) return;
  
    // Grid-aware movement: go center-to-center; don't skip intersections on large dt
    const speed = this.getSpeedPxPerSec();
    let remaining = (speed * dtMs) / 1000;
  
    // Safety guard for very slow frames
    let guards = 0;
    while (remaining > 0.0001 && guards++ < 8) {
      // Reconsider turns at centers
      chooseDirIfCenter();
      if (!this.currentDirection) break;
  
      const dir = this.currentDirection;
      const v = DIR_VECS[dir];
      const hereTile = this.getTile();
      const center = this.currentTileCenterWorld();
  
      // Check ahead tile
      const aheadTx = hereTile.x + (v.x as number);
      const aheadTy = hereTile.y + (v.y as number);
      const aheadBlocked = this.isBlockedTile(aheadTx, aheadTy);
  
      // Decide which center we are heading to in this segment
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
      const toNextCenter = dx + dy; // one axis is zero
  
      const step = Math.min(remaining, toNextCenter);
  
      // Move
      const nx = this.x + (v.x as number) * step;
      const ny = this.y + (v.y as number) * step;
      this.setPixel(nx, ny);
      remaining -= step;
  
      // Snap if we land essentially on the planned center
      if (Math.abs((dir === PacManDirection.Left || dir === PacManDirection.Right ? targetCenterX - this.x : targetCenterY - this.y)) < 0.01) {
        this.setPixel(
          (dir === PacManDirection.Left || dir === PacManDirection.Right) ? targetCenterX : this.x,
          (dir === PacManDirection.Up   || dir === PacManDirection.Down)  ? targetCenterY : this.y
        );
      }
  
      // If the next tile was blocked and we reached the current center, clear direction so we'll re-choose
      if (aheadBlocked && this.atTileCenter()) {
        this.currentDirection = null;
      }
    }
  
    // Paranoia: if we ended up facing a wall due to jitter, snap & re-choose next tick
    if (this.currentDirection) {
      const vec = DIR_VECS[this.currentDirection];
      const aheadPt = this.mazeLayer.worldToTileXY(
        this.x + (vec.x as number) * (TILE_SIZE * 0.25),
        this.y + (vec.y as number) * (TILE_SIZE * 0.25)
      );
      const ax = Math.floor(aheadPt.x), ay = Math.floor(aheadPt.y);
      if (this.isBlockedTile(ax, ay)) {
        if (this.logEnabled) {
          const h = this.getTile();
          this.log(
            `COLLIDE ahead from ${h.x},${h.y} dir=${dirName(this.currentDirection)} ` +
            `-> hit ${ax},${ay} because ${this.blockReason(ax, ay)} | aligning & re-choose`
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

  protected willCollide(nextX: number, nextY: number): boolean {
    const dir = this.currentDirection;
    if (!dir) return false;
    const vec = DIR_VECS[dir];
    const aheadX = nextX + (vec.x as number) * (TILE_SIZE * 0.25);
    const aheadY = nextY + (vec.y as number) * (TILE_SIZE * 0.25);
    const pt = this.mazeLayer.worldToTileXY(aheadX, aheadY);
    return this.isBlockedTile(Math.floor(pt.x), Math.floor(pt.y));
  }

  protected updateFrameForMode() {
    if (this.mode === GhostMode.Frightened) {
      this.setTint(0x0000ff);
    } else if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) {
      this.clearTint();
      this.setAlpha(0.7);
      // (optional) set an eyes frame with updateOrigin=false as well:
      // this.setFrame(GHOST_FRAME_EYES, true, false);
    } else {
      this.clearTint();
      this.setAlpha(1);
      this.setFrame(GHOST_FRAME[this.name], true, false); // <- keep origin
      this.setOrigin(0.5, 0.5); // safety
    }
  }

  // ---- DEBUG VIS ------------------------------------------------------------
  private tileWorldRect(t: TilePoint): Phaser.Geom.Rectangle {
    const wx = this.mazeLayer.tileToWorldX(t.x);
    const wy = this.mazeLayer.tileToWorldY(t.y);
    return new Phaser.Geom.Rectangle(wx, wy, TILE_SIZE, TILE_SIZE);
  }
  private tileWorldCenter(t: TilePoint): Phaser.Math.Vector2 {
    const wx = this.mazeLayer.tileToWorldX(t.x) + TILE_SIZE / 2;
    const wy = this.mazeLayer.tileToWorldY(t.y) + TILE_SIZE / 2;
    return new Phaser.Math.Vector2(wx, wy);
  }
  private blockReason(tx: number, ty: number): string {
    const map = this.mazeLayer.tilemap;
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'OOB';
  
    const tile = this.mazeLayer.getTileAt(tx, ty); // null => empty corridor
    const px = this.mazeLayer.tileToWorldX(tx) + TILE_SIZE / 2;
    const py = this.mazeLayer.tileToWorldY(ty) + TILE_SIZE / 2;
    const inDoor = Phaser.Geom.Rectangle.Contains(this.doorRect, px, py);
  
    const canPassDoor =
      this.mode === GhostMode.LeavingHouse ||
      this.mode === GhostMode.Eaten ||
      this.mode === GhostMode.ReturningHome;
  
    if (inDoor && canPassDoor) return 'DOOR pass';
    if (!tile) return 'empty';                // <— was mislabeled OOB before
    if (tile.index === TileIndex.Wall) return `WALL idx=${tile.index}`;
    if (tile.index === TileIndex.GhostDoor) return canPassDoor ? 'Door pass' : 'Door blocked';
    return `open idx=${tile.index}`;
  }
  private drawDebug(target: TilePoint) {
    if (!this.dbgGfx || !this.dbgText) return;

    this.dbgGfx.clear();

    // door
    this.dbgGfx.lineStyle(2, C.door, 0.9).strokeRectShape(this.doorRect);

    // here + target
    const here = this.getTile();
    const c = this.tileWorldCenter(here);
    this.dbgGfx.fillStyle(C.here, 0.8).fillCircle(c.x, c.y, 3);

    const tr = this.tileWorldRect(target);
    this.dbgGfx.lineStyle(2, C.target, 1).strokeRectShape(tr);

    // allowed rays
    const allowed = this.allowedDirections();
    this.dbgGfx.lineStyle(2, C.allowed, 0.9);
    for (const d of DIRS) {
      const v = DIR_VECS[d];
      const ax = c.x + (v.x as number) * (TILE_SIZE * 0.5);
      const ay = c.y + (v.y as number) * (TILE_SIZE * 0.5);
      this.dbgGfx.strokeLineShape(new Phaser.Geom.Line(c.x, c.y, ax, ay));
    }

    // neighbor tiles with block reasons
    for (const d of DIRS) {
      const v = DIR_VECS[d];
      const n = { x: here.x + (v.x as number), y: here.y + (v.y as number) };
      const rect = this.tileWorldRect(n);
      const reason = this.blockReason(n.x, n.y);
      const open = reason.startsWith('open') || reason.endsWith('pass');
      this.dbgGfx.lineStyle(2, open ? C.open : C.blocked, 1).strokeRectShape(rect);
      this.dbgGfx.fillStyle(0x000000, 0.6).fillRect(rect.x - 1, rect.y - 10, rect.width + 2, 10);
      this.dbgGfx.lineStyle(0, 0, 0).fillStyle(0xffffff, 1);
      this.dbgText.setText(
        `${this.name} ${this.mode}\n` +
        `tile ${here.x},${here.y} dir=${dirName(this.currentDirection)}\n` +
        `allowed: ${allowed.map(dirName).join(', ')}`,
      );
      this.dbgText.setPosition(c.x + 6, c.y - 24);
      // small reason text over neighbor
      this.scene.add.text(rect.x + 2, rect.y - 10, reason, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: open ? '#55ff55' : '#ff6666',
      }).setDepth(1001).setScrollFactor(1).setAlpha(0.9).setName('ghostDbgTmp').setOrigin(0, 0);
    }

    // draw current dir vector
    if (this.currentDirection) {
      const v = DIR_VECS[this.currentDirection];
      this.dbgGfx.lineStyle(3, C.currentDir, 1);
      this.dbgGfx.strokeLineShape(new Phaser.Geom.Line(c.x, c.y, c.x + (v.x as number)*TILE_SIZE*0.5, c.y + (v.y as number)*TILE_SIZE*0.5));
    }

    // cleanup transient texts from previous frame
    this.scene.children.list
      .filter(obj => obj.name === 'ghostDbgTmp')
      .forEach(obj => obj.destroy());
  }
}
  
/** Individual ghosts with specific chase targeting rules. */
export class BlinkyGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, _pacFacing: Phaser.Math.Vector2, _blinkyTile: TilePoint): TilePoint {
    return pacTile;
  }
}

export class PinkyGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, _blinkyTile: TilePoint): TilePoint {
    return { x: pacTile.x + pacFacing.x * 4, y: pacTile.y + pacFacing.y * 4 };
  }
}

export class InkyGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, blinkyTile: TilePoint): TilePoint {
    const ahead = { x: pacTile.x + pacFacing.x * 2, y: pacTile.y + (pacFacing.y as number) * 2 };
    const vx = ahead.x - blinkyTile.x;
    const vy = ahead.y - blinkyTile.y;
    return { x: blinkyTile.x + vx * 2, y: blinkyTile.y + vy * 2 };
  }
}

export class ClydeGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, _pacFacing: Phaser.Math.Vector2, _blinkyTile: TilePoint): TilePoint {
    const me = this.getTile();
    const dx = me.x - pacTile.x;
    const dy = me.y - pacTile.y;
    const dist2 = dx*dx + dy*dy;
    if (dist2 <= 64) return this.scatterTarget; // within 8 tiles
    return pacTile;
  }
}