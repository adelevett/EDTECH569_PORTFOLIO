import { loadTexture, loadBinary, loadMeta } from './assets.js';

// Everything the trailer needs, loaded once.
const COLOR_JPG = ['P1_color', 'P1_bg_color', 'P2_color', 'P2_clean_color', 'P2_noship_color', 'G1_color', 'G3_color', 'G4a_color', 'G4b_color'];
const DEPTH_PNG = ['P1_depth', 'P1_bg_depth', 'P2_depth', 'P2_clean_depth', 'P2_noship_depth', 'G1_depth', 'G3_depth', 'G4_depth'];
const SPRITES = [
  'SP1_trio_0', 'SP1_trio_1', 'SP1_trio_2',
  'SP2_run_alpha_0', 'SP2_run_alpha_1', 'SP2_run_alpha_2', 'SP2_run_alpha_3',
  'SP2_run_bravo_0', 'SP2_run_bravo_1', 'SP2_run_bravo_2', 'SP2_run_bravo_3',
  'SP2_run_charlie_0', 'SP2_run_charlie_1', 'SP2_run_charlie_2', 'SP2_run_charlie_3',
  'SP3_bravo_leap', 'SP4_alpha_scream', 'SP5_alpha_profile', 'G2_base', 'G5_hand', 'P2_fg',
];
const MASKS = ['P2_shipregion'];

export async function loadAll(ctx, onProgress) {
  const lib = { tex: {}, bin: {} };
  const jobs = [];
  let done = 0; const total = COLOR_JPG.length + DEPTH_PNG.length + SPRITES.length + MASKS.length + 3;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };
  for (const n of COLOR_JPG) jobs.push(loadTexture(n, 'jpg', { aniso: 8 }).then(t => { lib.tex[n] = t; tick(); }));
  for (const n of DEPTH_PNG) jobs.push(loadTexture(n, 'png', { linear: true, nearest: true }).then(t => { lib.tex[n] = t; tick(); }));
  for (const n of SPRITES) jobs.push(loadTexture(n, 'webp', { aniso: 4 }).then(t => { lib.tex[n] = t; tick(); }));
  for (const n of MASKS) jobs.push(loadTexture(n, 'png', { linear: true, noMips: true }).then(t => { lib.tex[n] = t; tick(); }));
  jobs.push(loadBinary('rott_face.bin').then(b => { lib.bin.face = new Float32Array(b); tick(); }));
  jobs.push(loadBinary('rott_hand.bin').then(b => { lib.bin.hand = new Float32Array(b); tick(); }));
  jobs.push(loadMeta().then(m => { lib.meta = m; tick(); }));
  await Promise.all(jobs);
  if (document.fonts) {
    await Promise.all(['400 40px Silkscreen', '400 40px Cinzel', '700 40px Cinzel', '900 40px Cinzel', '400 40px "Special Elite"', '700 40px Caveat', '400 40px "Share Tech Mono"', '400 40px "IM Fell English SC"', '400 40px VT323'].map(f => document.fonts.load(f)));
  }
  return lib;
}
