// Generates the rigged character models (public/models/*.glb).
//
// Starts the Vite dev server, opens the game's #bake mode in headless Chrome (the bake needs WebGL and
// canvas), and saves every exported .glb. Each file holds a skeleton, skinned meshes with named material
// slots, and baked animation clips. Re-run after changing a character's design in src/game/engine.js.
//
//   npm run bake:models                 (set CHROME_PATH if Chrome/Edge is not in a standard location)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'models');
const VITE_PORT = 5199, CDP_PORT = 9399;
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Edge not found. Set CHROME_PATH.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const quit = (code) => { for (const p of procs) try { p.kill(); } catch {} process.exit(code); };

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(300); }
  throw new Error('timed out waiting for ' + what);
}

try {
  procs.push(spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', VITE_PORT, '--strictPort'], { cwd: ROOT, stdio: 'ignore' }));
  await waitFor(() => fetch(`http://localhost:${VITE_PORT}/`).then((r) => r.ok), 30000, 'vite');

  const profile = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'bake-'));
  procs.push(spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`, '--window-size=800,600', 'about:blank'], { stdio: 'ignore' }));
  const tabs = await waitFor(() => fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((r) => r.json()).then((t) => t.some((x) => x.type === 'page') && t), 20000, 'chrome');

  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; }
    if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map((a) => a.value ?? a.description).join(' '); if (t.startsWith('[bake]')) console.log(t); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;

  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/#bake` });
  console.log('Baking rigged models...');
  await waitFor(() => evaluate('window.__bakeDone === true'), 10 * 60 * 1000, 'bake');
  const err = await evaluate('window.__bakeError || ""');
  if (err) throw new Error(err);

  fs.mkdirSync(OUT, { recursive: true });
  const names = await evaluate('Object.keys(window.__bake)');
  for (const name of names) {
    const b64 = await evaluate(`window.__bake[${JSON.stringify(name)}]`);
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.glb'), buf);
    console.log(`  public/models/${name}.glb  ${(buf.length / 1024).toFixed(0)} KB`);
  }
  console.log(`Done: ${names.length} models.`);
  ws.close(); quit(0);
} catch (e) {
  console.error('Bake failed:', e.message || e); quit(1);
}
