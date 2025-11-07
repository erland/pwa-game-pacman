import Phaser from 'phaser';
import { BasePlayScene } from '@erlandlindmark/pwa-game-2d-framework';
import { MAP_CONFIG, TILE_SIZE, GHOST_RELEASE_RULES, GhostName, LEVEL_TIMINGS } from '../game/config';
import { GhostModeScheduler } from '../game/GhostModeScheduler';
import { Blinky, Clyde, Ghost, GhostUpdateContext, Inky, Pinky } from '../game/entities/Ghost';
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
  private ghosts: Ghost[] = [];
  private ghostMap = new Map<GhostName, Ghost>();
  private ghostSpawns = new Map<GhostName, { position: Phaser.Math.Vector2; inHouse: boolean; direction: PacManDirection }>();
  private ghostReleaseTimers = new Map<GhostName, Phaser.Time.TimerEvent>();
  private modeScheduler!: GhostModeScheduler;
  private frightenedTimer?: Phaser.Time.TimerEvent;
  private doorRect!: Phaser.Geom.Rectangle;
  private currentLevel = 1;
  private pelletsEaten = 0;
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

    this.modeScheduler = new GhostModeScheduler(this.currentLevel);
    this.createGhosts();

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
      this.updateGhosts(dtMs);
      this.checkGhostCollisions();
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
        this.modeScheduler.reset(this.currentLevel);
        this.resetGhosts();
        this.setGhostsFrozen(true);
        this.scheduleGhostReleases();
        this.pacman.setFrozen(true);
        this.pacman.reset(this.pacmanSpawnPosition.x, this.pacmanSpawnPosition.y, PacManDirection.Left);
        this.stateText.setText('READY!');
        this.stateTimer = this.time.delayedCall(1500, () => this.enterState(GamePhase.Playing));
        break;
      case GamePhase.Playing:
        this.pacman.setFrozen(false);
        this.setGhostsFrozen(false);
        this.stateText.setText('');
        this.pacman.queueDirection(PacManDirection.Left);
        break;
      case GamePhase.LevelComplete:
        this.pacman.setFrozen(true);
        this.setGhostsFrozen(true);
        this.stateText.setText('LEVEL COMPLETE!');
        break;
      case GamePhase.LifeLost:
        this.pacman.setFrozen(true);
        this.setGhostsFrozen(true);
        this.resetGhosts();
        this.scheduleGhostReleases();
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
      this.pelletsEaten += 1;
    } else {
      this.score += 50;
      this.pelletsEaten += 1;
      this.triggerFrightenedMode();
    }

    this.updateScoreText();
    this.evaluateGhostReleases();

    if (this.pellets.size === 0) {
      this.enterState(GamePhase.LevelComplete);
    }
  }

  private registerPellets(): void {
    this.pellets.clear();
    this.pelletsEaten = 0;

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

  private createGhosts(): void {
    this.ghosts = [];
    this.ghostMap.clear();
    this.ghostSpawns.clear();

    const doorObject = this.getTriggerObject('door');
    this.doorRect = new Phaser.Geom.Rectangle(
      doorObject.x,
      doorObject.y,
      doorObject.width ?? TILE_SIZE,
      doorObject.height ?? TILE_SIZE,
    );

    const blinkySpawn = this.toCenteredVector(this.getSpawnPoint(GhostName.Blinky));
    const pinkySpawn = this.toCenteredVector(this.getSpawnPoint(GhostName.Pinky));
    const inkySpawn = this.toCenteredVector(this.getSpawnPoint(GhostName.Inky));
    const clydeSpawn = this.toCenteredVector(this.getSpawnPoint(GhostName.Clyde));

    this.addGhost(
      new Blinky(this, blinkySpawn.x, blinkySpawn.y, {
        name: GhostName.Blinky,
        mazeLayer: this.mazeLayer,
        doorRect: this.doorRect,
        homePosition: blinkySpawn,
        startDirection: PacManDirection.Left,
        startInHouse: false,
      }),
      blinkySpawn,
      false,
      PacManDirection.Left,
    );

    this.addGhost(
      new Pinky(this, pinkySpawn.x, pinkySpawn.y, {
        name: GhostName.Pinky,
        mazeLayer: this.mazeLayer,
        doorRect: this.doorRect,
        homePosition: pinkySpawn,
        startDirection: PacManDirection.Left,
        startInHouse: true,
      }),
      pinkySpawn,
      true,
      PacManDirection.Left,
    );

    this.addGhost(
      new Inky(this, inkySpawn.x, inkySpawn.y, {
        name: GhostName.Inky,
        mazeLayer: this.mazeLayer,
        doorRect: this.doorRect,
        homePosition: inkySpawn,
        startDirection: PacManDirection.Right,
        startInHouse: true,
      }),
      inkySpawn,
      true,
      PacManDirection.Right,
    );

    this.addGhost(
      new Clyde(this, clydeSpawn.x, clydeSpawn.y, {
        name: GhostName.Clyde,
        mazeLayer: this.mazeLayer,
        doorRect: this.doorRect,
        homePosition: clydeSpawn,
        startDirection: PacManDirection.Left,
        startInHouse: true,
      }),
      clydeSpawn,
      true,
      PacManDirection.Left,
    );
  }

  private addGhost(
    ghost: Ghost,
    position: Phaser.Math.Vector2,
    inHouse: boolean,
    direction: PacManDirection,
  ): void {
    this.ghosts.push(ghost);
    this.ghostMap.set(ghost.getGhostName(), ghost);
    this.ghostSpawns.set(ghost.getGhostName(), { position: position.clone(), inHouse, direction });
  }

  private resetGhosts(): void {
    this.stopFrightenedMode();
    this.ghostReleaseTimers.forEach((timer) => timer.remove());
    this.ghostReleaseTimers.clear();

    this.ghosts.forEach((ghost) => {
      const spawn = this.ghostSpawns.get(ghost.getGhostName());
      if (!spawn) {
        return;
      }
      ghost.reset(spawn.position, spawn.inHouse, spawn.direction);
    });
  }

  private scheduleGhostReleases(): void {
    this.ghostReleaseTimers.forEach((timer) => timer.remove());
    this.ghostReleaseTimers.clear();

    (Object.keys(GHOST_RELEASE_RULES) as GhostName[]).forEach((name) => {
      const rule = GHOST_RELEASE_RULES[name];
      if (rule.timerMs <= 0) {
        this.releaseGhost(name);
        return;
      }

      const timer = this.time.delayedCall(rule.timerMs, () => this.releaseGhost(name));
      this.ghostReleaseTimers.set(name, timer);
    });
  }

  private releaseGhost(name: GhostName): void {
    const ghost = this.ghostMap.get(name);
    if (!ghost) {
      return;
    }
    ghost.releaseFromHouse();
    const timer = this.ghostReleaseTimers.get(name);
    if (timer) {
      timer.remove();
      this.ghostReleaseTimers.delete(name);
    }
  }

  private evaluateGhostReleases(): void {
    (Object.keys(GHOST_RELEASE_RULES) as GhostName[]).forEach((name) => {
      const rule = GHOST_RELEASE_RULES[name];
      if (rule.pelletThreshold > 0 && this.pelletsEaten >= rule.pelletThreshold) {
        this.releaseGhost(name);
      }
    });
  }

  private triggerFrightenedMode(): void {
    const frightenedDuration = this.getFrightenedDuration();
    if (frightenedDuration <= 0) {
      return;
    }

    if (this.frightenedTimer) {
      this.frightenedTimer.remove();
      this.frightenedTimer = undefined;
    }

    this.modeScheduler.pause();
    this.ghosts.forEach((ghost) => ghost.enterFrightened());

    this.frightenedTimer = this.time.delayedCall(frightenedDuration, () => {
      this.ghosts.forEach((ghost) => ghost.exitFrightened());
      this.modeScheduler.resume();
      this.frightenedTimer = undefined;
    });
  }

  private stopFrightenedMode(): void {
    if (this.frightenedTimer) {
      this.frightenedTimer.remove();
      this.frightenedTimer = undefined;
    }
    this.ghosts.forEach((ghost) => ghost.exitFrightened());
    this.modeScheduler.resume();
  }

  private getFrightenedDuration(): number {
    const timingConfig = LEVEL_TIMINGS[Math.min(this.currentLevel - 1, LEVEL_TIMINGS.length - 1)];
    return timingConfig.frightened * 1000;
  }

  private updateGhosts(dtMs: number): void {
    this.modeScheduler.update(dtMs);
    const globalMode = this.modeScheduler.getMode();
    const blinky = this.ghostMap.get(GhostName.Blinky);
    const context: GhostUpdateContext = {
      pacman: this.pacman,
      blinky,
    };

    this.ghosts.forEach((ghost) => {
      ghost.applyGlobalMode(globalMode);
      ghost.updateGhost(dtMs, context);
    });
  }

  private setGhostsFrozen(frozen: boolean): void {
    this.ghosts.forEach((ghost) => ghost.setFrozen(frozen));
  }

  private checkGhostCollisions(): void {
    this.ghosts.forEach((ghost) => {
      if (ghost.isEaten()) {
        return;
      }
      const distance = Phaser.Math.Distance.Between(ghost.x, ghost.y, this.pacman.x, this.pacman.y);
      if (distance > TILE_SIZE * 0.6) {
        return;
      }

      if (ghost.isFrightened()) {
        ghost.setEaten();
      } else {
        this.enterState(GamePhase.LifeLost);
      }
    });
  }

  private getTriggerObject(name: string): Phaser.Types.Tilemaps.TiledObject {
    const triggerLayer = this.map.getObjectLayer('triggers');
    const trigger = triggerLayer?.objects.find((obj) => obj.name === name);
    if (!trigger) {
      throw new Error(`Missing trigger: ${name}`);
    }
    return trigger;
  }

  private toCenteredVector(obj: Phaser.Types.Tilemaps.TiledObject): Phaser.Math.Vector2 {
    const width = obj.width ?? TILE_SIZE;
    const height = obj.height ?? TILE_SIZE;
    return new Phaser.Math.Vector2(obj.x + width / 2, obj.y + height / 2);
  }
}
