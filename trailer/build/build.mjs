// Bundle the trailer (three.js + sources) into one classic script, and inline fonts as data URIs,
// so index.html works from file:// with no server.
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
await esbuild.build({
  entryPoints: [path.join(root, 'src/player.js')], bundle: true, format: 'iife', outfile: path.join(root, 'assets/app.js'),
  minify: process.argv.includes('--min'), target: 'es2020', legalComments: 'eof', nodePaths: [path.join(here, 'node_modules')],
  logLevel: 'warning',
});
const F = [
  ['Cinzel', 400, 'cinzel-latin-400-normal'], ['Cinzel', 700, 'cinzel-latin-700-normal'], ['Cinzel', 900, 'cinzel-latin-900-normal'],
  ['Silkscreen', 400, 'silkscreen-latin-400-normal'], ['Silkscreen', 700, 'silkscreen-latin-700-normal'], ['VT323', 400, 'vt323-latin-400-normal'],
  ['Special Elite', 400, 'special-elite-latin-400-normal'], ['IM Fell English SC', 400, 'im-fell-english-sc-latin-400-normal'],
  ['Caveat', 700, 'caveat-latin-700-normal'], ['Share Tech Mono', 400, 'share-tech-mono-latin-400-normal'], ['Cormorant Garamond', 700, 'cormorant-garamond-latin-700-normal'],
];
let css = '/* vendored fonts (OFL / Apache-2.0), inlined for offline file:// playback */\n';
for (const [fam, w, f] of F) {
  const b64 = fs.readFileSync(path.join(root, 'assets/fonts', f + '.woff2')).toString('base64');
  css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}\n`;
}
fs.writeFileSync(path.join(root, 'assets/fonts.css'), css);
console.log('built', (fs.statSync(path.join(root, 'assets/app.js')).size / 1024).toFixed(0) + ' KB app.js,', (css.length / 1024).toFixed(0) + ' KB fonts.css');
