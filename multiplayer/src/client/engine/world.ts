import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { renderer, scene, LOWSPEC, GLOBAL, mulberry32, rand, R, RI, clamp, lerp, smooth, noise2, fbm2, pfbm, _v1, _v2, _v3, _v4, _q1, _m1, _c1, UP, pixelTex, genBark, genGround } from './core';

/* =====================================================================
   3. SKY, SUN, FOG, ENVIRONMENT LIGHTING
   ===================================================================== */
export const SUN_ELEV = 22, SUN_AZ = 292;
export const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZ));
export const sky = new Sky();
sky.scale.setScalar(4500);
export const su = sky.material.uniforms;
su.turbidity.value = 4.2; su.rayleigh.value = 1.35; su.mieCoefficient.value = 0.0045; su.mieDirectionalG.value = 0.86;
su.sunPosition.value.copy(sunDir);
scene.add(sky);

export const FOG_COLOR = new THREE.Color(0xa9c3dc);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0036);

// image based lighting from the procedural sky
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(1000);
  for (const k in su) if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = su[k].value;
  envScene.add(sky2);
  // a ground disc so the lower hemisphere bounce reads as warm-green grass
  const gd = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48),
    new THREE.MeshBasicMaterial({ color: 0x41552a, side: THREE.BackSide }));
  envScene.add(gd);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
}

export const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
sun.castShadow = true;
export const SHADOW_R = 62;
sun.shadow.mapSize.set(LOWSPEC ? 2048 : 4096, LOWSPEC ? 2048 : 4096);
sun.shadow.camera.left = -SHADOW_R; sun.shadow.camera.right = SHADOW_R;
sun.shadow.camera.top = SHADOW_R; sun.shadow.camera.bottom = -SHADOW_R;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2.5;
scene.add(sun); scene.add(sun.target);
export const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4d5a2c, 0.42);
scene.add(hemi);

// drifting procedural cloud layer
export const cloudMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uTime: GLOBAL.time, uSun: { value: sunDir } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    varying vec3 vW; uniform float uTime; uniform vec3 uSun;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
    void main(){
      vec2 p = vW.xz*0.0016 + vec2(uTime*0.004, uTime*0.0016);
      float c = fbm(p); float c2 = fbm(p*2.2+3.1);
      float d = smoothstep(0.47, 0.78, c*0.75+c2*0.35);
      float edge = 1.0 - smoothstep(1100.0, 2600.0, length(vW.xz));
      vec3 lit = mix(vec3(0.72,0.76,0.84), vec3(1.0,0.97,0.92), smoothstep(0.3,0.9,c2));
      float sunGlow = pow(max(dot(normalize(vW), uSun),0.),6.0);
      lit += vec3(1.0,0.8,0.55)*sunGlow*0.6;
      gl_FragColor = vec4(lit, d*edge*0.9);
    }`
});
export const clouds = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), cloudMat);
clouds.rotation.x = Math.PI / 2; clouds.position.y = 420; clouds.renderOrder = -1;
scene.add(clouds);

/* =====================================================================
   4. TERRAIN + MAGIC EFFECT MAP (scorch / frost / growth / heat)
   ===================================================================== */
export const SITES: Record<'tower' | 'cottage' | 'windmill' | 'ruins', { x: number; z: number; r: number; h?: number }> = {
  tower: { x: -22, z: -32, r: 6.5 },
  cottage: { x: 17, z: -22, r: 9 },
  windmill: { x: 38, z: 6, r: 6.5 },
  ruins: { x: -30, z: 12, r: 13 },
};
export function baseHeight(x, z) {
  const d = Math.hypot(x, z * 0.9 + 10);
  const gentle = (fbm2(x * 0.035 + 10, z * 0.035 - 3, 3) - 0.5) * 1.6 + Math.sin(x * 0.05) * 0.3;
  const hm = smooth(60, 170, d);
  const hills = Math.pow(fbm2(x * 0.0065 + 3, z * 0.0065 + 8, 5), 1.4) * 70 + fbm2(x * 0.03, z * 0.03, 3) * 6;
  return gentle + hm * hills;
}
for (const k in SITES) SITES[k].h = baseHeight(SITES[k].x, SITES[k].z);
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const k in SITES) {
    const s = SITES[k]; const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + 9) h = lerp(s.h, h, smooth(s.r, s.r + 9, d));
  }
  return h;
}
export function groundNormal(x, z, out) {
  const e = 0.25;
  out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  return out;
}

export const FXN = 512, FXH = 100;
export const fxData = new Uint8Array(FXN * FXN * 4);
export const fxTex = new THREE.DataTexture(fxData, FXN, FXN, THREE.RGBAFormat);
fxTex.magFilter = THREE.LinearFilter; fxTex.minFilter = THREE.LinearFilter; fxTex.needsUpdate = true;
export let fxDirty = false;
export function clearFxMap() { fxData.fill(0); fxDirty = true; }
// channel: 0 scorch, 1 frost, 2 lush, 3 heat
export function stampFx(x, z, radius, ch, amount, opts: { noise?: number; clear?: number[] } = {}) {
  const cx = (x / (2 * FXH) + 0.5) * FXN, cz = (z / (2 * FXH) + 0.5) * FXN, rr = radius / (2 * FXH) * FXN;
  const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(FXN - 1, Math.ceil(cx + rr));
  const z0 = Math.max(0, Math.floor(cz - rr)), z1 = Math.min(FXN - 1, Math.ceil(cz + rr));
  const nz = opts.noise ?? 0.5, seed = R(0, 100);
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i - cx, dz = j - cz, d = Math.sqrt(dx * dx + dz * dz) / rr;
    if (d >= 1) continue;
    const ang = Math.atan2(dz, dx);
    const edge = 1 - nz * 0.45 * noise2(Math.cos(ang) * 3 + seed, Math.sin(ang) * 3 + seed);
    let f = 1 - smooth(edge * 0.55, edge, d);
    f *= 1 - nz * 0.35 * noise2(i * 0.25 + seed, j * 0.25);
    if (f <= 0) continue;
    const o = (j * FXN + i) * 4, v = amount * f * 255;
    fxData[o + ch] = Math.max(fxData[o + ch], Math.min(255, v));
    if (opts.clear) for (const c of opts.clear) fxData[o + c] = Math.max(0, fxData[o + c] - v * 1.5);
  }
  fxDirty = true;
}
export let fxTick = 0, fxSlow = 0;
export function updateFx(dt) {
  fxTick += dt; fxSlow += dt;
  if (fxTick > 0.15) {
    const slow = fxSlow > 1.6; if (slow) fxSlow = 0;
    fxTick = 0; let any = false;
    for (let o = 0; o < fxData.length; o += 4) {
      const a = fxData[o + 3], g = fxData[o + 1];
      if (a) { fxData[o + 3] = a > 5 ? a - 5 : 0; any = true; }
      if (g && slow) { fxData[o + 1] = g > 3 ? g - 3 : 0; any = true; }
      if (slow && fxData[o]) { fxData[o]--; any = true; }
    }
    if (any) fxDirty = true;
  }
  if (fxDirty) { fxTex.needsUpdate = true; fxDirty = false; }
}
export const FX_UNI = { uFx: { value: fxTex }, uFxH: { value: FXH } };
export const fxGLSL = `uniform sampler2D uFx; uniform float uFxH;
  vec4 sampleFx(vec2 xz){ vec2 uv = xz/(2.0*uFxH)+0.5; if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) return vec4(0.); return texture2D(uFx, uv); }
`;

export const groundTex = genGround(); groundTex.repeat.set(1, 1);
export const terrainGeo = new THREE.PlaneGeometry(900, 900, 360, 360);
terrainGeo.rotateX(-Math.PI / 2);
{
  const p = terrainGeo.attributes.position, uv = terrainGeo.attributes.uv, cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z);
    p.setY(i, h); uv.setXY(i, x / 7, z / 7);
    const dry = smooth(0.45, 0.75, fbm2(x * 0.02 + 40, z * 0.02 - 7, 4));
    const hill = smooth(4, 40, h);
    _c1.setRGB(1.0, 1.0, 1.0).lerp(_c1.clone().setRGB(1.18, 1.04, 0.72), dry * 0.6).lerp(_c1.clone().setRGB(0.82, 0.95, 0.8), hill * 0.6);
    cols[i * 3] = _c1.r; cols[i * 3 + 1] = _c1.g; cols[i * 3 + 2] = _c1.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  terrainGeo.computeVertexNormals();
}
export const terrainMat = new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, roughness: 0.96, metalness: 0 });
terrainMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, FX_UNI, { uTime: GLOBAL.time });
  sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vWXZ = (modelMatrix*vec4(transformed,1.0)).xz;`);
  sh.fragmentShader = 'varying vec2 vWXZ; uniform float uTime;\n' + fxGLSL + sh.fragmentShader
    .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 fxS = sampleFx(vWXZ);
      float tNoise = fract(sin(dot(floor(vWXZ*6.0),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.05,1.3,0.85), fxS.b*0.8);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03,0.027,0.025)*(0.7+0.6*tNoise), smoothstep(0.05,0.7,fxS.r));
      float frost = smoothstep(0.04,0.5,fxS.g);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80,0.90,1.0)*(0.85+0.15*tNoise), frost);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.14 + 0.2*tNoise, frost);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float heat = fxS.a*fxS.a;
      float flick = 0.6+0.4*sin(uTime*7.0 + vWXZ.x*3.1 + vWXZ.y*2.3);
      totalEmissiveRadiance += vec3(1.0,0.28,0.04)*heat*4.0*flick*(0.4+tNoise);
      totalEmissiveRadiance += vec3(0.5,0.7,1.0)*frost*0.06;`);
};
export const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

/* =====================================================================
   5. GRASS + FLOWERS (instanced, GPU wind, reacts to magic)
   ===================================================================== */
export const pushers = []; for (let i = 0; i < 8; i++) pushers.push(new THREE.Vector4(0, 0, 1, 0));
export const sunViewDir = new THREE.Vector3();
export const FOLIAGE_UNI = { uTime: GLOBAL.time, uPush: { value: pushers }, uSunV: { value: sunViewDir } };

export function foliageShader(mat, opt) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FX_UNI, FOLIAGE_UNI);
    const hExpr = opt.heightFromUV ? 'uv.y' : 'clamp(position.y,0.0,1.0)';
    sh.vertexShader = `uniform float uTime; uniform vec4 uPush[8]; varying vec4 vFx; varying float vH; ${opt.tintAttr ? 'attribute float aTint;' : ''}
      ${fxGLSL}\n` + sh.vertexShader
      .replace('#include <color_vertex>', opt.tintAttr ? `
        vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix(vec3(1.0), instanceColor.rgb, aTint);
        #endif` : '#include <color_vertex>')
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normalize(mix(normal, vec3(0.0,1.0,0.0), ${opt.normalUp}));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec3 ip = instanceMatrix[3].xyz;
        vec4 fx = sampleFx(ip.xz); vFx = fx;
        float hgt = ${hExpr}; vH = hgt;
        float sw2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
        float sh = length(instanceMatrix[1].xyz);
        float burn = smoothstep(0.15, 0.85, fx.r);
        transformed.y *= mix(1.0, ${opt.burnShrink}, burn);
        transformed.xz *= mix(1.0, 0.55, burn);
        float stiff = 1.0 - 0.94*smoothstep(0.05, 0.5, fx.g);
        vec2 wdir = normalize(vec2(1.0, 0.42));
        float gust = sin(dot(ip.xz, wdir)*0.07 - uTime*1.25)*0.5+0.5; gust *= gust;
        float gust2 = sin(dot(ip.xz, vec2(-0.3,1.0))*0.11 - uTime*0.7)*0.5+0.5;
        float flutter = sin(uTime*3.3 + ip.x*1.7 + ip.z*1.3)*0.6 + sin(uTime*5.7 + ip.z*2.3 - ip.x)*0.3;
        vec3 wofs = vec3(wdir.x,0.0,wdir.y) * (0.10 + gust*0.42 + gust2*0.12 + flutter*0.07) * ${opt.windAmt} * stiff;
        for(int i=0;i<8;i++){
          vec4 p = uPush[i]; if(p.w==0.0) continue;
          vec2 d = ip.xz - p.xy; float dl = length(d)+0.0001;
          float f = 1.0 - smoothstep(p.z*0.35, p.z, dl);
          wofs.xz += (d/dl) * f * p.w;
        }
        float wl = length(wofs.xz); if(wl>1.25) wofs.xz *= 1.25/wl;
        float prof = hgt*hgt;
        vec3 wo = vec3(wofs.x, -dot(wofs.xz,wofs.xz)*0.45, wofs.z) * prof * sh;
        transformed += vec3(dot(wo, instanceMatrix[0].xyz)/sw2, wo.y/sh, dot(wo, instanceMatrix[2].xyz)/sw2);
        float dc = length(ip - cameraPosition);
        transformed *= 1.0 - smoothstep(${opt.fade0}, ${opt.fade1}, dc);
      `);
    sh.fragmentShader = `varying vec4 vFx; varying float vH; uniform vec3 uSunV;\n` + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vNormal);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(${opt.ao}, 1.0, smoothstep(0.0, 0.75, vH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.08,1.28,0.8)+vec3(0.0,0.025,0.0), vFx.b*0.8);
        float burnc = smoothstep(0.08, 0.6, vFx.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.028,0.024,0.02)*(0.6+0.8*vH), burnc);
        float frz = smoothstep(0.04, 0.45, vFx.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82,0.92,1.0)*(0.72+0.3*vH), frz);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.25, frz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0,0.3,0.04) * vFx.a*vFx.a * 5.0 * (0.3+vH);`)
      .replace('#include <opaque_fragment>', `
        float bl = pow(max(dot(normalize(-vViewPosition), uSunV), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb * vec3(1.0,0.92,0.7) * bl * ${opt.sss} * vH * (1.0-frz) * (1.0-burnc);
        #include <opaque_fragment>`);
  };
}

// --- grass blades
export function bladeGeometry() {
  const segs = 4, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.03 * Math.pow(1 - t, 0.9) + 0.0015, bend = t * t * 0.18;
    if (i < segs) { pos.push(-w, t, bend, w, t, bend); uvs.push(0, t, 1, t); }
    else { pos.push(0, 1, bend); uvs.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function isBlocked(x, z, pad = 0) {
  if (Math.hypot(x - SITES.tower.x, z - SITES.tower.z) < 4.3 + pad) return true;
  if (Math.abs(x - SITES.cottage.x) < 4.6 + pad && Math.abs(z - SITES.cottage.z) < 3.6 + pad) return true;
  if (Math.hypot(x - SITES.windmill.x, z - SITES.windmill.z) < 3.4 + pad) return true;
  return false;
}
export const GRASS_COUNT = LOWSPEC ? 30000 : 105000;
export const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
foliageShader(grassMat, { heightFromUV: true, normalUp: '0.75', burnShrink: '0.18', windAmt: '1.0', ao: '0.28', sss: '0.45', fade0: '52.0', fade1: '74.0' });
export const grass = new THREE.InstancedMesh(bladeGeometry(), grassMat, GRASS_COUNT);
grass.frustumCulled = false; grass.receiveShadow = true;
{
  const greens = [0x5f8f2e, 0x6e9e34, 0x4f7f26, 0x7fa83a, 0x86a640, 0x587f2b].map(c => new THREE.Color(c));
  const dryC = new THREE.Color(0xb5a554);
  let n = 0;
  while (n < GRASS_COUNT) {
    const rr = Math.sqrt(rand()) * 82, a = rand() * Math.PI * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr - 6;
    if (isBlocked(x, z)) continue;
    const patch = fbm2(x * 0.09 + 3, z * 0.09 + 1, 3);
    const hgt = (0.3 + rand() * 0.34) * (0.55 + patch * 1.1);
    _q1.setFromAxisAngle(UP, rand() * Math.PI * 2);
    _m1.compose(_v1.set(x, heightAt(x, z) - 0.02, z), _q1, _v2.set(0.8 + rand() * 0.6, hgt, 0.8 + rand() * 0.6));
    grass.setMatrixAt(n, _m1);
    const dry = smooth(0.5, 0.78, fbm2(x * 0.02 + 40, z * 0.02 - 7, 4));
    _c1.copy(greens[n % greens.length]).lerp(dryC, dry * 0.55 + rand() * 0.12);
    _c1.multiplyScalar(0.85 + rand() * 0.3);
    grass.setColorAt(n, _c1);
    n++;
  }
}
scene.add(grass);

// --- flowers (blue & pink)
export function flowerGeometry() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.006, 0.009, 1, 4, 4, true); stem.translate(0, 0.5, 0);
  parts.push([stem, 0x4f7f2a, 0]);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.SphereGeometry(1, 6, 4); p.scale(0.034, 0.009, 0.019); p.translate(0.03, 0, 0);
    p.rotateZ(0.35); p.rotateY(i / 6 * Math.PI * 2); p.translate(0, 1, 0); parts.push([p, 0xffffff, 1]);
  }
  const c = new THREE.SphereGeometry(0.014, 6, 4); c.translate(0, 1.005, 0); parts.push([c, 0xffd45a, 0]);
  const leaf = new THREE.SphereGeometry(1, 5, 3); leaf.scale(0.05, 0.006, 0.016); leaf.translate(0.045, 0.3, 0); leaf.rotateZ(0.5);
  parts.push([leaf, 0x4f8a2c, 0]);
  const geos = parts.map(([g, col, tint]) => {
    g = g.toNonIndexed(); const n = g.attributes.position.count; const cc = new THREE.Color(col);
    const ca = new Float32Array(n * 3), ta = new Float32Array(n);
    for (let i = 0; i < n; i++) { ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b; ta[i] = tint; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.setAttribute('aTint', new THREE.BufferAttribute(ta, 1));
    g.deleteAttribute('uv'); return g;
  });
  return BGU.mergeGeometries(geos);
}
export const FLOWER_COLS = [0x4f7dff, 0x6aa2ff, 0x3a5ee6, 0x8fb8ff, 0xff74b0, 0xff4f93, 0xffa0c9, 0xe86ad8].map(c => new THREE.Color(c));
export const flowerGeo = flowerGeometry();
export const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
foliageShader(flowerMat, { heightFromUV: false, tintAttr: true, normalUp: '0.35', burnShrink: '0.05', windAmt: '0.75', ao: '0.5', sss: '0.5', fade0: '60.0', fade1: '80.0' });
export const FLOWER_COUNT = 4200;
export const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWER_COUNT);
flowers.frustumCulled = false; flowers.receiveShadow = true;
{
  let n = 0;
  while (n < FLOWER_COUNT) {
    // clustered meadows of flowers
    const cx = R(-75, 75), cz = R(-80, 70);
    const blue = rand() < 0.5, cl = RI(8, 30);
    for (let k = 0; k < cl && n < FLOWER_COUNT; k++) {
      const x = cx + R(-1, 1) * R(0, 4), z = cz + R(-1, 1) * R(0, 4);
      if (isBlocked(x, z, 0.5) || Math.hypot(x, z + 6) > 84) continue;
      _q1.setFromAxisAngle(UP, rand() * 6.283);
      const s = R(0.8, 1.25);
      _m1.compose(_v1.set(x, heightAt(x, z) - 0.02, z), _q1, _v2.set(s, R(0.3, 0.62), s));
      flowers.setMatrixAt(n, _m1);
      _c1.copy(FLOWER_COLS[(blue ? 0 : 4) + RI(0, 3)]).multiplyScalar(R(0.85, 1.1));
      flowers.setColorAt(n, _c1); n++;
    }
  }
}
scene.add(flowers);

// growth-spell flowers (pre-allocated pool, animated)
export const GROW_MAX = 2400;
export const growFlowers = new THREE.InstancedMesh(flowerGeo, flowerMat, GROW_MAX);
growFlowers.count = 0; growFlowers.frustumCulled = false; growFlowers.receiveShadow = true;
growFlowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
growFlowers.setColorAt(0, _c1.set(1, 1, 1));
scene.add(growFlowers);
export const growingFlowers: any[] = [];
let sproutCursor = 0; // {i,x,y,z,rot,s,h,t0}
export function sproutFlower(x, z, delay, col) {
  if (growFlowers.count >= GROW_MAX) {
    // recycle the oldest slot
    const i = (sproutCursor = (sproutCursor + 1) % GROW_MAX);
    growingFlowers.push({ i, x, y: heightAt(x, z) - 0.02, z, rot: rand() * 6.28, s: R(1, 1.6), h: R(0.35, 0.75), t0: GLOBAL.time.value + delay });
    growFlowers.setColorAt(i, col); growFlowers.instanceColor.needsUpdate = true; return;
  }
  const i = growFlowers.count++;
  growingFlowers.push({ i, x, y: heightAt(x, z) - 0.02, z, rot: rand() * 6.28, s: R(1, 1.6), h: R(0.35, 0.75), t0: GLOBAL.time.value + delay });
  _m1.makeScale(0, 0, 0); growFlowers.setMatrixAt(i, _m1);
  growFlowers.setColorAt(i, col); growFlowers.instanceColor.needsUpdate = true;
}
export const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export function updateGrowFlowers() {
  if (!growingFlowers.length) return;
  const now = GLOBAL.time.value;
  for (let k = growingFlowers.length - 1; k >= 0; k--) {
    const f = growingFlowers[k]; const t = clamp((now - f.t0) / 0.9, 0, 1);
    const e = t <= 0 ? 0 : easeOutBack(t);
    _q1.setFromAxisAngle(UP, f.rot + (1 - t) * 2);
    _m1.compose(_v1.set(f.x, f.y, f.z), _q1, _v2.set(f.s * Math.max(e, 0.0001), f.h * Math.max(e, 0.0001), f.s * Math.max(e, 0.0001)));
    growFlowers.setMatrixAt(f.i, _m1);
    if (t >= 1) growingFlowers.splice(k, 1);
  }
  growFlowers.instanceMatrix.needsUpdate = true;
}

/* =====================================================================
   6. TREES (round stylized, swaying) + far forest
   ===================================================================== */
export const barkTex = genBark(); barkTex.col.repeat.set(2, 2); barkTex.bump.repeat.set(2, 2);
export const barkMat = new THREE.MeshStandardMaterial({ map: barkTex.col, bumpMap: barkTex.bump, bumpScale: 2.5, roughness: 0.92 });
export const leafBump = pixelTex(256, (u, v) => { const n = pfbm(u * 24, v * 24, 24, 3); const c = Math.pow(n, 1.5) * 255; return [c, c, c]; }, false);
leafBump.repeat.set(3, 3);
export const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, bumpMap: leafBump, bumpScale: 3 });
leafMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = GLOBAL.time; sh.uniforms.uSunV = FOLIAGE_UNI.uSunV;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 wp0 = modelMatrix*vec4(position,1.0);
    float sway = sin(uTime*1.4 + wp0.x*0.35 + wp0.z*0.2)*0.06 + sin(uTime*2.7 + wp0.y*1.3 + wp0.x)*0.025;
    transformed += vec3(sway, sway*0.3, sway*0.55) * clamp(position.y*0.35, 0.0, 1.6);`);
  sh.fragmentShader = 'uniform vec3 uSunV;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
    float blt = pow(max(dot(normalize(-vViewPosition), uSunV), 0.0), 5.0);
    outgoingLight += diffuseColor.rgb * vec3(0.9,1.0,0.5) * blt * 0.55;
    #include <opaque_fragment>`);
};
export const treeColliders = []; // {x,z,r}
export const LEAF_PALETTES = [[0x4f8a2b, 0x86b843], [0x3f7a2a, 0x74a83b], [0x5d9330, 0xa3c64a], [0x46802e, 0x95bf4a], [0x6b8f2a, 0xc0c94f]];
export function buildTree(seed, size = 1) {
  const rr = mulberry32(seed); const r = (a, b) => a + (b - a) * rr();
  const g = new THREE.Group();
  const H = r(2.6, 3.8) * size;
  // trunk with gentle bends
  const tg = new THREE.CylinderGeometry(0.16 * size, 0.34 * size, H, 12, 10);
  tg.translate(0, H / 2, 0);
  const tp = tg.attributes.position; const lean = r(-0.25, 0.25), lean2 = r(-0.25, 0.25);
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), t = y / H;
    const nx = noise2(tp.getX(i) * 4 + seed, y * 2) - 0.5;
    tp.setX(i, tp.getX(i) * (1 + nx * 0.25 + (1 - t) * (1 - t) * 0.4) + Math.sin(t * 2.2) * lean * size);
    tp.setZ(i, tp.getZ(i) * (1 + nx * 0.25 + (1 - t) * (1 - t) * 0.4) + Math.sin(t * 1.7) * lean2 * size);
  }
  tg.computeVertexNormals();
  const branches = [tg];
  const crownY = H + 0.9 * size, crown = new THREE.Vector3(Math.sin(2.2) * lean * size, crownY, Math.sin(1.7) * lean2 * size);
  const blobs = [];
  const nb = Math.floor(r(5, 9));
  blobs.push([crown.clone(), r(1.6, 2.0) * size]);
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2 + r(-0.3, 0.3), d = r(0.9, 1.6) * size;
    blobs.push([new THREE.Vector3(crown.x + Math.cos(a) * d, crownY + r(-0.9, 0.8) * size, crown.z + Math.sin(a) * d), r(0.95, 1.45) * size]);
  }
  blobs.push([new THREE.Vector3(crown.x + r(-.3, .3), crownY + 1.3 * size, crown.z + r(-.3, .3)), r(1.0, 1.3) * size]);
  for (let i = 1; i < blobs.length; i += 2) { // branches to some blobs
    const from = new THREE.Vector3(crown.x * 0.6, H * r(0.6, 0.85), crown.z * 0.6), to = blobs[i][0];
    const len = from.distanceTo(to) * 0.8;
    const bg = new THREE.CylinderGeometry(0.05 * size, 0.11 * size, len, 6, 1); bg.translate(0, len / 2, 0);
    _q1.setFromUnitVectors(UP, _v1.subVectors(to, from).normalize());
    bg.applyQuaternion(_q1); bg.translate(from.x, from.y, from.z); branches.push(bg);
  }
  const trunk = new THREE.Mesh(BGU.mergeGeometries(branches), barkMat);
  trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);
  const pal = LEAF_PALETTES[Math.floor(rr() * LEAF_PALETTES.length)];
  const cDark = new THREE.Color(pal[0]), cLight = new THREE.Color(pal[1]);
  const lg = [];
  const top = crownY + 2.2 * size, bot = crownY - 2.2 * size;
  for (const [c, rad] of blobs) {
    const s = new THREE.IcosahedronGeometry(rad, 4);
    const p = s.attributes.position, n = s.attributes.normal; const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _v1.fromBufferAttribute(p, i);
      const dir = _v2.copy(_v1).normalize();
      const nz = noise2(dir.x * 2.5 + seed + dir.z * 1.3, dir.y * 2.5 + dir.z * 2.1) * 0.45 + noise2(dir.x * 7 + 3, dir.y * 7 + dir.z * 5) * 0.16;
      _v1.multiplyScalar(0.82 + nz * 0.5).add(c);
      p.setXYZ(i, _v1.x, _v1.y, _v1.z);
      // soft spherical normal from crown centre blended with blob normal
      _v3.subVectors(_v1, crown).normalize();
      _v4.copy(dir).lerp(_v3, 0.45).normalize();
      n.setXYZ(i, _v4.x, _v4.y, _v4.z);
      const ht = clamp((_v1.y - bot) / (top - bot), 0, 1);
      const outer = clamp(_v3.dot(dir) * 0.5 + 0.5, 0, 1);
      _c1.copy(cDark).lerp(cLight, ht * 0.75 + nz * 0.4).multiplyScalar(0.45 + 0.55 * Math.pow(ht, 0.6) * (0.5 + outer * 0.5));
      cols[i * 3] = _c1.r; cols[i * 3 + 1] = _c1.g; cols[i * 3 + 2] = _c1.b;
    }
    s.setAttribute('color', new THREE.BufferAttribute(cols, 3)); lg.push(s);
  }
  const leaves = new THREE.Mesh(BGU.mergeGeometries(lg), leafMat);
  leaves.castShadow = true; leaves.receiveShadow = true; g.add(leaves);
  g.userData.trunkR = 0.38 * size;
  return g;
}
export const trees = [];
export function placeTree(x, z, seed, size) {
  const t = buildTree(seed, size); t.position.set(x, heightAt(x, z) - 0.1, z); t.rotation.y = R(0, 6.28);
  scene.add(t); trees.push(t); treeColliders.push({ x, z, r: t.userData.trunkR + 0.25 });
  return t;
}
{
  const spots = [];
  let tries = 0;
  while (spots.length < 34 && tries++ < 4000) {
    const a = R(0, 6.283), d = R(14, 95), x = Math.cos(a) * d, z = Math.sin(a) * d - 8;
    if (isBlocked(x, z, 6) || Math.hypot(x, z - 22) < 9) continue;
    if (Math.hypot(x - SITES.ruins.x, z - SITES.ruins.z) < 12) continue;
    if (spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 7.5)) continue;
    spots.push([x, z]);
  }
  spots.forEach((s, i) => placeTree(s[0], s[1], 1000 + i * 77, R(0.8, 1.25)));
}
// far forest ring: cheap instanced trees for depth
{
  const fg = [];
  const fol = new THREE.IcosahedronGeometry(2.2, 2); fol.translate(0, 4.6, 0);
  const fol2 = new THREE.IcosahedronGeometry(1.6, 2); fol2.translate(0.9, 3.8, 0.6);
  const tr = new THREE.CylinderGeometry(0.2, 0.35, 3.4, 6).toNonIndexed(); tr.translate(0, 1.7, 0);
  for (const [g, c] of [[fol, 0x4a7d2a], [fol2, 0x5b8f30], [tr, 0x4a3524]] as [THREE.BufferGeometry, number][]) {
    const n = g.attributes.position.count, ca = new Float32Array(n * 3); const cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); const k = 0.6 + 0.12 * y / 3; ca.set([cc.r * k, cc.g * k, cc.b * k], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.deleteAttribute('uv'); fg.push(g);
  }
  const farGeo = BGU.mergeGeometries(fg);
  const FAR = 420;
  const far = new THREE.InstancedMesh(farGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), FAR);
  for (let i = 0; i < FAR; i++) {
    const a = R(0, 6.283), d = R(115, 330), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = R(0.9, 2.1);
    _m1.compose(_v1.set(x, heightAt(x, z) - 0.3, z), _q1.setFromAxisAngle(UP, R(0, 6.28)), _v2.set(s, s * R(0.85, 1.3), s));
    far.setMatrixAt(i, _m1); far.setColorAt(i, _c1.setHSL(R(0.22, 0.3), R(0.35, 0.55), R(0.75, 1.05)));
  }
  far.receiveShadow = true; scene.add(far);
}
