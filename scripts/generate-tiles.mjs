#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { deflateSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILE_SIZE = 16;
const COLUMNS = 8;
const ROWS = 8;
const TOTAL_TILES = COLUMNS * ROWS;

const OUTPUT_DIR = path.resolve(__dirname, '../public/tiles');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pacman-tiles.png');

const WALL_FILL = [0, 45, 255, 255];
const WALL_HIGHLIGHT = [120, 200, 255, 255];
const BACKGROUND = [0, 0, 0, 255];
const DOOR_COLOR = [255, 128, 192, 255];
const PELLET_COLOR = [255, 255, 255, 255];

class RgbaImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  fill(color) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        setPixel(this, x, y, color);
      }
    }
  }

  toPngBuffer() {
    const bytesPerRow = this.width * 4 + 1;
    const raw = Buffer.alloc(bytesPerRow * this.height);
    for (let y = 0; y < this.height; y += 1) {
      raw[y * bytesPerRow] = 0;
      const rowStart = y * this.width * 4;
      const row = this.data.subarray(rowStart, rowStart + this.width * 4);
      Buffer.from(row).copy(raw, y * bytesPerRow + 1);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const idatData = deflateSync(raw);
    const chunks = [
      createChunk('IHDR', ihdr),
      createChunk('IDAT', idatData),
      createChunk('IEND', Buffer.alloc(0)),
    ];

    return Buffer.concat([PNG_SIGNATURE, ...chunks]);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const sheet = new RgbaImage(COLUMNS * TILE_SIZE, ROWS * TILE_SIZE);
sheet.fill(BACKGROUND);

for (let index = 0; index < TOTAL_TILES; index += 1) {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const ox = col * TILE_SIZE;
  const oy = row * TILE_SIZE;

  if (index === 0) {
    drawEmptyTile(sheet, ox, oy);
  } else if (index === 2) {
    drawDoorTile(sheet, ox, oy);
  } else if (index === 3) {
    drawPelletTile(sheet, ox, oy, 2);
  } else if (index === 4) {
    drawPelletTile(sheet, ox, oy, 4);
  } else {
    drawWallTile(sheet, ox, oy);
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(OUTPUT_FILE, sheet.toPngBuffer());
console.log(`Generated ${OUTPUT_FILE}`);

function drawEmptyTile(img, ox, oy) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, BACKGROUND);
}

function drawWallTile(img, ox, oy) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, WALL_FILL);
  drawBorder(img, ox, oy, WALL_HIGHLIGHT);
}

function drawDoorTile(img, ox, oy) {
  drawEmptyTile(img, ox, oy);
  const doorHeight = 4;
  const doorTop = oy + Math.floor(TILE_SIZE / 2) - Math.floor(doorHeight / 2);
  fillRect(img, ox + 1, doorTop, TILE_SIZE - 2, doorHeight, DOOR_COLOR);
}

function drawPelletTile(img, ox, oy, radius) {
  drawEmptyTile(img, ox, oy);
  fillCircle(img, ox + TILE_SIZE / 2, oy + TILE_SIZE / 2, radius, PELLET_COLOR);
}

function drawBorder(img, ox, oy, color) {
  for (let i = 0; i < TILE_SIZE; i += 1) {
    setPixel(img, ox + i, oy, color);
    setPixel(img, ox + i, oy + TILE_SIZE - 1, color);
    setPixel(img, ox, oy + i, color);
    setPixel(img, ox + TILE_SIZE - 1, oy + i, color);
  }
}

function fillCircle(img, cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(img, x, y, color);
      }
    }
  }
}

function fillRect(img, ox, oy, width, height, color) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(img, ox + x, oy + y, color);
    }
  }
}

function setPixel(img, x, y, color) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const idx = (img.width * y + x) * 4;
  img.data[idx] = color[0];
  img.data[idx + 1] = color[1];
  img.data[idx + 2] = color[2];
  img.data[idx + 3] = color[3];
}
