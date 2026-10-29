// The intro's dawn sea and sand, sampled from the dusk painting and regraded to dawn, so at
// nightfall they become the painting's own. Writes three images next to the painting:
//   dawn-sand.webp   the sand below the waterline (y .74-1): its texture, gradient-mapped to dawn
//   dawn-pool.webp   the wet, sky-reflecting pool (x .2-.8, y .74-.85), with alpha, in the dawn sky's colours
//   dawn-waves.webp  the sea's brushwork (y .558-.74) as strokes with alpha: light crests and dark troughs
//   node tools/dawn-grade.js namit-gid-site/assets/img/dusk/beach-2400.webp namit-gid-site/assets/img/dusk
const { execFileSync } = require('child_process');
const path = require('path');
const FF = 'C:/Users/elvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/';
const [, , src, outDir] = process.argv, W = 2400, H = 1018;
const HORIZON = .558, SHORE = .74, POOL = { x0: .2, x1: .8, y0: .74, y1: .85 }; // fractions of the painting (as in playIntro)
const px = new Uint8Array(execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 29 }));
// The dawn has no palms: paint over their trunks (left, from the horizon to below the
// waterline) with the sea and sand a little to their right, feathered into the painting.
{
  const X1 = Math.round(.2 * W), SHIFT = Math.round(.19 * W), Y0 = Math.round(HORIZON * H) - 3, Y1 = Math.round(.84 * H), F = 110;
  for (let y = Y0; y < Y1; y++) for (let x = 0; x < X1; x++) {
    const t = Math.min(1, (X1 - x) / F, (Y1 - y) / (F / 2)), i = (y * W + x) * 3, j = (y * W + x + SHIFT) * 3;
    for (let k = 0; k < 3; k++) px[i + k] = px[i + k] + (px[j + k] - px[i + k]) * t;
  }
}
const lum = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) lum[i] = .3 * px[i * 3] + .59 * px[i * 3 + 1] + .11 * px[i * 3 + 2];

// separable box blur of a w*h float field (optionally weighted), radius rx, ry
function blur(f, w, h, rx, ry, wt) {
  const num = new Float32Array(w * h), den = new Float32Array(w * h), tn = new Float32Array(w * h), td = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const k = wt ? wt[i] : 1; num[i] = f[i] * k; den[i] = k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0, b = 0; for (let d = -rx; d <= rx; d++) { const xx = Math.min(w - 1, Math.max(0, x + d)), j = y * w + xx; a += num[j]; b += den[j]; }
    tn[y * w + x] = a; td[y * w + x] = b;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0, b = 0; for (let d = -ry; d <= ry; d++) { const yy = Math.min(h - 1, Math.max(0, y + d)), j = yy * w + x; a += tn[j]; b += td[j]; }
    out[y * w + x] = b > 0 ? a / b : 0;
  }
  return out;
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// gradient map: stops [[lum, [r,g,b]], ...]
const gmap = (stops, l) => {
  if (l <= stops[0][0]) return stops[0][1];
  for (let s = 1; s < stops.length; s++) if (l <= stops[s][0]) {
    const [l0, c0] = stops[s - 1], [l1, c1] = stops[s], t = (l - l0) / (l1 - l0);
    return c0.map((c, k) => c + (c1[k] - c) * t);
  }
  return stops.at(-1)[1];
};
function save(name, data, w, h, ow, alpha, q) {
  const out = path.join(outDir, name);
  execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', alpha ? 'rgba' : 'rgb24', '-s', `${w}x${h}`, '-i', '-',
    '-vf', `scale=${ow}:-1:flags=lanczos`, '-c:v', 'libwebp', '-quality', String(q), ...(alpha ? ['-pix_fmt', 'yuva420p'] : []), out], { input: Buffer.from(data.buffer) });
  console.log(name, require('fs').statSync(out).size + ' B');
}

// ── sand: y SHORE..1, the painting's texture lifted into early light ──
const sy0 = Math.round(SHORE * H), sh = H - sy0;
const SAND = [[15, [128, 92, 84]], [45, [168, 128, 110]], [80, [203, 167, 142]], [115, [226, 198, 170]], [170, [240, 216, 190]], [240, [250, 232, 208]]];
const sand = new Uint8Array(W * sh * 3);
let bot = [0, 0, 0];
for (let y = 0; y < sh; y++) for (let x = 0; x < W; x++) {
  const i = (y + sy0) * W + x, c = gmap(SAND, lum[i]), r = px[i * 3], b = px[i * 3 + 2];
  // keep a trace of the painting's own hue shifts (warm patches warmer)
  const warm = (r - b) * .12;
  const o = (y * W + x) * 3; sand[o] = Math.min(255, c[0] + warm); sand[o + 1] = c[1]; sand[o + 2] = Math.max(0, c[2] - warm);
  if (y === sh - 1) { bot[0] += sand[o]; bot[1] += sand[o + 1]; bot[2] += sand[o + 2]; }
}
console.log('sand bottom avg', bot.map(v => Math.round(v / W)));
save('dawn-sand.webp', sand, W, sh, 1600, false, 72);

// ── pool: bright and warm where the painting's pool is; the dawn sky in it ──
const px0 = Math.round(POOL.x0 * W), px1 = Math.round(POOL.x1 * W), py0 = Math.round(POOL.y0 * H), py1 = Math.round(POOL.y1 * H);
const pw = px1 - px0, ph = py1 - py0, pm = new Float32Array(pw * ph);
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
  const i = (y + py0) * W + x + px0, r = px[i * 3], b = px[i * 3 + 2], l = lum[i];
  pm[y * pw + x] = smooth(128, 165, l) * (r >= b - 12 || l > 190 ? 1 : .25) * smooth(0, 6, y) * smooth(0, 30, x) * smooth(0, 30, pw - 1 - x) * smooth(0, 8, ph - 1 - y); // the sea's edge above is not pool; feathered at the box
}
const pa = blur(blur(pm, pw, ph, 2, 1), pw, ph, 2, 1);
const SKY = [[130, [222, 140, 120]], [165, [236, 160, 126]], [195, [248, 194, 140]], [225, [255, 222, 178]], [250, [255, 238, 206]]];
const pool = new Uint8Array(pw * ph * 4);
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
  const i = (y + py0) * W + x + px0, c = gmap(SKY, lum[i]), o = (y * pw + x) * 4;
  pool[o] = c[0]; pool[o + 1] = c[1]; pool[o + 2] = c[2]; pool[o + 3] = Math.round(Math.min(1, pa[y * pw + x] * 1.1) * 255);
}
save('dawn-pool.webp', pool, pw, ph, 1200, true, 78);

// ── waves: the sea's strokes, light crests and dark troughs, against the local mean ──
const wy0 = Math.round(HORIZON * H), wh = sy0 - wy0, sea = new Float32Array(W * wh), keep = new Float32Array(W * wh);
for (let y = 0; y < wh; y++) for (let x = 0; x < W; x++) { const i = (y + wy0) * W + x; sea[y * W + x] = lum[i]; keep[y * W + x] = lum[i] > 55 ? 1 : 0; }
// the palm trunks cross the sea on the left: leave them (and a margin) out
const trunk = blur(keep.map(k => 1 - k), W, wh, 4, 3);
const mean = blur(sea, W, wh, 28, 3, keep);
const waves = new Uint8Array(W * wh * 4);
for (let y = 0; y < wh; y++) for (let x = 0; x < W; x++) {
  const j = y * W + x, d = sea[j] - mean[j], o = j * 4, ok = trunk[j] < .02 ? 1 : 0;
  const depth = y / wh; // strokes grow more definite toward the shore
  const crest = smooth(4, 26, d) * (.5 + .35 * depth) * ok, trough = smooth(5, 28, -d) * (.3 + .25 * depth) * ok;
  if (crest >= trough) { waves[o] = 255; waves[o + 1] = 226; waves[o + 2] = 198; waves[o + 3] = Math.round(crest * 255); }
  else { waves[o] = 22; waves[o + 1] = 48; waves[o + 2] = 66; waves[o + 3] = Math.round(trough * 255); }
}
save('dawn-waves.webp', waves, W, wh, 1400, true, 66);
