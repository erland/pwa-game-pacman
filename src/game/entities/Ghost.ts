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

// ---- DEBUG -----------------------------------------------------------------
const DEBUG_GHOSTS = false; // <— set false to hide overlay/logs when done
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
  private dbgGfx?: Phaser.GameObjects.Graphics;
  private dbgText?: Phaser.GameObjects.Text;
  private lastStallKey?: string;

  constructor(scene: Phaser.Scene, opts: GhostOptions) {
    super(scene, opts.startX, opts.startY, 'pacman-characters', GHOST_FRAME[opts.name]);
    this.name = opts.name;
    this.scatterTarget = opts.scatterTarget;
    this.mazeLayer = opts.mazeLayer;
    this.doorRect = opts.doorRect;
    if (opts.baseSpeed) this.baseSpeed = opts.baseSpeed;

    this.setOrigin(0.5, 0.5);
    scene.add.existing(this);

    if (this.debug) this.ensureDebugDrawables();
  }

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
      this.mode = GhostMode.LeavingHouse;
      // Ensure initial direction upwards towards the door
      this.currentDirection = PacManDirection.Up;
    }
  }

  /** Called by scheduler to update global mode (scatter/chase) when not in special states. */
  public applyScheduledMode(mode: GhostMode) {
    if (this.mode === GhostMode.Scatter || this.mode === GhostMode.Chase) {
      this.mode = mode;
    }
  }

  public frighten(durationSec: number) {
    // If already eaten/returning home, ignore.
    if (this.mode === GhostMode.Eaten || this.mode === GhostMode.ReturningHome) return;
    this.mode = GhostMode.Frightened;
    this.frightenedTimerMs = durationSec * 1000;
    // Reverse immediately on frighten for that classic flip
    if (this.currentDirection) {
      this.currentDirection = opposite(this.currentDirection);
    }
  }

  public setEaten(): void {
    this.mode = GhostMode.Eaten;
    // Run fast back to door
    if (this.currentDirection) {
      this.currentDirection = opposite(this.currentDirection);
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

  /** Override in subclasses to provide chase target. */
  protected abstract getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, blinkyTile: TilePoint): TilePoint;

  /** Entry point called each tick from the scene. */
  public updateGhost(dtMs: number, schedulerMode: GhostMode, pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, blinkyTile: TilePoint) {
    if (this.frozen) { if (this.debug) this.clearDebugDraw(); return; }

    // Handle frightened timer
    if (this.mode === GhostMode.Frightened) {
      this.frightenedTimerMs -= dtMs;
      if (this.frightenedTimerMs <= 0) {
        // Return to scheduled mode
        this.mode = schedulerMode;
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
      // Wander: pick a far tile in a pseudo-random way
      target = { x: pacTile.x + Math.round((Math.random() - 0.5) * 14), y: pacTile.y + Math.round((Math.random() - 0.5) * 14) };
    } else if (this.mode === GhostMode.LeavingHouse) {
      // Aim at the tile just above the door (use layer conversion for safety)
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.y - 1);
      const doorTile = { x: Math.round(pt.x), y: Math.floor(pt.y) };
      target = doorTile;
      // If already outside, move into scheduled
      if (!Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y) && this.atTileCenter()) {
        this.mode = schedulerMode;
      }
    } else { // Eaten / ReturningHome
      const pt = this.mazeLayer.worldToTileXY(this.doorRect.centerX, this.doorRect.centerY);
      target = { x: Math.round(pt.x), y: Math.round(pt.y) };
      if (Phaser.Geom.Rectangle.Contains(this.doorRect, this.x, this.y) && this.atTileCenter()) {
        this.mode = GhostMode.InHouse;
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
    // At intersections (tile center), choose next direction
    if (this.atTileCenter()) {
      const allowed = this.allowedDirections();
      let candidates = allowed;

      // Avoid reversing except in frightened
      if (this.currentDirection && this.mode !== GhostMode.Frightened) {
        const rev = opposite(this.currentDirection);
        candidates = allowed.filter((d) => d !== rev);
        if (candidates.length === 0) candidates = allowed; // dead end, allow reverse
      }

      if (candidates.length > 0) {
        // Pick direction minimizing distance to target
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
      } else {
        // STALL: log once per tile/mode
        const h = this.getTile();
        const stallKey = `${this.name}@${h.x},${h.y}:${this.mode}`;
        if (this.debug && stallKey !== this.lastStallKey) {
          this.lastStallKey = stallKey;
          const reasons: string[] = [];
          for (const d of DIRS) {
            const v = DIR_VECS[d];
            const nx = h.x + (v.x as number);
            const ny = h.y + (v.y as number);
            reasons.push(`${dirName(d)} -> ${this.blockReason(nx, ny)}`);
          }
          // eslint-disable-next-line no-console
          console.log(`[${this.name}] STALL at ${h.x},${h.y} mode=${this.mode} dir=${dirName(this.currentDirection)} | neighbors: ${reasons.join(' | ')}`);
        }
      }
    }

    // Move along currentDirection
    if (!this.currentDirection) return;
    const speed = this.getSpeedPxPerSec();
    const dist = (speed * dtMs) / 1000;
    const vec = DIR_VECS[this.currentDirection];
    const nextX = this.x + (vec.x as number) * dist;
    const nextY = this.y + (vec.y as number) * dist;

    // If will hit wall before leaving tile, snap to center & pick again next tick
    if (this.willCollide(nextX, nextY)) {
      if (this.debug) {
        const h = this.getTile();
        // eslint-disable-next-line no-console
        console.log(`[${this.name}] COLLIDE ahead from ${h.x},${h.y} dir=${dirName(this.currentDirection)} -> aligning & re-choosing`);
      }
      this.alignToTileCenter();
      this.currentDirection = null;
      return;
    }

    this.setPixel(nextX, nextY);
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
    for (const d of allowed) {
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
      this.dbgGfx.fillStyle(0x000000, 0.6).fillRect(rect.x, rect.y - 10, rect.width, 10);
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
    // (remove all with name 'ghostDbgTmp' created in this frame)
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
    const ahead = { x: pacTile.x + pacFacing.x * 2, y: pacTile.y + pacFacing.y * 2 };
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