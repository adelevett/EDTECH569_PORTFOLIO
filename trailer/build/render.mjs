// Offline frame-by-frame render of the deterministic timeline (resumable, parallel workers).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path'; import { serve } from './serve.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = args.out || '/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/frames';
fs.mkdirSync(out, { recursive: true });
const FPS = 30, N = Math.round(29.0 * FPS);
const workers = +(args.workers || 3);
const from = +(args.from || 0), to = +(args.to || N - 1);
const force = !!args.force;
// motion-blur / AA sub-samples per time range
const SAMPLES = [[0, 4.6, 5], [4.6, 6.2, 4], [6.2, 9.6, 6], [9.6, 14.8, 5], [14.8, 18.9, 6], [18.9, 19.4, 1], [19.4, 21.6, 5], [21.6, 22.8, 5], [22.8, 29.0, 3]];
const samplesFor = f => { const t = f / FPS; for (const [a, b, s] of SAMPLES) if (t >= a - 1e-6 && t < b - 1e-6) return s; return 3; };
const todo = []; for (let f = from; f <= to; f++) if (force || !fs.existsSync(path.join(out, `f${String(f).padStart(4, '0')}.png`))) todo.push(f);
console.log(`frames to render: ${todo.length} (of ${to - from + 1}) with ${workers} workers`);
const srv = await serve(root, 8700 + Math.floor(Math.random() * 200));
const port = srv.address().port;
let done = 0; const t0 = Date.now(); const errs = new Set();
async function worker(k) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-gpu', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('GPU stall')) errs.add(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => errs.add('pageerror: ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?capture=1`);
  await page.waitForFunction(() => window.__CAPTURE_READY__ === true, null, { timeout: 300000 });
  for (let i = k; i < todo.length; i += workers) {
    const f = todo[i];
    const url = await page.evaluate(([f, s]) => { window.TRAILER.renderFrame(f, s); return window.TRAILER.framePNG(); }, [f, samplesFor(f)]);
    fs.writeFileSync(path.join(out, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    done++;
    if (done % 10 === 0 || done === todo.length) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${todo.length}  ${el.toFixed(0)}s elapsed  ${(el / done).toFixed(2)}s/frame  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`); }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
srv.close();
if (errs.size) console.log('CONSOLE:\n' + [...errs].join('\n'));
console.log('done in', ((Date.now() - t0) / 60000).toFixed(1), 'min');
