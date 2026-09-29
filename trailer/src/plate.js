import * as THREE from 'three';
import { NOISE, COMMON } from './glsl.js';

// A painted plate displaced into 3D by its (packed 16-bit) depth map.
// The plate camera sits at the origin looking down -Z with vertical fov `fovY`.
// Disparity d (1 = near) maps to distance z = zNear * (zFar/zNear)^((1-d)^gamma).
export function makeMask(size, polys) {
  // polys: [{ch:'r'|'g'|'b', pts:[[x,y],...] in 0..1 image coords (y down), blur}] -> CanvasTexture
  const [w, h] = size;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (const p of polys) {
    if (p.img) continue;
    g.filter = `blur(${p.blur || 6}px)`;
    g.fillStyle = p.ch === 'r' ? `rgb(${p.v || 255},0,0)` : p.ch === 'g' ? `rgb(0,${p.v || 255},0)` : `rgb(0,0,${p.v || 255})`;
    g.beginPath();
    p.pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
    g.closePath(); g.fill();
  }
  g.filter = 'none';
  // optional greyscale images copied into a channel: {img, ch}
  for (const p of polys) if (p.img) {
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const og = o.getContext('2d'); og.drawImage(p.img, 0, 0, w, h);
    const src = og.getImageData(0, 0, w, h).data, dst = g.getImageData(0, 0, w, h);
    const ci = p.ch === 'r' ? 0 : p.ch === 'g' ? 1 : 2;
    for (let i = 0; i < w * h; i++) dst.data[i * 4 + ci] = Math.max(dst.data[i * 4 + ci], src[i * 4]);
    g.putImageData(dst, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;

export class Plate {
  constructor(o) {
    this.o = o;
    const gx = o.grid ? o.grid[0] : 384, gy = o.grid ? o.grid[1] : 216;
    const geo = new THREE.PlaneGeometry(1, 1, gx, gy);
    const tanY = Math.tan(THREE.MathUtils.degToRad(o.fovY) / 2), tanX = tanY * (o.aspect || 16 / 9);
    this.uniforms = {
      colorMap: { value: o.color }, depthMap: { value: o.depth }, maskMap: { value: o.mask || blackTex },
      uvRect: { value: new THREE.Vector4(...(o.uvRect || [0, 0, 1, 1])) },
      tanHalf: { value: new THREE.Vector2(tanX, tanY) },
      zNear: { value: o.zNear || 1 }, zFar: { value: o.zFar }, gam: { value: o.gamma || 1.0 },
      mapMode: { value: o.K ? 1 : 0 }, Kc: { value: o.K || 1 }, Bc: { value: o.B || 0 }, d0: { value: o.d0 || 0.2 }, skyCut: { value: o.skyCut || 0 },
      tearCut: { value: o.tearCut !== undefined ? o.tearCut : 10.0 },
      time: { value: 0 }, exposure: { value: o.exposure || 1.0 }, tint: { value: new THREE.Color(1, 1, 1) },
      waterAmp: { value: o.waterAmp || 0.0 }, rippleAmp: { value: o.rippleAmp || 0.0 },
      rock: { value: new THREE.Vector4(0, 0.5, 0.6, 0) }, // angle, pivot uv x,y, unused
      opacity: { value: 1.0 }, alphaFromMap: { value: o.alpha ? 1.0 : 0.0 },
      dissolve: { value: 0.0 }, dissolveTile: { value: 0.012 }, liftAmt: { value: 0.0 },
      desat: { value: 0.0 }, boil: { value: 0.0 }, boilT: { value: 0.0 },
      farClip: { value: 1e9 },
      swirl: { value: new THREE.Vector4(0, 0.5, 0.5, 0.1) }, swirlTiles: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: !!o.alpha || !!o.transparent,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
      depthTest: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        ${COMMON}
        uniform sampler2D depthMap; uniform sampler2D maskMap;
        uniform vec4 uvRect; uniform vec2 tanHalf; uniform float zNear, zFar, gam, time; uniform vec4 rock; uniform float mapMode, Kc, Bc, d0, skyCut;
        varying vec2 vUv; varying vec2 vPuv; varying float vTear; varying float vZ;
        void main(){
          vec2 puv = uvRect.xy + uv * uvRect.zw;
          vec4 dc = texture2D(depthMap, puv);
          float d = decodeDepth(dc.rgb);
          float z;
          if (mapMode < 0.5) z = zNear * pow(zFar / zNear, pow(clamp(1.0 - d, 0.0, 1.0), gam));
          else {
            float z0 = Kc / max(d0 - Bc, 1e-3);
            if (d >= d0) z = Kc / max(d - Bc, 1e-3);
            else z = z0 * pow(zFar / z0, pow(clamp((d0 - d) / d0, 0.0, 1.0), gam));
          }
          if (skyCut > 0.0) z = mix(zFar, z, smoothstep(skyCut - 0.012, skyCut + 0.012, d));
          vec2 ndc = puv * 2.0 - 1.0;
          // rocking region (mask b): rotate about a pivot in plate space (ships at anchor)
          float rk = texture2D(maskMap, puv).b;
          if (rk > 0.001) {
            vec2 pv = rock.yz * 2.0 - 1.0;
            vec2 q = ndc - pv; float a = rock.x * rk;
            ndc = pv + mat2(cos(a), sin(a), -sin(a), cos(a)) * q + vec2(0.0, sin(time * 0.9) * 0.0015 * rk);
          }
          vec3 p = vec3(ndc.x * tanHalf.x, ndc.y * tanHalf.y, -1.0) * z;
          vUv = uv; vPuv = puv; vTear = dc.b; vZ = z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${NOISE}
        ${COMMON}
        uniform sampler2D colorMap; uniform sampler2D maskMap;
        uniform float tearCut, time, exposure, waterAmp, rippleAmp, opacity, alphaFromMap, dissolve, dissolveTile, liftAmt, desat, boil, boilT, farClip;
        uniform vec3 tint; uniform vec4 uvRect; uniform vec4 swirl; uniform float swirlTiles;
        varying vec2 vUv; varying vec2 vPuv; varying float vTear; varying float vZ;
        void main(){
          if (vTear > tearCut) discard;
          if (vZ > farClip) discard;
          vec2 uv = vUv;
          vec4 m = texture2D(maskMap, vPuv);
          // water: horizontal shimmer that drags reflections (mask r)
          if (waterAmp > 0.0 && m.r > 0.01) {
            float n1 = vnoise(vec2(vPuv.x * 60.0 + time * 0.1, vPuv.y * 1400.0 - time * 1.6));
            float n2 = vnoise(vec2(vPuv.x * 40.0 + time * 0.2, vPuv.y * 400.0 + time * 0.7));
            uv += vec2((n1 - 0.5) * 0.0005, (n2 - 0.5) * 0.0011) * waterAmp * m.r / uvRect.zw;
          }
          // rain ripples on puddles (mask g)
          float ring = 0.0;
          if (rippleAmp > 0.0 && m.g > 0.01) {
            vec2 q = vec2(vPuv.x * 16.0 / 9.0, vPuv.y) * 70.0;
            for (int k = 0; k < 2; k++) {
              vec2 qq = q + float(k) * vec2(0.37, 0.61);
              vec2 cell = floor(qq), f = fract(qq) - 0.5;
              vec2 o = hash22(cell + float(k) * 13.0) - 0.5;
              float ph = fract(time * (0.9 + hash12(cell + 7.0) * 0.8) + hash12(cell));
              float r = length((f - o * 0.6) * vec2(1.0, 3.2));
              float w = exp(-pow((r - ph * 0.55) * 22.0, 2.0)) * (1.0 - ph);
              ring += w;
              uv += normalize(f - o * 0.6 + 1e-4) * w * 0.0009 * rippleAmp * m.g / uvRect.zw;
            }
          }
          if (boil > 0.0) {
            vec2 bj = vec2(vnoise(vPuv * 180.0 + boilT * 7.3), vnoise(vPuv * 180.0 - boilT * 5.1)) - 0.5;
            uv += bj * boil / uvRect.zw;
          }
          float voidM = 1.0, sring = 0.0;
          if (swirl.x > 0.0) {
            vec2 sc = swirl.yz;
            vec2 d = (vPuv - sc) * vec2(16.0 / 9.0, 1.0); float r = length(d);
            float ang = swirl.x * (0.32 / (r + 0.07)) + time * 2.0 * swirl.x;
            vec2 dd = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d * (1.0 + swirl.x * 0.3 * (1.0 - smoothstep(0.0, 0.9, r)));
            vec2 suv = sc + dd * vec2(9.0 / 16.0, 1.0);
            float ts = 0.012 + 0.03 * swirlTiles * (1.0 - smoothstep(0.0, 0.6, r));
            vec2 q = floor(suv / vec2(ts * 9.0 / 16.0, ts));
            float brk = step(0.5, hash12(q + floor(time * 8.0))) * swirlTiles * (1.0 - smoothstep(0.1, 0.55, r));
            suv = mix(suv, (q + 0.5) * vec2(ts * 9.0 / 16.0, ts), brk);
            uv = (suv - uvRect.xy) / uvRect.zw;
            voidM = smoothstep(swirl.w * 0.6, swirl.w, r);
            sring = exp(-pow((r - swirl.w) * 26.0, 2.0)) * swirl.x;
          }
          vec4 c = texture2D(colorMap, uv);
          vec3 col = c.rgb * exposure * tint * voidM + vec3(0.3, 0.85, 1.2) * sring * 0.55;
          col += vec3(0.55, 0.62, 0.7) * ring * 0.10 * rippleAmp * m.g * (0.3 + luma(col) * 4.0);
          if (desat > 0.0) col = mix(col, vec3(luma(col)), desat);
          float a = mix(1.0, c.a, alphaFromMap) * opacity;
          // tile dissolve (used when the Sea-All eats the ship): tiles vanish by random threshold
          if (dissolve > 0.0) {
            vec2 tq = vec2(vPuv.x * 16.0 / 9.0, vPuv.y) / dissolveTile;
            float r = hash12(floor(tq));
            float reg = m.b;
            if (reg * dissolve * 1.25 > r + 0.02) discard;
          }
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    if (o.renderOrder !== undefined) this.mesh.renderOrder = o.renderOrder;
  }
  // world position of an image pixel (x,y in 0..1, y down) at disparity d
  static unproject(o, x, y, d) {
    const tanY = Math.tan(THREE.MathUtils.degToRad(o.fovY) / 2), tanX = tanY * (o.aspect || 16 / 9);
    let z;
    if (!o.K) z = o.zNear * Math.pow(o.zFar / o.zNear, Math.pow(1 - d, o.gamma || 1));
    else {
      const d0 = o.d0 || 0.2, z0 = o.K / Math.max(d0 - (o.B || 0), 1e-3);
      z = d >= d0 ? o.K / Math.max(d - (o.B || 0), 1e-3) : z0 * Math.pow(o.zFar / z0, Math.pow(Math.min(1, Math.max(0, (d0 - d) / d0)), o.gamma || 1));
    }
    return new THREE.Vector3((x * 2 - 1) * tanX * z, (1 - y * 2) * tanY * z, -z);
  }
}

// Read disparity at an image point from a loaded packed depth texture (CPU side) for placing props.
export function sampleDepth(tex, x, y) {
  const img = tex.image;
  if (!sampleDepth.cache) sampleDepth.cache = new Map();
  let ctx = sampleDepth.cache.get(img);
  if (!ctx) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    sampleDepth.cache.set(img, ctx);
  }
  const px = Math.min(img.width - 1, Math.max(0, Math.round(x * img.width)));
  const py = Math.min(img.height - 1, Math.max(0, Math.round(y * img.height)));
  const d = ctx.getImageData(px, py, 1, 1).data;
  return (d[0] * 256 + d[1]) / 65535;
}
