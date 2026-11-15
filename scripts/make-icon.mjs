// Generates icons/icon.png (1024x1024) for Strudel Studio — no external deps.
// Draws: dark rounded square, radial glow, neon waveform stroke.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ICON_S = Number(process.argv[2] ?? '1024');
const S = ICON_S;
const SCALE = S / 1024;
const px = new Float64Array(S * S * 3); // RGB floats 0..255
const sc = (v) => v * SCALE;

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 3;
  px[i] = px[i] * (1 - a) + r * a;
  px[i + 1] = px[i + 1] * (1 - a) + g * a;
  px[i + 2] = px[i + 2] * (1 - a) + b * a;
}
function fillCircle(cx, cy, rad, r, g, b, a) {
  const r2 = rad * rad;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= r2) blend(x, y, r, g, b, a);
    }
}
function roundedRect(x0, y0, w, h, rad, r, g, b, a) {
  for (let y = Math.max(0, y0); y < Math.min(S, y0 + h); y++)
    for (let x = Math.max(0, x0); x < Math.min(S, x0 + w); x++) {
      const cx = x < x0 + rad ? x0 + rad : x > x0 + w - rad ? x0 + w - rad : x;
      const cy = y < y0 + rad ? y0 + rad : y > y0 + h - rad ? y0 + h - rad : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) blend(x, y, r, g, b, a);
    }
}

// background: #07080d
for (let i = 0; i < px.length; i += 3) { px[i] = 7; px[i + 1] = 8; px[i + 2] = 13; }

// rounded square panel (#141824) with margin
roundedRect(sc(96), sc(96), S - sc(192), S - sc(192), sc(210), 20, 24, 36, 1);

// radial glows: cyan top-left, magenta centre-bottom, lime bottom-right
fillCircle(sc(330), sc(330), sc(420), 53, 224, 255, 0.16);
fillCircle(sc(512), sc(700), sc(460), 255, 62, 165, 0.15);
fillCircle(sc(760), sc(840), sc(380), 182, 255, 59, 0.10);

// waveform polyline glow — thick stroke approximated by disc stamping
const points = [];
for (let x = sc(180); x <= sc(844); x += Math.max(1, Math.round(6 * SCALE))) {
  const t = (x - sc(180)) / sc(664);
  const env = Math.sin(t * Math.PI) ** 0.8;
  const y = sc(512) - Math.sin(t * Math.PI * 6.4) * sc(150) * env - Math.sin(t * Math.PI * 13.2 + 0.8) * sc(46) * env;
  points.push([x, y]);
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c0, c1, t) => [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
const CYAN = [53, 224, 255], MAGENTA = [255, 62, 165], LIME = [182, 255, 59];
for (let pass = 0; pass < 3; pass++) {
  const [thick, alpha] = [[46, 0.28], [26, 0.5], [12, 0.95]][pass];
  const thickScaled = sc(thick);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, gt = (x0 + (x1 - x0) * t - sc(180)) / sc(664);
      const col = gt < 0.5 ? lerpColor(CYAN, MAGENTA, gt * 2) : lerpColor(MAGENTA, LIME, (gt - 0.5) * 2);
      const ysgn = y0 + (y1 - y0) * t;
      fillCircle(x0 + (x1 - x0) * t, ysgn, thickScaled / 2, col[0], col[1], col[2], alpha);
    }
  }
}

// clip everything to the rounded square (margin stays #07080d)
const M = sc(96), W = S - sc(192), RAD = sc(210);
function insideRR(x, y) {
  const cx = x < M + RAD ? M + RAD : x > M + W - RAD ? M + W - RAD : x;
  const cy = y < M + RAD ? M + RAD : y > M + W - RAD ? M + W - RAD : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= RAD * RAD;
}
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    if (insideRR(x, y)) continue;
    const i = (y * S + x) * 3;
    px[i] = 7; px[i + 1] = 8; px[i + 2] = 13;
  }

// encode PNG (truecolor, no interlace)
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(S * (S * 3 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 3 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const si = (y * S + x) * 3, di = y * (S * 3 + 1) + 1 + x * 3;
    raw[di] = Math.max(0, Math.min(255, Math.round(px[si])));
    raw[di + 1] = Math.max(0, Math.min(255, Math.round(px[si + 1])));
    raw[di + 2] = Math.max(0, Math.min(255, Math.round(px[si + 2])));
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(new URL('../src-tauri/icons/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), { recursive: true });
const outName = process.argv[3] ?? 'icon.png';
const out = new URL(`../src-tauri/icons/${outName}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
writeFileSync(out, png);
console.log('icon written', out, png.length, 'bytes');
