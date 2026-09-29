// Wrap every asset as a data URI inside a tiny script, so index.html runs from file:// (WebGL refuses
// file:// images as cross-origin, and fetch() is blocked there). manifest.js loads them in parallel.
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'assets/img'), out = path.join(root, 'assets/pack');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.json': 'application/json' };
const files = fs.readdirSync(src).filter(f => MIME[path.extname(f)]).sort();
const names = [];
files.forEach((f, i) => {
  const ext = path.extname(f), key = ['.bin', '.json'].includes(ext) ? f : f.slice(0, -ext.length);
  const b64 = fs.readFileSync(path.join(src, f)).toString('base64');
  const js = `(window.__PACK__=window.__PACK__||{})[${JSON.stringify(key)}]="data:${MIME[ext]};base64,${b64}";`;
  const name = `p${String(i).padStart(2, '0')}.js`; fs.writeFileSync(path.join(out, name), js); names.push(name);
});
const manifest = `// asset pack manifest (generated)
(function(){var files=${JSON.stringify(names)};var base=(document.currentScript&&document.currentScript.src)?document.currentScript.src.replace(/manifest\\.js.*$/,''):'assets/pack/';
window.__PACK_READY__=Promise.all(files.map(function(f){return new Promise(function(res,rej){var s=document.createElement('script');s.src=base+f;s.onload=res;s.onerror=function(){rej(new Error('pack '+f))};document.head.appendChild(s);});}));})();`;
fs.writeFileSync(path.join(out, 'manifest.js'), manifest);
const total = names.reduce((s, n) => s + fs.statSync(path.join(out, n)).size, 0);
console.log('packed', names.length, 'assets,', (total / 1048576).toFixed(1), 'MB');
