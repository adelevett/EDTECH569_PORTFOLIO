import * as THREE from 'three';
import { Plate, makeMask, sampleDepth } from './plate.js';
import { makeFlecks, makeCuboids, makeBeam, labelTexture, makeLabel } from './overlay.js';
import { SpriteRig, TailRibbon } from './characters.js';
import { evalRig, applyRig } from './camera.js';
import { clamp, lerp, smoothstep, ease, noise1, fbm1 } from './util.js';

// S1 — THE OVERLOOK. Boot-up of the Sea-All, then one crane move from the tiled sky down over the
// three navigators on the ridge toward Port Fauxlio. Beam flips the tiles it touches.
export const P1 = { fovY: 50, zNear: 6, zFar: 2600, gamma: 2.1 };

export function shotOverlook(ctx, lib) {
  const T = lib.tex;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 6000);

  const water = makeMask([960, 540], [
    { ch: 'r', blur: 5, pts: [[0.37, 0.46], [0.62, 0.43], [0.70, 0.46], [0.86, 0.49], [1.0, 0.50], [1.0, 0.79], [0.86, 0.77], [0.70, 0.745], [0.60, 0.70], [0.52, 0.62], [0.44, 0.53]] },
    { ch: 'r', blur: 4, pts: [[0.50, 0.308], [0.70, 0.308], [0.70, 0.36], [0.55, 0.40], [0.48, 0.37]] },
    { ch: 'r', blur: 4, pts: [[0.86, 0.31], [1.0, 0.31], [1.0, 0.48], [0.87, 0.47]] },
  ]);
  const bg = new Plate({ ...P1, color: T.P1_bg_color, depth: T.P1_bg_depth, grid: [320, 180], mask: water, waterAmp: 1.0, renderOrder: 0 });
  bg.mesh.scale.setScalar(1.015);
  const full = new Plate({ ...P1, color: T.P1_color, depth: T.P1_depth, grid: [480, 270], tearCut: 0.22, mask: water, waterAmp: 1.0, renderOrder: 1 });
  scene.add(bg.mesh, full.mesh);

  // --- the three navigators on the ridge path (seen from behind)
  const tails = lib.meta.tails;
  const place = (x, y) => Plate.unproject(P1, x, y, sampleDepth(T.P1_depth, x, y));
  const mice = [
    { name: 'charlie', tex: T.SP1_trio_0, key: 'SP1_trio_0', at: [0.318, 0.782], h: 3.3, seed: 3 },
    { name: 'bravo', tex: T.SP1_trio_1, key: 'SP1_trio_1', at: [0.392, 0.822], h: 3.95, seed: 5 },
    { name: 'alpha', tex: T.SP1_trio_2, key: 'SP1_trio_2', at: [0.478, 0.884], h: 4.4, seed: 9 },
  ].map(m => {
    const rig = new SpriteRig(m.tex, m.h);
    const p = place(...m.at);
    rig.group.position.copy(p);
    // face the plate camera (they look away from us, toward the city)
    rig.group.lookAt(new THREE.Vector3(0, p.y, 0));
    rig.u.tint.value.setRGB(0.92, 0.95, 1.05);
    rig.u.rim.value.setRGB(0.35, 0.85, 1.2);
    const tail = new TailRibbon(rig, tails[m.key], { seed: m.seed });
    scene.add(rig.group);
    // soft contact shadow
    const sh = new THREE.Mesh(new THREE.CircleGeometry(m.h * 0.42, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(1.2, 0.5, 1); sh.position.set(0, 0.01, 0.02);
    rig.group.add(sh);
    return Object.assign(m, { rig, tail, pos: p });
  });

  // --- Sea-All furniture: static-rain flecks, cuboids, beam, data labels
  const flecks = makeFlecks(5000, { min: [-14, -6, -34], size: [28, 22, 36] }, { fall: 7, wind: 1.0, size: 0.028, streak: 5, squareFrac: 0.45, nearFade: 1.2, seed: 11, bright: 1.1 });
  scene.add(flecks);
  const cub = makeCuboids([
    { p: [-220, 190, -620], w: 70, h: 90, d: 60, div: 6, r: [0.1, 0.5, 0], w1: 0.03, op: 0.7 },
    { p: [260, 240, -700], w: 110, h: 60, d: 80, div: 7, r: [0.2, -0.3, 0.1], w1: -0.02, op: 0.55 },
    { p: [40, 330, -900], w: 90, h: 90, d: 90, div: 5, r: [0.3, 0.2, 0], w1: 0.015, op: 0.5 },
    { p: [-40, 20, -95], w: 9, h: 12, d: 8, div: 4, r: [0.1, 0.6, 0], w1: 0.05, op: 0.6 },
    { p: [30, 14, -70], w: 6, h: 6, d: 6, div: 3, r: [0.4, 0.2, 0], w1: -0.06, op: 0.6 },
    { p: [-3.2, 2.6, -9], w: 1.1, h: 1.4, d: 1.0, div: 3, r: [0.2, 0.7, 0.1], w1: 0.1, op: 0.65, v: [0.05, 0, 0] },
    { p: [2.8, 1.9, -6.5], w: 0.7, h: 0.7, d: 0.7, div: 2, r: [0.5, 0.2, 0], w1: -0.12, op: 0.7, v: [-0.04, 0.02, 0] },
  ]);
  scene.add(cub);
  const lhPx = [0.778, 0.292];
  const L = place(...lhPx);
  const beam = makeBeam(900, 70);
  beam.position.copy(L); scene.add(beam);
  const lbl1 = makeLabel(labelTexture([{ text: 'PORT FAUXLIO' }, { text: 'SIGNAL 0.93  //  TRACE LOCKED', size: 30 }, { text: '47.2N  3.9W  -  ETA 00:41', size: 30 }], { w: 1024, h: 220 }), 1, 1024 / 220);
  const lbl2 = makeLabel(labelTexture([{ text: 'SEA OF MESTRE', size: 60 }, { text: 'INGGRADE PASSAGE  >>  0.8 NM', size: 30 }], { w: 1024, h: 180 }), 1, 1024 / 180);
  const cityPt = place(0.47, 0.33); const seaPt = place(0.70, 0.40);
  lbl1.scale.setScalar(cityPt.length() * 0.085); lbl1.position.copy(cityPt).add(new THREE.Vector3(cityPt.length() * 0.05, cityPt.length() * 0.02, 0));
  lbl2.scale.setScalar(seaPt.length() * 0.05); lbl2.position.copy(seaPt).add(new THREE.Vector3(seaPt.length() * 0.02, seaPt.length() * 0.035, 0));
  const hud = new THREE.Scene(); hud.add(lbl1, lbl2);

  const alpha = mice[2];
  const aHead = alpha.pos.clone().add(new THREE.Vector3(0, alpha.h * 0.8, 0));
  const endPos = new THREE.Vector3(-1.1, -1.0, -3.6);
  const endLook = new THREE.Vector3(60, -95, -520);
  const keys = [
    { t: 0.0, pos: [0.4, 1.0, 1.8], look: [-40, 120, -520], fov: 33, focus: 1500, ap: 0 },
    { t: 1.4, pos: [0.3, 0.8, 1.1], look: [-30, 88, -520], fov: 33, focus: 1500, ap: 0.5 },
    { t: 3.0, pos: [-0.2, -0.2, -1.2], look: [10, -30, -520], fov: 31, focus: 400, ap: 3 },
    { t: 3.55, pos: [-0.62, -0.55, -2.3], look: [34, -60, -520], fov: 30, focus: aHead.distanceTo(new THREE.Vector3(-0.62, -0.55, -2.3)), ap: 5.5 },
    { t: 4.6, pos: endPos.toArray(), look: endLook.toArray(), fov: 29, focus: aHead.distanceTo(endPos), ap: 6 },
  ];

  return {
    frame(tau, t) {
      const r = evalRig(keys, tau, { handheld: 0.25, handheldFreq: 0.3, seed: 4 });
      applyRig(camera, r);
      [bg, full].forEach(p => { p.uniforms.time.value = t; });
      flecks.u.time.value = t; flecks.u.opacity.value = smoothstep(0.1, 0.6, tau);
      cub.fade = smoothstep(0.5, 1.4, tau); cub.update(t);
      // beam sweeps from pointing right (east) toward the camera side
      const ang = lerp(1.55, 2.35, ease.inOutSine(clamp(tau / 4.6)));
      beam.rotation.set(0.0, -ang, 0);
      const bdir = new THREE.Vector3(0, 0, -1).applyEuler(beam.rotation);
      beam.u.time.value = t; beam.u.intensity.value = 1.1 * smoothstep(0.4, 1.2, tau);
      // labels type on
      [lbl1, lbl2].forEach((l, i) => {
        l.quaternion.copy(camera.quaternion);
        const a = smoothstep(1.6 + i * 0.5, 2.2 + i * 0.5, tau) * (1 - smoothstep(4.0, 4.5, tau));
        l.material.uniforms.opacity.value = a; l.material.uniforms.reveal.value = smoothstep(1.6 + i * 0.5, 2.5 + i * 0.5, tau);
        l.material.uniforms.time.value = t;
      });
      // mice: breathing, weight shifts, tail sims, Alpha lifts her snout to the trace
      mice.forEach((m, i) => {
        const u = m.rig.u; u.time.value = t;
        u.breathe.value = Math.sin(t * 2.2 + i * 1.7) * 0.8;
        u.sway.value = noise1(t * 0.5 + i * 3, 30 + i) * 0.02;
        u.hem.value.set(0.012 + 0.006 * Math.sin(t * 0.8 + i), 0.3, 1.2);
        u.bob.value = Math.sin(t * 2.2 + i * 1.7) * 0.004;
        u.rimAmt.value = 0.35;
        let headRot = noise1(t * 0.7 + i * 5, 40 + i) * 0.03;
        let nod = 0;
        if (m.name === 'alpha') { const s = smoothstep(2.9, 3.7, tau); headRot += s * 0.1; nod = s * 0.012; }
        if (m.name === 'bravo') headRot += Math.sin(t * 1.3) * 0.02;
        u.head.value.set(headRot, nod, m.name === 'charlie' ? 0.70 : m.name === 'bravo' ? 0.72 : 0.70, 0.62);
        m.tail.update(tau);
      });
      // Sea-All: boot quantisation 1 -> 0 in stepped levels, then drifting sheets
      const boot = tau < 0.75 ? 1 : tau < 1.45 ? [0.6, 0.36, 0.2, 0.09, 0][Math.min(4, Math.floor((tau - 0.75) / 0.7 * 5))] : 0;
      const reveal = smoothstep(0.1, 0.75, tau);
      const expo = 1.0;
      const sheets = [
        { z: 1.0, size: 0.16, cov: 0.10, seed: 3.1, luma: 0.1, op: 0.6, freq: 0.5, drift: [0.05, 0.0], hollow: 1 },
        { z: 40, size: 0.9, cov: 0.12, seed: 7.7, luma: 0.3, op: 0.8, freq: 0.03, drift: [0.02, 0.0] },
        { z: 300, size: 5.0, cov: 0.13, seed: 1.3, luma: 0.25, op: 1.0, freq: 0.004, drift: [0.01, 0.0] },
        { z: 1250, size: 18, cov: 0.46, seed: 5.9, luma: 1.1, op: 1.0, freq: 0.0011, drift: [0.004, 0.0] },
      ];
      const focusD = r.focus;
      return {
        scene, camera, mode: 'seaall', sheets, hud,
        overlay: { amount: 1, glow: 0.4, grid: 0.06, hollow: 0.10, quant: boot, reveal, beamPos: L, beamDir: bdir, beamAmt: 1.0 * smoothstep(0.8, 1.6, tau), beamPow: 90 },
        lens: {
          focus: focusD, aperture: r.ap, maxCoc: 22, exposure: expo * 1.02, bloomAmt: 0.42, bloomThreshold: 0.75, streakAmt: 0.35, ghostAmt: 0.12, ca: 0.018,
          vignette: 0.55, grain: 0.04, letterbox: 1, sat: 1.05, contrast: 1.04, lift: [0.004, 0.008, 0.016], gain: [1.0, 0.99, 1.02], halation: 0.06,
        },
      };
    },
  };
}
