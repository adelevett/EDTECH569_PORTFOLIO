// Deterministic math helpers shared by every shot. No Math.random anywhere in the trailer.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smoothstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const ease = {
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inExpo: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  inOutQuint: t => t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

// integer hash -> [0,1)
export function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (a, b) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
export function rng(seed) { let s = seed | 0; return () => hash(s++); }

// smooth 1D value noise in [-1,1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed) * 2 - 1, hash2(i + 1, seed) * 2 - 1, u);
}
export function fbm1(x, seed = 0, oct = 3) {
  let a = 0, amp = 0.5, fr = 1, n = 0;
  for (let o = 0; o < oct; o++) { a += noise1(x * fr, seed + o * 17) * amp; n += amp; amp *= 0.5; fr *= 2.03; }
  return a / n;
}

// Keyframed tracks: keys = [{t, v}] where v is number or array. Cubic Hermite with
// Catmull-Rom tangents on non-uniform time; flat tangents at the ends (ease in/out).
export function track(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const h = k2.t - k1.t, s = (t - k1.t) / h;
  const e = k1.ease ? k1.ease(s) : s;
  const s2 = e * e, s3 = s2 * e;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + e, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const tan = (a, b, c, ta, tc, first, last) => {
    if (first || last) return 0;
    return (c - a) / (tc - ta) * h;
  };
  const f = (a, b, c, d) => {
    const m1 = tan(a, b, c, k0.t, k2.t, i === 0, false) * (k1.flat ? 0 : 1);
    const m2 = tan(b, c, d, k1.t, k3.t, false, i + 1 === n - 1) * (k2.flat ? 0 : 1);
    return h00 * b + h10 * m1 + h01 * c + h11 * m2;
  };
  if (Array.isArray(k1.v)) return k1.v.map((_, j) => f(k0.v[j], k1.v[j], k2.v[j], k3.v[j]));
  return f(k0.v, k1.v, k2.v, k3.v);
}

export function segs(t, list) {
  // list: [[t0,t1],...] -> index of active segment or -1
  for (let i = 0; i < list.length; i++) if (t >= list[i][0] && t < list[i][1]) return i;
  return -1;
}
