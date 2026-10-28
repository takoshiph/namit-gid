// Cuts a figure from a flat magenta (#FF00FF) background: soft alpha, despilled edges, cropped to the figure.
//   node tools/magenta-key.js in.jpg out.webp [maxHeight]
const { execFileSync } = require('child_process');
const FF = 'C:/Users/elvin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/';
const [, , src, out, maxH = '1500'] = process.argv;
const probe = execFileSync(FF + 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).toString().trim().split(',').map(Number);
const [W, H] = probe;
const px = new Uint8Array(execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 29 }));
// background colour = average of the four corners (generated magentas are not always exactly #FF00FF)
const cs=[0,W-1,(H-1)*W,H*W-1].map(p=>p*4), bg=[0,1,2].map(k=>cs.reduce((t,i)=>t+px[i+k],0)/4);
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let p = 0; p < W * H; p++) {
  const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2];
  const m = Math.min(r, b) - g, d = Math.hypot(r-bg[0], g-bg[1], b-bg[2]);   // magentaness, distance to bg
  const a = Math.max(0, Math.min(1, Math.max((d - 45) / 90, 1 - (m - 50) / 110 < 1 ? Math.min(1,(d-45)/90) : 1)));
  if (a < 1) {                                        // despill: pull red/blue toward green
    const lim = g + 30;
    if (r > lim) px[i] = Math.round(r - (r - lim) * (1 - a * 0.5));
    if (b > lim) px[i + 2] = Math.round(b - (b - lim) * (1 - a * 0.5));
  }
  px[i + 3] = Math.round(a * 255);
  if (a > .3) { const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
const w = x1 - x0 + 1, h = y1 - y0 + 1, o = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++) o.set(px.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
const s = Math.min(1, +maxH / h), ow = Math.round(w * s), oh = Math.round(h * s);
execFileSync(FF + 'ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-vf', `scale=${ow}:${oh}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '88', out], { input: Buffer.from(o.buffer) });
console.log('wrote', out, ow + 'x' + oh);
