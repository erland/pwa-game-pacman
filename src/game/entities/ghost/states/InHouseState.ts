// src/game/entities/ghost/states/InHouseState.ts
import { GhostState, UpdateCtx } from './Base';
import { GhostMode } from '../GhostTypes';
import type { Ghost } from '../GhostBase';

export class InHouseState extends GhostState {
  readonly id = GhostMode.InHouse;
  update(_g: Ghost, _dtMs: number, _ctx: UpdateCtx): void {
    // Wait until releaseFromHouse() triggers mode change.
  }
}