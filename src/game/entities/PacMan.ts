import Phaser from 'phaser';
import { PACMAN_ANIMATIONS, SPRITE_SHEET_CONFIG, TILE_SIZE, TileIndex } from '../config';

export enum PacManDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

const DIRECTION_VECTORS: Record<PacManDirection, Phaser.Math.Vector2Like> = {
  [PacManDirection.Up]: { x: 0, y: -1 },
  [PacManDirection.Down]: { x: 0, y: 1 },
  [PacManDirection.Left]: { x: -1, y: 0 },
  [PacManDirection.Right]: { x: 1, y: 0 },
};

const OPPOSITES: Record<PacManDirection, PacManDirection> = {
  [PacManDirection.Up]: PacManDirection.Down,
  [PacManDirection.Down]: PacManDirection.Up,
  [PacManDirection.Left]: PacManDirection.Right,
  [PacManDirection.Right]: PacManDirection.Left,
};

const DEFAULT_SPEED = 90; // pixels per second

export type TilePosition = { tileX: number; tileY: number };

export class PacMan extends Phaser.GameObjects.Sprite {
  private currentDirection: PacManDirection | null = null;
  private queuedDirection: PacManDirection | null = null;
  private facing: PacManDirection = PacManDirection.Left;
  private speed = DEFAULT_SPEED;
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
  }

  public reset(x: number, y: number, direction: PacManDirection = PacManDirection.Left): void {
    this.setPosition(x, y);
    this.currentDirection = null;
    this.queuedDirection = direction;
    this.facing = direction;
    this.updateAnimationFrame();
  }

  public setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    if (frozen) {
      this.currentDirection = null;
    }
  }

  public queueDirection(direction: PacManDirection): void {
    this.queuedDirection = direction;
  }

  public forceDirection(direction: PacManDirection): void {
    this.currentDirection = direction;
    this.queuedDirection = null;
    this.facing = direction;
    this.updateAnimationFrame();
  }

  public update(dtMs: number): void {
    if (this.frozen) {
      return;
    }

    this.tryApplyQueuedDirection();
    this.advance(dtMs);
    this.updateAnimationFrame();
  }

  public getTilePosition(): TilePosition {
    const tileX = this.mazeLayer.worldToTileX(this.x, true);
    const tileY = this.mazeLayer.worldToTileY(this.y, true);
    return { tileX, tileY };
  }

  private tryApplyQueuedDirection(): void {
    if (!this.queuedDirection) {
      return;
    }

    if (this.currentDirection === null) {
      if (this.canMoveInDirection(this.queuedDirection)) {
        this.currentDirection = this.queuedDirection;
        this.facing = this.queuedDirection;
        this.queuedDirection = null;
      }
      return;
    }

    const queued = this.queuedDirection;

    if (queued === this.currentDirection) {
      this.queuedDirection = null;
      return;
    }

    const isOpposite = OPPOSITES[this.currentDirection] === queued;
    if (isOpposite) {
      if (this.canMoveInDirection(queued, false)) {
        this.currentDirection = queued;
        this.facing = queued;
        this.queuedDirection = null;
      }
      return;
    }

    if (this.isAtTileCenter() && this.canMoveInDirection(queued)) {
      this.currentDirection = queued;
      this.facing = queued;
      this.queuedDirection = null;
      this.alignToTileCenter();
    }
  }

  private advance(dtMs: number): void {
    if (this.currentDirection === null) {
      return;
    }

    const vec = DIRECTION_VECTORS[this.currentDirection];
    const distance = (this.speed * dtMs) / 1000;
    const nextX = this.x + vec.x * distance;
    const nextY = this.y + vec.y * distance;

    if (this.willCollide(nextX, nextY)) {
      this.alignToTileCenter();
      this.currentDirection = null;
      return;
    }

    this.x = nextX;
    this.y = nextY;
    this.snapPerpendicularAxis();
  }

  private willCollide(nextX: number, nextY: number): boolean {
    const half = TILE_SIZE * 0.5 - 1;

    if (this.currentDirection === PacManDirection.Left || this.currentDirection === PacManDirection.Right) {
      const sign = this.currentDirection === PacManDirection.Right ? 1 : -1;
      const frontX = nextX + half * sign;
      const topY = nextY - half;
      const bottomY = nextY + half;
      return this.isBlocked(frontX, topY) || this.isBlocked(frontX, bottomY);
    }

    if (this.currentDirection === PacManDirection.Up || this.currentDirection === PacManDirection.Down) {
      const sign = this.currentDirection === PacManDirection.Down ? 1 : -1;
      const frontY = nextY + half * sign;
      const leftX = nextX - half;
      const rightX = nextX + half;
      return this.isBlocked(leftX, frontY) || this.isBlocked(rightX, frontY);
    }

    return false;
  }

  private isBlocked(worldX: number, worldY: number): boolean {
    const tile = this.mazeLayer.getTileAtWorldXY(worldX, worldY, true);
    return tile !== null && tile.index !== TileIndex.Empty;
  }

  private canMoveInDirection(direction: PacManDirection, requireCenter = true): boolean {
    if (requireCenter && !this.isAtTileCenter()) {
      return false;
    }

    const { tileX, tileY } = this.getTilePosition();
    const vec = DIRECTION_VECTORS[direction];
    const nextTile = this.mazeLayer.getTileAt(tileX + vec.x, tileY + vec.y);
    return !nextTile || nextTile.index === TileIndex.Empty;
  }

  private isAtTileCenter(tolerance = 0.5): boolean {
    const { tileX, tileY } = this.getTilePosition();
    const centerX = this.mazeLayer.tileToWorldX(tileX) + TILE_SIZE / 2;
    const centerY = this.mazeLayer.tileToWorldY(tileY) + TILE_SIZE / 2;
    return Math.abs(this.x - centerX) <= tolerance && Math.abs(this.y - centerY) <= tolerance;
  }

  private alignToTileCenter(): void {
    const { tileX, tileY } = this.getTilePosition();
    this.x = this.mazeLayer.tileToWorldX(tileX) + TILE_SIZE / 2;
    this.y = this.mazeLayer.tileToWorldY(tileY) + TILE_SIZE / 2;
  }

  private snapPerpendicularAxis(): void {
    if (this.currentDirection === PacManDirection.Left || this.currentDirection === PacManDirection.Right) {
      const { tileY } = this.getTilePosition();
      const centerY = this.mazeLayer.tileToWorldY(tileY) + TILE_SIZE / 2;
      if (Math.abs(this.y - centerY) < 1.5) {
        this.y = centerY;
      }
    } else if (this.currentDirection === PacManDirection.Up || this.currentDirection === PacManDirection.Down) {
      const { tileX } = this.getTilePosition();
      const centerX = this.mazeLayer.tileToWorldX(tileX) + TILE_SIZE / 2;
      if (Math.abs(this.x - centerX) < 1.5) {
        this.x = centerX;
      }
    }
  }

  private updateAnimationFrame(): void {
    const direction = this.currentDirection ?? this.facing;
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
