// Trailer sound design + mix, rendered deterministically in an OfflineAudioContext.
// Two sonically incompatible worlds:
//   SEA-ALL  — wide stereo, huge synthetic hall, shimmer, crackling comms channel, orchestral bed.
//   PHYSICAL — dry, mono, close: music box, rain on a window, clock, breath, glass, a squeak.
import { EDIT, SNIFFS, MAEL_CUTS, PL } from '../timeline.js';

export const SR = 48000, DUR = 29.0, CH = 2;
export const T = {
  maelStart: EDIT.maelstrom[0],
  cut1: EDIT.maelstrom[0] + MAEL_CUTS[1], cut2: EDIT.maelstrom[0] + MAEL_CUTS[2], cut3: EDIT.maelstrom[0] + MAEL_CUTS[3],
  flashOut: EDIT.maelstrom[1], title: EDIT.title[0], plunk: EDIT.plunk[0],
  tipStart: EDIT.plunk[0] + 2.3, fall: EDIT.plunk[0] + PL.fallStart, floorCut: EDIT.plunk[0] + PL.deskEnd, impact: EDIT.plunk[0] + PL.impact,
  handIn: EDIT.plunk[0] + PL.handIn, eyeCut: EDIT.plunk[0] + PL.floorEnd, snap: EDIT.plunk[0] + PL.snap, black: EDIT.plunk[0] + PL.eyeEnd,
  docks: EDIT.docks[0], rott: EDIT.rott[0], profile: EDIT.profile[0],
};

// VO placement: file start time + measured speech span inside the file
export const VO = [
  { id: 'alpha_setsail', file: 'alpha_setsail.wav', at: 2.4, sp: [0.32, 3.13], fx: 'channel', gain: 0.95, pan: -0.05 },
  { id: 'bravo_free', file: 'bravo_free.wav', at: 7.35, sp: [0.26, 2.14], fx: 'channel', gain: 0.9, pan: 0.08 },
  { id: 'rott', file: 'rott_anomalies.wav', at: 10.0, sp: [0.22, 5.18], fx: 'rott', gain: 1.0, pan: 0 },
  { id: 'alpha_scatter', file: 'alpha_scatter.wav', at: 16.95, sp: [0.34, 1.69], fx: 'scream', gain: 0.95, pan: 0 },
];

// ------------------------------------------------------------------------------------ utilities
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dbToGain = db => Math.pow(10, db / 20);

function noiseBuf(ctx, dur, seed, color = 'white', ch = 1) {
  const n = Math.max(1, Math.floor(dur * ctx.sampleRate));
  const b = ctx.createBuffer(ch, n, ctx.sampleRate);
  for (let c = 0; c < ch; c++) {
    const r = mulberry(seed + c * 7919), d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      if (color === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      else d[i] = w;
    }
  }
  return b;
}

function makeIR(ctx, dur, decay, seed, pre = 0.0, bright = 1.0) {
  const n = Math.floor(dur * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const r = mulberry(seed + c * 131), d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      const e = t < pre ? 0 : Math.exp(-(t - pre) * decay) * (1 - Math.exp(-(t - pre) * 60));
      const w = r() * 2 - 1;
      const k = Math.min(1, bright * 0.5 + 0.5 * Math.exp(-t * 1.5));   // darker tail
      lp += (w - lp) * k;
      d[i] = lp * e;
    }
    // a few early reflections
    for (let k = 0; k < 9; k++) { const i = Math.floor((pre + 0.008 + r() * 0.07) * ctx.sampleRate); if (i < n) d[i] += (r() * 2 - 1) * 0.6 * Math.exp(-k * 0.2); }
  }
  return b;
}

function adsr(param, t, a, h, r, peak, floor = 0.0001) {
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setValueAtTime(peak, t + a + h);
  param.exponentialRampToValueAtTime(floor, t + a + h + r);
}

function srcBuf(ctx, buf, t, dest, { gain = 1, rate = 1, offset = 0, dur, pan = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain;
  let out = g;
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  s.connect(g); out.connect(dest);
  if (dur !== undefined) s.start(t, offset, dur); else s.start(t, offset);
  return { s, g };
}

// ------------------------------------------------------------------------------------ DSP on raw arrays
function pitchShift(x, ratio, grain = 1536, hop = 384) {
  const n = x.length, y = new Float32Array(n), wsum = new Float32Array(n);
  const w = new Float32Array(grain); for (let i = 0; i < grain; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / grain);
  for (let o = 0; o + grain < n; o += hop) {
    const c = o + grain / 2;                  // grain centre (time preserved)
    for (let k = 0; k < grain; k++) {
      const src = c + (k - grain / 2) * ratio;
      const i0 = Math.floor(src), f = src - i0;
      if (i0 < 0 || i0 + 1 >= n) continue;
      y[o + k] += (x[i0] * (1 - f) + x[i0 + 1] * f) * w[k];
      wsum[o + k] += w[k];
    }
  }
  for (let i = 0; i < n; i++) if (wsum[i] > 1e-3) y[i] /= wsum[i];
  return y;
}
function splice(x, sr, cuts) { // remove [a,b] seconds ranges with 12 ms crossfades
  const keep = []; let pos = 0;
  for (const [a, b] of cuts) { keep.push([pos, a]); pos = b; }
  keep.push([pos, x.length / sr]);
  const xf = Math.floor(0.012 * sr); const parts = keep.map(([a, b]) => x.subarray(Math.floor(a * sr), Math.floor(b * sr)));
  const total = parts.reduce((s, p) => s + p.length, 0) - xf * (parts.length - 1);
  const y = new Float32Array(total); let w = 0;
  parts.forEach((p, i) => {
    for (let k = 0; k < p.length; k++) {
      let g = 1; if (i > 0 && k < xf) g = k / xf; if (i < parts.length - 1 && k >= p.length - xf) g = (p.length - k) / xf;
      y[w + k] += p[k] * g;
    }
    w += p.length - xf;
  });
  return y;
}
function envelope(x, sr, rate = 30) {
  const hop = Math.floor(sr / rate), out = [];
  let mx = 0;
  for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += x[i + k] * x[i + k]; const v = Math.sqrt(s / hop); out.push(v); mx = Math.max(mx, v); }
  let prev = 0;
  return out.map(v => { const n = Math.min(1, v / (mx * 0.7)); prev = n > prev ? n : prev * 0.72 + n * 0.28; return +prev.toFixed(3); });
}

// Digitail Rott: the TTS line becomes a many-throated, decaying transmission.
function processRott(x, sr) {
  // tighten the pauses so the line lands inside her shot
  x = splice(x, sr, [[2.55, 2.74], [2.92, 3.12]]);
  const n = x.length;
  const low = pitchShift(x, Math.pow(2, -5 / 12));
  const sub = pitchShift(x, 0.5);
  const hi = pitchShift(x, Math.pow(2, 7 / 12));
  const y = new Float32Array(n);
  const r = mulberry(4242);
  // bitcrush bursts
  const crushAt = [[0.9, 1.25], [2.2, 2.45], [3.3, 3.55], [4.25, 4.6]];
  let hold = 0, hc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = x[i] * 0.9 + low[i] * 0.42 + sub[i] * 0.1 + hi[i] * 0.06;
    let crush = 0; for (const [a, b] of crushAt) if (t > a && t < b) crush = 1;
    if (crush) { if (hc-- <= 0) { hold = Math.round(v * 12) / 12; hc = 6 + Math.floor(r() * 10); } v = hold * 0.9 + v * 0.2; }
    y[i] = Math.tanh(v * 1.2) * 0.85;
  }
  // stutter on "a-a-anomalies"
  const st = Math.floor(3.02 * sr), g = Math.floor(0.085 * sr);
  const out = new Float32Array(n + g * 2);
  out.set(y.subarray(0, st), 0);
  for (let k = 0; k < 3; k++) for (let i = 0; i < g; i++) out[st + k * g + i] += y[st + i] * (k < 2 ? Math.sin(Math.PI * i / g) : 1) * (k === 1 ? 0.8 : 1);
  out.set(y.subarray(st + g), st + 3 * g);
  return out;
}

// ------------------------------------------------------------------------------------ instruments
function kick(ctx, t, dest, { f0 = 60, f1 = 32, dur = 0.5, gain = 1 } = {}) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  const g = ctx.createGain(); adsr(g.gain, t, 0.004, 0.02, dur, gain); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.1);
}
function noiseHit(ctx, t, dest, nb, { f = 2000, q = 0.8, type = 'bandpass', a = 0.002, h = 0.01, r = 0.1, gain = 1, pan = 0, offset = 0, rate = 1 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = nb; s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); adsr(g.gain, t, a, h, r, gain);
  s.connect(fl).connect(g);
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(dest); } else g.connect(dest);
  s.start(t, offset % Math.max(0.01, nb.duration - a - h - r - 0.05)); s.stop(t + a + h + r + 0.05);
  return fl;
}
function sweep(ctx, t, dur, dest, nb, { f0 = 300, f1 = 6000, q = 1.5, gain = 0.5, pan0 = 0, pan1 = 0, curve = 'exp', attack } = {}) {
  const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(gain, t + dur); else { g.gain.linearRampToValueAtTime(gain, t + (attack || dur * 0.5)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  const p = ctx.createStereoPanner(); p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + dur);
  s.connect(fl).connect(g).connect(p).connect(dest); s.start(t); s.stop(t + dur + 0.02);
  return g;
}
function bell(ctx, t, freq, dest, { gain = 0.3, dur = 3, ratio = 3.5, index = 2.5, pan = 0 } = {}) { // FM celesta
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * index, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
  mod.connect(mg).connect(car.frequency);
  adsr(g.gain, t, 0.003, 0.0, dur, gain);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  car.connect(g).connect(p).connect(dest); car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
}
function tine(ctx, t, freq, dest, { gain = 0.25, dur = 1.6, detune = 0, sag = 0 } = {}) { // music-box comb tine
  const parts = [[1, 1, 1], [3.0, 0.22, 0.35], [5.8, 0.08, 0.12], [8.9, 0.04, 0.06]];
  for (const [m, a, d] of parts) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m; o.detune.setValueAtTime(detune, t);
    if (sag) o.detune.linearRampToValueAtTime(detune - sag, t + dur);
    const g = ctx.createGain(); adsr(g.gain, t, 0.002, 0.0, dur * d, gain * a);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur * d + 0.05);
  }
}
function braam(ctx, t, dest, { f = 55, dur = 2.6, gain = 0.35, drive } = {}) {
  const out = ctx.createGain(); out.gain.value = gain;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
  lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1900, t + 0.18); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
  const g = ctx.createGain(); adsr(g.gain, t, 0.05, dur * 0.35, dur * 0.65, 1);
  const ws = ctx.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * (drive || 2.2)); } ws.curve = cv;
  for (const [m, dt] of [[1, -9], [1, 9], [2, -5], [2, 6], [1.5, 0], [3, 3], [0.5, 0]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * m; o.detune.value = dt;
    o.connect(g); o.start(t); o.stop(t + dur + 0.1);
  }
  g.connect(ws).connect(lp).connect(out).connect(dest);
}
function impact(ctx, t, dest, space, nb, { gain = 1, metal = true, seed = 1 } = {}) {
  kick(ctx, t, dest, { f0: 70, f1: 28, dur: 1.1, gain: gain * 0.9 });
  kick(ctx, t, dest, { f0: 140, f1: 55, dur: 0.25, gain: gain * 0.5 });
  noiseHit(ctx, t, dest, nb, { type: 'highpass', f: 1500, q: 0.5, a: 0.001, h: 0.005, r: 0.18, gain: gain * 0.45, offset: seed * 0.37 });
  noiseHit(ctx, t, space, nb, { type: 'bandpass', f: 600, q: 0.6, a: 0.002, h: 0.02, r: 0.7, gain: gain * 0.5, offset: seed * 0.73 });
  smp(ctx, 'impactMetal_heavy_00' + (seed % 3), t, space, { rate: 0.5, gain: gain * 0.55, lp: 3000 });
  smp(ctx, 'impactPunch_heavy_00' + (seed % 2), t, dest, { rate: 0.6, gain: gain * 0.6, lp: 1800 });
  smp(ctx, 'lowFrequency_explosion_00' + (seed % 2), t, dest, { rate: 0.85, gain: gain * 0.7 });
  if (metal) for (const [f, d] of [[312, 1.6], [587, 1.1], [913, 0.8], [1377, 0.6], [2250, 0.35]]) {
    const o = ctx.createOscillator(); o.frequency.value = f * (1 + (seed % 5) * 0.013);
    const g = ctx.createGain(); adsr(g.gain, t, 0.001, 0, d, gain * 0.05);
    o.connect(g); g.connect(space); g.connect(dest); o.start(t); o.stop(t + d + 0.1);
  }
}
function squeak(ctx, t, dest, nb, { gain = 0.5 } = {}) { // raw animal squeak: FM squeal with a jagged contour
  const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  o.type = 'sawtooth'; m.type = 'sine';
  o.frequency.setValueAtTime(2600, t); o.frequency.linearRampToValueAtTime(4300, t + 0.045); o.frequency.linearRampToValueAtTime(3500, t + 0.11);
  o.frequency.linearRampToValueAtTime(4100, t + 0.16); o.frequency.exponentialRampToValueAtTime(2100, t + 0.26);
  m.frequency.value = 43; mg.gain.value = 260; m.connect(mg).connect(o.frequency);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 1.4;
  adsr(g.gain, t, 0.006, 0.18, 0.09, gain);
  o.connect(bp).connect(g).connect(dest); o.start(t); m.start(t); o.stop(t + 0.35); m.stop(t + 0.35);
  noiseHit(ctx, t, dest, nb, { f: 3800, q: 2.5, a: 0.004, h: 0.15, r: 0.08, gain: gain * 0.25 });
}
function breath(ctx, t, dest, nb, { dur = 0.35, gain = 0.1, inhale = true, f = 1800 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(inhale ? f * 0.7 : f, t); bp.frequency.linearRampToValueAtTime(inhale ? f * 1.3 : f * 0.6, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + (inhale ? dur * 0.7 : dur * 0.2)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(dest); s.start(t, (t * 1.37) % 3); s.stop(t + dur + 0.02);
}
function pump(ctx, t, dest, nb, { gain = 0.7, muffled = false } = {}) { // the harness pump: thunk + pneumatic hiss
  const d = ctx.createGain(); d.gain.value = 1;
  let out = d;
  if (muffled) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; d.connect(lp); out = lp; }
  out.connect(dest);
  kick(ctx, t, d, { f0: 72, f1: 38, dur: 0.28, gain: gain });
  noiseHit(ctx, t, d, nb, { type: 'lowpass', f: 900, q: 0.7, a: 0.001, h: 0.004, r: 0.05, gain: gain * 0.5 });
  noiseHit(ctx, t + 0.07, d, nb, { type: 'bandpass', f: 3200, q: 1.2, a: 0.01, h: 0.03, r: 0.09, gain: gain * 0.12, offset: 1.1 });
}
function pluck(ctx, t, dest, freq, { gain = 0.6, decay = 0.994, dur = 1.2, seed = 3 } = {}) { // Karplus-Strong: PLUCK
  const sr = ctx.sampleRate, n = Math.floor(dur * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const N = Math.max(2, Math.floor(sr / freq)), r = mulberry(seed); const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = r() * 2 - 1;
  for (let i = 0; i < n; i++) { const k = i % N, k2 = (i + 1) % N; const v = line[k]; d[i] = v; line[k] = decay * 0.5 * (v + line[k2]); }
  srcBuf(ctx, b, t, dest, { gain });
}

// CC0 one-shots (Kenney), played and processed in the graph
let CC0 = {};
function smp(ctx, name, t, dest, { rate = 1, gain = 1, pan = 0, offset = 0, dur, lp, hp } = {}) {
  const b = CC0[name]; if (!b) return;
  const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
  let node = s;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  const g = ctx.createGain(); g.gain.value = gain; node.connect(g);
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(dest); } else g.connect(dest);
  if (dur !== undefined) s.start(t, offset, dur); else s.start(t, offset);
}
export const CC0_NAMES = ['impactGlass_heavy_000', 'impactGlass_heavy_001', 'impactGlass_heavy_002', 'impactGlass_heavy_003', 'impactGlass_heavy_004',
  'impactGlass_medium_000', 'impactGlass_medium_001', 'impactGlass_medium_002', 'impactGlass_light_000', 'impactGlass_light_001', 'impactGlass_light_002', 'impactGlass_light_003', 'impactGlass_light_004',
  'impactWood_heavy_000', 'impactWood_heavy_001', 'impactPlank_medium_000', 'impactPlank_medium_001', 'impactMetal_heavy_000', 'impactMetal_heavy_001', 'impactMetal_heavy_002',
  'impactMetal_medium_000', 'impactMetal_medium_001', 'impactPunch_heavy_000', 'impactPunch_heavy_001', 'footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002',
  'footstep_concrete_003', 'footstep_concrete_004', 'impactPlate_light_000', 'impactSoft_heavy_000', 'computerNoise_000', 'lowFrequency_explosion_000', 'lowFrequency_explosion_001',
  'explosionCrunch_000', 'slime_000', 'forceField_000', 'water_splash_03', 'water_splash_05', 'water_splash_11',
  'bfh1_glass_breaking_06', 'bfh1_glass_breaking_04', 'bfh1_glass_breaking_01', 'bfh1_glass_falling_02', 'bfh1_hit_01', 'bfh1_wood_hit_03'];

// ------------------------------------------------------------------------------------ the score bed
function scoreBed(ctx, score, bus) {
  // [globalStart, globalEnd, sourceOffset, fadeIn, fadeOut, gain]
  const segs = [
    [0.85, T.docks, 2.0, 1.2, 0.08, 0.8],
    [T.docks, T.rott, 23.179 - 0.0, 0.06, 0.06, 0.95],
    [T.rott, T.maelStart, 28.491, 0.02, 0.06, 1.0],
    [T.maelStart, T.flashOut, 53.035, 0.02, 0.004, 1.0],
  ];
  for (const [a, b, off, fi, fo, gain] of segs) {
    const s = ctx.createBufferSource(); s.buffer = score;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(gain, a + fi);
    g.gain.setValueAtTime(gain, b - fo); g.gain.linearRampToValueAtTime(0.0001, b);
    s.connect(g).connect(bus); s.start(a, off, b - a + 0.01);
  }
}

// ------------------------------------------------------------------------------------ build graph
export function buildGraph(ctx, A, sel, duck) {
  const nb = A.noise, nbP = A.pink, nbB = A.brown;
  const out = ctx.destination;
  const master = ctx.createGain(); master.gain.value = 1;
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 2.2; glue.attack.value = 0.02; glue.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  if (sel === 'all') { master.connect(glue).connect(lim).connect(out); } else master.connect(out);

  const bus = { music: ctx.createGain(), vo: ctx.createGain(), sfx: ctx.createGain(), room: ctx.createGain() };
  for (const [k, g] of Object.entries(bus)) {
    const want = sel === 'all' || sel === k || (sel === 'sfx' && k === 'room');
    if (want) g.connect(master);
  }
  // Sea-All hall (huge, bright shimmer tail) vs physical room (tiny, dry)
  const hall = ctx.createConvolver(); hall.buffer = makeIR(ctx, 4.2, 1.1, 77, 0.03, 1.0);
  const hallSfx = ctx.createGain(); hallSfx.gain.value = 0.55; hall.connect(hallSfx).connect(bus.sfx);
  const hallVO = ctx.createConvolver(); hallVO.buffer = makeIR(ctx, 2.8, 1.6, 91, 0.02, 0.9);
  const hallVOg = ctx.createGain(); hallVOg.gain.value = 0.5; hallVO.connect(hallVOg).connect(bus.vo);
  const hallMus = ctx.createConvolver(); hallMus.buffer = makeIR(ctx, 5.0, 0.9, 55, 0.04, 0.8);
  const hallMusG = ctx.createGain(); hallMusG.gain.value = 0.6; hallMus.connect(hallMusG).connect(bus.music);
  const roomIR = ctx.createConvolver(); roomIR.buffer = makeIR(ctx, 0.35, 14, 12, 0.004, 0.6);
  const roomG = ctx.createGain(); roomG.gain.value = 0.18; roomIR.connect(roomG).connect(bus.room);
  // physical world is mono: a mono collapse node for bus.room inputs
  const mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
  mono.connect(bus.room); mono.connect(roomIR);

  // music ducking automation (computed from measured stems)
  const musicIn = ctx.createGain();
  const dip = ctx.createBiquadFilter(); dip.type = 'peaking'; dip.frequency.value = 2300; dip.Q.value = 0.8; dip.gain.value = 0;
  musicIn.connect(dip).connect(bus.music);
  if (duck && duck.dip) { const dg = Float32Array.from(duck.dip, v => -7 * (1 - v)); dip.gain.setValueCurveAtTime(dg, 0, DUR); }
  if (duck) { bus.music.gain.setValueCurveAtTime(duck.music, 0, DUR); bus.sfx.gain.setValueCurveAtTime(duck.sfx, 0, DUR); }
  const musicHall = ctx.createGain(); musicHall.connect(musicIn); musicHall.connect(hallMus);

  // ================= SCORE
  scoreBed(ctx, A.score, musicIn);
  // Three Blind Mice motif, minor, celesta, drenched (Sea-All)
  const motif = [[1.375, 311.13], [1.855, 293.66], [2.335, 261.63]];
  for (const [t, f] of motif) { bell(ctx, t, f * 2, musicHall, { gain: 0.16, dur: 3.2, pan: -0.25 }); bell(ctx, t + 0.012, f * 4, musicHall, { gain: 0.05, dur: 2.2, pan: 0.3 }); }
  // braams: Rott, maelstrom
  braam(ctx, T.rott, musicHall, { f: 43.65, dur: 3.2, gain: 0.22 });
  braam(ctx, T.rott + 2.36, musicHall, { f: 41.2, dur: 2.4, gain: 0.17 });
  braam(ctx, T.maelStart, musicHall, { f: 38.9, dur: 1.2, gain: 0.3 });
  // music box in the globe: C major "Three Blind Mice", dry, tiny, slowing and sagging as it tips
  const mbNotes = [
    [T.title + 0.55, 'E'], [T.title + 0.95, 'D'], [T.title + 1.35, 'C'],
    [T.title + 2.15, 'E'], [T.title + 2.55, 'D'], [T.title + 2.95, 'C'],
    [T.plunk + 1.75, 'G'], [T.plunk + 2.1, 'F'], [T.plunk + 2.45, 'F'], [T.plunk + 2.86, 'E'],
  ];
  const NOTE = { C: 1046.5, D: 1174.66, E: 1318.51, F: 1396.91, G: 1567.98 };
  const mbBus = ctx.createGain(); mbBus.gain.value = 1; const mbHP = ctx.createBiquadFilter(); mbHP.type = 'highpass'; mbHP.frequency.value = 350;
  mbBus.connect(mbHP); mbHP.connect(musicIn);
  mbNotes.forEach(([t, n, sagC], i) => { const late = t > T.tipStart ? (t - T.tipStart) * 90 : 0; tine(ctx, t, NOTE[n] / 2, mbBus, { gain: 0.2, dur: 1.8, detune: -late, sag: sagC || (late ? 40 : 0) }); });

  // ================= VO
  const voIn = ctx.createGain(); voIn.connect(bus.vo);
  for (const v of VO) {
    let buf = A.vo[v.id];
    const chain = ctx.createGain(); chain.gain.value = v.gain;
    let head = chain;
    if (v.fx === 'channel' || v.fx === 'whisper' || v.fx === 'scream') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = v.fx === 'scream' ? 340 : 480; hp.Q.value = 1.1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.fx === 'scream' ? 3800 : 3000; lp.Q.value = 1.6;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 6; pk.Q.value = 1.4;
      const ws = ctx.createWaveShaper(); const cv = new Float32Array(1024); const drv = v.fx === 'scream' ? 3.6 : 2.4;
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * drv) / Math.tanh(drv); } ws.curve = cv;
      chain.connect(hp).connect(pk).connect(lp).connect(ws);
      const pan = ctx.createStereoPanner(); pan.pan.value = v.pan; ws.connect(pan).connect(voIn);
      const send = ctx.createGain(); send.gain.value = v.fx === 'scream' ? 0.45 : 0.16; ws.connect(send).connect(hallVO);
      const dl = ctx.createDelay(); dl.delayTime.value = 0.075; const fb = ctx.createGain(); fb.gain.value = 0.18; const dg = ctx.createGain(); dg.gain.value = 0.16;
      ws.connect(dl); dl.connect(fb).connect(dl); dl.connect(dg).connect(voIn);
      // comms crackle riding the line
      const r = mulberry(v.at * 1000 | 0);
      { const hs = ctx.createBufferSource(); hs.buffer = nb; hs.loop = true; const hb = ctx.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 1800; hb.Q.value = 0.6;
        const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, v.at + v.sp[0] - 0.08); hg.gain.linearRampToValueAtTime(0.022, v.at + v.sp[0] - 0.05); hg.gain.setValueAtTime(0.022, v.at + v.sp[1] + 0.05); hg.gain.linearRampToValueAtTime(0.0001, v.at + v.sp[1] + 0.12);
        hs.connect(hb).connect(hg).connect(voIn); hs.start(v.at + v.sp[0] - 0.1, v.at % 3); hs.stop(v.at + v.sp[1] + 0.15); }
      for (let k = 0; k < 22; k++) noiseHit(ctx, v.at + v.sp[0] + r() * (v.sp[1] - v.sp[0]), voIn, nb, { f: 2200 + r() * 2500, q: 2, a: 0.001, h: 0.003, r: 0.014, gain: 0.07 + r() * 0.08, pan: r() * 1.2 - 0.6, offset: r() * 5 });
      for (const [tt, gg] of [[v.at + v.sp[0] - 0.09, 0.14], [v.at + v.sp[1] + 0.03, 0.2]]) noiseHit(ctx, tt, voIn, nb, { f: 2600, q: 0.9, a: 0.003, h: 0.05, r: 0.06, gain: gg, offset: tt });
    } else if (v.fx === 'rott') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
      const lo = ctx.createBiquadFilter(); lo.type = 'peaking'; lo.frequency.value = 2800; lo.Q.value = 0.9; lo.gain.value = 6;
      const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 280; mud.Q.value = 1.0; mud.gain.value = -4;
      chain.connect(hp).connect(mud).connect(lo).connect(voIn);
      const send = ctx.createGain(); send.gain.value = 0.3; lo.connect(send).connect(hallVO);
      // splashing, number-crunching tail under her words
      sweep(ctx, v.at + 3.9, 1.6, bus.sfx, nbP, { f0: 900, f1: 260, q: 0.7, gain: 0.08, curve: 'lin', pan0: -0.4, pan1: 0.5 });
    }
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(chain);
    if (v.clip) s.start(v.at + v.clip[0], v.clip[0], v.clip[1] - v.clip[0]); else s.start(v.at);
  }

  // ================= SFX: SEA-ALL
  const sfx = ctx.createGain(); sfx.connect(bus.sfx);
  const space = ctx.createGain(); space.connect(hall); // reverb send
  const both = ctx.createGain(); both.connect(sfx); both.connect(space);
  const r = mulberry(99);
  // boot: phantom throbs (muffled), crackle, tile chirps, power-on hum
  pump(ctx, 0.06, both, nb, { gain: 0.6, muffled: true }); kick(ctx, 0.06, sfx, { f0: 42, f1: 25, dur: 0.5, gain: 0.55 }); kick(ctx, 0.6, sfx, { f0: 40, f1: 24, dur: 0.45, gain: 0.45 });
  pump(ctx, 0.6, both, nb, { gain: 0.5, muffled: true });
  for (let k = 0; k < 34; k++) {
    const t = 0.1 + Math.pow(r(), 0.8) * 0.75; const f = [880, 1320, 1760, 2349, 2637][Math.floor(r() * 5)];
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (r() > 0.5 ? 1.5 : 0.66), t + 0.03);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000; const g = ctx.createGain(); adsr(g.gain, t, 0.001, 0.012, 0.03, 0.008 + r() * 0.01);
    const p = ctx.createStereoPanner(); p.pan.value = r() * 1.8 - 0.9; o.connect(lp).connect(g).connect(p).connect(both); o.start(t); o.stop(t + 0.1);
  }
  for (let k = 0; k < 16; k++) { const t = 0.08 + r() * 0.95; smp(ctx, 'computerNoise_000', t, both, { offset: r() * 4.5, dur: 0.05 + r() * 0.12, gain: 0.18 + r() * 0.15, pan: r() * 1.6 - 0.8, hp: 900 }); }
  smp(ctx, 'forceField_000', 0.15, space, { rate: 0.8, gain: 0.25, hp: 400 });
  { const o = ctx.createOscillator(); o.frequency.setValueAtTime(38, 0.05); o.frequency.exponentialRampToValueAtTime(55, 1.3); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0.05); g.gain.linearRampToValueAtTime(0.18, 0.9); g.gain.exponentialRampToValueAtTime(0.0001, 2.4); o.connect(g).connect(sfx); o.start(0.05); o.stop(2.5); }
  // shimmer bed of the Sea-All: high glassy partials + crackle
  { const sh = ctx.createGain(); sh.gain.setValueAtTime(0.0001, 0.3); sh.gain.linearRampToValueAtTime(0.028, 1.6); sh.gain.setValueAtTime(0.028, T.rott - 0.2); sh.gain.linearRampToValueAtTime(0.0001, T.rott);
    sh.connect(space); sh.connect(sfx);
    for (const [f, p] of [[2093, -0.6], [2637.02, 0.5], [3135.96, -0.2], [3951, 0.7], [4186, -0.8]]) { const o = ctx.createOscillator(); o.frequency.value = f; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.3 + r() * 0.7; const lg = ctx.createGain(); lg.gain.value = 0.5; const g = ctx.createGain(); g.gain.value = 0.5; lfo.connect(lg).connect(g.gain); const pn = ctx.createStereoPanner(); pn.pan.value = p; o.connect(g).connect(pn).connect(sh); o.start(0.3); lfo.start(0.3); o.stop(T.rott + 0.1); lfo.stop(T.rott + 0.1); }
    for (let k = 0; k < 60; k++) noiseHit(ctx, 0.2 + r() * (T.rott - 0.4), sfx, nb, { f: 3000 + r() * 5000, q: 4, a: 0.001, h: 0.002, r: 0.02, gain: 0.014 + r() * 0.02, pan: r() * 2 - 1, offset: r() * 5 });
  }
  // lighthouse beam sweeps
  sweep(ctx, 1.4, 2.8, both, nbP, { f0: 400, f1: 2400, q: 2.5, gain: 0.08, curve: 'lin', pan0: 0.8, pan1: -0.3, attack: 1.6 });
  // rain + wind in the Sea-All (wide, reverberant)
  { const rn = ctx.createBufferSource(); rn.buffer = A.noiseSt; rn.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; const lp = ctx.createBiquadFilter(); lp.frequency.value = 9000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0.6); g.gain.linearRampToValueAtTime(0.03, 2.0); g.gain.setValueAtTime(0.03, T.docks - 0.2); g.gain.linearRampToValueAtTime(0.08, T.docks + 0.1);
    g.gain.setValueAtTime(0.08, T.rott); g.gain.linearRampToValueAtTime(0.06, T.rott + 1.5); g.gain.setValueAtTime(0.06, T.maelStart); g.gain.linearRampToValueAtTime(0.0001, T.maelStart + 0.4);
    rn.connect(hp).connect(lp).connect(g); g.connect(sfx); g.connect(space); rn.start(0.6); rn.stop(T.maelStart + 0.5);
    for (let k = 0; k < 160; k++) { const t = T.docks + r() * (T.rott - T.docks + 2); noiseHit(ctx, t, both, nb, { f: 1800 + r() * 3000, q: 2, a: 0.001, h: 0.002, r: 0.03, gain: 0.02 + r() * 0.035, pan: r() * 2 - 1, offset: r() * 5 }); }
  }
  // Alpha: sniffs + whisker current
  for (const [t0, n] of SNIFFS) for (let k = 0; k < n; k++) breath(ctx, T.profile + t0 + k * 0.105 - 0.03, both, nb, { dur: 0.085, gain: 0.16, inhale: true, f: 4200 });
  for (let k = 0; k < 70; k++) { const u = Math.pow(r(), 0.6); const t = T.profile + 0.25 + u * 1.3; noiseHit(ctx, t, both, nb, { f: 5000 + r() * 4000, q: 6, a: 0.0005, h: 0.001, r: 0.012 + r() * 0.02, gain: 0.03 + 0.05 * u, pan: 0.2 + r() * 0.6, offset: r() * 5 }); }
  sweep(ctx, T.profile + 0.2, 1.4, both, nb, { f0: 3000, f1: 9000, q: 8, gain: 0.03, pan0: 0.1, pan1: 0.6 });
  // docks: footsteps from the pose timing (sync-critical)
  const lanes = [{ phase: 0.0, rate: 11.5, g: 0.2, pan: 0.15 }, { phase: 1.3, rate: 11.0, g: 0.22, pan: -0.1 }, { phase: 2.2, rate: 12.5, g: 0.18, pan: -0.35 }];
  lanes.forEach((L, i) => {
    for (let k = 0; k < 40; k++) {
      const tau = (2 * k - L.phase) / L.rate; if (tau < 0 || tau > 3.4) continue;
      const t = T.docks + tau, dist = 1 - 0.55 * Math.min(1, tau / 3.4);
      smp(ctx, 'footstep_concrete_00' + ((k + i) % 5), t, both, { rate: 1.35 + r() * 0.2, gain: L.g * 2.2 * dist, pan: L.pan, hp: 250 });
      noiseHit(ctx, t + 0.004, both, nb, { f: 1600 + r() * 900, q: 0.9, a: 0.001, h: 0.01, r: 0.07, gain: L.g * 0.6 * dist, pan: L.pan, offset: r() * 5 });
    }
  });
  // docks -> flash: riser, reverse swell, impact
  sweep(ctx, T.rott - 1.1, 1.1, both, nbP, { f0: 300, f1: 7000, q: 1.2, gain: 0.3, pan0: -0.3, pan1: 0.3 });
  { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, T.rott - 1.1); o.frequency.exponentialRampToValueAtTime(880, T.rott); const lp = ctx.createBiquadFilter(); lp.frequency.setValueAtTime(400, T.rott - 1.1); lp.frequency.exponentialRampToValueAtTime(5000, T.rott);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.rott - 1.1); g.gain.exponentialRampToValueAtTime(0.06, T.rott - 0.01); g.gain.linearRampToValueAtTime(0.0001, T.rott); o.connect(lp).connect(g).connect(both); o.start(T.rott - 1.1); o.stop(T.rott + 0.05); }
  impact(ctx, T.rott, sfx, space, nb, { gain: 0.95, seed: 3 }); kick(ctx, T.rott, sfx, { f0: 46, f1: 22, dur: 1.4, gain: 0.8 });
  // Rott: tiles devoured (data chatter), tearing, her drone
  for (let k = 0; k < 420; k++) { const u = r(); const t = T.rott + 0.3 + u * u * 3.2; const f = 1200 + r() * 6000; noiseHit(ctx, t, r() > 0.6 ? both : sfx, nb, { f, q: 9, a: 0.0005, h: 0.001, r: 0.006 + r() * 0.01, gain: 0.03 + r() * 0.05, pan: r() * 2 - 1, offset: r() * 5 }); }
  for (const t of [T.rott + 0.75, T.rott + 1.9, T.rott + 2.7, T.rott + 3.6, T.rott + 4.6]) {
    const s = ctx.createBufferSource(); s.buffer = nb; s.playbackRate.value = 0.25; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + r() * 1500; bp.Q.value = 0.7;
    const ws = ctx.createWaveShaper(); const cv = new Float32Array(64); for (let i = 0; i < 64; i++) cv[i] = Math.round((i / 31.5 - 1) * 3) / 3; ws.curve = cv;
    const g = ctx.createGain(); adsr(g.gain, t, 0.002, 0.08 + r() * 0.12, 0.05, 0.12); s.connect(bp).connect(ws).connect(g).connect(both); s.start(t, r() * 3); s.stop(t + 0.35);
  }
  { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.rott + 0.3); g.gain.linearRampToValueAtTime(0.06, T.rott + 2.0); g.gain.setValueAtTime(0.06, T.maelStart - 0.3); g.gain.linearRampToValueAtTime(0.16, T.maelStart + 0.2); g.gain.setValueAtTime(0.16, T.flashOut - 0.05); g.gain.linearRampToValueAtTime(0.0001, T.flashOut);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 180; g.connect(lp).connect(sfx);
    for (const [f, dt] of [[36.7, -8], [36.7, 7], [55, 0], [73.4, -12]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(g); o.start(T.rott + 0.3); o.stop(T.flashOut + 0.05); } }
  // maelstrom: vortex roar, hits on the cuts, leap whoosh, shredding, riser -> PLUCK
  { const s = ctx.createBufferSource(); s.buffer = A.noiseSt; s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(220, T.maelStart); bp.frequency.exponentialRampToValueAtTime(1400, T.flashOut);
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(1.2, T.maelStart); lfo.frequency.linearRampToValueAtTime(6, T.flashOut); const lg = ctx.createGain(); lg.gain.value = 500; lfo.connect(lg).connect(bp.frequency);
    const p = ctx.createStereoPanner(); const pl = ctx.createOscillator(); pl.frequency.value = 1.7; pl.connect(p.pan);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.maelStart); g.gain.exponentialRampToValueAtTime(0.2, T.maelStart + 0.4); g.gain.exponentialRampToValueAtTime(0.28, T.flashOut - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.flashOut);
    for (const tc of [T.cut1, T.cut2, T.cut3]) { g.gain.setTargetAtTime(0.05, tc - 0.005, 0.01); g.gain.setTargetAtTime(0.24, tc + 0.12, 0.08); }
    s.connect(bp).connect(g).connect(p); p.connect(sfx); p.connect(space); s.start(T.maelStart); lfo.start(T.maelStart); pl.start(T.maelStart); s.stop(T.flashOut + 0.01); lfo.stop(T.flashOut + 0.01); pl.stop(T.flashOut + 0.01); }
  { const s = ctx.createBufferSource(); s.buffer = nbB; s.loop = true; const lp = ctx.createBiquadFilter(); lp.frequency.value = 160; const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T.maelStart); g.gain.exponentialRampToValueAtTime(0.5, T.maelStart + 0.5); g.gain.setValueAtTime(0.5, T.flashOut - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.flashOut);
    s.connect(lp).connect(g).connect(sfx); s.start(T.maelStart); s.stop(T.flashOut + 0.01);
    for (const [f0, f1, p] of [[420, 1250, -0.5], [433, 1180, 0.5]]) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, T.maelStart); o.frequency.exponentialRampToValueAtTime(f1, T.flashOut);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, T.maelStart); og.gain.exponentialRampToValueAtTime(0.02, T.flashOut - 0.05); og.gain.linearRampToValueAtTime(0.0001, T.flashOut);
      const pn = ctx.createStereoPanner(); pn.pan.value = p; o.connect(og).connect(pn); pn.connect(space); pn.connect(sfx); o.start(T.maelStart); o.stop(T.flashOut + 0.01); } }
  smp(ctx, 'explosionCrunch_000', T.maelStart, space, { rate: 0.6, gain: 0.4, lp: 2500 });
  impact(ctx, T.cut1, sfx, space, nb, { gain: 0.75, seed: 5 });
  impact(ctx, T.cut2, sfx, space, nb, { gain: 0.8, seed: 7 });
  impact(ctx, T.cut3, sfx, space, nb, { gain: 0.9, seed: 11 });
  sweep(ctx, T.cut1 - 0.05, 0.7, both, nbP, { f0: 2500, f1: 200, q: 1.5, gain: 0.25, curve: 'lin', pan0: 0.6, pan1: -0.6, attack: 0.15 });
  for (let k = 0; k < 6; k++) { const t = T.cut2 + 0.15 + k * 0.085; noiseHit(ctx, t, both, nb, { f: 700 + r() * 3000, q: 0.6, a: 0.001, h: 0.03, r: 0.04, gain: 0.16, pan: r() * 1.4 - 0.7, offset: r() * 5, rate: 0.5 }); }
  sweep(ctx, T.cut3 + 0.05, T.flashOut - T.cut3 - 0.05, both, nbP, { f0: 350, f1: 4200, q: 1.0, gain: 0.2, pan0: 0, pan1: 0 });
  { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, T.cut3); o.frequency.exponentialRampToValueAtTime(1760, T.flashOut); const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.cut3); g.gain.exponentialRampToValueAtTime(0.07, T.flashOut - 0.01); g.gain.linearRampToValueAtTime(0.0001, T.flashOut); o.connect(lp).connect(g).connect(both); o.start(T.cut3); o.stop(T.flashOut + 0.02); }
  // "PLUCK." — the cable yanked; everything cut to nothing
  smp(ctx, 'impactMetal_heavy_001', T.flashOut, sfx, { rate: 0.72, gain: 0.8 });
  smp(ctx, 'impactPunch_heavy_000', T.flashOut, sfx, { rate: 0.8, gain: 0.6 });
  { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(2400, T.flashOut); o.frequency.exponentialRampToValueAtTime(140, T.flashOut + 0.07);
    const g = ctx.createGain(); adsr(g.gain, T.flashOut, 0.0005, 0.01, 0.07, 0.25); o.connect(g).connect(sfx); o.start(T.flashOut); o.stop(T.flashOut + 0.12); }
  noiseHit(ctx, T.flashOut, sfx, nb, { type: 'highpass', f: 2500, q: 0.7, a: 0.0005, h: 0.002, r: 0.03, gain: 0.35 });
  kick(ctx, T.flashOut, sfx, { f0: 90, f1: 30, dur: 0.35, gain: 0.7 });

  // ================= TITLE
  kick(ctx, T.title + 0.03, sfx, { f0: 55, f1: 24, dur: 2.2, gain: 0.85 });
  smp(ctx, 'lowFrequency_explosion_001', T.title + 0.03, space, { rate: 0.7, gain: 0.8 });
  { const o = ctx.createOscillator(); o.frequency.setValueAtTime(62, T.title + 0.03); o.frequency.exponentialRampToValueAtTime(29, T.title + 2.6);
    const g = ctx.createGain(); adsr(g.gain, T.title + 0.03, 0.01, 0.25, 2.3, 0.95); o.connect(g).connect(sfx); o.start(T.title + 0.03); o.stop(T.title + 2.8); }
  noiseHit(ctx, T.title + 0.03, sfx, nbB, { type: 'lowpass', f: 140, q: 0.7, a: 0.004, h: 0.05, r: 0.9, gain: 0.8 });
  smp(ctx, 'impactPunch_heavy_001', T.title + 0.03, space, { rate: 0.45, gain: 0.5, lp: 900 });
  smp(ctx, 'impactMetal_heavy_000', T.title + 0.03, both, { rate: 0.66, gain: 0.7 });
  smp(ctx, 'impactPunch_heavy_000', T.title + 0.03, sfx, { rate: 0.75, gain: 0.8 });
  smp(ctx, 'explosionCrunch_000', T.title + 0.03, both, { rate: 0.8, gain: 0.35, hp: 200 });
  noiseHit(ctx, T.title + 0.03, both, nb, { type: 'bandpass', f: 1800, q: 0.6, a: 0.001, h: 0.01, r: 0.35, gain: 0.35 });
  noiseHit(ctx, T.title + 0.03, space, nbB, { type: 'lowpass', f: 300, q: 0.7, a: 0.005, h: 0.05, r: 1.8, gain: 0.5 });
  sweep(ctx, T.title + 1.5, 0.7, space, nb, { f0: 6000, f1: 12000, q: 3, gain: 0.03, curve: 'lin', pan0: -0.3, pan1: 0.4, attack: 0.3 });

  // ================= PHYSICAL WORLD (mono, dry, close)
  const phys = ctx.createGain(); phys.connect(mono);
  // room tone + rain on the window + clock
  { const s = ctx.createBufferSource(); s.buffer = nbB; s.loop = true; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.plunk + 0.8); g.gain.linearRampToValueAtTime(0.05, T.plunk + 1.6); g.gain.setValueAtTime(0.05, T.black - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.black);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 220; s.connect(lp).connect(g).connect(phys); s.start(T.plunk + 0.8); s.stop(T.black + 0.02); }
  { const s = ctx.createBufferSource(); s.buffer = nbP; s.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const lp = ctx.createBiquadFilter(); lp.frequency.value = 6500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.plunk + 0.9); g.gain.linearRampToValueAtTime(0.075, T.plunk + 1.7); g.gain.setValueAtTime(0.075, T.floorCut); g.gain.linearRampToValueAtTime(0.03, T.floorCut + 0.1); g.gain.setValueAtTime(0.03, T.black - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.black);
    s.connect(hp).connect(lp).connect(g).connect(phys); s.start(T.plunk + 0.9); s.stop(T.black + 0.02);
    for (let k = 0; k < 60; k++) { const t = T.plunk + 1.0 + r() * (T.floorCut - T.plunk - 1.0); noiseHit(ctx, t, phys, nb, { f: 3500 + r() * 2500, q: 5, a: 0.0005, h: 0.001, r: 0.008, gain: 0.06 + r() * 0.05, offset: r() * 5 }); } }
  for (let k = 0; k < 4; k++) { const t = T.plunk + 1.2 + k * 0.8; if (t > T.fall) break; smp(ctx, 'impactPlate_light_000', t, phys, { rate: k % 2 ? 2.4 : 2.8, gain: 0.22, hp: 900 }); }
  // the tip: creak of glass on metal, the student's gasp, the fall
  { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(260, T.tipStart + 0.1); o.frequency.linearRampToValueAtTime(190, T.tipStart + 0.6);
    const m = ctx.createOscillator(); m.frequency.value = 31; const mg = ctx.createGain(); mg.gain.value = 0.9; const am = ctx.createGain(); am.gain.value = 0; m.connect(mg).connect(am.gain);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 6; const g = ctx.createGain(); adsr(g.gain, T.tipStart + 0.1, 0.05, 0.3, 0.2, 0.06);
    o.connect(am).connect(bp).connect(g).connect(phys); o.start(T.tipStart + 0.1); m.start(T.tipStart + 0.1); o.stop(T.tipStart + 0.8); m.stop(T.tipStart + 0.8); }
  breath(ctx, T.fall - 0.12, phys, nb, { dur: 0.28, gain: 0.14, inhale: true, f: 1400 });
  sweep(ctx, T.fall + 0.05, T.impact - T.fall - 0.12, phys, nbP, { f0: 400, f1: 1500, q: 0.8, gain: 0.06, curve: 'lin', attack: 0.3 });
  // PLUNK
  const tI = T.impact;
  // PLUNK is the loudest, heaviest hit in the film: every layer goes through its own impact compressor so the body
  // and the splash sit up against the glass transients (lower crest factor, more weight at the same true peak).
  const smashIn = ctx.createGain();
  const smashComp = ctx.createDynamicsCompressor(); smashComp.threshold.value = -22; smashComp.knee.value = 6; smashComp.ratio.value = 5; smashComp.attack.value = 0.004; smashComp.release.value = 0.18;
  const smashMake = ctx.createGain(); smashMake.gain.value = 2.4;
  smashIn.connect(smashComp).connect(smashMake).connect(phys);
  // recorded layers (CC0): heavy floor thud, a thick glass vessel shattering, water thrown on boards, shards settling
  smp(ctx, 'bfh1_hit_01', tI, smashIn, { gain: 1.6 });
  smp(ctx, 'bfh1_wood_hit_03', tI + 0.004, smashIn, { rate: 0.9, gain: 1.1 });
  kick(ctx, tI, smashIn, { f0: 110, f1: 46, dur: 0.5, gain: 1.0 });
  { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, tI); o.frequency.exponentialRampToValueAtTime(58, tI + 0.25);
    const g = ctx.createGain(); adsr(g.gain, tI, 0.001, 0.02, 0.3, 1.2); o.connect(g).connect(smashIn); o.start(tI); o.stop(tI + 0.4); }
  smp(ctx, 'bfh1_glass_breaking_06', tI + 0.004, smashIn, { gain: 0.6, lp: 7000 });
  smp(ctx, 'bfh1_glass_breaking_04', tI + 0.022, smashIn, { rate: 0.94, gain: 0.4, lp: 7000 });
  smp(ctx, 'bfh1_glass_breaking_01', tI + 0.07, smashIn, { rate: 1.04, gain: 0.3, lp: 7000 });
  smp(ctx, 'water_splash_03', tI + 0.03, smashIn, { gain: 2.0 });
  smp(ctx, 'water_splash_11', tI + 0.07, smashIn, { rate: 0.95, gain: 1.6 });
  smp(ctx, 'water_splash_05', tI + 0.13, smashIn, { rate: 0.97, gain: 1.0 });
  // the metal base knocks as it rocks to rest (matches the picture's settle)
  for (const [dt, g, rt] of [[0.21, 0.5, 1.25], [0.42, 0.32, 1.35], [0.6, 0.18, 1.45]]) smp(ctx, 'impactMetal_medium_000', tI + dt, smashIn, { rate: rt, gain: g, lp: 5000 });
  smp(ctx, 'bfh1_glass_falling_02', tI + 0.38, smashIn, { gain: 0.45 });
  for (let k = 0; k < 6; k++) smp(ctx, 'impactGlass_light_00' + (k % 5), tI + 0.55 + Math.pow(r(), 1.3) * 1.2, smashIn, { rate: 1.2 + r() * 0.5, gain: 0.06 + r() * 0.08 });
  { const rc = ctx.createConvolver(); rc.buffer = makeIR(ctx, 0.9, 6.5, 321, 0.006, 0.8); const rg = ctx.createGain(); rg.gain.value = 0.3; rc.connect(rg).connect(bus.room);
    const send = ctx.createGain(); send.gain.value = 1; send.connect(rc);
    smp(ctx, 'bfh1_hit_01', tI, send, { gain: 0.8 });
    smp(ctx, 'bfh1_glass_breaking_06', tI + 0.004, send, { gain: 0.6 }); }
  tine(ctx, tI + 0.55, NOTE.E * 0.94, phys, { gain: 0.09, dur: 2.2, detune: -60, sag: 80 }); // the last note of the music box, broken
  // the hand: the hum of the feed swells (she is thriving somewhere in the cables)
  { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.handIn - 0.4); g.gain.exponentialRampToValueAtTime(0.2, T.eyeCut - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.eyeCut);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 400; g.connect(lp).connect(phys);
    for (const [f, a] of [[50, 1], [100, 0.5], [150, 0.35], [53.3, 0.6], [212, 0.2]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(g); o.start(T.handIn - 0.4); o.stop(T.eyeCut + 0.05); }
    const s = ctx.createBufferSource(); s.buffer = nbB; s.loop = true; const sg = ctx.createGain(); sg.gain.value = 0.5; s.connect(sg).connect(g); s.start(T.handIn - 0.4); s.stop(T.eyeCut + 0.05); }
  // the eye: breath, a heartbeat, then SNAP — the squeak
  breath(ctx, T.eyeCut + 0.1, phys, nb, { dur: 0.22, gain: 0.08, inhale: false, f: 1500 });
  kick(ctx, T.eyeCut + 0.25, phys, { f0: 70, f1: 45, dur: 0.12, gain: 0.35 }); kick(ctx, T.eyeCut + 0.4, phys, { f0: 65, f1: 42, dur: 0.1, gain: 0.25 });
  if (A.squeak) srcBuf(ctx, A.squeak, T.snap, phys, { gain: 0.9 });
  squeak(ctx, T.snap + 0.01, phys, nb, { gain: 0.06 });
  braam(ctx, T.snap, phys, { f: 46.25, dur: 0.95, gain: 0.22, drive: 3 });
  breath(ctx, T.snap - 0.02, phys, nb, { dur: 0.3, gain: 0.2, inhale: true, f: 2000 });
  kick(ctx, T.snap, phys, { f0: 120, f1: 40, dur: 0.4, gain: 0.8 });
  noiseHit(ctx, T.snap, phys, nb, { type: 'highpass', f: 5000, q: 0.5, a: 0.0005, h: 0.01, r: 0.12, gain: 0.3 });
  { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(3520, T.snap); o.frequency.linearRampToValueAtTime(3380, T.black);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 12; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T.snap); g.gain.linearRampToValueAtTime(0.05, T.snap + 0.05); g.gain.linearRampToValueAtTime(0.03, T.black - 0.02); g.gain.linearRampToValueAtTime(0.0001, T.black);
    o.connect(bp).connect(g).connect(phys); o.start(T.snap); o.stop(T.black + 0.02); }
  for (let k = 0; k < 3; k++) breath(ctx, T.snap + 0.35 + k * 0.2, phys, nb, { dur: 0.16, gain: 0.07, inhale: k % 2 === 0, f: 1700 });
  // black. the real pump — the throb she had learned to ignore.
  kick(ctx, T.black + 0.12, phys, { f0: 44, f1: 24, dur: 0.6, gain: 0.9 }); kick(ctx, T.black + 0.44, phys, { f0: 42, f1: 23, dur: 0.55, gain: 0.8 });
  pump(ctx, T.black + 0.12, phys, nb, { gain: 0.75 }); smp(ctx, 'impactMetal_medium_000', T.black + 0.12, phys, { rate: 0.62, gain: 0.55, lp: 2500 });
  pump(ctx, T.black + 0.44, phys, nb, { gain: 0.65 }); smp(ctx, 'impactMetal_medium_001', T.black + 0.44, phys, { rate: 0.6, gain: 0.5, lp: 2500 });
}

// ------------------------------------------------------------------------------------ render
export async function renderMix(loadArrayBuffer) {
  const tmp = new OfflineAudioContext(CH, SR, SR);
  const dec = async name => tmp.decodeAudioData(await loadArrayBuffer(name));
  const A = { vo: {} };
  A.score = await dec('score_lyria.mp3');
  for (const v of VO) A.vo[v.id] = await dec(v.file);
  CC0 = {};
  for (const n of CC0_NAMES) CC0[n] = await dec('cc0/' + n + '.wav');
  { // the squeak: Alpha's own scream, pitched up ~14 semitones and shortened
    const sc = A.vo.alpha_scatter, sr = sc.sampleRate, x = sc.getChannelData(0).slice(Math.floor(0.33 * sr), Math.floor(0.66 * sr));
    const y = pitchShift(x, Math.pow(2, 10 / 12), 512, 128);
    for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 2.2) * 0.8;
    for (let i = 0; i < y.length; i++) { const t = i / y.length; y[i] *= Math.min(1, t * 40) * Math.pow(1 - t, 0.7); }
    const b = tmp.createBuffer(1, y.length, sr); b.copyToChannel(y, 0); A.squeak = b;
  }
  for (const v of VO) if (v.fx === 'channel' || v.fx === 'scream') {
    const b = A.vo[v.id], x = b.getChannelData(0), y = new Float32Array(x.length); let hold = 0;
    for (let i = 0; i < x.length; i++) { if (i % 5 === 0) hold = Math.round(x[i] * 180) / 180; y[i] = x[i] * 0.55 + hold * 0.45; }
    const nb2 = tmp.createBuffer(1, y.length, b.sampleRate); nb2.copyToChannel(y, 0); A.vo[v.id] = nb2;
  }
  // prepare Rott in JS DSP
  const rx = A.vo.rott.getChannelData(0);
  const ry = processRott(rx, A.vo.rott.sampleRate);
  const rb = tmp.createBuffer(1, ry.length, A.vo.rott.sampleRate); rb.copyToChannel(ry, 0); A.vo.rott = rb;
  const rottEnv = { start: VO.find(v => v.id === 'rott').at, rate: 30, dur: ry.length / A.vo.rott.sampleRate, v: envelope(ry, A.vo.rott.sampleRate, 30) };
  const mk = async (sel, duck) => {
    const ctx = new OfflineAudioContext(CH, Math.round(DUR * SR), SR);
    const R = { ...A, noise: noiseBuf(ctx, 6, 1), noiseSt: noiseBuf(ctx, 6, 5, 'white', 2), pink: noiseBuf(ctx, 6, 3, 'pink'), brown: noiseBuf(ctx, 6, 9, 'brown') };
    buildGraph(ctx, R, sel, duck);
    return ctx.startRendering();
  };
  const rms = (buf, a, b) => { let s = 0, n = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = Math.floor(a * SR); i < Math.min(d.length, Math.floor(b * SR)); i++) { s += d[i] * d[i]; n++; } } return 10 * Math.log10(s / Math.max(1, n) + 1e-12); };
  const music0 = await mk('music', null), vo = await mk('vo', null);
  const windows = VO.map(v => ({ id: v.id, a: v.at + v.sp[0], b: v.at + v.sp[1] }));
  const RATE = 100, N = Math.round(DUR * RATE) + 1;
  const curveFor = (gains, floorDb) => {
    const tgt = new Float32Array(N).fill(1);
    windows.forEach((w, k) => { for (let i = Math.floor((w.a - 0.12) * RATE); i <= Math.ceil((w.b + 0.2) * RATE); i++) if (i >= 0 && i < N) tgt[i] = Math.min(tgt[i], Math.max(dbToGain(floorDb), gains[k])); });
    // look-ahead attack (backward pass), slow release (forward pass)
    const out = Float32Array.from(tgt);
    for (let i = N - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] + (1 - out[i + 1]) * 0.18);
    for (let i = 1; i < N; i++) if (out[i] > out[i - 1]) out[i] = out[i - 1] + (out[i] - out[i - 1]) * 0.06;
    return out;
  };
  const sp = windows.map(w => rms(vo, w.a, w.b)), mu0 = windows.map(w => rms(music0, w.a, w.b));
  let gains = windows.map((w, k) => Math.min(1, dbToGain((sp[k] - 13.0) - mu0[k])));
  let duck, music1, margins;
  for (let it = 0; it < 4; it++) {
    duck = { music: curveFor(gains, -40), sfx: curveFor(windows.map(() => dbToGain(-9)), -9), dip: curveFor(windows.map(() => 0), -120) };
    music1 = await mk('music', duck);
    margins = windows.map((w, k) => sp[k] - rms(music1, w.a, w.b));
    if (margins.every(m => m >= 12.5)) break;
    gains = gains.map((g, k) => margins[k] < 12.5 ? g * dbToGain(margins[k] - 13.0) : g);
  }
  const report = windows.map((w, k) => ({ id: w.id, window: [w.a.toFixed(2), w.b.toFixed(2)], speechRMS: sp[k].toFixed(1), musicBefore: mu0[k].toFixed(1), musicAfter: rms(music1, w.a, w.b).toFixed(1), marginDb: margins[k].toFixed(1) }));
  const mix = await mk('all', duck);
  // master peak <= -1 dBFS (target -1.5 to leave room for codec overshoot)
  // true-peak estimate: 4x oversampling with a 16-tap Hann-windowed sinc
  const taps = 8, fr = [0.25, 0.5, 0.75], K = fr.map(f => { const k = []; for (let j = -taps + 1; j <= taps; j++) { const x = j - f; const s = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); const w = 0.5 + 0.5 * Math.cos(Math.PI * x / taps); k.push(s * w); } return k; });
  let peak = 0;
  for (let c = 0; c < CH; c++) { const d = mix.getChannelData(c); for (let i = 0; i < d.length; i++) { const a0 = Math.abs(d[i]); if (a0 > peak) peak = a0;
    if (a0 > peak * 0.7 && i >= taps && i + taps < d.length) for (const k of K) { let s = 0; for (let j = 0; j < k.length; j++) s += d[i - taps + 1 + j] * k[j]; if (Math.abs(s) > peak) peak = Math.abs(s); } } }
  const g = dbToGain(-1.5) / peak;
  for (let c = 0; c < CH; c++) { const d = mix.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  const L = mix.getChannelData(0), Rr = mix.getChannelData(1);
  return { L, R: Rr, sr: SR, report, rottEnv, peakBeforeNorm: 20 * Math.log10(peak), normGainDb: 20 * Math.log10(g) };
}

export function wav16(L, R, sr) {
  const n = L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44; const r = mulberry(1234);
  for (let i = 0; i < n; i++) for (const d of [L, R]) { const x = Math.max(-1, Math.min(1, d[i] + (r() - r()) / 65536)); v.setInt16(o, Math.round(x * 32767), true); o += 2; }
  return buf;
}
