// Turns loose character images (AI-generated or painted) into game sprite sheets.
//
//   node tools/make-sprites.mjs art/street        (reads art/street/sprite-src.json)
//
// sprite-src.json:
// {
//   "id": "cat-street-ginger",            folder name under public/sprites/
//   "frame": 320 (frame height; width = frame × aspect, default 1.5 for side views), "height": 80, "fill": 0.84, "anchorY": 0.92,
//   "animations": {
//     "idle": { "fps": 2, "rows": { "S": ["idle_front.png"], "SE": [...], "E": [...], "NE": [...], "N": [...] } },
//     "walk": { "fps": 6, "rows": { "SE": ["walk_1.png", "walk_3.png"] } }
//   }
// }
// Rows are S, SE, E, NE, N (the game mirrors them for W, NW, SW). A direction with no images for an animation
// falls back to that direction's idle images. Images can have real transparency, or a plain black / dark /
// checkerboard background, which is keyed out. Every frame is scaled by the same rule (cat height = fill × frame)
// and placed with its feet on the same anchor line.
import fs from 'node:fs'; import path from 'node:path'; import { PNG } from 'pngjs';

const dir = process.argv[2]; if (!dir) { console.error('usage: node tools/make-sprites.mjs <art folder>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'sprite-src.json'), 'utf8'));
const F = cfg.frame || 320, FW = Math.round(F * (cfg.aspect || 1.5)), FILL = cfg.fill || .84, AY = cfg.anchorY || .92, ROWS = ['S', 'SE', 'E', 'NE', 'N'];
const outDir = path.join('public/sprites', cfg.id); fs.mkdirSync(outDir, { recursive: true });

// ---------- image helpers (float RGBA, straight alpha 0..1) ----------
function load(file) { const p = PNG.sync.read(fs.readFileSync(path.join(dir, file))); const n = p.width * p.height, d = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) d[i] = p.data[i] / 255; return { w: p.width, h: p.height, d }; }
const lum = (d, i) => .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2];
const sat = (d, i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);

// opaque image on a dark / checkerboard background: flood-fill the background from the borders
function keyBackground(img) { const { w, h, d } = img, n = w * h, bg = new Uint8Array(n), st = [];
  const isBg = i => sat(d, i * 4) < .09 && lum(d, i * 4) < .36;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  // soft edge: foreground pixels touching the background get alpha from how far they are from the background colour
  for (let i = 0; i < n; i++) { if (bg[i]) { d[i * 4 + 3] = 0; continue; }
    const x = i % w; let edge = false;
    for (let dy = -3; dy <= 3 && !edge; dy++) for (let dx = -3; dx <= 3; dx++) { const j = i + dy * w + dx; if (j >= 0 && j < n && Math.abs((j % w) - x) <= 3 && bg[j]) { edge = true; break; } }
    // near the background, dark low-saturation pixels are fur blended with black: fade them out
    if (edge) { const s = sat(d, i * 4), l = lum(d, i * 4); d[i * 4 + 3] = Math.min(1, Math.max(s / .3, (l - .12) / .38, 0)); } else d[i * 4 + 3] = 1; }
  return img; }

// keep the main body (and anything sizeable): drops specks, stray halo bits and generator watermarks
function keepMain(img) { const { w, h, d } = img, n = w * h, lab = new Int32Array(n), sizes = [0]; let L = 0;
  for (let s = 0; s < n; s++) { if (lab[s] || d[s * 4 + 3] < .2) continue; L++; let c = 0; const st = [s]; lab[s] = L;
    while (st.length) { const i = st.pop(); c++; const x = i % w;
      for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < n && Math.abs((j % w) - x) <= 1 && !lab[j] && d[j * 4 + 3] >= .2) { lab[j] = L; st.push(j); } }
    sizes.push(c); }
  const big = Math.max(...sizes), keep = sizes.map(c => c >= big * .004);
  // faint pixels (< .2) next to a kept component stay; the rest of the faint haze goes
  for (let i = 0; i < n; i++) { const l = lab[i]; if (l ? !keep[l] : d[i * 4 + 3] > 0 && !nearKept(i)) d[i * 4 + 3] = 0; }
  function nearKept(i) { const x = i % w; for (const j of [i - 1, i + 1, i - w, i + w, i - 2, i + 2, i - 2 * w, i + 2 * w]) if (j >= 0 && j < n && Math.abs((j % w) - x) <= 2 && lab[j] && keep[lab[j]]) return true; return false; }
  return img; }

// tighten the alpha ramp and replace edge colours with the nearest solid fur colour (kills red / yellow / black fringes)
function cleanEdges(img) { const { w, h, d } = img, n = w * h;
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3]; d[i * 4 + 3] = a < .12 ? 0 : a > .9 ? 1 : (a - .12) / .78; }
  let solid = new Uint8Array(n); for (let i = 0; i < n; i++) solid[i] = d[i * 4 + 3] >= .95 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) { const nx = solid.slice();
    for (let i = 0; i < n; i++) { if (solid[i] || d[i * 4 + 3] === 0) continue; const x = i % w; let r = 0, g = 0, b = 0, c = 0;
      for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) if (j >= 0 && j < n && Math.abs((j % w) - x) <= 1 && solid[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; c++; }
      if (c) { d[i * 4] = r / c; d[i * 4 + 1] = g / c; d[i * 4 + 2] = b / c; nx[i] = 1; } }
    solid = nx; }
  return img; }

function bbox(img) { const { w, h, d } = img; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > .3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // horizontal centre of the feet: the opaque span in the lowest 6 % of the figure
  let fx0 = w, fx1 = -1; const fy = y1 - Math.max(2, (y1 - y0) * .06);
  for (let y = Math.floor(fy); y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > .5) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
  return { x0, y0, x1, y1, feet: fx1 >= fx0 ? (fx0 + fx1) / 2 : (x0 + x1) / 2 }; }

// area-weighted resample (premultiplied) of source region into a dest box, written into the sheet
function blit(img, b, sheet, SW, ox, oy) { const { w, d } = img, ch = b.y1 - b.y0 + 1, scale = (F * FILL) / ch;
  const dx0 = ox + FW / 2 - (b.feet - b.x0) * scale, dy0 = oy + F * AY - ch * scale;   // feet centre -> anchor
  const sx = x => b.x0 + (x - dx0) / scale, sy = y => b.y0 + (y - dy0) / scale;
  for (let y = oy; y < oy + F; y++) { const ya = sy(y), yb = sy(y + 1); if (yb <= b.y0 || ya >= b.y1 + 1) continue;
    for (let x = ox; x < ox + FW; x++) { const xa = sx(x), xb = sx(x + 1); if (xb <= b.x0 || xa >= b.x1 + 1) continue;
      let r = 0, g = 0, bl = 0, a = 0, wt = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) { const wy = Math.min(yb, yy + 1) - Math.max(ya, yy); if (yy < 0 || yy >= img.h) continue;
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) { const wx = Math.min(xb, xx + 1) - Math.max(xa, xx); if (xx < 0 || xx >= w) continue;
          const k = wx * wy, i = (yy * w + xx) * 4, al = d[i + 3] * k; r += d[i] * al; g += d[i + 1] * al; bl += d[i + 2] * al; a += al; wt += k; } }
      if (!wt || a <= 0) continue; const o = (y * SW + x) * 4; sheet[o] = r / a; sheet[o + 1] = g / a; sheet[o + 2] = bl / a; sheet[o + 3] = a / wt; } } }

function savePNG(file, buf, W, H) { const p = new PNG({ width: W, height: H }); for (let i = 0; i < W * H * 4; i++) p.data[i] = Math.round(Math.min(1, Math.max(0, buf[i])) * 255);
  fs.writeFileSync(file, PNG.sync.write(p)); }

// ---------- build ----------
const cache = {};
function prepared(file) { if (cache[file]) return cache[file]; let img = load(file); const tr = img.d.filter((v, i) => i % 4 === 3 && v === 0).length / (img.w * img.h);
  if (tr < .05) keyBackground(img); keepMain(img); cleanEdges(img); img.b = bbox(img);
  console.log(`  ${file}: ${img.w}x${img.h} ${tr < .05 ? 'keyed background' : 'own transparency'}, figure ${img.b.x1 - img.b.x0 + 1}x${img.b.y1 - img.b.y0 + 1}`);
  return cache[file] = img; }

const idleRows = cfg.animations.idle.rows, manifest = { frameWidth: FW, frameHeight: F, height: cfg.height || 80, anchor: [.5, AY], directions: 8, mirror: true, animations: {} };
if (cfg.shadow) manifest.shadow = cfg.shadow;
for (const [name, an] of Object.entries(cfg.animations)) {
  const rows = ROWS.map(r => (an.rows[r] && an.rows[r].length ? an.rows[r] : idleRows[r]) || idleRows.SE || Object.values(idleRows)[0]);
  const frames = Math.max(...rows.map(r => r.length)), SW = FW * frames, SH = F * ROWS.length, sheet = new Float32Array(SW * SH * 4);
  console.log(`${name}: ${frames} frame(s)`);
  rows.forEach((files, r) => { for (let f = 0; f < frames; f++) { const img = prepared(files[f % files.length]); blit(img, img.b, sheet, SW, f * FW, r * F); } });
  const file = name + '.png'; savePNG(path.join(outDir, file), sheet, SW, SH);
  manifest.animations[name] = { file, frames, fps: an.fps || 6, ...(an.loop === false ? { loop: false } : {}) };
}
fs.writeFileSync(path.join(outDir, 'sprite.json'), JSON.stringify(manifest, null, 2));
const idxFile = 'public/sprites/index.json', idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
if (!idx.characters.includes(cfg.id)) { idx.characters.push(cfg.id); fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2) + '\n'); }
console.log('wrote', outDir);
