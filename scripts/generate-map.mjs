#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILE_SIZE = 16;
const WIDTH = 28;
const HEIGHT = 31;

const MAZE_ROWS = [
  '2222222222222222222222222222',
  '2000000000000220000000000002',
  '2022220222220220222220222202',
  '2022220222220220222220222202',
  '2022220222220220222220222202',
  '2000000000000000000000000002',
  '2022220220222222220220222202',
  '2022220220222222220220222202',
  '2000000220000220000220000002',
  '2222220222220220222220222222',
  '2222220222220220222220222222',
  '2222220220000000000220222222',
  '2222220220000000000220222222',
  '2222220220222332220220222222',
  '2000000000000000000000000002',
  '2222220220222222220220222222',
  '2222220220222222220220222222',
  '0022220220000000000220222200',
  '2222220220222222220220222222',
  '2222220220222222220220222222',
  '2000000000000220000000000002',
  '2022220222220220222220222202',
  '2022220222220220222220222202',
  '2000220000000000000000220002',
  '2220220220222222220220220222',
  '2220220220222222220220220222',
  '2000000220000220000220000002',
  '2022222222220220222222222202',
  '2022222222220220222222222202',
  '2000000000000000000000000002',
  '2222222222222222222222222222',
];

const PELLET_ROWS = [
  '0000000000000000000000000000',
  '0444444444444004444444444440',
  '0400004000004004000004000040',
  '0500004000004004000004000050',
  '0400004000004004000004000040',
  '0444444444444444444444444440',
  '0400004004000000004004000040',
  '0400004004000000004004000040',
  '0444444004444004444004444440',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0444444444444004444444444440',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0000004000000000000004000000',
  '0444444444444004444444444440',
  '0400004000004004000004000040',
  '0400004000004004000004000040',
  '0544004444444444444444004450',
  '0004004004000000004004004000',
  '0004004004000000004004004000',
  '0444444004444004444004444440',
  '0400000000004004000000000040',
  '0400000000004004000000000040',
  '0444444444444444444444444440',
  '0000000000000000000000000000',
];

const POWER_PELLETS = [
  { id: 31, col: 1, row: 3 },
  { id: 36, col: 26, row: 3 },
  { id: 181, col: 1, row: 23 },
  { id: 202, col: 26, row: 23 },
];

const SPAWNS = [
  { id: 269, name: 'pacman', col: 13, row: 23 },
  { id: 270, name: 'blinky', col: 13, row: 11 },
  { id: 271, name: 'pinky', col: 13, row: 12 },
  { id: 272, name: 'inky', col: 11, row: 12 },
  { id: 273, name: 'clyde', col: 15, row: 12 },
  { id: 274, name: 'fruit', col: 13, row: 15 },
];

const TRIGGERS = [
  { id: 275, name: 'door', type: 'ghostDoor', col: 13, row: 13, widthTiles: 2, heightTiles: 1 },
  { id: 276, name: 'left', type: 'tunnel', col: 0, row: 17 },
  { id: 277, name: 'right', type: 'tunnel', col: 27, row: 17 },
];

const reservedPelletIds = new Set(POWER_PELLETS.map((p) => p.id));

const pelletObjects = [];
let nextPelletId = 1;

for (let row = 0; row < HEIGHT; row += 1) {
  const line = PELLET_ROWS[row];
  for (let col = 0; col < WIDTH; col += 1) {
    const value = Number(line[col]);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid pellet value '${line[col]}' at row ${row} col ${col}`);
    }
    if (value === 4) {
      while (reservedPelletIds.has(nextPelletId)) {
        nextPelletId += 1;
      }
      pelletObjects.push(createTileObject(nextPelletId, 'pellet', 'pellet', col, row));
      nextPelletId += 1;
    }
  }
}

const powerPelletObjects = POWER_PELLETS.map(({ id, col, row }) =>
  createTileObject(id, 'powerPellet', 'powerPellet', col, row),
);

const spawnObjects = SPAWNS.map(({ id, name, col, row }) =>
  createTileObject(id, name, name, col, row),
);

const triggerObjects = TRIGGERS.map(({ id, name, type, col, row, widthTiles = 1, heightTiles = 1 }) => ({
  id,
  name,
  type: type ?? name,
  x: col * TILE_SIZE,
  y: row * TILE_SIZE,
  width: widthTiles * TILE_SIZE,
  height: heightTiles * TILE_SIZE,
}));

const layers = [
  createTileLayer(1, 'maze', MAZE_ROWS),
  createTileLayer(2, 'pellets', PELLET_ROWS),
  createObjectLayer(3, 'pelletObjects', false, pelletObjects),
  createObjectLayer(4, 'powerPellets', false, powerPelletObjects),
  createObjectLayer(5, 'spawns', true, spawnObjects),
  createObjectLayer(6, 'triggers', true, triggerObjects),
];

const nextLayerId = layers.reduce((max, layer) => Math.max(max, layer.id), 0) + 1;
const nextObjectId = Math.max(
  0,
  ...layers.flatMap((layer) => (Array.isArray(layer.objects) ? layer.objects.map((obj) => obj.id) : [])),
) + 1;

const mapData = {
  height: HEIGHT,
  width: WIDTH,
  infinite: false,
  nextlayerid: nextLayerId,
  nextobjectid: nextObjectId,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  tileheight: TILE_SIZE,
  tilewidth: TILE_SIZE,
  type: 'map',
  version: '1.10',
  layers,
  tilesets: [
    {
      firstgid: 1,
      name: 'pacman-tiles',
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      tilecount: 64,
      columns: 8,
      image: '../tiles/pacman-tiles.png',
      imagewidth: 128,
      imageheight: 128,
    },
  ],
};

const outputDir = path.resolve(__dirname, '../public/maps');
const outputPath = path.join(outputDir, 'pacman.json');

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(mapData, null, 2) + '\n', 'utf8');

console.log(`Generated ${outputPath}`);

function createTileLayer(id, name, rows) {
  return {
    id,
    name,
    type: 'tilelayer',
    width: WIDTH,
    height: HEIGHT,
    x: 0,
    y: 0,
    visible: true,
    opacity: 1,
    data: rowsToData(rows),
  };
}

function createObjectLayer(id, name, visible, objects) {
  return {
    id,
    name,
    type: 'objectgroup',
    visible,
    opacity: 1,
    x: 0,
    y: 0,
    draworder: 'topdown',
    objects,
  };
}

function rowsToData(rows) {
  if (rows.length !== HEIGHT) {
    throw new Error(`Expected ${HEIGHT} rows for layer data, received ${rows.length}`);
  }
  return rows.flatMap((row, rowIndex) => {
    if (row.length !== WIDTH) {
      throw new Error(`Row ${rowIndex} has length ${row.length}; expected ${WIDTH}`);
    }
    return Array.from(row).map((char, colIndex) => {
      const value = Number(char);
      if (!Number.isInteger(value)) {
        throw new Error(`Invalid tile value '${char}' at row ${rowIndex} col ${colIndex}`);
      }
      return value;
    });
  });
}

function createTileObject(id, name, type, col, row) {
  return {
    id,
    name,
    type,
    x: col * TILE_SIZE,
    y: row * TILE_SIZE,
    width: TILE_SIZE,
    height: TILE_SIZE,
  };
}