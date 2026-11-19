import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPELLS, SPELL_FISSURE } from '../../shared/protocol';
import { camera, GLOBAL, genWood, noise2, rand, R, clamp, lerp, smooth, _v1, _c1 } from '../engine/core';
import { FXA, SH_GLOW } from '../engine/fx';
import { randDir } from '../engine/spells';
import { G } from './state';

export interface StaffModel { group: THREE.Group; crystal: THREE.Mesh; glow: THREE.Mesh; glowMat: THREE.ShaderMaterial; crystalMat: THREE.MeshStandardMaterial; sleeve?: THREE.Mesh }

const wt = genWood(); wt.col.repeat.set(1, 6); wt.bump.repeat.set(1, 6);
const woodMat = new THREE.MeshStandardMaterial({ map: wt.col, bumpMap: wt.bump, bumpScale: 1.5, roughness: 0.5, color: 0x8a6a50 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0xc8a060, metalness: 1, roughness: 0.32 });
let shaftGeo: THREE.BufferGeometry | null = null;

/** Builds the carved staff used both in first person and by the other wizards' avatars. */
export function buildStaffModel(): StaffModel {
  const G0 = new THREE.Group();
  if (!shaftGeo) {
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(Math.sin(t * 5) * 0.012, -0.8 + t * 1.68, Math.cos(t * 4) * 0.01)); }
    const sg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.021, 10, false);
    const p = sg.attributes.position, n = sg.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), ang = Math.atan2(n.getZ(i), n.getX(i));
      const k = 1 + 0.12 * Math.sin(ang * 3 + y * 9) + 0.1 * noise2(y * 14, ang * 2) + (y > 0.72 ? (y - 0.72) * 1.4 : 0);
      p.setXYZ(i, p.getX(i) + n.getX(i) * 0.021 * (k - 1), p.getY(i), p.getZ(i) + n.getZ(i) * 0.021 * (k - 1));
    }
    sg.computeVertexNormals(); shaftGeo = sg;
  }
  G0.add(new THREE.Mesh(shaftGeo, woodMat));
  for (const y of [0.62, 0.7, 0.2, -0.3]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 24), metalMat); r.rotation.x = Math.PI / 2; r.position.y = y; G0.add(r); }
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.84, 0), new THREE.Vector3(Math.cos(a) * 0.055, 0.9, Math.sin(a) * 0.055), new THREE.Vector3(Math.cos(a) * 0.065, 1.0, Math.sin(a) * 0.065), new THREE.Vector3(Math.cos(a + 0.6) * 0.03, 1.08, Math.sin(a + 0.6) * 0.03)]);
    G0.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.009, 6, false), woodMat));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), metalMat); tip.position.copy(c.getPoint(1)); G0.add(tip);
  }
  const cg = new THREE.OctahedronGeometry(0.05, 0); cg.scale(0.8, 1.6, 0.8);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff6a1a, emissiveIntensity: 2.5, roughness: 0.1, metalness: 0.2, flatShading: true });
  const crystal = new THREE.Mesh(cg, crystalMat); crystal.position.y = 0.97; G0.add(crystal);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uC: { value: new THREE.Color(1, 0.5, 0.2) }, uK: { value: 1 } },
    vertexShader: `varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vU; uniform vec3 uC; uniform float uK; void main(){ float r = length(vU); float a = exp(-r*r*9.0)*0.9 + exp(-r*3.5)*0.25; gl_FragColor = vec4(uC*a*uK, 1.0); }`,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glowMat); glow.position.y = 0.97; G0.add(glow);
  return { group: G0, crystal, glow, glowMat, crystalMat };
}

// ---------- first-person staff in the player's hand
export const staff = { model: buildStaffModel(), cast: 0, flare: 0, tipWorld: new THREE.Vector3(), lagX: 0, lagY: 0, light: new THREE.PointLight(0xff6a1a, 2, 6, 2) };
{
  const GR = staff.model.group;
  staff.light.position.y = 1.0; GR.add(staff.light);
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.62 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2b2f5a, roughness: 0.85, side: THREE.DoubleSide });
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.1, 0.06, 2, 0.02), leather); palm.position.set(0.035, 0, 0.012); GR.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0115, 6, 12, Math.PI * 1.25), leather); f.rotation.x = Math.PI / 2; f.rotation.z = -0.5; f.position.set(0, 0.035 - i * 0.024, 0); GR.add(f); }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.045, 4, 8), leather); thumb.position.set(-0.012, 0.055, 0.03); thumb.rotation.set(-0.4, 0, 0.6); GR.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.06, 14), leather); cuff.position.set(0.09, -0.05, 0.03); cuff.rotation.z = 1.1; GR.add(cuff);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.55, 16, 1, true), cloth); sleeve.position.set(0.31, -0.17, 0.08); sleeve.rotation.z = 1.15; GR.add(sleeve);
  staff.model.sleeve = sleeve;
  GR.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  GR.position.set(0.42, -0.6, -0.8);
  camera.add(GR);
}

export function setSleeveColor(c: number) { if (staff.model.sleeve) (staff.model.sleeve.material as THREE.MeshStandardMaterial).color.set(c).multiplyScalar(0.45); }

const GOLD = new THREE.Color(0xffd36a);
export function updateStaff(dt: number, moveK: number, bobPhase: number) {
  const GR = staff.model.group;
  const ult = G.curSpell === SPELL_FISSURE;
  const col = new THREE.Color(SPELLS[G.curSpell].color);
  if (G.sage && !ult) col.lerp(GOLD, 0.35 + 0.25 * Math.sin(GLOBAL.time.value * 3));
  staff.cast = Math.max(0, staff.cast - dt * 2.4); staff.flare = Math.max(0, staff.flare - dt * 3);
  const p = 1 - staff.cast;
  const strike = staff.cast > 0 ? (p < 0.22 ? 1 - Math.pow(1 - p / 0.22, 3) : 1 - smooth(0.22, 1, p)) : 0;
  const t = GLOBAL.time.value, look = G.look;
  staff.lagX = lerp(staff.lagX, clamp(-look.dyaw * 0.9, -0.12, 0.12), 1 - Math.exp(-dt * 8));
  staff.lagY = lerp(staff.lagY, clamp(look.dpitch * 0.9, -0.1, 0.1), 1 - Math.exp(-dt * 8));
  look.dyaw *= Math.exp(-dt * 12); look.dpitch *= Math.exp(-dt * 12);
  const bx = Math.cos(bobPhase) * 0.018 * moveK, by = Math.abs(Math.sin(bobPhase)) * 0.022 * moveK;
  const down = G.alive ? 0 : 0.6;
  GR.position.set(0.42 + bx + staff.lagX + Math.sin(t * 0.9) * 0.004 - strike * 0.14, -0.6 - by + staff.lagY + Math.sin(t * 1.3) * 0.006 + strike * 0.12 - down, -0.8 - strike * 0.3);
  GR.rotation.set(-0.2 - strike * 0.65 + Math.sin(t * 0.7) * 0.01, 0.1 + strike * 0.25, 0.13 + Math.sin(bobPhase) * 0.02 * moveK - strike * 0.25);
  const M = staff.model;
  M.crystalMat.emissive.copy(col); M.crystalMat.emissiveIntensity = 2.2 + Math.sin(t * 4) * 0.4 + staff.flare * 6 + (ult ? 2 : 0);
  M.crystal.rotation.y += dt * (ult ? 5 : 1.6);
  const rdy = (G.cooldowns[G.curSpell] <= 0 || ult) && G.frozen <= 0 ? 1 : 0.45;
  M.glowMat.uniforms.uC.value.copy(col).multiplyScalar(1.4); M.glowMat.uniforms.uK.value = (0.8 + staff.flare * 2.5 + Math.sin(t * 5) * 0.1 + (ult ? 0.8 : 0)) * rdy;
  M.glow.quaternion.copy(GR.quaternion).invert();
  staff.light.color.copy(col); staff.light.intensity = (1.6 + staff.flare * 6) * rdy;
  M.crystal.getWorldPosition(staff.tipWorld);
  if (rand() < (ult ? 1 : 0.5)) { randDir(_v1); FXA.emit({ x: staff.tipWorld.x + _v1.x * 0.05, y: staff.tipWorld.y + _v1.y * 0.05, z: staff.tipWorld.z + _v1.z * 0.05, vx: _v1.x * 0.1, vy: 0.12, vz: _v1.z * 0.1, life: R(0.4, 0.8), s0: 0.012, s1: 0.002, c0: _c1.copy(col).multiplyScalar(4), shape: SH_GLOW, fin: 0.2 }); }
}
