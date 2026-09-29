import * as THREE from 'three';
import { Pass, rt } from './fx.js';
import { NOISE, COMMON } from './glsl.js';

// Lens + grade pipeline. Input: HDR colour with linear view distance in alpha.
export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const h2 = [W >> 1, H >> 1];
    this.accum = rt(W, H, { type: THREE.FloatType });
    this.dofSrc = rt(W, H);
    this.half = rt(...h2); this.halfBlur = rt(...h2);
    this.dofOut = rt(W, H);
    this.bright = rt(...h2);
    this.mips = []; let w = h2[0], h = h2[1];
    for (let i = 0; i < 6; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); this.mips.push(rt(w, h)); }
    this.ups = this.mips.map(m => rt(m.width, m.height));
    this.streakA = rt(W >> 2, H >> 3); this.streakB = rt(W >> 2, H >> 3);

    this.accPass = new Pass(`uniform sampler2D src; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv) * w; }`,
      { src: { value: null }, w: { value: 1 } }, { blend: THREE.CustomBlending });
    this.copyPass = new Pass(`uniform sampler2D src; uniform float scale; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv) * scale; }`,
      { src: { value: null }, scale: { value: 1 } });

    // --- DOF: signed CoC in pixels, half-res gather, full-res recombine
    const cocFn = `float coc(float z){ return clamp(aperture * (1.0/max(focus,0.01) - 1.0/max(z,0.01)) * focus, -maxCoc, maxCoc); }`;
    this.dofDown = new Pass(`uniform sampler2D src; uniform float focus, aperture, maxCoc; uniform vec2 texel; varying vec2 vUv; ${cocFn}
      void main(){ vec4 a = texture2D(src, vUv + texel*vec2(-0.5,-0.5)), b = texture2D(src, vUv + texel*vec2(0.5,-0.5)), c = texture2D(src, vUv + texel*vec2(-0.5,0.5)), d = texture2D(src, vUv + texel*vec2(0.5,0.5));
        float z = min(min(a.a,b.a),min(c.a,d.a));
        vec3 col = (a.rgb+b.rgb+c.rgb+d.rgb)*0.25;
        gl_FragColor = vec4(col, coc(z)); }`,
      { src: { value: null }, focus: { value: 10 }, aperture: { value: 0 }, maxCoc: { value: 24 }, texel: { value: new THREE.Vector2() } });
    this.dofBlur = new Pass(`${NOISE} uniform sampler2D src; uniform vec2 texel; uniform float maxCoc; uniform float seedT; varying vec2 vUv;
      void main(){
        vec4 c0 = texture2D(src, vUv); float r0 = abs(c0.a) * 0.5;
        vec3 acc = c0.rgb; float wsum = 1.0;
        float ga = 2.39996323; float rot = hash12(gl_FragCoord.xy + seedT) * 6.2831;
        float R = maxCoc * 0.5;
        for (int i = 1; i < 56; i++) {
          float fi = float(i);
          float rr = sqrt(fi / 56.0) * R;
          float ang = fi * ga + rot;
          vec2 o = vec2(cos(ang), sin(ang)) * rr;
          vec4 s = texture2D(src, vUv + o * texel);
          float rs = abs(s.a) * 0.5;
          // a sample contributes if its own blur disc reaches this pixel; background may not bleed over sharp foreground
          float reach = smoothstep(rr - 1.0, rr + 0.5, rs);
          float behind = (s.a > 0.0 && c0.a < s.a) ? smoothstep(rr - 1.0, rr + 0.5, r0) : 1.0;
          float w = reach * mix(1.0, behind, 0.85);
          float hl = 1.0 + 1.5 * smoothstep(1.2, 4.0, dot(s.rgb, vec3(0.3,0.5,0.2)));   // bokeh highlights
          acc += s.rgb * w * hl; wsum += w * hl;
        }
        gl_FragColor = vec4(acc / wsum, c0.a);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() }, maxCoc: { value: 24 }, seedT: { value: 0 } });
    this.dofMix = new Pass(`uniform sampler2D sharp; uniform sampler2D blurred; uniform float focus, aperture, maxCoc; varying vec2 vUv; ${cocFn}
      void main(){ vec4 s = texture2D(sharp, vUv); vec4 b = texture2D(blurred, vUv);
        float c = max(abs(coc(s.a)), abs(b.a) * 0.9);
        float k = smoothstep(0.6, 2.5, c);
        gl_FragColor = vec4(mix(s.rgb, b.rgb, k), s.a); }`,
      { sharp: { value: null }, blurred: { value: null }, focus: { value: 10 }, aperture: { value: 0 }, maxCoc: { value: 24 } });

    // --- bloom
    this.brightPass = new Pass(`${COMMON} uniform sampler2D src; uniform float threshold, knee; uniform vec2 texel; varying vec2 vUv;
      void main(){ vec3 c = vec3(0.0);
        c += texture2D(src, vUv + texel*vec2(-1.0,-1.0)).rgb; c += texture2D(src, vUv + texel*vec2(1.0,-1.0)).rgb;
        c += texture2D(src, vUv + texel*vec2(-1.0,1.0)).rgb; c += texture2D(src, vUv + texel*vec2(1.0,1.0)).rgb; c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-5);
        float w = max(soft, l - threshold) / max(l, 1e-5);
        gl_FragColor = vec4(c * w, 1.0); }`,
      { src: { value: null }, threshold: { value: 0.8 }, knee: { value: 0.4 }, texel: { value: new THREE.Vector2() } });
    this.down = new Pass(`uniform sampler2D src; uniform vec2 texel; varying vec2 vUv;
      void main(){ vec3 c = texture2D(src, vUv).rgb * 4.0;
        c += texture2D(src, vUv + texel*vec2(-1.0,-1.0)).rgb + texture2D(src, vUv + texel*vec2(1.0,-1.0)).rgb + texture2D(src, vUv + texel*vec2(-1.0,1.0)).rgb + texture2D(src, vUv + texel*vec2(1.0,1.0)).rgb;
        c += (texture2D(src, vUv + texel*vec2(-2.0,0.0)).rgb + texture2D(src, vUv + texel*vec2(2.0,0.0)).rgb + texture2D(src, vUv + texel*vec2(0.0,-2.0)).rgb + texture2D(src, vUv + texel*vec2(0.0,2.0)).rgb) * 0.5;
        gl_FragColor = vec4(c / 10.0, 1.0); }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = new Pass(`uniform sampler2D src; uniform sampler2D base; uniform vec2 texel; uniform float w; varying vec2 vUv;
      void main(){ vec3 c = vec3(0.0);
        c += texture2D(src, vUv + texel*vec2(-1.0,-1.0)).rgb; c += texture2D(src, vUv + texel*vec2(0.0,-1.0)).rgb*2.0; c += texture2D(src, vUv + texel*vec2(1.0,-1.0)).rgb;
        c += texture2D(src, vUv + texel*vec2(-1.0,0.0)).rgb*2.0; c += texture2D(src, vUv).rgb*4.0; c += texture2D(src, vUv + texel*vec2(1.0,0.0)).rgb*2.0;
        c += texture2D(src, vUv + texel*vec2(-1.0,1.0)).rgb; c += texture2D(src, vUv + texel*vec2(0.0,1.0)).rgb*2.0; c += texture2D(src, vUv + texel*vec2(1.0,1.0)).rgb;
        gl_FragColor = vec4(texture2D(base, vUv).rgb + c / 16.0 * w, 1.0); }`,
      { src: { value: null }, base: { value: null }, texel: { value: new THREE.Vector2() }, w: { value: 1 } });
    this.streak = new Pass(`uniform sampler2D src; uniform vec2 texel; uniform float spread; varying vec2 vUv;
      void main(){ vec3 c = vec3(0.0); float ws = 0.0;
        for (int i = -12; i <= 12; i++){ float fi = float(i); float w = exp(-fi*fi/60.0); c += texture2D(src, vUv + vec2(fi*spread*texel.x, 0.0)).rgb * w; ws += w; }
        gl_FragColor = vec4(c/ws, 1.0); }`, { src: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: 1 } });

    // --- final composite: CA, flare ghosts, grade, tonemap, grain, vignette, letterbox, fades, graphite mode
    this.final = new Pass(`${NOISE} ${COMMON}
      uniform sampler2D src; uniform sampler2D bloom; uniform sampler2D streak; uniform sampler2D bright;
      uniform float time, bloomAmt, streakAmt, ghostAmt, ca, vignette, grain, exposure, fade, flash, letterbox, sat, contrast, halation;
      uniform vec3 lift, gain, flashColor; uniform float graphite, paperAmt, invert;
      uniform vec2 res;
      varying vec2 vUv;
      vec3 tonemap(vec3 x){ // gentle filmic shoulder that leaves painted mid-tones alone
        vec3 a = x; vec3 k = vec3(0.72);
        vec3 over = max(a - k, 0.0);
        return min(a, k) + over / (1.0 + over / (1.0 - k) ) ;
      }
      void main(){
        vec2 uv = vUv;
        vec2 d = uv - 0.5;
        float r2 = dot(d, d);
        vec3 col;
        if (ca > 0.0) {
          vec2 o = d * r2 * ca;
          col.r = texture2D(src, uv - o).r; col.g = texture2D(src, uv).g; col.b = texture2D(src, uv + o).b;
        } else col = texture2D(src, uv).rgb;
        vec3 bl = texture2D(bloom, uv).rgb;
        col += bl * bloomAmt;
        col += bl * vec3(1.0, 0.35, 0.2) * halation;
        col += texture2D(streak, uv).rgb * vec3(0.55, 0.8, 1.25) * streakAmt;
        if (ghostAmt > 0.0) {
          vec2 gv = (vec2(0.5) - uv);
          vec3 gh = vec3(0.0);
          for (int i = 1; i < 4; i++) { vec2 p = uv + gv * (float(i) * 0.55); gh += texture2D(bright, p).rgb * (0.6 / float(i)) * vec3(0.6 + 0.2*float(i), 0.8, 1.0); }
          vec2 hp = uv + normalize(gv + 1e-5) * 0.28; gh += texture2D(bright, hp).rgb * vec3(0.8, 0.5, 1.0) * 0.6 * smoothstep(0.1, 0.4, length(gv));
          col += gh * ghostAmt;
        }
        col *= exposure;
        col = tonemap(col);
        // grade (lift/gain in linear light), saturation, contrast around mid-grey
        col = col * gain + lift * (1.0 - col);
        float l = luma(col);
        col = mix(vec3(l), col, sat);
        col = (col - 0.18) * contrast + 0.18;
        if (graphite > 0.0) {
          float g = luma(col);
          vec3 gc = vec3(g) * vec3(1.02, 1.0, 0.95);
          col = mix(col, gc, graphite);
        }
        col = max(col, 0.0);
        vec3 s = linearToSrgb(col);
        if (paperAmt > 0.0) {
          float fib = vnoise(uv * res * vec2(0.9, 0.12)) * 0.5 + vnoise(uv * res * 0.35) * 0.5;
          float tooth = hash12(floor(uv * res * 0.5));
          s *= 1.0 - paperAmt * (0.07 * fib + 0.05 * tooth);
          s += paperAmt * 0.035 * vec3(1.0, 0.98, 0.93) * (1.0 - s);
        }
        s = mix(s, 1.0 - s, invert);
        float vig = 1.0 - vignette * smoothstep(0.15, 0.85, r2 * 2.2);
        s *= vig;
        float gr = hash12(gl_FragCoord.xy + fract(time * 13.7) * 1000.0) - 0.5;
        float gr2 = hash12(floor(gl_FragCoord.xy * 0.5) + fract(time * 7.1) * 777.0) - 0.5;
        s += (gr * 0.6 + gr2 * 0.4) * grain * (0.35 + 0.65 * (1.0 - luma(s)));
        s = mix(s, flashColor, flash);
        s *= fade;
        float lb = letterbox * 0.5 * (1.0 - (res.x / res.y) / 2.39);
        if (uv.y < lb || uv.y > 1.0 - lb) s = vec3(0.0);
        gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
      }`, {
      src: { value: null }, bloom: { value: null }, streak: { value: null }, bright: { value: null },
      time: { value: 0 }, bloomAmt: { value: 0.35 }, streakAmt: { value: 0.0 }, ghostAmt: { value: 0.0 }, ca: { value: 0.012 },
      vignette: { value: 0.45 }, grain: { value: 0.035 }, exposure: { value: 1 }, fade: { value: 1 }, flash: { value: 0 },
      flashColor: { value: new THREE.Color(1, 1, 1) }, letterbox: { value: 1 }, sat: { value: 1 }, contrast: { value: 1 },
      lift: { value: new THREE.Vector3(0, 0, 0) }, gain: { value: new THREE.Vector3(1, 1, 1) }, halation: { value: 0.0 },
      graphite: { value: 0 }, paperAmt: { value: 0 }, invert: { value: 0 }, res: { value: new THREE.Vector2(W, H) },
    });
  }

  beginAccum() { this.r.setRenderTarget(this.accum); this.r.setClearColor(0x000000, 0); this.r.clear(true, false, false); }
  addAccum(tex, w) { this.accPass.u.src.value = tex; this.accPass.u.w.value = w; this.accPass.render(this.r, this.accum, false); }

  // L: lens params {focus, aperture, maxCoc, bloomThreshold, bloomAmt, streakAmt, ghostAmt, ...final uniforms}
  run(srcTex, L, target = null) {
    const r = this.r, W = this.W, H = this.H;
    let cur = srcTex;
    if (L.aperture > 0.0) {
      const dd = this.dofDown.u; dd.src.value = cur; dd.focus.value = L.focus; dd.aperture.value = L.aperture; dd.maxCoc.value = L.maxCoc || 24;
      dd.texel.value.set(1 / W, 1 / H); this.dofDown.render(r, this.half);
      const db = this.dofBlur.u; db.src.value = this.half.texture; db.texel.value.set(2 / W, 2 / H); db.maxCoc.value = L.maxCoc || 24; db.seedT.value = (L.time || 0) * 17.0;
      this.dofBlur.render(r, this.halfBlur);
      const dm = this.dofMix.u; dm.sharp.value = cur; dm.blurred.value = this.halfBlur.texture; dm.focus.value = L.focus; dm.aperture.value = L.aperture; dm.maxCoc.value = L.maxCoc || 24;
      this.dofMix.render(r, this.dofOut); cur = this.dofOut.texture;
    }
    // bloom chain
    const bp = this.brightPass.u; bp.src.value = cur; bp.threshold.value = L.bloomThreshold !== undefined ? L.bloomThreshold : 0.85; bp.knee.value = 0.45; bp.texel.value.set(1 / W, 1 / H);
    this.brightPass.render(r, this.bright);
    let prev = this.bright;
    for (const m of this.mips) { this.down.u.src.value = prev.texture; this.down.u.texel.value.set(1 / prev.width, 1 / prev.height); this.down.render(r, m); prev = m; }
    let upPrev = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      this.up.u.src.value = upPrev.texture; this.up.u.base.value = this.mips[i].texture; this.up.u.texel.value.set(1 / upPrev.width, 1 / upPrev.height); this.up.u.w.value = 1.0;
      this.up.render(r, this.ups[i]); upPrev = this.ups[i];
    }
    if (L.streakAmt > 0) {
      this.copyPass.u.src.value = this.bright.texture; this.copyPass.u.scale.value = 1; this.copyPass.render(r, this.streakA);
      let a = this.streakA, b = this.streakB;
      for (let i = 0; i < 4; i++) { this.streak.u.src.value = a.texture; this.streak.u.texel.value.set(1 / a.width, 1 / a.height); this.streak.u.spread.value = 1 + i * 2.5; this.streak.render(r, b); [a, b] = [b, a]; }
      this.final.u.streak.value = a.texture;
    } else this.final.u.streak.value = this.streakA.texture;
    const f = this.final.u;
    f.src.value = cur; f.bloom.value = upPrev.texture; f.bright.value = this.bright.texture;
    const set = (k, def) => { const v = L[k] !== undefined ? L[k] : def; if (f[k].value && f[k].value.isVector3) f[k].value.set(...v); else if (f[k].value && f[k].value.isColor) f[k].value.setRGB(...v); else f[k].value = v; };
    set('time', 0); set('bloomAmt', 0.35); set('streakAmt', 0); set('ghostAmt', 0); set('ca', 0.012); set('vignette', 0.45); set('grain', 0.035);
    set('exposure', 1); set('fade', 1); set('flash', 0); set('flashColor', [1, 1, 1]); set('letterbox', 1); set('sat', 1); set('contrast', 1);
    set('lift', [0, 0, 0]); set('gain', [1, 1, 1]); set('halation', 0); set('graphite', 0); set('paperAmt', 0); set('invert', 0);
    this.final.render(r, target);
  }
}
