import * as THREE from 'three';
import { camera, GLOBAL, clamp, lerp, noise2, _v1, _v2, _v3, _v4 } from '../engine/core';
import { groundNormal, treeColliders } from '../engine/world';
import { S_SLEEP, S_ACTIVE, groundH, queryStatic, activeList, rayPieces } from '../engine/pieces';
import { SFX } from '../engine/fx';
import { aim, aimRune, aimRune2, GR } from '../engine/spells';
import { SPELL_FISSURE } from '../../shared/protocol';
import { G } from './state';

export const keys: Record<string, boolean> = {};
export const player = { pos: new THREE.Vector3(0, 0, 24), vel: new THREE.Vector3(), yaw: 0.05, pitch: -0.06, onGround: true, radius: 0.36, eye: 1.68, bob: 0, bobK: 0, lastStep: 0, dip: 0, dipV: 0, airControl: 0, deathTilt: 0 };
player.pos.y = groundH(0, 24);

addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space' && G.inMatch) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.look.dragging = false; });

export function teleport(x: number, z: number) {
  player.pos.set(x, groundH(x, z), z); player.vel.set(0, 0, 0);
  // face the meadow centre
  player.yaw = Math.atan2(x - 0, z - 4); player.pitch = -0.05; player.deathTilt = 0;
}
/** Knockback, pulls and lifts arrive from the server as velocity changes. */
export function applyPush(v: [number, number, number]) {
  player.vel.x += v[0]; player.vel.y += v[1]; player.vel.z += v[2];
  if (v[1] > 1.5) player.onGround = false;
  player.airControl = Math.min(1.2, player.airControl + Math.hypot(v[0], v[2]) * 0.05);
}

function closestOnOBB(p, x: number, y: number, z: number, out: THREE.Vector3) {
  const a = p.ax, dx = x - p.x, dy = y - p.y, dz = z - p.z;
  const l0 = clamp(dx * a[0] + dy * a[1] + dz * a[2], -p.hx, p.hx), l1 = clamp(dx * a[3] + dy * a[4] + dz * a[5], -p.hy, p.hy), l2 = clamp(dx * a[6] + dy * a[7] + dz * a[8], -p.hz, p.hz);
  return out.set(p.x + a[0] * l0 + a[3] * l1 + a[6] * l2, p.y + a[1] * l0 + a[4] * l1 + a[7] * l2, p.z + a[2] * l0 + a[5] * l1 + a[8] * l2);
}

export function updatePlayer(dt: number, controls: boolean) {
  const canMove = controls && G.alive && G.frozen <= 0;
  const f = canMove ? (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) : 0, s = canMove ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0;
  const run = keys.ShiftLeft || keys.ShiftRight;
  const sp = run ? 9.5 : 5.2;
  const fw = _v1.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), rt = _v2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const wish = _v3.set(0, 0, 0).addScaledVector(fw, f).addScaledVector(rt, s);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(sp);
  // after a knockback, control returns gradually so the hit actually carries you
  player.airControl = Math.max(0, player.airControl - dt * 1.5);
  const acc = (player.onGround ? 11 : 2.2) / (1 + player.airControl * 4), k = 1 - Math.exp(-acc * dt);
  player.vel.x += (wish.x - player.vel.x) * k; player.vel.z += (wish.z - player.vel.z) * k;
  player.vel.y -= 24 * dt;
  if (canMove && keys.Space && player.onGround) { player.vel.y = 8.2; player.onGround = false; }
  player.pos.addScaledVector(player.vel, dt);
  const P = player.pos, r = player.radius;
  let floor = groundH(P.x, P.z);
  const near = [];
  queryStatic(P.x - 1.5, P.y - 0.5, P.z - 1.5, P.x + 1.5, P.y + 2.2, P.z + 1.5, (q) => { if (q.state === S_SLEEP) near.push(q); });
  for (const q of activeList) if (q.state === S_ACTIVE && Math.abs(q.x - P.x) < 2.5 && Math.abs(q.z - P.z) < 2.5 && Math.abs(q.y - P.y - 1) < 3) near.push(q);
  for (const q of near) {
    closestOnOBB(q, P.x, P.y + 0.55, P.z, _v4);
    if (_v4.y < P.y + 0.55 - 0.01 && Math.hypot(_v4.x - P.x, _v4.z - P.z) < 0.22) floor = Math.max(floor, _v4.y);
    const sy = clamp(q.y, P.y + 0.6, P.y + 1.7);
    closestOnOBB(q, P.x, sy, P.z, _v4);
    const dx = P.x - _v4.x, dz = P.z - _v4.z, d = Math.hypot(dx, dz);
    if (d < r && Math.abs(_v4.y - sy) < 0.02) {
      if (d > 1e-4) { P.x += dx / d * (r - d); P.z += dz / d * (r - d); } else P.x += r;
      if (q.state === S_ACTIVE) { q.vx -= dx * 0.3; q.vz -= dz * 0.3; }
    }
  }
  for (const c of treeColliders) {
    const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), rr = c.r + r;
    if (d < rr && d > 1e-4) { P.x += dx / d * (rr - d); P.z += dz / d * (rr - d); }
  }
  const dR = Math.hypot(P.x, P.z + 6); if (dR > 150) { P.x *= 150 / dR; P.z = (P.z + 6) * 150 / dR - 6; }
  const wasGround = player.onGround;
  if (P.y <= floor) {
    if (!wasGround && player.vel.y < -4) { player.dipV -= Math.min(0.6, -player.vel.y * 0.035) * 6; SFX.step(true); }
    P.y = floor; player.vel.y = Math.max(0, player.vel.y); player.onGround = true;
  } else player.onGround = P.y - floor < 0.05;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  player.bobK = lerp(player.bobK, player.onGround && canMove ? clamp(hs / 6, 0, 1.4) : 0, 1 - Math.exp(-dt * 8));
  player.bob += dt * hs * 1.75;
  const stepIdx = Math.floor(player.bob / Math.PI);
  if (stepIdx !== player.lastStep && player.onGround && hs > 1 && canMove) { player.lastStep = stepIdx; SFX.step(run); }
  player.dipV += (-player.dip * 90 - player.dipV * 14) * dt; player.dip += player.dipV * dt;
  player.deathTilt = lerp(player.deathTilt, G.alive ? 0 : 1, 1 - Math.exp(-dt * 3));
}
export function updateCamera(dt: number) {
  const b = player.bob, k = player.bobK;
  const shake = GR.shake; GR.shake *= Math.exp(-dt * 3.2);
  const t = GLOBAL.time.value;
  const sx = (noise2(t * 18, 1.3) - 0.5) * shake * 0.22, sy = (noise2(t * 18, 7.1) - 0.5) * shake * 0.22;
  const eye = player.eye * (1 - player.deathTilt * 0.75);
  camera.position.set(player.pos.x + Math.cos(b) * 0.035 * k + sx, player.pos.y + eye + Math.abs(Math.sin(b)) * 0.06 * k - 0.03 * k + player.dip + sy, player.pos.z);
  camera.rotation.set(player.pitch + Math.sin(b * 2) * 0.004 * k + sy * 0.12, player.yaw + sx * 0.1, Math.cos(b) * 0.006 * k + (noise2(t * 14, 4.4) - 0.5) * shake * 0.03 + player.deathTilt * 0.5);
  camera.updateMatrixWorld();
}
const ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
export function updateAim() {
  ray.o.copy(camera.position); camera.getWorldDirection(ray.d);
  let best = 140; const n = new THREE.Vector3(0, 1, 0);
  let prev = 0;
  for (let t = 0.5; t < 140; t += t < 20 ? 0.35 : 0.9) {
    const y = ray.o.y + ray.d.y * t, g = groundH(ray.o.x + ray.d.x * t, ray.o.z + ray.d.z * t);
    if (y < g) { let a = prev, b2 = t; for (let i = 0; i < 12; i++) { const m = (a + b2) / 2; if (ray.o.y + ray.d.y * m < groundH(ray.o.x + ray.d.x * m, ray.o.z + ray.d.z * m)) b2 = m; else a = m; } best = b2; groundNormal(ray.o.x + ray.d.x * best, ray.o.z + ray.d.z * best, n); break; }
    prev = t;
  }
  const hp = rayPieces(ray.o, ray.d, best);
  if (hp) { best = hp.t; n.copy(hp.normal); }
  let valid = best < 140;
  if (!valid) best = 60;
  aim.point.copy(ray.o).addScaledVector(ray.d, best); aim.normal.copy(n);
  if (!valid) { aim.point.y = groundH(aim.point.x, aim.point.z); aim.normal.set(0, 1, 0); }
  aim.valid = true;
  const t = GLOBAL.time.value;
  const ready = G.alive && G.frozen <= 0 && (G.cooldowns[G.curSpell] <= 0 || (G.curSpell === SPELL_FISSURE && G.sage));
  const sz = clamp(best * 0.05, 1.2, 3.5) * (ready ? 1 : 0.8);
  for (const [m, sc, spd] of [[aimRune, 1, 0.6], [aimRune2, 0.55, -1.4]] as [THREE.Mesh, number, number][]) {
    m.visible = G.alive;
    m.position.copy(aim.point).addScaledVector(n, 0.05 + (sc < 1 ? 0.02 : 0));
    m.quaternion.setFromUnitVectors(_v1.set(0, 0, 1), n); m.rotateZ(t * spd);
    m.scale.setScalar(sz * sc * (1 + Math.sin(t * 4) * 0.04));
    (m.material as THREE.MeshBasicMaterial).opacity = (ready ? 0.85 : 0.3) * (0.85 + Math.sin(t * 6) * 0.15);
  }
}
