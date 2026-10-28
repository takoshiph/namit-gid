// Night grade of the dusk beach: cooler, darker, a sprinkle of stars. Keeps the paper grain.
//   node tools/night-grade.js in.webp out.webp
const { execFileSync } = require('child_process');
const FF = 'C:/Users/elvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/';
const [, , src, out] = process.argv, W = 2400, H = 1018;
const px = new Uint8Array(execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-i', src, '-vf', 'format=rgb24,colorchannelmixer=rr=0.28:gg=0.38:bb=0.68:rb=0.05:gb=0.06,eq=brightness=0.01:saturation=0.8', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 29 }));
let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let y = 0; y < 600; y++) for (let x = 0; x < W; x++) { // deeper sky toward the top
  const i = (y * W + x) * 4, k = 1 - 0.28 * (1 - y / 600);
  px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
}
let n = 0;
for (let t = 0; t < 4000 && n < 140; t++) {
  const x = 4 + (rnd() * (W - 8)) | 0, y = 4 + (Math.pow(rnd(), 1.3) * 470) | 0, i = (y * W + x) * 4;
  if (px[i + 2] < px[i] + 20 || px[i + 2] + px[i] + px[i + 1] < 170) continue;   // sky only, not palms/clouds-dark
  const near = (dx, dy) => { const j = ((y + dy) * W + x + dx) * 4; return px[j + 2] + px[j] + px[j + 1]; };
  if (near(-9, 0) < 150 || near(9, 0) < 150 || near(0, -9) < 150) continue;
  const b = 120 + rnd() * 135, big = rnd() > 0.88 ? 1 : 0, fade = 1 - y / 520;
  for (let dy = -big; dy <= big; dy++) for (let dx = -big; dx <= big; dx++) {
    const j = ((y + dy) * W + x + dx) * 4, w = (dx || dy ? 0.4 : 1) * (b / 255) * fade;
    px[j] = Math.min(255, px[j] + 230 * w); px[j + 1] = Math.min(255, px[j + 1] + 230 * w); px[j + 2] = Math.min(255, px[j + 2] + 245 * w);
  }
  n++;
}
execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-c:v', 'libwebp', '-quality', '84', out], { input: Buffer.from(px.buffer) });
console.log('stars', n);
