// Makes the sign painting without its crossbar, ropes and vine.
const { execFileSync } = require('child_process');
const FF = 'C:/Users/elvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/';
const [, , src, out] = process.argv;
const W = 1000, H = 809, TOP = 196;
const px = new Uint8Array(execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 }));
const at = (x, y) => (y * W + x) * 4;
const copy = (x, y, sx) => { const a = at(x, y), b = at(sx, y); for (let k = 0; k < 4; k++) px[a + k] = px[b + k]; };
// 1. nothing above the board
for (let y = 0; y < TOP; y++) for (let x = 0; x < W; x++) px[at(x, y) + 3] = 0;
// 2. the vine on the left hangs beside the board, never on it: drop leaf-coloured
//    pixels (green or grey-green and not a pale highlight; the wood is always
//    much redder) and their fringe, and anything left of the board's edge (x 56)
const leaf = new Uint8Array(W * H);
for (let y = TOP; y < 360; y++) for (let x = 0; x < 170; x++) {
  const i = at(x, y);
  if (x < 56 || (px[i + 3] > 20 && px[i + 1] > px[i] - 25 && px[i] + px[i + 1] + px[i + 2] < 600)) leaf[y * W + x] = 1;
}
for (let y = TOP; y < 360; y++) for (let x = 0; x < 170; x++) {
  let near = 0;
  for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (leaf[(y + dy) * W + x + dx]) { near = 1; break; }
  const i = at(x, y);
  if (leaf[y * W + x] || (near && px[i + 3] < 255)) px[i + 3] = 0;
}
// 3. the rope stubs and their holes: wood from beside them, blended at the sides
for (const [x0, x1] of [[176, 228], [810, 862]]) for (let y = TOP; y < 272; y++) for (let x = x0; x < x1; x++) {
  const sx = x0 < 500 ? x + 70 : x - 70, t = Math.min(1, (x - x0) / 6, (x1 - 1 - x) / 6);
  const a = at(x, y), b = at(sx, y);
  for (let k = 0; k < 3; k++) px[a + k] = Math.round(px[a + k] * (1 - t) + px[b + k] * t);
  px[a + 3] = Math.round(px[a + 3] * (1 - t) + px[b + 3] * t);
}
execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-c:v', 'libwebp', '-quality', '88', out], { input: Buffer.from(px.buffer) });
console.log('wrote', out);
