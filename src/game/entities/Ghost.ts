import Phaser from 'phaser';

import {
  GhostMode,
  GhostName,
  GHOST_SCATTER_TARGETS,
  GHOST_SPEED_MULTIPLIERS,
  TILE_SIZE,
  TileIndex,
} from '../config';
import type { PacMan } from './PacMan';
import { PacManDirection } from './PacMan';

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

export interface GhostUpdateContext {
  pacman: PacMan;
  blinky?: Ghost;
}

export interface GhostOptions {
  name: GhostName;
  mazeLayer: Phaser.Tilemaps.TilemapLayer;
  doorRect: Phaser.Geom.Rectangle;
  homePosition: Phaser.Math.Vector2;
  startDirection: PacManDirection;
  startInHouse: boolean;
}

const BASE_SPEED = 80;

export abstract class Ghost extends Phaser.GameObjects.Sprite {
  protected mode: GhostMode = GhostMode.Scatter;
  protected currentDirection: PacManDirection | null = null;
  protected mazeLayer: Phaser.Tilemaps.TilemapLayer;
  protected doorRect: Phaser.Geom.Rectangle;
  protected readonly scatterTarget: Phaser.Math.Vector2;
  protected readonly homePosition: Phaser.Math.Vector2;
  protected readonly name: GhostName;

  private frozen = false;
  private leavingHouse = false;
  private inHouse: boolean;
  private pendingRelease = false;
  private lastGlobalMode: GhostMode = GhostMode.Scatter;

  private logDebug(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(`[Ghost ${this.name}] ${message}`, ...args);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, options: GhostOptions) {
    super(scene, x, y, 'pacman-characters', 4);
    this.name = options.name;
    this.mazeLayer = options.mazeLayer;
    this.doorRect = new Phaser.Geom.Rectangle(
      options.doorRect.x,
      options.doorRect.y,
      options.doorRect.width,
      options.doorRect.height,
    );
    this.homePosition = options.homePosition.clone();
    this.scatterTarget = new Phaser.Math.Vector2(
      GHOST_SCATTER_TARGETS[this.name].tileX,
      GHOST_SCATTER_TARGETS[this.name].tileY,
    );
    this.inHouse = options.startInHouse;
    this.currentDirection = options.startInHouse ? null : options.startDirection;

    const frameOffset = this.getFrameForGhost();
    this.setTexture('pacman-characters', frameOffset);
    this.setOrigin(0.5, 0.5);
    this.setDepth(18);

    scene.add.existing(this);
  }

  public reset(startPosition: Phaser.Math.Vector2, inHouse: boolean, direction: PacManDirection): void {
    this.setPosition(startPosition.x, startPosition.y);
    this.mode = GhostMode.Scatter;
    this.inHouse = inHouse;
    this.leavingHouse = false;
    this.pendingRelease = false;
    this.currentDirection = inHouse ? null : direction;
    this.lastGlobalMode = GhostMode.Scatter;
    this.updateAppearance();
  }

  public setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  public applyGlobalMode(mode: GhostMode): void {
    this.lastGlobalMode = mode;
    if (this.mode === GhostMode.Frightened || this.mode === GhostMode.Eaten) {
      return;
    }
    if (this.mode !== mode) {
      this.mode = mode;
      this.updateAppearance();
    }
  }

  public enterFrightened(): void {
    if (this.mode === GhostMode.Eaten) {
      return;
    }
    this.mode = GhostMode.Frightened;
    this.reverseDirection();
    this.updateAppearance();
  }

  public exitFrightened(): void {
    if (this.mode !== GhostMode.Frightened) {
      return;
    }
    this.mode = this.lastGlobalMode;
    this.updateAppearance();
  }

  public setEaten(): void {
    this.mode = GhostMode.Eaten;
    this.leavingHouse = false;
    this.inHouse = false;
    this.reverseDirection();
    this.updateAppearance();
    this.logDebug('Set to eaten mode at (%f, %f)', this.x, this.y);
  }

  public isFrightened(): boolean {
    return this.mode === GhostMode.Frightened;
  }

  public isEaten(): boolean {
    return this.mode === GhostMode.Eaten;
  }

  public getGhostName(): GhostName {
    return this.name;
  }

  public releaseFromHouse(): void {
    if (!this.inHouse || this.pendingRelease) {
      return;
    }
    this.pendingRelease = true;
    this.scene.time.delayedCall(50, () => {
      this.inHouse = false;
      this.leavingHouse = true;
      this.pendingRelease = false;
      this.currentDirection = PacManDirection.Up;
      this.alignToTileCenter();
    });
  }

  public updateGhost(dtMs: number, context: GhostUpdateContext): void {
    if (this.frozen) {
      return;
    }

    if (this.leavingHouse && this.y <= this.doorRect.top - TILE_SIZE / 2) {
      this.leavingHouse = false;
      this.mode = this.lastGlobalMode;
      this.updateAppearance();
    }

    if (this.inHouse) {
      return;
    }

    if (this.mode !== GhostMode.Frightened && this.mode !== GhostMode.Eaten) {
      this.mode = this.lastGlobalMode;
    }

    if (this.isAtTileCenter()) {
      const nextDirection = this.chooseDirection(context);
      if (nextDirection) {
        this.currentDirection = nextDirection;
      }
    }

    const wasMoving = this.currentDirection !== null;

    this.advance(dtMs);

    if (wasMoving && this.currentDirection === null && this.isAtTileCenter()) {
      const fallbackDirection = this.chooseDirection(context);
      if (fallbackDirection) {
        this.logDebug('Recovering with fallback direction %s', fallbackDirection);
        this.currentDirection = fallbackDirection;
      }
    }

    if (this.mode === GhostMode.Eaten && this.reachedHome()) {
      this.handleReturnedHome();
    }
  }

  protected abstract getChaseTarget(context: GhostUpdateContext): Phaser.Math.Vector2;

  protected reachedHome(): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, this.homePosition.x, this.homePosition.y) < 4;
  }

  protected handleReturnedHome(): void {
    this.mode = GhostMode.Scatter;
    this.inHouse = true;
    this.leavingHouse = false;
    this.currentDirection = null;
    this.setPosition(this.homePosition.x, this.homePosition.y);
    this.updateAppearance();
    this.logDebug('Returned home; waiting to re-enter maze');
    this.scene.time.delayedCall(1200, () => this.releaseFromHouse());
  }

  private chooseDirection(context: GhostUpdateContext): PacManDirection | null {
    if (this.mode === GhostMode.Eaten && this.reachedHome()) {
      return null;
    }

    if (this.leavingHouse) {
      return PacManDirection.Up;
    }

    const tilePos = this.getTilePosition();
    const choices = this.getAvailableDirections();
    if (choices.length === 0) {
      this.logDebug('No available directions from tile (%d, %d)', tilePos.x, tilePos.y);
      return this.currentDirection;
    }

    if (this.mode === GhostMode.Frightened) {
      const index = Math.floor(Math.random() * choices.length);
      return choices[index];
    }

    const target = this.getTargetTile(context);
    let bestDirection = choices[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const direction of choices) {
      const vec = DIRECTION_VECTORS[direction];
      const nextTileX = tilePos.x + vec.x;
      const nextTileY = tilePos.y + vec.y;
      const dist = Phaser.Math.Distance.Squared(nextTileX, nextTileY, target.x, target.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestDirection = direction;
      }
    }

    return bestDirection;
  }

  private getAvailableDirections(): PacManDirection[] {
    const directions: PacManDirection[] = [];
    const reverse = this.currentDirection ? OPPOSITES[this.currentDirection] : null;

    for (const direction of Object.values(PacManDirection)) {
      if (this.canMoveInDirection(direction)) {
        directions.push(direction);
      }
    }

    if (reverse && this.mode !== GhostMode.Eaten && directions.length > 1) {
      const idx = directions.indexOf(reverse);
      if (idx !== -1) {
        directions.splice(idx, 1);
      }
    }

    return directions;
  }

  private getTargetTile(context: GhostUpdateContext): Phaser.Math.Vector2 {
    switch (this.mode) {
      case GhostMode.Scatter:
        return this.scatterTarget.clone();
      case GhostMode.Chase:
        return this.getChaseTarget(context);
      case GhostMode.Eaten: {
        const tileX = this.mazeLayer.worldToTileX(this.homePosition.x, true);
        const tileY = this.mazeLayer.worldToTileY(this.homePosition.y, true);
        return new Phaser.Math.Vector2(tileX, tileY);
      }
      case GhostMode.Frightened:
      default:
        return this.scatterTarget.clone();
    }
  }

  private advance(dtMs: number): void {
    if (this.currentDirection === null) {
      return;
    }

    const vec = DIRECTION_VECTORS[this.currentDirection];
    const speed = BASE_SPEED * GHOST_SPEED_MULTIPLIERS[this.mode];
    const distance = (speed * dtMs) / 1000;
    let nextX = this.x + vec.x * distance;
    let nextY = this.y + vec.y * distance;

    if (this.willCollide(nextX, nextY)) {
      this.logDebug(
        'Blocked while moving %s from (%f, %f) towards (%f, %f)',
        this.currentDirection,
        this.x,
        this.y,
        nextX,
        nextY,
      );
      this.alignToTileCenter();
      this.currentDirection = null;
      return;
    }

    const mapWidth = this.mazeLayer.tilemap.widthInPixels;
    if (nextX < -TILE_SIZE / 2) {
      nextX = mapWidth + TILE_SIZE / 2;
    } else if (nextX > mapWidth + TILE_SIZE / 2) {
      nextX = -TILE_SIZE / 2;
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
    const tile = this.mazeLayer.getTileAtWorldXY(worldX, worldY);
    if (!tile) {
      return false;
    }

    if (tile.index === TileIndex.GhostDoor) {
      const blocked = !this.canPassDoor();
      if (blocked) {
        this.logDebug(
          'Blocked by ghost door at tile (%d, %d) while in mode %s',
          tile.x,
          tile.y,
          this.mode,
        );
      }
      return blocked;
    }

    const blocked = tile.index !== TileIndex.Empty;
    if (blocked) {
      this.logDebug('Blocked by tile index %d at (%d, %d)', tile.index, tile.x, tile.y);
    }
    return blocked;
  }

  private canPassDoor(): boolean {
    return this.mode === GhostMode.Eaten || this.leavingHouse;
  }

  private canMoveInDirection(direction: PacManDirection): boolean {
    const { tileX, tileY } = this.getTilePosition();
    const vec = DIRECTION_VECTORS[direction];
    const nextTile = this.mazeLayer.getTileAt(tileX + vec.x, tileY + vec.y);

    if (!nextTile) {
      return true;
    }

    if (nextTile.index === TileIndex.GhostDoor) {
      return this.canPassDoor();
    }

    return nextTile.index === TileIndex.Empty;
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

  private isAtTileCenter(tolerance = 0.5): boolean {
    const { tileX, tileY } = this.getTilePosition();
    const centerX = this.mazeLayer.tileToWorldX(tileX) + TILE_SIZE / 2;
    const centerY = this.mazeLayer.tileToWorldY(tileY) + TILE_SIZE / 2;
    return Math.abs(this.x - centerX) <= tolerance && Math.abs(this.y - centerY) <= tolerance;
  }

  protected getTilePosition(): Phaser.Math.Vector2 {
    const tileX = this.mazeLayer.worldToTileX(this.x, true);
    const tileY = this.mazeLayer.worldToTileY(this.y, true);
    return new Phaser.Math.Vector2(tileX, tileY);
  }

  private alignToTileCenter(): void {
    this.logDebug('Aligning to tile center near (%f, %f)', this.x, this.y);
    const { tileX, tileY } = this.getTilePosition();
    this.x = this.mazeLayer.tileToWorldX(tileX) + TILE_SIZE / 2;
    this.y = this.mazeLayer.tileToWorldY(tileY) + TILE_SIZE / 2;
  }

  private reverseDirection(): void {
    if (!this.currentDirection) {
      return;
    }
    this.currentDirection = OPPOSITES[this.currentDirection];
  }

  private updateAppearance(): void {
    const frame = this.getFrameForGhost();
    this.setFrame(frame);

    switch (this.mode) {
      case GhostMode.Frightened:
        this.setTint(0x2141ff);
        this.setAlpha(1);
        break;
      case GhostMode.Eaten:
        this.clearTint();
        this.setAlpha(0.7);
        break;
      default:
        this.clearTint();
        this.setAlpha(1);
        break;
    }
  }

  private getFrameForGhost(): number {
    switch (this.name) {
      case GhostName.Blinky:
        return 4;
      case GhostName.Pinky:
        return 5;
      case GhostName.Inky:
        return 6;
      case GhostName.Clyde:
        return 7;
      default:
        return 4;
    }
  }
}

function clampTile(value: number, max: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export class Blinky extends Ghost {
  protected getChaseTarget(context: GhostUpdateContext): Phaser.Math.Vector2 {
    const { tileX, tileY } = context.pacman.getTilePosition();
    return new Phaser.Math.Vector2(tileX, tileY);
  }
}

export class Pinky extends Ghost {
  protected getChaseTarget(context: GhostUpdateContext): Phaser.Math.Vector2 {
    const direction = context.pacman.getFacingDirection();
    const vec = DIRECTION_VECTORS[direction];
    const { tileX, tileY } = context.pacman.getTilePosition();
    const map = this.mazeLayer.tilemap;
    const targetX = clampTile(tileX + vec.x * 4, map.width - 1);
    const targetY = clampTile(tileY + vec.y * 4, map.height - 1);
    return new Phaser.Math.Vector2(targetX, targetY);
  }
}

export class Inky extends Ghost {
  protected getChaseTarget(context: GhostUpdateContext): Phaser.Math.Vector2 {
    const direction = context.pacman.getFacingDirection();
    const vec = DIRECTION_VECTORS[direction];
    const { tileX, tileY } = context.pacman.getTilePosition();
    const tileAheadX = tileX + vec.x * 2;
    const tileAheadY = tileY + vec.y * 2;
    const blinky = context.blinky;
    const map = this.mazeLayer.tilemap;

    if (!blinky) {
      return new Phaser.Math.Vector2(
        clampTile(tileAheadX, map.width - 1),
        clampTile(tileAheadY, map.height - 1),
      );
    }

    const blinkyTile = blinky.getTilePosition();
    const vectorX = (tileAheadX - blinkyTile.x) * 2;
    const vectorY = (tileAheadY - blinkyTile.y) * 2;
    const targetX = clampTile(blinkyTile.x + vectorX, map.width - 1);
    const targetY = clampTile(blinkyTile.y + vectorY, map.height - 1);
    return new Phaser.Math.Vector2(targetX, targetY);
  }
}

export class Clyde extends Ghost {
  protected getChaseTarget(context: GhostUpdateContext): Phaser.Math.Vector2 {
    const { tileX, tileY } = context.pacman.getTilePosition();
    const ghostTile = this.getTilePosition();
    const distanceSquared = Phaser.Math.Distance.Squared(tileX, tileY, ghostTile.x, ghostTile.y);
    const map = this.mazeLayer.tilemap;

    if (distanceSquared <= 64) {
      return new Phaser.Math.Vector2(
        clampTile(this.scatterTarget.x, map.width - 1),
        clampTile(this.scatterTarget.y, map.height - 1),
      );
    }

    return new Phaser.Math.Vector2(
      clampTile(tileX, map.width - 1),
      clampTile(tileY, map.height - 1),
    );
  }
}
