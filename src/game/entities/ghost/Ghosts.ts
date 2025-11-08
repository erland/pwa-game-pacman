import Phaser from 'phaser';
import { TilePoint } from './GhostTypes';
import { Ghost } from './GhostBase';

export class BlinkyGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, _pacFacing: Phaser.Math.Vector2, _blinkyTile: TilePoint): TilePoint {
    return pacTile;
  }
}

export class PinkyGhost extends Ghost {
  protected getChaseTarget(pacTile: TilePoint, pacFacing: Phaser.Math.Vector2, _blinkyTile: TilePoint): TilePoint {
    return { x: pacTile.x + pacFacing.x * 4, y: pacTile.y + (pacFacing.y as number) * 4 };
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
    const dist2 = dx * dx + dy * dy;
    return dist2 <= 64 ? this.scatterTarget : pacTile;
  }
}