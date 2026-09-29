import { renderMix, wav16 } from './mix.js';
// Headless build: render the whole soundtrack offline and hand back a WAV + report.
window.buildAudio = async function () {
  const load = async name => (await fetch('../audio/stems/' + name)).arrayBuffer();
  const t0 = performance.now();
  const res = await renderMix(load);
  const wav = wav16(res.L, res.R, res.sr);
  const u8 = new Uint8Array(wav); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), report: res.report, rottEnv: res.rottEnv, peakBeforeNorm: res.peakBeforeNorm, normGainDb: res.normGainDb, ms: performance.now() - t0 };
};
