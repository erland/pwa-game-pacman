import Phaser from 'phaser';
import { BasePlayScene } from '@erlandlindmark/pwa-game-2d-framework';
import { MAP_CONFIG, TILE_SIZE, GhostName } from '../game/config';
import { PacMan, PacManDirection } from '../game/entities/PacMan';
import { BlinkyGhost, PinkyGhost, InkyGhost, ClydeGhost, GhostMode, Ghost } from '../game/entities/Ghost';
import { ModeScheduler } from '../game/logic/ModeScheduler';

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
  private ghosts: Ghost[] = [];
  private blinky?: Ghost;
  private modeScheduler!: ModeScheduler;
  private level: number = 1;
  private ghostDoorRect!: Phaser.Geom.Rectangle;
  private pacPrevTile = new Phaser.Math.Vector2();
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

    // NEW: initialize previous tile to the actual starting tile (avoids a bogus first facing)
    {
      const t = this.pacman.getTilePosition();
      this.pacPrevTile.set(t.tileX, t.tileY);
    }

    this.registerPellets();
    this.createHud();

    // Ghosts setup (Phase 3)
    this.modeScheduler = new ModeScheduler(this.level);
    this.ghostDoorRect = this.getTriggerRect('door');
    this.createGhosts();
    this.createStateText();
    this.configureInput();

    this.enterState(GamePhase.Ready);
  }

  protected tick(dtMs: number): void {
    if (this.state === GamePhase.Playing) {
      this.pacman.update(dtMs);
      const schedulerMode = this.modeScheduler.tick(dtMs);
      const pacTile = this.pacman.getTilePosition();
      const pacFacing = this.getPacmanFacingVector();
      const blinkyTile = this.blinky ? this.blinky.getTile() : pacTile;
      this.ghosts.forEach(g => g.updateGhost(dtMs, schedulerMode, pacTile, pacFacing, blinkyTile));
      this.handlePacmanGhostCollisions();
      this.handlePelletCollision();
    }
  }

  protected frame(_deltaMs: number): void {
    // no-op for now; reserved for future VFX
  }

  private createGhosts(): void {
    const blinkySpawn = this.getSpawnPoint('blinky');
    const pinkySpawn = this.getSpawnPoint('pinky');
    const inkySpawn = this.getSpawnPoint('inky');
    const clydeSpawn = this.getSpawnPoint('clyde');

    const toCenter = (o: any) => new Phaser.Math.Vector2(o.x + (o.width ?? TILE_SIZE) / 2, o.y + (o.height ?? TILE_SIZE) / 2);

    const blinkyPos = toCenter(blinkySpawn);
    const pinkyPos = toCenter(pinkySpawn);
    const inkyPos = toCenter(inkySpawn);
    const clydePos = toCenter(clydeSpawn);

    const w = this.map.width;
    const h = this.map.height;
    const corners = {
      [GhostName.Blinky]: { x: w - 2, y: 1 },   // top-rightish
      [GhostName.Pinky]: { x: 1, y: 1 },        // top-left
      [GhostName.Inky]: { x: w - 2, y: h - 2 }, // bottom-right
      [GhostName.Clyde]: { x: 1, y: h - 2 },    // bottom-left
    } as const;

    this.blinky = new BlinkyGhost(this, {
      name: GhostName.Blinky,
      scatterTarget: corners[GhostName.Blinky],
      mazeLayer: this.mazeLayer,
      doorRect: this.ghostDoorRect,
      startX: blinkyPos.x, startY: blinkyPos.y,
    });
    const pinky = new PinkyGhost(this, {
      name: GhostName.Pinky,
      scatterTarget: corners[GhostName.Pinky],
      mazeLayer: this.mazeLayer,
      doorRect: this.ghostDoorRect,
      startX: pinkyPos.x, startY: pinkyPos.y,
    });
    const inky = new InkyGhost(this, {
      name: GhostName.Inky,
      scatterTarget: corners[GhostName.Inky],
      mazeLayer: this.mazeLayer,
      doorRect: this.ghostDoorRect,
      startX: inkyPos.x, startY: inkyPos.y,
    });
    const clyde = new ClydeGhost(this, {
      name: GhostName.Clyde,
      scatterTarget: corners[GhostName.Clyde],
      mazeLayer: this.mazeLayer,
      doorRect: this.ghostDoorRect,
      startX: clydePos.x, startY: clydePos.y,
    });

    this.ghosts = [this.blinky, pinky, inky, clyde].filter(Boolean) as Ghost[];
    this.ghosts.forEach(g => g?.setDepth(this.pelletLayer.depth + 1));
    
    // Initial states: keep frozen until we switch to Playing
    this.blinky!.setFrozen(true);
    pinky.setFrozen(true);
    inky.setFrozen(true);
    clyde.setFrozen(true);

    // Schedule house releases (they may switch modes while frozen; we unfreeze in Playing)
    this.time.delayedCall(0,    () => this.blinky!.releaseFromHouse());
    this.time.delayedCall(2000, () => pinky.releaseFromHouse());
    this.time.delayedCall(4000, () => inky.releaseFromHouse());
    this.time.delayedCall(6000, () => clyde.releaseFromHouse());
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
        this.ghosts.forEach(g => g.setFrozen(true));
        this.pacman.reset(this.pacmanSpawnPosition.x, this.pacmanSpawnPosition.y, PacManDirection.Left);
        // keep stateText visible while ready
        this.stateText.setText('READY!');
        this.stateTimer = this.time.delayedCall(1500, () => this.enterState(GamePhase.Playing));
        break;

      case GamePhase.Playing:
        // UNFREEZE EVERYTHING + ensure release if still in-house
        this.pacman.setFrozen(false);
        this.ghosts.forEach(g => g.setFrozen(false));
        this.ghosts.forEach(g => { if (g.isInHouse()) g.releaseFromHouse(); }); // safety
        this.stateText.setText('');
        this.pacman.queueDirection(PacManDirection.Left);
        break;

      case GamePhase.LevelComplete:
        this.pacman.setFrozen(true);
        this.ghosts.forEach(g => g.setFrozen(true));
        this.stateText.setText('LEVEL COMPLETE!');
        break;

      case GamePhase.LifeLost:
        this.pacman.setFrozen(true);
        this.ghosts.forEach(g => g.setFrozen(true));
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
      // Trigger frightened mode for all ghosts per level timing
      const seconds = this.modeScheduler.frightenedSeconds(this.level);
      this.modeScheduler.startFrightenedOverride(seconds);
      this.ghosts.forEach(g => g.frighten(seconds));
    }

    this.updateScoreText();

    if (this.pellets.size === 0) {
      this.enterState(GamePhase.LevelComplete);
    }
  }

  private handlePacmanGhostCollisions(): void {
    const pac = this.pacman.getTilePosition();
    for (const g of this.ghosts) {
      const gt = g.getTile();
      if (gt.x === pac.tileX && gt.y === pac.tileY) {
        // Collision
        const mode = g.getMode();
        if (mode === GhostMode.Frightened) {
          g.setEaten();
          // Scoring handled in Phase 4; for now just state change
        } else if (mode !== GhostMode.Eaten) {
          // Pac-Man dies -> LifeLost state (Phase 2/4)
          this.enterState(GamePhase.LifeLost);
        }
      }
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

  private getTriggerRect(name: string): Phaser.Geom.Rectangle {
    const layer = this.map.getObjectLayer('triggers');
    const obj = layer?.objects.find((o) => o.name === name);
    if (!obj) throw new Error(`Missing trigger: ${name}`);
    return new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width ?? TILE_SIZE, obj.height ?? TILE_SIZE);
  }

  private getPacmanFacingVector(): Phaser.Math.Vector2 {
    // Estimate facing from last tile delta
    const cur = this.pacman.getTilePosition();
    const prev = this.pacPrevTile;
    const dx = cur.tileX - prev.x;
    const dy = cur.tileY - prev.y;
    if (dx === 0 && dy === 0) return new Phaser.Math.Vector2(1, 0); // default right
    this.pacPrevTile.set(cur.tileX, cur.tileY);
    const v = new Phaser.Math.Vector2(Math.sign(dx), Math.sign(dy));
    return v;
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