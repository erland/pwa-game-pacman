import Phaser from 'phaser';
import { PACMAN_ANIMATIONS, SPRITE_SHEET_CONFIG, TILE_SIZE, TileIndex } from '../config';
import { PacManDirection } from './common/direction';
import type { GridEnv } from './movement/BlockProbe';
import { GridMover } from './movement/GridMover';

// Re-export so ghosts that import from '../PacMan' keep working
export { PacManDirection } from './common/direction';

export type TilePosition = { tileX: number; tileY: number };

const DEFAULT_SPEED_PX_PER_SEC = 90;

class PacManEnv implements GridEnv {
  tileSize = TILE_SIZE;
  constructor(private maze: Phaser.Tilemaps.TilemapLayer) {}

  worldToTile(x: number, y: number) {
    return { tx: this.maze.worldToTileX(x, true), ty: this.maze.worldToTileY(y, true) };
  }
  tileCenterWorld(tx: number, ty: number) {
    return { x: this.maze.tileToWorldX(tx) + TILE_SIZE / 2, y: this.maze.tileToWorldY(ty) + TILE_SIZE / 2 };
  }
  isBlocked(worldX: number, worldY: number): boolean {
    // Match your original: any tile here means blocked; corridors are null.
    const t = this.maze.getTileAtWorldXY(worldX, worldY);
    return !!t;
  }
  canEnterTile(tx: number, ty: number): boolean {
    const t = this.maze.getTileAt(tx, ty);
    return !t || t.index === TileIndex.Empty || t.properties?.walkable === true;
  }
}

export class PacMan extends Phaser.GameObjects.Sprite {
  private mover: GridMover;
  private facing: PacManDirection = PacManDirection.Left;
  private frozen = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private mazeLayer: Phaser.Tilemaps.TilemapLayer,
  ) {
    super(scene, x, y, SPRITE_SHEET_CONFIG.key, PACMAN_ANIMATIONS.walkLeft.start);
    this.setOrigin(0.5, 0.5);
    this.setDepth(20);
    scene.add.existing(this);

    this.mover = new GridMover(new PacManEnv(mazeLayer), {
      speedPxPerSec: DEFAULT_SPEED_PX_PER_SEC,
    });
  }

  public reset(x: number, y: number, direction: PacManDirection = PacManDirection.Left): void {
    this.setPosition(x, y);
    this.mover.force(null);
    this.facing = direction;
  }

  public setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (frozen) this.mover.force(null);
  }

  public queueDirection(direction: PacManDirection): void {
    this.mover.queue(direction);
  }

  public setSpeedPixelsPerSecond(pxPerSec: number) {
    this.mover.setSpeedPxPerSec(pxPerSec);
  }

  /** IMPORTANT: keep original signature so GameScene calls remain valid. */
  public update(dtMs: number): void {
    if (this.frozen) return;

    const before = this.mover.direction();
    this.mover.step(dtMs, this); // mutates this.x/this.y
    const after = this.mover.direction();

    if (after && before !== after) this.facing = after;

    this.updateAnimationFrame();
  }

  public getTilePosition(): TilePosition {
    const tileX = this.mazeLayer.worldToTileX(this.x, true);
    const tileY = this.mazeLayer.worldToTileY(this.y, true);
    return { tileX, tileY };
  }

  private updateAnimationFrame(): void {
    const direction = this.mover.direction() ?? this.facing;
    switch (direction) {
      case PacManDirection.Right:
        this.setFrame(PACMAN_ANIMATIONS.walkRight.start);
        break;
      case PacManDirection.Up:
        this.setFrame(PACMAN_ANIMATIONS.walkUp.start);
        break;
      case PacManDirection.Left:
        this.setFrame(PACMAN_ANIMATIONS.walkLeft.start);
        break;
      case PacManDirection.Down:
        this.setFrame(PACMAN_ANIMATIONS.walkDown.start);
        break;
      default:
        break;
    }
  }
}