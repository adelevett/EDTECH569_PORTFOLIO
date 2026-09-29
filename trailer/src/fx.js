import * as THREE from 'three';
// Minimal full-screen pass helpers.
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Pass {
  constructor(fragmentShader, uniforms = {}, opts = {}) {
    this.material = new THREE.ShaderMaterial({
      uniforms, vertexShader: FS_VERT, fragmentShader,
      depthTest: false, depthWrite: false, transparent: !!opts.blend,
      blending: opts.blend || THREE.NoBlending,
    });
    if (opts.blend === THREE.CustomBlending) {  // pure ONE/ONE sum (alpha carries depth, must not weight rgb)
      Object.assign(this.material, { blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    }
    this.mesh = new THREE.Mesh(tri, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.u = uniforms;
  }
  render(renderer, target, clear = true) {
    renderer.setRenderTarget(target || null);
    if (clear) renderer.clear(true, false, false);
    renderer.render(this.scene, fsCam);
  }
}

export function rt(w, h, o = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: o.type || THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: o.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    magFilter: o.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    depthBuffer: !!o.depth, stencilBuffer: false, generateMipmaps: false,
    colorSpace: THREE.NoColorSpace,
  });
  if (o.depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.FloatType; }
  t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
