/**
 * 生成扩展图标（16/32/48/128 PNG），零依赖：
 * - 纯 JS PNG 编码器（zlib deflate + 手写 CRC32）
 * - 几何绘制：emerald 渐变圆角方块 + 三条白色圆角「标签条」
 *
 * 运行：node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// WXT 会把 public/ 原样拷入构建产物，并按 icon/<size>.png 模式自动登记 manifest.icons
const outDir = join(root, 'public', 'icon');

// ---------- PNG 编码 ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前置 filter 字节 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------
/** 圆角矩形内含判定（中心距法）。 */
function insideRounded(x, y, size, rect) {
  if (x < rect.x || x >= rect.x + rect.w || y < rect.y || y >= rect.y + rect.h) return false;
  const r = Math.min(rect.r, rect.w / 2, rect.h / 2);
  const cx = Math.max(rect.x + r, Math.min(x, rect.x + rect.w - r));
  const cy = Math.max(rect.y + r, Math.min(y, rect.y + rect.h - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= rect.x + r && x < rect.x + rect.w - r) || (y >= rect.y + r && y < rect.y + rect.h - r);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bgTop = [16, 185, 129]; // emerald-500
  const bgBottom = [4, 120, 87]; // emerald-700
  const corner = size * 0.22;

  // 三条白色标签条的几何参数（相对尺寸）
  const bars = [
    { w: 0.56, h: 0.085 },
    { w: 0.42, h: 0.085 },
    { w: 0.28, h: 0.085 },
  ];
  const barR = size * 0.045;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // 圆角背景
      const bgCorner = { x: 0, y: 0, w: size, h: size, r: corner };
      if (!insideRounded(x, y, size, bgCorner)) {
        rgba[idx + 3] = 0; // 透明角
        continue;
      }
      const color = mix(bgTop, bgBottom, y / size);
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];

      // 白色标签条
      let isBar = false;
      bars.forEach((bar, i) => {
        const bw = bar.w * size;
        const bh = bar.h * size;
        const bx = (size - bw) / 2;
        const by = size * (0.27 + i * 0.17);
        if (insideRounded(x, y, size, { x: bx, y: by, w: bw, h: bh, r: barR })) isBar = true;
      });
      if (isBar) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
      }

      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, drawIcon(size));
  const file = join(outDir, `${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
