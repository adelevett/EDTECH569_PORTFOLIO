import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path'; import { serve } from './serve.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srv = await serve(root, 8799);
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-gpu', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 3000)));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8799/index.html?capture=1');
await page.waitForFunction(() => window.__CAPTURE_READY__ === true, null, { timeout: 300000 });
const info = await page.evaluate(() => {
  TRAILER.renderFrame(400, 1);
  const r = TRAILER.renderer; const gl = r.getContext();
  const progs = r.info.programs.map(p => ({ name: p.name, type: p.type, diag: p.diagnostics ? JSON.stringify(p.diagnostics).slice(0, 1500) : null }));
  return { calls: r.info.render.calls, tris: r.info.render.triangles, progs: progs.filter(p => p.diag) , n: progs.length };
});
console.log(JSON.stringify(info, null, 1));
await browser.close(); srv.close();
