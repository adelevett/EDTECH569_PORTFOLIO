import * as THREE from 'three';
import { NOISE, COMMON } from './glsl.js';
import { noise1, fbm1, clamp } from './util.js';

// ---------------------------------------------------------------------------------------------
// SpriteRig: a painted character on a deformable mesh. Pivot = feet (bottom-centre).
// Deformers: bob, squash/stretch, sway about the feet, head turn/nod about a neck pivot,
// breathing, coat-hem flutter, plus an in-shader "tail erase" so a simulated tail can replace
// the painted one.
// ---------------------------------------------------------------------------------------------
const MAXP = 16;
export class SpriteRig {
  constructor(tex, heightWorld, o = {}) {
    const img = tex.image; const aspect = img.width / img.height;
    this.h = heightWorld; this.w = heightWorld * aspect; this.aspect = aspect;
    const geo = new THREE.PlaneGeometry(this.w, this.h, o.gx || 24, o.gy || 32);
    geo.translate(0, this.h / 2, 0);
    this.u = {
      map: { value: tex }, time: { value: 0 }, opacity: { value: 1 },
      bob: { value: 0 }, squash: { value: 0 }, sway: { value: 0 },
      head: { value: new THREE.Vector4(0, 0, 0.72, 0.5) },   // rotZ, nodY, neckV, neckU
      hem: { value: new THREE.Vector3(0, 0.28, 1.0) },          // amp, hemV, freq
      breathe: { value: 0 }, size: { value: new THREE.Vector2(this.w, this.h) },
      tint: { value: new THREE.Color(1, 1, 1) }, rim: { value: new THREE.Color(0.3, 0.9, 1.2) }, rimAmt: { value: 0 },
      texel: { value: new THREE.Vector2(1 / img.width, 1 / img.height) },
      tailPts: { value: Array.from({ length: MAXP }, () => new THREE.Vector3()) }, tailN: { value: 0 },
      glow: { value: 0 }, desat: { value: 0 },
      nose: { value: new THREE.Vector4(0, 0, 0.05, 0) }, noseDir: { value: new THREE.Vector2(0.3, 1) }, shake: { value: new THREE.Vector2() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        ${NOISE}
        uniform float time, bob, squash, sway, breathe; uniform vec4 head; uniform vec3 hem; uniform vec2 size; uniform vec4 nose; uniform vec2 noseDir; uniform vec2 shake;
        varying vec2 vUv;
        vec2 rot(vec2 p, float a){ return mat2(cos(a), sin(a), -sin(a), cos(a)) * p; }
        void main(){
          vUv = uv;
          vec3 p = position;
          // head: rotate the region above the neck line about the neck pivot
          vec2 neck = vec2((head.w - 0.5) * size.x, head.z * size.y);
          float hw = smoothstep(head.z - 0.08, head.z + 0.06, uv.y);
          vec2 q = p.xy - neck; q = rot(q, head.x * hw); q.y += head.y * hw * size.y; p.xy = neck + q;
          // breathing around the chest
          float chest = smoothstep(0.2, 0.5, uv.y) * (1.0 - smoothstep(0.55, 0.8, uv.y));
          p.x *= 1.0 + breathe * chest * 0.03;
          // coat hem flutter
          float hm = 1.0 - smoothstep(hem.y * 0.3, hem.y, uv.y);
          p.x += hem.x * hm * size.x * (vnoise(vec2(uv.x * 3.0 + time * hem.z * 2.0, uv.y * 2.0)) - 0.5);
          p.y += hem.x * hm * size.y * 0.3 * (vnoise(vec2(uv.x * 5.0 - time * hem.z * 2.3, 4.0)) - 0.5);
          // nose/snout twitch (sniffing): local bump around a point
          if (nose.w != 0.0) {
            vec2 dd = (uv - nose.xy) * vec2(size.x / size.y, 1.0);
            float nw = 1.0 - smoothstep(0.0, nose.z, length(dd));
            p.xy += noseDir * nose.w * nw * nw * size.y;
          }
          p.xy += shake * smoothstep(head.z - 0.1, head.z + 0.1, uv.y);
          // squash & stretch around the feet, then sway, then bob
          p.y *= 1.0 - squash; p.x *= 1.0 + squash * 0.6;
          p.xy = rot(p.xy, sway);
          p.y += bob;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${COMMON}
        uniform sampler2D map; uniform float opacity, rimAmt, glow, desat; uniform vec3 tint, rim; uniform vec2 texel;
        uniform vec3 tailPts[${MAXP}]; uniform int tailN;
        varying vec2 vUv;
        float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
        void main(){
          vec4 c = texture2D(map, vUv);
          // erase painted tail (replaced by the simulated ribbon)
          if (tailN > 1) {
            vec2 px = vUv / texel;
            for (int i = 0; i < ${MAXP - 1}; i++) {
              if (i >= tailN - 1) break;
              vec3 a = tailPts[i], b = tailPts[i + 1];
              float d = segDist(px, a.xy, b.xy);
              float w = mix(a.z, b.z, 0.5);
              if (d < w) c.a *= smoothstep(w * 0.8, w, d);
            }
          }
          if (c.a < 0.02) discard;
          vec3 col = c.rgb * tint;
          if (rimAmt > 0.0) {
            float al = texture2D(map, vUv + vec2(-6.0, 0.0) * texel).a;
            float ar = texture2D(map, vUv + vec2(6.0, 3.0) * texel).a;
            float edge = clamp(c.a - al, 0.0, 1.0) + 0.5 * clamp(c.a - ar, 0.0, 1.0);
            col += rim * edge * rimAmt;
          }
          col += rim * glow * c.a;
          if (desat > 0.0) col = mix(col, vec3(luma(col)), desat);
          gl_FragColor = vec4(col, c.a * opacity);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group(); this.group.add(this.mesh);
  }
  setTail(pts) { // pts: [[px,py,halfWidthPx]] in image pixels (y down) -> shader uses uv space pixels (y up)
    const H = this.u.map.value.image.height;
    pts.forEach((p, i) => this.u.tailPts.value[i].set(p[0], H - p[1], p[2]));
    this.u.tailN.value = pts.length;
  }
  // image pixel (y down) -> local mesh coords (feet at origin)
  local(px, py) {
    const img = this.u.map.value.image;
    return new THREE.Vector2((px / img.width - 0.5) * this.w, (1 - py / img.height) * this.h);
  }
}

// ---------------------------------------------------------------------------------------------
// Verlet strand in 2D (sprite plane): used for tails and whiskers. Deterministic fixed-step sim.
// ---------------------------------------------------------------------------------------------
export class Strand2D {
  constructor(rest, o = {}) {
    // rest: array of Vector2 (local coords); o: stiffness (0..1 per point via fn), damping, force(t,i)->[fx,fy]
    this.rest = rest.map(p => p.clone());
    this.n = rest.length;
    this.len = []; for (let i = 0; i < this.n - 1; i++) this.len.push(rest[i].distanceTo(rest[i + 1]));
    this.restAng = []; for (let i = 0; i < this.n - 1; i++) { const d = rest[i + 1].clone().sub(rest[i]); this.restAng.push(Math.atan2(d.y, d.x)); }
    this.o = Object.assign({ stiff: i => 0.25, damping: 0.94, iters: 6, dt: 1 / 240 }, o);
    this.reset();
  }
  reset() { this.p = this.rest.map(v => v.clone()); this.pp = this.rest.map(v => v.clone()); this.simT = 0; this.steps = 0; }
  // advance the sim to time t (seconds since strand start); rewinds if needed
  simulateTo(t, anchorFn) {
    const dt = this.o.dt; const target = Math.max(0, Math.floor(t / dt));
    if (target < this.steps) this.reset();
    while (this.steps < target) { this.step(this.steps * dt, dt, anchorFn); this.steps++; }
  }
  step(t, dt, anchorFn) {
    const { p, pp, n } = this; const o = this.o;
    const anc = anchorFn ? anchorFn(t) : { x: this.rest[0].x, y: this.rest[0].y, a: 0 };
    for (let i = 1; i < n; i++) {
      const vx = (p[i].x - pp[i].x) * o.damping, vy = (p[i].y - pp[i].y) * o.damping;
      pp[i].copy(p[i]);
      const f = o.force ? o.force(t, i, p[i]) : [0, 0];
      p[i].x += vx + f[0] * dt * dt; p[i].y += vy + f[1] * dt * dt;
    }
    p[0].set(anc.x, anc.y); pp[0].copy(p[0]);
    for (let it = 0; it < o.iters; it++) {
      // bending: pull each point toward its rest direction relative to the previous segment
      for (let i = 1; i < n; i++) {
        let base;
        if (i === 1) base = this.restAng[0] + anc.a;
        else { const d = p[i - 1].clone().sub(p[i - 2]); base = Math.atan2(d.y, d.x) + (this.restAng[i - 1] - this.restAng[i - 2]); }
        const tx = p[i - 1].x + Math.cos(base) * this.len[i - 1], ty = p[i - 1].y + Math.sin(base) * this.len[i - 1];
        const k = o.stiff(i);
        p[i].x += (tx - p[i].x) * k; p[i].y += (ty - p[i].y) * k;
      }
      // length constraints
      for (let i = 0; i < n - 1; i++) {
        const a = p[i], b = p[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - this.len[i]) / d;
        if (i === 0) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
      if (o.floor !== undefined) for (let i = 1; i < n; i++) if (p[i].y < o.floor) p[i].y = o.floor;
    }
  }
}

// Ribbon that re-skins a painted tail along a simulated strand.
export class TailRibbon {
  constructor(rig, pathPx, o = {}) {
    // pathPx: [[x,y,halfWidth]] image pixels along the painted tail, root first
    this.rig = rig;
    const img = rig.u.map.value.image;
    const res = 28;
    // resample the painted path uniformly
    const P = pathPx.map(p => new THREE.Vector2(p[0], p[1])); const Wd = pathPx.map(p => p[2]);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const L = cum[cum.length - 1];
    const sample = s => { let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1); return [P[i].clone().lerp(P[i + 1], t), Wd[i] + (Wd[i + 1] - Wd[i]) * t]; };
    this.restPx = []; this.wPx = [];
    for (let k = 0; k < res; k++) { const [p, w] = sample(L * k / (res - 1)); this.restPx.push(p); this.wPx.push(w); }
    const restLocal = this.restPx.map(p => rig.local(p.x, p.y));
    this.strand = new Strand2D(restLocal, Object.assign({ stiff: i => 0.18 * Math.pow(1 - i / res, 1.5) + 0.02, damping: 0.965, iters: 5,
      force: (t, i, p) => { const s = i / res; return [fbm1(t * 0.6 + s * 1.3, 91 + (o.seed || 0)) * 26 * s, fbm1(t * 0.5 + s, 17 + (o.seed || 0)) * 7 * s]; } }, o.sim || {}));
    const n = res;
    const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    for (let k = 0; k < n; k++) {
      // UV of left/right edges at the painted location (texture v up)
      const p = this.restPx[k], w = this.wPx[k] * 1.0;
      const t = k < n - 1 ? this.restPx[k + 1].clone().sub(p) : p.clone().sub(this.restPx[k - 1]);
      t.normalize(); const nrm = new THREE.Vector2(-t.y, t.x);
      const l = p.clone().addScaledVector(nrm, w), r = p.clone().addScaledVector(nrm, -w);
      uv.set([l.x / img.width, 1 - l.y / img.height, r.x / img.width, 1 - r.y / img.height], k * 4);
      if (k < n - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    const side = new Float32Array(n * 2); for (let k = 0; k < n; k++) { side[k * 2] = -1; side[k * 2 + 1] = 1; }
    g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: rig.u.map.value }, tint: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 }, rim: { value: rig.u.rim.value }, glow: { value: 0 }, desat: { value: 0 } },
      transparent: true, depthWrite: true, side: THREE.DoubleSide,
      vertexShader: `attribute float side; varying vec2 vUv; varying float vSide; void main(){ vUv = uv; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${COMMON} uniform sampler2D map; uniform vec3 tint, rim; uniform float opacity, glow, desat; varying vec2 vUv; varying float vSide;
        void main(){ vec4 c = texture2D(map, vUv); c.a *= 1.0 - smoothstep(0.8, 1.0, abs(vSide)); if (c.a < 0.02) discard;
          vec3 col = c.rgb * tint + rim * glow * c.a; if (desat > 0.0) col = mix(col, vec3(luma(col)), desat);
          gl_FragColor = vec4(col, c.a * opacity); }`,
    });
    this.material = m;
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false;
    rig.group.add(this.mesh);
    this.pathForErase = pathPx;
    rig.setTail(pathPx.slice(o.eraseFrom || 1).map(p => [p[0], p[1], p[2] * 1.0]));
  }
  update(t, anchorFn) {
    this.strand.simulateTo(t, anchorFn);
    const p = this.strand.p, n = p.length, pos = this.geo.attributes.position.array;
    for (let k = 0; k < n; k++) {
      const t2 = k < n - 1 ? p[k + 1].clone().sub(p[k]) : p[k].clone().sub(p[k - 1]); t2.normalize();
      const nrm = new THREE.Vector2(-t2.y, t2.x);
      // widths in local units
      const w = this.wPx[k] * 1.0 * (this.rig.h / this.rig.u.map.value.image.height);
      pos.set([p[k].x + nrm.x * w, p[k].y + nrm.y * w, 0.002, p[k].x - nrm.x * w, p[k].y - nrm.y * w, 0.002], k * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
    const mu = this.material.uniforms, ru = this.rig.u;
    mu.tint.value.copy(ru.tint.value); mu.opacity.value = ru.opacity.value; mu.glow.value = ru.glow.value; mu.desat.value = ru.desat.value;
  }
}

// ---------------------------------------------------------------------------------------------
// Whiskers: stiff simulated strands rendered as tapered glowing ribbons with travelling charges.
// ---------------------------------------------------------------------------------------------
export class Whiskers {
  constructor(specs, o = {}) {
    // specs: [{root:[x,y], ang (rad), len, curve}] in the local space of the parent
    this.group = new THREE.Group();
    this.strands = []; this.specs = specs;
    const segN = 10;
    const u = { time: { value: 0 }, charge: { value: 0 }, base: { value: new THREE.Color(0.85, 0.82, 0.78) }, cyan: { value: new THREE.Color(0.4, 1.0, 1.4) }, opacity: { value: 1 }, glowK: { value: 1 } };
    this.u = u;
    this.material = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float side; attribute float along; attribute float wid; varying float vSide; varying float vAlong; varying float vId; attribute float wid2;
        void main(){ vSide = side; vAlong = along; vId = wid2; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${NOISE} uniform float time, charge, opacity, glowK; uniform vec3 base, cyan; varying float vSide; varying float vAlong; varying float vId;
        void main(){ float core = 1.0 - smoothstep(0.25, 1.0, abs(vSide));
          float taper = 1.0 - smoothstep(0.75, 1.0, vAlong);
          float pulse = 0.0;
          for (int k = 0; k < 3; k++){ float ph = fract(time * (0.9 + 0.2*float(k)) + vId * 0.37 + float(k) * 0.33); pulse += exp(-pow((vAlong - ph) * 14.0, 2.0)); }
          vec3 c = base * (0.55 + 0.45 * core) + cyan * (charge * (0.25 + 2.5 * pulse)) * glowK;
          float a = core * taper * opacity * (0.75 + 0.25 * charge);
          gl_FragColor = vec4(c, a); }`,
    });
    specs.forEach((s, k) => {
      const rest = [];
      for (let i = 0; i < segN; i++) {
        const f = i / (segN - 1);
        const a = s.ang + (s.curve || 0) * f * f;
        const r = s.len * f;
        rest.push(new THREE.Vector2(s.root[0] + Math.cos(s.ang) * r + Math.cos(a) * 0, s.root[1] + Math.sin(s.ang) * r + (s.curve || 0) * s.len * f * f * 0.3));
      }
      const st = new Strand2D(rest, { stiff: i => 0.55 - 0.3 * i / segN, damping: 0.9, iters: 4,
        force: (t, i, p) => [0, -30 * (i / segN)] });
      this.strands.push(st);
      const pos = new Float32Array(segN * 2 * 3), side = new Float32Array(segN * 2), along = new Float32Array(segN * 2), wid2 = new Float32Array(segN * 2), idx = [];
      for (let i = 0; i < segN; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; along[i * 2] = along[i * 2 + 1] = i / (segN - 1); wid2[i * 2] = wid2[i * 2 + 1] = k; if (i < segN - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('side', new THREE.BufferAttribute(side, 1));
      g.setAttribute('along', new THREE.BufferAttribute(along, 1)); g.setAttribute('wid2', new THREE.BufferAttribute(wid2, 1)); g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.material); mesh.frustumCulled = false; mesh.renderOrder = 5;
      this.group.add(mesh);
    });
    this.width = o.width || 0.01;
  }
  update(t, twitch) {
    // twitch(t) -> angle offset for sniff impulses
    this.strands.forEach((st, k) => {
      const s = this.specs[k];
      st.simulateTo(t, tt => ({ x: s.root[0], y: s.root[1], a: (twitch ? twitch(tt, k) : 0) + noise1(tt * 3 + k, 7 + k) * 0.03 }));
      const mesh = this.group.children[k]; const pos = mesh.geometry.attributes.position.array; const p = st.p; const n = p.length;
      for (let i = 0; i < n; i++) {
        const tg = i < n - 1 ? p[i + 1].clone().sub(p[i]) : p[i].clone().sub(p[i - 1]); tg.normalize();
        const w = this.width * (1 - 0.8 * i / (n - 1)) * (s.w || 1);
        pos.set([p[i].x - tg.y * w, p[i].y + tg.x * w, 0.004, p[i].x + tg.y * w, p[i].y - tg.x * w, 0.004], i * 6);
      }
      mesh.geometry.attributes.position.needsUpdate = true;
    });
    this.u.time.value = t;
  }
  tips() { return this.strands.map(s => s.p[s.p.length - 1].clone()); }
}

// ---------------------------------------------------------------------------------------------
// Pose-set player: generated key poses played with timing (holds, not interpolation).
// frames: [{tex, feet:[px,py]}] ; returns index for time.
// ---------------------------------------------------------------------------------------------
export function poseIndex(t, fps, n, offset = 0) { return ((Math.floor(t * fps + offset) % n) + n) % n; }
