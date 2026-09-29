import * as THREE from 'three';
import { makeFlecks } from './overlay.js';
import { clamp, lerp, smoothstep, ease, hash } from './util.js';
import { NOISE } from './glsl.js';

// TITLE — THREE BLIND MICE (engraved, a glint crosses it) / SEA-ALL (pixel tiles assemble, then
// dissolve upward into the white flakes that become the snow in the globe).
function textCanvas(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return { tex: t, canvas: c };
}

export function shotTitle(ctx, lib) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  const D = 10, frameH = 2 * Math.tan(THREE.MathUtils.degToRad(15)) * D, frameW = frameH * 16 / 9;

  const title = textCanvas((g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 150px Cinzel';
    if ('letterSpacing' in g) g.letterSpacing = '34px';
    const x = w / 2, y = h / 2 + 6;
    g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillText('THREE BLIND MICE', x + 3, y + 5);          // cut shadow
    g.fillStyle = 'rgba(255,240,210,0.55)'; g.fillText('THREE BLIND MICE', x - 2, y - 2);   // top bevel
    const gr = g.createLinearGradient(0, y - 80, 0, y + 80);
    gr.addColorStop(0, '#f3e3bf'); gr.addColorStop(0.45, '#c9a36a'); gr.addColorStop(0.55, '#8a6a3c'); gr.addColorStop(1, '#d9bd88');
    g.fillStyle = gr; g.fillText('THREE BLIND MICE', x, y);
  }, 3072, 320);
  const titleU = { map: { value: title.tex }, glint: { value: -1 }, opacity: { value: 0 }, time: { value: 0 } };
  const titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(frameW * 0.86, frameW * 0.86 * 320 / 3072), new THREE.ShaderMaterial({
    uniforms: titleU, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE} uniform sampler2D map; uniform float glint, opacity, time; varying vec2 vUv;
      void main(){ vec4 c = texture2D(map, vUv);
        float gx = vUv.x - glint + (vUv.y - 0.5) * 0.18;
        float gl = exp(-gx * gx * 900.0) * 2.6 + exp(-gx * gx * 60.0) * 0.35;
        vec3 col = c.rgb * (0.9 + gl) + vec3(1.0, 0.95, 0.85) * gl * c.a * 0.6;
        float scratch = 0.9 + 0.1 * vnoise(vUv * vec2(900.0, 40.0));
        gl_FragColor = vec4(col * scratch, c.a * opacity); }`,
  }));
  titleMesh.position.set(0, frameH * 0.1, -D);
  scene.add(titleMesh);

  // rule
  const ruleU = { k: { value: 0 } };
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(frameW * 0.5, frameH * 0.003), new THREE.ShaderMaterial({
    uniforms: ruleU, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float k; varying vec2 vUv; void main(){ float a = step(abs(vUv.x - 0.5) * 2.0, k) * (1.0 - smoothstep(0.6, 1.0, abs(vUv.x - 0.5) * 2.0)); gl_FragColor = vec4(vec3(0.75, 0.62, 0.42) * a, a * 0.8); }`,
  }));
  rule.position.set(0, frameH * 0.005, -D); scene.add(rule);

  // SEA-ALL as tiles
  const TW = 1536, TH = 256;
  const sub = textCanvas((g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 176px Silkscreen';
    if ('letterSpacing' in g) g.letterSpacing = '40px';
    g.fillStyle = '#9ff6ff'; g.fillText('SEA-ALL', w / 2 + 20, h / 2 + 8);
  }, TW, TH);
  const cellPx = 16, cols = TW / cellPx, rows = TH / cellPx;
  const data = sub.canvas.getContext('2d').getImageData(0, 0, TW, TH).data;
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let a = 0;
    for (let y = 0; y < cellPx; y += 4) for (let x = 0; x < cellPx; x += 4) a += data[((j * cellPx + y) * TW + i * cellPx + x) * 4 + 3];
    if (a > 0) cells.push(i, j, hash(i * 131 + j * 7), hash(i * 17 + j * 911));
  }
  const n = cells.length / 4;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('cell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 4)); g.instanceCount = n;
  const subW = frameW * 0.5, cellW = subW / cols;
  const tileU = { map: { value: sub.tex }, grid: { value: new THREE.Vector2(cols, rows) }, cellW: { value: cellW }, asmb: { value: 0 }, dis: { value: 0 }, time: { value: 0 }, opacity: { value: 1 } };
  const tiles = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: tileU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${NOISE} attribute vec4 cell; uniform vec2 grid; uniform float cellW, asmb, dis, time; varying vec2 vUv; varying float vA; varying float vF;
      void main(){
        vec2 home = (vec2(cell.x + 0.5, grid.y - cell.y - 0.5) - grid * 0.5) * cellW;
        float d = clamp(asmb * 1.7 - cell.z * 0.7, 0.0, 1.0); d = 1.0 - pow(1.0 - d, 3.0);
        vec3 from = vec3((cell.z - 0.5) * 9.0, (cell.w - 0.5) * 5.0, 2.0 + cell.w * 5.0);
        vec3 p = mix(from, vec3(home, 0.0), d);
        float k = clamp(dis * 1.6 - cell.w * 0.6, 0.0, 1.0);
        p += vec3((cell.z - 0.5) * 0.8 * k, k * k * 2.6 + k * 0.4, 0.0) + vec3(sin(time * 3.0 + cell.z * 20.0), 0.0, 0.0) * 0.08 * k;
        float sc = cellW * mix(0.92, 0.35, k) * (0.4 + 0.6 * d);
        float ang = (1.0 - d) * (cell.w * 6.0 - 3.0) + k * cell.z * 4.0;
        vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * position.xy * sc;
        vUv = (vec2(cell.x, grid.y - cell.y - 1.0) + uv) / grid;
        vA = smoothstep(0.0, 0.3, d) * (1.0 - smoothstep(0.7, 1.0, k));
        vF = k;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p + vec3(q, 0.0), 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity, time; varying vec2 vUv; varying float vA; varying float vF;
      void main(){ vec4 c = texture2D(map, vUv);
        vec3 col = mix(c.rgb * 1.5, vec3(1.0), vF);
        float a = mix(c.a, 1.0, vF * 0.8) * vA * opacity;
        gl_FragColor = vec4(col * a, 1.0); }`,
  }));
  tiles.position.set(0, -frameH * 0.1, -D); tiles.frustumCulled = false;
  scene.add(tiles);
  const flecks = makeFlecks(1200, { min: [-8, -5, -16], size: [16, 10, 12] }, { fall: 0.6, wind: 0.2, size: 0.02, streak: 3, squareFrac: 0.7, nearFade: 1.0, seed: 77, bright: 0.6 });
  scene.add(flecks);

  return {
    frame(tau, t) {
      camera.position.set(0, 0, -tau * 0.12); camera.lookAt(0, 0, -D); camera.fov = 30; camera.updateProjectionMatrix();
      titleU.opacity.value = smoothstep(0.05, 0.5, tau) * (1 - smoothstep(1.95, 2.2, tau));
      titleU.glint.value = lerp(-0.2, 1.25, smoothstep(0.35, 1.6, tau));
      ruleU.k.value = smoothstep(0.3, 1.0, tau) * (1 - smoothstep(1.9, 2.15, tau));
      tileU.asmb.value = smoothstep(0.45, 1.25, tau); tileU.dis.value = smoothstep(1.55, 2.2, tau); tileU.time.value = t;
      flecks.u.time.value = t; flecks.u.opacity.value = smoothstep(0.0, 0.6, tau) * 0.6;
      return {
        scene, camera, mode: 'plain', clear: 0x000000,
        lens: { aperture: 0, bloomAmt: 0.55, bloomThreshold: 0.55, streakAmt: 0.25, ghostAmt: 0.0, ca: 0.006, vignette: 0.6, grain: 0.05, letterbox: 1,
          sat: 1, contrast: 1.0, exposure: 1.0, halation: 0.1, fade: smoothstep(0.0, 0.08, tau) },
      };
    },
  };
}
