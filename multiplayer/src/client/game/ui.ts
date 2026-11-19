import * as THREE from 'three';
import { GameMode, MODES, MAX_HP, SPELLS, SPELL_FISSURE, ROUNDS_TO_WIN } from '../../shared/protocol';
import { drawIcon, runeTex, aimRune, aimRune2 } from '../engine/spells';
import { AU, out, osc, envGain } from '../engine/fx';
import { G, me, isHost } from './state';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + new THREE.Color(c).getHexString();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- spell bar
const slots: (HTMLDivElement & { cd?: HTMLDivElement })[] = [];
export function buildBar(onPick: (i: number) => void) {
  const bar = $('bar');
  SPELLS.forEach((sp, i) => {
    const d = document.createElement('div') as HTMLDivElement & { cd?: HTMLDivElement };
    d.className = 'slot' + (i === SPELL_FISSURE ? ' ult locked' : ''); d.style.setProperty('--sc', hex(sp.color));
    d.appendChild(drawIcon(i));
    const k = document.createElement('div'); k.className = 'key'; k.textContent = i === SPELL_FISSURE ? 'G' : String(i + 1); d.appendChild(k);
    const cd = document.createElement('div'); cd.className = 'cd'; d.appendChild(cd); d.cd = cd;
    d.title = sp.name;
    d.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPick(i); });
    bar.appendChild(d); slots.push(d);
  });
}
let nameTimer = 0;
export function selectSpell(i: number) {
  if (i === SPELL_FISSURE && !G.sage) { banner('Only the Grand Sage can split the earth', 'Claim the Sage Relic at the golden beam in the ruins', 2.2); return; }
  G.curSpell = i;
  aimRune.material.map = runeTex[i]; aimRune.material.color.set(SPELLS[i].color).multiplyScalar(2.2);
  aimRune2.material.map = runeTex[(i + 3) % SPELLS.length]; aimRune2.material.color.set(SPELLS[i].color).multiplyScalar(1.6);
  document.documentElement.style.setProperty('--c', hex(SPELLS[i].color));
  slots.forEach((s, k) => s.classList.toggle('active', k === i));
  const nm = $('spellname'), ds = $('spelldesc');
  nm.textContent = SPELLS[i].name; ds.textContent = SPELLS[i].desc; nm.style.opacity = '1'; ds.style.opacity = '0.8';
  clearTimeout(nameTimer); nameTimer = window.setTimeout(() => { nm.style.opacity = '0'; ds.style.opacity = '0'; }, 2600);
  if (AU.ctx) { const t = AU.ctx.currentTime, o = out(null, 0.4), s = osc('sine', 660 + i * 70), g = AU.ctx.createGain(); envGain(g, t, 0.005, 0.07, 0.25); s.connect(g); g.connect(o); s.start(t); s.stop(t + 0.3); }
}
export function updateBar() {
  slots.forEach((s, i) => {
    if (i === SPELL_FISSURE) { s.classList.toggle('locked', !G.sage); s.classList.toggle('ready', G.sage); return; }
    s.cd.style.setProperty('--p', (Math.max(0, G.cooldowns[i]) / SPELLS[i].cd * 100).toFixed(1) + '%');
  });
}

// ---------- banners, feed, hit marker
let bannerTimer = 0;
export function banner(text: string, sub = '', seconds = 3) {
  const b = $('banner'); b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : ''); b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('show'), seconds * 1000);
}
export function feed(html: string) {
  const ul = $('feed'), li = document.createElement('li'); li.innerHTML = html; ul.prepend(li);
  while (ul.children.length > 5) ul.lastElementChild.remove();
  setTimeout(() => { li.style.opacity = '0'; setTimeout(() => li.remove(), 900); }, 6000);
}
export function nameHtml(id: number) { const p = G.players.get(id); return p ? `<span style="color:${hex(p.color)}">${esc(p.name)}</span>` : 'Someone'; }
export function playerName(id: number) { return G.players.get(id)?.name ?? 'Someone'; }
let hitTimer = 0;
export function hitMarker(dmg: number) {
  const c = $('cross'), n = $('hitnum');
  c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
  n.textContent = String(dmg); n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
  clearTimeout(hitTimer); hitTimer = window.setTimeout(() => { c.classList.remove('hit'); n.classList.remove('show'); }, 120);
}

// ---------- room panel
export function buildModes(onMode: (m: GameMode) => void) {
  const box = $('modes');
  (Object.keys(MODES) as GameMode[]).forEach((m) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mode'; b.dataset.mode = m;
    b.innerHTML = `<strong>${MODES[m].name}</strong><span>${MODES[m].blurb}</span>`;
    b.addEventListener('click', () => onMode(m));
    box.appendChild(b);
  });
}
let rosterKey = '';
export function updateRoom() {
  const inLobby = G.match.phase === 'lobby';
  $('room').hidden = !inLobby;
  if (!inLobby) return;
  const host = isHost();
  const list = [...G.players.values()];
  const key = list.map(p => `${p.id}${p.name}${p.color}${p.host}`).join('|') + G.match.mode + host;
  if (key !== rosterKey) {
    rosterKey = key;
    $('roster').innerHTML = list.map(p => `<li><span class="dot" style="background:${hex(p.color)};color:${hex(p.color)}"></span><span class="who">${esc(p.name)}${p.id === G.myId ? ' (you)' : ''}</span>${p.host ? '<span class="badge">HOST</span>' : ''}</li>`).join('') + (list.length < 4 ? `<li class="hint">${4 - list.length} open seat${list.length === 3 ? '' : 's'}</li>` : '');
    document.querySelectorAll<HTMLButtonElement>('.mode').forEach(b => { b.classList.toggle('sel', b.dataset.mode === G.match.mode); b.disabled = !host; });
    $('startbtn').hidden = !host; $('waithost').hidden = host;
  }
  $('roomcode').textContent = G.roomCode;
}

// ---------- HUD readouts
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function updateHud() {
  const M = G.match, mine = me();
  $('mi-mode').textContent = M.phase === 'lobby' ? 'Lobby · free practice' : `${MODES[M.mode].name}${M.mode !== 'score' ? ` · Round ${M.round}` : ''}`;
  $('mi-clock').textContent = M.phase === 'lobby' ? `${G.players.size}/4 wizards` : M.mode === 'score' ? fmt(M.timeLeft) : M.phase === 'roundEnd' ? `Next round ${Math.ceil(M.timeLeft)}` : `First to ${ROUNDS_TO_WIN}`;
  const list = [...G.players.values()].sort((a, b) => (M.mode === 'score' ? b.score - a.score : b.rounds - a.rounds) || b.kos - a.kos);
  $('mi-board').innerHTML = M.phase === 'lobby' ? '' : list.map(p => `<li class="${p.id === G.myId ? 'me' : ''}"><span class="pdot" style="background:${hex(p.color)}"></span><span class="n">${esc(p.name)}${p.sage ? ' ✦' : ''}${p.alive ? '' : ' ✝'}</span><span class="v">${M.mode === 'score' ? p.score : p.rounds}</span></li>`).join('');
  // relic
  const R = G.relic;
  let txt = '';
  if (R.state === 'altar') {
    if (R.contested) txt = 'Relic contested! Clear the altar';
    else if (R.progress > 0 && R.capper >= 0) txt = `${playerName(R.capper)} is claiming the relic`;
    else txt = 'Sage Relic waits at the altar (golden beam)';
  } else if (R.state === 'held') txt = `${playerName(R.holder)} is the Grand Sage`;
  else txt = `The relic reforms in ${Math.ceil(R.cooldown)}s`;
  $('relictext').textContent = txt;
  $('relicfill').style.width = (R.state === 'altar' ? R.progress * 100 : R.state === 'held' ? 100 : 0) + '%';
  // vitals
  const hp = mine ? mine.hp : MAX_HP;
  $('hpfill').style.width = (hp / MAX_HP * 100) + '%'; $('hptext').textContent = `${hp} / ${MAX_HP}`; $('hpbar').classList.toggle('low', hp < 30);
  const chips: string[] = [];
  if (G.frozen > 0) chips.push(`<span class="chip frost">Frozen ${G.frozen.toFixed(1)}s</span>`);
  if (G.shield > 0) chips.push('<span class="chip shield">Shielded</span>');
  if (G.sage) chips.push('<span class="chip sage">Grand Sage · press G</span>');
  $('chips').innerHTML = chips.join('');
  // scoreboard
  if (!$('scores').hidden) $('scorebody').innerHTML = list.map(p => `<tr><td><span class="pdot" style="display:inline-block;background:${hex(p.color)}"></span> ${esc(p.name)}${p.sage ? ' ✦' : ''}</td><td>${p.score}</td><td>${p.kos}</td><td>${p.rounds}</td></tr>`).join('');
  updateRoom();
}
export function showDeath(title: string, sub: string) { $('deathtitle').textContent = title; $('deathsub').textContent = sub; $('death').hidden = false; }
export function hideDeath() { $('death').hidden = true; }
export function showOver(title: string, standings: { id: number; name: string; value: number }[], winners: number[], unit: string) {
  $('overtitle').textContent = title;
  $('overlist').innerHTML = standings.map(s => `<li class="${winners.includes(s.id) ? 'win' : ''}"><span class="n">${esc(s.name)}${winners.includes(s.id) ? ' ✦ Grand Sage' : ''}</span><span>${s.value} ${unit}</span></li>`).join('');
  $('lobbybtn').hidden = !isHost(); $('overwait').hidden = isHost();
  $('over').hidden = false;
}
export function hideOver() { $('over').hidden = true; }
export { $ };
