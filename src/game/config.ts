export const TILE_SIZE = 16;

export const MAP_CONFIG = {
  key: 'pacman-map',
  url: 'maps/pacman.json',
  tilesetName: 'pacman-tiles',
  tilesetKey: 'pacman-tiles',
  tilesetImageUrl: 'tiles/pacman-tiles.png',
};

export const SPRITE_SHEET_CONFIG = {
  key: 'pacman-characters',
  url: 'sprites/pacman-characters.png',
  frameWidth: 16,
  frameHeight: 16,
};

export const AUDIO_CONFIG = {
  chomp: { key: 'sfx-chomp', url: 'audio/chomp.wav' },
  powerPellet: { key: 'sfx-power-pellet', url: 'audio/power_pellet.wav' },
  ghostEaten: { key: 'sfx-ghost-eaten', url: 'audio/ghost_eaten.wav' },
  playerDeath: { key: 'sfx-player-death', url: 'audio/player_death.wav' },
  levelStart: { key: 'sfx-level-start', url: 'audio/level_start.wav' },
  fruitSpawn: { key: 'sfx-fruit-spawn', url: 'audio/fruit_spawn.wav' },
} as const;

export enum TileIndex {
  Empty = 0,
  Wall = 2,
  GhostDoor = 3,
  Pellet = 4,
  PowerPellet = 5,
}

export enum GhostName {
  Blinky = 'blinky',
  Pinky = 'pinky',
  Inky = 'inky',
  Clyde = 'clyde',
}

export enum GhostMode {
  Scatter = 'scatter',
  Chase = 'chase',
  Frightened = 'frightened',
  Eaten = 'eaten',
}

export interface LevelTimingConfig {
  scatter: number[];
  chase: number[];
  frightened: number;
  frightenedFlashes: number;
}

export const LEVEL_TIMINGS: LevelTimingConfig[] = [
  { scatter: [7, 7, 5, 5], chase: [20, 20, 20, -1], frightened: 6, frightenedFlashes: 3 },
  { scatter: [7, 7, 5, 5], chase: [20, 20, 20, -1], frightened: 5, frightenedFlashes: 4 },
  { scatter: [7, 7, 5, 5], chase: [20, 20, 20, -1], frightened: 4, frightenedFlashes: 5 },
  { scatter: [7, 7, 5, 5], chase: [20, 20, 20, -1], frightened: 3, frightenedFlashes: 6 },
];

export const FRUIT_SEQUENCE = [
  { level: 1, name: 'cherry', score: 100 },
  { level: 2, name: 'strawberry', score: 300 },
  { level: 3, name: 'orange', score: 500 },
  { level: 4, name: 'apple', score: 700 },
  { level: 5, name: 'melon', score: 1000 },
  { level: 6, name: 'galaxian', score: 2000 },
  { level: 7, name: 'bell', score: 3000 },
  { level: 8, name: 'key', score: 5000 },
];

export type FruitName = (typeof FRUIT_SEQUENCE)[number]['name'];

export const PACMAN_ANIMATIONS = {
  walkRight: { start: 0, end: 0 },
  walkUp: { start: 1, end: 1 },
  walkLeft: { start: 2, end: 2 },
  walkDown: { start: 3, end: 3 },
} as const;

export const GHOST_FRAME = {
  [GhostName.Blinky]: 4,
  [GhostName.Pinky]: 5,
  [GhostName.Inky]: 6,
  [GhostName.Clyde]: 7,
} as const;

export const HUD_ICONS = {
  pellet: 8,
  powerPellet: 9,
  fruit: 10,
  life: 11,
} as const;
