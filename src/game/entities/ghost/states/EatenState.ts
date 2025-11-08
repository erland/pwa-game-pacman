// src/game/entities/ghost/states/EatenState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode } from '../GhostTypes';
import type { Ghost } from '../GhostBase';
import Phaser from 'phaser';
import { atTileCenter } from '../GhostUtils';
import { PacManDirection } from '../../common/direction';

export class EatenState extends GhostState {
  readonly id = GhostMode.Eaten;

  update(g: Ghost, dtMs: number, _ctx: UpdateCtx): void {
    const pt = g.mazeLayer.worldToTileXY(g.doorRect.centerX, g.doorRect.centerY);
    const target = { x: Math.round(pt.x), y: Math.round(pt.y) };

    this.stepTo(g, target, dtMs);

    if (Phaser.Geom.Rectangle.Contains(g.doorRect, g.x, g.y) && atTileCenter(g)) {
      g.setMode(GhostMode.InHouse, 'reached house center');
      g.setCurrentDirection(PacManDirection.Up);
    }
  }
}