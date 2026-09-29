import * as THREE from 'three';
import { Plate, sampleDepth } from './plate.js';
import { makeFlecks, makeCuboids } from './overlay.js';
import { SpriteRig, TailRibbon } from './characters.js';
import { RottVoxels, glyphAtlas, makeGlyphStreams } from './rott.js';
import { docksPlates } from './shot_docks.js';
import { evalRig, applyRig } from './camera.js';
import { clamp, lerp, smoothstep, ease, noise1, hash } from './util.js';
import { NOISE, COMMON } from './glsl.js';

// S3 — DIGITAIL ROTT. The overlay curdles: the ship is quantised and devoured tile by tile, and the
// sky's tiles converge into a colossal face of decaying polygons that speaks.
export function shotRott(ctx, lib) {
  const T = lib.tex;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.03, 4000);
  const { mask, base, cal } = docksPlates(lib);
  const PN = { ...base, zFar: 1100, skyCut: 0.105, K: cal.P2_noship.K, B: cal.P2_noship.B };
  const PS = { ...base, zFar: 1100, skyCut: 0.105, K: cal.P2.K, B: cal.P2.B };
  const bg = new Plate({ ...PN, color: T.P2_noship_color, depth: T.P2_noship_depth, grid: [420, 236], mask, waterAmp: 1.2, rippleAmp: 1.0, renderOrder: 0 });
  const ship = new Plate({ ...PS, color: T.P2_color, depth: T.P2_depth, grid: [420, 236], mask, transparent: true, renderOrder: 1 });
  ship.uniforms.dissolveTile.value = 0.012;
  // only the ship region of the full plate is drawn over the ship-less plate
  ship.material.fragmentShader = ship.material.fragmentShader.replace('float a = mix(1.0, c.a, alphaFromMap) * opacity;', 'float a = mix(1.0, c.a, alphaFromMap) * opacity * smoothstep(0.05, 0.6, m.b);');
  scene.add(bg.mesh, ship.mesh);

  // --- devoured tiles: each dissolved ship tile becomes a flyer that is sucked up into her mouth
  const tile = 0.012, cols = Math.ceil((16 / 9) / tile), rows = Math.ceil(1 / tile);
  const reg = (() => { const img = T.P2_shipregion.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; })();
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const pu = (i + 0.5) * tile / (16 / 9), pv = (j + 0.5) * tile;
    if (pu > 1) continue;
    const px = Math.floor(pu * reg.w), py = Math.floor((1 - pv) * reg.h);
    const m = reg.d[(py * reg.w + px) * 4] / 255;
    if (m > 0.3) cells.push(i, j, m, 0);
  }
  const nF = cells.length / 4;
  const fg = new THREE.InstancedBufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  fg.setIndex([0, 1, 2, 0, 2, 3]);
  fg.setAttribute('cell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 4));
  fg.instanceCount = nF;
  const tanY = Math.tan(THREE.MathUtils.degToRad(PS.fovY) / 2);
  const flyU = {
    time: { value: 0 }, dissolve: { value: 0 }, colorMap: { value: T.P2_color }, depthMap: { value: T.P2_depth },
    tile: { value: tile }, tanHalf: { value: new THREE.Vector2(tanY * 16 / 9, tanY) }, Kc: { value: PS.K }, Bc: { value: PS.B }, d0: { value: PS.d0 },
    zFar: { value: PS.zFar }, gam: { value: PS.gamma }, mouth: { value: new THREE.Vector3() }, cyan: { value: new THREE.Color(0.4, 1.0, 1.3) },
  };
  const flyers = new THREE.Mesh(fg, new THREE.ShaderMaterial({
    uniforms: flyU, transparent: true, depthWrite: false,
    vertexShader: `${NOISE} ${COMMON}
      attribute vec4 cell; uniform float time, dissolve, tile, Kc, Bc, d0, zFar, gam; uniform vec2 tanHalf; uniform sampler2D depthMap; uniform vec3 mouth;
      varying vec2 vUv; varying float vA; varying float vT; varying vec2 vCell;
      void main(){
        vec2 puv = vec2((cell.x + 0.5) * tile / (16.0 / 9.0), (cell.y + 0.5) * tile);
        float r = hash12(cell.xy);
        float tDet = (r + 0.02) / (1.25 * cell.z);           // dissolve value at which this tile leaves the plate
        float age = max(0.0, dissolve - tDet) * 3.2;
        float d = decodeDepth(texture2D(depthMap, puv).rgb);
        float z0 = Kc / max(d0 - Bc, 1e-3);
        float z = d >= d0 ? Kc / max(d - Bc, 1e-3) : z0 * pow(zFar / z0, pow(clamp((d0 - d) / d0, 0.0, 1.0), gam));
        vec3 P0 = vec3((puv * 2.0 - 1.0) * tanHalf * z, -z);
        float e = clamp(age, 0.0, 1.0); e = e * e * (3.0 - 2.0 * e);
        vec3 ctrl = P0 + vec3((r - 0.5) * 40.0, 30.0 + r * 60.0, 10.0);
        vec3 P = mix(mix(P0, ctrl, e), mix(ctrl, mouth, e), e);
        float sz = tile * 2.0 * tanHalf.y * z * (1.0 - 0.7 * e);
        float ang = age * (r * 6.0 - 3.0);
        vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * position.xy * sz;
        vec4 mv = modelViewMatrix * vec4(P, 1.0); mv.xy += q;
        vUv = puv + (uv - 0.5) * vec2(tile / (16.0 / 9.0), tile);
        vA = step(0.0001, age) * (1.0 - smoothstep(0.85, 1.0, age));
        vT = e; vCell = uv;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D colorMap; uniform vec3 cyan; varying vec2 vUv; varying float vA; varying float vT; varying vec2 vCell;
      void main(){ if (vA < 0.01) discard; vec3 c = texture2D(colorMap, vUv).rgb;
        float e = min(min(vCell.x, 1.0 - vCell.x), min(vCell.y, 1.0 - vCell.y));
        c = mix(c, cyan * (0.4 + dot(c, vec3(0.33)) * 2.0), vT * 0.7) + cyan * (1.0 - smoothstep(0.0, 0.12, e)) * 0.6;
        gl_FragColor = vec4(c, vA); }`,
  }));
  flyers.frustumCulled = false; scene.add(flyers);

  // --- Rott
  const rott = new RottVoxels(lib.bin.face, { w: 300, h: 169, relief: 60, cell: 300 / 256 });
  const rottGroup = new THREE.Group(); rottGroup.add(rott.mesh); scene.add(rottGroup);
  rottGroup.position.set(22, 74, -250);
  rottGroup.lookAt(0, 0, 0);
  const atlas = glyphAtlas();
  const glyphs = makeGlyphStreams(900, atlas, { size: 2.4 });
  scene.add(glyphs);

  // --- the three, small, frozen on the quay looking up (silhouettes against her light)
  const trio = [['SP1_trio_0', 0.95, [-1.2, -1.0, -6.3], 3], ['SP1_trio_1', 1.1, [-0.35, -1.0, -6.0], 5], ['SP1_trio_2', 1.2, [0.5, -1.0, -5.6], 9]].map(([k, h, p, sd]) => {
    const rig = new SpriteRig(T[k], h); rig.group.position.set(...p); rig.group.lookAt(0, p[1], 2);
    rig.u.tint.value.setRGB(0.5, 0.58, 0.66); rig.u.rim.value.setRGB(0.4, 1.0, 1.35); rig.u.rimAmt.value = 0.6;
    const tail = new TailRibbon(rig, lib.meta.tails[k], { seed: sd });
    scene.add(rig.group); return { rig, tail };
  });

  const rain = makeFlecks(3000, { min: [-6, -2, -14], size: [12, 9, 16] }, { fall: 22, wind: -3, size: 0.007, streak: 14, squareFrac: 0.0, nearFade: 0.6, seed: 5, bright: 0.4 });
  const flecks = makeFlecks(1800, { min: [-8, -2, -16], size: [16, 12, 18] }, { fall: -1.5, wind: -1.5, size: 0.025, streak: 3, squareFrac: 0.85, nearFade: 0.5, seed: 31, bright: 1.4 });
  scene.add(rain, flecks);
  const cub = makeCuboids([
    { p: [60, 150, -380], w: 60, h: 40, d: 50, div: 5, r: [0.2, 0.3, 0], w1: 0.08, op: 0.6 },
    { p: [-160, 120, -300], w: 40, h: 60, d: 40, div: 5, r: [0.1, -0.4, 0], w1: -0.06, op: 0.55 },
    { p: [3, 2.2, -8], w: 0.9, h: 0.9, d: 0.9, div: 3, r: [0.4, 0.2, 0], w1: 0.3, op: 0.6 },
  ]);
  scene.add(cub);

  const mouthW = new THREE.Vector3();
  const keys = [
    { t: 0.0, pos: [0.3, -0.2, -0.9], look: [2.2, -0.1, -14], fov: 42, focus: 9, ap: 3 },
    { t: 1.1, pos: [0.3, -0.35, -0.7], look: [2.6, 2.2, -14], fov: 46, focus: 30, ap: 1.4 },
    { t: 2.6, pos: [0.2, -0.55, -0.2], look: [3.0, 8.2, -30], fov: 54, focus: 30, ap: 1.2 },
    { t: 5.2, pos: [0.15, -0.6, 0.7], look: [3.1, 8.4, -30], fov: 45, focus: 30, ap: 1.2 },
  ];
  const env = lib.meta.rottEnv || null;
  return {
    frame(tau, t) {
      const r = evalRig(keys, tau, { handheld: 0.6, handheldFreq: 0.6, seed: 21 });
      applyRig(camera, r);
      const dis = smoothstep(0.35, 2.4, tau);
      [bg, ship].forEach(p => { p.uniforms.time.value = t; p.uniforms.rock.value.set(Math.sin(t * 0.8) * 0.004 + dis * Math.sin(t * 7.0) * 0.004, 0.8, 0.45, 0); });
      ship.uniforms.dissolve.value = dis;
      const voidK = 1 - 0.5 * smoothstep(0.6, 2.2, tau);
      [bg, ship].forEach(p => { p.uniforms.exposure.value = voidK; p.uniforms.tint.value.setRGB(0.85, 0.95, 1.1); });
      flyU.time.value = t; flyU.dissolve.value = dis;
      // voice-driven jaw (envelope of her line when available), assembly, decay, glitches
      const u = rott.u; u.time.value = t;
      u.assemble.value = smoothstep(0.25, 1.9, tau);
      u.scatter.value = 1.0;
      u.decay.value = 0.12 + 0.2 * smoothstep(3.5, 5.2, tau);
      const vt = t - (env ? env.start : 10.0);
      let jaw = 0;
      if (env && vt > 0 && vt < env.dur) { const i = Math.floor(vt * env.rate); jaw = env.v[Math.min(i, env.v.length - 1)] || 0; }
      else if (vt > 0 && vt < 4.5) jaw = Math.max(0, Math.sin(vt * 11.0) * 0.5 + noise1(vt * 6.0, 4) * 0.6);
      u.jaw.value = 0.15 + jaw * 1.1;
      u.breathe.value = Math.sin(t * 1.4);
      u.glitch.value = 0.15 + 0.85 * Math.max(0, noise1(t * 3.0, 77)) * smoothstep(1.0, 2.0, tau) + (Math.floor(t * 30) % 17 === 0 ? 0.6 : 0);
      u.eyeGlow.value = smoothstep(1.2, 1.8, tau) * (0.8 + 0.2 * Math.sin(t * 9.0));
      rottGroup.updateMatrixWorld(true);
      mouthW.set(0, (0.5 - 0.61) * 169, 20); rottGroup.localToWorld(mouthW);
      flyU.mouth.value.copy(mouthW);
      glyphs.u.time.value = t; glyphs.u.mouth.value.copy(mouthW); glyphs.u.src.value.set(-40, -10, -200);
      glyphs.u.amt.value = smoothstep(1.4, 2.2, tau); glyphs.u.spew.value = 0.35 + 0.3 * smoothstep(3.0, 5.0, tau);
      trio.forEach(({ rig, tail }, i) => { rig.u.time.value = t; rig.u.breathe.value = Math.sin(t * 5 + i) * 1.2; rig.u.head.value.set(-0.06 * smoothstep(0.8, 2.2, tau), -0.01, 0.7, 0.62); tail.update(tau + 20); });
      rain.u.time.value = t; flecks.u.time.value = t; cub.update(t);
      const curd = smoothstep(0.2, 2.2, tau);
      const sheets = [
        { z: 1.3, size: 0.08, cov: 0.10 + 0.08 * curd, seed: 6.1, luma: 0.1, op: 0.55, freq: 1.2, drift: [0.12, 0.04], hollow: 1 },
        { z: 8, size: 0.25, cov: 0.10 + 0.10 * curd, seed: 2.7, luma: 0.25, op: 0.8, freq: 0.25, drift: [0.05, 0.03] },
        { z: 60, size: 1.8, cov: 0.10 + 0.10 * curd, seed: 9.3, luma: 0.2, op: 0.9, freq: 0.03, drift: [0.03, 0.02] },
        { z: 700, size: 12, cov: 0.26, seed: 4.2, luma: 0.7, op: 1.0, freq: 0.004, drift: [0.01, 0.006] },
      ];
      const shake = smoothstep(2.4, 5.2, tau);
      if (window.TRAILER.debug.rottOnly) {
        scene.children.forEach(c => { c.visible = c === rottGroup; });
        camera.position.copy(rottGroup.position).add(new THREE.Vector3(0, 0, 0).sub(rottGroup.position).normalize().multiplyScalar(260));
        camera.fov = 60; camera.lookAt(rottGroup.position); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        if (window.TRAILER.debug.rottBasic && !this._basic) { this._basic = true; rott.mesh.material = new THREE.MeshBasicMaterial({ color: 0xff00ff }); }
      }
      return {
        scene, camera, mode: 'seaall', sheets,
        overlay: { amount: 1, glow: 0.45, grid: 0.06 + 0.05 * curd, hollow: 0.15, glitch: u.glitch.value * 0.3 * curd },
        lens: { focus: r.focus, aperture: r.ap, maxCoc: 20, bloomAmt: 0.55 + 0.3 * curd, bloomThreshold: 0.7, streakAmt: 0.3, ghostAmt: 0.12, ca: 0.02 + 0.02 * shake,
          vignette: 0.6, grain: 0.05, letterbox: 1, sat: 1.0 - 0.25 * curd, contrast: 1.08, lift: [0.0, 0.01, 0.02], gain: [0.92, 1.0, 1.08], halation: 0.06,
          exposure: 1.0, flash: (1 - smoothstep(0.0, 0.35, tau)) * 0.9, flashColor: [0.92, 0.97, 1.0] },
      };
    },
  };
}
