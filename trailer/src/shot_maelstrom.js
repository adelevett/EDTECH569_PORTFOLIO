import * as THREE from 'three';
import { Plate } from './plate.js';
import { makeFlecks, makeCuboids, labelTexture } from './overlay.js';
import { SpriteRig, Whiskers } from './characters.js';
import { RottVoxels, glyphAtlas, makeGlyphStreams } from './rott.js';
import { docksPlates } from './shot_docks.js';
import { evalRig, applyRig } from './camera.js';
import { Pass, rt } from './fx.js';
import { clamp, lerp, smoothstep, ease, noise1, hash } from './util.js';
import { NOISE, COMMON } from './glsl.js';

// S4 — THE MAELSTROM. Hard cuts on hits: the harbour spirals into a void; Bravo leaps; her hand
// shreds PORT FAUXLIO; Alpha screams; the overlay floods the frame.
import { MAEL_CUTS } from './timeline.js';
export { MAEL_CUTS };

export function shotMaelstrom(ctx, lib) {
  const T = lib.tex, W = ctx.W, H = ctx.H;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.03, 4000);
  const { mask, base, cal } = docksPlates(lib);
  const PN = { ...base, zFar: 1100, skyCut: 0.105, K: cal.P2_noship.K, B: cal.P2_noship.B };
  const bg = new Plate({ ...PN, color: T.P2_noship_color, depth: T.P2_noship_depth, grid: [320, 180], mask, waterAmp: 2.0, rippleAmp: 1.0 });
  scene.add(bg.mesh);

  // Bravo's leap (pose) — flies into the void
  const leap = new SpriteRig(T.SP3_bravo_leap, 2.0);
  leap.u.tint.value.setRGB(0.75, 0.85, 1.0); leap.u.rim.value.setRGB(0.5, 1.0, 1.4); leap.u.rimAmt.value = 1.0;
  scene.add(leap.group);

  // Rott's hand (voxels) and the PORT FAUXLIO label it shreds
  const hand = new RottVoxels(lib.bin.hand, { w: 150, h: 84, relief: 30, cell: 150 / 219, seed: 19 });
  hand.u.eyes.value.set(9, 9, 9, 9); hand.u.jawBox.value.set(9, 9, 9, 9);
  const handG = new THREE.Group(); handG.add(hand.mesh); scene.add(handG);
  const lblTex = labelTexture([{ text: 'PORT FAUXLIO', size: 150 }, { text: 'DESTINATION  //  VERIFIED  //  100%', size: 44 }], { w: 1600, h: 300, pad: 20 });
  const shatterU = { map: { value: lblTex }, shatter: { value: 0 }, time: { value: 0 }, opacity: { value: 1 } };
  const label = new THREE.Mesh(new THREE.PlaneGeometry(64, 12, 64, 12), new THREE.ShaderMaterial({
    uniforms: shatterU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `${NOISE} uniform float shatter, time; varying vec2 vUv; varying float vS;
      void main(){ vUv = uv; vec2 cell = floor(uv * vec2(32.0, 6.0)); float r = hash12(cell);
        vec3 p = position; float s = clamp(shatter * 1.6 - r * 0.6, 0.0, 1.0);
        p += vec3((r - 0.5) * 60.0, (hash12(cell + 3.0) - 0.3) * 40.0, (hash12(cell + 7.0) - 0.5) * 50.0) * s * s;
        vS = s; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv; varying float vS;
      void main(){ vec4 c = texture2D(map, vUv); vec2 f = fract(vUv * vec2(32.0, 6.0)); float e = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
        vec3 col = c.rgb * c.a * 1.25 + vec3(0.4, 1.0, 1.3) * (1.0 - smoothstep(0.0, 0.06, e)) * vS * 0.5;
        gl_FragColor = vec4(col * opacity * (1.0 - vS * 0.7) * 0.8, 1.0); }`,
  }));
  label.frustumCulled = false; scene.add(label);
  const glyphs = makeGlyphStreams(900, glyphAtlas(), { size: 2.2 }); scene.add(glyphs);

  // Alpha, screaming (close-up) + bristling simulated whiskers + maelstrom in her goggles
  const ecu = new SpriteRig(T.SP4_alpha_scream, 1.5, { gx: 40, gy: 30 });
  ecu.u.tint.value.setRGB(0.92, 0.96, 1.05); ecu.u.rim.value.setRGB(0.4, 1.0, 1.4); ecu.u.rimAmt.value = 0.8;
  ecu.u.head.value.set(0, 0, 0.1, 0.5);
  scene.add(ecu.group);
  const EL = (px, py) => ecu.local(px, py);
  const wroots = [[268, 432, 3.5, 0.34], [276, 446, 3.3, 0.4], [282, 458, 3.1, 0.38], [262, 420, 3.75, 0.3], [290, 470, 2.95, 0.33], [300, 440, 3.6, 0.28]];
  const ewh = new Whiskers(wroots.map(([x, y, a, len]) => { const p = EL(x, y); return { root: [p.x, p.y], ang: a, len, curve: 0.15 }; }), { width: 0.0035 });
  ewh.group.position.z = 0.004; ecu.group.add(ewh.group);
  const lensU = { time: { value: 0 }, amt: { value: 1 } };
  const lensMat = new THREE.ShaderMaterial({
    uniforms: lensU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE} uniform float time, amt; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a = atan(d.y, d.x) + time * 2.5 + 1.2 / (r + 0.15);
        float sw = vnoise(vec2(a * 3.0, r * 6.0 - time * 3.0)) * vnoise(vec2(a * 7.0 + 2.0, r * 11.0));
        vec3 c = vec3(0.35, 0.95, 1.35) * pow(sw, 2.0) * 2.2 * (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.0, 0.25, r);
        c += vec3(1.0) * exp(-pow((vUv.x - 0.33) * 9.0, 2.0) - pow((vUv.y - 0.68) * 9.0, 2.0)) * 0.9;
        gl_FragColor = vec4(c * amt, 1.0); }`,
  });
  const lensA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lensMat), lensB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lensMat);
  const la = EL(525, 320), lb = EL(240, 330);
  const pxW = ecu.w / T.SP4_alpha_scream.image.width;
  lensA.position.set(la.x, la.y, 0.006); lensA.scale.set(205 * pxW, 205 * pxW, 1);
  lensB.position.set(lb.x, lb.y, 0.006); lensB.scale.set(120 * pxW, 130 * pxW, 1);
  ecu.group.add(lensA, lensB);

  const flecks = makeFlecks(3000, { min: [-8, -3, -18], size: [16, 12, 20] }, { fall: -2, wind: 4, size: 0.03, streak: 3, squareFrac: 0.85, nearFade: 0.4, seed: 41, bright: 1.6 });
  scene.add(flecks);
  const cub = makeCuboids([{ p: [2, 1.2, -6], w: 0.9, h: 0.9, d: 0.9, div: 3, r: [0.4, 0.2, 0], w1: 1.2, op: 0.7 }, { p: [-2.5, 2.5, -9], w: 1.6, h: 1.1, d: 1.3, div: 4, r: [0.1, 0.2, 0], w1: -0.9, op: 0.6 }]);
  scene.add(cub);

  // vortex post: swirls the frame into a void and breaks it into tiles near the eye
  const tmp = rt(W, H);
  const vortex = new Pass(`${NOISE} ${COMMON} uniform sampler2D src; uniform vec2 center; uniform float amt, time, aspect, hole, tiles; varying vec2 vUv;
    void main(){
      vec2 d = vUv - center; d.x *= aspect; float r = length(d);
      float ang = amt * (0.35 / (r + 0.06)) + time * 2.2 * amt;
      float pull = 1.0 + amt * 0.35 * (1.0 - smoothstep(0.0, 0.9, r));
      vec2 dd = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d * pull;
      vec2 uv = center + vec2(dd.x / aspect, dd.y);
      float ts = mix(0.004, 0.03, tiles * (1.0 - smoothstep(0.0, 0.7, r)));
      vec2 q = floor(uv / vec2(ts / aspect * 1.0, ts)) ;
      vec2 uq = (q + 0.5) * vec2(ts / aspect, ts);
      float brk = step(0.55, hash12(q + floor(time * 8.0))) * tiles * (1.0 - smoothstep(0.1, 0.6, r));
      vec4 c = texture2D(src, clamp(mix(uv, uq, brk), 0.001, 0.999));
      float void_ = smoothstep(hole * 0.55, hole, r);
      vec3 col = c.rgb * void_;
      col += vec3(0.35, 0.95, 1.3) * exp(-pow((r - hole) * 18.0, 2.0)) * amt * 1.5;
      gl_FragColor = vec4(col, c.a);
    }`, { src: { value: null }, center: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, time: { value: 0 }, aspect: { value: W / H }, hole: { value: 0.1 }, tiles: { value: 0 } });
  const copy = new Pass(`uniform sampler2D src; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv); }`, { src: { value: null } });

  const setVis = seg => {
    leap.group.visible = seg === 1;
    handG.visible = seg === 2; label.visible = seg === 2 || seg === 0; glyphs.visible = seg === 2;
    ecu.group.visible = seg === 3;
  };
  const labelPos = new THREE.Vector3(-8, 26, -120);
  label.position.copy(labelPos); label.lookAt(0, 0, 0);

  return {
    cutsLocal: MAEL_CUTS.slice(1, 4),
    frame(tau, t) {
      const seg = tau < MAEL_CUTS[1] ? 0 : tau < MAEL_CUTS[2] ? 1 : tau < MAEL_CUTS[3] ? 2 : 3;
      setVis(seg);
      bg.uniforms.time.value = t; flecks.u.time.value = t; cub.update(t);
      let vAmt = 0, vCenter = [0.5, 0.52], vHole = 0.0, vTiles = 0, keys, lens = {}, sheets, ov = {}, hh = 0.6;
      if (seg === 0) {
        const s = tau / MAEL_CUTS[1];
        keys = [{ t: 0, pos: [0, -0.3, 0.8], look: [0.2, 0.6, -30], fov: 48, focus: 30, ap: 1, roll: 0 }, { t: 1, pos: [0, -0.35, 0.2], look: [0.2, 0.5, -30], fov: 42, focus: 30, ap: 1, roll: -14 }];
        vAmt = 0.3 + 0.9 * s; vHole = 0.05 + 0.12 * s; vTiles = 0.3 + 0.6 * s; vCenter = [0.53, 0.56];
        label.visible = true; shatterU.shatter.value = 0; shatterU.opacity.value = 0.8;
        label.position.set(-10, 24, -110);
        sheets = [{ z: 1.2, size: 0.08, cov: 0.25, seed: 6.1, luma: 0.3, op: 0.7, freq: 1.0, drift: [0.4, 0.2], hollow: 1 }, { z: 20, size: 0.6, cov: 0.3 + 0.2 * s, seed: 2.2, luma: 0.5, op: 1, freq: 0.08, drift: [0.2, 0.1] }];
      } else if (seg === 1) {
        const s = (tau - MAEL_CUTS[1]) / (MAEL_CUTS[2] - MAEL_CUTS[1]);
        keys = [{ t: 0, pos: [0, 0.4, 1.2], look: [0, 0.2, -30], fov: 50, focus: 4, ap: 3, roll: 8 }, { t: 1, pos: [0, 0.35, 0.8], look: [0, 0.1, -30], fov: 46, focus: 7, ap: 3, roll: 14 }];
        const e = ease.inCubic(s);
        leap.group.position.set(0.25 - 0.2 * e, 0.1 - 0.9 * e, -2.4 - 9 * e);
        leap.group.rotation.set(0, 0, -0.3 - 1.2 * e);
        leap.u.hem.value.set(0.05, 0.5, 5.0); leap.u.time.value = t;
        vAmt = 1.2; vHole = 0.2 + 0.08 * s; vTiles = 0.9; vCenter = [0.5, 0.45];
        sheets = [{ z: 1.0, size: 0.07, cov: 0.3, seed: 1.1, luma: 0.3, op: 0.8, freq: 1.4, drift: [0.6, -0.2], hollow: 1 }, { z: 25, size: 0.7, cov: 0.45, seed: 3.3, luma: 0.5, op: 1, freq: 0.08, drift: [0.3, 0.2] }];
      } else if (seg === 2) {
        const s = (tau - MAEL_CUTS[2]) / (MAEL_CUTS[3] - MAEL_CUTS[2]);
        keys = [{ t: 0, pos: [0, -0.5, 1], look: [-1.5, 5.5, -30], fov: 44, focus: 120, ap: 0.8, roll: -6 }, { t: 1, pos: [0, -0.5, 1.4], look: [-1.3, 5.6, -30], fov: 41, focus: 120, ap: 0.8, roll: -9 }];
        label.position.copy(labelPos); label.lookAt(0, 0, 0);
        shatterU.shatter.value = smoothstep(0.35, 0.95, s); shatterU.opacity.value = 1; shatterU.time.value = t;
        // the hand sweeps in from the right and closes on the label
        const e = ease.inOutCubic(clamp(s * 1.25));
        handG.position.set(lerp(95, -6, e), lerp(-10, 28, e), lerp(-150, -126, e));
        handG.rotation.set(0.2, -0.5 + 0.4 * e, lerp(-0.9, 0.35, e));
        handG.scale.set(lerp(1, 0.75, smoothstep(0.5, 1, s)), 1, 1);
        const hu = hand.u; hu.time.value = t; hu.assemble.value = 1; hu.decay.value = 0.05 + 0.2 * s; hu.emissive.value = 0.8; hu.glitch.value = 0.4; hu.breathe.value = 0; hu.scatter.value = 0.3;
        glyphs.u.time.value = t; glyphs.u.mouth.value.copy(labelPos); glyphs.u.src.value.copy(labelPos); glyphs.u.spew.value = 1.0; glyphs.u.amt.value = smoothstep(0.4, 0.7, s);
        vAmt = 0.5; vHole = 0.0; vTiles = 0.4; vCenter = [0.5, 0.35];
        sheets = [{ z: 20, size: 0.6, cov: 0.35, seed: 5.5, luma: 0.5, op: 1, freq: 0.08, drift: [0.2, 0.1] }, { z: 400, size: 9, cov: 0.4, seed: 9.9, luma: 0.9, op: 1, freq: 0.006, drift: [0.05, 0.02] }];
      } else {
        const s = (tau - MAEL_CUTS[3]) / (MAEL_CUTS[4] - MAEL_CUTS[3]);
        keys = [{ t: 0, pos: [0, 0, 0], look: [0, 0, -10], fov: 34, focus: 1.9, ap: 9, roll: 0 }, { t: 1, pos: [0, 0, -0.35], look: [0, 0, -10.35], fov: 30, focus: 1.6, ap: 10, roll: -5 }];
        ecu.group.position.set(-0.02, -0.72, -1.95);
        ecu.group.rotation.set(0, 0, 0);
        const scream = smoothstep(0.02, 0.12, s);
        ecu.u.time.value = t; ecu.u.shake.value.set(Math.sin(t * 70) * 0.006 * scream, Math.cos(t * 63) * 0.004 * scream);
        ecu.u.breathe.value = 0; lensU.time.value = t;
        ewh.u.charge.value = 1.0; ewh.u.glowK.value = 1.4;
        ewh.update(tau, (tt, k) => Math.sin(tt * 55 + k * 2) * 0.12 * scream + (k - 2.5) * 0.08 * scream);
        vAmt = 1.4; vHole = 0.25; vTiles = 1.0; vCenter = [0.72, 0.5];
        const fl = smoothstep(0.35, 0.95, s);
        ov = { flood: fl * 0.9, glitch: 0.3 + 0.7 * fl };
        sheets = [{ z: 0.9, size: 0.05, cov: 0.15 + 0.5 * fl, seed: 4.4, luma: 0.2, op: 0.9, freq: 2.0, drift: [0.8, 0.4] }, { z: 6, size: 0.25, cov: 0.3 + 0.5 * fl, seed: 7.2, luma: 0.4, op: 1, freq: 0.3, drift: [0.4, 0.3] }];
        hh = 0.9;
        lens = { flash: smoothstep(0.93, 1.0, s), flashColor: [0.9, 0.97, 1.0], exposure: 1 + 0.8 * fl };
      }
      if (seg === 2) {
        lens = { bloomAmt: 0.35, bloomThreshold: 0.9, streakAmt: 0.12 };
      }
      const r = evalRig(keys, (tau - MAEL_CUTS[seg]) / (MAEL_CUTS[seg + 1] - MAEL_CUTS[seg]), { handheld: hh, handheldFreq: 1.4, seed: 60 + seg });
      applyRig(camera, r);
      bg.uniforms.swirl.value.set(vAmt, vCenter[0], vCenter[1], vHole); bg.uniforms.swirlTiles.value = vTiles;
      return {
        scene, camera, mode: 'seaall', sheets,
        overlay: Object.assign({ amount: 1, glow: 0.55, grid: 0.1, hollow: 0.1, glitch: 0.3 }, ov),

        lens: Object.assign({ focus: r.focus, aperture: r.ap, maxCoc: 24, bloomAmt: 0.5, bloomThreshold: 0.75, streakAmt: 0.2, ghostAmt: 0.15, ca: 0.035, vignette: 0.6, grain: 0.06,
          letterbox: 1, sat: 0.9, contrast: 1.1, lift: [0.0, 0.01, 0.02], gain: [0.95, 1.0, 1.08], halation: 0.08 }, lens),
      };
    },
  };
}
