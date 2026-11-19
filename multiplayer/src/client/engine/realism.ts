import * as THREE from 'three';
import { camera, GLOBAL, LOWSPEC, R, scene } from './core';
import { BIRD_ROUTES } from './flight-paths';

/**
 * Small, asset-free atmosphere details. Birds are shaded procedural meshes
 * following deterministic Python-authored flight paths; pollen is an instanced
 * camera-space layer with a low particle budget. This module owns only its
 * animation loop and shares the existing renderer/scene with the game.
 */
const birdMat = new THREE.MeshBasicMaterial({
  color: 0x26352c,
  fog: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  transparent: true,
  opacity: 0.72,
});

function makeWing(): THREE.BufferGeometry {
  // A tapered, gently swept silhouette, curved slightly like a distant bird's wing.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.20, 0.15, 0.49, 0.105);
  shape.quadraticCurveTo(0.30, 0.025, 0.12, -0.035);
  shape.quadraticCurveTo(0.06, -0.02, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.computeVertexNormals();
  return geo;
}

const wingGeometry = makeWing();
const flocks: Array<{ group: THREE.Group; route: typeof BIRD_ROUTES[number]; offset: number }> = [];
for (const route of BIRD_ROUTES) {
  const group = new THREE.Group();
  for (let i = 0; i < route.flockSize; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, birdMat);
    const right = new THREE.Mesh(wingGeometry, birdMat);
    left.position.x = -0.012;
    left.rotation.z = Math.PI;
    right.position.x = 0.012;
    bird.add(left, right);
    bird.userData.wings = [left, right];
    const spread = i - (route.flockSize - 1) * 0.5;
    bird.position.set(spread * 0.72, Math.sin(i * 2.1) * 0.18, Math.abs(spread) * 0.34);
    const scale = 0.32 + (i % 3) * 0.055;
    bird.scale.setScalar(scale);
    group.add(bird);
  }
  group.frustumCulled = false;
  scene.add(group);
  flocks.push({ group, route, offset: route.seed * 0.001 });
}

// Soft, rare pollen motes against the light, not a distracting sparkle effect.
const pollenCount = LOWSPEC ? 48 : 112;
const pollenGeo = new THREE.SphereGeometry(0.018, 6, 5);
const pollenMat = new THREE.MeshBasicMaterial({
  color: 0xffe6a8,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
  fog: false,
});
const pollen = new THREE.InstancedMesh(pollenGeo, pollenMat, pollenCount);
pollen.frustumCulled = false;
const pollenSeed = 0x51a7;
function seeded(index: number): number {
  const x = Math.sin((index + pollenSeed) * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
const pollenData = Array.from({ length: pollenCount }, (_, i) => ({
  x: (seeded(i * 3) - 0.5) * 18,
  y: (seeded(i * 3 + 1) - 0.5) * 9,
  z: -2 - seeded(i * 3 + 2) * 20,
  phase: seeded(i + 900) * Math.PI * 2,
  speed: 0.12 + seeded(i + 1200) * 0.2,
  size: 0.28 + seeded(i + 1600) * 0.72,
}));
scene.add(camera);
camera.add(pollen);
const dummy = new THREE.Object3D();

let last = performance.now();
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const t = GLOBAL.time.value;
  for (const { group, route, offset } of flocks) {
    const a = t * route.speed + route.phase;
    group.position.set(
      camera.position.x + Math.cos(a) * route.radiusX,
      camera.position.y + route.height + Math.sin(a * 1.7 + offset) * 1.2,
      camera.position.z + Math.sin(a) * route.radiusZ,
    );
    group.rotation.y = Math.atan2(Math.cos(a) * route.speed * route.radiusX, Math.cos(a) * route.speed * route.radiusZ);
    group.rotation.z = Math.sin(a * 2.0 + offset) * 0.035;
    for (const bird of group.children) {
      const wings = bird.userData.wings as THREE.Mesh[];
      const flap = Math.sin(t * (6.2 + route.seed % 4) + offset + bird.position.x) * 0.19;
      wings[0].rotation.y = flap;
      wings[1].rotation.y = -flap;
    }
  }
  for (let i = 0; i < pollenCount; i++) {
    const p = pollenData[i];
    const drift = t * p.speed;
    dummy.position.set(p.x + Math.sin(drift + p.phase) * 0.22, p.y + Math.sin(drift * 0.7 + p.phase) * 0.12, p.z);
    dummy.scale.setScalar(p.size * (0.72 + Math.sin(t * 1.8 + p.phase) * 0.18));
    dummy.rotation.set(0, 0, t * 0.16 + p.phase);
    dummy.updateMatrix();
    pollen.setMatrixAt(i, dummy.matrix);
  }
  pollen.instanceMatrix.needsUpdate = true;
  // Keep the decorative layer paused when the tab is hidden.
  if (document.visibilityState === 'hidden') last = performance.now() - dt * 1000;
}
requestAnimationFrame(animate);

// Keep a small, explicit API for future quality toggles and automated checks.
export const realismDetails = { flockCount: flocks.length, pollenCount, setVisible(value: boolean) { pollen.visible = value; for (const flock of flocks) flock.group.visible = value; } };
