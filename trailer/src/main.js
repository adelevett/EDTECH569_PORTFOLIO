import * as THREE from 'three';
import { rt, Pass } from './fx.js';
import { Post } from './post.js';
import { SeaAllPass } from './overlay.js';
import { jitterProjection, halton } from './camera.js';
import { loadAll } from './library.js';
import { buildShots, DURATION } from './shots.js';

const W = 1920, H = 1080, FPS = 30;
export const TRAILER = { W, H, FPS, DURATION, ready: false, debug: {} };
window.TRAILER = TRAILER;

const canvas = document.getElementById('c');
TRAILER.renderer = null;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false; renderer.setClearColor(0x000000, 1);
TRAILER.renderer = renderer; renderer.debug.checkShaderErrors = true;

const sceneRT = rt(W, H, { depth: true });
const ovRT = rt(W, H);
const post = new Post(renderer, W, H);
const seaAll = new SeaAllPass();
// graphite/title shots: pack linear depth into alpha without the Sea-All
const depthPack = new Pass(`uniform sampler2D tScene; uniform sampler2D tDepth; uniform float cNear, cFar; varying vec2 vUv;
  void main(){ float d = texture2D(tDepth, vUv).x; float z = d >= 0.99999 ? cFar : -(cNear*cFar)/((cFar-cNear)*d - cFar); gl_FragColor = vec4(texture2D(tScene, vUv).rgb, z); }`,
  { tScene: { value: null }, tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 100 } });

let shots = null;
const ctx = { renderer, W, H, THREE };

function shotAt(t) {
  const te = t + 1e-5;
  for (const s of shots) if (te >= s.t0 && te < s.t1) return s;
  return shots[shots.length - 1];
}

// Render one sub-frame at global time t into ovRT (HDR + linear depth in alpha). Returns lens params.
function renderSub(t, jitter) {
  const s = shotAt(t);
  const st = s.frame(t - s.t0 + 1e-5, t);
  const cam = st.camera;
  cam.updateProjectionMatrix();
  if (jitter) jitterProjection(cam, jitter[0], jitter[1], W, H);
  renderer.setRenderTarget(sceneRT);
  renderer.setClearColor(st.clear !== undefined ? st.clear : 0x000000, 1);
  renderer.clear(true, true, false);
  renderer.render(st.scene, cam);
  if (st.extra) st.extra(renderer, sceneRT, cam);
  if (st.mode === 'seaall' && !TRAILER.debug.noOverlay) {
    seaAll.setCamera(cam, W, H);
    seaAll.setSheets(st.sheets || []);
    const u = seaAll.u; const o = st.overlay || {};
    u.time.value = t; u.tScene.value = sceneRT.texture; u.tDepth.value = sceneRT.depthTexture;
    u.globalAmt.value = o.amount !== undefined ? o.amount : 1; u.flood.value = o.flood || 0; u.glitch.value = o.glitch || 0;
    u.glowAmt.value = o.glow !== undefined ? o.glow : 0.35; u.gridAmt.value = o.grid !== undefined ? o.grid : 0.05; u.hollowFrac.value = o.hollow !== undefined ? o.hollow : 0.12;
    u.beamAmt.value = o.beamAmt || 0; u.beamPow.value = o.beamPow || 60; u.quant.value = o.quant || 0; u.reveal.value = o.reveal !== undefined ? o.reveal : 1;
    if (o.beamPos) u.beamPos.value.copy(o.beamPos); if (o.beamDir) u.beamDir.value.copy(o.beamDir);
    seaAll.pass.render(renderer, ovRT);
  } else {
    depthPack.u.tScene.value = sceneRT.texture; depthPack.u.tDepth.value = sceneRT.depthTexture;
    depthPack.u.cNear.value = cam.near; depthPack.u.cFar.value = cam.far;
    depthPack.render(renderer, ovRT);
  }
  if (st.hud) { renderer.setRenderTarget(ovRT); renderer.render(st.hud, cam); }
  if (st.post2) st.post2(renderer, ovRT, cam);
  return st;
}

// Deterministic frame render. samples: sub-frames for motion blur + AA.
TRAILER.renderFrame = function (frame, samples = 1, shutter = 0.5) {
  const t = frame / FPS;
  const s = shotAt(t);
  const stepped = s.stepAt ? s.stepAt(t - s.t0) : (s.stepped || 0);
  const tq = stepped ? s.t0 + Math.floor((t - s.t0) * stepped + 1e-4) / stepped : t;
  // keep motion-blur sub-samples inside the segment that owns this frame (no double exposure across cuts)
  const cuts = [s.t0, ...(s.cuts || []), s.t1];
  let lo = s.t0, hi = s.t1; for (let k = 0; k < cuts.length - 1; k++) if (tq + 1e-5 >= cuts[k] && tq + 1e-5 < cuts[k + 1]) { lo = cuts[k]; hi = cuts[k + 1]; }
  const n = stepped ? Math.max(1, Math.min(samples, 4)) : samples;
  let lens = null;
  if (n === 1) {
    lens = renderSub(tq, null);
    post.run(ovRT.texture, Object.assign({ time: t }, lens.lens || {}, TRAILER.debug.noDof ? { aperture: 0 } : {}), null);
    return;
  }
  post.beginAccum();
  for (let i = 0; i < n; i++) {
    const off = stepped ? 0 : ((i + 0.5) / n - 0.5) * shutter / FPS;
    const tt = Math.max(0, Math.min(DURATION - 1e-4, tq + off));
    // keep sub-frames inside the current shot so cuts stay clean
    const ts = (tt < lo) ? lo + 1e-4 : (tt >= hi ? hi - 1e-4 : tt);
    const st = renderSub(ts, [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);
    post.addAccum(ovRT.texture, 1 / n);
    if (i === Math.floor(n / 2)) lens = st;
  }
  post.run(post.accum.texture, Object.assign({ time: t }, lens.lens || {}, TRAILER.debug.noDof ? { aperture: 0 } : {}), null);
};

TRAILER.readPixels = function () {
  const gl = renderer.getContext();
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
};
TRAILER.framePNG = function () { return canvas.toDataURL('image/png'); };

TRAILER.init = async function (onProgress) {
  const lib = await loadAll(ctx, onProgress);
  shots = buildShots(ctx, lib);
  for (const s of shots) if (s.prepare) await s.prepare();
  TRAILER.shots = shots.map(s => ({ name: s.name, t0: s.t0, t1: s.t1 }));
  TRAILER.ready = true;
};
