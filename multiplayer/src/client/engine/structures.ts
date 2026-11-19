import { ALTAR } from '../../shared/protocol';
import { reseed } from './core';
import type { Piece } from './pieces';
import * as THREE from 'three';
import { rand, R, lerp, fbm2, UP } from './core';
import { SITES, heightAt } from './world';
import { K_STONE, K_WOOD, K_ROOF, K_CLOTH, S_SLEEP, S_KINE, pieces, addPiece, finalizeStatic, kinematics } from './pieces';

/* =====================================================================
   9. STRUCTURES — tower, cottage, windmill, ruins (~1,600 modular pieces)
   ===================================================================== */
export const qYaw = (a) => new THREE.Quaternion().setFromAxisAngle(UP, a);
export const qEuler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
export function stoneCol(base = 1, hue = 0) { return new THREE.Color().setHSL(0.09 + hue + R(-0.02, 0.02), R(0.05, 0.14), 0.7 * base * R(0.82, 1.12)); }
export function woodCol(base = 1) { return new THREE.Color().setHSL(R(0.065, 0.085), R(0.35, 0.5), 0.42 * base * R(0.8, 1.15)); }
export let windmillRig = null;

export function buildTower(list) {
  const S = SITES.tower, y0 = S.h, cx = S.x, cz = S.z;
  const doorA = Math.atan2(22 - cz, 0 - cx); // faces the meadow
  const rings = 24, bh = 0.5, r = 3.05, n = 20, depth = 0.72;
  const winRings: [number, number, number[]][] = [[9, 11, [doorA + 1.2, doorA - 1.9]], [16, 18, [doorA, doorA + 2.6, doorA - 1.0]]];
  for (let k = 0; k < rings; k++) {
    const off = (k % 2) * Math.PI / n, y = y0 + bh * (k + 0.5) - 0.02;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + off;
      const da = Math.atan2(Math.sin(a - doorA), Math.cos(a - doorA));
      if (k < 5 && Math.abs(da) < 0.24) continue;
      let skip = false;
      for (const [k0, k1, angs] of winRings) if (k >= k0 && k <= k1) for (const wa of angs) { const d = Math.atan2(Math.sin(a - wa), Math.cos(a - wa)); if (Math.abs(d) < 0.16) skip = true; }
      if (skip) continue;
      const w = 2 * Math.PI * r / n - 0.035;
      list.push(addPiece(K_STONE, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, w, bh - 0.025, depth, qYaw(-a - Math.PI / 2), stoneCol(1.0)));
    }
  }
  // corbel ring and crenellations
  const yc = y0 + rings * bh;
  const nc = 22, rc = 3.3;
  for (let i = 0; i < nc; i++) {
    const a = i / nc * Math.PI * 2;
    list.push(addPiece(K_STONE, cx + Math.cos(a) * rc, yc + 0.28, cz + Math.sin(a) * rc, 2 * Math.PI * rc / nc - 0.03, 0.54, 0.95, qYaw(-a - Math.PI / 2), stoneCol(0.92)));
  }
  for (let i = 0; i < nc; i += 2) {
    const a = i / nc * Math.PI * 2;
    list.push(addPiece(K_STONE, cx + Math.cos(a) * 3.45, yc + 0.56 + 0.4, cz + Math.sin(a) * 3.45, 2 * Math.PI * 3.45 / nc - 0.05, 0.8, 0.6, qYaw(-a - Math.PI / 2), stoneCol(0.95)));
  }
  // wooden floor across the top
  for (let i = -6; i <= 6; i++) {
    const half = Math.sqrt(Math.max(0, 2.95 * 2.95 - (i * 0.45) ** 2));
    if (half < 0.5) continue;
    list.push(addPiece(K_WOOD, cx + i * 0.45, yc + 0.08, cz, 0.43, 0.14, half * 2, qYaw(0), woodCol(0.9)));
  }
  // shingled conical slate roof
  const roofRings = 7, baseR = 2.9, topY = yc + 4.4, baseY = yc + 0.62;
  for (let k = 0; k < roofRings; k++) {
    const t = k / roofRings, rr = baseR * (1 - t) + 0.25, y = lerp(baseY, topY, t) + 0.25;
    const cnt = Math.max(4, Math.round(2 * Math.PI * rr / 0.85));
    const slope = Math.atan2(topY - baseY, baseR);
    for (let i = 0; i < cnt; i++) {
      const a = i / cnt * Math.PI * 2 + k * 0.3;
      const q = qYaw(-a - Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -slope));
      list.push(addPiece(K_ROOF, cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, 2 * Math.PI * rr / cnt + 0.12, 0.12, 0.95, q, new THREE.Color().setHSL(0.62, R(0.12, 0.22), R(0.25, 0.33))));
    }
  }
  list.push(addPiece(K_ROOF, cx, topY + 0.35, cz, 0.6, 0.7, 0.6, qYaw(0.4), new THREE.Color(0x3c465c)));
  list.push(addPiece(K_WOOD, cx, topY + 1.3, cz, 0.09, 1.3, 0.09, qYaw(0), woodCol(0.6)));
}

export function buildCottage(list) {
  const S = SITES.cottage, y0 = S.h, cx = S.x, cz = S.z;
  const W = 8.2, D = 6.2; // x by z
  const yaw = 0.18; const qy = qYaw(yaw);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, y0 + ly, cz - lx * sn + lz * cs];
  const add = (kind, lx, ly, lz, sx, sy, sz, q, c) => { const [x, y, z] = P(lx, ly, lz); list.push(addPiece(kind, x, y, z, sx, sy, sz, q ? qy.clone().multiply(q) : qy, c)); };
  const rotY90 = qYaw(Math.PI / 2);
  // stone foundation, 2 courses
  for (let c = 0; c < 2; c++) {
    const y = 0.2 + c * 0.38, sh = c * 0.4;
    for (let x = -W / 2 + 0.4 + sh; x < W / 2 - 0.2; x += 0.82) { add(K_STONE, x, y, -D / 2, 0.78, 0.36, 0.5, null, stoneCol(0.95)); add(K_STONE, x, y, D / 2, 0.78, 0.36, 0.5, null, stoneCol(0.95)); }
    for (let z = -D / 2 + 0.75 + sh * 0.5; z < D / 2 - 0.4; z += 0.82) { add(K_STONE, -W / 2 + 0.05, y, z, 0.78, 0.36, 0.5, rotY90, stoneCol(0.95)); add(K_STONE, W / 2 - 0.05, y, z, 0.78, 0.36, 0.5, rotY90, stoneCol(0.95)); }
  }
  // log walls
  const lh = 0.3, wallY0 = 0.77, courses = 8;
  const doorX = 0.6, doorW = 1.3, winZ = [[-1.6, 1.2], [1.9, 1.2]];
  const seg = (z, x0, x1, y, alongX, gaps) => {
    // build a course from x0..x1 at z, skipping gaps [c,w]
    let cuts = [[x0, x1]];
    for (const [gc, gw] of gaps) {
      const nc = [];
      for (const [a, b] of cuts) { const g0 = gc - gw / 2, g1 = gc + gw / 2; if (g1 <= a || g0 >= b) nc.push([a, b]); else { if (g0 > a) nc.push([a, g0]); if (g1 < b) nc.push([g1, b]); } }
      cuts = nc;
    }
    for (const [a, b] of cuts) {
      const len = b - a; const nseg = Math.max(1, Math.round(len / 1.9)); const sl = len / nseg;
      for (let i = 0; i < nseg; i++) {
        const m = a + sl * (i + 0.5);
        if (alongX) add(K_WOOD, m, y, z, sl - 0.02, lh - 0.015, 0.24, null, woodCol());
        else add(K_WOOD, z, y, m, sl - 0.02, lh - 0.015, 0.24, rotY90, woodCol());
      }
    }
  };
  for (let c = 0; c < courses; c++) {
    const y = wallY0 + lh * (c + 0.5);
    const frontGaps = [], sideGaps = [];
    if (c < 7) frontGaps.push([doorX, doorW]);
    if (c >= 2 && c < 6) { frontGaps.push([-2.6, 1.1]); frontGaps.push([2.8, 1.1]); for (const g of winZ) sideGaps.push(g); }
    const ext = (c % 2) ? 0.12 : -0.12;
    seg(D / 2 - 0.1, -W / 2 + 0.1 + ext, W / 2 - 0.1 - ext, y, true, frontGaps);
    seg(-D / 2 + 0.1, -W / 2 + 0.1 + ext, W / 2 - 0.1 - ext, y, true, c >= 2 && c < 6 ? [[0, 1.4]] : []);
    seg(-W / 2 + 0.1, -D / 2 + 0.34 - ext, D / 2 - 0.34 + ext, y, false, sideGaps);
    seg(W / 2 - 0.1, -D / 2 + 0.34 - ext, D / 2 - 0.34 + ext, y, false, c >= 2 && c < 6 ? [[0, 1.3]] : []);
  }
  // lintels over openings
  const top = wallY0 + lh * courses;
  // door (vertical planks)
  for (let i = 0; i < 3; i++) add(K_WOOD, doorX - 0.42 + i * 0.42, wallY0 + 1.0, D / 2 - 0.02, 2.0, 0.4, 0.08, qEuler(0, 0, Math.PI / 2), woodCol(0.65));
  // gables on ±x ends (ridge along x)
  const ridgeH = 2.5, half = D / 2;
  for (let g = 0; g < 8; g++) {
    const y = top + lh * (g + 0.5); const w = (half - 0.25) * (1 - (g + 0.5) * lh / ridgeH) * 2;
    if (w < 0.35) break;
    for (const sx of [-1, 1]) {
      const nseg = w > 2.4 ? 2 : 1, sl = w / nseg;
      for (let i = 0; i < nseg; i++) add(K_WOOD, sx * (W / 2 - 0.1), y, -w / 2 + sl * (i + 0.5), sl - 0.02, lh - 0.015, 0.24, rotY90, woodCol(0.95));
    }
  }
  // beams: ridge + purlins
  for (const [lz, ly] of [[0, ridgeH - 0.05], [-1.55, ridgeH * 0.5 - 0.02], [1.55, ridgeH * 0.5 - 0.02]]) {
    for (let i = 0; i < 2; i++) add(K_WOOD, -W / 4 + i * W / 2, top + ly, lz, W / 2 + 0.35, 0.2, 0.2, null, woodCol(0.7));
  }
  // red tiled roof
  const slope = Math.atan2(ridgeH, half), slopeLen = Math.hypot(ridgeH, half) + 0.6;
  const rows = 8, rowL = slopeLen / rows, cols = 12, colW = (W + 1.2) / cols;
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows; const along = -0.6 + t * slopeLen;
      const lz = side * (half - Math.cos(slope) * along), ly = top + Math.sin(slope) * along + 0.18;
      for (let c = 0; c < cols; c++) {
        const lx = -W / 2 - 0.6 + colW * (c + 0.5) + (r % 2 ? colW * 0.25 : -colW * 0.25) * 0;
        add(K_ROOF, lx, ly, lz, colW - 0.04, 0.09, rowL + 0.1, qEuler(side * slope, 0, 0), new THREE.Color().setHSL(R(0.0, 0.025), R(0.55, 0.7), R(0.34, 0.44)));
      }
    }
  }
  // stone chimney
  for (let i = 0; i < 13; i++) {
    const y = 0.3 + i * 0.44, lx = W / 2 - 1.3, lz = -1.2;
    add(K_STONE, lx - 0.22, y, lz, 0.42, 0.42, 0.85, (i % 2) ? rotY90 : null, stoneCol(0.85));
    add(K_STONE, lx + 0.22, y, lz, 0.42, 0.42, 0.85, (i % 2) ? rotY90 : null, stoneCol(0.85));
    if (y > top + ridgeH + 0.8) break;
  }
}

export function buildWindmill(list) {
  const S = SITES.windmill, y0 = S.h, cx = S.x, cz = S.z;
  const face = Math.atan2(22 - cz, 0 - cx);
  const rings = 12, bh = 0.55;
  for (let k = 0; k < rings; k++) {
    const t = k / rings, r = lerp(2.75, 2.05, t), n = Math.round(lerp(18, 14, t));
    const off = (k % 2) * Math.PI / n, y = y0 + bh * (k + 0.5) - 0.02;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + off;
      const da = Math.atan2(Math.sin(a - face), Math.cos(a - face));
      if (k < 4 && Math.abs(da) < 0.26) continue;
      list.push(addPiece(K_STONE, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 2 * Math.PI * r / n - 0.04, bh - 0.025, 0.62, qYaw(-a - Math.PI / 2), stoneCol(1.08, 0.01)));
    }
  }
  // wooden cap house
  const yb = y0 + rings * bh, cw = 3.6, ch = 0.32, cc = 6;
  const q = qYaw(-face), cs = Math.cos(-face), sn = Math.sin(-face);
  const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, yb + ly, cz - lx * sn + lz * cs];
  const add = (kind, lx, ly, lz, sx, sy, sz, qq, c) => { const [x, y, z] = P(lx, ly, lz); const p = addPiece(kind, x, y, z, sx, sy, sz, qq ? q.clone().multiply(qq) : q, c); list.push(p); return p; };
  for (let i = -3; i <= 3; i++) add(K_WOOD, i * 0.5, 0.08, 0, 0.48, 0.14, cw + 0.3, null, woodCol(0.8));
  const r90 = qYaw(Math.PI / 2);
  for (let c = 0; c < cc; c++) {
    const y = 0.15 + ch * (c + 0.5);
    for (const s of [-1, 1]) {
      add(K_WOOD, -cw / 4, y, s * cw / 2, cw / 2 - 0.02, ch - 0.015, 0.2, null, woodCol(0.85));
      add(K_WOOD, cw / 4, y, s * cw / 2, cw / 2 - 0.02, ch - 0.015, 0.2, null, woodCol(0.85));
      add(K_WOOD, s * cw / 2, y, -cw / 4 + 0.1, cw / 2 - 0.25, ch - 0.015, 0.2, r90, woodCol(0.85));
      add(K_WOOD, s * cw / 2, y, cw / 4 - 0.1, cw / 2 - 0.25, ch - 0.015, 0.2, r90, woodCol(0.85));
    }
  }
  const capTop = 0.15 + ch * cc;
  const sl = 0.62, rows = 5, rl = (cw / 2 + 0.4) / Math.cos(sl) / rows;
  for (const side of [-1, 1]) for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
    const along = (r + 0.5) * rl;
    add(K_ROOF, -cw / 2 - 0.3 + (cw + 0.6) / 5 * (c + 0.5), capTop + 0.12 + Math.sin(sl) * along - 0.05, side * (cw / 2 + 0.4 - Math.cos(sl) * along), (cw + 0.6) / 5 - 0.04, 0.09, rl + 0.08, qEuler(side * sl, 0, 0), new THREE.Color().setHSL(0.07, 0.35, R(0.2, 0.27)));
  }
  // hub axle sticking out toward the meadow (local +x)
  const hub = add(K_WOOD, cw / 2 + 0.55, capTop * 0.55, 0, 1.3, 0.45, 0.45, null, woodCol(0.6));
  // sails: kinematic until their hub is destroyed
  const sails = [];
  const hubLocal = new THREE.Vector3(cw / 2 + 1.25, capTop * 0.55, 0);
  for (let i = 0; i < 4; i++) {
    const spar = addPiece(K_WOOD, 0, 0, 0, 0.16, 6.4, 0.16, null, woodCol(0.55));
    const sail = addPiece(K_CLOTH, 0, 0, 0, 1.25, 4.6, 0.05, null, new THREE.Color(0xf2e8d2).multiplyScalar(R(0.85, 1)));
    for (const [p, off] of [[spar, 0], [sail, 0.75]] as [Piece, number][]) {
      if (!p) continue;
      p.state = S_KINE; kinematics.push(p); p.kIdx = i; p.kOff = off;
      p.supporters.push(hub); hub.dependents.push(p);
      p.kineVel = new THREE.Vector3(); p.kineW = new THREE.Vector3();
      sails.push(p);
    }
  }
  windmillRig = { cx, cz, P, q, hubLocal, sails, angle: 0, speed: 0.55, face };
}
export function updateWindmill(dt) {
  if (!windmillRig) return;
  const W = windmillRig; W.angle += W.speed * dt;
  const [hx, hy, hz] = W.P(W.hubLocal.x, W.hubLocal.y, W.hubLocal.z);
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(W.q);
  for (const p of W.sails) {
    if (p.state !== S_KINE) continue;
    const a = W.angle + p.kIdx * Math.PI / 2;
    const rot = new THREE.Quaternion().setFromAxisAngle(axis, a).multiply(W.q).multiply(qYaw(Math.PI / 2));
    // local up of the blade
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rot);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rot);
    const dist = 3.45;
    p.x = hx + up.x * dist + side.x * p.kOff + axis.x * 0.12; p.y = hy + up.y * dist + side.y * p.kOff + axis.y * 0.12; p.z = hz + up.z * dist + side.z * p.kOff + axis.z * 0.12;
    p.qx = rot.x; p.qy = rot.y; p.qz = rot.z; p.qw = rot.w;
    // velocity if released now
    p.kineW.copy(axis).multiplyScalar(W.speed);
    p.kineVel.crossVectors(p.kineW, new THREE.Vector3(p.x - hx, p.y - hy, p.z - hz));
    p.writeMatrix();
  }
}

export function buildRuins(list) {
  const S = SITES.ruins, y0 = S.h;
  const oldStone = () => stoneCol(0.85, 0.03);
  const wall = (x0, z0, ang, len, maxC, seed) => {
    const bw = 0.95, bh = 0.48, n = Math.floor(len / bw);
    const ca = Math.cos(ang), sa = Math.sin(ang), q = qYaw(ang);
    for (let i = 0; i < n; i++) {
      const prof = Math.max(1, Math.round(maxC * (0.35 + 0.65 * fbm2(i * 0.35 + seed, seed, 2)) - Math.abs(i - n / 2) * 0.2 * (rand() < 0.5 ? 1 : 0)));
      for (let c = 0; c < prof; c++) {
        const off = (c % 2) * bw * 0.5;
        if (i === n - 1 && off) continue;
        const along = (i + 0.5) * bw + off;
        for (const row of [-0.33, 0.33]) {
          if (c === prof - 1 && rand() < 0.3) continue;
          const x = x0 + ca * along - sa * row, z = z0 - sa * along - ca * row;
          // note: yaw -ang so local x maps to (cos ang, -sin ang)
          list.push(addPiece(K_STONE, x, y0 + bh * (c + 0.5) - 0.02, z, bw - 0.03, bh - 0.025, 0.64, q, oldStone()));
        }
      }
    }
  };
  wall(S.x - 9, S.z - 6, 0.05, 12, 9, 3.1);
  wall(S.x - 9.2, S.z - 5.6, -Math.PI / 2 + 0.05, 8, 7, 8.2);
  // arch
  {
    const ax = S.x + 4, az = S.z - 4, q = qYaw(0.5), ca = Math.cos(0.5), sa = Math.sin(0.5);
    const span = 3.2, ph = 6, dh = 0.55;
    for (const s of [-1, 1]) for (let i = 0; i < ph; i++) {
      const lx = s * (span / 2 + 0.45);
      list.push(addPiece(K_STONE, ax + ca * lx, y0 + dh * (i + 0.5) - 0.02, az - sa * lx, 0.9, dh - 0.025, 0.9, q, oldStone()));
    }
    const ny = 11, rA = span / 2 + 0.45, yb = y0 + ph * dh;
    for (let i = 0; i < ny; i++) {
      const t = (i + 0.5) / ny * Math.PI, lx = -Math.cos(t) * rA, ly = Math.sin(t) * rA;
      const qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), t - Math.PI / 2));
      list.push(addPiece(K_STONE, ax + ca * lx, yb + ly, az - sa * lx, 0.9, 0.5, 0.9, qq, oldStone()));
    }
    for (let i = -2; i <= 2; i++) list.push(addPiece(K_STONE, ax + ca * i * 0.9, yb + rA + 0.55, az - sa * i * 0.9, 0.88, 0.5, 0.9, q, oldStone()));
  }
  // colonnade of broken pillars
  for (let c = 0; c < 6; c++) {
    const px = S.x - 5 + c * 2.6, pz = S.z + 5.5 + Math.sin(c) * 0.4;
    const hgt = [7, 3, 6, 2, 8, 4][c];
    list.push(addPiece(K_STONE, px, y0 + 0.2, pz, 1.15, 0.4, 1.15, qYaw(c * 0.2), oldStone()));
    for (let i = 0; i < hgt; i++) list.push(addPiece(K_STONE, px, y0 + 0.4 + 0.6 * (i + 0.5) - 0.02, pz, 0.72, 0.58, 0.72, qYaw(c * 0.7 + i * 0.4), oldStone()));
    if (hgt > 5) list.push(addPiece(K_STONE, px, y0 + 0.4 + 0.6 * hgt + 0.18, pz, 1.1, 0.36, 1.1, qYaw(c), oldStone()));
  }
  // lintel slabs on two tall pillars
  // foundation outline
  for (let i = 0; i < 14; i++) list.push(addPiece(K_STONE, S.x - 6 + i * 1.0, y0 + 0.15, S.z + 1.2, 0.95, 0.3, 0.9, qYaw(R(-0.05, 0.05)), oldStone()));
  for (let i = 0; i < 9; i++) list.push(addPiece(K_STONE, S.x + 7.5, y0 + 0.15, S.z - 8 + i * 1.0, 0.9, 0.3, 0.95, qYaw(R(-0.05, 0.05)), oldStone()));
  // scattered fallen blocks
  for (let i = 0; i < 26; i++) {
    const a = R(0, 6.28), d = R(2, 12), x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
    if (Math.hypot(x - ALTAR.x, z - ALTAR.z) < 4.6) continue;
    const sx = R(0.6, 1.0), sy = R(0.35, 0.55), sz = R(0.5, 0.8);
    const q = qEuler(R(-0.15, 0.15), R(0, 6.28), R(-0.15, 0.15));
    list.push(addPiece(K_STONE, x, heightAt(x, z) + sy / 2 - 0.08, z, sx, sy, sz, q, oldStone()));
  }
}

export function buildWorld() {
  reseed(777);
  const list = [];
  buildTower(list); buildCottage(list); buildRuins(list); buildWindmill(list);
  const statics = list.filter(p => p && p.state === S_SLEEP);
  finalizeStatic(statics);
  const orphans = statics.filter(p => !p.supporters.length && !p.grounded).length;
  if (orphans) console.log('[Arcanum] unsupported at build:', orphans);
  updateWindmill(0);
  reseed((Math.random() * 1e9) | 0);
  return statics.length + kinematics.length;
}
