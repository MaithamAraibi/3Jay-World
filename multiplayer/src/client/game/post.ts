import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera, GLOBAL, LOWSPEC, getPixelRatio, setPixelRatioValue, UP, _v1, _v2 } from '../engine/core';
import { sun, sunDir, sunViewDir, SHADOW_R } from '../engine/world';
import { GR } from '../engine/spells';
import { G } from './state';
import { player } from './player';

const W = () => innerWidth, H = () => innerHeight;
const rt = new THREE.WebGLRenderTarget(W() * getPixelRatio(), H() * getPixelRatio(), { type: THREE.HalfFloatType, samples: LOWSPEC ? 0 : 4 });
export const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(getPixelRatio()); composer.setSize(W(), H());
composer.addPass(new RenderPass(scene, camera));
const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// guard against Inf/NaN from extreme HDR values before bloom spreads them
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } }, vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);
    if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(1.0); gl_FragColor = vec4(min(c.rgb, vec3(64.0)), 1.0); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.6, 0.5, 2.2);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFlash: { value: GR.flash }, uBH: { value: GR.bh }, uRing: { value: GR.ring }, uTime: GLOBAL.time, uAspect: { value: W() / H() }, uCA: { value: 0 }, uFrost: { value: 0 }, uHurt: { value: 0 }, uDead: { value: 0 }, uSage: { value: 0 } },
  vertexShader: quadVS,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 uFlash; uniform vec4 uBH; uniform vec4 uRing; uniform float uTime; uniform float uAspect; uniform float uCA;
    uniform float uFrost; uniform float uHurt; uniform float uDead; uniform float uSage;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      if (uBH.w > 0.0) {
        vec2 d = uv - uBH.xy; d.x *= uAspect; float r = length(d) + 1e-4; float rs = uBH.z;
        float bend = uBH.w * rs * rs / max(r, rs * 0.6) * (1.0 - smoothstep(rs * 2.5, rs * 7.0, r));
        vec2 dir = d / r; dir.x /= uAspect; uv -= dir * bend;
      }
      if (uRing.w > 0.0) {
        vec2 d = uv - uRing.xy; d.x *= uAspect; float r = length(d) + 1e-4;
        float k = exp(-pow((r - uRing.z) / (uRing.z * 0.18 + 0.01), 2.0));
        vec2 dir = d / r; dir.x /= uAspect; uv -= dir * k * uRing.w;
      }
      vec2 cc = uv - 0.5; float ca = (0.004 + uCA) * dot(cc, cc) * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, uv - cc * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + cc * ca).b);
      col += uFlash;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12 * (1.0 - uDead * 0.85));
      col *= mix(vec3(0.93, 0.98, 1.07), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 0.9, l));
      col = pow(max(col, 0.0), vec3(1.04)) * 1.02;
      float v = length(cc * vec2(uAspect * 0.8, 1.0));
      col *= mix(1.0, 0.58, smoothstep(0.35, 1.05, v));
      // frozen: crystalline frost creeping in from the edges
      if (uFrost > 0.0) {
        float fr = n(vUv * vec2(uAspect, 1.0) * 14.0) * 0.6 + n(vUv * 40.0) * 0.4;
        float edge = smoothstep(0.25, 0.75, v + fr * 0.35 - (1.0 - uFrost) * 0.6);
        col = mix(col, vec3(0.75, 0.9, 1.0) * (0.7 + fr * 0.5), edge * 0.85);
      }
      if (uHurt > 0.0) col = mix(col, vec3(0.55, 0.02, 0.02), smoothstep(0.3, 1.1, v) * uHurt * 0.75);
      if (uSage > 0.0) col += vec3(1.0, 0.8, 0.35) * smoothstep(0.55, 1.15, v) * uSage * (0.18 + 0.06 * sin(uTime * 3.0));
      float gr = fract(sin(dot(vUv * vec2(1931.3, 1087.1) + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (gr - 0.5) * 0.018 * (0.25 + sqrt(max(l, 0.0)));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function screenOf(p: THREE.Vector3, out: THREE.Vector2) { _v1.copy(p).project(camera); out.x = _v1.x * 0.5 + 0.5; out.y = _v1.y * 0.5 + 0.5; return _v1.z < 1; }
export function updatePost(dt: number) {
  GR.flash.multiplyScalar(Math.exp(-dt * 6));
  const U = grade.uniforms;
  U.uCA.value = Math.min(0.03, GR.shake * 0.012);
  U.uFrost.value += ((G.frozen > 0 ? 1 : 0) - U.uFrost.value) * (1 - Math.exp(-dt * 6));
  G.hurt = Math.max(0, G.hurt - dt * 1.6); U.uHurt.value = Math.min(1, G.hurt + (G.alive && G.hp < 30 ? 0.25 + 0.1 * Math.sin(GLOBAL.time.value * 6) : 0));
  U.uDead.value += ((G.alive ? 0 : 1) - U.uDead.value) * (1 - Math.exp(-dt * 3));
  U.uSage.value += ((G.sage ? 1 : 0) - U.uSage.value) * (1 - Math.exp(-dt * 3));
  const v = new THREE.Vector2();
  if (GR.bhW && screenOf(GR.bhW.pos, v)) {
    const d = GR.bhW.pos.distanceTo(camera.position);
    const rs = GR.bhW.r / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.5;
    GR.bh.set(v.x, v.y, Math.min(0.4, rs), 0.11 * GR.bhW.k);
  } else GR.bh.w = 0;
  const RW = GR.ringW;
  if (RW) {
    RW.t += dt; const k = RW.t / RW.life;
    if (k >= 1 || !screenOf(RW.pos, v)) { GR.ring.w = 0; if (k >= 1) GR.ringW = null; }
    else { const d = RW.pos.distanceTo(camera.position); const rr = RW.maxR * (1 - Math.pow(1 - k, 3)) / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.5; GR.ring.set(v.x, v.y, rr, 0.018 * (1 - k)); }
  }
}
// sun + shadow frustum follows the player, snapped to shadow texels to avoid shimmer
const LX = new THREE.Vector3().crossVectors(UP, sunDir).normalize(), LY = new THREE.Vector3().crossVectors(sunDir, LX);
export function updateSun() {
  const c = _v1.copy(player.pos).addScaledVector(_v2.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), SHADOW_R * 0.45);
  const tex = 2 * SHADOW_R / sun.shadow.mapSize.x;
  const x = Math.round(c.dot(LX) / tex) * tex, y = Math.round(c.dot(LY) / tex) * tex, z = c.dot(sunDir);
  sun.target.position.set(0, 0, 0).addScaledVector(LX, x).addScaledVector(LY, y).addScaledVector(sunDir, z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 220);
  sun.target.updateMatrixWorld();
  sunViewDir.copy(sunDir).transformDirection(camera.matrixWorldInverse);
}
export function setPR(p: number) { setPixelRatioValue(p); composer.setPixelRatio(p); composer.setSize(W(), H()); }
addEventListener('resize', () => {
  camera.aspect = W() / H(); camera.updateProjectionMatrix();
  renderer.setSize(W(), H()); composer.setSize(W(), H()); bloom.setSize(W(), H());
  grade.uniforms.uAspect.value = W() / H();
});
