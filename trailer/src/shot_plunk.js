import * as THREE from 'three';
import { Plate, sampleDepth, makeMask } from './plate.js';
import { SpriteRig } from './characters.js';
import { evalRig, applyRig } from './camera.js';
import { clamp, lerp, smoothstep, ease, noise1, fbm1, hash } from './util.js';
import { NOISE, COMMON } from './glsl.js';

// S5 — PLUNK. Pull back out of the curved glass: the Sea of Mestre was a snow globe on a student's
// desk, the three navigators harnessed in its base. It goes over the edge. Graphite, on twos.
import { PL } from './timeline.js';
export { PL };

// ------------------------------------------------------------------ desk papers (baked into the plate)
function deskColor(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const W = c.width, H = c.height;
  const pencil = (txt, x, y, font, alpha = 0.8) => {
    g.font = font;
    g.fillStyle = `rgba(35,35,38,${alpha})`; g.fillText(txt, x, y);
    g.fillStyle = `rgba(35,35,38,${alpha * 0.35})`; g.fillText(txt, x + 1.5, y + 1);
  };
  const put = (x, y, rot, sx, sy, fn) => { g.save(); g.translate(x * W, y * H); g.rotate(rot); g.scale(sx, sy); fn(); g.restore(); };
  // folder cover: handwritten label + the only stroke of colour in the physical world (left of the clasp)
  put(0.158, 0.672, -0.05, 1.0, 0.56, () => {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(250,226,40,0.55)'; g.beginPath(); g.moveTo(-0.05 * W, -0.012 * H); g.lineTo(0.052 * W, -0.016 * H); g.lineTo(0.054 * W, 0.03 * H); g.lineTo(-0.048 * W, 0.034 * H); g.fill();
    g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
    pencil('PORTFOLIO', 0, 0.025 * H, `700 ${0.04 * H}px Caveat`, 0.9);
  });
  // report: its own sheet of paper lying on the loose papers at lower left
  put(0.118, 0.822, -0.12, 1.0, 0.66, () => {
    const pw = 0.25 * W, ph = 0.19 * H;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0.004 * W, -0.035 * H + 0.012 * H, pw, ph);           // contact shadow
    g.fillStyle = 'rgb(226,223,215)'; g.fillRect(0, -0.035 * H, pw, ph);                               // sheet
    g.strokeStyle = 'rgba(40,40,44,0.75)'; g.lineWidth = 2.5; g.strokeRect(0, -0.035 * H, pw, ph);     // pencil edge
    g.strokeStyle = 'rgba(60,60,64,0.18)'; g.lineWidth = 1.2;                                           // light hatching
    for (let k = 0; k < 60; k++) { const x = (k / 60) * pw; g.beginPath(); g.moveTo(x, -0.035 * H); g.lineTo(x + 0.02 * W, -0.035 * H + ph); g.stroke(); }
    g.textAlign = 'left';
    const f = `400 ${0.0185 * H}px "Special Elite"`;
    pencil('FALL SEMESTER  -  PROGRESS REPORT', 0.014 * W, 0.008 * H, f, 0.85);
    pencil('GRADE POINT AVERAGE ........', 0.014 * W, 0.05 * H, f, 0.8);
    pencil('PASSING GRADE ?', 0.014 * W, 0.092 * H, f, 0.8);
    g.strokeStyle = 'rgba(35,35,38,0.7)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0.075 * W, 0.084 * H, 0.075 * W, 0.022 * H, 0, 0, Math.PI * 2); g.stroke();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

// ------------------------------------------------------------------ the snow globe
function globeMaterial(T) {
  const u = {
    paint: { value: T.P1_color }, room: { value: T.G1_color }, C: { value: new THREE.Vector3() }, R: { value: 1 },
    fAx: { value: new THREE.Vector3(0, 0, -1) }, rAx: { value: new THREE.Vector3(1, 0, 0) }, uAx: { value: new THREE.Vector3(0, 1, 0) },
    halfW: { value: 1 }, seaAll: { value: 1 }, time: { value: 0 }, lamp: { value: new THREE.Vector3(0.55, 0.75, 0.35).normalize() },
    grey: { value: 0 }, crack: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${NOISE} ${COMMON}
      uniform sampler2D paint, room; uniform vec3 C, fAx, rAx, uAx, lamp; uniform float R, halfW, seaAll, time, grey, crack;
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(vW - cameraPosition); vec3 N = normalize(vN);
        float cosi = clamp(-dot(V, N), 0.0, 1.0);
        vec3 Tr = refract(V, N, 1.0 / 1.33);
        float s = dot(C + fAx * R * 0.45 - vW, fAx) / max(dot(Tr, fAx), 0.06);
        vec3 Hh = vW + Tr * s;
        vec2 q = vec2(dot(Hh - C, rAx), dot(Hh - C, uAx));
        vec2 uv = vec2(0.5 + q.x / (2.0 * halfW), 0.5 + q.y / (2.0 * halfW * 9.0 / 16.0));
        vec2 uvc = clamp(uv, 0.002, 0.998);
        vec3 col = texture2D(paint, uvc).rgb;
        if (seaAll > 0.0) {
          vec2 tq = uvc * vec2(80.0, 45.0); vec2 cell = floor(tq); vec2 f = fract(tq);
          float n = fbm(cell * 0.07 + vec2(time * 0.05, 0.0));
          float m = smoothstep(0.5, 0.6, n) * seaAll;
          vec3 qc = texture2D(paint, (cell + 0.5) / vec2(80.0, 45.0)).rgb * (0.85 + 0.3 * hash12(cell));
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          col = mix(col, qc, m * smoothstep(0.03, 0.09, e));
          col += vec3(0.35, 0.95, 1.3) * (1.0 - smoothstep(0.0, 0.08, e)) * m * 0.25;
        }
        col *= mix(vec3(1.0), vec3(0.9, 1.0, 1.06), 0.4);
        col *= 1.0 - 0.45 * smoothstep(0.6, 1.1, length(uv - 0.5) * 1.6);
        // glass: fresnel reflection of the graphite room + the desk lamp
        vec3 Rv = reflect(V, N);
        float F = 0.03 + 0.97 * pow(1.0 - cosi, 5.0);
        vec3 roomC = texture2D(room, clamp(vec2(0.5 + Rv.x * 0.42, 0.55 + Rv.y * 0.42), 0.0, 1.0)).rgb;
        roomC = vec3(luma(roomC));
        col = mix(col, roomC, F * 0.8);
        float spec = pow(max(dot(Rv, lamp), 0.0), 420.0) * 7.0 + pow(max(dot(Rv, lamp), 0.0), 24.0) * 0.18;
        float hatch = 0.7 + 0.3 * step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.25));
        col += vec3(1.0, 0.99, 0.96) * spec * hatch;
        // pencil silhouette and a thin white rim
        col = mix(col, vec3(0.03), smoothstep(0.22, 0.02, cosi) * 0.85);
        col += vec3(0.9) * exp(-pow((cosi - 0.07) * 30.0, 2.0)) * 0.25;
        col = mix(col, vec3(luma(col)), grey);
        if (crack > 0.0) {
          vec3 w = normalize(vW - C);
          float cr = abs(vnoise(w.xy * 18.0 + w.z * 7.0) - 0.5);
          col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.02 * crack, cr)) * crack);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  m.u = u;
  return m;
}

function snowMesh(n, R, seed) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let x, y, z; let k = 0;
    do { x = hash(i * 3 + seed) * 2 - 1; y = hash(i * 3 + 1 + seed) * 2 - 1; z = hash(i * 3 + 2 + seed) * 2 - 1; k++; } while (x * x + y * y + z * z > 1 && k < 20);
    s.set([x, y, z, hash(i * 7 + 99 + seed)], i * 4);
  }
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(s, 4)); g.instanceCount = n;
  const u = { time: { value: 0 }, R: { value: R }, C: { value: new THREE.Vector3() }, snowK: { value: 0 }, opacity: { value: 1 }, cut: { value: -0.35 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 seed; uniform float time, R, snowK, cut; uniform vec3 C; varying vec2 vQ; varying float vA; varying float vSq;
      void main(){
        vec3 p = seed.xyz * 0.88;
        float ang = time * (0.25 + seed.w * 0.5);
        p.xz = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p.xz;
        p.y = mod(p.y + 0.9 - time * (0.05 + 0.1 * seed.w), 1.8) - 0.9;
        float l = length(p); if (l > 0.9) p *= 0.9 / l;
        vA = step(cut, p.y);
        vec4 mv = modelViewMatrix * vec4(C + p * R, 1.0);
        float sz = R * mix(0.006, 0.014 + 0.012 * seed.w, snowK);
        mv.xy += position.xy * sz * mix(vec2(0.7, 2.0 + 1.5 * seed.w) * step(0.7, seed.w) + vec2(1.0) * step(seed.w, 0.7), vec2(1.0), snowK);
        vA *= smoothstep(R * 0.35, R * 0.8, -mv.z);
        vQ = position.xy; vSq = 1.0 - snowK;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float opacity, snowK; varying vec2 vQ; varying float vA; varying float vSq;
      void main(){ float d = length(vQ) * 2.0; float soft = exp(-d * d * 2.5);
        float a = mix(1.0, soft, snowK) * vA * opacity;
        vec3 c = mix(vec3(0.45, 1.0, 1.35) * 0.55, vec3(1.0, 0.99, 0.97) * 0.8, snowK);
        gl_FragColor = vec4(c * a, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.u = u; mesh.renderOrder = 10;
  return mesh;
}

function makeGlobe(T, R, baseW) {
  const group = new THREE.Group();
  const base = new SpriteRig(T.G2_base, baseW * 1044 / 1400, { gx: 8, gy: 8 });
  base.u.tint.value.setRGB(1, 1, 1);
  group.add(base.group);
  const img = T.G2_base.image;
  const rimLocal = base.local(700, 44);
  const C = new THREE.Vector3(0, rimLocal.y + R * 0.72, -R * 0.1);
  const mat = globeMaterial(T);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), mat);
  sphere.position.copy(C); sphere.renderOrder = 4;
  group.add(sphere);
  const snow = snowMesh(420, R, 17); snow.u.C.value.copy(C); snow.u.cut.value = -0.32;
  group.add(snow);
  const footLocal = base.local(700, 690);  // pedestal bottom
  return { group, base, sphere, mat, snow, C, footLocal, R };
}

// ------------------------------------------------------------------ shards + droplets (precomputed, deterministic)
function simulateShards(n, R, g) {
  const dt = 1 / 120, steps = 240, out = [];
  for (let i = 0; i < n; i++) {
    const a = hash(i * 5 + 1) * Math.PI * 2, b = Math.acos(hash(i * 5 + 2) * 2 - 1);
    const dir = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.abs(Math.cos(b)) * 0.7 + 0.1, Math.sin(b) * Math.sin(a));
    const p = dir.clone().multiplyScalar(R * 0.9); p.y += R;
    const sp = (1.2 + 3.2 * hash(i * 5 + 3)) * R * 3.2;
    const v = new THREE.Vector3(dir.x * sp, (0.8 + 2.2 * hash(i * 5 + 4)) * R * 4, dir.z * sp);
    const w = new THREE.Vector3(hash(i * 9) - 0.5, hash(i * 9 + 1) - 0.5, hash(i * 9 + 2) - 0.5).multiplyScalar(40);
    const rot = new THREE.Euler(hash(i) * 6, hash(i + 3) * 6, hash(i + 7) * 6);
    const traj = new Float32Array(steps * 6);
    for (let s = 0; s < steps; s++) {
      v.y -= g * dt; p.addScaledVector(v, dt);
      if (p.y < 0.004) { p.y = 0.004; v.y = -v.y * 0.28; v.x *= 0.6; v.z *= 0.6; w.multiplyScalar(0.5); }
      rot.x += w.x * dt; rot.y += w.y * dt; rot.z += w.z * dt;
      traj.set([p.x, p.y, p.z, rot.x, rot.y, rot.z], s * 6);
    }
    out.push(traj);
  }
  return { out, dt, steps };
}

export function shotPlunk(ctx, lib) {
  const T = lib.tex;
  // ================= A: DESK
  const sceneA = new THREE.Scene();
  const camA = new THREE.PerspectiveCamera(46, 16 / 9, 0.002, 60);
  const PG = { fovY: 50, K: 1.0286, B: -0.0286, d0: 0.1, zFar: 14, gamma: 1.0 };
  const armMask = makeMask([960, 540], [{ ch: 'b', blur: 14, pts: [[0.545, 0.27], [0.66, 0.2], [0.8, 0.46], [0.78, 0.68], [0.53, 0.66], [0.5, 0.45]] }]);
  const desk = new Plate({ ...PG, color: deskColor(T.G1_color.image), depth: T.G1_depth, grid: [480, 270], mask: armMask });
  sceneA.add(desk.mesh);
  const edgePx = [0.655, 0.722];
  const edge = Plate.unproject(PG, ...edgePx, sampleDepth(T.G1_depth, ...edgePx));
  const frameHAtEdge = 2 * Math.tan(THREE.MathUtils.degToRad(PG.fovY / 2)) * -edge.z;
  const R = frameHAtEdge * 0.105;
  const baseW = R * 1400 / 532;
  const GA = makeGlobe(T, R, baseW);
  const toCam = new THREE.Vector3(-edge.x, 0, -edge.z).normalize();
  const baseYaw = Math.atan2(toCam.x, toCam.z);
  const holder = new THREE.Group(); holder.add(GA.group); sceneA.add(holder);
  // pivot for the tip: front-bottom edge of the pedestal at the desk edge
  const pivot = edge.clone().add(toCam.clone().multiplyScalar(0.02));
  GA.group.position.set(0, -GA.footLocal.y, 0);
  GA.group.rotation.set(0, 0, 0);
  const place = new THREE.Group(); place.position.copy(pivot); place.rotation.y = baseYaw; place.add(holder); sceneA.add(place);
  holder.position.set(0, 0, -0.035);
  const tipAxis = new THREE.Vector3(1, 0, 0);

  const finalPos = new THREE.Vector3(0.02, -0.03, -0.12);
  const finalLook = new THREE.Vector3(0.1, -0.12, -3.0);
  const Cw = new THREE.Vector3(), q = new THREE.Quaternion();
  place.updateMatrixWorld(true); GA.sphere.getWorldPosition(Cw);
  const Cw0 = Cw.clone();
  const outDir = finalPos.clone().sub(Cw).normalize();
  const startPos = Cw.clone().addScaledVector(outDir, R * 1.07);
  const midPos = Cw.clone().addScaledVector(outDir, R * 1.25);
  const keysA = [
    { t: 0.0, pos: startPos.toArray(), look: Cw.toArray(), fov: 36, focus: R * 0.3, ap: 0, roll: 0 },
    { t: 1.0, pos: midPos.toArray(), look: Cw.toArray(), fov: 36, focus: R * 0.9, ap: 1.5, roll: 2 },
    { t: 2.35, pos: finalPos.toArray(), look: finalLook.toArray(), fov: 44, focus: Cw.distanceTo(finalPos), ap: 5, roll: 0 },
    { t: 3.35, pos: finalPos.clone().add(new THREE.Vector3(0.01, -0.01, 0.0)).toArray(), look: finalLook.clone().add(new THREE.Vector3(0.12, -0.3, 0)).toArray(), fov: 43, focus: Cw.distanceTo(finalPos), ap: 5, roll: -2 },
  ];
  // interior backdrop basis (fixed in globe space at t=0, looking in along -outDir)
  const f0 = outDir.clone().negate(), r0 = new THREE.Vector3().crossVectors(f0, new THREE.Vector3(0, 1, 0)).normalize(), u0 = new THREE.Vector3().crossVectors(r0, f0);
  const invQ0 = new THREE.Quaternion(); GA.sphere.getWorldQuaternion(invQ0); invQ0.invert();
  const fL = f0.clone().applyQuaternion(invQ0), rL = r0.clone().applyQuaternion(invQ0), uL = u0.clone().applyQuaternion(invQ0);

  // ================= B: FLOOR
  const sceneB = new THREE.Scene();
  const camB = new THREE.PerspectiveCamera(52, 16 / 9, 0.005, 60);
  const PF = { fovY: 55, zNear: 0.28, zFar: 12, gamma: 1.5 };
  const floor = new Plate({ ...PF, color: T.G3_color, depth: T.G3_depth, grid: [400, 225] });
  sceneB.add(floor.mesh);
  const fp = (x, y) => Plate.unproject(PF, x, y, sampleDepth(T.G3_depth, x, y));
  const fa = fp(0.32, 0.94), fb = fp(0.82, 0.94), fc = fp(0.56, 0.70);
  const fN = new THREE.Vector3().crossVectors(fb.clone().sub(fa), fc.clone().sub(fa)).normalize(); if (fN.y < 0) fN.negate();
  const hit = fp(0.5, 0.86);
  const dHit = hit.length(), fhHit = 2 * Math.tan(THREE.MathUtils.degToRad(26)) * dHit;
  const floorFrame = new THREE.Group(); floorFrame.position.copy(hit);
  floorFrame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fN);
  sceneB.add(floorFrame);
  const RB = 0.14 * fhHit, baseWB = RB * 1400 / 532;
  const GB = makeGlobe(T, RB, baseWB);
  const fallG = new THREE.Group(); fallG.add(GB.group); floorFrame.add(fallG);
  GB.group.position.set(0, -GB.footLocal.y, 0);
  // camera faces the floor frame: rotate the fall group so the base's hatch faces camera
  const camBPos = new THREE.Vector3(0, 0, 0);
  const hitToCam = floorFrame.worldToLocal(camBPos.clone()).setY(0).normalize();
  fallG.rotation.y = Math.atan2(hitToCam.x, hitToCam.z);
  // shards
  const NSH = 260, sim = simulateShards(NSH, RB, 9.0);
  const shGeo = new THREE.BufferGeometry();
  const tri = []; const bary = [];
  for (let i = 0; i < 1; i++) { tri.push(0, 0.6, 0, -0.45, -0.4, 0.05, 0.5, -0.3, -0.05); bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1); }
  shGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); shGeo.setAttribute('bary', new THREE.Float32BufferAttribute(bary, 3));
  shGeo.computeVertexNormals();
  const shMat = new THREE.ShaderMaterial({
    uniforms: { lamp: { value: new THREE.Vector3(0.2, 1, 0.3).normalize() }, opacity: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 bary; varying vec3 vB; varying vec3 vN; varying vec3 vV;
      void main(){ vB = bary; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 lamp; uniform float opacity; varying vec3 vB; varying vec3 vN; varying vec3 vV;
      void main(){ float e = min(vB.x, min(vB.y, vB.z));
        float edge = 1.0 - smoothstep(0.0, 0.06, e); float ink = 1.0 - smoothstep(0.0, 0.02, e);
        vec3 h = normalize(lamp + vV); float sp = pow(abs(dot(normalize(vN), h)), 60.0);
        vec3 c = vec3(0.95) * (0.12 + edge * 0.6 + sp * 2.5); c = mix(c, vec3(0.05), ink * 0.6);
        gl_FragColor = vec4(c, (0.18 + edge * 0.7 + sp) * opacity); }`,
  });
  const shards = new THREE.InstancedMesh(shGeo, shMat, NSH); shards.frustumCulled = false; shards.visible = false; floorFrame.add(shards);
  const shScale = []; for (let i = 0; i < NSH; i++) shScale.push(RB * (0.12 + 0.35 * Math.pow(hash(i * 13 + 5), 2)));
  // droplets: carry the painted colours, greying as they leave the sphere
  const ND = 700;
  const dg = new THREE.InstancedBufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  dg.setIndex([0, 1, 2, 0, 2, 3]);
  const ds = new Float32Array(ND * 4); for (let i = 0; i < ND * 4; i++) ds[i] = hash(i * 29 + 3);
  dg.setAttribute('seed', new THREE.InstancedBufferAttribute(ds, 4)); dg.instanceCount = ND;
  const dU = { age: { value: 0 }, R: { value: RB }, paint: { value: T.P1_color }, g: { value: 9.0 } };
  const drops = new THREE.Mesh(dg, new THREE.ShaderMaterial({
    uniforms: dU, transparent: true, depthWrite: false,
    vertexShader: `${NOISE} attribute vec4 seed; uniform float age, R, g; varying vec2 vQ; varying vec3 vC; varying float vA; varying float vGrey; uniform sampler2D paint; varying float vFlat; varying float vSnow;
      void main(){
        float a = seed.x * 6.2831, el = 0.15 + seed.y * 1.1;
        vec3 dir = vec3(cos(a) * cos(el), sin(el), sin(a) * cos(el));
        float sp = R * (6.0 + 14.0 * seed.z);
        float t0 = seed.w * 0.06; float t = max(age - t0, 0.0);
        vec3 p = vec3(0.0, R, 0.0) + dir * R * 0.8 + dir * sp * t; p.y -= 0.5 * g * t * t;
        float landed = step(p.y, 0.002); p.y = max(p.y, 0.002);
        vFlat = landed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float sz = R * (0.03 + 0.06 * seed.z) * (1.0 + landed * 0.8);
        mv.xy += position.xy * sz * mix(vec2(1.0, 1.0 + 3.0 * (1.0 - landed) * clamp(sp * 0.02, 0.0, 1.0)), vec2(1.6, 0.35), landed);
        vQ = position.xy;
        vSnow = step(0.9, seed.y);
        vC = texture2D(paint, vec2(seed.y, seed.z * 0.8 + 0.1)).rgb;
        vGrey = smoothstep(0.08, 0.7, t);
        vA = step(0.0001, age - t0) * (1.0 - smoothstep(0.5, 1.1, t)) * (1.0 - landed * 0.6);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${COMMON} varying vec2 vQ; varying vec3 vC; varying float vA; varying float vGrey; varying float vFlat; varying float vSnow;
      void main(){ float d = length(vQ) * 2.0; float a = (1.0 - smoothstep(0.6, 1.0, d)) * vA;
        vec3 c = vC * 1.5; c = mix(c, vec3(luma(c)) * 1.2, vGrey);
        c = mix(c, vec3(1.0), vSnow);
        c += vec3(1.0) * pow(1.0 - d, 6.0) * 0.5;
        gl_FragColor = vec4(c, a * 0.75); }`,
  }));
  drops.frustumCulled = false; drops.visible = false; floorFrame.add(drops);
  // puddle: the painted world spills out and greys
  const puU = { age: { value: 0 }, paint: { value: T.P1_color }, R: { value: RB } };
  const puddle = new THREE.Mesh(new THREE.PlaneGeometry(RB * 16, RB * 16), new THREE.ShaderMaterial({
    uniforms: puU, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE} ${COMMON} uniform float age; uniform sampler2D paint; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
        float grow = 0.42 * (1.0 - exp(-age * 4.0));
        float edge = grow * (0.7 + 0.5 * fbm(p * 4.0 + 4.0));
        float m = 1.0 - smoothstep(edge - 0.015, edge, r);
        if (m < 0.01) discard;
        vec2 suv = 0.5 + p * 0.9 + vec2(fbm(p * 6.0 + age * 0.5), fbm(p * 6.0 - age * 0.5)) * 0.08;
        vec3 c = texture2D(paint, suv).rgb * 1.3;
        float grey = smoothstep(0.1, 0.9, age) * smoothstep(edge * 0.2, edge * 0.95, r) + smoothstep(0.9, 1.8, age);
        c = mix(c, vec3(luma(c)) * 0.9, clamp(grey, 0.0, 1.0));
        float rim = exp(-pow((r - edge + 0.012) * 60.0, 2.0));
        float glint = pow(vnoise(p * 30.0 + 3.0), 8.0) * 3.0;
        c += vec3(0.85) * (rim * 0.5 + glint * 0.3);
        gl_FragColor = vec4(c, m * 0.7); }`,
  }));
  puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.0015; puddle.visible = false; floorFrame.add(puddle);
  // the hand, and its shadow
  const hand = new SpriteRig(T.G5_hand, 1.0, { gx: 8, gy: 8 });
  hand.u.tint.value.setRGB(1, 1, 1);
  sceneB.add(hand.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.ShaderMaterial({
    uniforms: { k: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float k; varying vec2 vUv; void main(){ vec2 p = (vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, length(p))) * k; gl_FragColor = vec4(vec3(0.0), a); }`,
  }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.0, 0.003, 0); shadow.scale.setScalar(RB * 9); floorFrame.add(shadow);

  // ================= C: EYE
  const sceneC = new THREE.Scene();
  const camC = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 20);
  const PE = { fovY: 48, zNear: 0.6, zFar: 3.0, gamma: 1.0 };
  const eye = new Plate({ ...PE, color: T.G4b_color, depth: T.G4_depth, grid: [320, 180] });
  sceneC.add(eye.mesh);
  const sceneD = new THREE.Scene(); const camD = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 10);

  const lensGraphite = (extra = {}) => Object.assign({ bloomAmt: 0.06, bloomThreshold: 1.2, streakAmt: 0, ghostAmt: 0, ca: 0.0, vignette: 0.55, grain: 0.03,
    letterbox: 1, sat: 1.0, contrast: 1.06, lift: [0.0, 0.0, 0.0], gain: [1, 1, 1], halation: 0, paperAmt: 0.7 }, extra);

  return {
    cutsLocal: [PL.deskEnd, PL.floorEnd, PL.eyeEnd],
    stepAt: tau => (tau < 1.2 ? 0 : 12),
    frame(tau, t) {
      const boilT = Math.floor(tau * 12);
      if (tau < PL.deskEnd) {
        // ---------------- A
        let r;
        if (tau < 2.35) {
          const e = Math.pow(smoothstep(0.35, 2.35, tau), 1.7);
          const dFinal = Cw0.distanceTo(finalPos);
          const d = lerp(R * 1.07, dFinal, e) + R * 0.12 * smoothstep(0.0, 0.35, tau);
          const pos = Cw0.clone().addScaledVector(outDir, d).add(new THREE.Vector3(0, 0.05 * Math.sin(e * Math.PI), 0));
          const look = Cw0.clone().lerp(finalLook, smoothstep(1.1, 2.35, tau));
          const sh = evalRig(keysA, tau, { handheld: tau < 1.2 ? 0.08 : 0.3, handheldFreq: 0.5, seed: 91, stepped: tau < 1.2 ? 0 : 12 }).shake;
          r = { pos: pos.toArray(), look: look.toArray(), fov: lerp(36, 44, smoothstep(0.8, 2.35, tau)), roll: 2 * Math.sin(e * Math.PI), shake: sh,
            focus: Cw0.distanceTo(pos), ap: lerp(0.0, 5.0, smoothstep(0.6, 2.0, tau)) };
        } else r = evalRig(keysA, tau, { handheld: 0.35, handheldFreq: 0.5, seed: 91, stepped: 12 });
        applyRig(camA, r);
        desk.uniforms.time.value = t; desk.uniforms.boil.value = 0.00035 * smoothstep(0.8, 1.4, tau); desk.uniforms.boilT.value = boilT;
        // the student's arm lunges as it tips
        const lunge = smoothstep(2.35, 3.2, tau);
        desk.uniforms.rock.value.set(-0.05 * lunge - 0.008 * Math.sin(boilT * 1.7) * smoothstep(1.5, 2.3, tau), 0.58, 0.70, 0);
        // teeter, tip, fall (rigid body about the front-bottom edge)
        let th = 0, drop = 0, fwd = 0;
        if (tau > 2.3) {
          const s = tau - 2.3;
          th = 0.11 * Math.sin(Math.min(s, 0.62) / 0.62 * Math.PI) * smoothstep(0, 0.1, s);
          if (s > 0.5) th += 0.55 * Math.pow(Math.max(0, s - 0.5) / 0.35, 2.2);
          if (tau > PL.fallStart + 0.12) { const f = tau - PL.fallStart - 0.12; drop = 0.5 * 20 * f * f; fwd = 0.9 * f; th += 7.0 * f; }
        }
        holder.rotation.set(th, 0, 0);
        holder.position.set(0, -drop, -0.035 + fwd);
        place.updateMatrixWorld(true);
        GA.sphere.getWorldPosition(Cw); GA.sphere.getWorldQuaternion(q);
        const u = GA.mat.u;
        u.C.value.copy(Cw); u.R.value = R; u.fAx.value.copy(fL).applyQuaternion(q); u.rAx.value.copy(rL).applyQuaternion(q); u.uAx.value.copy(uL).applyQuaternion(q);
        u.halfW.value = R * 0.62; u.seaAll.value = 1 - smoothstep(0.3, 1.3, tau); u.time.value = t;
        u.grey.value = 0; u.crack.value = 0;
        GA.snow.u.time.value = t; GA.snow.u.snowK.value = smoothstep(0.4, 1.4, tau);
        GA.base.u.time.value = t;
        const k = smoothstep(0.7, 1.5, tau);
        return {
          scene: sceneA, camera: camA, mode: 'plain', clear: 0x000000,
          lens: {
            focus: r.focus, aperture: r.ap, maxCoc: 18,
            bloomAmt: lerp(0.45, 0.06, k), bloomThreshold: lerp(0.7, 1.2, k), streakAmt: lerp(0.2, 0, k), ghostAmt: 0, ca: lerp(0.014, 0, k),
            vignette: 0.55, grain: lerp(0.04, 0.03, k), letterbox: 1, sat: 1, contrast: lerp(1.04, 1.06, k), halation: lerp(0.06, 0, k), paperAmt: 0.7 * k,
            lift: [lerp(0.004, 0, k), lerp(0.008, 0, k), lerp(0.016, 0, k)],
          },
        };
      }
      if (tau < PL.floorEnd) {
        // ---------------- B
        const s = tau - PL.deskEnd;
        const age = tau - PL.impact;
        const shake = age > 0 ? Math.exp(-age * 7) * 0.018 : 0;
        const jt = Math.floor(tau * 12);
        camB.position.set(Math.sin(jt * 12.9898) * shake, Math.cos(jt * 78.233) * shake, 0);
        const lookY = -0.18 + (age > 0 ? 0 : 0.0);
        camB.lookAt(new THREE.Vector3(hit.x * 0.5, hit.y * 0.25 + lookY, -3)); camB.fov = 52; camB.updateProjectionMatrix();
        floor.uniforms.time.value = t; floor.uniforms.boil.value = 0.0004; floor.uniforms.boilT.value = boilT;
        // globe drops in, tumbling, until impact
        const u = GB.mat.u;
        if (age < 0) {
          const f = (tau - PL.deskEnd) / (PL.impact - PL.deskEnd);
          fallG.position.set(0.3 * RB * (1 - f), lerp(7.0 * RB, 0.0, f * f), 0);
          fallG.rotation.set(lerp(1.9, 2.5, f), fallG.rotation.y, lerp(0.3, 0.1, f));
          GB.sphere.visible = true; GB.snow.visible = true;
        } else {
          GB.sphere.visible = false; GB.snow.visible = false;
          // the base tumbles onto its side and rocks to rest
          const a = Math.min(1, age / 0.28);
          fallG.position.set(-0.01, 0.0, 0.0);
          const settle = lerp(0.0, 1.35, ease.outBack(a)) + Math.sin(age * 30) * Math.exp(-age * 9) * 0.05;
          fallG.rotation.set(0, fallG.rotation.y, settle);
        }
        fallG.updateMatrixWorld(true);
        GB.sphere.getWorldPosition(Cw); GB.sphere.getWorldQuaternion(q);
        u.C.value.copy(Cw); u.R.value = RB; u.fAx.value.copy(fL).applyQuaternion(q); u.rAx.value.copy(rL).applyQuaternion(q); u.uAx.value.copy(uL).applyQuaternion(q);
        u.halfW.value = RB * 0.62; u.seaAll.value = 0; u.time.value = t; u.grey.value = 0; u.crack.value = age > -0.09 ? 1 : 0;
        GB.snow.u.time.value = t; GB.snow.u.snowK.value = 1; GB.snow.u.C.value.copy(GB.C);
        // impact debris
        const on = age >= 0;
        shards.visible = on; drops.visible = on; puddle.visible = on;
        if (on) {
          const si = Math.min(sim.steps - 1, Math.floor(age / sim.dt));
          const m4 = new THREE.Matrix4(), e = new THREE.Euler(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3();
          for (let i = 0; i < NSH; i++) {
            const tr = sim.out[i];
            pp.set(tr[si * 6], tr[si * 6 + 1], tr[si * 6 + 2]); e.set(tr[si * 6 + 3], tr[si * 6 + 4], tr[si * 6 + 5]); qq.setFromEuler(e);
            sc.setScalar(shScale[i]); m4.compose(pp, qq, sc); shards.setMatrixAt(i, m4);
          }
          shards.instanceMatrix.needsUpdate = true;
          dU.age.value = age; puU.age.value = age;
        }
        // the hand comes down, and its shadow falls over them
        const hk = smoothstep(PL.handIn, PL.floorEnd, tau);
        hand.group.visible = tau > PL.handIn;
        {
          const dH = dHit * 0.8, fh = 2 * Math.tan(THREE.MathUtils.degToRad(26)) * dH, fw = fh * 16 / 9;
          const hkE = ease.outCubic(hk);
          camB.updateMatrixWorld(true);
          const hp = camB.localToWorld(new THREE.Vector3(lerp(0.62 * fw, 0.16 * fw, hkE), lerp(0.75 * fh, 0.02 * fh, hkE), -dH));
          hand.group.position.copy(hp); hand.group.quaternion.copy(camB.quaternion);
          hand.group.rotateZ(-0.35 + 0.15 * hk); hand.group.scale.setScalar(fh * 0.85);
        }
        shadow.material.uniforms.k.value = 0.75 * smoothstep(0.1, 1.0, hk);
        const dark = 1 - 0.45 * smoothstep(0.2, 1.0, hk);
        floor.uniforms.exposure.value = dark;
        return {
          scene: sceneB, camera: camB, mode: 'plain', clear: 0x000000,
          lens: lensGraphite({ focus: camB.position.distanceTo(hit), aperture: 3.5, maxCoc: 16, exposure: 1.0 + (age > 0 && age < 0.09 ? 0.35 : 0) }),
        };
      }
      if (tau < PL.eyeEnd) {
        // ---------------- C
        const s = tau - PL.floorEnd;
        const open = tau >= PL.snap;
        eye.uniforms.colorMap.value = open ? T.G4a_color : T.G4b_color;
        eye.uniforms.time.value = t; eye.uniforms.boil.value = 0.0005; eye.uniforms.boilT.value = boilT;
        const jolt = open ? Math.exp(-(tau - PL.snap) * 9) : 0;
        const push = lerp(0.0, 0.22, ease.inOutSine(clamp(s / 1.5)));
        const jt = Math.floor(tau * 12);
        camC.position.set(0.02 * Math.sin(jt * 3.1) * jolt + 0.004 * Math.sin(jt * 1.3), 0.02 * Math.cos(jt * 2.3) * jolt, -push - jolt * 0.06);
        camC.lookAt(0.08, 0.02, -2); camC.fov = 40 - jolt * 3; camC.updateProjectionMatrix();
        return {
          scene: sceneC, camera: camC, mode: 'plain', clear: 0x000000,
          lens: lensGraphite({ focus: 1.3, aperture: 4, maxCoc: 14, exposure: 1.0 + jolt * 0.5, contrast: 1.1 + jolt * 0.2 }),
        };
      }
      // ---------------- D: black
      return { scene: sceneD, camera: camD, mode: 'plain', clear: 0x000000, lens: { exposure: 0, letterbox: 1, grain: 0 } };
    },
  };
}
