import * as THREE from 'three';
import {
  CastEvent, GameMode, MODES, ServerMsg, SPELLS, SPELL_BLOOM, SPELL_FISSURE, SPELL_STORM, TICK_HZ, TUNE, Vec3,
} from '../shared/protocol';
import { renderer, scene, camera, clock, GLOBAL, LOWSPEC, getPixelRatio, R, RI } from './engine/core';
import { updateFx, pushers, updateGrowFlowers } from './engine/world';
import { PHYS_DT, physicsStep, activeList, pieces, S_DEAD, supportSweep, updatePieceFx, updateDebrisFade, prunePieces, flushPieceBuffers, clearWorld, PH, groundH } from './engine/pieces';
import { buildWorld, updateWindmill } from './engine/structures';
import { FXA, FXS, SFX, initAudio, updateLights, SH_SMOKE, C } from './engine/fx';
import {
  aim, fieldPositions, playCast, updateProjectiles, updateEffects, updateGroundFires, updateShards, GR, addShake, bhDiskMat, bhGlowMat, tornadoMat, boltCore, ringGeo,
} from './engine/spells';
import { G, me } from './game/state';
import { staff, updateStaff, setSleeveColor } from './game/staff';
import { player, keys, updatePlayer, updateCamera, updateAim, applyPush, teleport } from './game/player';
import { composer, updatePost, updateSun, setPR } from './game/post';
import { syncAvatars, updateAvatars, tipOf, feetOf, clearAvatars } from './game/avatars';
import { updateRelic } from './game/relic';
import { net } from './game/net';
import * as UI from './game/ui';
import './style.css';

const $ = UI.$;

// ------------------------------------------------------------------ world
buildWorld();
UI.buildBar((i) => UI.selectSpell(i));
UI.buildModes((m: GameMode) => net.send({ t: 'mode', mode: m }));
UI.selectSpell(0);

// ------------------------------------------------------------------ casting
function tryCast() {
  if (!G.inMatch || !G.alive) return;
  if (G.frozen > 0) { UI.banner('You are frozen solid', '', 1); return; }
  if (G.match.phase === 'roundEnd' || G.match.phase === 'over') return;
  const s = G.curSpell;
  if (s === SPELL_FISSURE) { if (!G.sage) { UI.selectSpell(0); return; } }
  else if (G.cooldowns[s] > 0) return;
  const cid = G.castCounter++;
  const tip = staff.tipWorld.clone(), to = aim.point.clone(), n = aim.normal.clone();
  const dir = to.clone().sub(camera.position).normalize();
  const feet = player.pos.clone();
  const origin = s === SPELL_FISSURE ? feet : tip;
  let strikes: [number, number][] | undefined, seed: number | undefined;
  if (s === SPELL_STORM) { strikes = [[0, 0]]; for (let i = 0; i < 4; i++) { const a = R(0, 6.28), d = R(1.5, TUNE.storm.maxOffset - 0.2); strikes.push([Math.cos(a) * d, Math.sin(a) * d]); } }
  if (s === SPELL_BLOOM) seed = RI(1, 1e6);
  const v3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
  net.send({ t: 'cast', cid, spell: s, origin: v3(origin), target: v3(to), normal: v3(n), dir: v3(dir), strikes, seed });
  if (s !== SPELL_FISSURE) G.cooldowns[s] = SPELLS[s].cd;
  else { G.sage = false; UI.selectSpell(0); }
  staff.cast = 1; staff.flare = 1;
  playCast(s, origin, to, n, dir, { key: `${G.myId}:${cid}`, strikes, seed, fromFn: () => staff.tipWorld, local: true });
}
function remoteCast(ev: CastEvent) {
  if (ev.by === G.myId) return;
  const o = new THREE.Vector3(...ev.origin), to = new THREE.Vector3(...ev.target), n = new THREE.Vector3(...ev.normal), dir = new THREE.Vector3(...ev.dir);
  const from = ev.spell === SPELL_FISSURE ? (feetOf(ev.by)?.clone() ?? o) : (tipOf(ev.by)?.clone() ?? o);
  if (ev.spell === SPELL_FISSURE) { from.x = o.x; from.z = o.z; from.y = groundH(o.x, o.z); }
  playCast(ev.spell, from, to, n, dir, { key: `${ev.by}:${ev.cid}`, strikes: ev.strikes, seed: ev.seed, fromFn: () => tipOf(ev.by) ?? o });
}

// ------------------------------------------------------------------ input
const canvas = renderer.domElement;
const look = G.look;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => { if (!G.inMatch) return; look.dragging = true; look.moved = 0; look.lx = e.clientX; look.ly = e.clientY; look.button = e.button; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!look.dragging) return;
  const dx = e.clientX - look.lx, dy = e.clientY - look.ly; look.lx = e.clientX; look.ly = e.clientY;
  look.moved += Math.abs(dx) + Math.abs(dy);
  const s = 0.0034; player.yaw -= dx * s; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * s));
  look.dyaw += dx * s; look.dpitch += dy * s;
});
canvas.addEventListener('pointerup', () => { if (!look.dragging) return; look.dragging = false; if (look.moved < 7 && look.button === 0) tryCast(); });
canvas.addEventListener('wheel', (e) => { if (!G.inMatch) return; const n = G.sage ? 8 : 7; UI.selectSpell((G.curSpell + (e.deltaY > 0 ? 1 : n - 1)) % n); }, { passive: true });
addEventListener('keydown', (e) => {
  if (!G.inMatch || (e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 7) UI.selectSpell(n - 1); if (n === 8) UI.selectSpell(SPELL_FISSURE); }
  if (e.code === 'KeyG') UI.selectSpell(SPELL_FISSURE);
  if (e.code === 'KeyF') tryCast();
  if (e.code === 'KeyH') { const h = $('help'); h.style.opacity = h.style.opacity === '0' ? '1' : '0'; }
  if (e.code === 'Tab') { e.preventDefault(); $('scores').hidden = false; }
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') $('scores').hidden = true; });

// ------------------------------------------------------------------ menu
const nameIn = $<HTMLInputElement>('name'), codeIn = $<HTMLInputElement>('code');
try { nameIn.value = localStorage.getItem('arcanum.name') || ''; } catch { /* storage blocked */ }
const params = new URLSearchParams(location.search);
if (params.get('room')) codeIn.value = params.get('room').toUpperCase();
async function enter(kind: 'create' | 'join') {
  const name = nameIn.value.trim() || `Wizard ${RI(10, 99)}`;
  try { localStorage.setItem('arcanum.name', name); } catch { /* storage blocked */ }
  const code = codeIn.value.trim().toUpperCase();
  if (kind === 'join' && code.length !== 4) { $('menuerr').textContent = 'Enter the four-letter match code your friend shared.'; return; }
  $('menuerr').textContent = ''; ($('createbtn') as HTMLButtonElement).disabled = ($('joinbtn') as HTMLButtonElement).disabled = true;
  initAudio();
  try {
    if (!net.ws || net.ws.readyState !== WebSocket.OPEN) await net.connect();
    net.send(kind === 'create' ? { t: 'create', name } : { t: 'join', name, code });
  } catch (err) {
    $('menuerr').textContent = (err as Error).message;
    ($('createbtn') as HTMLButtonElement).disabled = ($('joinbtn') as HTMLButtonElement).disabled = false;
  }
}
$('createbtn').addEventListener('click', () => enter('create'));
$('joinbtn').addEventListener('click', () => enter('join'));
codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter('join'); });
nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(codeIn.value.trim() ? 'join' : 'create'); });
$('startbtn').addEventListener('click', () => net.send({ t: 'start' }));
$('lobbybtn').addEventListener('click', () => net.send({ t: 'lobby' }));
$('copycode').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?room=${G.roomCode}${params.get('server') ? `&server=${params.get('server')}` : ''}`;
  try { await navigator.clipboard.writeText(link); $('copycode').textContent = 'Copied'; } catch { $('copycode').textContent = G.roomCode; }
  setTimeout(() => { $('copycode').textContent = 'Copy'; }, 1500);
});

// ------------------------------------------------------------------ network events
let lastSnapAlive = true;
let deathTimer = 0;
net.onClose = (reason) => {
  if (!G.inMatch) return;
  G.inMatch = false; clearAvatars();
  $('hud').hidden = true; $('room').hidden = true; $('over').hidden = true; $('menu').hidden = false;
  $('menuerr').textContent = `${reason} Create or join a match to play again.`;
  ($('createbtn') as HTMLButtonElement).disabled = ($('joinbtn') as HTMLButtonElement).disabled = false;
};
net.onMessage = (m: ServerMsg) => {
  switch (m.t) {
    case 'welcome':
      G.myId = m.id; G.roomCode = m.code; G.inMatch = true; setSleeveColor(m.color);
      $('menu').hidden = true; $('hud').hidden = false;
      history.replaceState(null, '', `?room=${m.code}${params.get('server') ? `&server=${params.get('server')}` : ''}${LOWSPEC ? '&lowspec' : ''}`);
      UI.banner('Welcome to the Shattered Meadow', `Match code ${m.code}. Share it with up to 3 friends.`, 4);
      break;
    case 'error':
      $('menuerr').textContent = m.message;
      ($('createbtn') as HTMLButtonElement).disabled = ($('joinbtn') as HTMLButtonElement).disabled = false;
      break;
    case 'snap': {
      G.players.clear(); for (const p of m.players) G.players.set(p.id, p);
      G.relic = m.relic;
      const prevPhase = G.match.phase; G.match = m.match;
      if (prevPhase !== 'over' && m.match.phase === 'over') { /* handled by 'over' */ }
      if (prevPhase === 'over' && m.match.phase !== 'over') UI.hideOver();
      if (prevPhase !== 'roundEnd' && m.match.phase === 'roundEnd' && m.match.banner) UI.banner(m.match.banner, 'Next round in 5 seconds', 4.5);
      if (prevPhase === 'lobby' && m.match.phase === 'playing') UI.banner(MODES[m.match.mode].name, MODES[m.match.mode].blurb, 4);
      const mine = me();
      if (mine) {
        G.hp = mine.hp; G.frozen = mine.frozen; G.shield = mine.shield; G.sage = mine.sage;
        if (G.curSpell === SPELL_FISSURE && !G.sage) UI.selectSpell(0);
        if (lastSnapAlive && !mine.alive) G.alive = false;
        if (!lastSnapAlive && mine.alive) { G.alive = true; UI.hideDeath(); }
        lastSnapAlive = mine.alive;
      }
      syncAvatars(m.players, G.myId);
      fieldPositions.clear(); for (const f of m.fields) fieldPositions.set(f.k, { x: f.x, z: f.z });
      break;
    }
    case 'cast': remoteCast(m); break;
    case 'push': applyPush(m.v); break;
    case 'hit':
      if (m.victim === G.myId) { G.hurt = Math.min(1.2, G.hurt + m.dmg / 40); addShake(player.pos, Math.min(0.8, m.dmg / 50)); }
      if (m.by === G.myId && m.victim !== G.myId) UI.hitMarker(m.dmg);
      break;
    case 'ko': {
      const verb = m.fissure ? '<span class="fx">split the earth beneath</span>' : 'knocked out';
      UI.feed(m.by >= 0 ? `${UI.nameHtml(m.by)} ${verb} ${UI.nameHtml(m.victim)}` : `${UI.nameHtml(m.victim)} fell`);
      if (m.victim === G.myId) {
        G.alive = false; lastSnapAlive = false;
        const by = m.by >= 0 && m.by !== G.myId ? UI.playerName(m.by) : '';
        const respawn = G.match.mode !== 'last' || G.match.phase !== 'playing';
        UI.showDeath(m.fissure ? 'Swallowed by the Grand Fissure' : 'Knocked out', `${by ? `by ${by}. ` : ''}${respawn ? 'Rising again in 3 seconds' : 'Watch the duel until the next round'}`);
        clearTimeout(deathTimer);
      } else if (m.by === G.myId) UI.banner(m.fissure ? `The earth swallowed ${UI.playerName(m.victim)}` : `You knocked out ${UI.playerName(m.victim)}`, m.fissure ? '+3 points' : '+1 point', 2);
      break;
    }
    case 'respawn':
      teleport(m.p[0], m.p[2]); G.alive = true; lastSnapAlive = true; UI.hideDeath();
      G.cooldowns.fill(0);
      break;
    case 'sage':
      if (m.id === G.myId) { G.sage = true; UI.banner('You are the Grand Sage', 'Press G, then click to unleash the Grand Fissure. It works once.', 5); SFX.thunder(player.pos, 0.2); }
      else UI.banner(`${UI.playerName(m.id)} is the Grand Sage`, 'Stay out of the line of their staff', 3.5);
      UI.feed(`${UI.nameHtml(m.id)} <span class="fx">claimed the Sage Relic</span>`);
      break;
    case 'relicReset': UI.feed('The Sage Relic returns to the altar'); break;
    case 'reset': clearWorld(); buildWorld(); break;
    case 'over': {
      const unit = G.match.mode === 'score' ? 'pts' : 'rounds';
      UI.showOver(m.title, m.standings, m.winners, G.match.mode === 'score' ? 'pts' : unit);
      break;
    }
  }
};

// ------------------------------------------------------------------ loop
let sendAcc = 0;
function sendState(dt: number) {
  sendAcc += dt; if (sendAcc < 1 / TICK_HZ) return; sendAcc = 0;
  net.send({ t: 'state', p: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw, pitch: player.pitch, mv: Math.hypot(player.vel.x, player.vel.z) });
}
function processImpacts() {
  const list = PH.impacts; if (!list.length) return;
  let n = 0;
  for (const [p, s] of list) {
    if (n++ > 6) break;
    SFX.impact(new THREE.Vector3(p.x, p.y, p.z), p.kind, s);
    if (s > 4 && p.miny < groundH(p.x, p.z) + 0.3) for (let i = 0; i < 3; i++) FXS.emit({ x: p.x + R(-.3, .3), y: p.miny + 0.1, z: p.z + R(-.3, .3), vx: R(-1.5, 1.5), vy: R(0.3, 1.2), vz: R(-1.5, 1.5), life: R(1.2, 2.4), s0: 0.4 * p.rad + 0.3, s1: 1.5 * p.rad + 0.8, c0: C(0x8a7d68), c1: C(0xaea590), a: 0.35, shape: SH_SMOKE, drag: 1.5, fin: 0.1 });
  }
  list.length = 0;
}
let physAcc = 0;
function simulate(dt: number) {
  GLOBAL.time.value += dt;
  updatePlayer(dt, G.inMatch);
  updateCamera(dt);
  updateAim();
  for (let i = 0; i < G.cooldowns.length; i++) G.cooldowns[i] = Math.max(0, G.cooldowns[i] - dt);
  G.frozen = Math.max(0, G.frozen - dt); G.shield = Math.max(0, G.shield - dt);
  physAcc += dt; let steps = 0;
  while (physAcc >= PHYS_DT && steps < 2) { physicsStep(PHYS_DT); physAcc -= PHYS_DT; steps++; }
  if (steps === 2) physAcc = Math.min(physAcc, PHYS_DT);
  processImpacts(); supportSweep();
  updateWindmill(dt);
  updateProjectiles(dt); updateEffects(dt); updateGroundFires(dt); updateShards(); updateGrowFlowers();
  updateFx(dt); updatePieceFx(dt); updateDebrisFade(dt); prunePieces();
  updateStaff(dt, player.bobK, player.bob);
  updateAvatars(dt); updateRelic(dt);
  updateSun();
  pushers[7].set(player.pos.x, player.pos.z, 0.9, 0.35);
  FXA.update(dt); FXS.update(dt);
  updateLights(dt);
  flushPieceBuffers();
  updatePost(dt);
  if (G.inMatch) { sendState(dt); UI.updateBar(); UI.updateHud(); }
}
const statsEl = $('stats');
let fpsAcc = 0, fpsN = 0, drAcc = 0;
const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5);
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), dt = Math.min(raw, 1 / 20);
  simulate(dt);
  composer.render();
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.5) {
    const fps = fpsN / fpsAcc;
    statsEl.textContent = `${fps.toFixed(0)} fps · ${activeList.length} moving · ${getPixelRatio().toFixed(2)}x`;
    if (G.inMatch) {
      if (fps < 42 && getPixelRatio() > 0.6) setPR(getPixelRatio() - 0.1);
      else if (fps > 58 && getPixelRatio() < MAX_PR - 0.01) { if (++drAcc > 6) { drAcc = 0; setPR(Math.min(MAX_PR, getPixelRatio() + 0.05)); } }
    }
    fpsAcc = 0; fpsN = 0;
  }
}
// warm up shader programs so the first casts don't hitch
{
  const warm: THREE.Mesh[] = [bhDiskMat(), bhGlowMat(), tornadoMat(0), boltCore].map(mt => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mt));
  warm.push(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
  warm.forEach(m => { m.position.set(0, -500, 0); scene.add(m); });
  renderer.compile(scene, camera);
  warm.forEach(m => scene.remove(m));
}
// title-screen camera: a slow orbit over the meadow
player.pos.set(-6, groundH(-6, 34), 34); player.yaw = 0.12; player.pitch = -0.04;
updateCamera(0); updateSun();
frame();
$('loading').textContent = 'The meadow is ready.';
($('createbtn') as HTMLButtonElement).disabled = false; ($('joinbtn') as HTMLButtonElement).disabled = false;

// test hook for automated checks (harmless in play)
(window as any).__arcanum = { G, player, aim, tryCast, simulate, advance: (s: number) => { for (let t = 0; t < s; t += 1 / 60) simulate(1 / 60); }, pieces: () => pieces.filter(p => p.state !== S_DEAD).length };
