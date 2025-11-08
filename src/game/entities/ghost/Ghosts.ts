// src/game/entities/ghost/Ghosts.ts
import Phaser from 'phaser';
import { TilePoint } from './GhostTypes';
import { Ghost } from './GhostBase';
import { distance2 } from './GhostUtils';

// Toggle this to enable/disable per-ghost chase target logs
const LOG_CHASE_TARGETS = true;

function log(name: string, message: string) {
  if (!LOG_CHASE_TARGETS) return;
  // eslint-disable-next-line no-console
  console.log(`[${name}] ${message}`);
}

export class BlinkyGhost extends Ghost {
  protected getChaseTarget(
    pacTile: TilePoint,
    _pacFacing: Phaser.Math.Vector2,
    _blinkyTile: TilePoint
  ): TilePoint {
    log('Blinky', `chase -> PAC (${pacTile.x},${pacTile.y})`);
    return pacTile;
  }
}

export class PinkyGhost extends Ghost {
  protected getChaseTarget(
    pacTile: TilePoint,
    pacFacing: Phaser.Math.Vector2,
    _blinkyTile: TilePoint
  ): TilePoint {
    // Classic arcade quirk:
    // When Pac-Man faces UP, Pinky aims 4 tiles up AND 4 tiles left.
    let offX = pacFacing.x * 4;
    let offY = pacFacing.y * 4;

    const facingUp = pacFacing.y < 0 && pacFacing.x === 0;
    if (facingUp) {
      offX -= 4; // extra 4 tiles left
    }

    const target = { x: pacTile.x + offX, y: pacTile.y + offY };
    log(
      'Pinky',
      `chase -> target (${target.x},${target.y}) from PAC (${pacTile.x},${pacTile.y}) `
      + `facing=(${pacFacing.x},${pacFacing.y})${facingUp ? ' [UP quirk applied]' : ''}`
    );
    return target;
  }
}

export class InkyGhost extends Ghost {
  protected getChaseTarget(
    pacTile: TilePoint,
    pacFacing: Phaser.Math.Vector2,
    blinkyTile: TilePoint
  ): TilePoint {
    // Inky targets: from Blinky -> (2 tiles ahead of Pac-Man), doubled
    const ahead = { x: pacTile.x + pacFacing.x * 2, y: pacTile.y + pacFacing.y * 2 };
    const vx = ahead.x - blinkyTile.x;
    const vy = ahead.y - blinkyTile.y;
    const target = { x: blinkyTile.x + vx * 2, y: blinkyTile.y + vy * 2 };

    log(
      'Inky',
      `chase -> ahead (${ahead.x},${ahead.y}) blinky=(${blinkyTile.x},${blinkyTile.y}) `
      + `target=(${target.x},${target.y})`
    );
    return target;
  }
}

export class ClydeGhost extends Ghost {
  protected getChaseTarget(
    pacTile: TilePoint,
    _pacFacing: Phaser.Math.Vector2,
    _blinkyTile: TilePoint
  ): TilePoint {
    // Clyde: if distance to Pac-Man is < 8 tiles, head to corner; else chase Pac-Man.
    const me = this.getTile();
    const d2 = distance2(me, pacTile); // squared distance in tiles
    const chaseMinTiles2 = 8 * 8;

    const farEnough = d2 >= chaseMinTiles2;
    const target = farEnough ? pacTile : this.scatterTarget;

    log(
      'Clyde',
      `chase decision d2=${d2} (${farEnough ? '>= 64' : '< 64'}) -> `
      + (farEnough ? `PAC (${pacTile.x},${pacTile.y})` : `CORNER (${this.scatterTarget.x},${this.scatterTarget.y})`)
    );

    return target;
  }
}