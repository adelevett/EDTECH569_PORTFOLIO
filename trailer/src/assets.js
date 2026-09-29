import * as THREE from 'three';
// Assets load from window.__PACK__ (base64 data URIs registered by assets/pack/*.js, so the page
// runs from file:// with no server) or, if a pack entry is missing, from assets/img/ over http.
const PACK = () => (window.__PACK__ || {});
const loader = new THREE.TextureLoader();

function src(name, ext) {
  const p = PACK()[name];
  if (p) return p;
  return `assets/img/${name}.${ext}`;
}

export function loadTexture(name, ext, opts = {}) {
  return new Promise((resolve, reject) => {
    loader.load(src(name, ext), tex => {
      tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.flipY = opts.flipY !== undefined ? opts.flipY : true;
      if (opts.nearest) {
        tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      } else {
        tex.minFilter = opts.noMips ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = !opts.noMips;
        tex.anisotropy = opts.aniso || 4;
      }
      if (opts.wrap) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
      tex.needsUpdate = true;
      resolve(tex);
    }, undefined, e => reject(new Error('texture ' + name + ': ' + e)));
  });
}

export async function loadBinary(name) {
  const p = PACK()[name];
  if (p) {
    const b64 = p.split(',')[1];
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  const r = await fetch(`assets/img/${name}`);
  return r.arrayBuffer();
}

export async function loadMeta() {
  const p = PACK()['meta.json'];
  if (p) return JSON.parse(atob(p.split(',')[1]));
  const r = await fetch('assets/img/meta.json');
  return r.json();
}
