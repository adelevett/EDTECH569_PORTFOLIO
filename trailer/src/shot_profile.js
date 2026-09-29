import * as THREE from 'three';
import { Plate } from './plate.js';
import { makeFlecks, makeCuboids } from './overlay.js';
import { SpriteRig, Whiskers } from './characters.js';
import { evalRig, applyRig } from './camera.js';
import { P1 } from './shot_overlook.js';
import { clamp, lerp, smoothstep, ease, noise1, hash } from './util.js';
import { NOISE } from './glsl.js';

// S1b — ALPHA, CLOSE. She lifts her snout into the trace; charges run along simulated whiskers
// while motes of the "acrid formulation" stream in from the harbour bokeh.
import { SNIFFS } from './timeline.js';
export { SNIFFS };
export function shotProfile(ctx, lib) {
  const T = lib.tex;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 6000);
  const full = new Plate({ ...P1, color: T.P1_color, depth: T.P1_depth, grid: [320, 180] });
  scene.add(full.mesh);

  const H = 2.2;
  const rig = new SpriteRig(T.SP5_alpha_profile, H, { gx: 48, gy: 48 });
  const img = T.SP5_alpha_profile.image;
  const L = (px, py) => rig.local(px, py);
  rig.u.head.value.set(0, 0, 0.36, 0.66);
  rig.u.tint.value.setRGB(0.95, 0.97, 1.05);
  rig.u.rim.value.setRGB(0.3, 0.95, 1.3);
  rig.u.nose.value.set(1365 / 1400, 1 - 520 / 1377, 0.075, 0);
  rig.u.noseDir.value.set(0.35, 1.0);
  // anchor: the sprite sits in front of the camera, head left-of-centre, facing right toward the harbour
  const anchor = new THREE.Group(); anchor.add(rig.group); scene.add(anchor);
  rig.group.position.set(-L(900, 0).x - 0.62, -1.28, 0);

  const roots = [[1302, 566, -0.42, 0.55], [1312, 582, -0.22, 0.62], [1316, 598, -0.05, 0.66], [1310, 615, 0.1, 0.6], [1298, 628, 0.26, 0.52], [1286, 606, -0.12, 0.5], [1290, 590, 0.34, 0.45]];
  const wh = new Whiskers(roots.map(([x, y, a, len]) => { const p = L(x, y); return { root: [p.x, p.y], ang: a, len, curve: -0.25, w: 1 }; }), { width: 0.0042 });
  wh.group.position.z = 0.003; rig.group.add(wh.group);

  // inhaled trace: motes streaming from the harbour toward the nose
  const N = 260;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const sd = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) sd[i] = hash(i * 13 + 5);
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(sd, 4)); g.instanceCount = N;
  const nosePos = new THREE.Vector3();
  const mu = { time: { value: 0 }, target: { value: new THREE.Vector3() }, amt: { value: 0 }, cyan: { value: new THREE.Color(0.5, 1.0, 1.4) } };
  const motes = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: mu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 seed; uniform float time, amt; uniform vec3 target; varying vec2 vQ; varying float vA;
      void main(){
        float life = 1.6 + seed.w * 1.2;
        float ph = fract(time / life + seed.x);
        vec3 start = target + vec3(3.0 + seed.y * 9.0, (seed.z - 0.5) * 3.5, -6.0 - seed.x * 20.0);
        vec3 ctrl = mix(start, target, 0.55) + vec3(0.0, (seed.y - 0.4) * 1.2, 2.0);
        float e = ph * ph * (3.0 - 2.0 * ph);
        vec3 p = mix(mix(start, ctrl, e), mix(ctrl, target, e), e);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float sz = 0.008 + 0.018 * seed.z * (1.0 - e * 0.7);
        mv.xy += position.xy * sz * (1.0 + 2.0 * (1.0 - e));
        vQ = position.xy; vA = amt * smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.9, 1.0, ph));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 cyan; varying vec2 vQ; varying float vA; void main(){ float d = length(vQ) * 2.0; float a = exp(-d * d * 3.0); gl_FragColor = vec4(cyan * a * vA * 1.4, 1.0); }`,
  }));
  motes.frustumCulled = false; scene.add(motes);

  const flecks = makeFlecks(1800, { min: [-4, -3, -14], size: [8, 6, 14] }, { fall: 3, wind: 0.6, size: 0.012, streak: 5, squareFrac: 0.5, nearFade: 0.6, seed: 23, bright: 1.0 });
  scene.add(flecks);
  const cub = makeCuboids([{ p: [1.4, 0.9, -5.5], w: 0.6, h: 0.8, d: 0.6, div: 3, r: [0.3, 0.5, 0], w1: 0.25, op: 0.6 }, { p: [-2.2, 1.4, -9], w: 1.2, h: 1.0, d: 1.0, div: 4, r: [0.1, 0.2, 0], w1: -0.15, op: 0.45 }]);
  scene.add(cub);

  // sniff schedule (local time): quick twitch bursts
  const sniff = tau => {
    let a = 0;
    for (const [t0, n] of SNIFFS) for (let k = 0; k < n; k++) { const tk = t0 + k * 0.105; const x = (tau - tk) / 0.05; a += Math.exp(-x * x) * (k % 2 ? 0.7 : 1); }
    return a;
  };
  const keys = [
    { t: 0.0, pos: [0.0, 0.0, 0.0], look: [0.0, 0.0, -1.0], fov: 27, focus: 2.75, ap: 12 },
    { t: 1.6, pos: [0.08, 0.02, -0.32], look: [0.06, 0.02, -1.32], fov: 26, focus: 2.43, ap: 13 },
  ];
  // world placement: camera frame is rotated to look across the bay toward the lighthouse
  const yaw = THREE.MathUtils.degToRad(-12), pitch = THREE.MathUtils.degToRad(-3);
  const frameQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const base = new THREE.Vector3(1.0, -1.6, -3.0);

  return {
    frame(tau, t) {
      const r = evalRig(keys, tau, { handheld: 0.5, handheldFreq: 0.45, seed: 8 });
      // express the rig in the rotated frame
      const pos = new THREE.Vector3(...r.pos).applyQuaternion(frameQ).add(base);
      const look = new THREE.Vector3(...r.look).applyQuaternion(frameQ).add(base);
      applyRig(camera, { ...r, pos: pos.toArray(), look: look.toArray() });
      // Alpha sits 2.55 in front of the start camera, left of centre
      anchor.position.copy(new THREE.Vector3(0.12, -0.02, -2.75).applyQuaternion(frameQ).add(base));
      anchor.quaternion.copy(frameQ);
      const u = rig.u; u.time.value = t;
      const sn = sniff(tau);
      u.nose.value.w = sn * 0.012;
      u.head.value.set(-0.035 * smoothstep(0.0, 1.2, tau) + noise1(t * 0.8, 3) * 0.01, 0.004 * sn, 0.36, 0.66);
      u.breathe.value = Math.sin(t * 3.2) * 0.6; u.rimAmt.value = 0.5;
      const charge = smoothstep(0.25, 0.9, tau);
      wh.u.charge.value = charge; wh.u.glowK.value = 1.2;
      wh.update(tau, (tt, k) => sniff(tt) * 0.05 * (k % 2 ? -1 : 1) + Math.sin(tt * 1.7 + k) * 0.015);
      rig.group.updateMatrixWorld(true);
      const tipLocal = L(1368, 520); nosePos.set(tipLocal.x, tipLocal.y, 0); rig.group.localToWorld(nosePos);
      mu.target.value.copy(nosePos); mu.time.value = t; mu.amt.value = smoothstep(0.1, 0.6, tau);
      full.uniforms.time.value = t;
      flecks.u.time.value = t; cub.update(t);
      const sheets = [
        { z: -base.z + 0.8, size: 0.06, cov: 0.12, seed: 2.2, luma: 0.2, op: 0.5, freq: 1.6, drift: [0.06, 0], hollow: 1 },
        { z: 60, size: 1.1, cov: 0.16, seed: 8.8, luma: 0.5, op: 0.9, freq: 0.03, drift: [0.03, 0] },
        { z: 900, size: 14, cov: 0.4, seed: 4.4, luma: 1.0, op: 1.0, freq: 0.0014, drift: [0.004, 0] },
      ];
      return {
        scene, camera, mode: 'seaall', sheets,
        overlay: { amount: 1, glow: 0.45, grid: 0.05, hollow: 0.1 },
        lens: { focus: r.focus, aperture: r.ap, maxCoc: 30, bloomAmt: 0.5, bloomThreshold: 0.7, streakAmt: 0.25, ghostAmt: 0.08, ca: 0.02,
          vignette: 0.6, grain: 0.04, letterbox: 1, sat: 1.05, contrast: 1.05, lift: [0.004, 0.008, 0.016], halation: 0.08 },
      };
    },
  };
}
