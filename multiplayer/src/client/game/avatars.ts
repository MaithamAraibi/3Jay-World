import * as THREE from 'three';
import type { PlayerSnap } from '../../shared/protocol';
import { MAX_HP } from '../../shared/protocol';
import { scene, camera, GLOBAL, makeCanvas, rand, R, lerp, _v1, _c1 } from '../engine/core';
import { groundH } from '../engine/pieces';
import { FXA, FXS, SH_GLOW, SH_STAR, SH_SMOKE, C } from '../engine/fx';
import { buildStaffModel, StaffModel } from './staff';

interface Avatar {
  id: number; root: THREE.Group; body: THREE.Group; staff: StaffModel; staffPivot: THREE.Group;
  tag: THREE.Sprite; tagCtx: CanvasRenderingContext2D; tagTex: THREE.CanvasTexture; tagKey: string;
  ice: THREE.Mesh; shield: THREE.Mesh; halo: THREE.Group; robeMat: THREE.MeshStandardMaterial; hatMat: THREE.MeshStandardMaterial;
  pos: THREE.Vector3; target: THREE.Vector3; yaw: number; tyaw: number; mv: number; walk: number;
  castSeq: number; cast: number; alive: boolean; deadT: number; tipWorld: THREE.Vector3; snap: PlayerSnap;
}
export const avatars = new Map<number, Avatar>();
const _qa = new THREE.Quaternion();

const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.7 });
const beardMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.95 });
const beltMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.6 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffb030, emissiveIntensity: 1.6, metalness: 1, roughness: 0.25 });
const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x2a6fa8, emissiveIntensity: 0.4, flatShading: true });
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });

function robeGeometry() {
  const pts: THREE.Vector2[] = [];
  const prof = [[0.0, 0.0], [0.46, 0.0], [0.42, 0.25], [0.34, 0.7], [0.27, 1.05], [0.25, 1.3], [0.3, 1.38], [0.2, 1.48], [0.0, 1.5]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.5) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + Math.sin(a * 7) * 0.05 * (1 - y * 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  g.computeVertexNormals(); return g;
}
function hatGeometry() {
  const brim = new THREE.CylinderGeometry(0.42, 0.44, 0.04, 24); brim.translate(0, 0, 0);
  const cone = new THREE.ConeGeometry(0.24, 0.75, 20, 8, true); cone.translate(0, 0.39, 0);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = Math.max(0, (y - 0.3) / 0.5); p.setZ(i, p.getZ(i) - t * t * 0.28); }
  cone.computeVertexNormals();
  return [brim, cone];
}
const ROBE = robeGeometry();
const [HAT_BRIM, HAT_CONE] = hatGeometry();

function drawTag(a: Avatar) {
  const s = a.snap, hp = Math.max(0, s.hp);
  const key = `${s.name}|${Math.round(hp)}|${s.sage}|${s.alive}|${s.color}`;
  if (key === a.tagKey) return; a.tagKey = key;
  const g = a.tagCtx, W = 256, H = 64; g.clearRect(0, 0, W, H);
  g.font = 'bold 24px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#000'; g.shadowBlur = 6;
  g.fillStyle = s.sage ? '#ffd36a' : '#' + new THREE.Color(s.color).getHexString();
  g.fillText((s.sage ? '✦ ' : '') + s.name + (s.sage ? ' ✦' : ''), W / 2, 20);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(48, 42, 160, 12);
  const f = hp / MAX_HP; g.fillStyle = f > 0.5 ? '#6dff8a' : f > 0.25 ? '#ffc94a' : '#ff5a6e'; g.fillRect(50, 44, 156 * f, 8);
  a.tagTex.needsUpdate = true;
}

function create(s: PlayerSnap): Avatar {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const robeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color).multiplyScalar(0.55), roughness: 0.85 });
  const hatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color).multiplyScalar(0.7), roughness: 0.8 });
  const robe = new THREE.Mesh(ROBE, robeMat); body.add(robe);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), beltMat); belt.rotation.x = Math.PI / 2; belt.position.y = 0.95; body.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin); head.position.y = 1.62; body.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 10), beardMat); beard.position.set(0, 1.42, -0.1); beard.rotation.x = Math.PI + 0.25; body.add(beard);
  const hat = new THREE.Group(); hat.position.y = 1.74; hat.add(new THREE.Mesh(HAT_BRIM, hatMat), new THREE.Mesh(HAT_CONE, hatMat)); body.add(hat);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), goldMat); band.rotation.x = Math.PI / 2; band.position.y = 1.79; body.add(band);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), robeMat); arm.position.set(0.3, 1.12, -0.12); arm.rotation.set(-0.9, 0, -0.3); body.add(arm);
  const staffPivot = new THREE.Group(); staffPivot.position.set(0.38, 1.0, -0.32); body.add(staffPivot);
  const staff = buildStaffModel(); staff.group.scale.setScalar(1.25); staffPivot.add(staff.group);
  body.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  staff.glow.castShadow = false;
  // golden halo for the Grand Sage
  const halo = new THREE.Group(); halo.position.y = 2.45; halo.visible = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), goldMat); ring.rotation.x = Math.PI / 2; halo.add(ring);
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), goldMat); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.34, 0.1, Math.sin(a) * 0.34); halo.add(sp); }
  root.add(halo);
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), iceMat); ice.scale.set(0.75, 1.25, 0.75); ice.position.y = 1.05; ice.visible = false; root.add(ice);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), shieldMat); shield.position.y = 1.0; shield.visible = false; root.add(shield);
  const cvs = makeCanvas(256, 64), tagTex = new THREE.CanvasTexture(cvs); tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthWrite: false, fog: false, transparent: true })); tag.scale.set(1.9, 0.48, 1); tag.position.y = 2.75; tag.renderOrder = 20; root.add(tag);
  scene.add(root);
  const pos = new THREE.Vector3(s.p[0], groundH(s.p[0], s.p[2]), s.p[2]);
  const a: Avatar = { id: s.id, root, body, staff, staffPivot, tag, tagCtx: cvs.getContext('2d'), tagTex, tagKey: '', ice, shield, halo, robeMat, hatMat, pos, target: pos.clone(), yaw: s.yaw, tyaw: s.yaw, mv: 0, walk: 0, castSeq: s.castSeq, cast: 0, alive: s.alive, deadT: 0, tipWorld: new THREE.Vector3(), snap: s };
  root.position.copy(pos);
  return a;
}

export function syncAvatars(players: PlayerSnap[], myId: number) {
  const seen = new Set<number>();
  for (const s of players) {
    if (s.id === myId) continue;
    seen.add(s.id);
    let a = avatars.get(s.id);
    if (!a) { a = create(s); avatars.set(s.id, a); }
    a.snap = s;
    a.target.set(s.p[0], s.p[1], s.p[2]);
    // big jumps (respawns) snap instead of sliding across the map
    if (a.target.distanceTo(a.pos) > 12) a.pos.copy(a.target);
    a.tyaw = s.yaw; a.mv = s.mv;
    if (s.castSeq !== a.castSeq) { a.castSeq = s.castSeq; a.cast = 1; }
    if (!s.alive && a.alive) { a.deadT = 0; deathBurst(a); }
    a.alive = s.alive;
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.root); avatars.delete(id); }
}
function deathBurst(a: Avatar) {
  const c = new THREE.Color(a.snap.color);
  for (let i = 0; i < 60; i++) FXA.emit({ x: a.pos.x, y: a.pos.y + 1, z: a.pos.z, vx: R(-4, 4), vy: R(1, 6), vz: R(-4, 4), life: R(0.6, 1.4), s0: R(0.1, 0.25), s1: 0.02, c0: c.clone().multiplyScalar(4), c1: c, shape: SH_STAR, drag: 1.5, spin: 4 });
  for (let i = 0; i < 12; i++) FXS.emit({ x: a.pos.x + R(-.5, .5), y: a.pos.y + 0.5, z: a.pos.z + R(-.5, .5), vx: R(-1, 1), vy: R(0.5, 2), vz: R(-1, 1), life: R(1.5, 2.5), s0: 0.6, s1: 2, c0: C(0x6a6a70), c1: C(0x9a9aa0), a: 0.45, shape: SH_SMOKE, fin: 0.1 });
}
export function updateAvatars(dt: number) {
  const t = GLOBAL.time.value;
  for (const a of avatars.values()) {
    const k = 1 - Math.exp(-dt * 12);
    a.pos.lerp(a.target, k);
    let dy = a.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * k;
    a.root.position.copy(a.pos);
    a.root.rotation.y = a.yaw;
    a.walk += dt * a.mv * 1.8;
    const s = a.snap;
    // death: topple over and fade into the grass
    if (!a.alive) { a.deadT += dt; a.body.rotation.x = Math.min(Math.PI / 2, a.deadT * 4) ; a.body.position.y = -Math.max(0, a.deadT - 1.5) * 0.6; a.tag.visible = false; a.root.visible = a.deadT < 3.5; }
    else { a.root.visible = true; a.tag.visible = true; a.body.rotation.x = Math.sin(a.walk * 2) * 0.03 * Math.min(1, a.mv / 5); a.body.position.y = Math.abs(Math.sin(a.walk)) * 0.05 * Math.min(1, a.mv / 5); a.body.rotation.z = Math.cos(a.walk) * 0.04 * Math.min(1, a.mv / 5); }
    a.cast = Math.max(0, a.cast - dt * 2.5);
    const sw = a.cast > 0 ? Math.sin((1 - a.cast) * Math.PI) : 0;
    a.staffPivot.rotation.set(-0.15 - sw * 1.1, 0, -0.12 + Math.sin(t * 1.2 + a.id) * 0.03);
    a.staff.crystal.getWorldPosition(a.tipWorld);
    const col = s.sage ? _c1.set(0xffd36a) : _c1.set(s.color);
    a.staff.crystalMat.emissive.copy(col); a.staff.crystalMat.emissiveIntensity = 2.2 + a.cast * 5;
    a.staff.glowMat.uniforms.uC.value.copy(col).multiplyScalar(1.4); a.staff.glowMat.uniforms.uK.value = 1 + a.cast * 2;
    a.staff.group.getWorldQuaternion(_qa); a.staff.glow.quaternion.copy(_qa.invert()).multiply(camera.quaternion);
    a.ice.visible = a.alive && s.frozen > 0; if (a.ice.visible) a.ice.rotation.y += dt * 0.2;
    a.shield.visible = a.alive && s.shield > 0; (a.shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 10);
    a.halo.visible = a.alive && s.sage;
    if (a.halo.visible) {
      a.halo.rotation.y += dt * 1.5; a.halo.position.y = 2.45 + Math.sin(t * 2) * 0.06;
      if (rand() < 0.5) FXA.emit({ x: a.pos.x + R(-0.5, 0.5), y: a.pos.y + R(0.2, 2.2), z: a.pos.z + R(-0.5, 0.5), vx: 0, vy: R(0.5, 1.2), vz: 0, life: R(0.8, 1.4), s0: R(0.05, 0.12), s1: 0.01, c0: C(0xffe08a, 4), c1: C(0xff9a30, 1), shape: SH_GLOW, fin: 0.2 });
    }
    drawTag(a);
  }
}
export function tipOf(id: number): THREE.Vector3 | null { const a = avatars.get(id); return a ? a.tipWorld : null; }
export function feetOf(id: number): THREE.Vector3 | null { const a = avatars.get(id); return a ? a.pos : null; }
export function clearAvatars() { for (const a of avatars.values()) scene.remove(a.root); avatars.clear(); }
