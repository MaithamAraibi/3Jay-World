import * as THREE from 'three';
import { scene, camera, GLOBAL, rand, R, RI, clamp, lerp, smooth, _v1, _v4, _q1 } from './core';
import { FOG_COLOR, sunViewDir } from './world';
import { K_WOOD, K_CLOTH } from './pieces';

/* =====================================================================
   10. GPU PARTICLES (instanced billboards: fire, smoke, sparks, frost…)
   ===================================================================== */
export const SH_GLOW = 0, SH_FIRE = 1, SH_SPARK = 2, SH_SMOKE = 3, SH_STAR = 4, SH_PETAL = 5, SH_DUST = 6;
export const PSTRIDE = 26;
export class ParticleSystem {
  max: number; n: number; additive: boolean; d: Float32Array;
  aPos: THREE.InstancedBufferAttribute; aCol: THREE.InstancedBufferAttribute; aPar: THREE.InstancedBufferAttribute; aVel: THREE.InstancedBufferAttribute;
  mat: THREE.ShaderMaterial; mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; order: Uint32Array; depth: Float32Array;
  constructor(max: number, additive: boolean) {
    this.max = max; this.n = 0; this.additive = additive;
    this.d = new Float32Array(max * PSTRIDE);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: GLOBAL.time, uSunV: { value: sunViewDir }, uFogC: { value: FOG_COLOR }, uFogD: { value: (scene.fog as THREE.FogExp2).density }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: `
        attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iPar; attribute vec3 iVel;
        varying vec4 vCol; varying vec2 vUv; varying vec4 vPar; varying float vFog;
        uniform float uFogD;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
          vec2 q = position.xy; float size = iPos.w; vec2 offs;
          if (iPar.y > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            vec2 dir = vv.xy; float l = length(dir); dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
            vec2 perp = vec2(-dir.y, dir.x);
            offs = dir * q.x * (size + l * iPar.y) + perp * q.y * size;
          } else { float c = cos(iPar.x), s = sin(iPar.x); offs = vec2(c*q.x - s*q.y, s*q.x + c*q.y) * size; }
          mv.xy += offs;
          gl_Position = projectionMatrix * mv;
          vUv = q + 0.5; vCol = iCol; vPar = iPar;
          float fd = uFogD * -mv.z; vFog = 1.0 - exp(-fd*fd);
        }`,
      fragmentShader: `
        varying vec4 vCol; varying vec2 vUv; varying vec4 vPar; varying float vFog;
        uniform float uTime; uniform vec3 uSunV; uniform vec3 uFogC; uniform float uAdd;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p=p*2.07+vec2(3.1,1.7); a*=0.5; } return s; }
        void main(){
          vec2 p = vUv*2.0-1.0; float r = length(p);
          float shape = vPar.w, seed = vPar.z;
          vec3 col = vCol.rgb; float a = vCol.a;
          if (shape < 0.5) { a *= pow(max(0.0, 1.0-r), 2.2); }
          else if (shape < 1.5) {
            float nn = fbm(p*1.7 + vec2(seed*7.0, -uTime*2.8 + seed*3.0));
            float m = smoothstep(1.0, 0.15, r + (nn-0.5)*1.1);
            a *= m; col *= 0.55 + nn*1.1;
          }
          else if (shape < 2.5) { a *= exp(-r*r*5.0)*1.6; }
          else if (shape < 3.5) {
            float nn = fbm(p*1.25 + vec2(seed*13.1, seed*5.7 + uTime*0.15));
            float m = smoothstep(1.0, 0.2, r + (nn-0.5)*0.95);
            vec3 nrm = normalize(vec3(p*0.9 + (nn-0.5)*0.7, max(0.25, 1.0-r)));
            float lit = clamp(dot(nrm, uSunV)*0.55+0.5, 0.0, 1.0);
            col *= mix(0.5, 1.3, lit) * (0.8 + nn*0.4);
            a *= m;
          }
          else if (shape < 4.5) {
            float st = max(0.0, 1.0 - abs(p.x*p.y)*28.0) * max(0.0, 1.0-r);
            a *= st*st + exp(-r*r*14.0);
          }
          else if (shape < 5.5) {
            float e = length(p*vec2(1.0, 2.0)); a *= smoothstep(1.0, 0.8, e); col *= 0.75 + 0.35*(1.0-e);
          }
          else { float nn = n(p*3.0 + seed*9.0); a *= smoothstep(1.0, 0.0, r)*(0.55 + 0.55*nn); }
          if (uAdd > 0.5) { a *= 1.0 - vFog; } else { col = mix(col, uFogC, vFog); }
          if (a < 0.002) discard;
          gl_FragColor = vec4(col, min(a, 1.0));
        }`
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 10 : 9;
    this.geo = g; scene.add(this.mesh);
    this.order = new Uint32Array(max); this.depth = new Float32Array(max);
  }
  // o: {x,y,z,vx,vy,vz,life,s0,s1,c0,c1,a,shape,drag,grav,spin,stretch,fin,fout,turb}
  emit(o) {
    if (this.n >= this.max) return;
    const d = this.d, i = this.n++ * PSTRIDE;
    d[i] = o.x; d[i + 1] = o.y; d[i + 2] = o.z; d[i + 3] = o.vx || 0; d[i + 4] = o.vy || 0; d[i + 5] = o.vz || 0;
    d[i + 6] = 0; d[i + 7] = o.life || 1; d[i + 8] = o.s0 ?? 1; d[i + 9] = o.s1 ?? o.s0 ?? 1;
    const c0 = o.c0 || WHITE, c1 = o.c1 || c0;
    d[i + 10] = c0.r; d[i + 11] = c0.g; d[i + 12] = c0.b; d[i + 13] = c1.r; d[i + 14] = c1.g; d[i + 15] = c1.b;
    d[i + 16] = o.a ?? 1; d[i + 17] = o.drag || 0; d[i + 18] = o.grav || 0; d[i + 19] = o.rot ?? rand() * 6.28; d[i + 20] = o.spin || 0;
    d[i + 21] = o.stretch || 0; d[i + 22] = rand(); d[i + 23] = o.shape || 0; d[i + 24] = o.fin ?? 0.08; d[i + 25] = o.turb || 0;
  }
  update(dt) {
    const d = this.d; let n = this.n; const t = GLOBAL.time.value;
    for (let k = 0; k < n; k++) {
      const i = k * PSTRIDE;
      d[i + 6] += dt;
      if (d[i + 6] >= d[i + 7]) { // swap remove
        n--; const j = n * PSTRIDE; if (j !== i) d.copyWithin(i, j, j + PSTRIDE); k--; continue;
      }
      const dr = Math.exp(-d[i + 17] * dt);
      d[i + 3] *= dr; d[i + 4] *= dr; d[i + 5] *= dr;
      d[i + 4] -= d[i + 18] * dt;
      const tb = d[i + 25];
      if (tb) { const s = d[i + 22] * 50; d[i + 3] += Math.sin(d[i + 1] * 1.3 + s + t * 1.7) * tb * dt; d[i + 5] += Math.cos(d[i] * 1.1 + s * 1.3 + t * 1.3) * tb * dt; }
      d[i] += d[i + 3] * dt; d[i + 1] += d[i + 4] * dt; d[i + 2] += d[i + 5] * dt;
      d[i + 19] += d[i + 20] * dt;
    }
    this.n = n;
    const P = this.aPos.array, C = this.aCol.array, A = this.aPar.array, V = this.aVel.array;
    let order = null;
    if (!this.additive && n > 1) {
      const e = camera.matrixWorldInverse.elements;
      for (let k = 0; k < n; k++) { const i = k * PSTRIDE; this.depth[k] = e[2] * d[i] + e[6] * d[i + 1] + e[10] * d[i + 2]; this.order[k] = k; }
      order = Array.prototype.slice.call(this.order.subarray(0, n)).sort((a, b) => this.depth[a] - this.depth[b]);
    }
    for (let w = 0; w < n; w++) {
      const k = order ? order[w] : w, i = k * PSTRIDE;
      const tl = d[i + 6] / d[i + 7];
      const fin = d[i + 24];
      const alpha = d[i + 16] * Math.min(1, tl / fin) * (1 - smooth(0.45, 1, tl));
      P[w * 4] = d[i]; P[w * 4 + 1] = d[i + 1]; P[w * 4 + 2] = d[i + 2]; P[w * 4 + 3] = lerp(d[i + 8], d[i + 9], 1 - (1 - tl) * (1 - tl));
      C[w * 4] = lerp(d[i + 10], d[i + 13], tl); C[w * 4 + 1] = lerp(d[i + 11], d[i + 14], tl); C[w * 4 + 2] = lerp(d[i + 12], d[i + 15], tl); C[w * 4 + 3] = alpha;
      A[w * 4] = d[i + 19]; A[w * 4 + 1] = d[i + 21]; A[w * 4 + 2] = d[i + 22]; A[w * 4 + 3] = d[i + 23];
      V[w * 3] = d[i + 3]; V[w * 3 + 1] = d[i + 4]; V[w * 3 + 2] = d[i + 5];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aPar.needsUpdate = this.aVel.needsUpdate = true;
  }
}
export const WHITE = new THREE.Color(1, 1, 1);
export const FXA = new ParticleSystem(12000, true);   // additive: fire, sparks, magic
export const FXS = new ParticleSystem(4500, false);   // alpha: smoke, dust, petals
export const C = (hex, m = 1) => new THREE.Color(hex).multiplyScalar(m);

// pooled dynamic point lights (avoid shader recompiles)
export const lightPool = [];
for (let i = 0; i < 7; i++) { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); l.position.set(0, -100, 0); scene.add(l); lightPool.push({ l, t: 0, life: 0, i0: 0, follow: null, flicker: 0 }); }
export function flashLight(pos, color, intensity, life, dist = 30, flicker = 0) {
  let best = lightPool[0];
  for (const L of lightPool) if (L.life - L.t < best.life - best.t) best = L;
  best.l.position.copy(pos); best.l.color.set(color); best.l.distance = dist; best.t = 0; best.life = life; best.i0 = intensity; best.flicker = flicker;
  best.l.intensity = intensity; return best;
}
export function updateLights(dt) {
  for (const L of lightPool) {
    if (L.t >= L.life) { L.l.intensity = 0; continue; }
    L.t += dt; const k = 1 - L.t / L.life;
    L.l.intensity = L.i0 * k * k * (L.flicker ? (1 - L.flicker * 0.5 + Math.random() * L.flicker) : 1);
  }
}

/* =====================================================================
   11. PROCEDURAL AUDIO (WebAudio synthesis, no files)
   ===================================================================== */
export const AU = { ctx: null, master: null, rev: null, noise: null, brown: null, lastImpact: 0, impacts: 0 };
export function initAudio() {
  if (AU.ctx) return;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); AU.ctx = ctx;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
  const master = ctx.createGain(); master.gain.value = 0.85; master.connect(comp); comp.connect(ctx.destination); AU.master = master;
  // generated impulse response reverb
  const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 800 ? i / 800 : 1); }
  const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.32; conv.connect(wet); wet.connect(master); AU.rev = conv;
  const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; AU.noise = nb;
  const bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), bd = bb.getChannelData(0); let last = 0;
  for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; } AU.brown = bb;
  startAmbience();
}
export function out(pos, revAmt = 0.35) {
  // returns an input node routed through distance gain + stereo pan (+ reverb send)
  const ctx = AU.ctx, g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  let vol = 1, pn = 0;
  if (pos) {
    _v1.copy(pos).sub(camera.position); const dist = _v1.length();
    vol = 1 / (1 + dist * 0.045);
    _v1.applyQuaternion(_q1.copy(camera.quaternion).invert()); pn = clamp(_v1.x / (Math.abs(_v1.z) + Math.abs(_v1.x) + 1), -0.85, 0.85);
    revAmt = Math.min(0.9, revAmt + dist * 0.006);
  }
  g.gain.value = vol;
  if (pan) { pan.pan.value = pn; g.connect(pan); pan.connect(AU.master); const s = ctx.createGain(); s.gain.value = revAmt; pan.connect(s); s.connect(AU.rev); }
  else g.connect(AU.master);
  return g;
}
export function noiseSrc(brown = false, rate = 1) { const s = AU.ctx.createBufferSource(); s.buffer = brown ? AU.brown : AU.noise; s.loop = true; s.playbackRate.value = rate; s.start(AU.ctx.currentTime, Math.random() * 2); return s; }
export function envGain(node, t0, a, peak, d, sustain = 0) {
  const g = node.gain; g.cancelScheduledValues(t0); g.setValueAtTime(0.0001, t0); g.linearRampToValueAtTime(peak, t0 + a);
  g.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + d);
}
export function filt(type, f, q = 1) { const b = AU.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
export function osc(type, f) { const o = AU.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
export const SFX = {
  explosion(pos, big = 1) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.5);
    // deep thump
    const th = osc('sine', 120), tg = ctx.createGain(); th.frequency.setValueAtTime(140, t); th.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    envGain(tg, t, 0.005, 1.6 * big, 1.1); th.connect(tg); tg.connect(o); th.start(t); th.stop(t + 1.3);
    // roar
    const n = noiseSrc(true, 0.9), lp = filt('lowpass', 1800, 0.7), ng = ctx.createGain();
    lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(160, t + 2.4);
    envGain(ng, t, 0.01, 2.2 * big, 2.8); n.connect(lp); lp.connect(ng); ng.connect(o); n.stop(t + 3.2);
    // crack
    const c = noiseSrc(false), hp = filt('highpass', 1200), cg = ctx.createGain(); envGain(cg, t, 0.001, 0.9, 0.25); c.connect(hp); hp.connect(cg); cg.connect(o); c.stop(t + 0.4);
    // crackle of embers
    for (let i = 0; i < 14; i++) {
      const tt = t + 0.25 + Math.random() * 2.2, s = noiseSrc(false, 1.5), b = filt('bandpass', 2000 + Math.random() * 3000, 6), g = ctx.createGain();
      envGain(g, tt, 0.001, 0.25 * Math.random(), 0.04); s.connect(b); b.connect(g); g.connect(o); s.stop(tt + 0.1);
    }
  },
  cast(kind) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(null, 0.25);
    const n = noiseSrc(false), bp = filt('bandpass', 600, 1.4), g = ctx.createGain();
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
    envGain(g, t, 0.02, 0.45, 0.3); n.connect(bp); bp.connect(g); g.connect(o); n.stop(t + 0.4);
    const base = [220, 110, 165, 440, 330, 196, 262][kind];
    const s = osc('triangle', base), sg = ctx.createGain(); s.frequency.exponentialRampToValueAtTime(base * 2, t + 0.18);
    envGain(sg, t, 0.01, 0.12, 0.35); s.connect(sg); sg.connect(o); s.start(t); s.stop(t + 0.45);
  },
  whoosh(pos, dur = 0.5, f0 = 400, f1 = 1500, vol = 0.6) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.3);
    const n = noiseSrc(false), bp = filt('bandpass', f0, 0.9), g = ctx.createGain();
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.4); bp.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(o); n.stop(t + dur + 0.1);
  },
  thunder(pos, delay = 0) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.7);
    const c = noiseSrc(false), hp = filt('highpass', 900), cg = ctx.createGain(); envGain(cg, t, 0.001, 1.3, 0.18); c.connect(hp); hp.connect(cg); cg.connect(o); c.stop(t + 0.3);
    const n = noiseSrc(true, 0.6), lp = filt('lowpass', 500), g = ctx.createGain();
    const t1 = t + delay + 0.05; g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.4, t1 + 0.1); g.gain.linearRampToValueAtTime(0.6, t1 + 0.5); g.gain.linearRampToValueAtTime(1.0, t1 + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 3.5);
    lp.frequency.setValueAtTime(900, t1); lp.frequency.exponentialRampToValueAtTime(120, t1 + 3);
    n.connect(lp); lp.connect(g); g.connect(o); n.stop(t1 + 3.6);
  },
  zap(pos, dur = 0.7) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.2);
    const s = osc('sawtooth', 70), m = osc('square', 31), mg = ctx.createGain(); mg.gain.value = 900; m.connect(mg); mg.connect(s.frequency);
    const bp = filt('bandpass', 2500, 0.8), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); for (let i = 0; i < dur * 30; i++) g.gain.setValueAtTime(Math.random() < 0.55 ? 0.3 * Math.random() + 0.05 : 0.01, t + i / 30);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(bp); bp.connect(g); g.connect(o); s.start(t); m.start(t); s.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
    const n = noiseSrc(false), hp = filt('highpass', 4000), ng = ctx.createGain(); envGain(ng, t, 0.01, 0.25, dur); n.connect(hp); hp.connect(ng); ng.connect(o); n.stop(t + dur + 0.1);
  },
  frost(pos) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.6);
    for (let i = 0; i < 16; i++) {
      const tt = t + i * 0.03 + Math.random() * 0.25, f = 1800 + Math.random() * 4200;
      const s = osc('sine', f), g = ctx.createGain(); envGain(g, tt, 0.002, 0.08 + Math.random() * 0.08, 0.6 + Math.random() * 0.9);
      s.connect(g); g.connect(o); s.start(tt); s.stop(tt + 1.6);
    }
    const n = noiseSrc(false), hp = filt('highpass', 3000), g = ctx.createGain(); envGain(g, t, 0.005, 0.5, 0.9); n.connect(hp); hp.connect(g); g.connect(o); n.stop(t + 1.1);
    const cr = noiseSrc(false, 0.5), bp = filt('bandpass', 700, 3), cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t); for (let i = 0; i < 20; i++) cg.gain.setValueAtTime(Math.random() * 0.5, t + 0.05 + i * 0.035); cg.gain.setValueAtTime(0.0001, t + 0.8);
    cr.connect(bp); bp.connect(cg); cg.connect(o); cr.stop(t + 0.9);
  },
  wind(pos) { SFX.whoosh(pos, 1.3, 250, 1100, 1.1); if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.4); const s = osc('sine', 70), g = ctx.createGain(); s.frequency.exponentialRampToValueAtTime(35, t + 0.5); envGain(g, t, 0.005, 0.9, 0.5); s.connect(g); g.connect(o); s.start(t); s.stop(t + 0.7); },
  growth(pos) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.7);
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98];
    notes.forEach((f, i) => { const s = osc('sine', f), s2 = osc('triangle', f * 2.001), g = ctx.createGain(), tt = t + i * 0.09; envGain(g, tt, 0.01, 0.12, 1.4); s.connect(g); s2.connect(g); g.connect(o); s.start(tt); s2.start(tt); s.stop(tt + 1.6); s2.stop(tt + 1.6); });
    const n = noiseSrc(true, 0.5), lp = filt('lowpass', 300), g = ctx.createGain(); envGain(g, t, 0.3, 0.6, 1.8); n.connect(lp); lp.connect(g); g.connect(o); n.stop(t + 2.4);
    // creaking wood as the tree grows
    for (let i = 0; i < 5; i++) { const tt = t + 0.4 + i * 0.35, s = osc('sawtooth', 90 + Math.random() * 60), bp = filt('bandpass', 400, 8), cg = ctx.createGain(); s.frequency.linearRampToValueAtTime(60, tt + 0.3); envGain(cg, tt, 0.05, 0.08, 0.3); s.connect(bp); bp.connect(cg); cg.connect(o); s.start(tt); s.stop(tt + 0.5); }
  },
  impact(pos, kind, strength) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime;
    if (t - AU.lastImpact < 0.035) return; AU.lastImpact = t;
    _v1.copy(pos).sub(camera.position); if (_v1.length() > 70) return;
    const o = out(pos, 0.3), v = clamp(strength / 9, 0.05, 1);
    const wood = kind === K_WOOD || kind === K_CLOTH;
    const n = noiseSrc(false), bp = filt('bandpass', wood ? 380 + Math.random() * 200 : 900 + Math.random() * 900, wood ? 3 : 1.6), g = ctx.createGain();
    envGain(g, t, 0.001, 0.6 * v, wood ? 0.12 : 0.07); n.connect(bp); bp.connect(g); g.connect(o); n.stop(t + 0.2);
    const s = osc('sine', wood ? 140 + Math.random() * 40 : 75 + Math.random() * 30), sg = ctx.createGain(); s.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    envGain(sg, t, 0.002, 0.7 * v, 0.16); s.connect(sg); sg.connect(o); s.start(t); s.stop(t + 0.22);
  },
  step(run) {
    if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime, o = out(null, 0.05);
    const n = noiseSrc(false, 0.7), bp = filt('bandpass', 1400 + Math.random() * 600, 0.8), g = ctx.createGain();
    envGain(g, t, 0.015, run ? 0.12 : 0.08, 0.14); n.connect(bp); bp.connect(g); g.connect(o); n.stop(t + 0.2);
  },
  loop(pos, kind) { // sustained: black hole drone / tornado roar
    if (!AU.ctx) return null; const ctx = AU.ctx, t = ctx.currentTime, o = out(pos, 0.5);
    const master = ctx.createGain(); master.gain.setValueAtTime(0.0001, t); master.gain.linearRampToValueAtTime(1, t + 0.6); master.connect(o);
    const nodes = [];
    if (kind === 'bh') {
      const a = osc('sawtooth', 41), b = osc('sawtooth', 41.7), lp = filt('lowpass', 180, 4), lfo = osc('sine', 0.35), lg = ctx.createGain(); lg.gain.value = 90;
      lfo.connect(lg); lg.connect(lp.frequency); a.connect(lp); b.connect(lp); const g = ctx.createGain(); g.gain.value = 0.55; lp.connect(g); g.connect(master);
      const n = noiseSrc(true, 0.4), bp = filt('bandpass', 300, 1), ng = ctx.createGain(); ng.gain.value = 0.6; n.connect(bp); bp.connect(ng); ng.connect(master);
      bp.frequency.setValueAtTime(150, t); bp.frequency.exponentialRampToValueAtTime(900, t + 6);
      [a, b, lfo].forEach(x => x.start(t)); nodes.push(a, b, lfo, n);
    } else {
      const n = noiseSrc(true, 1), bp = filt('bandpass', 350, 0.7), g = ctx.createGain(); g.gain.value = 1.3; n.connect(bp); bp.connect(g); g.connect(master);
      const lfo = osc('sine', 0.8), lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(t);
      const n2 = noiseSrc(false, 1), hp = filt('bandpass', 2600, 2), g2 = ctx.createGain(); g2.gain.value = 0.18; n2.connect(hp); hp.connect(g2); g2.connect(master);
      nodes.push(n, lfo, n2);
    }
    return { stop(f = 0.8) { const tt = ctx.currentTime; master.gain.cancelScheduledValues(tt); master.gain.setValueAtTime(master.gain.value, tt); master.gain.exponentialRampToValueAtTime(0.0001, tt + f); nodes.forEach(n => n.stop(tt + f + 0.05)); }, out: o };
  },
};
export function startAmbience() {
  const ctx = AU.ctx, t = ctx.currentTime;
  const n = noiseSrc(true, 0.5), bp = filt('lowpass', 500, 0.5), g = ctx.createGain(); g.gain.value = 0.11;
  const lfo = osc('sine', 0.07), lg = ctx.createGain(); lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain); lfo.start(t);
  n.connect(bp); bp.connect(g); g.connect(AU.master);
  const n2 = noiseSrc(false, 0.3), b2 = filt('bandpass', 3200, 0.6), g2 = ctx.createGain(); g2.gain.value = 0.012; n2.connect(b2); b2.connect(g2); g2.connect(AU.master);
  const bird = () => {
    const tt = ctx.currentTime + 0.05, o = out(_v4.set(camera.position.x + R(-40, 40), camera.position.y + 8, camera.position.z + R(-40, 40)), 0.6);
    const base = R(2200, 4200), cnt = RI(2, 6);
    for (let i = 0; i < cnt; i++) {
      const s = osc('sine', base), gg = ctx.createGain(), st = tt + i * R(0.09, 0.16);
      s.frequency.setValueAtTime(base, st); s.frequency.exponentialRampToValueAtTime(base * R(1.2, 1.6), st + 0.05); s.frequency.exponentialRampToValueAtTime(base * R(0.8, 1.0), st + 0.09);
      envGain(gg, st, 0.01, R(0.04, 0.09), 0.09); s.connect(gg); gg.connect(o); s.start(st); s.stop(st + 0.15);
    }
    setTimeout(bird, R(1800, 6500));
  };
  setTimeout(bird, 1500);
}
