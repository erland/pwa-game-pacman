import Phaser from 'phaser';
import { BasePlayScene } from '@erlandlindmark/pwa-game-2d-framework';
import { MAP_CONFIG, TILE_SIZE } from '../game/config';
import { PacMan, PacManDirection } from '../game/entities/PacMan';

enum GamePhase {
  Ready = 'ready',
  Playing = 'playing',
  LevelComplete = 'level-complete',
  LifeLost = 'life-lost',
}

type PelletType = 'pellet' | 'power';

interface PelletData {
  tileX: number;
  tileY: number;
  type: PelletType;
}

const KEYBOARD_DIRECTIONS: Record<string, PacManDirection | undefined> = {
  ArrowUp: PacManDirection.Up,
  ArrowDown: PacManDirection.Down,
  ArrowLeft: PacManDirection.Left,
  ArrowRight: PacManDirection.Right,
  KeyW: PacManDirection.Up,
  KeyS: PacManDirection.Down,
  KeyA: PacManDirection.Left,
  KeyD: PacManDirection.Right,
};

export class GameScene extends BasePlayScene {
  private map!: Phaser.Tilemaps.Tilemap;
  private mazeLayer!: Phaser.Tilemaps.TilemapLayer;
  private pelletLayer!: Phaser.Tilemaps.TilemapLayer;
  private pacman!: PacMan;
  private pacmanSpawnPosition!: Phaser.Math.Vector2;
  private state: GamePhase = GamePhase.Ready;
  private stateTimer?: Phaser.Time.TimerEvent;
  private pellets = new Map<string, PelletData>();
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private stateText!: Phaser.GameObjects.Text;
  private pointerStart?: Phaser.Math.Vector2;

  constructor() {
    super({ hz: 60, maxCatchUp: 5 }, 'Game');
  }

  protected buildWorld(): void {
    this.map = this.make.tilemap({ key: MAP_CONFIG.key });
    const tileset = this.map.addTilesetImage(MAP_CONFIG.tilesetName, MAP_CONFIG.tilesetKey);
    if (!tileset) {
      throw new Error('Failed to load Pac-Man tileset.');
    }

    this.mazeLayer = this.map.createLayer('maze', tileset) as Phaser.Tilemaps.TilemapLayer;
    this.pelletLayer = this.map.createLayer('pellets', tileset) as Phaser.Tilemaps.TilemapLayer;

    this.mazeLayer.setDepth(1);
    this.pelletLayer.setDepth(5);

    const pacmanSpawn = this.getSpawnPoint('pacman');
    const startX = pacmanSpawn.x + (pacmanSpawn.width ?? TILE_SIZE) / 2;
    const startY = pacmanSpawn.y + (pacmanSpawn.height ?? TILE_SIZE) / 2;

    this.pacmanSpawnPosition = new Phaser.Math.Vector2(startX, startY);
    this.pacman = new PacMan(this, startX, startY, this.mazeLayer);
    this.pacman.reset(startX, startY, PacManDirection.Left);

    this.registerPellets();
    this.createHud();
    this.createStateText();
    this.configureInput();

    this.enterState(GamePhase.Ready);
  }

  protected tick(dtMs: number): void {
    if (this.state === GamePhase.Playing) {
      this.pacman.update(dtMs);
      this.handlePelletCollision();
    }
  }

  protected frame(_deltaMs: number): void {
    // no-op for now; reserved for future VFX
  }

  private createHud(): void {
    this.scoreText = this.add
      .text(16, 16, this.formatScore(), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffff00',
      })
      .setScrollFactor(0)
      .setDepth(30);
  }

  private createStateText(): void {
    const { width, height } = this.scale;
    this.stateText = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffff00',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);
  }

  private configureInput(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const direction = KEYBOARD_DIRECTIONS[event.code];
      if (direction) {
        this.pacman.queueDirection(direction);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.primaryDown) {
        this.pointerStart = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointerStart) {
        return;
      }
      const delta = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY).subtract(this.pointerStart);
      this.pointerStart = undefined;
      if (delta.length() < 10) {
        return;
      }
      if (Math.abs(delta.x) > Math.abs(delta.y)) {
        this.pacman.queueDirection(delta.x > 0 ? PacManDirection.Right : PacManDirection.Left);
      } else {
        this.pacman.queueDirection(delta.y > 0 ? PacManDirection.Down : PacManDirection.Up);
      }
    });
  }

  private enterState(next: GamePhase): void {
    if (this.stateTimer) {
      this.stateTimer.remove();
      this.stateTimer = undefined;
    }

    this.state = next;

    switch (next) {
      case GamePhase.Ready:
        this.pacman.setFrozen(true);
        this.pacman.reset(this.pacmanSpawnPosition.x, this.pacmanSpawnPosition.y, PacManDirection.Left);
        this.stateText.setText('READY!');
        this.stateTimer = this.time.delayedCall(1500, () => this.enterState(GamePhase.Playing));
        break;
      case GamePhase.Playing:
        this.pacman.setFrozen(false);
        this.stateText.setText('');
        this.pacman.queueDirection(PacManDirection.Left);
        break;
      case GamePhase.LevelComplete:
        this.pacman.setFrozen(true);
        this.stateText.setText('LEVEL COMPLETE!');
        break;
      case GamePhase.LifeLost:
        this.pacman.setFrozen(true);
        this.stateText.setText('READY!');
        this.stateTimer = this.time.delayedCall(1500, () => this.enterState(GamePhase.Playing));
        break;
      default:
        break;
    }
  }

  private handlePelletCollision(): void {
    const { tileX, tileY } = this.pacman.getTilePosition();
    const key = this.tileKey(tileX, tileY);
    const pellet = this.pellets.get(key);
    if (!pellet) {
      return;
    }

    this.pellets.delete(key);
    this.pelletLayer.removeTileAt(tileX, tileY);

    if (pellet.type === 'pellet') {
      this.score += 10;
    } else {
      this.score += 50;
    }

    this.updateScoreText();

    if (this.pellets.size === 0) {
      this.enterState(GamePhase.LevelComplete);
    }
  }

  private registerPellets(): void {
    this.pellets.clear();

    const pelletObjects = this.map.getObjectLayer('pelletObjects');
    pelletObjects?.objects.forEach((obj) => {
      const tileX = Math.round(obj.x / TILE_SIZE);
      const tileY = Math.round(obj.y / TILE_SIZE);
      this.pellets.set(this.tileKey(tileX, tileY), { tileX, tileY, type: 'pellet' });
    });

    const powerObjects = this.map.getObjectLayer('powerPellets');
    powerObjects?.objects.forEach((obj) => {
      const tileX = Math.round(obj.x / TILE_SIZE);
      const tileY = Math.round(obj.y / TILE_SIZE);
      this.pellets.set(this.tileKey(tileX, tileY), { tileX, tileY, type: 'power' });
    });
  }

  private getSpawnPoint(name: string): Phaser.Types.Tilemaps.TiledObject {
    const spawnLayer = this.map.getObjectLayer('spawns');
    const spawn = spawnLayer?.objects.find((obj) => obj.name === name);
    if (!spawn) {
      throw new Error(`Missing spawn point: ${name}`);
    }
    return spawn;
  }

  private updateScoreText(): void {
    this.scoreText.setText(this.formatScore());
  }

  private formatScore(): string {
    return `SCORE ${this.score.toString().padStart(4, '0')}`;
  }

  private tileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }
}
