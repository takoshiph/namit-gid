#!/usr/bin/env node
// Generate or edit a painting with the Gemini API, so prompts and results no
// longer go back and forth by hand. Claude writes the prompt, runs this, looks
// at the result and cuts layers from it with the usual scripts.
//
//   node tools/gemini-image.mjs --prompt "..." [--ref base.jpg --ref other.png]
//        [--n 2] [--aspect 16:9] [--size 2K] [--model gemini-nano-banana-2.1]
//        [--out DIR] [--name kitchen-edit] [--dry]
//   --prompt-file p.txt   read the prompt from a file instead
//   --dry                 print the request (without image bytes) and stop; no key needed
//
// The key is read from GEMINI_API_KEY, or else from the first line of
// ~/.config/gemini/key. It is never printed, logged or written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = { ref: [], n: 1, model: 'gemini-nano-banana-2.1', out: path.join(os.homedir(), 'Downloads/takoshi-media/ai') };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = () => args[++i];
  if (a === '--prompt') opt.prompt = v();
  else if (a === '--prompt-file') opt.prompt = fs.readFileSync(v(), 'utf8').trim();
  else if (a === '--ref') opt.ref.push(v());
  else if (a === '--n') opt.n = Math.max(1, Math.min(4, +v() || 1));
  else if (a === '--aspect') opt.aspect = v();
  else if (a === '--size') opt.size = v().toUpperCase();
  else if (a === '--model') opt.model = v();
  else if (a === '--out') opt.out = v();
  else if (a === '--name') opt.name = v();
  else if (a === '--dry') opt.dry = true;
  else { console.error('unknown option ' + a); process.exit(2); }
}
if (!opt.prompt) { console.error('--prompt or --prompt-file is required'); process.exit(2); }

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const refs = opt.ref.map(f => {
  const mimeType = MIME[path.extname(f).toLowerCase()];
  if (!mimeType) throw new Error('reference must be png, jpg or webp: ' + f);
  return { file: f, mimeType, data: fs.readFileSync(f).toString('base64') };
});
const body = {
  contents: [{ role: 'user', parts: [{ text: opt.prompt }, ...refs.map(r => ({ inlineData: { mimeType: r.mimeType, data: r.data } }))] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    ...(opt.aspect || opt.size ? { imageConfig: { ...(opt.aspect && { aspectRatio: opt.aspect }), ...(opt.size && { imageSize: opt.size }) } } : {}),
  },
};
if (opt.dry) {
  const shown = JSON.parse(JSON.stringify(body));
  shown.contents[0].parts.forEach((p, i) => { if (p.inlineData) p.inlineData.data = `<${refs[i - 1].file}, ${Math.round(refs[i - 1].data.length * .75 / 1024)} KB>`; });
  console.log(JSON.stringify({ model: opt.model, n: opt.n, out: opt.out, body: shown }, null, 2));
  process.exit(0);
}

function readKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try { return fs.readFileSync(path.join(os.homedir(), '.config/gemini/key'), 'utf8').split(/\r?\n/)[0].trim(); } catch { return ''; }
}
const key = readKey();
if (!key) { console.error('No key: set GEMINI_API_KEY or put it in ~/.config/gemini/key'); process.exit(1); }

// Any image in the reply, wherever the API puts it (inlineData or inline_data).
function images(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  const d = node.inlineData || node.inline_data;
  if (d && d.data && /^image\//.test(d.mimeType || d.mime_type || '')) found.push(d);
  for (const v of Object.values(node)) if (v && typeof v === 'object' && v !== d) images(v, found);
  return found;
}

fs.mkdirSync(opt.out, { recursive: true });
const slug = (opt.name || opt.prompt.slice(0, 40)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opt.model)}:generateContent`;
let saved = 0;
for (let i = 1; i <= opt.n; i++) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`attempt ${i}: HTTP ${res.status} ${data?.error?.status || ''} ${data?.error?.message || ''}`.trim()); continue; }
  const imgs = images(data);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join(' ');
  if (!imgs.length) { console.error(`attempt ${i}: no image returned. ${data.candidates?.[0]?.finishReason || ''} ${text}`.trim()); continue; }
  for (const [j, im] of imgs.entries()) {
    const ext = (im.mimeType || im.mime_type) === 'image/jpeg' ? '.jpg' : '.png';
    const file = path.join(opt.out, `${slug}-${stamp}-${i}${imgs.length > 1 ? '-' + (j + 1) : ''}${ext}`);
    fs.writeFileSync(file, Buffer.from(im.data, 'base64'));
    // the prompt next to the picture, so a good result can be traced and repeated
    fs.writeFileSync(file.replace(/\.\w+$/, '.json'), JSON.stringify({ model: opt.model, prompt: opt.prompt, refs: opt.ref, aspect: opt.aspect, size: opt.size, note: text || undefined }, null, 2));
    console.log('saved ' + file);
    saved++;
  }
}
process.exit(saved ? 0 : 1);
