// Door-at-dusk, task 1: mock candidate door spots on the dusk-beach painting in a
// wide (16:9) and a tall (9:19.5 phone) crop. Placeholder door only, to judge
// position and scale. Needs ffmpeg on PATH (no npm deps).
//   [DUSK_BASE=painting.png] node tools/door-mock.mjs [out folder]
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = (f) => path.join(root, 'namit-gid-site/assets/img', f);
const out = path.resolve(process.argv[2] || path.join(root, 'Claude outputs/door-mocks'));
mkdirSync(out, { recursive: true });
const tmp = path.join(out, '_tmp'); mkdirSync(tmp, { recursive: true });

const PW = 1584, PH = 672;
const NIGHT = [0x1B, 0x1F, 0x32];

// ---- candidates: DOOR = bottom-centre of the door on the sand + width, as fractions of the painting.
// CROP_WIDE: focal centre x (fraction); window is 16:9 cover => full painting height, 75.4% of width.
// CROP_TALL: focal centre x + visible width fraction (the painting is shown as a band, scaled so that
//            width fills the phone; sky and night colour extend above and below it).
const CANDIDATES = [
  { id: 'A', name: 'under the lighthouse', door: { x: 0.575, y: 0.80, w: 0.045 }, wide: { cx: 0.56 }, tall: { cx: 0.60, win: 0.28 } },
  { id: 'B', name: 'pool left shore',      door: { x: 0.410, y: 0.82, w: 0.050 }, wide: { cx: 0.47 }, tall: { cx: 0.54, win: 0.35 } },
  { id: 'C', name: 'near the water line',  door: { x: 0.500, y: 0.85, w: 0.060 }, wide: { cx: 0.54 }, tall: { cx: 0.59, win: 0.28 } },
];
const TALL_W = 750, TALL_H = 1624;      // 2x of 375x812
const WIDE_W = 1280, WIDE_H = 720;
const DOOR_BASE_ON_SCREEN = 0.70;       // tall: where the door's base sits, as a fraction of screen height

const ff = (args, input) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { input, maxBuffer: 1 << 29 });
const decode = (f) => ff(['-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
const encode = (buf, w, h, file) => ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', file], buf);

// ---- base composite: painting + island + boat (as the footer lays them out) + bottom fade
// DUSK_BASE=path samples a different painting (e.g. the high-res repaint), scaled to PWxPH
const base = process.env.DUSK_BASE ? ff(['-i', process.env.DUSK_BASE, '-vf', `scale=${PW}:${PH}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']) : decode(img('dusk-beach.webp'));
function overlay(file, left, topFrac, wFrac, { bright, sat, tint = [1, 1, 1], clipBottom = 0 }) {
  const w = Math.round(PW * wFrac);
  const raw = ff(['-i', img(file), '-vf', `scale=${w}:-1:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  const h = raw.length / 4 / w;
  const x0 = Math.round(PW * left), y0 = Math.round(PH * topFrac);
  const hh = Math.round(h * (1 - clipBottom));
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, px = x0 + x, py = y0 + y;
    if (px >= PW || py >= PH) continue;
    const a = raw[s + 3] / 255; if (!a) continue;
    let r = raw[s] * bright, g = raw[s + 1] * bright, b = raw[s + 2] * bright;
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = (l + (r - l) * sat) * tint[0]; g = (l + (g - l) * sat) * tint[1]; b = (l + (b - l) * sat) * tint[2];
    const d = (py * PW + px) * 4;
    base[d] = base[d] * (1 - a) + r * a; base[d + 1] = base[d + 1] * (1 - a) + g * a; base[d + 2] = base[d + 2] * (1 - a) + b * a;
  }
}
overlay('byaringan-painted-840.webp', 0.505, 0.414, 0.19, { bright: 0.55, sat: 0.75, tint: [1.04, 1, 0.94] });
overlay('bangka-painted.webp', 0.63, 0.696, 0.22, { bright: 0.6, sat: 0.7, tint: [1.05, 1, 0.92], clipBottom: 0.22 });
for (let y = Math.round(PH * 0.7); y < PH; y++) {        // .foot-scene::after, bottom 30%
  const t = (y - PH * 0.7) / (PH * 0.3);
  for (let x = 0; x < PW; x++) { const d = (y * PW + x) * 4; for (let c = 0; c < 3; c++) base[d + c] = base[d + c] * (1 - t) + NIGHT[c] * t; }
}
const basePng = path.join(tmp, 'base.png'); encode(base, PW, PH, basePng);

// ---- canvas helpers
const canvas = (w, h) => ({ w, h, d: Buffer.alloc(w * h * 4, 255) });
const blend = (c, x, y, rgb, a) => {
  if (a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4; a = Math.min(1, a);
  for (let k = 0; k < 3; k++) c.d[i + k] = c.d[i + k] * (1 - a) + rgb[k] * a;
};
const sdRRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cov = (sd) => Math.max(0, Math.min(1, 0.5 - sd));

// placeholder door at output px: (bx, by) = bottom-centre, dw = width
function drawDoor(c, bx, by, dw) {
  const dh = dw * 2, cx = bx, cy = by - dh / 2, hw = dw / 2, hh = dh / 2, r = dw * 0.45;
  const sw = dw * 0.8, sh = dw * 0.26, scy = by - dh * 0.8;          // sign, hanging near the top
  const R = Math.ceil(dh * 1.2), x0 = Math.floor(bx - dw * 2.2), x1 = Math.ceil(bx + dw * 2.2);
  const wob = (y) => Math.sin(y * 0.9) * dw * 0.03;
  for (let y = Math.floor(by - dh - dw); y < by + R; y++) for (let x = x0; x < x1; x++) {
    if (y <= by) {                                                    // glow around the door and on the sand
      const g = Math.exp(-(((x - cx) / (dw * 1.4)) ** 2 + ((y - (cy + hh * 0.3)) / (dh * 0.75)) ** 2)) * 0.28;
      blend(c, x, y, [255, 190, 110], g);
      const sg = Math.exp(-(((x - cx - dw * 0.25) / (dw * 1.1)) ** 2 + ((y - by - dw * 0.1) / (dw * 0.28)) ** 2)) * 0.5;
      blend(c, x, y, [255, 205, 130], sg);
      const sd = sdRRect(x, y, cx, cy, hw, hh, r);                   // door leaf
      const body = cov(sd);
      if (body) {
        const t = (y - (by - dh)) / dh;
        blend(c, x, y, [122 - 30 * t, 74 - 20 * t, 42 - 12 * t], body);
        const inner = cov(sdRRect(x, y, cx, cy + dh * 0.04, hw * 0.72, hh * 0.84, r * 0.6));   // panel
        blend(c, x, y, [98, 58, 32], inner * 0.5 * body);
        if (x > cx + hw - dw * 0.1) blend(c, x, y, [255, 214, 140], body * 0.95);               // ajar: light leaks from the gap
      }
      const sdS = sdRRect(x, y, cx, scy, sw / 2, sh / 2, dw * 0.04);   // hanging sign
      const sb = cov(sdS);
      if (sb) { blend(c, x, y, [64, 40, 24], sb); blend(c, x, y, [226, 190, 130], cov(sdS + dw * 0.04) * 0.9 * sb); }
      for (const hx of [cx - sw * 0.32, cx + sw * 0.32])               // chains
        if (Math.abs(x - hx) < 0.6 && y > scy - dh * 0.14 && y < scy - sh / 2) blend(c, x, y, [60, 40, 28], 0.9);
      if (Math.abs(y - (scy - dh * 0.14)) < 0.7 && Math.abs(x - cx) < sw * 0.45) blend(c, x, y, [60, 40, 28], 0.9);
    } else {                                                          // reflection in the wet sand
      const ry = by - (y - by), t = (y - by) / (dh * 0.7);
      if (t >= 1) continue;
      const rx = x + wob(y), fade = (1 - t) ** 1.4 * 0.42;
      const sd = sdRRect(rx, ry, cx, cy, hw, hh, r);
      const a = cov(sd) * fade;
      blend(c, x, y, [150, 96, 62], a);
      if (rx > cx + hw - dw * 0.1) blend(c, x, y, [255, 214, 140], a);
      const g = Math.exp(-(((x - cx) / (dw * 1.6)) ** 2 + ((y - by - dw * 0.5) / (dw * 0.8)) ** 2)) * 0.2;
      blend(c, x, y, [255, 200, 130], g);
    }
  }
}

const rawCrop = (cropX, cropW, w, h) => ff(['-i', basePng, '-vf', `crop=${cropW}:${PH}:${cropX}:0,scale=${w}:${h}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);

function wide(cand) {
  const cw = PH * 16 / 9, cx = Math.max(0, Math.min(PW - cw, cand.wide.cx * PW - cw / 2));
  const c = canvas(WIDE_W, WIDE_H); rawCrop(Math.round(cx), Math.round(cw), WIDE_W, WIDE_H).copy(c.d);
  const s = WIDE_W / cw, d = cand.door;
  drawDoor(c, (d.x * PW - cx) * s, d.y * PH * s, d.w * PW * s);
  return { c, doorCssPx: d.w * PW * s / 2, cx: cx / PW, cw: cw / PW };
}
function tall(cand) {
  const winPx = cand.tall.win * PW, cx = Math.max(0, Math.min(PW - winPx, cand.tall.cx * PW - winPx / 2));
  const s = TALL_W / winPx, bandH = Math.round(PH * s), d = cand.door;
  const top = Math.round(TALL_H * DOOR_BASE_ON_SCREEN - d.y * bandH);
  const band = rawCrop(Math.round(cx), Math.round(winPx), TALL_W, bandH);
  const c = canvas(TALL_W, TALL_H);
  const sky = Buffer.alloc(TALL_W * 4);                              // smoothed top rows, so the extension has no streaks
  for (let x = 0; x < TALL_W; x++) for (let k = 0; k < 3; k++) {
    let sum = 0, n = 0;
    for (let xx = Math.max(0, x - 60); xx <= Math.min(TALL_W - 1, x + 60); xx++) for (let yy = 0; yy < 8; yy++) { sum += band[(yy * TALL_W + xx) * 4 + k]; n++; }
    sky[x * 4 + k] = sum / n;
  }
  for (let y = 0; y < TALL_H; y++) for (let x = 0; x < TALL_W; x++) {
    const by = y - top, o = (y * TALL_W + x) * 4;
    if (by >= 0 && by < bandH) { band.copy(c.d, o, (by * TALL_W + x) * 4, (by * TALL_W + x) * 4 + 4); continue; }
    if (by < 0) {                                                     // extend the sky upward, slightly deeper
      const t = Math.min(1, -by / 260), src = x * 4;
      for (let k = 0; k < 3; k++) c.d[o + k] = sky[src + k] * (1 - 0.22 * t);
    } else for (let k = 0; k < 3; k++) c.d[o + k] = NIGHT[k];         // below the band: footer night colour
  }
  drawDoor(c, (d.x * PW - cx) * s, top + d.y * bandH, d.w * PW * s);
  const hex = (x, m = 1) => '#' + [0, 1, 2].map((k) => Math.round(sky[x * 4 + k] * m).toString(16).padStart(2, '0')).join('');
  const skyHex = [0.05, 0.5, 0.95].map((f) => hex(Math.round(f * (TALL_W - 1)))), skyDarkHex = [0.05, 0.5, 0.95].map((f) => hex(Math.round(f * (TALL_W - 1)), 0.78));
  return { skyHex, skyDarkHex, c, doorCssPx: d.w * PW * s / 2, cx: cx / PW, win: winPx / PW, bandCss: bandH / 2, topCss: top / 2 };
}

const info = {};
for (const cand of CANDIDATES) {
  const w = wide(cand), t = tall(cand);
  encode(w.c.d, w.c.w, w.c.h, path.join(out, `candidate-${cand.id}-wide.png`));
  encode(t.c.d, t.c.w, t.c.h, path.join(out, `candidate-${cand.id}-tall.png`));
  info[cand.id] = { ...cand, wideCrop: { left: +w.cx.toFixed(3), width: +w.cw.toFixed(3) }, wideDoorWidthPx1280: +(w.doorCssPx * 2).toFixed(0),
    tallCrop: { left: +t.cx.toFixed(3), width: +t.win.toFixed(3) }, tallDoorWidthCssPx375: +(t.doorCssPx * 2 / 2).toFixed(1), skyHex: t.skyHex, skyDarkHex: t.skyDarkHex, tallBandCssH: t.bandCss, tallBandTopCss: t.topCss };
}
console.log(JSON.stringify(info, null, 1));

// ---- contact sheet: wide row on top, tall row under it (A, B, C left to right)
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const inputs = [], fc = [];
CANDIDATES.forEach((cd, i) => {
  inputs.push('-i', path.join(out, `candidate-${cd.id}-wide.png`), '-i', path.join(out, `candidate-${cd.id}-tall.png`));
  fc.push(`[${i * 2}:v]scale=640:360[w${i}]`, `[${i * 2 + 1}:v]scale=-1:760[t${i}]`);
});
fc.push('color=c=#14141c:s=1920x1180[bg]');
let last = 'bg';
CANDIDATES.forEach((cd, i) => {
  fc.push(`[${last}][w${i}]overlay=${i * 640}:50[a${i}]`);
  fc.push(`[a${i}][t${i}]overlay=${i * 640 + Math.round((640 - 350) / 2)}:${50 + 360 + 50}[b${i}]`);
  fc.push(`[b${i}]drawtext=${font}:text='${cd.id}  ${cd.name}':fontcolor=white:fontsize=30:x=${i * 640 + 16}:y=10[c${i}]`);
  last = `c${i}`;
});
ff([...inputs, '-filter_complex', fc.join(';'), '-map', `[${last}]`, '-frames:v', '1', path.join(out, 'contact-sheet.png')]);
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
