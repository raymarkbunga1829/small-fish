import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const body = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return body;
}

function icon(size) {
  const radius = Math.floor(size * 0.22);
  return png(size, (x, y, n) => {
    const cx = n / 2;
    const cy = n / 2;
    const dx = Math.min(x, n - 1 - x);
    const dy = Math.min(y, n - 1 - y);
    const inside = dx >= 0 && dy >= 0 && (dx >= radius || dy >= radius || (dx - radius) ** 2 + (dy - radius) ** 2 <= radius ** 2);
    if (!inside) return [0, 0, 0, 0];
    const nx = x / n;
    const ny = y / n;
    let r = 0, g = 122, b = 255, a = 255;
    const px = (nx - 0.5) * 2;
    const py = (ny - 0.42) * 2;
    const body = px * px * 1.15 + (py + 0.15) * (py + 0.15) * 0.7 < 0.22 && ny > 0.28 && ny < 0.78;
    const neck = Math.abs(nx - 0.46) < 0.07 && ny > 0.22 && ny < 0.4;
    const head = (nx - 0.42) ** 2 + (ny - 0.24) ** 2 < 0.018;
    const snout = ny > 0.2 && ny < 0.3 && nx > 0.28 && nx < 0.42 && (nx - 0.42) * 1.6 + (0.26 - ny) < 0.04;
    if (body || neck || head || snout) {
      r = 244;
      g = 239;
      b = 227;
    }
    return [r, g, b, a];
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192));
writeFileSync("public/icons/icon-512.png", icon(512));
console.log("icons written");
