import * as THREE from 'three';
import { Plate, makeMask, sampleDepth } from './plate.js';
import { makeFlecks, makeCuboids, makeBeam, labelTexture, makeLabel } from './overlay.js';
import { SpriteRig } from './characters.js';
import { evalRig, applyRig } from './camera.js';
import { clamp, lerp, smoothstep, ease, noise1, fbm1 } from './util.js';

// S2 — THE DOCKS. Low dolly over rain-slick cobbles behind the three running for the ship.
// The lamp group is a separate depth layer over a clean plate, so the parallax is real.
export function docksPlates(lib, opts = {}) {
  const T = lib.tex, cal = lib.meta.depthcal;
  const mask = makeMask([960, 540], [
    { ch: 'r', blur: 4, pts: [[0.24, 0.525], [0.63, 0.515], [0.63, 0.648], [0.24, 0.632]] },
    { ch: 'r', blur: 4, pts: [[0.12, 0.53], [0.25, 0.53], [0.25, 0.60], [0.12, 0.60]] },
    { ch: 'g', blur: 8, pts: [[0.13, 0.648], [0.62, 0.648], [0.76, 0.70], [1.0, 0.80], [1.0, 1.0], [0.10, 1.0]] },
    { ch: 'b', img: T.P2_shipregion.image },
  ]);
  const base = { fovY: 55, d0: 0.2, zFar: 420, gamma: 1.25 };
  return { mask, base, cal };
}

export function shotDocks(ctx, lib) {
  const T = lib.tex;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.03, 3000);
  const { mask, base, cal } = docksPlates(lib);
  const PB = { ...base, K: cal.P2_clean.K, B: cal.P2_clean.B };
  const PF = { ...base, K: cal.P2.K, B: cal.P2.B };
  const bg = new Plate({ ...PB, color: T.P2_clean_color, depth: T.P2_clean_depth, grid: [480, 270], mask, waterAmp: 1.0, rippleAmp: 1.0, renderOrder: 0 });
  const fgm = lib.meta.P2_fg;
  const fg = new Plate({ ...PF, color: T.P2_fg, depth: T.P2_depth, grid: [160, 300], alpha: true, tearCut: 0.25, renderOrder: 2,
    uvRect: [fgm.x / fgm.W, 1 - (fgm.y + fgm.h) / fgm.H, fgm.w / fgm.W, fgm.h / fgm.H] });
  scene.add(bg.mesh, fg.mesh);

  // --- the run: pose sets played on twos-and-threes with real timing
  const runs = lib.meta.runs;
  const mk = (name, h, lane) => {
    const frames = runs[name].map((f, i) => {
      const rig = new SpriteRig(T[`SP2_run_${name}_${i}`], h * f.h / 780);
      const baseline = Math.max(...runs[name].map(q => q.foot));
      rig.lift = (baseline - f.foot) * (h / 780);
      rig.shiftX = ((f.x + f.w / 2) - f.cx) * (h / 780);
      rig.u.tint.value.setRGB(0.9, 0.93, 1.0); rig.u.rim.value.setRGB(0.4, 0.9, 1.25); rig.u.rimAmt.value = 0.45;
      scene.add(rig.group); return rig;
    });
    return { name, frames, h, lane };
  };
  const mice = [mk('bravo', 1.18, 0), mk('alpha', 1.22, 1), mk('charlie', 1.0, 2)];
  // path: start/end positions on the quay (z negative = away); Bravo leads toward the gangplank
  const lanes = [
    { p0: [0.55, -1.0, -4.6], p1: [1.75, -1.0, -8.6], phase: 0.0, rate: 11.5 },
    { p0: [-0.35, -1.0, -3.9], p1: [0.85, -1.0, -7.7], phase: 1.3, rate: 11.0 },
    { p0: [-1.0, -1.0, -3.2], p1: [0.05, -1.0, -6.7], phase: 2.2, rate: 12.5 },
  ];
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const shadows = mice.map(m => { const s = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), shadowMat); s.rotation.x = -Math.PI / 2; s.scale.set(1.3, 0.55, 1); scene.add(s); return s; });

  const rain = makeFlecks(4500, { min: [-6, -2, -14], size: [12, 8, 16] }, { fall: 24, wind: 2.5, size: 0.007, streak: 14, squareFrac: 0.0, nearFade: 0.6, seed: 3, bright: 0.45 });
  rain.u.cyan.value.setRGB(0.75, 0.85, 1.0);
  const flecks = makeFlecks(2500, { min: [-6, -2, -14], size: [12, 8, 16] }, { fall: 3, wind: 0.8, size: 0.02, streak: 4, squareFrac: 0.8, nearFade: 0.5, seed: 29, bright: 1.2 });
  scene.add(rain, flecks);
  const cub = makeCuboids([
    { p: [2.4, 1.6, -9], w: 0.9, h: 1.2, d: 0.9, div: 3, r: [0.2, 0.6, 0], w1: 0.15, op: 0.55 },
    { p: [-3.5, 3.5, -16], w: 2.2, h: 1.6, d: 2.0, div: 4, r: [0.3, 0.1, 0], w1: -0.08, op: 0.45 },
    { p: [0.6, 0.4, -1.4], w: 0.25, h: 0.25, d: 0.25, div: 2, r: [0.6, 0.3, 0], w1: 0.4, op: 0.6 },
  ]);
  scene.add(cub);
  const lh = Plate.unproject(PB, 0.60, 0.33, sampleDepth(T.P2_clean_depth, 0.60, 0.33));
  const beam = makeBeam(lh.length() * 1.2, lh.length() * 0.09); beam.position.copy(lh); scene.add(beam);
  const shipPt = Plate.unproject(PB, 0.84, 0.27, sampleDepth(T.P2_clean_depth, 0.84, 0.27));
  const lbl = makeLabel(labelTexture([{ text: 'MS COMPEAUX-NANTES' }, { text: 'BERTH 7  //  BOARDING  //  DEPARTS 23:59', size: 30 }, { text: 'INGGRADE PASSAGE  -  CLEARANCE: GRANTED', size: 30 }], { w: 1400, h: 220 }), 1, 1400 / 220);
  lbl.scale.setScalar(0.85); lbl.position.set(2.75, 1.5, -12.5);
  const hud = new THREE.Scene(); hud.add(lbl);

  const keys = [
    { t: 0.0, pos: [0.0, -0.32, 0.5], look: [0.5, -0.5, -12], fov: 40, focus: 5.0, ap: 5 },
    { t: 1.7, pos: [0.15, -0.3, -0.5], look: [1.1, -0.42, -14], fov: 39, focus: 5.6, ap: 5 },
    { t: 3.4, pos: [0.35, -0.22, -1.45], look: [2.4, -0.2, -14], fov: 37, focus: 6.4, ap: 4.5 },
  ];
  return {
    frame(tau, t) {
      const r = evalRig(keys, tau, { handheld: 1.1, handheldFreq: 1.1, seed: 12 });
      applyRig(camera, r);
      [bg, fg].forEach(p => { p.uniforms.time.value = t; p.uniforms.rock.value.set(Math.sin(t * 0.8) * 0.004, 0.8, 0.45, 0); });
      mice.forEach((m, i) => {
        const L = lanes[i];
        const s = ease.inOutSine(clamp(tau / 3.4)) * 0.85 + clamp(tau / 3.4) * 0.15;
        const p = new THREE.Vector3(...L.p0).lerp(new THREE.Vector3(...L.p1), s);
        const fi = Math.floor(tau * L.rate + L.phase) % 4;
        m.frames.forEach((rig, k) => {
          rig.group.visible = k === fi;
          rig.group.position.set(p.x + rig.shiftX * 0.0, p.y + rig.lift, p.z);
          rig.group.lookAt(camera.position.x, p.y + rig.lift, camera.position.z);
          const u = rig.u; u.time.value = t;
          u.hem.value.set(0.03, 0.35, 3.0); u.sway.value = Math.sin(tau * L.rate * Math.PI / 2 + i) * 0.035;
          u.squash.value = (k === 1 ? 0.04 : k === 3 ? -0.03 : 0.0);
        });
        shadows[i].position.set(p.x, -0.995, p.z); shadows[i].scale.multiplyScalar(0.75);
        const air = m.frames[fi].lift; shadows[i].scale.set(1.3 * (1 - air * 0.6), 0.55 * (1 - air * 0.6), 1);
      });
      rain.u.time.value = t; flecks.u.time.value = t; cub.update(t);
      // beam swings round toward the lens; at the end it floods the frame (transition)
      const ang = lerp(-2.1, -3.08, ease.inCubic(clamp(tau / 3.4)));
      beam.rotation.set(0.0, ang, 0); beam.u.time.value = t;
      const hit = smoothstep(2.85, 3.35, tau);
      beam.u.intensity.value = 1.2 + hit * 3.0;
      const bdir = new THREE.Vector3(0, 0, -1).applyEuler(beam.rotation);
      lbl.quaternion.copy(camera.quaternion);
      const la = smoothstep(0.4, 0.9, tau) * (1 - smoothstep(2.6, 3.0, tau));
      lbl.material.uniforms.opacity.value = la; lbl.material.uniforms.reveal.value = smoothstep(0.4, 1.3, tau); lbl.material.uniforms.time.value = t;
      const sheets = [
        { z: 1.2, size: 0.07, cov: 0.10, seed: 6.1, luma: 0.2, op: 0.55, freq: 1.2, drift: [0.08, 0], hollow: 1 },
        { z: 7, size: 0.22, cov: 0.10, seed: 2.7, luma: 0.4, op: 0.85, freq: 0.25, drift: [0.03, 0] },
        { z: 40, size: 1.3, cov: 0.16, seed: 9.3, luma: 0.6, op: 1.0, freq: 0.04, drift: [0.01, 0] },
        { z: 220, size: 6.5, cov: 0.30, seed: 4.2, luma: 0.8, op: 1.0, freq: 0.008, drift: [0.004, 0] },
      ];
      return {
        scene, camera, mode: 'seaall', sheets, hud,
        overlay: { amount: 1, glow: 0.4, grid: 0.05, hollow: 0.1, beamPos: lh, beamDir: bdir, beamAmt: 0.8, beamPow: 40 },
        lens: { focus: r.focus, aperture: r.ap, maxCoc: 22, bloomAmt: 0.45 + hit * 1.5, bloomThreshold: 0.75 - hit * 0.5, streakAmt: 0.45 + hit * 2.0, ghostAmt: 0.15 + hit * 0.6,
          ca: 0.018, vignette: 0.55, grain: 0.045, letterbox: 1, sat: 1.05, contrast: 1.05, lift: [0.004, 0.008, 0.016], halation: 0.08,
          flash: smoothstep(3.1, 3.4, tau) * 0.95, flashColor: [0.92, 0.97, 1.0], exposure: 1 + hit * 0.8 },
      };
    },
  };
}
