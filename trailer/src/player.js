import { TRAILER } from './main.js';

// Player UI: gate + Play (satisfies autoplay policy), rAF loop slaved to the audio clock,
// scrubbing. ?capture=1 skips the UI for the offline renderer.
const q = new URLSearchParams(location.search);
const capture = q.has('capture');
const gate = document.getElementById('gate');
const playBtn = document.getElementById('play');
const loadEl = document.getElementById('load');
const aud = document.getElementById('aud');
const scrub = document.getElementById('scrub');
const timeEl = document.getElementById('time');
const pp = document.getElementById('pp');
const bar = document.getElementById('bar');
const FPS = TRAILER.FPS, DUR = TRAILER.DURATION;

let playing = false, lastFrame = -1, seeking = false;
const fmt = t => t.toFixed(2).padStart(5, '0');

function draw(t, force) {
  const f = Math.min(Math.floor(t * FPS + 1e-6), Math.round(DUR * FPS) - 1);
  if (f !== lastFrame || force) { TRAILER.renderFrame(f, 1); lastFrame = f; }
  scrub.value = t; timeEl.textContent = `${fmt(t)} / ${fmt(DUR)}`;
}

function loop() {
  if (playing) {
    const t = aud.currentTime;
    if (t >= DUR - 1 / FPS || aud.ended) { playing = false; pp.textContent = 'REPLAY'; draw(DUR - 1 / FPS); }
    else draw(t);
  }
  requestAnimationFrame(loop);
}

async function boot() {
  if (window.__PACK_READY__) { loadEl.textContent = 'UNPACKING ASSETS'; await window.__PACK_READY__; }
  await TRAILER.init(p => { loadEl.textContent = `LOADING ${Math.round(p * 100)}%`; });
  if (capture) { gate.style.display = 'none'; bar.style.display = 'none'; window.__CAPTURE_READY__ = true; return; }
  loadEl.textContent = '';
  playBtn.disabled = false; playBtn.textContent = '▶ PLAY';
  draw(0, true);
  requestAnimationFrame(loop);
}

playBtn.addEventListener('click', async () => {
  gate.style.opacity = '0'; setTimeout(() => { gate.style.display = 'none'; }, 600);
  aud.currentTime = 0;
  try { await aud.play(); } catch (e) { console.warn('audio play blocked', e); }
  playing = true; pp.textContent = 'PAUSE'; bar.classList.add('show'); setTimeout(() => bar.classList.remove('show'), 2500);
});
pp.addEventListener('click', async () => {
  if (playing) { aud.pause(); playing = false; pp.textContent = 'PLAY'; }
  else {
    if (aud.currentTime >= DUR - 0.05) aud.currentTime = 0;
    try { await aud.play(); } catch (e) { }
    playing = true; pp.textContent = 'PAUSE';
  }
});
scrub.addEventListener('input', () => {
  const t = parseFloat(scrub.value);
  aud.currentTime = t; draw(t, true);
});
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); pp.click(); }
  if (e.code === 'ArrowRight') { const t = Math.min(DUR, aud.currentTime + 1 / FPS); aud.currentTime = t; draw(t, true); }
  if (e.code === 'ArrowLeft') { const t = Math.max(0, aud.currentTime - 1 / FPS); aud.currentTime = t; draw(t, true); }
});

boot().catch(e => { console.error(e); loadEl.textContent = 'ERROR: ' + e.message; });
