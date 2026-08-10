// gen-icon.mjs — 生成应用图标（零依赖）：assets/icon.png(256) + assets/icon.ico + assets/tray.png(32)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
mkdirSync(assetsDir, { recursive: true });

// ── 绘制：深色圆角机身 + 绿色扬声器圆盘 + 天线 ──
function draw(size) {
  const px = new Float64Array(size * size * 4); // RGBA 0..255
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const inRoundRect = (x, y, cx, cy, w, h, rad) => {
    const dx = Math.abs(x - cx) - (w / 2 - rad);
    const dy = Math.abs(y - cy) - (h / 2 - rad);
    if (dx <= 0 && dy <= 0) return true;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= rad;
  };
  const inCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r;

  const cx = size / 2;
  const cy = size / 2 + size * 0.06;
  const bw = size * 0.62;
  const bh = size * 0.5;
  const br = size * 0.13;
  const bodyTop = cy - bh / 2;
  const bodyBottom = cy + bh / 2;

  // 机身
  for (let y = Math.floor(bodyTop); y <= Math.ceil(bodyBottom); y++) {
    for (let x = Math.floor(cx - bw / 2); x <= Math.ceil(cx + bw / 2); x++) {
      if (inRoundRect(x, y, cx, cy, bw, bh, br)) put(x, y, 31, 36, 48, 255);
    }
  }
  // 机身边框高光
  const edgeW = Math.max(1, size * 0.02);
  for (let y = Math.floor(bodyTop); y <= Math.ceil(bodyBottom); y++) {
    for (let x = Math.floor(cx - bw / 2); x <= Math.ceil(cx + bw / 2); x++) {
      if (inRoundRect(x, y, cx, cy, bw, bh, br)) {
        const edge = Math.min(
          Math.abs(x - (cx - bw / 2)), Math.abs(x - (cx + bw / 2)),
          Math.abs(y - bodyTop), Math.abs(y - bodyBottom)
        );
        if (edge <= edgeW) put(x, y, 148, 163, 184, 255);
      }
    }
  }
  // 扬声器圆盘（绿色）
  const sr = size * 0.16;
  const scx = cx;
  const scy = cy;
  for (let y = Math.floor(scy - sr); y <= Math.ceil(scy + sr); y++) {
    for (let x = Math.floor(scx - sr); x <= Math.ceil(scx + sr); x++) {
      if (inCircle(x, y, scx, scy, sr)) put(x, y, 74, 222, 128, 255);
    }
  }
  // 扬声器内圈
  const ir = size * 0.08;
  for (let y = Math.floor(scy - ir); y <= Math.ceil(scy + ir); y++) {
    for (let x = Math.floor(scx - ir); x <= Math.ceil(scx + ir); x++) {
      if (inCircle(x, y, scx, scy, ir)) put(x, y, 20, 24, 33, 255);
    }
  }
  // 天线（灰杆 + 黄色圆头）
  const ax = cx;
  const endY = bodyTop - size * 0.2;
  const knobR = Math.max(1, size * 0.045);
  const lineW = Math.max(1, size * 0.035);
  for (let y = Math.floor(endY); y <= Math.ceil(bodyTop); y++) {
    for (let x = Math.floor(ax - lineW / 2); x <= Math.ceil(ax + lineW / 2); x++) {
      put(x, y, 148, 163, 184, 255);
    }
  }
  for (let y = Math.floor(endY - knobR); y <= Math.ceil(endY + knobR); y++) {
    for (let x = Math.floor(ax - knobR); x <= Math.ceil(ax + knobR); x++) {
      if (inCircle(x, y, ax, endY, knobR)) put(x, y, 251, 191, 36, 255);
    }
  }

  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
  }
  return out;
}

// ── PNG 编码（RGBA）──
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = rowStart + 1 + x * 4;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO 容器（内嵌 PNG，Windows Vista+ 支持）──
function encodeIco(size, png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count: 1
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);   // planes
  entry.writeUInt16LE(32, 6);  // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, png]);
}

const png256 = encodePng(256, draw(256));
writeFileSync(join(assetsDir, 'icon.png'), png256);
writeFileSync(join(assetsDir, 'icon.ico'), encodeIco(256, png256));
writeFileSync(join(assetsDir, 'tray.png'), encodePng(32, draw(32)));

console.log('已生成:');
console.log('  assets/icon.png (256x256)');
console.log('  assets/icon.ico');
console.log('  assets/tray.png (32x32)');
