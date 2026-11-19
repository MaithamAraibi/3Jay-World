import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene, GLOBAL, R, clamp, noise2, _v1, _v2, _q1, _m1, _c1, genStone, genWood, genRoof } from './core';
import { heightAt, clearFxMap } from './world';

/* =====================================================================
   7. MODULAR DESTRUCTIBLE PIECES — rendering
   ===================================================================== */
export const K_STONE = 0, K_WOOD = 1, K_ROOF = 2, K_ROCK = 3, K_CLOTH = 4;
export const stoneTex = genStone(), woodTex = genWood(), roofTex = genRoof();
export function pieceMaterial(params, texScale, randomOffset = true) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTexScale = { value: texScale };
    sh.vertexShader = `uniform float uTexScale; attribute vec2 aFx; varying vec2 vPFx;\n` + sh.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        {
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 lp = position * sc; vec3 an = abs(normal);
          vec2 puv = an.x > max(an.y, an.z) ? lp.zy : (an.y > an.z ? lp.xz : lp.xy);
          float hsh = fract(sin(float(gl_InstanceID) * 12.9898 + 4.1) * 43758.5453);
          puv = puv * uTexScale + ${randomOffset ? 'vec2(hsh * 7.31, fract(hsh * 91.7) * 3.17)' : 'vec2(0.0)'};
          #ifdef USE_MAP
            vMapUv = puv;
          #endif
          #ifdef USE_BUMPMAP
            vBumpMapUv = puv;
          #endif
        }`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n vPFx = aFx;');
    sh.fragmentShader = 'varying vec2 vPFx;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78,0.9,1.0), clamp(vPFx.x,0.0,1.0)*0.85);
        diffuseColor.rgb *= 1.0 - clamp(vPFx.y,0.0,1.0)*0.55;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, clamp(vPFx.x,0.0,1.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ph = clamp(vPFx.y,0.0,1.0);
        totalEmissiveRadiance += vec3(1.0,0.3,0.05) * ph*ph*ph * 2.6;
        totalEmissiveRadiance += vec3(0.4,0.6,1.0) * clamp(vPFx.x,0.0,1.0) * 0.08;`);
  };
  return m;
}
export function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v1.fromBufferAttribute(p, i); const n = noise2(_v1.x * 5 + _v1.z * 3, _v1.y * 5 + 2);
    _v1.multiplyScalar(0.92 + n * 0.3); _v1.x = clamp(_v1.x, -.5, .5); _v1.y = clamp(_v1.y, -.5, .5); _v1.z = clamp(_v1.z, -.5, .5);
    p.setXYZ(i, _v1.x, _v1.y, _v1.z);
  }
  g.computeVertexNormals(); return g;
}
export interface Kind { cap: number; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; density: number; mu: number; fx?: THREE.InstancedBufferAttribute; mesh?: THREE.InstancedMesh; free?: number[]; high?: number; dirty?: boolean; fxDirty?: boolean }
export const KINDS: Kind[] = [
  { cap: 3400, geo: new RoundedBoxGeometry(1, 1, 1, 2, 0.07), mat: pieceMaterial({ map: stoneTex.col, bumpMap: stoneTex.bump, bumpScale: 3, roughness: 0.88 }, 0.42), density: 2.4, mu: 0.75 },
  { cap: 2000, geo: new RoundedBoxGeometry(1, 1, 1, 2, 0.05), mat: pieceMaterial({ map: woodTex.col, bumpMap: woodTex.bump, bumpScale: 2, roughness: 0.74 }, 0.55), density: 0.8, mu: 0.6 },
  { cap: 1200, geo: new RoundedBoxGeometry(1, 1, 1, 1, 0.06), mat: pieceMaterial({ map: roofTex.col, bumpMap: roofTex.bump, bumpScale: 2, roughness: 0.62 }, 1.25, false), density: 1.6, mu: 0.65 },
  { cap: 700, geo: rockGeometry(), mat: pieceMaterial({ map: stoneTex.col, bumpMap: stoneTex.bump, bumpScale: 4, roughness: 0.95, color: 0x8a7a68 }, 0.9), density: 2.2, mu: 0.8 },
  { cap: 40, geo: new THREE.BoxGeometry(1, 1, 1), mat: pieceMaterial({ color: 0xeee2c8, roughness: 0.9, side: THREE.DoubleSide }, 0.5), density: 0.3, mu: 0.6 },
];
export const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
for (const k of KINDS) {
  const m = new THREE.InstancedMesh(k.geo, k.mat, k.cap);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  k.fx = new THREE.InstancedBufferAttribute(new Float32Array(k.cap * 2), 2); k.fx.setUsage(THREE.DynamicDrawUsage);
  k.geo.setAttribute('aFx', k.fx);
  for (let i = 0; i < k.cap; i++) { m.setMatrixAt(i, ZERO_M); m.setColorAt(i, _c1.set(1, 1, 1)); }
  m.count = 0;
  k.mesh = m; k.free = []; k.high = 0; k.dirty = true; k.fxDirty = false;
  scene.add(m);
}
export function allocSlot(kind) {
  const k = KINDS[kind];
  if (k.free.length) return k.free.pop();
  if (k.high < k.cap) { k.high++; k.mesh.count = k.high; return k.high - 1; }
  return -1;
}
export function freeSlot(kind, slot) {
  const k = KINDS[kind]; k.mesh.setMatrixAt(slot, ZERO_M); k.dirty = true; k.free.push(slot);
  k.fx.setXY(slot, 0, 0); k.fxDirty = true;
}

/* =====================================================================
   8. CUSTOM RIGID BODY PHYSICS (OBB corner contacts, sleeping, support graph)
   ===================================================================== */
export const S_SLEEP = 0, S_ACTIVE = 1, S_DEAD = 3, S_KINE = 4;
export const GRAV = 13.5, MAX_ACTIVE = 380, HARD_ACTIVE = 560, SUBSTEPS = 3, PHYS_DT = 1 / 60;
export const CELL = 1.25;
export let pieces = [];           // all pieces ever (alive + dead pruned periodically)
export const activeList = [];
export let wakeQueue = [];
export let pieceId = 0;
export const PH = { contacts: 0, impacts: [] };

// physics heightfield (fast bilinear lookups)
export const HF_N = 801, HF_H = 100, HF_S = (2 * HF_H) / (HF_N - 1);
export const hfield = new Float32Array(HF_N * HF_N);
for (let j = 0; j < HF_N; j++) for (let i = 0; i < HF_N; i++) hfield[j * HF_N + i] = heightAt(-HF_H + i * HF_S, -HF_H + j * HF_S);
export function groundH(x, z) {
  const fx = (x + HF_H) / HF_S, fz = (z + HF_H) / HF_S;
  if (fx < 0 || fz < 0 || fx >= HF_N - 1 || fz >= HF_N - 1) return heightAt(x, z);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * HF_N + i;
  const a = hfield[o], b = hfield[o + 1], c = hfield[o + HF_N], d = hfield[o + HF_N + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class Piece {
  [key: string]: any;
  id: number; kind: number; slot: number; state: number;
  x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number;
  vx: number; vy: number; vz: number; wx: number; wy: number; wz: number;
  hx: number; hy: number; hz: number; mass: number; im: number; rad: number;
  supporters: Piece[]; dependents: Piece[]; ax: Float32Array; pts: Float32Array;
  constructor(kind, x, y, z, hx, hy, hz, q) {
    this.id = pieceId++; this.kind = kind; this.slot = allocSlot(kind);
    this.x = x; this.y = y; this.z = z; this.qx = q.x; this.qy = q.y; this.qz = q.z; this.qw = q.w;
    this.vx = this.vy = this.vz = 0; this.wx = this.wy = this.wz = 0;
    this.hx = hx; this.hy = hy; this.hz = hz;
    const kd = KINDS[kind];
    this.mass = 8 * hx * hy * hz * kd.density * 1000; this.im = 1 / this.mass;
    this.iix = 3 / (this.mass * (hy * hy + hz * hz)); this.iiy = 3 / (this.mass * (hx * hx + hz * hz)); this.iiz = 3 / (this.mass * (hx * hx + hy * hy));
    this.rad = Math.sqrt(hx * hx + hy * hy + hz * hz);
    this.mu = kd.mu;
    this.state = S_SLEEP; this.supporters = []; this.dependents = []; this.grounded = false;
    this.restT = 0; this.age = 0; this.temp = 0; this.fade = -1; this.wakeAt = -1; this.cells = null;
    this.ax = new Float32Array(9); this.pts = null; this.npts = 0;
    this.minx = this.miny = this.minz = this.maxx = this.maxy = this.maxz = 0;
    this.px = this.py = this.pz = 0; this.frost = 0; this.heat = 0; this.visit = 0; this.contact = false; this.impactCD = 0; this.crush = 0; this.scale = 1;
    const ext = [hx, hy, hz].sort((a, b) => a - b);
    this.long = ext[2] > ext[0] * 2.2; // long pieces get extra edge sample points
    this.updateFrame();
    this.writeMatrix();
  }
  updateFrame() {
    const { qx: x, qy: y, qz: z, qw: w } = this, a = this.ax;
    a[0] = 1 - 2 * (y * y + z * z); a[1] = 2 * (x * y + w * z); a[2] = 2 * (x * z - w * y);
    a[3] = 2 * (x * y - w * z); a[4] = 1 - 2 * (x * x + z * z); a[5] = 2 * (y * z + w * x);
    a[6] = 2 * (x * z + w * y); a[7] = 2 * (y * z - w * x); a[8] = 1 - 2 * (x * x + y * y);
    const hx = this.hx, hy = this.hy, hz = this.hz;
    const ex = Math.abs(a[0]) * hx + Math.abs(a[3]) * hy + Math.abs(a[6]) * hz;
    const ey = Math.abs(a[1]) * hx + Math.abs(a[4]) * hy + Math.abs(a[7]) * hz;
    const ez = Math.abs(a[2]) * hx + Math.abs(a[5]) * hy + Math.abs(a[8]) * hz;
    this.minx = this.x - ex; this.maxx = this.x + ex; this.miny = this.y - ey; this.maxy = this.y + ey; this.minz = this.z - ez; this.maxz = this.z + ez;
    this.ey = ey;
    // sample points: 8 corners (+4 mid-edge points along the long axis)
    if (!this.pts) this.pts = new Float32Array(12 * 3);
    let n = 0; const P = this.pts;
    for (let i = 0; i < 8; i++) {
      const sx = (i & 1) ? hx : -hx, sy = (i & 2) ? hy : -hy, sz = (i & 4) ? hz : -hz;
      P[n++] = this.x + a[0] * sx + a[3] * sy + a[6] * sz; P[n++] = this.y + a[1] * sx + a[4] * sy + a[7] * sz; P[n++] = this.z + a[2] * sx + a[5] * sy + a[8] * sz;
    }
    if (this.long) {
      // long axis index
      const L = hx >= hy && hx >= hz ? 0 : (hy >= hz ? 1 : 2);
      const o1 = (L + 1) % 3, o2 = (L + 2) % 3, hs = [hx, hy, hz];
      for (let i = 0; i < 4; i++) {
        const s1 = (i & 1) ? hs[o1] : -hs[o1], s2 = (i & 2) ? hs[o2] : -hs[o2];
        P[n++] = this.x + a[o1 * 3] * s1 + a[o2 * 3] * s2; P[n++] = this.y + a[o1 * 3 + 1] * s1 + a[o2 * 3 + 1] * s2; P[n++] = this.z + a[o1 * 3 + 2] * s1 + a[o2 * 3 + 2] * s2;
      }
    }
    this.npts = n / 3;
  }
  writeMatrix() {
    if (this.slot < 0) return;
    _q1.set(this.qx, this.qy, this.qz, this.qw);
    const s = this.scale;
    _m1.compose(_v1.set(this.x, this.y, this.z), _q1, _v2.set(this.hx * 2 * s, this.hy * 2 * s, this.hz * 2 * s));
    const k = KINDS[this.kind]; k.mesh.setMatrixAt(this.slot, _m1); k.dirty = true;
  }
  setColor(c) { if (this.slot >= 0) { const k = KINDS[this.kind]; k.mesh.setColorAt(this.slot, c); k.mesh.instanceColor.needsUpdate = true; } }
  writeFx() { if (this.slot >= 0) { const k = KINDS[this.kind]; k.fx.setXY(this.slot, this.frost, this.heat); k.fxDirty = true; } }
}

// ---------- spatial hash for sleeping (static) pieces
export const sgrid = new Map();
export const ckey = (ix, iy, iz) => ((ix + 1024) * 2048 + (iz + 1024)) * 128 + (iy + 32);
export function gridInsert(p) {
  const cells = [];
  const ix0 = Math.floor(p.minx / CELL), ix1 = Math.floor(p.maxx / CELL), iy0 = Math.floor(p.miny / CELL), iy1 = Math.floor(p.maxy / CELL), iz0 = Math.floor(p.minz / CELL), iz1 = Math.floor(p.maxz / CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
    const k = ckey(ix, iy, iz); let a = sgrid.get(k); if (!a) { a = []; sgrid.set(k, a); } a.push(p); cells.push(k);
  }
  p.cells = cells;
}
export function gridRemove(p) {
  if (!p.cells) return;
  for (const k of p.cells) { const a = sgrid.get(k); if (!a) continue; const i = a.indexOf(p); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } }
  p.cells = null;
}
export let visitStamp = 1;
export function queryStatic(minx, miny, minz, maxx, maxy, maxz, cb) {
  const st = ++visitStamp;
  const ix0 = Math.floor(minx / CELL), ix1 = Math.floor(maxx / CELL), iy0 = Math.floor(miny / CELL), iy1 = Math.floor(maxy / CELL), iz0 = Math.floor(minz / CELL), iz1 = Math.floor(maxz / CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
    const a = sgrid.get(ckey(ix, iy, iz)); if (!a) continue;
    for (let i = 0; i < a.length; i++) { const q = a[i]; if (q.visit === st) continue; q.visit = st; cb(q); }
  }
}
// ---------- dynamic grid (rebuilt per sub-step for active bodies)
export const dgrid = new Map();
export function buildDynGrid() {
  for (const a of dgrid.values()) a.length = 0;
  for (const p of activeList) {
    if (p.state !== S_ACTIVE) continue;
    const ix0 = Math.floor(p.minx / CELL), ix1 = Math.floor(p.maxx / CELL), iy0 = Math.floor(p.miny / CELL), iy1 = Math.floor(p.maxy / CELL), iz0 = Math.floor(p.minz / CELL), iz1 = Math.floor(p.maxz / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = ckey(ix, iy, iz); let a = dgrid.get(k); if (!a) { a = []; dgrid.set(k, a); } a.push(p);
    }
  }
  if (dgrid.size > 6000) dgrid.clear();
}

// ---------- support graph
export function computeSupport(p) {
  for (const s of p.supporters) { const i = s.dependents.indexOf(p); if (i >= 0) s.dependents.splice(i, 1); }
  p.supporters.length = 0;
  p.grounded = p.miny < groundH(p.x, p.z) + 0.16 || p.miny < groundH(p.minx, p.minz) + 0.16 || p.miny < groundH(p.maxx, p.maxz) + 0.16;
  const bottomBand = p.miny + Math.min(p.ey * 0.9, 0.35);
  queryStatic(p.minx + 0.02, p.miny - 0.12, p.minz + 0.02, p.maxx - 0.02, bottomBand, p.maxz - 0.02, (q) => {
    if (q === p || q.state !== S_SLEEP) return;
    if (q.maxy < p.miny - 0.12 || q.maxy > bottomBand + 0.05) return;
    if (q.y > p.y - 0.05) return;
    if (q.maxx < p.minx + 0.03 || q.minx > p.maxx - 0.03 || q.maxz < p.minz + 0.03 || q.minz > p.maxz - 0.03) return;
    p.supporters.push(q); q.dependents.push(p);
  });
  if (!p.supporters.length && !p.grounded) {
    // nothing directly beneath: lean on touching neighbours that sit lower
    queryStatic(p.minx - 0.3, p.miny - 0.3, p.minz - 0.3, p.maxx + 0.3, p.maxy + 0.1, p.maxz + 0.3, (q) => {
      if (q === p || q.state !== S_SLEEP || q.y >= p.y - 0.02 || q.miny > p.miny + 0.05) return;
      p.supporters.push(q); q.dependents.push(p);
    });
  }
}
// round-robin integrity sweep: anything asleep with no support falls
export let sweepIdx = 0;
export function supportSweep() {
  const n = pieces.length; if (!n) return;
  for (let k = 0; k < 250; k++) {
    sweepIdx = (sweepIdx + 1) % n; const p = pieces[sweepIdx];
    if (p.state !== S_SLEEP || p.grounded || p.supporters.length) continue;
    computeSupport(p);
    if (!p.supporters.length && !p.grounded) wake(p, true);
  }
}
export function releaseDependents(p) {
  const deps = p.dependents; p.dependents = [];
  for (const d of deps) {
    const i = d.supporters.indexOf(p); if (i >= 0) d.supporters.splice(i, 1);
    if (d.state === S_SLEEP && d.supporters.length === 0 && !d.grounded) {
      if (d.wakeAt < 0) d.wakeAt = GLOBAL.time.value + R(0.02, 0.09);
      pendingSupportWakes.push(d);
    } else if (d.state === S_KINE && d.supporters.length === 0) releaseKinematic(d);
  }
  for (const s of p.supporters) { const i = s.dependents.indexOf(p); if (i >= 0) s.dependents.splice(i, 1); }
  p.supporters.length = 0;
}
export const pendingSupportWakes = [];

export function wake(p, force = false) {
  if (p.state === S_ACTIVE || p.state === S_DEAD) return true;
  if (p.state === S_KINE) { releaseKinematic(p); return true; }
  if (activeList.length >= MAX_ACTIVE && !force) {
    if (!p.queued) { p.queued = true; wakeQueue.push(p); }
    return false;
  }
  if (activeList.length >= HARD_ACTIVE) { // hard ceiling: freeze the calmest active piece
    let best = null, be = 1e9;
    for (const a of activeList) { if (a.state !== S_ACTIVE) continue; const e = a.vx * a.vx + a.vy * a.vy + a.vz * a.vz + a.age * 0.02 * 0; if (e < be) { be = e; best = a; } }
    if (best && be < 4) sleepPiece(best); else { if (!p.queued) { p.queued = true; wakeQueue.push(p); } return false; }
  }
  p.queued = false; p.wakeAt = -1;
  gridRemove(p);
  p.state = S_ACTIVE; p.restT = 0; p.age = 0; p.px = p.py = p.pz = 0;
  activeList.push(p);
  releaseDependents(p);
  return true;
}
export function sleepPiece(p, force = true) {
  if (p.state !== S_ACTIVE) return false;
  p.state = S_SLEEP; p.updateFrame();
  computeSupport(p);
  if (!force && !p.supporters.length && !p.grounded) { p.state = S_ACTIVE; p.restT = 0; return false; }
  p.vx = p.vy = p.vz = p.wx = p.wy = p.wz = 0; p.restT = 0;
  p.writeMatrix(); gridInsert(p);
  return true;
}
export function killPiece(p) {
  if (p.state === S_DEAD) return;
  if (p.state === S_SLEEP) gridRemove(p);
  releaseDependents(p);
  p.state = S_DEAD;
  if (p.slot >= 0) { freeSlot(p.kind, p.slot); p.slot = -1; }
}
export function addPiece(kind, x, y, z, sx, sy, sz, q, color) {
  const p = new Piece(kind, x, y, z, sx / 2, sy / 2, sz / 2, q || _q1.identity());
  if (p.slot < 0) { p.state = S_DEAD; return null; }
  pieces.push(p);
  if (color) p.setColor(color);
  return p;
}
export function spawnDynamic(kind, x, y, z, sx, sy, sz, q, color, vx = 0, vy = 0, vz = 0) {
  const p = addPiece(kind, x, y, z, sx, sy, sz, q, color); if (!p) return null;
  p.vx = vx; p.vy = vy; p.vz = vz;
  if (!wake(p, true)) { killPiece(p); return null; }
  return p;
}
export function finalizeStatic(list) {
  for (const p of list) { p.updateFrame(); gridInsert(p); }
  for (const p of list) computeSupport(p);
}

// ---------- kinematic (windmill sails)
export const kinematics = [];
export function releaseKinematic(p) {
  if (p.state !== S_KINE) return;
  const i = kinematics.indexOf(p); if (i >= 0) kinematics.splice(i, 1);
  p.state = S_SLEEP; // then wake as active
  wake(p, true);
  if (p.kineVel) { p.vx = p.kineVel.x; p.vy = p.kineVel.y; p.vz = p.kineVel.z; p.wx = p.kineW.x; p.wy = p.kineW.y; p.wz = p.kineW.z; }
}

// ---------- impulse application helpers
export function applyImpulseAt(p, jx, jy, jz, rx, ry, rz) {
  p.vx += jx * p.im; p.vy += jy * p.im; p.vz += jz * p.im;
  // torque impulse r x j, then world inverse inertia
  const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
  const a = p.ax;
  const l0 = (a[0] * tx + a[1] * ty + a[2] * tz) * p.iix, l1 = (a[3] * tx + a[4] * ty + a[5] * tz) * p.iiy, l2 = (a[6] * tx + a[7] * ty + a[8] * tz) * p.iiz;
  p.wx += a[0] * l0 + a[3] * l1 + a[6] * l2; p.wy += a[1] * l0 + a[4] * l1 + a[7] * l2; p.wz += a[2] * l0 + a[5] * l1 + a[8] * l2;
}
// n · ((I^-1 (r×n)) × r)
export function angTerm(p, rx, ry, rz, nx, ny, nz) {
  const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
  const a = p.ax;
  const l0 = (a[0] * cx + a[1] * cy + a[2] * cz) * p.iix, l1 = (a[3] * cx + a[4] * cy + a[5] * cz) * p.iiy, l2 = (a[6] * cx + a[7] * cy + a[8] * cz) * p.iiz;
  const ix = a[0] * l0 + a[3] * l1 + a[6] * l2, iy = a[1] * l0 + a[4] * l1 + a[7] * l2, iz = a[2] * l0 + a[5] * l1 + a[8] * l2;
  const kx = iy * rz - iz * ry, ky = iz * rx - ix * rz, kz = ix * ry - iy * rx;
  return nx * kx + ny * ky + nz * kz;
}
// generic contact between A (dynamic) and B (dynamic, static or ground=null). n points from B to A.
export function resolveContact(A, B, px, py, pz, nx, ny, nz, depth, mu) {
  const dynB = B && B.state === S_ACTIVE;
  const rax = px - A.x, ray = py - A.y, raz = pz - A.z;
  let vx = A.vx + (A.wy * raz - A.wz * ray), vy = A.vy + (A.wz * rax - A.wx * raz), vz = A.vz + (A.wx * ray - A.wy * rax);
  let rbx = 0, rby = 0, rbz = 0;
  if (dynB) {
    rbx = px - B.x; rby = py - B.y; rbz = pz - B.z;
    vx -= B.vx + (B.wy * rbz - B.wz * rby); vy -= B.vy + (B.wz * rbx - B.wx * rbz); vz -= B.vz + (B.wx * rby - B.wy * rbx);
  }
  // positional correction (split by inverse mass)
  const slop = 0.005;
  if (depth > slop) {
    const c = (depth - slop) * 0.45;
    if (dynB) { const w = A.im / (A.im + B.im); A.px += nx * c * w; A.py += ny * c * w; A.pz += nz * c * w; B.px -= nx * c * (1 - w); B.py -= ny * c * (1 - w); B.pz -= nz * c * (1 - w); }
    else { A.px += nx * c; A.py += ny * c; A.pz += nz * c; }
  }
  const vn = vx * nx + vy * ny + vz * nz;
  if (vn >= 0) return 0;
  let k = A.im + angTerm(A, rax, ray, raz, nx, ny, nz);
  if (dynB) k += B.im + angTerm(B, rbx, rby, rbz, nx, ny, nz);
  const e = vn < -3.5 ? 0.18 : 0;
  const j = -(1 + e) * vn / k;
  applyImpulseAt(A, nx * j, ny * j, nz * j, rax, ray, raz);
  if (dynB) applyImpulseAt(B, -nx * j, -ny * j, -nz * j, rbx, rby, rbz);
  // friction
  let tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz;
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tl > 1e-5) {
    tx /= tl; ty /= tl; tz /= tl;
    let kt = A.im + angTerm(A, rax, ray, raz, tx, ty, tz);
    if (dynB) kt += B.im + angTerm(B, rbx, rby, rbz, tx, ty, tz);
    const jt = Math.min(tl / kt, mu * j);
    applyImpulseAt(A, -tx * jt, -ty * jt, -tz * jt, rax, ray, raz);
    if (dynB) applyImpulseAt(B, tx * jt, ty * jt, tz * jt, rbx, rby, rbz);
  }
  A.contact = true; if (dynB) B.contact = true;
  return j;
}
// test sample points of A against OBB of B; returns contacts applied
export function pointsInBox(A, B, flip) {
  // flip=false: A's points inside B; push A out along B's face normal
  // flip=true : B's points inside A; push B out (apply as contact on B?) -> handled by swapping roles
  const S = flip ? B : A, O = flip ? A : B;
  const P = S.pts, a = O.ax, hx = O.hx, hy = O.hy, hz = O.hz;
  let total = 0;
  for (let i = 0; i < S.npts; i++) {
    const dx = P[i * 3] - O.x, dy = P[i * 3 + 1] - O.y, dz = P[i * 3 + 2] - O.z;
    const lx = dx * a[0] + dy * a[1] + dz * a[2]; if (lx > hx || lx < -hx) continue;
    const ly = dx * a[3] + dy * a[4] + dz * a[5]; if (ly > hy || ly < -hy) continue;
    const lz = dx * a[6] + dy * a[7] + dz * a[8]; if (lz > hz || lz < -hz) continue;
    const px = hx - Math.abs(lx), py = hy - Math.abs(ly), pz = hz - Math.abs(lz);
    let nx, ny, nz, d;
    if (px < py && px < pz) { const s = lx > 0 ? 1 : -1; nx = a[0] * s; ny = a[1] * s; nz = a[2] * s; d = px; }
    else if (py < pz) { const s = ly > 0 ? 1 : -1; nx = a[3] * s; ny = a[4] * s; nz = a[5] * s; d = py; }
    else { const s = lz > 0 ? 1 : -1; nx = a[6] * s; ny = a[7] * s; nz = a[8] * s; d = pz; }
    // n points out of O toward S
    const mu = Math.min(S.mu, O.mu);
    let j;
    if (S.state === S_ACTIVE) j = resolveContact(S, O, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], nx, ny, nz, d, mu);
    else j = resolveContact(O, S, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], -nx, -ny, -nz, d, mu);
    total += j;
  }
  return total;
}
export function collidePair(A, B) {
  const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z, rr = A.rad + B.rad;
  if (dx * dx + dy * dy + dz * dz > rr * rr) return;
  if (A.maxx < B.minx || A.minx > B.maxx || A.maxy < B.miny || A.miny > B.maxy || A.maxz < B.minz || A.minz > B.maxz) return;
  let j = pointsInBox(A, B, false);
  if (B.state === S_ACTIVE || B.state === S_SLEEP) j += pointsInBox(A, B, true);
  PH.contacts++;
  if (B.state === S_SLEEP && j > B.mass * (B.dependents.length ? 3.2 : 1.6)) {
    wake(B); B.vx += A.vx * 0.15; B.vy += A.vy * 0.15; B.vz += A.vz * 0.15;
  }
  if (j * A.im > 2.2 && A.impactCD <= 0) { A.impactCD = 0.18; PH.impacts.push([A, j * A.im]); }
}

export const fields = []; // spell force fields: { apply(p, dt), alive }
export function physicsStep(dt) {
  // support-collapse wakes
  if (pendingSupportWakes.length) {
    const now = GLOBAL.time.value;
    for (let i = pendingSupportWakes.length - 1; i >= 0; i--) {
      const p = pendingSupportWakes[i];
      if (p.state !== S_SLEEP) { pendingSupportWakes.splice(i, 1); continue; }
      if (now >= p.wakeAt) { pendingSupportWakes.splice(i, 1); p.wakeAt = -1; wake(p, true); }
    }
  }
  // drain queued wakes
  while (wakeQueue.length && activeList.length < MAX_ACTIVE) {
    const p = wakeQueue.shift(); p.queued = false; if (p.state === S_SLEEP) wake(p);
  }
  for (const p of activeList) { p.contact = false; p.impactCD -= dt; }
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    // forces
    for (const p of activeList) {
      if (p.state !== S_ACTIVE) continue;
      p.vy -= GRAV * h;
      for (const f of fields) if (f.alive) f.apply(p, h);
      p.updateFrame(); p.px = 0; p.py = 0; p.pz = 0;
    }
    buildDynGrid();
    const st0 = ++visitStamp;
    for (const A of activeList) {
      if (A.state !== S_ACTIVE) continue;
      // ground
      const P = A.pts; let gpx = 0, gpy = 0, gpz = 0;
      for (let i = 0; i < A.npts; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const g = groundH(x, z);
        if (y < g) {
          const e = 0.3; const nx = groundH(x - e, z) - groundH(x + e, z), nz = groundH(x, z - e) - groundH(x, z + e), ny = 2 * e;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          const j = resolveContact(A, null, x, y, z, nx * il, ny * il, nz * il, (g - y) * ny * il, 0.78);
          if (j * A.im > 2.6 && A.impactCD <= 0) { A.impactCD = 0.2; PH.impacts.push([A, j * A.im]); }
        }
      }
      // static neighbours
      queryStatic(A.minx, A.miny, A.minz, A.maxx, A.maxy, A.maxz, (B) => { if (B.state === S_SLEEP) collidePair(A, B); });
      // dynamic neighbours
      const stA = ++visitStamp;
      const ix0 = Math.floor(A.minx / CELL), ix1 = Math.floor(A.maxx / CELL), iy0 = Math.floor(A.miny / CELL), iy1 = Math.floor(A.maxy / CELL), iz0 = Math.floor(A.minz / CELL), iz1 = Math.floor(A.maxz / CELL);
      for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
        const arr = dgrid.get(ckey(ix, iy, iz)); if (!arr) continue;
        for (const B of arr) { if (B.id <= A.id || B.visit === stA || B.state !== S_ACTIVE) continue; B.visit = stA; collidePair(A, B); }
      }
    }
    // integrate
    for (const p of activeList) {
      if (p.state !== S_ACTIVE) continue;
      const lin = p.contact ? 0.992 : 0.9985, ang = p.contact ? 0.965 : 0.996;
      p.vx *= lin; p.vy *= p.contact ? 0.996 : 0.9995; p.vz *= lin; p.wx *= ang; p.wy *= ang; p.wz *= ang;
      const sp = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz; if (sp > 1600) { const k = 40 / Math.sqrt(sp); p.vx *= k; p.vy *= k; p.vz *= k; }
      const wp = p.wx * p.wx + p.wy * p.wy + p.wz * p.wz; if (wp > 600) { const k = 24.5 / Math.sqrt(wp); p.wx *= k; p.wy *= k; p.wz *= k; }
      p.x += p.vx * h + p.px; p.y += p.vy * h + p.py; p.z += p.vz * h + p.pz;
      const hx = 0.5 * h * p.wx, hy = 0.5 * h * p.wy, hz = 0.5 * h * p.wz;
      const { qx, qy, qz, qw } = p;
      p.qx = qx + hx * qw + hy * qz - hz * qy; p.qy = qy + hy * qw + hz * qx - hx * qz; p.qz = qz + hz * qw + hx * qy - hy * qx; p.qw = qw - hx * qx - hy * qy - hz * qz;
      const ql = 1 / Math.sqrt(p.qx * p.qx + p.qy * p.qy + p.qz * p.qz + p.qw * p.qw); p.qx *= ql; p.qy *= ql; p.qz *= ql; p.qw *= ql;
    }
  }
  // sleeping, lifetime, matrices
  for (let i = activeList.length - 1; i >= 0; i--) {
    const p = activeList[i];
    if (p.state !== S_ACTIVE) { activeList[i] = activeList[activeList.length - 1]; activeList.pop(); continue; }
    p.age += dt;
    const v2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz, w2 = p.wx * p.wx + p.wy * p.wy + p.wz * p.wz;
    const calm = (v2 < 0.05 && w2 < 0.12) || (p.age > 14 && v2 < 0.4 && w2 < 0.6);
    if (calm && (p.contact || p.y < groundH(p.x, p.z) + p.rad)) p.restT += dt; else p.restT = Math.max(0, p.restT - dt * 0.5);
    if (p.y < groundH(p.x, p.z) - 4 || p.y < -60) { killPiece(p); activeList[i] = activeList[activeList.length - 1]; activeList.pop(); continue; }
    if (p.crush > 0) { // being crushed by the black hole
      p.scale = Math.max(0, 1 - p.crush); p.writeMatrix();
      if (p.scale <= 0.02) { killPiece(p); activeList[i] = activeList[activeList.length - 1]; activeList.pop(); continue; }
    }
    p.writeMatrix();
    const busy = wakeQueue.length > 0 || activeList.length > MAX_ACTIVE;
    if (busy && p.age > 1.5 && v2 < 0.6 && w2 < 1.5 && p.contact) p.restT += dt * 2;
    if (p.restT > 0.4 && fields.every(f => !f.alive || !f.holds || !f.holds(p))) {
      if (!sleepPiece(p, p.age > 25)) continue;
      activeList[i] = activeList[activeList.length - 1]; activeList.pop();
      if (p.temp > 0) p.fade = GLOBAL.time.value + p.temp;
    }
  }
}
// slowly sink & remove temporary debris after it settles
export const fadingCheck = { t: 0 };
export function updateDebrisFade(dt) {
  fadingCheck.t += dt; if (fadingCheck.t < 0.1) return;
  const step = fadingCheck.t; fadingCheck.t = 0;
  const now = GLOBAL.time.value;
  for (const p of pieces) {
    if (p.state !== S_SLEEP || p.fade < 0 || now < p.fade) continue;
    if (p.dependents.length) { p.fade = now + 3; continue; }
    p.scale -= step * 0.5;
    if (p.scale <= 0.05) killPiece(p); else p.writeMatrix();
  }
}
export function prunePieces() { if (pieces.length > 2600) pieces = pieces.filter(p => p.state !== S_DEAD); }

// fracture a piece into two halves along its longest axis
export function fracture(p, depth = 1) {
  if (p.state === S_DEAD || p.state === S_KINE) return [p];
  const hs = [p.hx, p.hy, p.hz]; const L = hs[0] >= hs[1] && hs[0] >= hs[2] ? 0 : (hs[1] >= hs[2] ? 1 : 2);
  if (hs[L] < 0.2 || p.kind === K_CLOTH) return [p];
  const a = p.ax; p.updateFrame();
  const ox = a[L * 3] * hs[L] * 0.5, oy = a[L * 3 + 1] * hs[L] * 0.5, oz = a[L * 3 + 2] * hs[L] * 0.5;
  const nh = hs.slice(); nh[L] *= 0.5;
  const jag = R(0.85, 1.0);
  _q1.set(p.qx, p.qy, p.qz, p.qw);
  const col = new THREE.Color(); if (p.slot >= 0) KINDS[p.kind].mesh.getColorAt(p.slot, col);
  const out = [];
  const vx = p.vx, vy = p.vy, vz = p.vz, wasHeat = p.heat, wasFrost = p.frost, temp = p.temp;
  killPiece(p);
  for (const s of [-1, 1]) {
    const c = spawnDynamic(p.kind, p.x + ox * s, p.y + oy * s, p.z + oz * s, nh[0] * 2 * (L === 0 ? jag : 1) * 0.98, nh[1] * 2 * (L === 1 ? jag : 1) * 0.98, nh[2] * 2 * (L === 2 ? jag : 1) * 0.98, _q1, col, vx, vy, vz);
    if (!c) continue;
    c.heat = wasHeat; c.frost = wasFrost; c.temp = temp; c.writeFx();
    c.vx += ox * s * 3; c.vy += oy * s * 3; c.vz += oz * s * 3;
    if (depth > 1) out.push(...fracture(c, depth - 1)); else out.push(c);
  }
  return out;
}
export function forEachPieceInSphere(x, y, z, r, cb) {
  const r2 = r * r;
  for (let i = 0, n = pieces.length; i < n; i++) {
    const p = pieces[i]; if (p.state === S_DEAD) continue;
    const dx = p.x - x, dy = p.y - y, dz = p.z - z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < (r + p.rad) * (r + p.rad)) cb(p, Math.sqrt(d2), dx, dy, dz);
  }
}
// ray vs all pieces (slab test in local frame)
export function rayPieces(o, d, maxT) {
  let best = maxT, hit = null, hn = new THREE.Vector3();
  for (const p of pieces) {
    if (p.state === S_DEAD) continue;
    const ox = p.x - o.x, oy = p.y - o.y, oz = p.z - o.z;
    const tc = ox * d.x + oy * d.y + oz * d.z; if (tc < -p.rad || tc - p.rad > best) continue;
    const d2 = ox * ox + oy * oy + oz * oz - tc * tc; if (d2 > p.rad * p.rad) continue;
    if (p.state !== S_SLEEP) p.updateFrame();
    const a = p.ax, hs = [p.hx, p.hy, p.hz];
    let tmin = -1e9, tmax = 1e9, axis = -1, sgn = 1;
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const ex = a[k * 3], ey = a[k * 3 + 1], ez = a[k * 3 + 2];
      const e = ex * ox + ey * oy + ez * oz, f = ex * d.x + ey * d.y + ez * d.z;
      if (Math.abs(f) > 1e-7) {
        let t1 = (e + hs[k]) / f, t2 = (e - hs[k]) / f, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = k; sgn = f > 0 ? -1 : 1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax || tmax < 0) { ok = false; break; }
      } else if (-e - hs[k] > 0 || -e + hs[k] < 0) { ok = false; break; }
    }
    if (!ok || tmin < 0 || tmin > best) continue;
    best = tmin; hit = p; hn.set(a[axis * 3] * sgn, a[axis * 3 + 1] * sgn, a[axis * 3 + 2] * sgn);
  }
  return hit ? { t: best, piece: hit, normal: hn } : null;
}
export function flushPieceBuffers() {
  for (const k of KINDS) {
    if (k.dirty) { k.mesh.instanceMatrix.needsUpdate = true; k.dirty = false; }
    if (k.fxDirty) { k.fx.needsUpdate = true; k.fxDirty = false; }
  }
}
// heat / frost decay on pieces
export const fxPieces = new Set<Piece>();
export function markFx(p) { fxPieces.add(p); p.writeFx(); }
export function updatePieceFx(dt) {
  for (const p of fxPieces) {
    if (p.state === S_DEAD) { fxPieces.delete(p); continue; }
    p.heat = Math.max(0, p.heat - dt * 0.22); p.frost = Math.max(0, p.frost - dt * 0.02);
    p.writeFx();
    if (p.heat <= 0 && p.frost <= 0) fxPieces.delete(p);
  }
}

export function clearWorld() {
  for (const p of pieces) if (p.state !== S_DEAD) { if (p.state === S_KINE) p.state = S_SLEEP; killPiece(p); }
  pieces = []; activeList.length = 0; wakeQueue = []; pendingSupportWakes.length = 0; kinematics.length = 0; sgrid.clear();
  for (const k of KINDS) { k.free = []; k.high = 0; k.mesh.count = 0; for (let i = 0; i < k.cap; i++) k.mesh.setMatrixAt(i, ZERO_M); k.dirty = true; k.fx.array.fill(0); k.fxDirty = true; }
  clearFxMap();
}
