// Leny's kitchen friends: the cat gets white spots and a red collar, and the
// fuzzballs come off the pan, toasted brown like latik. Both lose the
// checkerboard painted in behind them.
//   node tools/kitchen-friends.js <ai folder> <out folder>
const { execFileSync } = require('child_process');
const path = require('path');
const FF = 'C:/Users/elvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/';
const [, , AI, OUT] = process.argv;

function load(f) {
  const [W, H] = execFileSync(FF + 'ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);
  return { W, H, px: new Uint8Array(execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 })) };
}
function save(img, f) {
  const args = ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${img.W}x${img.H}`, '-i', '-'];
  if (f.endsWith('.webp')) args.push('-c:v', 'libwebp', '-quality', '86');
  execFileSync(FF + 'ffmpeg', [...args, f], { input: Buffer.from(img.px.buffer) });
}

// the checkerboard: light, colourless pixels joined to the edges
function key({ W, H, px }, seeds = []) {
  const bg = i => { const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mn > 168 && mx - mn < 22; };
  const seen = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  for (const [x, y] of seeds) st.push(y * W + x);   // pockets the edges can't reach
  while (st.length) {
    const p = st.pop(); if (seen[p]) continue; seen[p] = 1;
    if (!bg(p * 4)) continue;
    px[p * 4 + 3] = 0;
    const x = p % W;
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1);
    if (p >= W) st.push(p - W); if (p < W * (H - 1)) st.push(p + W);
  }
  const a = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) a[p] = px[p * 4 + 3];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x; if (!a[p]) continue;
    let z = 0; for (const q of [p - 1, p + 1, p - W, p + W]) if (!a[q]) z++;
    if (z) px[p * 4 + 3] = z >= 2 ? 90 : 170;
  }
}
// smallest box around what's left, plus a margin
function crop({ W, H, px }, x0 = 0, y0 = 0, x1 = W, y1 = H, m = 6) {
  let a = x1, b = y1, c = x0, d = y0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4 + 3] > 40) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  a = Math.max(x0, a - m); b = Math.max(y0, b - m); c = Math.min(x1 - 1, c + m); d = Math.min(y1 - 1, d + m);
  const w = c - a + 1, h = d - b + 1, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(px.subarray(((b + y) * W + a) * 4, ((b + y) * W + a + w) * 4), y * w * 4);
  return { W: w, H: h, px: out };
}
const lum = (px, i) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
const sat = (px, i) => Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
// soft ellipse weight: 1 inside, fading to 0 over the outer 25%
const ell = (x, y, [cx, cy, rx, ry]) => { const d = Math.hypot((x - cx) / rx, (y - cy) / ry); return d >= 1 ? 0 : d < .75 ? 1 : (1 - d) / .25; };

// ── the cat ────────────────────────────────────────────────────────────────
{
  const cat = load(path.join(AI, 'sitting-jiji.jpg'));
  // the gap inside the curled tail
  key(cat, Array.from({ length: 30 }, (_, k) => [480 + k * 5, 692]));
  const { W, px } = cat;
  const CREAM = [246, 238, 224];
  const spots = [
    [762, 318, 52, 34],   // muzzle and chin
    [748, 450, 62, 92],   // bib
    [712, 700, 40, 26],   // left front paw
    [792, 696, 40, 26],   // right front paw
    [462, 688, 40, 30],   // tail tip
  ];
  for (let y = 0; y < cat.H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (px[i + 3] < 40) continue;
    const w = Math.max(...spots.map(s => ell(x, y, s))); if (!w) continue;
    const L = lum(px, i); if (L > 95 || sat(px, i) > 40) continue;      // fur only: not eyes, nose, whiskers
    const t = L < 16 ? 0.45 : 0.72 + 0.28 * Math.min(1, L / 80);       // keep the drawn lines darker
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - w) + CREAM[k] * t * w);
  }
  // red collar and a gold bell
  for (let x = 640; x <= 860; x++) {
    const yc = 368 + ((x - 752) / 100) ** 2 * 18;
    for (let y = Math.round(yc - 8); y <= yc + 8; y++) {
      const i = (y * W + x) * 4; if (px[i + 3] < 120) continue;
      const shade = 1 - Math.abs(y - yc) / 16;
      px[i] = Math.round(150 + 40 * shade); px[i + 1] = Math.round(36 + 14 * shade); px[i + 2] = Math.round(32 + 10 * shade);
    }
  }
  for (let y = 370; y < 404; y++) for (let x = 736; x < 770; x++) {
    const d = Math.hypot(x - 752, y - 388); if (d > 12) continue;
    const i = (y * W + x) * 4, hi = Math.max(0, 1 - Math.hypot(x - 748, y - 384) / 8);
    const edge = d > 10.5 ? 0.6 : 1;
    px[i] = Math.round((196 + 50 * hi) * edge); px[i + 1] = Math.round((150 + 70 * hi) * edge); px[i + 2] = Math.round((50 + 80 * hi) * edge); px[i + 3] = 255;
    if (y > 391 && y < 394 && Math.abs(x - 752) < 7) { px[i] = 90; px[i + 1] = 62; px[i + 2] = 24; }
  }
  save(crop(cat), path.join(OUT, 'cat.png'));
}

// ── the fuzzballs ──────────────────────────────────────────────────────────
{
  const pan = load(path.join(AI, 'pan-with-soot-sprites.jpg'));
  key(pan);
  const TOAST = [150, 96, 52];
  const { W, px } = pan;
  for (let p = 0; p < W * pan.H; p++) {
    const i = p * 4; if (px[i + 3] < 40) continue;
    const L = lum(px, i); if (L > 70) continue;                     // dark fuzz and limbs, not eyes
    const t = 0.35 + 0.9 * (L / 70);
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.round(TOAST[k] * t));
  }
  // the two that are off the pan: one jumping, one waving
  save(crop(pan, 230, 50, 480, 270), path.join(OUT, 'fuzz-jump.png'));
  save(crop(pan, 948, 430, 1150, 650), path.join(OUT, 'fuzz-wave.png'));
}
console.log('done');
