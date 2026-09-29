import * as THREE from 'three';
import { Pass } from './fx.js';
import { NOISE, COMMON } from './glsl.js';
import { hash } from './util.js';

// ---------------------------------------------------------------------------------------------
// THE SEA-ALL: world-space sheets of pixel-mosaic tiles. Each sheet is a plane (z = -Z) floating in
// the scene; a tile shows the scene colour found behind its centre, so the picture beneath is
// quantised, and because the sheets live at depth they parallax and the camera can fly through them.
// ---------------------------------------------------------------------------------------------
export class SeaAllPass {
  constructor() {
    const u = {
      tScene: { value: null }, tDepth: { value: null },
      cNear: { value: 0.1 }, cFar: { value: 5000 }, time: { value: 0 },
      camWorld: { value: new THREE.Matrix4() }, viewProj: { value: new THREE.Matrix4() },
      tanHalf: { value: new THREE.Vector2(1, 1) }, res: { value: new THREE.Vector2(1920, 1080) },
      nSheets: { value: 0 },
      sZ: { value: [0, 0, 0, 0] }, sSize: { value: [1, 1, 1, 1] }, sCov: { value: [0, 0, 0, 0] },
      sSeed: { value: [0, 0, 0, 0] }, sLuma: { value: [0, 0, 0, 0] }, sOp: { value: [0, 0, 0, 0] },
      sFreq: { value: [0.01, 0.01, 0.01, 0.01] }, sHollow: { value: [0, 0, 0, 0] }, reveal: { value: 1 },
      sDrift: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
      cyan: { value: new THREE.Color(0.35, 0.95, 1.25) },
      glowAmt: { value: 0.35 }, gridAmt: { value: 0.05 }, hollowFrac: { value: 0.12 },
      globalAmt: { value: 1 }, flood: { value: 0 }, glitch: { value: 0 },
      beamPos: { value: new THREE.Vector3() }, beamDir: { value: new THREE.Vector3(0, 0, -1) },
      beamPow: { value: 60 }, beamAmt: { value: 0 },
      quant: { value: 0 },
    };
    this.pass = new Pass(/* glsl */`
      ${NOISE}
      ${COMMON}
      uniform sampler2D tScene; uniform sampler2D tDepth;
      uniform float cNear, cFar, time, globalAmt, flood, glitch, glowAmt, gridAmt, hollowFrac, beamAmt, beamPow, quant;
      uniform mat4 camWorld, viewProj; uniform vec2 tanHalf, res; uniform vec3 cyan, beamPos, beamDir;
      uniform float sZ[4], sSize[4], sCov[4], sSeed[4], sLuma[4], sOp[4], sFreq[4], sHollow[4]; uniform vec2 sDrift[4]; uniform int nSheets; uniform float reveal;
      varying vec2 vUv;
      float viewDist(vec2 uv){ float d = texture2D(tDepth, uv).x; if (d >= 0.99999) return cFar; return -(cNear*cFar)/((cFar-cNear)*d - cFar); }
      void main(){
        vec2 uv = vUv;
        float gl = 0.0;
        if (glitch > 0.0) {
          float band = floor(uv.y * 36.0 + hash11(floor(time*12.0))*7.0);
          float g = hash12(vec2(band, floor(time*14.0)));
          if (g < glitch*0.55) { gl = 1.0; uv.x += (hash12(vec2(band, 3.0+floor(time*14.0))) - 0.5) * 0.09 * glitch; }
        }
        vec3 base = texture2D(tScene, uv).rgb;
        if (gl > 0.0) { base.r = texture2D(tScene, uv + vec2(0.006*glitch, 0.0)).r; base.b = texture2D(tScene, uv - vec2(0.006*glitch, 0.0)).b; }
        float dist = viewDist(uv);
        vec2 ndc = uv * 2.0 - 1.0;
        vec3 dirV = vec3(ndc.x * tanHalf.x, ndc.y * tanHalf.y, -1.0);
        vec3 D = mat3(camWorld) * dirV;
        vec3 O = camWorld[3].xyz;
        vec3 col = base; float outDepth = dist;
        float pixAng = 2.0 * tanHalf.y / res.y;
        // whole-frame quantisation (boot-up / collapse)
        if (quant > 0.0 || reveal < 1.0) {
          float qs = mix(2.0, 90.0, quant) / res.y;
          vec2 tsz = vec2(qs * res.y / res.x, qs);
          vec2 tid = floor(uv / tsz);
          vec2 qc = (tid + 0.5) * tsz;
          vec3 qcol = texture2D(tScene, qc).rgb;
          vec2 f = fract(uv / tsz);
          float e = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
          float h = hash12(tid + 3.7);
          float on = smoothstep(h - 0.02, h + 0.02, reveal);
          float fresh = (1.0 - smoothstep(0.0, 0.12, reveal - h)) * on;
          qcol *= 0.85 + 0.3 * hash12(tid);
          qcol = mix(qcol, cyan * 0.9, fresh * 0.7);
          qcol += cyan * (1.0 - smoothstep(0.0, 0.06, e)) * 0.12 * quant * on;
          col = mix(col, qcol, smoothstep(0.0, 0.15, quant) * on) * mix(on, 1.0, step(1.0, reveal));
        }
        for (int i = 3; i >= 0; i--) {
          if (i >= nSheets) continue;
          float Z = sZ[i];
          float s = (-Z - O.z) / D.z;
          if (s <= 0.02 || s >= dist) continue;
          vec3 H = O + D * s;
          vec2 q = H.xy / sSize[i] + sDrift[i] * time;
          vec2 cell = floor(q); vec2 f = fract(q);
          vec2 cc = (cell + 0.5 - sDrift[i] * time) * sSize[i];
          vec4 clip = viewProj * vec4(cc, -Z, 1.0);
          vec2 uvC = clip.xy / clip.w * 0.5 + 0.5;
          vec3 sc = texture2D(tScene, clamp(uvC, 0.001, 0.999)).rgb;
          float lc = luma(sc);
          float n = fbm(cc * sFreq[i] + vec2(sSeed[i], sSeed[i] * 1.7) + vec2(time * 0.035, time * 0.012));
          float cov = clamp(sCov[i] + flood, 0.0, 1.2);
          float v = n + sLuma[i] * (sqrt(max(lc, 0.0)) - 0.3);
          float th = mix(0.74, 0.30, cov);
          float m = smoothstep(th - 0.02, th + 0.09, v);
          float r = hash12(cell + sSeed[i]);
          vec3 vb = normalize(vec3(cc, -Z) - beamPos);
          float bi = pow(max(dot(vb, beamDir), 0.0), beamPow) * beamAmt;
          float tileA = clamp((m * 1.25 - r * 0.38) * 5.0 + bi * 0.9 * step(r, 0.6), 0.0, 1.0) * sOp[i] * globalAmt;
          if (tileA <= 0.002) continue;
          float sq = 1.0 - clamp(bi, 0.0, 1.0) * 0.92 * (0.5 + 0.5 * sin(time * 16.0 + r * 40.0));
          vec2 fx = vec2((f.x - 0.5) / max(sq, 0.05) + 0.5, f.y);
          float fw = (s * pixAng) / sSize[i];
          float e = min(min(fx.x, 1.0 - fx.x), min(fx.y, 1.0 - fx.y));
          float gap = 0.03 + 0.5 * fw;
          float inside = smoothstep(gap, gap + fw * 1.5, e) * step(0.0, fx.x) * step(fx.x, 1.0);
          float hollow = max(step(hash12(cell + sSeed[i] + 91.0), hollowFrac), sHollow[i]);
          float r2 = hash12(cell + 5.0), r3 = hash12(cell + 29.0);
          vec3 tc = sc * (0.82 + 0.36 * r2);
          float hot = step(r3, 0.015 + 0.22 * lc) * step(0.6, m);
          tc = mix(tc, vec3(0.62, 0.92, 1.05) * (0.25 + 1.4 * lc), hot * 0.55);
          tc *= 1.0 + 0.12 * (fx.x - fx.y) * inside;
          tc += cyan * 0.35 * bi * (0.3 + lc);
          float line = 1.0 - smoothstep(0.0, gap * 1.4 + fw, e);
          vec3 glow = cyan * line * glowAmt * (0.2 + 0.8 * r3) * (0.25 + lc) * (1.0 + 3.0 * bi);
          col = mix(col, tc, inside * tileA * (1.0 - hollow));
          col = mix(col, col * 0.85, inside * tileA * hollow * 0.5);
          col += glow * tileA;
          if (inside * tileA * (1.0 - hollow) > 0.5) outDepth = s;
        }
        if (gridAmt > 0.0 && nSheets > 0) {
          float Z = sZ[nSheets - 1] * 0.7; float s = (-Z - O.z) / D.z;
          if (s > 0.05 && s < dist) {
            vec3 H = O + D * s; float gs = sSize[nSheets - 1] * 5.0; vec2 q = H.xy / gs;
            float fw = (s * pixAng) / gs;
            vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
            float l = 1.0 - clamp(min(g.x, g.y) - 0.3, 0.0, 1.0);
            float gm = smoothstep(0.42, 0.75, fbm(H.xy * 0.0035 + 7.0 + time * 0.01));
            col += cyan * l * gm * gridAmt * globalAmt;
          }
        }
        gl_FragColor = vec4(col, outDepth);
      }`, u);
    this.u = u;
  }
  setCamera(cam, w, h) {
    const u = this.u;
    cam.updateMatrixWorld();
    u.camWorld.value.copy(cam.matrixWorld);
    u.viewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    u.tanHalf.value.set(ty * cam.aspect, ty);
    u.cNear.value = cam.near; u.cFar.value = cam.far;
    u.res.value.set(w, h);
  }
  setSheets(list) {
    const u = this.u; u.nSheets.value = list.length;
    list.forEach((s, i) => {
      u.sZ.value[i] = s.z; u.sSize.value[i] = s.size; u.sCov.value[i] = s.cov; u.sSeed.value[i] = s.seed || i * 13.7;
      u.sLuma.value[i] = s.luma || 0; u.sOp.value[i] = s.op !== undefined ? s.op : 1; u.sFreq.value[i] = s.freq || 0.01; u.sHollow.value[i] = s.hollow || 0;
      u.sDrift.value[i].set(...(s.drift || [0, 0]));
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Static-rain flecks: 3D instanced particles, streaked and square, cyan/white, twinkling.
// ---------------------------------------------------------------------------------------------
export function makeFlecks(count, box, o = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = hash(i * 7 + (o.seed || 1));
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  const u = {
    time: { value: 0 }, boxMin: { value: new THREE.Vector3(...box.min) }, boxSize: { value: new THREE.Vector3(...box.size) },
    fall: { value: o.fall || 30 }, wind: { value: o.wind || 3 }, size: { value: o.size || 0.12 }, streak: { value: o.streak || 6 },
    opacity: { value: o.opacity || 1 }, cyan: { value: new THREE.Color(0.55, 1.0, 1.3) }, squareFrac: { value: o.squareFrac || 0.35 },
    nearFade: { value: o.nearFade || 1.5 }, bright: { value: o.bright || 1.6 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 seed; uniform float time, fall, wind, size, streak, squareFrac, nearFade; uniform vec3 boxMin, boxSize;
      varying vec2 vQ; varying float vA; varying float vSq; varying float vTw;
      void main(){
        vec3 p = seed.xyz * boxSize;
        p.y -= time * fall * (0.6 + 0.8 * seed.w);
        p.x += time * wind * (0.5 + seed.w);
        p = boxMin + mod(p, boxSize);
        float sq = step(seed.w, squareFrac);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float sz = size * (0.5 + seed.x);
        vec2 q = position.xy;
        vec2 scale = sq > 0.5 ? vec2(sz * 0.8) : vec2(sz * 0.35, sz * streak * (0.6 + seed.y));
        mv.xy += q * scale;
        vQ = q; vSq = sq;
        vA = smoothstep(0.3, nearFade, dist) * (1.0 - smoothstep(boxSize.z * 0.8, boxSize.z * 1.2, dist));
        vTw = 0.5 + 0.5 * sin(time * (3.0 + seed.y * 9.0) + seed.z * 50.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float opacity, bright; uniform vec3 cyan; varying vec2 vQ; varying float vA; varying float vSq; varying float vTw;
      void main(){
        float a = vSq > 0.5 ? 1.0 : (1.0 - smoothstep(0.2, 0.5, abs(vQ.x))) * (1.0 - smoothstep(0.3, 0.5, abs(vQ.y)));
        vec3 c = mix(vec3(1.0), cyan, vSq * 0.8 + 0.2) * bright;
        gl_FragColor = vec4(c * a * vA * opacity * (vSq > 0.5 ? vTw : 0.7), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  mesh.u = u;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Wireframe cuboids with gridded faces (as in the reference): drifting, slowly turning.
// ---------------------------------------------------------------------------------------------
export function cuboidGeometry(w, h, d, div) {
  const pts = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const seg = (a, b) => pts.push(...a, ...b);
  const C = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]];
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => seg(C[a], C[b]));
  const n = div;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    // front face (z=+hd) grid
    seg([-hw + w * t, -hh, hd], [-hw + w * t, hh, hd]); seg([-hw, -hh + h * t, hd], [hw, -hh + h * t, hd]);
    // side face (x=+hw) grid
    seg([hw, -hh, -hd + d * t], [hw, hh, -hd + d * t]); seg([hw, -hh + h * t, -hd], [hw, -hh + h * t, hd]);
    // top face (y=+hh)
    seg([-hw + w * t, hh, -hd], [-hw + w * t, hh, hd]); seg([-hw, hh, -hd + d * t], [hw, hh, -hd + d * t]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
export function makeCuboids(specs) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 }, cyan: { value: new THREE.Color(0.45, 1.0, 1.35) }, fadeNear: { value: 2.0 }, fadeFar: { value: 900 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float opacity, fadeNear, fadeFar; uniform vec3 cyan; varying float vD;
      void main(){ float a = smoothstep(0.5, fadeNear, vD) * (1.0 - smoothstep(fadeFar*0.5, fadeFar, vD)); gl_FragColor = vec4(cyan * a * opacity * 0.55, 1.0); }`,
  });
  for (const s of specs) {
    const l = new THREE.LineSegments(cuboidGeometry(s.w, s.h, s.d, s.div || 4), mat);
    l.userData = s; l.frustumCulled = false; group.add(l);
  }
  group.mat = mat;
  group.update = (t) => {
    group.children.forEach((l, i) => {
      const s = l.userData;
      l.position.set(s.p[0] + (s.v ? s.v[0] * t : 0), s.p[1] + (s.v ? s.v[1] * t : 0) + Math.sin(t * 0.4 + i) * (s.bob || 0), s.p[2] + (s.v ? s.v[2] * t : 0));
      l.rotation.set((s.r ? s.r[0] : 0) + t * (s.w0 || 0.02), (s.r ? s.r[1] : 0.4) + t * (s.w1 || 0.05), s.r ? s.r[2] : 0);
      const fl = s.flicker ? 0.6 + 0.4 * Math.sin(t * 7 + i * 3) : 1;
      l.visible = true; l.scale.setScalar(s.scale || 1);
      l.material.uniforms.opacity.value = (s.op !== undefined ? s.op : 1) * fl * (group.fade !== undefined ? group.fade : 1);
    });
  };
  return group;
}

// ---------------------------------------------------------------------------------------------
// Volumetric-looking lighthouse beam: additive cone with soft core and drifting dust.
// ---------------------------------------------------------------------------------------------
export function makeBeam(len, radius) {
  const g = new THREE.CylinderGeometry(radius * 0.02, radius, len, 48, 1, true);
  g.translate(0, -len / 2, 0); g.rotateX(Math.PI / 2); // cone apex at origin, pointing -Z
  const u = { time: { value: 0 }, intensity: { value: 1 }, color: { value: new THREE.Color(1.0, 0.92, 0.75) }, len: { value: len } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `${NOISE} uniform float time, intensity, len; uniform vec3 color; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float along = clamp(-vP.z / len, 0.0, 1.0);
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float dust = 0.65 + 0.35 * vnoise(vec2(vP.x*0.15 + time*0.6, vP.z*0.05 - time*0.3));
        float a = edge * pow(1.0 - along, 1.6) * dust * intensity * 0.35;
        gl_FragColor = vec4(color * a, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.u = u;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Diegetic Sea-All data labels (canvas text in the vendored pixel font) as billboards.
// ---------------------------------------------------------------------------------------------
export function labelTexture(lines, o = {}) {
  const c = document.createElement('canvas');
  // size the canvas to the widest line so nothing clips
  const meas = document.createElement('canvas').getContext('2d');
  let need = 0;
  lines.forEach((ln, i) => { const sz = ln.size || (i === 0 ? 72 : 34); meas.font = `${ln.weight || 400} ${sz}px ${ln.font || 'Silkscreen'}`; need = Math.max(need, meas.measureText(ln.text).width + 80); });
  const W = Math.max(o.w || 1024, Math.ceil(need)), H = o.h || 256; c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const cy = o.color || 'rgba(120,245,255,1)';
  g.strokeStyle = cy; g.fillStyle = cy; g.lineWidth = 3;
  // bracket + leader
  g.globalAlpha = 0.9;
  g.beginPath(); g.moveTo(8, 18); g.lineTo(8, 8); g.lineTo(28, 8); g.stroke();
  g.beginPath(); g.moveTo(8, H - 18); g.lineTo(8, H - 8); g.lineTo(28, H - 8); g.stroke();
  let y = o.pad || 26;
  lines.forEach((ln, i) => {
    const sz = ln.size || (i === 0 ? 72 : 34);
    g.font = `${ln.weight || 400} ${sz}px ${ln.font || 'Silkscreen'}`;
    g.globalAlpha = ln.alpha || (i === 0 ? 1 : 0.8);
    g.shadowColor = 'rgba(80,230,255,0.9)'; g.shadowBlur = i === 0 ? 18 : 8;
    g.fillText(ln.text, 40, y + sz * 0.82);
    y += sz * 1.12;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.userData.aspect = W / H;
  return t;
}
export function makeLabel(tex, worldH, aspectIn) {
  const aspect = tex.userData.aspect || aspectIn;
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, opacity: { value: 1 }, reveal: { value: 1 }, time: { value: 0 }, boost: { value: 1.6 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE} uniform sampler2D map; uniform float opacity, reveal, time, boost; varying vec2 vUv;
      void main(){ vec4 c = texture2D(map, vUv);
        float cut = step(vUv.x, reveal * 1.05);
        float row = floor(vUv.y * 24.0);
        float fl = 0.85 + 0.15 * step(0.5, hash12(vec2(row, floor(time * 20.0))));
        gl_FragColor = vec4(c.rgb * c.a * opacity * cut * fl * boost, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldH * aspect, worldH), m);
  mesh.frustumCulled = false;
  return mesh;
}
