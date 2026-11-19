import * as THREE from 'three';
import { ALTAR, TUNE } from '../../shared/protocol';
import { scene, GLOBAL, rand, R, makeCanvas } from '../engine/core';
import { stoneTex } from '../engine/pieces';
import { groundH } from '../engine/pieces';
import { FXA, SH_GLOW, SH_STAR, C, SFX } from '../engine/fx';
import { G } from './state';

/** The Sage Relic: an altar in the ruins where wizards claim the Grand Sage title. */
const gy = groundH(ALTAR.x, ALTAR.z);
const root = new THREE.Group(); root.position.set(ALTAR.x, gy, ALTAR.z); scene.add(root);
const stone = new THREE.MeshStandardMaterial({ map: stoneTex.col, bumpMap: stoneTex.bump, bumpScale: 3, roughness: 0.85, color: 0xb8b0a0 });
const gold = new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffa020, emissiveIntensity: 0.6, metalness: 1, roughness: 0.3 });
// stepped pedestal
const tiers: [number, number, number][] = [[2.2, 0.25, 0.12], [1.5, 0.3, 0.4], [0.7, 0.8, 0.95], [1.0, 0.18, 1.44]];
for (const [w, h, y] of tiers) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.55, h, 8), stone); m.position.y = y; m.castShadow = m.receiveShadow = true; root.add(m);
}
for (let i = 0; i < 4; i++) {
  const a = i / 4 * Math.PI * 2 + Math.PI / 4;
  const pil = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), stone); pil.position.set(Math.cos(a) * 2.6, 1.2, Math.sin(a) * 2.6); pil.rotation.y = a; pil.castShadow = pil.receiveShadow = true; root.add(pil);
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), gold); cap.position.set(Math.cos(a) * 2.6, 2.55, Math.sin(a) * 2.6); root.add(cap);
}
// the relic itself
const relic = new THREE.Group(); relic.position.y = 2.5; root.add(relic);
const gemMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffc040, emissiveIntensity: 3, roughness: 0.05, metalness: 0.3, flatShading: true });
const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), gemMat); gem.scale.set(0.8, 1.5, 0.8); relic.add(gem);
const rings: THREE.Mesh[] = [];
for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.14, 0.018, 6, 48), gold); rings.push(r); relic.add(r); }
const light = new THREE.PointLight(0xffc860, 40, 14, 2); light.position.y = 2.6; root.add(light);
// sky beam so everyone can find the relic
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uTime: GLOBAL.time, uK: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uK; void main(){
    float a = (1.0 - vUv.y) * (0.5 + 0.5*sin(vUv.y*40.0 - uTime*3.0)) * 0.6 + (1.0 - vUv.y)*0.4;
    float edge = sin(vUv.x * 3.14159);
    gl_FragColor = vec4(vec3(1.0, 0.8, 0.4) * a * edge * uK * 0.5, 1.0); }`,
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 80, 16, 1, true), beamMat); beam.position.y = 42; root.add(beam);
// capture ring on the ground with a progress arc
const ringCvs = makeCanvas(256, 256), ringCtx = ringCvs.getContext('2d'), ringTex = new THREE.CanvasTexture(ringCvs);
const capRing = new THREE.Mesh(new THREE.PlaneGeometry(TUNE.relic.radius * 2.2, TUNE.relic.radius * 2.2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }));
capRing.rotation.x = -Math.PI / 2; capRing.position.y = 0.3; capRing.renderOrder = 8; root.add(capRing);
let ringKey = '';
function drawRing(progress: number, color: string, contested: boolean) {
  const key = `${progress.toFixed(2)}|${color}|${contested}`; if (key === ringKey) return; ringKey = key;
  const g = ringCtx, S = 256; g.clearRect(0, 0, S, S);
  const r = S / 2 * (TUNE.relic.radius / (TUNE.relic.radius * 1.1));
  g.lineWidth = 6; g.strokeStyle = contested ? 'rgba(255,90,110,0.8)' : 'rgba(255,211,106,0.55)'; g.setLineDash([10, 8]);
  g.beginPath(); g.arc(S / 2, S / 2, r - 6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  if (progress > 0) { g.lineWidth = 14; g.strokeStyle = color; g.beginPath(); g.arc(S / 2, S / 2, r - 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); g.stroke(); }
  ringTex.needsUpdate = true;
}

let lastState = '';
export function updateRelic(dt: number) {
  const R0 = G.relic, t = GLOBAL.time.value;
  const avail = R0.state === 'altar';
  relic.visible = avail;
  relic.position.y = 2.5 + Math.sin(t * 1.6) * 0.12;
  gem.rotation.y += dt * 1.2;
  rings.forEach((r, i) => { r.rotation.x = t * (0.7 + i * 0.3) + i; r.rotation.y = t * (0.5 + i * 0.2); });
  beamMat.uniforms.uK.value += ((avail ? 1 : 0.0) - beamMat.uniforms.uK.value) * (1 - Math.exp(-dt * 2));
  beam.visible = beamMat.uniforms.uK.value > 0.02;
  light.intensity = avail ? 40 + Math.sin(t * 4) * 8 : 6;
  const capper = G.players.get(R0.capper);
  drawRing(avail ? R0.progress : 0, capper ? '#' + new THREE.Color(capper.color).getHexString() : '#ffd36a', R0.contested);
  capRing.visible = avail;
  if (avail && rand() < 0.6) {
    const a = R(0, 6.28), d = R(0.3, TUNE.relic.radius);
    FXA.emit({ x: ALTAR.x + Math.cos(a) * d, y: gy + 0.3, z: ALTAR.z + Math.sin(a) * d, vx: 0, vy: R(0.6, 1.8), vz: 0, life: R(1, 2), s0: R(0.05, 0.12), s1: 0.01, c0: C(0xffe08a, 3), c1: C(0xff9a30, 1), shape: SH_GLOW, fin: 0.3 });
  }
  if (lastState === 'altar' && R0.state === 'held') {
    for (let i = 0; i < 120; i++) FXA.emit({ x: ALTAR.x, y: gy + 2.5, z: ALTAR.z, vx: R(-6, 6), vy: R(-2, 8), vz: R(-6, 6), life: R(0.6, 1.6), s0: R(0.1, 0.25), s1: 0.02, c0: C(0xfff0b0, 5), c1: C(0xffa030, 2), shape: SH_STAR, drag: 1.5, spin: 4 });
    SFX.growth(root.position);
  }
  lastState = R0.state;
}
