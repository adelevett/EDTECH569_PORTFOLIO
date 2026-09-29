// Render stills at given times through the deterministic timeline (headless Chromium, SwiftShader).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
import { serve } from './serve.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = args.out || '/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/stills';
fs.mkdirSync(out, { recursive: true });
const times = (args.times || '1').split(',').map(Number);
const samples = +(args.samples || 1);
const port = 8123 + Math.floor(Math.random() * 500);
const srv = await serve(root, port);
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-gpu', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html?capture=1`);
await page.waitForFunction(() => window.__CAPTURE_READY__ === true || document.getElementById('load').textContent.startsWith('ERROR'), null, { timeout: 300000 });
const loadTxt = await page.evaluate(() => document.getElementById('load').textContent);
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's', loadTxt);
if (loadTxt.startsWith('ERROR')) { console.log([...new Set(errs)].join('\n')); await browser.close(); srv.close(); process.exit(1); }
if (args.debug) await page.evaluate(d => { Object.assign(window.TRAILER.debug, JSON.parse(d)); }, args.debug);
for (const t of times) {
  const f = Math.round(t * 30);
  const t1 = Date.now();
  const url = await page.evaluate(([f, s]) => { window.TRAILER.renderFrame(f, s); return window.TRAILER.framePNG(); }, [f, samples]);
  const file = path.join(out, `f${String(f).padStart(4, '0')}.png`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log('frame', f, 't=' + t, ((Date.now() - t1) / 1000).toFixed(2) + 's', file);
}
if (errs.length) console.log('CONSOLE:\n' + [...new Set(errs)].slice(0, 30).join('\n'));
await browser.close(); srv.close();
