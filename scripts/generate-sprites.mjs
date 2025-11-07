#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { deflateSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../public/sprites');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pacman-characters.png');
const TILE_SIZE = 16;
const SPACING = 1;
const COLUMNS = 4;

const transparent = [0, 0, 0, 0];
const yellow = [255, 232, 0, 255];
const darkYellow = [255, 180, 0, 255];
const white = [255, 255, 255, 255];
const black = [0, 0, 0, 255];
const pink = [255, 160, 255, 255];
const orange = [255, 184, 71, 255];
const cyan = [120, 220, 255, 255];
const red = [228, 28, 28, 255];
const cherryRed = [230, 30, 70, 255];
const cherryStem = [80, 200, 80, 255];

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

const frames = [
  (img, ox, oy) => drawPacman(img, ox, oy, 'right'),
  (img, ox, oy) => drawPacman(img, ox, oy, 'up'),
  (img, ox, oy) => drawPacman(img, ox, oy, 'left'),
  (img, ox, oy) => drawPacman(img, ox, oy, 'down'),
  (img, ox, oy) => drawGhost(img, ox, oy, red),
  (img, ox, oy) => drawGhost(img, ox, oy, pink),
  (img, ox, oy) => drawGhost(img, ox, oy, cyan),
  (img, ox, oy) => drawGhost(img, ox, oy, orange),
  (img, ox, oy) => drawPelletIcon(img, ox, oy),
  (img, ox, oy) => drawPowerPelletIcon(img, ox, oy),
  (img, ox, oy) => drawCherryIcon(img, ox, oy),
  (img, ox, oy) => drawLifeIcon(img, ox, oy),
];

const rows = Math.ceil(frames.length / COLUMNS);
const width = COLUMNS * TILE_SIZE + (COLUMNS - 1) * SPACING;
const height = rows * TILE_SIZE + (rows - 1) * SPACING;

const sheet = new RgbaImage(width, height);
sheet.fill(transparent);

frames.forEach((draw, index) => {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const ox = col * (TILE_SIZE + SPACING);
  const oy = row * (TILE_SIZE + SPACING);
  draw(sheet, ox, oy);
});

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(OUTPUT_FILE, sheet.toPngBuffer());
console.log(`Generated ${OUTPUT_FILE}`);

function drawPacman(img, ox, oy, direction) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, transparent);
  const cx = ox + TILE_SIZE / 2;
  const cy = oy + TILE_SIZE / 2;
  const radius = TILE_SIZE / 2 - 1;

  const startAngles = {
    right: (-30 * Math.PI) / 180,
    up: (60 * Math.PI) / 180,
    left: (150 * Math.PI) / 180,
    down: (240 * Math.PI) / 180,
  };

  const endAngles = {
    right: (210 * Math.PI) / 180,
    up: (300 * Math.PI) / 180,
    left: (390 * Math.PI) / 180,
    down: (480 * Math.PI) / 180,
  };

  const start = startAngles[direction];
  const end = endAngles[direction];

  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = px - (cx - ox);
      const dy = py - (cy - oy);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const angle = Math.atan2(dy, dx);
        const normalized = angle < 0 ? angle + 2 * Math.PI : angle;
        if (isAngleBetween(normalized, start, end)) {
          setPixel(img, ox + x, oy + y, yellow);
        }
      }
    }
  }

  const eyeOffset = {
    right: { x: 4, y: -4 },
    up: { x: -3, y: -5 },
    left: { x: -4, y: -4 },
    down: { x: -2, y: 3 },
  }[direction];
  const eyeX = Math.round(cx + eyeOffset.x);
  const eyeY = Math.round(cy + eyeOffset.y);
  fillCircle(img, eyeX, eyeY, 1, white);
  fillCircle(img, eyeX, eyeY, 0, black);
}

function drawGhost(img, ox, oy, bodyColor) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, transparent);
  const width = TILE_SIZE - 2;
  const height = TILE_SIZE - 2;
  const left = ox + 1;
  const top = oy + 1;
  const radius = width / 2;
  const centerX = left + width / 2;
  const headBottom = top + height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = left + x;
      const py = top + y;
      if (py <= headBottom) {
        const dx = px + 0.5 - centerX;
        const dy = py + 0.5 - (top + radius);
        if (dx * dx + dy * dy <= radius * radius) {
          setPixel(img, px, py, bodyColor);
        }
      } else {
        setPixel(img, px, py, bodyColor);
      }
    }
  }

  const scallopWidth = Math.floor(width / 4);
  for (let i = 0; i < 4; i += 1) {
    const scallopX = left + i * scallopWidth;
    for (let y = 0; y < scallopWidth; y += 1) {
      for (let x = 0; x < scallopWidth; x += 1) {
        const px = scallopX + x;
        const py = top + height - scallopWidth + y;
        const dx = x - scallopWidth / 2 + 0.5;
        const dy = y - scallopWidth / 2 + 0.5;
        if (dx * dx + dy * dy <= (scallopWidth / 2) * (scallopWidth / 2)) {
          setPixel(img, px, py, bodyColor);
        }
      }
    }
  }

  const eyeRadius = 3;
  const pupilRadius = 1;
  const eyeY = top + 5;
  const leftEyeX = left + 4;
  const rightEyeX = left + width - 4;

  fillCircle(img, leftEyeX, eyeY, eyeRadius, white);
  fillCircle(img, rightEyeX, eyeY, eyeRadius, white);
  fillCircle(img, leftEyeX + 1, eyeY + 1, pupilRadius, black);
  fillCircle(img, rightEyeX + 1, eyeY + 1, pupilRadius, black);
}

function drawPelletIcon(img, ox, oy) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, transparent);
  fillCircle(img, ox + TILE_SIZE / 2, oy + TILE_SIZE / 2, 2, white);
}

function drawPowerPelletIcon(img, ox, oy) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, transparent);
  fillCircle(img, ox + TILE_SIZE / 2, oy + TILE_SIZE / 2, 4, white);
}

function drawCherryIcon(img, ox, oy) {
  fillRect(img, ox, oy, TILE_SIZE, TILE_SIZE, transparent);
  const baseX = ox + TILE_SIZE / 2;
  const baseY = oy + TILE_SIZE / 2 + 2;
  fillCircle(img, baseX - 3, baseY, 3, cherryRed);
  fillCircle(img, baseX + 3, baseY - 1, 3, cherryRed);
  drawLine(img, baseX, baseY - 5, baseX - 4, baseY - 9, cherryStem);
  drawLine(img, baseX, baseY - 6, baseX + 5, baseY - 10, cherryStem);
}

function drawLifeIcon(img, ox, oy) {
  drawPacman(img, ox, oy, 'right');
  drawArcOutline(img, ox + TILE_SIZE / 2, oy + TILE_SIZE / 2, TILE_SIZE / 2 - 1, darkYellow);
}

function drawArcOutline(img, cx, cy, radius, color) {
  for (let angle = 0; angle < 360; angle += 3) {
    const radians = (angle * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(radians) * radius);
    const y = Math.round(cy + Math.sin(radians) * radius);
    setPixel(img, x, y, color);
  }
}

function drawLine(img, x0, y0, x1, y1, color) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const dx = Math.abs(Math.round(x1) - x);
  const dy = Math.abs(Math.round(y1) - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    setPixel(img, x, y, color);
    if (x === Math.round(x1) && y === Math.round(y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
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

function isAngleBetween(angle, start, end) {
  let s = start;
  let e = end;
  if (s < 0) s += 2 * Math.PI;
  if (e < 0) e += 2 * Math.PI;
  if (e < s) {
    return angle >= s || angle <= e;
  }
  return angle >= s && angle <= e;
}
