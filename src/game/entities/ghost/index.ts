// src/game/entities/ghost/index.ts
export { GhostMode } from './GhostTypes';
export type { TilePoint } from './GhostTypes';

export { Ghost, type GhostOptions } from './GhostBase';
export { BlinkyGhost, PinkyGhost, InkyGhost, ClydeGhost } from './Ghosts';