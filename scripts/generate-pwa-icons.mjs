import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    0,
  );

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lengthSquared = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSquared));
  const dx = px - (ax + t * abx);
  const dy = py - (ay + t * aby);
  return Math.hypot(dx, dy);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function sample(nx, ny, maskable) {
  const background = [5, 5, 7, 255];

  const cx = 0.5;
  const cy = 0.5;
  const radius = maskable ? 0.34 : 0.37;
  const d = Math.hypot(nx - cx, ny - cy);

  let color = background;

  if (d <= radius) {
    const t = Math.max(0, Math.min(1, (nx + ny - 0.45) / 1.1));
    color = [
      mix(239, 126, t),
      mix(68, 34, t),
      mix(68, 206, t),
      255,
    ];
  }

  const leftLeg = distanceToSegment(nx, ny, 0.5, 0.29, 0.34, 0.72);
  const rightLeg = distanceToSegment(nx, ny, 0.5, 0.29, 0.66, 0.72);
  const legWidth = maskable ? 0.052 : 0.058;
  const onLeg =
    (leftLeg <= legWidth && ny >= 0.27 && ny <= 0.74) ||
    (rightLeg <= legWidth && ny >= 0.27 && ny <= 0.74);

  const onBar =
    nx >= 0.405 &&
    nx <= 0.595 &&
    ny >= 0.565 &&
    ny <= 0.625;

  if (onLeg || onBar) {
    return [255, 255, 255, 255];
  }

  return color;
}

function render(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const samples = [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ];

      const rgba = [0, 0, 0, 0];

      for (const [sx, sy] of samples) {
        const nx = (x + sx) / size;
        const ny = (y + sy) / size;
        const sampleColor = sample(nx, ny, maskable);
        rgba[0] += sampleColor[0];
        rgba[1] += sampleColor[1];
        rgba[2] += sampleColor[2];
        rgba[3] += sampleColor[3];
      }

      const pixelOffset = rowOffset + 1 + x * 4;
      raw[pixelOffset] = Math.round(rgba[0] / samples.length);
      raw[pixelOffset + 1] = Math.round(rgba[1] / samples.length);
      raw[pixelOffset + 2] = Math.round(rgba[2] / samples.length);
      raw[pixelOffset + 3] = Math.round(rgba[3] / samples.length);
    }
  }

  const signature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

for (const [name, size, maskable] of files) {
  fs.writeFileSync(
    path.join(OUT_DIR, name),
    render(size, maskable),
  );
}

console.log(
  "PWA icons generated:",
  files.map(([name]) => name).join(", "),
);
