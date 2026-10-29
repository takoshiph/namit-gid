// Outlines the door sign's "Namit gid" lettering into paths in Young Serif.
// An SVG shown through <img> can't load web fonts, so live <text> there
// falls back to Georgia; paths look the same everywhere.
//
//   npm i opentype.js@1.3.4   (anywhere on NODE_PATH)
//   node tools/sign-text.js <YoungSerif-Regular.ttf> namit-gid-site/assets/img/dusk/sign.svg
//
// The font is the one Google Fonts serves for family=Young+Serif
// (github.com/google/fonts ofl/youngserif/YoungSerif-Regular.ttf).
// Replaces each <text>…</text> in the sign with a <g> of glyph paths at the
// same anchor (text-anchor middle at x, baseline y), size and colours.
// Re-running on an outlined sign changes nothing.
const fs = require('fs');
const opentype = require('opentype.js');

const [fontPath, svgPath] = process.argv.slice(2);
if (!fontPath || !svgPath) { console.error('usage: node tools/sign-text.js <font.ttf> <sign.svg>'); process.exit(1); }
const font = opentype.loadSync(fontPath);
let svg = fs.readFileSync(svgPath, 'utf8');

const attr = (s, name) => { const m = s.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const r = n => +n.toFixed(2);
let count = 0;
svg = svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (_, attrs, body) => {
  count++;
  const x = +attr(attrs, 'x'), y = +attr(attrs, 'y'), size = +attr(attrs, 'font-size');
  const fill = attr(attrs, 'fill'), opacity = attr(attrs, 'opacity'), filter = attr(attrs, 'filter');
  // runs of [text, fill]: plain text takes the <text>'s fill, a <tspan> its own
  const runs = [];
  body.replace(/<tspan\b([^>]*)>([^<]*)<\/tspan>|([^<]+)/g, (m, tAttrs, tText, plain) => {
    if (plain !== undefined) runs.push([plain, fill]);
    else runs.push([tText, attr(tAttrs, 'fill') || fill]);
    return m;
  });
  const text = runs.map(([t]) => t).join('');
  const opts = { kerning: true };
  const width = font.getAdvanceWidth(text, size, opts);
  const x0 = x - width / 2; // text-anchor="middle"
  // each glyph's colour, by its character's run
  const colours = runs.flatMap(([t, f]) => [...t].map(() => f));
  const byFill = new Map();
  let i = 0;
  font.forEachGlyph(text, x0, y, size, opts, (glyph, gx, gy) => {
    const d = glyph.getPath(gx, gy, size).toPathData(2);
    const f = colours[i++];
    if (d) byFill.set(f, (byFill.get(f) || '') + d);
  });
  const g = [`<g aria-label="${text.trim()}"`];
  if (opacity) g.push(` opacity="${opacity}"`);
  if (filter) g.push(` filter="${filter}"`);
  g.push('>');
  for (const [f, d] of byFill) g.push(`<path fill="${f}" d="${d}"/>`);
  g.push('</g>');
  console.log(`"${text}": ${r(width)} wide, from x ${r(x0)} to ${r(x0 + width)}, baseline ${y}, size ${size}`);
  return g.join('');
});
svg = svg.replace("Text uses Young Serif if loaded, else Georgia.", "The lettering is Young Serif, outlined to paths by tools/sign-text.js (an SVG in <img> can't load web fonts).");
fs.writeFileSync(svgPath, svg);
console.log(count ? `outlined ${count} text element(s)` : 'no <text> left: already outlined');
