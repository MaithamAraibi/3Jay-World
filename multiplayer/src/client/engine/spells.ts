import * as THREE from 'three';
import { SPELLS, TUNE, segDist } from '../../shared/protocol';
import { scene, camera, GLOBAL, MAX_ANISO, mulberry32, rand, R, RI, clamp, smooth, _v1, _v2, _v3, _v4, _q1, _m1, _c1, _e1, UP, makeCanvas } from './core';
import { stampFx, terrain, pushers, isBlocked, grass, FLOWER_COLS, sproutFlower, easeOutBack, treeColliders, buildTree } from './world';
import { K_STONE, K_ROCK, ZERO_M, S_SLEEP, S_ACTIVE, S_DEAD, S_KINE, GRAV, pieces, groundH, wake, spawnDynamic, fields, fracture, forEachPieceInSphere, rayPieces, markFx } from './pieces';
import { SH_GLOW, SH_FIRE, SH_SPARK, SH_SMOKE, SH_STAR, SH_PETAL, SH_DUST, FXA, FXS, C, flashLight, out, SFX } from './fx';

/* =====================================================================
   12. SPELL DEFINITIONS, ICONS & RUNE CIRCLES
   ===================================================================== */
export const fieldPositions = new Map<string, { x: number; z: number }>();

export function drawIcon(i) {
  const S = 116, c = makeCanvas(S, S), g = c.getContext('2d');
  const col = new THREE.Color(SPELLS[i].color);
  const css = (k = 1, a = 1) => `rgba(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0},${a})`;
  const bg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.7);
  bg.addColorStop(0, css(0.45)); bg.addColorStop(0.6, css(0.12)); bg.addColorStop(1, '#050403');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2); g.shadowColor = css(1.2); g.shadowBlur = 14; g.lineCap = 'round'; g.lineJoin = 'round';
  const grad = (a, b) => { const gr = g.createLinearGradient(0, 40, 0, -40); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  if (i === 0) {
    const flame = (s, c1, c2) => { g.beginPath(); g.moveTo(0, 34 * s); g.bezierCurveTo(-30 * s, 24 * s, -26 * s, -6 * s, -6 * s, -40 * s); g.bezierCurveTo(-4 * s, -18 * s, 8 * s, -16 * s, 6 * s, -30 * s); g.bezierCurveTo(26 * s, -8 * s, 30 * s, 22 * s, 0, 34 * s); g.fillStyle = grad(c1, c2); g.fill(); };
    flame(1, '#ff3300', '#ffae40'); flame(0.62, '#ff9a20', '#fff2b0'); flame(0.3, '#fff6d0', '#ffffff');
  } else if (i === 1) {
    for (let a = 0; a < 4; a++) { g.beginPath(); for (let t = 0; t < 1; t += 0.02) { const r = 6 + t * 40, an = a * Math.PI / 2 + t * 4.2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r * 0.8); } g.strokeStyle = css(1.3, 0.9); g.lineWidth = 5; g.stroke(); }
    g.beginPath(); g.arc(0, 0, 12, 0, 6.3); g.fillStyle = '#000'; g.shadowColor = '#e0a0ff'; g.shadowBlur = 18; g.fill(); g.strokeStyle = '#f0c8ff'; g.lineWidth = 2; g.stroke();
  } else if (i === 2) {
    for (let k = 0; k < 7; k++) { const y = -34 + k * 10, w = 36 - k * 4.6; g.beginPath(); g.ellipse(Math.sin(k * 0.9) * 4, y, w, 4.5, 0, 0, 6.3); g.strokeStyle = k < 3 ? '#ffd060' : '#ff6a1a'; g.lineWidth = 4; g.stroke(); }
  } else if (i === 3) {
    g.strokeStyle = '#e8fbff'; g.lineWidth = 4;
    for (let a = 0; a < 6; a++) { g.save(); g.rotate(a * Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -38); g.moveTo(0, -16); g.lineTo(-9, -25); g.moveTo(0, -16); g.lineTo(9, -25); g.moveTo(0, -27); g.lineTo(-7, -34); g.moveTo(0, -27); g.lineTo(7, -34); g.stroke(); g.restore(); }
  } else if (i === 4) {
    g.beginPath(); g.moveTo(8, -42); g.lineTo(-16, 2); g.lineTo(0, 2); g.lineTo(-10, 42); g.lineTo(20, -8); g.lineTo(3, -8); g.lineTo(16, -42); g.closePath();
    g.fillStyle = grad('#6fa0ff', '#ffffff'); g.fill();
  } else if (i === 5) {
    g.strokeStyle = '#e8fff8'; g.lineWidth = 5;
    for (let k = 0; k < 3; k++) { const y = -22 + k * 22, l = 30 - k * 6; g.beginPath(); g.moveTo(-36, y); g.lineTo(l, y); g.arc(l, y - 8, 8, Math.PI / 2, -Math.PI * 0.9, true); g.stroke(); }
  } else if (i === 7) {
    g.strokeStyle = '#ffe9a8'; g.lineWidth = 5; g.beginPath(); g.moveTo(-40, 30); g.lineTo(-14, 6); g.lineTo(-20, -4); g.lineTo(6, -18); g.lineTo(0, -26); g.lineTo(38, -40); g.stroke();
    g.fillStyle = '#000'; g.shadowColor = '#c080ff'; g.shadowBlur = 16; g.beginPath(); g.arc(18, 22, 13, 0, 6.3); g.fill();
    g.strokeStyle = '#d8b0ff'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(18, 22, 22, 7, -0.3, 0, 6.3); g.stroke();
    g.fillStyle = '#bfe8ff'; for (const [x, y] of [[-30, 22], [-8, -2], [14, -26]]) { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill(); }
  } else {
    g.strokeStyle = '#6a4a28'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 40); g.quadraticCurveTo(-4, 10, 2, -10); g.stroke();
    const leaf = (x, y, r, s) => { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, -14 * s, 9 * s, 16 * s, 0, 0, 6.3); g.fillStyle = grad('#2f8f2a', '#b8ff7a'); g.fill(); g.restore(); };
    leaf(2, -8, -0.9, 1); leaf(2, -8, 0.9, 1); leaf(2, -14, 0, 1.15);
    g.fillStyle = '#ff6fb0'; g.beginPath(); g.arc(-18, 26, 6, 0, 6.3); g.fill(); g.fillStyle = '#5f8cff'; g.beginPath(); g.arc(20, 28, 6, 0, 6.3); g.fill();
  }
  g.restore();
  return c;
}
export function runeTexture(i) {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), rr = mulberry32(777 + i * 31), r = (a, b) => a + (b - a) * rr();
  g.translate(S / 2, S / 2); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.lineCap = 'round';
  const ring = (rad, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); };
  ring(246, 5); ring(232, 2); ring(178, 4); ring(166, 1.5); ring(62, 3);
  // rune glyphs between rings
  const glyphs = 24 + i * 2;
  for (let k = 0; k < glyphs; k++) {
    g.save(); g.rotate(k / glyphs * Math.PI * 2); g.translate(0, -205); g.lineWidth = 3; g.beginPath();
    const strokes = 2 + Math.floor(r(0, 3));
    for (let s = 0; s < strokes; s++) { g.moveTo(r(-9, 9), r(-14, 14)); g.lineTo(r(-9, 9), r(-14, 14)); }
    if (rr() < 0.4) { g.moveTo(5, 0); g.arc(0, 0, 5, 0, Math.PI * 2); }
    g.stroke(); g.restore();
  }
  // star polygon
  const n = SPELLS[i].runeN, step = n > 4 ? 2 : 1;
  g.lineWidth = 4; g.beginPath();
  for (let k = 0; k <= n; k++) { const a = (k * step) / n * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * 166, Math.sin(a) * 166); }
  g.stroke();
  g.lineWidth = 2.5;
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * 166, Math.sin(a) * 166, 16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(Math.cos(a) * 112, Math.sin(a) * 112, 6, 0, Math.PI * 2); g.fill(); }
  // inner sigil
  g.lineWidth = 3; g.beginPath();
  for (let k = 0; k < 6; k++) { const a = rr() * Math.PI * 2, b = rr() * Math.PI * 2; g.moveTo(Math.cos(a) * 58, Math.sin(a) * 58); g.lineTo(Math.cos(b) * 58, Math.sin(b) * 58); }
  g.stroke(); ring(20, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; return t;
}
export const runeTex = SPELLS.map((s, i) => runeTexture(i));
export function runeMaterial(i) {
  return new THREE.MeshBasicMaterial({ map: runeTex[i], color: new THREE.Color(SPELLS[i].color).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
}
export const aimRune = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), runeMaterial(0));
aimRune.renderOrder = 8; scene.add(aimRune);
export const aimRune2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), runeMaterial(0)); aimRune2.renderOrder = 8; scene.add(aimRune2);
export const aim = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), valid: false, piece: null };

/* =====================================================================
   13. SPELL EFFECTS
   ===================================================================== */
export const effects = [];
export const groundFires = [];
let gfLight: any = null;
export const growTrees = [];
export const GR = { flash: new THREE.Color(0, 0, 0), shake: 0, bh: new THREE.Vector4(0, 0, 0, 0), ring: new THREE.Vector4(0, 0, 0, 0), ringW: null, bhW: null };
export function addShake(pos, amt) { const d = pos.distanceTo(camera.position); GR.shake = Math.min(2.2, GR.shake + amt / (1 + d * 0.06)); }
export function addFlash(pos, color, amt) { const d = pos.distanceTo(camera.position); _c1.set(color).multiplyScalar(Math.min(amt * 0.45, amt / (1 + d * 0.03))); GR.flash.r += _c1.r; GR.flash.g += _c1.g; GR.flash.b += _c1.b; }
export function randDir(out) { const u = rand() * 2 - 1, a = rand() * 6.283, s = Math.sqrt(1 - u * u); return out.set(Math.cos(a) * s, u, Math.sin(a) * s); }

// impact rune flash
export function runeBurst(pos, normal, spell, size, life = 1.3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), runeMaterial(spell));
  m.position.copy(pos).addScaledVector(normal, 0.06); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  m.renderOrder = 8; scene.add(m); let t = 0;
  effects.push({ update(dt) { t += dt; const k = t / life; m.scale.setScalar(size * (0.3 + 0.7 * (1 - Math.pow(1 - Math.min(1, k * 2.5), 3)))); m.rotateZ(dt * 0.8); m.material.opacity = 1.2 * (1 - k); if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; } return true; } });
}
// expanding shockwave ring
export const ringGeo = new THREE.RingGeometry(0.82, 1, 64, 1);
export function shockRing(pos, color, maxR, life, thick = 1) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.copy(pos); m.position.y += 0.25; m.rotation.x = -Math.PI / 2; scene.add(m); let t = 0;
  effects.push({ update(dt) { t += dt; const k = t / life; const e = 1 - Math.pow(1 - Math.min(1, k), 3); m.scale.set(maxR * e, maxR * e, maxR * e * thick); m.material.opacity = (1 - k) * 0.9; if (k >= 1) { scene.remove(m); m.material.dispose(); return false; } return true; } });
  GR.ringW = { pos: pos.clone(), r: 0, maxR, t: 0, life: life * 1.2 };
}
// temporary grass push / pull
export const pushSlots = pushers.map(() => ({ busy: false }));
export function grassPush(x, z, radiusFn, strengthFn, life) {
  const idx = pushSlots.findIndex(s => !s.busy); if (idx < 0) return null;
  pushSlots[idx].busy = true; let t = 0; const P = pushers[idx]; const h = { x, z, alive: true };
  effects.push({ update(dt) { t += dt; P.set(h.x, h.z, Math.max(0.1, radiusFn(t)), strengthFn(t)); if (t >= life || !h.alive) { P.w = 0; pushSlots[idx].busy = false; return false; } return true; } });
  return h;
}
export function pieceBlast(center, radius, power, up = 0.35, opts: any = {}) {
  const hits = [];
  forEachPieceInSphere(center.x, center.y, center.z, radius, (p, d) => hits.push([p, d]));
  for (const [p0, d] of hits) {
    if (p0.state === S_DEAD) continue;
    const f = Math.max(0, 1 - d / radius);
    let list = [p0];
    if (opts.fracture && d < radius * opts.fracture && p0.state !== S_KINE) list = fracture(p0, d < radius * opts.fracture * 0.5 ? 2 : 1);
    for (const p of list) {
      if (!p || p.state === S_DEAD) continue;
      if (!wake(p, true)) continue;
      let dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z; const l = Math.hypot(dx, dy, dz) + 0.001; dx /= l; dy /= l; dz /= l;
      if (opts.dir) { dx = dx * 0.6 + opts.dir.x * 0.8; dy = dy * 0.6 + opts.dir.y * 0.8; dz = dz * 0.6 + opts.dir.z * 0.8; }
      const mf = clamp(Math.pow(500 / p.mass, 0.12), 0.7, 1.5);
      const dv = (power * f * f + power * 0.25 * f) * mf * R(0.8, 1.2);
      p.vx += dx * dv; p.vy += (dy + up) * dv; p.vz += dz * dv;
      const sp = (opts.spin ?? 9) * f; p.wx += R(-sp, sp); p.wy += R(-sp, sp); p.wz += R(-sp, sp);
      if (opts.heat && f > 0.15) { p.heat = Math.min(1, Math.max(p.heat, f * 1.3)); markFx(p); }
      if (opts.frost) { p.frost = 1; markFx(p); }
    }
  }
}
export function earthDebris(pos, n, power, heat = 0) {
  for (let i = 0; i < n; i++) {
    const s = R(0.14, 0.42);
    const a = R(0, 6.28), sp = R(0.3, 1) * power;
    const p = spawnDynamic(K_ROCK, pos.x + R(-1, 1), groundH(pos.x, pos.z) + 0.3 + s, pos.z + R(-1, 1), s * R(0.8, 1.4), s, s * R(0.8, 1.3), _q1.setFromEuler(_e1.set(R(0, 6), R(0, 6), R(0, 6))), _c1.setHSL(0.08, R(0.1, 0.3), R(0.18, 0.32)),
      Math.cos(a) * sp * 0.55, sp * R(0.8, 1.3), Math.sin(a) * sp * 0.55);
    if (!p) break;
    p.wx = R(-12, 12); p.wy = R(-12, 12); p.wz = R(-12, 12); p.temp = R(8, 16);
    if (heat) { p.heat = heat * R(0.6, 1); markFx(p); }
  }
}
export function emitFire(x, y, z, scale = 1, extra = {}) {
  FXA.emit(Object.assign({ x, y, z, vx: R(-0.6, 0.6), vy: R(1.5, 3.5) * scale, vz: R(-0.6, 0.6), life: R(0.5, 1.0), s0: R(0.5, 0.9) * scale, s1: R(0.15, 0.4) * scale, c0: FIRE_HOT, c1: FIRE_COOL, a: 0.85, shape: SH_FIRE, grav: -2.5, drag: 0.8, turb: 2, spin: R(-2, 2), fin: 0.12 }, extra));
}
export const FIRE_HOT = C(0xff9a3a, 1.7), FIRE_COOL = C(0x8a1a03, 0.9), FIRE_WHITE = C(0xffd890, 3.2), SPARK_HOT = C(0xffd080, 9), SPARK_COOL = C(0xff4a10, 3);
export const SMOKE_DARK = C(0x2e2a26), SMOKE_LIGHT = C(0x8a8580);

// -------- 1. FIRE EXPLOSION
export function fireExplosion(pos, normal, big = 1) {
  const P = pos.clone().addScaledVector(normal, 0.4);
  SFX.explosion(P, big);
  addShake(P, 1.5 * big); addFlash(P, 0xffb070, 0.45 * big);
  flashLight(_v1.copy(P).add(_v2.set(0, 2.5, 0)), 0xff9040, 1500 * big, 1.4, 55, 0.4);
  runeBurst(pos, normal, 0, 14 * big, 1.1);
  shockRing(pos, 0xffa050, 16 * big, 0.55);
  // core fireball & flames
  for (let i = 0; i < 70 * big; i++) {
    randDir(_v1); const sp = R(3, 15) * big;
    FXA.emit({ x: P.x + _v1.x * 0.6, y: P.y + Math.abs(_v1.y) * 0.6, z: P.z + _v1.z * 0.6, vx: _v1.x * sp, vy: Math.abs(_v1.y) * sp * 0.9 + R(1, 4), vz: _v1.z * sp, life: R(0.6, 1.5), s0: R(1.6, 3.2) * big, s1: R(3, 6) * big, c0: i < 20 ? FIRE_WHITE : FIRE_HOT, c1: FIRE_COOL, a: 0.9, shape: SH_FIRE, drag: 3.2, grav: -3.5, turb: 3, spin: R(-1.5, 1.5), fin: 0.05 });
  }
  for (let i = 0; i < 6; i++) FXA.emit({ x: P.x, y: P.y + 0.8, z: P.z, life: R(0.18, 0.3), s0: 4 * big, s1: 14 * big, c0: FIRE_WHITE, c1: FIRE_HOT, a: 1, shape: SH_GLOW, fin: 0.02 });
  // sparks
  for (let i = 0; i < 220 * big; i++) {
    randDir(_v1); const sp = R(8, 34);
    FXA.emit({ x: P.x, y: P.y + 0.5, z: P.z, vx: _v1.x * sp, vy: Math.abs(_v1.y) * sp + R(2, 8), vz: _v1.z * sp, life: R(0.6, 2.4), s0: R(0.05, 0.11), s1: 0.03, c0: SPARK_HOT, c1: SPARK_COOL, a: 1, shape: SH_SPARK, drag: 0.6, grav: 11, stretch: 0.045, fin: 0.01 });
  }
  // dirt spray
  for (let i = 0; i < 70; i++) {
    randDir(_v1); const sp = R(4, 16);
    FXS.emit({ x: P.x, y: P.y, z: P.z, vx: _v1.x * sp * 0.6, vy: Math.abs(_v1.y) * sp + 3, vz: _v1.z * sp * 0.6, life: R(1, 2.2), s0: R(0.15, 0.5), s1: R(0.4, 0.9), c0: C(0x3a2c1e), c1: C(0x5a4a3a), a: 0.95, shape: SH_DUST, drag: 1, grav: 12, fin: 0.02 });
  }
  // ground dust ring
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * 6.283, sp = R(9, 16);
    FXS.emit({ x: P.x + Math.cos(a), y: groundH(P.x, P.z) + 0.4, z: P.z + Math.sin(a), vx: Math.cos(a) * sp, vy: R(0.3, 1.5), vz: Math.sin(a) * sp, life: R(1.5, 3), s0: 1.2, s1: 4.5, c0: C(0x8a7a62), c1: C(0xb0a690), a: 0.45, shape: SH_SMOKE, drag: 2.2, grav: -0.2, fin: 0.05 });
  }
  // smoke column (emitted over time)
  let t = 0;
  effects.push({
    update(dt) {
      t += dt; const k = 1 - t / 3.2;
      const cnt = Math.floor(R(3, 7) * k * big);
      for (let i = 0; i < cnt; i++) FXS.emit({ x: P.x + R(-2.5, 2.5), y: P.y + R(0.5, 2.5) + t * 1.5, z: P.z + R(-2.5, 2.5), vx: R(-1.2, 1.2), vy: R(1.5, 3.5), vz: R(-1.2, 1.2), life: R(4, 7.5), s0: R(1.4, 2.6) * big, s1: R(5, 9) * big, c0: SMOKE_DARK, c1: SMOKE_LIGHT, a: R(0.28, 0.5), shape: SH_SMOKE, drag: 0.6, grav: -0.5, turb: 1.2, spin: R(-0.3, 0.3), fin: 0.12 });
      return t < 3.2;
    }
  });
  // scorch + heat
  stampFx(pos.x, pos.z, 8.5 * big, 0, 1, { clear: [1, 2] });
  stampFx(pos.x, pos.z, 6.5 * big, 3, 1, { clear: [1] });
  // lingering ground fires
  for (let i = 0; i < 9 * big; i++) { const a = R(0, 6.28), d = R(0.5, 5.5) * big; addGroundFire(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d, R(4, 8), R(0.6, 1.2)); }
  earthDebris(pos, Math.round(16 * big), 15, 1);
  pieceBlast(P, 10 * big, 26 * big, 0.45, { fracture: 0.42, heat: true, spin: 10 });
  grassPush(pos.x, pos.z, (t) => 2 + t * 40, (t) => 1.6 * Math.max(0, 1 - t / 0.9), 0.9);
}
export function addGroundFire(x, z, life, s) {
  const gf = { x, z, y: groundH(x, z), t: 0, life, s, light: null, emitT: 0 };
  if (groundFires.length < 40) groundFires.push(gf);
}
export function updateGroundFires(dt) {
  let lightNeeded = null;
  for (let i = groundFires.length - 1; i >= 0; i--) {
    const f = groundFires[i]; f.t += dt;
    if (f.t >= f.life) { groundFires.splice(i, 1); continue; }
    const k = Math.min(1, (f.life - f.t) / 2) * f.s;
    f.emitT += dt;
    while (f.emitT > 0.045) {
      f.emitT -= 0.045;
      emitFire(f.x + R(-0.4, 0.4) * k, f.y + 0.1, f.z + R(-0.4, 0.4) * k, k);
      if (rand() < 0.25) FXS.emit({ x: f.x, y: f.y + 1.2 * k, z: f.z, vx: R(-.3, .3), vy: R(1, 2), vz: R(-.3, .3), life: R(2.5, 4), s0: 0.6 * k, s1: 3 * k, c0: SMOKE_DARK, c1: SMOKE_LIGHT, a: 0.35, shape: SH_SMOKE, grav: -0.4, turb: 1, fin: 0.2 });
      if (rand() < 0.2) FXA.emit({ x: f.x, y: f.y + 0.3, z: f.z, vx: R(-1, 1), vy: R(2, 5), vz: R(-1, 1), life: R(0.8, 1.8), s0: 0.05, s1: 0.02, c0: SPARK_HOT, c1: SPARK_COOL, shape: SH_SPARK, stretch: 0.04, grav: -1, turb: 4 });
    }
    stampFx(f.x, f.z, 1.2 * k, 3, 0.8);
    if (!lightNeeded) lightNeeded = f;
  }
  if (lightNeeded) {
    if (!gfLight || gfLight.t > gfLight.life - 0.1) gfLight = flashLight(_v1.set(lightNeeded.x, lightNeeded.y + 1.2, lightNeeded.z), 0xff7a2a, 140, 1e9, 18, 0.6);
    gfLight.l.position.set(lightNeeded.x, lightNeeded.y + 1.2, lightNeeded.z);
    gfLight.i0 = 140 * Math.min(1, groundFires.length / 3); gfLight.t = 0;
  } else if (gfLight) { gfLight.life = 0; gfLight = null; }
}
export function extinguish(x, z, r) {
  for (let i = groundFires.length - 1; i >= 0; i--) { const f = groundFires[i]; if (Math.hypot(f.x - x, f.z - z) < r) { groundFires.splice(i, 1); for (let k = 0; k < 6; k++) FXS.emit({ x: f.x, y: f.y + 0.5, z: f.z, vx: R(-.5, .5), vy: R(1, 2.5), vz: R(-.5, .5), life: R(1.5, 3), s0: 0.8, s1: 2.5, c0: C(0xcfd6dc), c1: C(0xeeeeee), a: 0.5, shape: SH_SMOKE, grav: -0.6, fin: 0.1 }); } }
}

// -------- 2. BLACK HOLE
export const bhDiskMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uTime: GLOBAL.time, uK: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vP; uniform float uTime; uniform float uK;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
      float sw = a + 3.0/(r+0.3) - uTime*2.2;
      float bands = n(vec2(sw*3.0, r*3.0)) * 0.6 + n(vec2(sw*7.0, r*7.0 - uTime))*0.4;
      float inner = smoothstep(0.95, 1.25, r), outer = 1.0 - smoothstep(2.2, 5.2, r);
      float m = inner*outer*(0.15 + bands*bands*1.4);
      vec3 c = mix(vec3(1.0,0.75,1.0)*2.4, vec3(0.55,0.15,1.0)*1.1, smoothstep(1.05, 2.2, r));
      c = mix(c, vec3(0.12,0.05,0.5), smoothstep(2.4, 5.0, r));
      gl_FragColor = vec4(c*m*uK, m*uK); }`
});
export const bhGlowMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uK: { value: 0 }, uTime: GLOBAL.time },
  vertexShader: `varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vU; uniform float uK; uniform float uTime; void main(){ float r = length(vU);
     float ring = exp(-pow((r-0.29)*30.0,2.0))*2.2 + exp(-pow((r-0.29)*8.0,2.0))*0.3;
     float halo = exp(-r*4.0)*0.6*step(0.27,r);
     vec3 c = vec3(0.85,0.5,1.0)*ring*(0.9+0.1*sin(uTime*20.0)) + vec3(0.4,0.1,0.9)*halo;
     gl_FragColor = vec4(c*uK, 1.0); }`
});
export function blackHole(pos, normal = UP, opts: { life?: number; scale?: number; lift?: number } = {}) {
  const C0 = pos.clone(); C0.y = Math.max(C0.y, groundH(C0.x, C0.z)) + (opts.lift ?? 2.6);
  const g = new THREE.Group(); g.position.copy(C0); g.scale.setScalar(opts.scale ?? 1.35); scene.add(g);
  let spin1 = 0, spin2 = 0;
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); g.add(core);
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.9, 5.4, 96, 4), bhDiskMat()); disk.rotation.x = -Math.PI / 2 + 0.38; g.add(disk);
  const disk2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 3.6, 96, 4), bhDiskMat()); disk2.rotation.x = Math.PI / 2 - 0.9; disk2.rotation.y = 0.6; g.add(disk2);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), bhGlowMat()); g.add(glow);
  const L = flashLight(C0, 0xb070ff, 260, 7.5, 40, 0.15);
  const snd = SFX.loop(C0, 'bh');
  SFX.whoosh(C0, 1.2, 1800, 200, 0.8);
  runeBurst(pos, normal.clone(), 1, 9, 2.5);
  addFlash(C0, 0x8040ff, 0.4);
  let t = 0; const LIFE = opts.life ?? 7.2, R0 = 15;
  const field = {
    alive: true,
    holds: (p) => (p.x - C0.x) ** 2 + (p.y - C0.y) ** 2 + (p.z - C0.z) ** 2 < R0 * R0,
    apply(p, h) {
      const dx = C0.x - p.x, dy = C0.y - p.y, dz = C0.z - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R0 * R0) return;
      const d = Math.sqrt(d2) + 0.001, k = field.k;
      const pull = k * 240 / (d + 1.5);
      p.vx += dx / d * pull * h; p.vy += (dy / d * pull + GRAV * 0.9 * k) * h; p.vz += dz / d * pull * h;
      // swirl around vertical axis
      const sw = k * 70 / (d + 2);
      p.vx += -dz / d * sw * h; p.vz += dx / d * sw * h;
      const damp = Math.exp(-h * 1.2 * k); p.vx *= damp; p.vy *= damp; p.vz *= damp;
      p.wx += R(-1, 1) * h * 30; p.wz += R(-1, 1) * h * 30;
      if (d < 1.6 * Math.max(0.3, k)) p.crush = Math.min(1, p.crush + h * 1.7);
    }, k: 0
  };
  fields.push(field);
  const pull = grassPush(C0.x, C0.z, () => 13, () => -0.9 * field.k, LIFE);
  let wakeT = 0;
  effects.push({
    update(dt) {
      t += dt;
      const grow = Math.min(1, t / 0.6), shrink = t > LIFE - 0.6 ? Math.max(0, (LIFE - t) / 0.6) : 1, k = grow * shrink;
      field.k = k;
      core.scale.setScalar(0.95 * k + 0.001 + Math.sin(t * 30) * 0.02 * k); disk.material.uniforms.uK.value = k; disk2.material.uniforms.uK.value = k * 0.6; glow.material.uniforms.uK.value = k;
      spin1 += dt * 1.5; spin2 -= dt * 2.1;
      _v1.subVectors(camera.position, C0); _v1.y = 0; _v1.normalize();
      _v2.copy(_v1).multiplyScalar(0.8).addScaledVector(UP, 0.6).normalize();
      disk.quaternion.setFromUnitVectors(_v3.set(0, 0, 1), _v2); disk.rotateZ(spin1);
      _v2.copy(_v1).multiplyScalar(0.35).addScaledVector(UP, 0.94).addScaledVector(_v4.set(-_v1.z, 0, _v1.x), 0.4).normalize();
      disk2.quaternion.setFromUnitVectors(_v3.set(0, 0, 1), _v2); disk2.rotateZ(spin2);
      glow.quaternion.copy(camera.quaternion); glow.scale.setScalar(k);
      g.position.y = C0.y + Math.sin(t * 1.3) * 0.15;
      L.l.position.copy(C0); L.t = 0; L.i0 = 260 * k;
      GR.bhW = { pos: C0, k, r: 2.4 };
      // wake nearby pieces progressively
      wakeT += dt;
      if (wakeT > 0.05) {
        wakeT = 0; let n = 0;
        forEachPieceInSphere(C0.x, C0.y, C0.z, 11 * k, (p) => { if (n < 10 && (p.state === S_SLEEP || p.state === S_KINE) && rand() < 0.5) { wake(p, true); n++; } });
      }
      // inspiralling particles
      for (let i = 0; i < 14 * k; i++) {
        const r = R(4, 11), a = R(0, 6.28), y = R(-1.5, 1.5) * (r / 8);
        const px = C0.x + Math.cos(a) * r, pz = C0.z + Math.sin(a) * r, sp = R(5, 9);
        const tx = -Math.sin(a), tz = Math.cos(a);
        const vx = (-Math.cos(a) * 0.75 + tx * 0.65) * sp, vz = (-Math.sin(a) * 0.75 + tz * 0.65) * sp;
        FXA.emit({ x: px, y: C0.y + y, z: pz, vx, vy: -y / (r / sp) * 0.8, vz, life: r / sp * 0.95, s0: R(0.05, 0.14), s1: 0.02, c0: C(0xd8a0ff, 5), c1: C(0x6020ff, 3), a: 1, shape: SH_SPARK, stretch: 0.06, fin: 0.2 });
      }
      if (rand() < 0.6 * k) {
        const r = R(5, 9), a = R(0, 6.28);
        FXS.emit({ x: C0.x + Math.cos(a) * r, y: groundH(C0.x, C0.z) + 0.3, z: C0.z + Math.sin(a) * r, vx: -Math.cos(a) * 4 - Math.sin(a) * 3, vy: 1.5, vz: -Math.sin(a) * 4 + Math.cos(a) * 3, life: 1.8, s0: 1.5, s1: 0.6, c0: C(0x6a5a50), c1: C(0x4a3a50), a: 0.4, shape: SH_SMOKE, drag: 0.5, fin: 0.2 });
      }
      // pull the player a little
      const pd = C0.distanceTo(camera.position);
      GR.shake = Math.max(GR.shake, 0.12 * k / (1 + pd * 0.05));
      if (t >= LIFE) {
        field.alive = false; fields.splice(fields.indexOf(field), 1);
        scene.remove(g); core.geometry.dispose(); disk.geometry.dispose(); disk2.geometry.dispose();
        if (snd) snd.stop(0.4);
        GR.bhW = null;
        // collapse burst
        for (let i = 0; i < 160; i++) { randDir(_v1); const sp = R(6, 22); FXA.emit({ x: C0.x, y: C0.y, z: C0.z, vx: _v1.x * sp, vy: _v1.y * sp, vz: _v1.z * sp, life: R(0.4, 1.2), s0: R(0.06, 0.16), s1: 0.02, c0: C(0xf0c0ff, 8), c1: C(0x5020ff, 2), shape: SH_SPARK, stretch: 0.05, drag: 1.5 }); }
        FXA.emit({ x: C0.x, y: C0.y, z: C0.z, life: 0.35, s0: 2, s1: 16, c0: C(0xd090ff, 4), c1: C(0x3010a0, 1), shape: SH_GLOW, fin: 0.02 });
        flashLight(C0, 0xc080ff, 2500, 0.6, 50);
        addFlash(C0, 0xa060ff, 0.5); addShake(C0, 0.6); SFX.thunder(C0, 0);
        pieceBlast(C0, 9, 7, 0.2, { spin: 6 });
        if (pull) pull.alive = false;
        return false;
      }
      return true;
    }
  });
}

// -------- 3. FIRE TORNADO
export const tornadoMat = (hot) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uTime: GLOBAL.time, uK: { value: 0 }, uHot: { value: hot } },
  vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0);
      vec3 n = normalize(normalMatrix*normal); vF = 1.0 - abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying vec2 vUv; varying float vF; uniform float uTime; uniform float uK; uniform float uHot;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.05;a*=.5;}return s;}
    void main(){
      vec2 p = vec2(vUv.x*8.0 + vUv.y*5.0 - uTime*(1.8+uHot), vUv.y*5.0 - uTime*3.2);
      p.x = mod(p.x, 8.0);
      float f = fbm(p) ; float f2 = fbm(p*2.1 + 4.0);
      float m = smoothstep(0.3, 0.78, f*0.8 + f2*0.4) * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
      m *= 0.55 + vF*1.1;
      vec3 c = mix(vec3(1.0,0.2,0.02)*1.6, vec3(1.0,0.58,0.16)*3.0, smoothstep(0.55, 0.95, f + uHot*0.2));
      gl_FragColor = vec4(c*m*uK, m*uK);
    }`
});
export function fireTornado(pos, key = '') {
  const P = new THREE.Vector3(pos.x, groundH(pos.x, pos.z), pos.z), home = P.clone();
  const g = new THREE.Group(); g.position.copy(P); scene.add(g);
  const H = 15;
  const fg = new THREE.CylinderGeometry(4.6, 0.55, H, 40, 20, true); fg.translate(0, H / 2, 0);
  const fg2 = new THREE.CylinderGeometry(3.2, 0.35, H * 0.9, 40, 20, true); fg2.translate(0, H * 0.45, 0);
  const s1 = new THREE.Mesh(fg, tornadoMat(0)), s2 = new THREE.Mesh(fg2, tornadoMat(1)); g.add(s1, s2);
  const L = flashLight(_v1.copy(P).setY(P.y + 4), 0xff7020, 320, 9.5, 45, 0.5);
  const snd = SFX.loop(P, 'tornado');
  SFX.explosion(P, 0.35);
  runeBurst(P, UP, 2, 10, 1.4);
  let t = 0; const LIFE = 9.5, RAD = 7.5;
    const field = {
    alive: true, k: 0,
    holds: (p) => Math.hypot(p.x - P.x, p.z - P.z) < RAD + 2 && p.y < P.y + H + 4,
    apply(p, h) {
      const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz) + 0.001, hy = p.y - P.y;
      if (d > RAD + 2 || hy > H + 6) return;
      const k = field.k, f = 1 - smooth(RAD * 0.5, RAD + 2, d), top = smooth(H * 0.65, H + 3, hy);
      const sw = 26 * f * k, inw = 18 * f * k * (1 - top) - 12 * top * k * f;
      // relax toward target swirling velocity
      const tvx = -dz / d * sw + dx / d * inw, tvz = dx / d * sw + dz / d * inw, tvy = (GRAV + 10) * f * k * (1 - top) * 0.95 + 2;
      const rk = 1 - Math.exp(-h * 3.5 * f);
      p.vx += (tvx - p.vx) * rk; p.vz += (tvz - p.vz) * rk;
      p.vy += (GRAV * f * k * (1 - top) * 1.12) * h + (tvy - p.vy) * rk * 0.12;
      p.wx += R(-1, 1) * h * 25; p.wy += R(-1, 1) * h * 25; p.wz += R(-1, 1) * h * 25;
      if (p.heat < 0.75 && f > 0.4) { p.heat = Math.min(0.75, p.heat + h * 0.5); markFx(p); }
    }
  };
  fields.push(field);
  const gp = grassPush(P.x, P.z, () => 7, (tt) => -0.9 * field.k, LIFE);
  let wakeT = 0, scT = 0;
  effects.push({
    update(dt) {
      t += dt;
      const k = Math.min(1, t / 0.9) * (t > LIFE - 1 ? Math.max(0, LIFE - t) : 1); field.k = k;
      // wander
      const sp = fieldPositions.get(key);
      if (sp) { const kk = 1 - Math.exp(-dt * 6); P.x += (sp.x - P.x) * kk; P.z += (sp.z - P.z) * kk; }
      P.y = groundH(P.x, P.z);
      g.position.copy(P); if (gp) { gp.x = P.x; gp.z = P.z; }
      s1.rotation.y += dt * 2.6; s2.rotation.y -= dt * 3.4;
      s1.material.uniforms.uK.value = k * 0.85; s2.material.uniforms.uK.value = k;
      const sc = 0.4 + 0.6 * k; g.scale.set(sc, 0.3 + 0.7 * Math.min(1, t / 1.2), sc);
      L.l.position.set(P.x, P.y + 5, P.z); L.t = 0; L.i0 = 320 * k;
      // particles: spiral flames
      for (let i = 0; i < 26 * k; i++) {
        const y = Math.pow(rand(), 1.05) * H, r = (0.55 + y * 0.27) * R(0.7, 1.1), a = R(0, 6.28);
        const tx = -Math.sin(a), tz = Math.cos(a), sp = 8 + y * 0.8;
        FXA.emit({ x: P.x + Math.cos(a) * r, y: P.y + y, z: P.z + Math.sin(a) * r, vx: tx * sp, vy: R(3, 7), vz: tz * sp, life: R(0.35, 0.7), s0: R(0.8, 1.6) * (0.6 + y / H), s1: R(0.3, 0.7), c0: y < 2 ? FIRE_WHITE : FIRE_HOT, c1: FIRE_COOL, a: 0.42, shape: SH_FIRE, drag: 2, spin: 3, fin: 0.1 });
      }
      for (let i = 0; i < 6 * k; i++) {
        const a = R(0, 6.28), sp = R(6, 16);
        FXA.emit({ x: P.x + Math.cos(a) * 1.5, y: P.y + R(0, H), z: P.z + Math.sin(a) * 1.5, vx: -Math.sin(a) * sp + Math.cos(a) * 4, vy: R(2, 9), vz: Math.cos(a) * sp + Math.sin(a) * 4, life: R(0.8, 2), s0: 0.07, s1: 0.03, c0: SPARK_HOT, c1: SPARK_COOL, shape: SH_SPARK, stretch: 0.05, grav: 3, turb: 6 });
      }
      for (let i = 0; i < 5 * k; i++) {
        const y = R(0.5, H), r = (0.55 + y * 0.29) * R(1.0, 1.25), a = R(0, 6.28), sp = 7 + y * 0.7;
        FXS.emit({ x: P.x + Math.cos(a) * r, y: P.y + y, z: P.z + Math.sin(a) * r, vx: -Math.sin(a) * sp, vy: R(2, 4), vz: Math.cos(a) * sp, life: R(0.8, 1.4), s0: R(1.2, 2.2) * (0.5 + y / H), s1: R(2.5, 4) * (0.5 + y / H), c0: C(0x2a2018), c1: C(0x4a4038), a: 0.42, shape: SH_SMOKE, drag: 1.2, spin: 2, fin: 0.15 });
      }
      if (rand() < 0.9 * k) FXS.emit({ x: P.x + R(-2, 2), y: P.y + H * R(0.8, 1.05), z: P.z + R(-2, 2), vx: R(-2, 2), vy: R(1, 3), vz: R(-2, 2), life: R(4, 6), s0: 3, s1: 9, c0: SMOKE_DARK, c1: SMOKE_LIGHT, a: 0.55, shape: SH_SMOKE, grav: -0.4, turb: 1, drag: 0.4, fin: 0.15 });
      if (rand() < 0.5 * k) { const a = R(0, 6.28); FXS.emit({ x: P.x + Math.cos(a) * 4, y: P.y + 0.3, z: P.z + Math.sin(a) * 4, vx: -Math.sin(a) * 9 - Math.cos(a) * 3, vy: 2, vz: Math.cos(a) * 9 - Math.sin(a) * 3, life: 1.5, s0: 1.2, s1: 2.5, c0: C(0x6a5a48), c1: C(0x8a7a68), a: 0.45, shape: SH_SMOKE, drag: 0.8, fin: 0.2 }); }
      // scorch trail and waking
      scT += dt; if (scT > 0.12) { scT = 0; stampFx(P.x, P.z, 2.6, 0, 0.85 * k, { clear: [1, 2] }); stampFx(P.x, P.z, 2.2, 3, k); }
      wakeT += dt;
      if (wakeT > 0.06) { wakeT = 0; let n = 0; forEachPieceInSphere(P.x, P.y + 3, P.z, (RAD - 1) * k, (p) => { if (n < 8 && (p.state === S_SLEEP || p.state === S_KINE) && Math.hypot(p.x - P.x, p.z - P.z) < RAD - 1) { wake(p, true); n++; } }); }
      GR.shake = Math.max(GR.shake, 0.1 * k / (1 + P.distanceTo(camera.position) * 0.05));
      if (t >= LIFE) {
        field.alive = false; fields.splice(fields.indexOf(field), 1); scene.remove(g); fg.dispose(); fg2.dispose(); s1.material.dispose(); s2.material.dispose();
        if (snd) snd.stop(1.0); return false;
      }
      return true;
    }
  });
}

// -------- 4. FROST
export const shardGeo = (() => { const g = new THREE.OctahedronGeometry(0.5, 0); g.scale(0.55, 2.2, 0.55); g.translate(0, 0.9, 0); return g; })();
export const shardMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.06, metalness: 0.1, emissive: 0x2a6fa8, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, flatShading: true });
export const SHARDS = 360;
export const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARDS); shards.castShadow = true; shards.frustumCulled = false; shards.count = SHARDS;
shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < SHARDS; i++) shards.setMatrixAt(i, ZERO_M);
scene.add(shards);
export const shardList = []; let shardCursor = 0;
export function frostNova(pos, normal) {
  const P = pos.clone();
  SFX.frost(P);
  addFlash(P, 0x9ad8ff, 0.45); addShake(P, 0.4);
  flashLight(_v1.copy(P).setY(P.y + 2), 0x9fd8ff, 1100, 1.5, 40);
  runeBurst(P, normal, 3, 15, 1.6);
  shockRing(P, 0xbfe8ff, 13, 0.7);
  stampFx(P.x, P.z, 11, 1, 1, { clear: [3], noise: 0.7 });
  extinguish(P.x, P.z, 12);
  // crystal spikes radiating outward
  const rays = 14;
  for (let r = 0; r < rays; r++) {
    const a = r / rays * 6.283 + R(-0.2, 0.2);
    for (let k = 0; k < 4; k++) {
      const d = 0.8 + k * R(1.3, 1.9), x = P.x + Math.cos(a) * d + R(-0.3, 0.3), z = P.z + Math.sin(a) * d + R(-0.3, 0.3);
      const s = (1.5 - k * 0.28) * R(0.7, 1.2);
      const tilt = new THREE.Quaternion().setFromAxisAngle(_v1.set(-Math.sin(a), 0, Math.cos(a)), -(0.35 + k * 0.15) * R(0.6, 1.2));
      tilt.multiply(new THREE.Quaternion().setFromAxisAngle(UP, R(0, 6.28)));
      shardList.push({ i: shardCursor, x, y: groundH(x, z) - 0.25, z, q: tilt, s, t0: GLOBAL.time.value + d * 0.035, life: R(9, 13) });
      shardCursor = (shardCursor + 1) % SHARDS;
    }
  }
  for (let i = 0; i < 8; i++) { const a = R(0, 6.28), d = R(0, 1); shardList.push({ i: shardCursor, x: P.x + Math.cos(a) * d, y: groundH(P.x, P.z) - 0.3, z: P.z + Math.sin(a) * d, q: new THREE.Quaternion().setFromEuler(_e1.set(R(-.3, .3), R(0, 6), R(-.3, .3))), s: R(1.6, 2.4), t0: GLOBAL.time.value, life: 12 }); shardCursor = (shardCursor + 1) % SHARDS; }
  // mist & sparkle
  for (let i = 0; i < 70; i++) { const a = R(0, 6.28), sp = R(2, 9); FXS.emit({ x: P.x + Math.cos(a), y: groundH(P.x, P.z) + R(0.2, 1), z: P.z + Math.sin(a), vx: Math.cos(a) * sp, vy: R(0, 0.6), vz: Math.sin(a) * sp, life: R(2.5, 4.5), s0: 1.2, s1: R(3.5, 6), c0: C(0xdff2ff), c1: C(0xf4fbff), a: 0.5, shape: SH_SMOKE, drag: 1.4, grav: 0.05, fin: 0.1 }); }
  for (let i = 0; i < 160; i++) { randDir(_v1); const sp = R(1, 10); FXA.emit({ x: P.x, y: P.y + 0.8, z: P.z, vx: _v1.x * sp, vy: Math.abs(_v1.y) * sp * 0.6 + 1, vz: _v1.z * sp, life: R(1, 3), s0: R(0.12, 0.3), s1: 0.05, c0: C(0xe8f8ff, 4), c1: C(0x7ac8ff, 2), shape: SH_STAR, drag: 2, grav: -0.3, turb: 2, spin: R(-3, 3) }); }
  for (let i = 0; i < 90; i++) FXA.emit({ x: P.x + R(-9, 9), y: P.y + R(3, 9), z: P.z + R(-9, 9), vx: R(-.4, .4), vy: R(-1.4, -0.6), vz: R(-.4, .4), life: R(3, 5), s0: R(0.05, 0.1), s1: 0.04, c0: C(0xffffff, 2), c1: C(0xcfeaff, 1.5), shape: SH_STAR, turb: 1.5, spin: 2, fin: 0.2 });
  // freeze pieces
  forEachPieceInSphere(P.x, P.y, P.z, 9, (p, d) => {
    p.frost = Math.max(p.frost, 1 - d / 12); p.heat = 0; markFx(p);
    if (p.state === S_ACTIVE) { p.vx *= 0.08; p.vy *= 0.2; p.vz *= 0.08; p.wx *= 0.05; p.wy *= 0.05; p.wz *= 0.05; }
  });
}
export function updateShards() {
  if (!shardList.length) return;
  const now = GLOBAL.time.value;
  for (let k = shardList.length - 1; k >= 0; k--) {
    const s = shardList[k], t = now - s.t0;
    if (t < 0) continue;
    let sc = t < 0.28 ? easeOutBack(t / 0.28) : 1;
    let y = s.y;
    if (t > s.life - 1.2) { const m = (t - (s.life - 1.2)) / 1.2; sc *= 1 - m * 0.3; y -= m * 2.4 * s.s; }
    if (t > s.life) { shards.setMatrixAt(s.i, ZERO_M); shardList.splice(k, 1); continue; }
    _m1.compose(_v1.set(s.x, y, s.z), s.q, _v2.set(s.s * sc, s.s * sc, s.s * sc));
    shards.setMatrixAt(s.i, _m1);
  }
  shards.instanceMatrix.needsUpdate = true;
}

// -------- 5. LIGHTNING
export const boltMat = (color, alpha) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uC: { value: new THREE.Color(color) }, uA: { value: alpha } },
  vertexShader: `varying float vV; void main(){ vV = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying float vV; uniform vec3 uC; uniform float uA; void main(){ float x = (vV-0.5)*2.0; float a = exp(-x*x*4.5)*uA; gl_FragColor = vec4(uC*a, a); }`
});
export function boltPath(a, b, detail, disp) {
  let pts = [a.clone(), b.clone()], d = disp;
  for (let k = 0; k < detail; k++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1]; const m = p0.clone().add(p1).multiplyScalar(0.5);
      _v1.subVectors(p1, p0).normalize(); randDir(_v2); _v2.addScaledVector(_v1, -_v2.dot(_v1)).normalize();
      m.addScaledVector(_v2, d * R(-1, 1)); np.push(m, p1);
    }
    pts = np; d *= 0.55;
  }
  return pts;
}
export function ribbon(paths, width) {
  const pos = [], uv = [], idx = []; let v = 0;
  for (const [pts, w0] of paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1], w = width * w0 * (1 - i / pts.length * 0.5);
      _v1.subVectors(p1, p0); _v2.subVectors(camera.position, p0); _v3.crossVectors(_v1, _v2).normalize().multiplyScalar(w);
      pos.push(p0.x - _v3.x, p0.y - _v3.y, p0.z - _v3.z, p0.x + _v3.x, p0.y + _v3.y, p0.z + _v3.z, p1.x - _v3.x, p1.y - _v3.y, p1.z - _v3.z, p1.x + _v3.x, p1.y + _v3.y, p1.z + _v3.z);
      uv.push(0, 0, 0, 1, 1, 0, 1, 1); idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); v += 4;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
export const boltCore = boltMat(new THREE.Color(0xe8f0ff).multiplyScalar(9), 1), boltGlow = boltMat(new THREE.Color(0x5a8cff).multiplyScalar(3.2), 0.5);
export function spawnBolt(a, b, opts: any = {}) {
  const len = a.distanceTo(b);
  const main = boltPath(a, b, opts.detail || 7, len * 0.13);
  const paths = [[main, 1]];
  const nb = opts.branches ?? 4;
  for (let i = 0; i < nb; i++) {
    const s = main[Math.floor(R(0.15, 0.8) * main.length)]; randDir(_v1);
    _v2.subVectors(b, a).normalize().multiplyScalar(0.6).add(_v1).normalize();
    const e = s.clone().addScaledVector(_v2, len * R(0.12, 0.3));
    paths.push([boltPath(s, e, 5, len * 0.05), 0.45]);
  }
  const wc = opts.width || 0.09;
  const m1 = new THREE.Mesh(ribbon(paths, wc), boltCore), m2 = new THREE.Mesh(ribbon(paths, wc * 7), boltGlow);
  m1.renderOrder = m2.renderOrder = 11; scene.add(m1, m2);
  let t = 0; const life = opts.life || 0.16;
  effects.push({ update(dt) { t += dt; const vis = t < life && (t < 0.04 || rand() < 0.7); m1.visible = m2.visible = vis; if (t >= life) { scene.remove(m1, m2); m1.geometry.dispose(); m2.geometry.dispose(); return false; } return true; } });
  return main;
}
export function lightningStorm(pos, normal, strikeOffsets: [number, number][], from: () => THREE.Vector3) {
  const P = pos.clone();
  let t = 0, arcT = 0, strikes = [0.0, 0.18, 0.36, 0.55, 0.78], si = 0;
  SFX.zap(from(), 0.95);
  effects.push({
    update(dt) {
      t += dt; arcT -= dt;
      if (t < 0.95 && arcT <= 0) {
        arcT = 0.045;
        const tgt = P.clone().add(_v4.set(R(-1, 1), R(0, 0.6), R(-1, 1)));
        spawnBolt(from().clone(), tgt, { detail: 6, branches: 2, width: 0.035, life: 0.07 });
        for (let i = 0; i < 6; i++) FXA.emit({ x: tgt.x, y: tgt.y, z: tgt.z, vx: R(-6, 6), vy: R(1, 7), vz: R(-6, 6), life: R(0.2, 0.6), s0: 0.06, s1: 0.02, c0: C(0xdde8ff, 8), c1: C(0x6090ff, 3), shape: SH_SPARK, stretch: 0.04, grav: 9 });
        stampFx(tgt.x, tgt.z, 1.0, 3, 0.6);
      }
      while (si < strikes.length && t >= strikes[si]) {
        si++;
        const off = strikeOffsets[(si - 1) % Math.max(1, strikeOffsets.length)] || [0, 0];
        const gx = P.x + off[0], gz = P.z + off[1];
        let gy = groundH(gx, gz);
        const hit = rayPieces(_v1.set(gx, gy + 60, gz), _v2.set(0, -1, 0), 61); if (hit) gy = gy + 60 - hit.t;
        const G = new THREE.Vector3(gx, gy, gz);
        spawnBolt(new THREE.Vector3(gx + R(-8, 8), gy + 70, gz + R(-8, 8)), G, { detail: 8, branches: 6, width: 0.13, life: 0.22 });
        flashLight(_v1.copy(G).setY(gy + 3), 0xb0c8ff, 4500, 0.3, 60);
        addFlash(G, 0xc0d4ff, 0.3); addShake(G, 0.55);
        SFX.thunder(G, 0.15 + G.distanceTo(camera.position) / 340);
        stampFx(gx, gz, 2.4, 0, 0.9, { clear: [1, 2] }); stampFx(gx, gz, 2.0, 3, 1);
        for (let i = 0; i < 70; i++) { randDir(_v3); const sp = R(4, 18); FXA.emit({ x: gx, y: gy + 0.2, z: gz, vx: _v3.x * sp, vy: Math.abs(_v3.y) * sp, vz: _v3.z * sp, life: R(0.3, 1.1), s0: R(0.05, 0.1), s1: 0.02, c0: C(0xeef4ff, 9), c1: C(0x4a7aff, 3), shape: SH_SPARK, stretch: 0.05, grav: 10, drag: 0.8 }); }
        FXA.emit({ x: gx, y: gy + 0.5, z: gz, life: 0.25, s0: 2, s1: 7, c0: C(0xcfe0ff, 6), c1: C(0x5080ff, 1), shape: SH_GLOW, fin: 0.02 });
        for (let i = 0; i < 10; i++) FXS.emit({ x: gx, y: gy + 0.3, z: gz, vx: R(-2, 2), vy: R(1, 3), vz: R(-2, 2), life: R(1.5, 3), s0: 0.8, s1: 3, c0: C(0x3a3a40), c1: C(0x7a7a80), a: 0.5, shape: SH_SMOKE, grav: -0.5, fin: 0.1 });
        pieceBlast(G, 3.6, 11, 0.6, { fracture: si === 1 ? 0.4 : 0, spin: 14, heat: true });
        earthDebris(G, 4, 9, 0.7);
        // chain arcs to nearby stones
        const near = [];
        forEachPieceInSphere(gx, gy + 1, gz, 9, (p, dd) => { if (dd > 1.5) near.push([p, dd]); });
        near.sort((x, y) => x[1] - y[1]);
        for (let i = 0; i < Math.min(3, near.length); i++) {
          const p = near[i][0]; spawnBolt(G.clone().setY(gy + 0.5), new THREE.Vector3(p.x, p.y, p.z), { detail: 5, branches: 1, width: 0.04, life: 0.14 });
          if (wake(p, true)) { p.vy += 6; p.vx += R(-3, 3); p.vz += R(-3, 3); p.heat = 0.8; markFx(p); }
        }
      }
      return t < 1.0;
    }
  });
  runeBurst(P, normal, 4, 11, 1.2);
}

// -------- 6. WIND BLAST
export function windBlast(pos, normal, dir, from: THREE.Vector3) {
  const P = pos.clone().addScaledVector(normal, 0.6);
  SFX.wind(P); addShake(P, 0.35);
  runeBurst(pos, normal, 5, 10, 0.9);
  shockRing(pos, 0xdffff4, 15, 0.65, 1);
  // air streaks from staff to target
  const tip = from.clone();
  for (let i = 0; i < 70; i++) {
    const t = rand(); const p = tip.clone().lerp(P, t * 0.9); randDir(_v1);
    FXA.emit({ x: p.x + _v1.x * 0.6, y: p.y + _v1.y * 0.6, z: p.z + _v1.z * 0.6, vx: dir.x * 50, vy: dir.y * 50, vz: dir.z * 50, life: R(0.12, 0.3), s0: R(0.03, 0.07), s1: 0.02, c0: C(0xe8fff8, 1.8), c1: C(0xa0e0ff, 0.6), a: 0.5, shape: SH_SPARK, stretch: 0.02, fin: 0.1 });
  }
  for (let i = 0; i < 90; i++) {
    const a = i / 90 * 6.283, sp = R(12, 22);
    FXS.emit({ x: P.x + Math.cos(a) * 0.8, y: groundH(P.x, P.z) + R(0.2, 0.9), z: P.z + Math.sin(a) * 0.8, vx: Math.cos(a) * sp, vy: R(0.5, 2), vz: Math.sin(a) * sp, life: R(0.9, 1.8), s0: 0.9, s1: 3.6, c0: C(0xbfb6a0), c1: C(0xdcd8cc), a: 0.38, shape: SH_SMOKE, drag: 2.6, fin: 0.05 });
  }
  for (let i = 0; i < 70; i++) {
    const a = R(0, 6.28), sp = R(6, 16), col = rand() < 0.5 ? C(0x6a9a34) : C(0x8ab040);
    FXS.emit({ x: P.x + Math.cos(a) * 2, y: groundH(P.x, P.z) + 0.3, z: P.z + Math.sin(a) * 2, vx: Math.cos(a) * sp, vy: R(3, 8), vz: Math.sin(a) * sp, life: R(1.5, 3), s0: R(0.08, 0.16), s1: 0.1, c0: col, c1: col, a: 1, shape: SH_PETAL, grav: 4, drag: 1.2, turb: 6, spin: R(-10, 10), fin: 0.02 });
  }
  for (let i = 0; i < 60; i++) { randDir(_v1); FXA.emit({ x: P.x, y: P.y, z: P.z, vx: _v1.x * 24, vy: _v1.y * 12, vz: _v1.z * 24, life: R(0.2, 0.45), s0: 0.08, s1: 0.03, c0: C(0xeafff6, 3), c1: C(0xaaffee, 1), a: 0.7, shape: SH_SPARK, stretch: 0.03, drag: 3 }); }
  extinguish(P.x, P.z, 9);
  pieceBlast(P, 12, 20, 0.3, { dir: _v4.copy(dir).setY(0).normalize(), spin: 5 });
  grassPush(P.x, P.z, (t) => 1 + t * 26, (t) => 2.2 * Math.max(0, 1 - t / 1.1), 1.1);
}

// -------- 7. GROWTH
export function growthBloom(pos, normal, seed = 1) {
  const P = new THREE.Vector3(pos.x, groundH(pos.x, pos.z), pos.z);
  SFX.growth(P);
  addFlash(P, 0x9aff70, 0.25);
  flashLight(_v1.copy(P).setY(P.y + 2), 0x9aff70, 500, 1.8, 30);
  runeBurst(P, UP, 6, 13, 2.0);
  stampFx(P.x, P.z, 8, 2, 1, { clear: [0, 1, 3], noise: 0.6 });
  extinguish(P.x, P.z, 9);
  for (let i = 0; i < 130; i++) {
    const a = R(0, 6.28), d = Math.sqrt(rand()) * 7;
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    if (isBlocked(x, z)) continue;
    sproutFlower(x, z, d * 0.08 + R(0, 0.25), _c1.copy(FLOWER_COLS[RI(0, FLOWER_COLS.length - 1)]).multiplyScalar(R(0.9, 1.15)));
  }
  // the tree
  const free = !isBlocked(P.x, P.z, 1.5) && treeColliders.every(c => Math.hypot(c.x - P.x, c.z - P.z) > 3.2);
  if (free) {
    const tr = buildTree(seed, 0.95 + (seed % 1000) / 4000);
    tr.position.copy(P).y -= 0.1; tr.rotation.y = R(0, 6.28); tr.scale.setScalar(0.001); scene.add(tr);
    const col = { x: P.x, z: P.z, r: tr.userData.trunkR + 0.25 };
    const rec: any = { tr, col, t: 0 }; growTrees.push(rec);
    if (growTrees.length > 12) { const old = growTrees.shift(); old.dying = 0; effects.push({ update(dt) { old.dying += dt; old.tr.scale.setScalar(Math.max(0.001, 1 - old.dying / 1.2)); if (old.dying >= 1.2) { scene.remove(old.tr); const i = treeColliders.indexOf(old.col); if (i >= 0) treeColliders.splice(i, 1); return false; } return true; } }); }
    effects.push({
      update(dt) {
        rec.t += dt; const k = Math.min(1, rec.t / 2.4);
        const e = k === 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * 9.5); // elastic grow
        tr.scale.set(Math.max(0.001, e * (0.9 + 0.1 * k)), Math.max(0.001, Math.pow(k, 0.6) * e), Math.max(0.001, e * (0.9 + 0.1 * k)));
        tr.rotation.y += dt * (1 - k) * 1.5;
        if (rec.t > 0.6 && !rec.collided) { rec.collided = true; treeColliders.push(col); }
        return k < 1;
      }
    });
    // shove pieces out of the trunk's way
    forEachPieceInSphere(P.x, P.y + 1, P.z, 3, (p) => { if (wake(p, true)) { const dx = p.x - P.x, dz = p.z - P.z, l = Math.hypot(dx, dz) + 0.01; p.vx += dx / l * 4; p.vz += dz / l * 4; p.vy += 3; } });
    // erupting soil
    for (let i = 0; i < 40; i++) { const a = R(0, 6.28), sp = R(1, 5); FXS.emit({ x: P.x, y: P.y + 0.2, z: P.z, vx: Math.cos(a) * sp, vy: R(3, 7), vz: Math.sin(a) * sp, life: R(0.8, 1.6), s0: R(0.1, 0.25), s1: 0.3, c0: C(0x3a2a1a), c1: C(0x4a3a2a), a: 1, shape: SH_DUST, grav: 11, fin: 0.02 }); }
  }
  for (let i = 0; i < 140; i++) { const a = R(0, 6.28), d = R(0, 7); FXA.emit({ x: P.x + Math.cos(a) * d, y: P.y + R(0, 0.5), z: P.z + Math.sin(a) * d, vx: R(-0.3, 0.3), vy: R(0.8, 3), vz: R(-0.3, 0.3), life: R(1.5, 3.2), s0: R(0.08, 0.2), s1: 0.03, c0: C(0xc8ff90, 4), c1: C(0x40ff60, 1.5), shape: SH_STAR, turb: 2, spin: R(-3, 3), drag: 0.6, fin: 0.15 }); }
  for (let i = 0; i < 60; i++) { const a = R(0, 6.28), d = R(0, 6), col = FLOWER_COLS[RI(0, 7)]; FXS.emit({ x: P.x + Math.cos(a) * d, y: P.y + R(0.5, 3), z: P.z + Math.sin(a) * d, vx: R(-1, 1), vy: R(0.5, 1.5), vz: R(-1, 1), life: R(2, 4), s0: 0.08, s1: 0.07, c0: col, c1: col, a: 1, shape: SH_PETAL, grav: 0.8, turb: 3, spin: R(-6, 6), drag: 0.8, fin: 0.1 }); }
}

// ---------- projectiles
export const projectiles = [];
export function launch(spell, from, to, onHit) {
  const col = new THREE.Color(SPELLS[spell].color);
  const L = flashLight(from, col, 120, 10, 18);
  projectiles.push({ spell, pos: from.clone(), to: to.clone(), onHit, col, L, t: 0, start: from.clone(), dist: from.distanceTo(to) });
}
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.t += dt;
    const speed = 85, prog = Math.min(1, (p.t * speed) / Math.max(1, p.dist));
    const arc = Math.sin(prog * Math.PI) * Math.min(3, p.dist * 0.06);
    const prev = p.pos.clone();
    p.pos.lerpVectors(p.start, p.to, prog); p.pos.y += arc;
    p.L.l.position.copy(p.pos); p.L.t = 0;
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      _v1.lerpVectors(prev, p.pos, s / steps);
      const hot = p.spell === 0 || p.spell === 2;
      FXA.emit({ x: _v1.x, y: _v1.y, z: _v1.z, vx: R(-0.5, 0.5), vy: R(-0.5, 0.5), vz: R(-0.5, 0.5), life: R(0.15, 0.4), s0: hot ? 0.7 : 0.45, s1: 0.05, c0: hot ? FIRE_HOT : _c1.copy(p.col).multiplyScalar(3), c1: hot ? FIRE_COOL : _c2.copy(p.col).multiplyScalar(0.8), a: 0.8, shape: hot ? SH_FIRE : SH_GLOW, fin: 0.02 });
    }
    FXA.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, life: 0.05, s0: 0.9, s1: 0.9, c0: _c1.copy(p.col).multiplyScalar(5), a: 1, shape: SH_GLOW });
    if (p.spell === 6 && rand() < 0.6) FXS.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: R(-1, 1), vy: R(-1, 0), vz: R(-1, 1), life: 1.2, s0: 0.08, s1: 0.06, c0: FLOWER_COLS[RI(0, 7)], a: 1, shape: SH_PETAL, grav: 2, spin: 5 });
    if (prog >= 1) { p.L.life = 0; projectiles.splice(i, 1); p.onHit(); }
  }
}
export const _c2 = new THREE.Color();
// ---------- multiplayer entry point: every cast (local or remote) is replayed through here
interface CastExtra { key?: string; strikes?: [number, number][]; seed?: number; fromFn?: () => THREE.Vector3; local?: boolean }
export function playCast(s: number, from: THREE.Vector3, to: THREE.Vector3, n: THREE.Vector3, dir: THREE.Vector3, extra: CastExtra = {}) {
  if (extra.local) SFX.cast(Math.min(s, 6)); else SFX.whoosh(from, 0.5, 500, 1800, 0.5);
  const col = SPELLS[s].color;
  for (let i = 0; i < 30; i++) { randDir(_v1); FXA.emit({ x: from.x, y: from.y, z: from.z, vx: _v1.x * 3 + dir.x * 6, vy: _v1.y * 3 + dir.y * 6, vz: _v1.z * 3 + dir.z * 6, life: R(0.2, 0.5), s0: 0.06, s1: 0.01, c0: _c1.set(col).multiplyScalar(6), c1: _c2.set(col), shape: SH_SPARK, stretch: 0.03, drag: 3 }); }
  const fromFn = extra.fromFn || (() => from);
  if (s === 0) launch(0, from, to, () => fireExplosion(to, n));
  else if (s === 1) launch(1, from, to, () => blackHole(to, n));
  else if (s === 2) launch(2, from, to, () => fireTornado(to, extra.key || ''));
  else if (s === 3) launch(3, from, to, () => frostNova(to, n));
  else if (s === 4) lightningStorm(to, n, extra.strikes && extra.strikes.length ? extra.strikes : [[0, 0]], fromFn);
  else if (s === 5) windBlast(to, n, dir, from);
  else if (s === 6) launch(6, from, to, () => growthBloom(to, n, extra.seed || 1));
  else if (s === 7) grandFissure(from, to);
}

// ---------- 8. GRAND FISSURE (Grand Sage ultimate): split the earth, freeze the rift, open a black hole
export const fissureMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6,
  uniforms: { uProg: { value: 0 }, uIce: { value: 0 }, uFade: { value: 1 }, uTime: GLOBAL.time },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uProg; uniform float uIce; uniform float uFade; uniform float uTime;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      if (vUv.x > uProg) discard;
      float a = abs(vUv.y - 0.5) * 2.0;
      float edge = smoothstep(0.35, 0.95, a);
      float depth = 1.0 - smoothstep(0.0, 0.7, a);
      float flick = 0.8 + 0.2*sin(uTime*9.0 + vUv.x*60.0) + 0.15*h(floor(vUv*vec2(120.0,6.0)));
      vec3 magma = vec3(1.0, 0.42, 0.08) * 3.2 * flick;
      vec3 ice = vec3(0.55, 0.85, 1.0) * 2.4;
      vec3 glow = mix(magma, ice, uIce);
      vec3 c = mix(vec3(0.01, 0.008, 0.006), glow, depth * 0.55 + (1.0 - edge) * 0.25);
      c += glow * smoothstep(0.995, 1.0, 1.0 - abs(vUv.x - uProg)) * 2.0;
      float alpha = (1.0 - smoothstep(0.85, 1.0, a)) * uFade;
      gl_FragColor = vec4(c, alpha);
    }`
});
export function grandFissure(fromTip: THREE.Vector3, to: THREE.Vector3) {
  const F = TUNE.fissure;
  // the rift runs from the caster's feet toward the target
  const ax0 = fromTip.x, az0 = fromTip.z;
  const dir = new THREE.Vector3(to.x - ax0, 0, to.z - az0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const A = new THREE.Vector3(ax0 + dir.x * 2, 0, az0 + dir.z * 2), len = F.length - 2;
  const pointAt = (t: number) => new THREE.Vector3(A.x + dir.x * len * t, 0, A.z + dir.z * len * t);
  const mid = pointAt(0.5); mid.y = groundH(mid.x, mid.z);
  // crack ribbon hugging the terrain
  const N = 70, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let jitter = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N; jitter += R(-0.35, 0.35); jitter *= 0.85;
    const c = pointAt(t).addScaledVector(perp, jitter);
    const w = (0.35 + F.width * 0.45 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.6)) * R(0.85, 1.15);
    for (const s of [-1, 1]) {
      const x = c.x + perp.x * w * s, z = c.z + perp.z * w * s;
      pos.push(x, groundH(x, z) + 0.05, z); uv.push(t, s < 0 ? 0 : 1);
    }
    if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const crack = new THREE.Mesh(geo, fissureMat()); crack.renderOrder = 7; scene.add(crack);
  const U = crack.material.uniforms;
  const feet = new THREE.Vector3(ax0, groundH(ax0, az0), az0);
  runeBurst(feet, UP, 7, 13, 1.8);
  addFlash(feet, 0xffd36a, 0.18); addShake(feet, 1.4);
  flashLight(_v1.copy(mid).setY(mid.y + 2), 0xffa040, 700, 1.0, 40, 0.3);
  SFX.explosion(mid, 0.9); SFX.thunder(mid, 0.25);
  let t = 0, nextBreak = 0, froze = false, holed = false;
  effects.push({
    update(dt) {
      t += dt;
      U.uProg.value = Math.min(1, t / 0.4);
      // 1. the earth breaks: slabs and rocks erupt along the advancing crack
      while (nextBreak <= U.uProg.value && nextBreak <= 1) {
        const p = pointAt(nextBreak); p.y = groundH(p.x, p.z);
        stampFx(p.x, p.z, 3.2, 0, 1, { clear: [1, 2] }); stampFx(p.x, p.z, 2.6, 3, 1);
        if (Math.round(nextBreak * 20) % 2 === 0) {
          for (const s of [-1, 1]) {
            const q = p.clone().addScaledVector(perp, s * R(1.2, 2.4));
            const slab = spawnDynamic(K_STONE, q.x, groundH(q.x, q.z) + 0.3, q.z, R(0.9, 1.7), R(0.28, 0.45), R(0.7, 1.3),
              _q1.setFromEuler(_e1.set(R(-0.6, 0.6), Math.atan2(dir.x, dir.z) + R(-0.3, 0.3), s * R(0.4, 0.9))), _c1.setHSL(0.08, 0.18, R(0.24, 0.34)),
              perp.x * s * R(1, 3), R(7, 13), perp.z * s * R(1, 3));
            if (slab) { slab.temp = R(8, 14); slab.wx = R(-5, 5); slab.wz = R(-5, 5); slab.heat = 0.8; markFx(slab); }
          }
          earthDebris(p, 3, 12, 0.6);
        }
        for (let i = 0; i < 6; i++) FXS.emit({ x: p.x + R(-1.5, 1.5), y: p.y + 0.3, z: p.z + R(-1.5, 1.5), vx: R(-2, 2), vy: R(2, 6), vz: R(-2, 2), life: R(1.6, 3), s0: 1.2, s1: 4, c0: C(0x6a5a48), c1: C(0x9a8d78), a: 0.5, shape: SH_SMOKE, drag: 1.4, grav: -0.3, fin: 0.05 });
        for (let i = 0; i < 10; i++) FXA.emit({ x: p.x, y: p.y + 0.2, z: p.z, vx: R(-4, 4), vy: R(4, 12), vz: R(-4, 4), life: R(0.5, 1.4), s0: 0.08, s1: 0.03, c0: SPARK_HOT, c1: SPARK_COOL, shape: SH_SPARK, stretch: 0.04, grav: 12 });
        pieceBlast(p.clone().setY(p.y + 0.5), 4.5, 16, 1.1, { spin: 8 });
        nextBreak += 0.05;
      }
      // 2. the rift freezes
      if (!froze && t >= F.freezeAt) {
        froze = true;
        SFX.frost(mid); addFlash(mid, 0x9ad8ff, 0.15);
        flashLight(_v1.copy(mid).setY(mid.y + 2), 0x9fd8ff, 600, 1.0, 40);
        for (let k = 0; k <= 10; k++) {
          const p = pointAt(k / 10); stampFx(p.x, p.z, F.width + 2.5, 1, 1, { clear: [3], noise: 0.6 });
          for (let j = 0; j < 3; j++) {
            const a = R(0, 6.28), d = R(0.5, F.width), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
            shardList.push({ i: shardCursor, x, y: groundH(x, z) - 0.25, z, q: new THREE.Quaternion().setFromEuler(_e1.set(R(-0.5, 0.5), R(0, 6), R(-0.5, 0.5))), s: R(1.0, 2.0), t0: GLOBAL.time.value + k * 0.02, life: R(6, 9) });
            shardCursor = (shardCursor + 1) % SHARDS;
          }
          for (let j = 0; j < 8; j++) FXA.emit({ x: p.x + R(-2, 2), y: p.y + R(0.3, 2), z: p.z + R(-2, 2), vx: R(-1, 1), vy: R(0.5, 2), vz: R(-1, 1), life: R(1, 2.5), s0: R(0.12, 0.25), s1: 0.04, c0: C(0xe8f8ff, 4), c1: C(0x7ac8ff, 2), shape: SH_STAR, drag: 1.5, spin: 3 });
          forEachPieceInSphere(p.x, p.y + 1, p.z, F.width + 1, (pc) => { pc.frost = 1; pc.heat = 0; markFx(pc); if (pc.state === S_ACTIVE) { pc.vx *= 0.1; pc.vz *= 0.1; pc.wx *= 0.1; pc.wy *= 0.1; pc.wz *= 0.1; } });
        }
      }
      if (froze) U.uIce.value = Math.min(1, (t - F.freezeAt) / 0.4);
      // 3. a black hole tears open over the frozen rift
      if (!holed && t >= F.holeAt) {
        holed = true;
        const along = Math.max(4, Math.min(F.length, (to.x - ax0) * dir.x + (to.z - az0) * dir.z));
        const h = new THREE.Vector3(ax0 + dir.x * along, 0, az0 + dir.z * along); h.y = groundH(h.x, h.z);
        blackHole(h, UP, { life: F.holeLife, scale: 1.9, lift: 3.2 });
      }
      if (t > 6) U.uFade.value = Math.max(0, 1 - (t - 6) / 2);
      if (t > 8) { scene.remove(crack); geo.dispose(); crack.material.dispose(); return false; }
      return true;
    }
  });
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) if (!effects[i].update(dt)) effects.splice(i, 1);
}
