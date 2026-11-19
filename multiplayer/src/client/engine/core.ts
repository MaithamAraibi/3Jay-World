import * as THREE from 'three';

/* =====================================================================
   0. CORE SETUP
   ===================================================================== */
export const canvas = document.getElementById('c') as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
export let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
export function getPixelRatio() { return pixelRatio; }
export function setPixelRatioValue(p: number) { pixelRatio = p; renderer.setPixelRatio(p); }
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.04, 5000);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const LOWSPEC = /lowspec/.test(location.search);
export const clock = new THREE.Clock();
export const GLOBAL = { time: { value: 0 } };
export const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

/* =====================================================================
   1. MATH / NOISE UTILITIES
   ===================================================================== */
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export let rand = mulberry32(20261118);
export function reseed(s: number) { rand = mulberry32(s); }
export const R = (a, b) => a + (b - a) * rand();
export const RI = (a, b) => Math.floor(R(a, b + 1));
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function hash2(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
// periodic (tileable) noise for textures
export function pnoise(x, y, p) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (k) => ((k % p) + p) % p;
  const a = hash2(m(i), m(j)), b = hash2(m(i + 1), m(j)), c = hash2(m(i), m(j + 1)), d = hash2(m(i + 1), m(j + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function pfbm(x, y, p, oct = 5) { let s = 0, a = 0.5, n = 0, f = 1; for (let o = 0; o < oct; o++) { s += a * pnoise(x * f, y * f, p * f); n += a; a *= 0.5; f *= 2; } return s / n; }

export const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _c1 = new THREE.Color(), _e1 = new THREE.Euler();
export const UP = new THREE.Vector3(0, 1, 0);

/* =====================================================================
   2. PROCEDURAL TEXTURES (canvas generated)
   ===================================================================== */
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = MAX_ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
export function pixelTex(size, fn, srgb = true) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4; const col = fn(x / size, y / size, x, y);
    d[o] = clamp(col[0], 0, 255); d[o + 1] = clamp(col[1], 0, 255); d[o + 2] = clamp(col[2], 0, 255); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c, srgb);
}
export function genStone() {
  const S = 256;
  const col = pixelTex(S, (u, v) => {
    const n = pfbm(u * 8, v * 8, 8, 5), n2 = pfbm(u * 32 + 5, v * 32 + 9, 32, 3), moss = smooth(0.58, 0.72, pfbm(u * 4 + 11, v * 4 + 3, 4, 4));
    let l = 0.55 + (n - 0.5) * 0.65 + (n2 - 0.5) * 0.25;
    const pit = n2 < 0.28 ? 0.7 : 1;
    let r = 150 * l * pit, g = 146 * l * pit, b = 136 * l * pit;
    r = lerp(r, 88 * l, moss * 0.75); g = lerp(g, 112 * l, moss * 0.75); b = lerp(b, 60 * l, moss * 0.75);
    return [r, g, b];
  });
  const bump = pixelTex(S, (u, v) => { const n = pfbm(u * 8, v * 8, 8, 5) * 0.6 + pfbm(u * 32 + 5, v * 32 + 9, 32, 3) * 0.4; const c = n * 255; return [c, c, c]; }, false);
  return { col, bump };
}
export function genWood() {
  const S = 256;
  const col = pixelTex(S, (u, v) => {
    const w = pfbm(u * 2, v * 16, 2, 4);
    const rings = Math.sin((v * 22 + w * 6) * Math.PI) * 0.5 + 0.5;
    const fine = pnoise(u * 4, v * 128, 4);
    let l = 0.62 + rings * 0.22 + (fine - 0.5) * 0.2 + (w - 0.5) * 0.3;
    const knot = Math.max(0, 1 - Math.hypot((u - 0.3) * 3.5, (v - 0.6) * 12)) * 0.5;
    l *= 1 - knot;
    return [150 * l, 102 * l, 62 * l];
  });
  const bump = pixelTex(S, (u, v) => { const w = pfbm(u * 2, v * 16, 2, 4); const r = Math.sin((v * 22 + w * 6) * Math.PI) * 0.5 + 0.5; const c = (r * 0.6 + pnoise(u * 4, v * 128, 4) * 0.4) * 255; return [c, c, c]; }, false);
  return { col, bump };
}
export function genRoof() {
  const S = 256;
  const col = pixelTex(S, (u, v) => {
    const n = pfbm(u * 6, v * 6, 6, 5), s = pnoise(u * 3, v * 40, 3);
    let l = 0.7 + (n - 0.5) * 0.5 + (s - 0.5) * 0.18;
    const edge = smooth(0.0, 0.12, v) * smooth(1.0, 0.85, v);
    l *= 0.72 + 0.28 * edge;
    return [176 * l, 58 * l, 40 * l];
  });
  const bump = pixelTex(S, (u, v) => { const c = (pfbm(u * 6, v * 6, 6, 5) * 0.5 + smooth(0, .12, v) * smooth(1, .85, v) * 0.5) * 255; return [c, c, c]; }, false);
  return { col, bump };
}
export function genBark() {
  const S = 256;
  const col = pixelTex(S, (u, v) => {
    const n = pfbm(u * 12, v * 2, 12, 5), d = pfbm(u * 24 + 3, v * 4, 24, 3);
    let l = 0.45 + (n - 0.5) * 0.9; if (d < 0.38) l *= 0.55;
    return [112 * l, 80 * l, 56 * l];
  });
  const bump = pixelTex(S, (u, v) => { const n = pfbm(u * 12, v * 2, 12, 5); const d = pfbm(u * 24 + 3, v * 4, 24, 3); const c = (n * 0.7 + (d < .38 ? 0 : .3)) * 255; return [c, c, c]; }, false);
  return { col, bump };
}
export function genGround() {
  const S = 512;
  return pixelTex(S, (u, v) => {
    const n = pfbm(u * 6, v * 6, 6, 5), n2 = pfbm(u * 40 + 2, v * 40 + 7, 40, 3);
    const dirt = smooth(0.62, 0.75, pfbm(u * 3 + 4, v * 3 + 1, 3, 4));
    let r = 92 + (n - .5) * 50 + (n2 - .5) * 40, g = 128 + (n - .5) * 60 + (n2 - .5) * 50, b = 48 + (n2 - .5) * 20;
    r = lerp(r, 120 + (n2 - .5) * 50, dirt * .6); g = lerp(g, 100 + (n2 - .5) * 40, dirt * .6); b = lerp(b, 66, dirt * .6);
    return [r, g, b];
  });
}
