import * as THREE from 'three';
import { NOISE, COMMON } from './glsl.js';
import { hash } from './util.js';

// DIGITAIL ROTT — a squall of decaying polygons. The face shape comes from a greyscale sculpt
// (luminance + monocular depth), but what renders is a simulation: instanced voxels that assemble
// out of the sky's tiles, breathe, open a jaw, glitch in bands and flake away as blocky residue.
export class RottVoxels {
  constructor(data, o = {}) {
    // data: Float32Array [u, v, depth, lum] * n
    const n = data.length / 4;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index; g.setAttribute('position', box.attributes.position); g.setAttribute('normal', box.attributes.normal);
    g.setAttribute('vox', new THREE.InstancedBufferAttribute(data, 4));
    const rnd = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) rnd[i] = hash(i * 31 + (o.seed || 7));
    g.setAttribute('rnd', new THREE.InstancedBufferAttribute(rnd, 4));
    g.instanceCount = n;
    this.u = {
      time: { value: 0 }, size: { value: new THREE.Vector3(o.w || 260, o.h || 146, o.relief || 40) }, cell: { value: o.cell || 1.0 },
      assemble: { value: 1 }, decay: { value: 0 }, jaw: { value: 0 }, glitch: { value: 0 }, breathe: { value: 0 }, fade: { value: 1 },
      jawBox: { value: new THREE.Vector4(0.40, 0.585, 0.60, 0.78) }, eyes: { value: new THREE.Vector4(0.426, 0.362, 0.573, 0.362) },
      cyan: { value: new THREE.Color(0.35, 0.95, 1.3) }, deep: { value: new THREE.Color(0.02, 0.08, 0.1) },
      scatter: { value: 1.0 }, emissive: { value: 1.0 }, lumCut: { value: 0.0 }, wind: { value: new THREE.Vector3(-12, 6, 0) },
      mouth: { value: new THREE.Vector2(0.5, 0.585) }, eyeGlow: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: false,
      vertexShader: /* glsl */`
        ${NOISE}
        attribute vec4 vox; attribute vec4 rnd;
        uniform float time, cell, assemble, decay, jaw, glitch, breathe, scatter, fade, lumCut;
        uniform vec3 size, wind; uniform vec4 jawBox, eyes; uniform vec2 mouth;
        varying vec3 vLocal; varying vec3 vN; varying float vLum; varying float vAge; varying float vEye; varying float vFade; varying float vDepth;
        void main(){
          vec2 uv = vox.xy; float dep = vox.z; float lum = vox.w;
          vec3 P0 = vec3((uv.x - 0.5) * size.x, (0.5 - uv.y) * size.y, (dep - 0.35) * size.z);
          // breathing swell from the centre
          P0.xy *= 1.0 + breathe * 0.012 * (1.0 - length(uv - 0.5));
          // jaw: everything inside the jaw box drops, weighted toward the chin
          float jw = step(jawBox.x, uv.x) * step(uv.x, jawBox.z) * smoothstep(jawBox.y - 0.01, jawBox.y + 0.03, uv.y) * step(uv.y, jawBox.w + 0.02);
          jw *= smoothstep(jawBox.x, jawBox.x + 0.05, uv.x) * smoothstep(jawBox.z, jawBox.z - 0.05, uv.x);
          P0.y -= jaw * jw * size.y * 0.075 * (0.6 + 0.4 * smoothstep(jawBox.y, jawBox.w, uv.y));
          // assembly: voxels fly in from a scattered sheet of sky tiles
          float delay = clamp(length(uv - vec2(0.5, 0.45)) * 1.2 + rnd.x * 0.35, 0.0, 1.0);
          float a = clamp((assemble * 1.6 - delay * 0.6), 0.0, 1.0);
          a = a * a * (3.0 - 2.0 * a);
          vec3 S = P0 + vec3((rnd.y - 0.5) * size.x * 1.6, (rnd.z - 0.5) * size.y * 1.2 + size.y * 0.25, (rnd.w - 0.5) * size.z * 3.0) * scatter;
          vec3 P = mix(S, P0, a);
          // decay: voxels detach and are carried off as blocky residue
          float thr = rnd.w * 0.85 + (1.0 - lum) * 0.15 + (1.0 - smoothstep(0.0, 0.5, length((uv - 0.5) * vec2(1.0, 1.4)))) * 0.25;
          float age = max(0.0, decay * 1.4 - thr) * 6.0;
          vec3 drift = wind * age + vec3(vnoise(vec2(rnd.y * 40.0, age)) - 0.5, vnoise(vec2(rnd.z * 40.0, age + 3.0)) - 0.5, 0.0) * 30.0 * age;
          drift.y -= 9.0 * age * age;
          P += drift;
          // glitch bands shear sideways in steps
          float band = floor((uv.y + floor(time * 9.0) * 0.137) * 18.0);
          float gb = step(1.0 - glitch * 0.45, hash12(vec2(band, floor(time * 11.0))));
          P.x += gb * (hash12(vec2(band, floor(time * 13.0) + 7.0)) - 0.5) * size.x * 0.12;
          // idle shimmer
          P += (vec3(vnoise(vec2(uv * 30.0 + time * 0.8)), vnoise(vec2(uv * 30.0 - time * 0.7)), 0.0) - 0.5) * cell * 0.6;
          float sc = cell * (0.55 + 0.5 * lum) * (1.0 - smoothstep(0.0, 1.2, age)) * step(lumCut, lum);
          sc *= mix(0.3, 1.0, a);
          vec3 lp = position;
          // tumble detached voxels
          float ang = age * (rnd.x * 8.0 - 4.0);
          lp.xy = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * lp.xy;
          vec3 wp = P + lp * sc;
          vLocal = position; vN = normal; vLum = lum; vAge = age;
          vec2 e1 = (uv - eyes.xy) * vec2(1.0, 1.6), e2 = (uv - eyes.zw) * vec2(1.0, 1.6);
          vEye = exp(-dot(e1, e1) * 9000.0) + exp(-dot(e2, e2) * 9000.0);
          vFade = fade * mix(0.0, 1.0, smoothstep(0.0, 0.25, a + 0.05));
          vec4 mv = modelViewMatrix * vec4(wp, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 cyan, deep; uniform float emissive, eyeGlow;
        varying vec3 vLocal; varying vec3 vN; varying float vLum; varying float vAge; varying float vEye; varying float vFade; varying float vDepth;
        void main(){
          vec3 q = abs(vLocal) * 2.0;
          // distance to the nearest cube edge (two coordinates near 1)
          float m1 = max(q.x, max(q.y, q.z));
          float m2 = q.x + q.y + q.z - m1 - min(q.x, min(q.y, q.z));
          float edge = smoothstep(0.78, 0.97, m2);
          float front = max(vN.z, 0.0), up = max(vN.y, 0.0), down = max(-vN.y, 0.0);
          vec3 face = mix(deep, cyan * 0.6, pow(vLum, 1.8)) * (0.3 + 0.7 * front) + cyan * 0.2 * down * vLum;
          vec3 col = face + cyan * edge * (0.08 + 1.3 * vLum * vLum) * emissive;
          col += vec3(1.0, 0.98, 0.95) * vEye * 6.0 * eyeGlow;
          col += cyan * smoothstep(0.1, 1.0, vAge) * 0.8;
          if (vFade < 0.01) discard;
          gl_FragColor = vec4(col * vFade, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
  }
}

// Glyph atlas for raw data flotsam (timestamps, coordinates, file names) in a vendored mono font.
export function glyphAtlas() {
  const chars = '0123456789ABCDEF:./-_#%><{}[]=+xNWSE';
  const cols = 8, rows = Math.ceil(chars.length / cols), S = 64;
  const c = document.createElement('canvas'); c.width = cols * S; c.height = rows * S;
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.font = `52px "Share Tech Mono"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  [...chars].forEach((ch, i) => g.fillText(ch, (i % cols) * S + S / 2, Math.floor(i / cols) * S + S / 2 + 2));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex: t, n: chars.length, cols, rows };
}

// Streams of glyphs: devoured (harbour -> mouth) and regurgitated (mouth -> scattered flotsam).
export function makeGlyphStreams(count, atlas, o = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const sd = new Float32Array(count * 4); for (let i = 0; i < count * 4; i++) sd[i] = hash(i * 17 + 3);
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(sd, 4)); g.instanceCount = count;
  const u = {
    time: { value: 0 }, atlas: { value: atlas.tex }, grid: { value: new THREE.Vector3(atlas.cols, atlas.rows, atlas.n) },
    mouth: { value: new THREE.Vector3() }, src: { value: new THREE.Vector3() }, srcSpread: { value: new THREE.Vector3(200, 20, 150) },
    amt: { value: 1 }, spew: { value: 0.35 }, size: { value: o.size || 2.2 }, cyan: { value: new THREE.Color(0.5, 1.0, 1.35) }, speed: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${NOISE} attribute vec4 seed; uniform float time, amt, spew, size, speed; uniform vec3 mouth, src, srcSpread, grid;
      varying vec2 vUv; varying float vA; varying float vG;
      void main(){
        float life = 1.4 + seed.w * 1.6;
        float ph = fract(time * speed / life + seed.x);
        vec3 p;
        bool out_ = seed.y < spew;
        if (!out_) {
          vec3 s = src + (vec3(seed.z, seed.w, seed.y) - 0.5) * srcSpread * 2.0;
          vec3 c = mix(s, mouth, 0.5) + vec3(0.0, 60.0 + seed.z * 60.0, 0.0);
          float e = ph * ph;
          p = mix(mix(s, c, e), mix(c, mouth, e), e);
        } else {
          vec3 dir = normalize(vec3(seed.z - 0.5, seed.w * 0.6 - 0.35, 0.6 + seed.x * 0.4)) ;
          p = mouth + dir * ph * (80.0 + seed.w * 140.0) + vec3(0.0, -30.0 * ph * ph, 0.0);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float sz = size * (0.6 + seed.z * 0.8);
        mv.xy += position.xy * sz * vec2(0.62, 1.0);
        float gi = floor(fract(seed.x * 7.13 + floor(time * (4.0 + seed.w * 10.0)) * 0.618) * grid.z);
        vec2 cell = vec2(mod(gi, grid.x), floor(gi / grid.x));
        vUv = vec2((cell.x + uv.x) / grid.x, (grid.y - cell.y - 1.0 + uv.y) / grid.y);
        vA = amt * smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.85, 1.0, ph));
        vG = seed.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D atlas; uniform vec3 cyan; varying vec2 vUv; varying float vA; varying float vG;
      void main(){ float a = texture2D(atlas, vUv).a; vec3 c = mix(cyan, vec3(1.0), step(0.85, vG)); gl_FragColor = vec4(c * a * vA * 1.3, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.u = u;
  return mesh;
}
