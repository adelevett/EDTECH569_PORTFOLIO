import * as THREE from 'three';
import { track, fbm1 } from './util.js';

// Camera rig: keyed position / look-at / fov / roll / focus with handheld noise.
// keys: [{t, pos:[x,y,z], look:[x,y,z], fov, roll, focus, ap}]
export function evalRig(keys, t, o = {}) {
  const pick = k => keys.map(x => ({ t: x.t, v: x[k], ease: x.ease, flat: x.flat }));
  const pos = track(pick('pos'), t), look = track(pick('look'), t);
  const fov = track(pick('fov'), t), roll = keys[0].roll !== undefined ? track(pick('roll'), t) : 0;
  // focus pulls and iris changes are eased and monotone (flat tangents: no overshoot)
  const pickFlat = k => keys.map(x => ({ t: x.t, v: x[k], flat: true }));
  const focus = keys[0].focus !== undefined ? Math.max(0.05, track(pickFlat('focus'), t)) : 10;
  const ap = keys[0].ap !== undefined ? Math.max(0, track(pickFlat('ap'), t)) : 0;
  const hh = o.handheld || 0, hf = o.handheldFreq || 0.35, seed = o.seed || 1;
  const tt = o.stepped ? Math.floor(t * o.stepped) / o.stepped : t;
  const shake = [fbm1(tt * hf, seed) * hh, fbm1(tt * hf, seed + 11) * hh * 0.7, fbm1(tt * hf * 1.3, seed + 23) * hh * 0.5];
  return { pos, look, fov, roll: roll + shake[2] * 0.6, focus, ap, shake };
}

export function applyRig(cam, r, aspect = 16 / 9) {
  cam.fov = r.fov; cam.aspect = aspect; cam.updateProjectionMatrix();
  cam.position.set(...r.pos);
  const up = new THREE.Vector3(0, 1, 0);
  cam.up.copy(up);
  cam.lookAt(new THREE.Vector3(...r.look));
  // handheld: small extra yaw/pitch in camera space, then roll
  cam.rotateY(r.shake[0] * 0.02); cam.rotateX(r.shake[1] * 0.02);
  cam.rotateZ(THREE.MathUtils.degToRad(r.roll || 0));
  cam.updateMatrixWorld();
}

// sub-pixel jitter for accumulation AA
export function jitterProjection(cam, jx, jy, W, H) {
  cam.projectionMatrix.elements[8] += (jx * 2) / W;
  cam.projectionMatrix.elements[9] += (jy * 2) / H;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

export function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
