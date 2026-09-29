// Recreate assets/img/ (the build-time source of the pack) from assets/pack/*.js.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pack = path.join(root, 'assets/pack'), out = path.join(root, 'assets/img');
fs.mkdirSync(out, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/octet-stream': '', 'application/json': '' };
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of fs.readdirSync(pack).filter(f => /^p\d+\.js$/.test(f))) vm.runInContext(fs.readFileSync(path.join(pack, f), 'utf8'), ctx);
let n = 0;
for (const [key, uri] of Object.entries(ctx.window.__PACK__)) {
  const [, mime, b64] = uri.match(/^data:([^;]+);base64,(.*)$/);
  fs.writeFileSync(path.join(out, key + EXT[mime]), Buffer.from(b64, 'base64')); n++;
}
console.log('unpacked', n, 'files to', out);
