// Headless check of the match server: two scripted wizards, one claims the relic and casts the Grand Fissure.
import WebSocket from 'ws';
const URL = process.env.WS || 'ws://localhost:8090/ws';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(URL); const c = { ws, name, id: -1, code: '', snap: null, log: [], pos: [0, 0, 0] };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'welcome') { c.id = m.id; c.code = m.code; } else if (m.t === 'snap') c.snap = m; else if (m.t !== 'push') c.log.push(m); else c.lastPush = m.v; });
  c.ready = new Promise(r => ws.on('open', r));
  c.send = (m) => ws.send(JSON.stringify(m));
  c.at = (x, z) => { c.pos = [x, 0, z]; };
  c.loop = setInterval(() => c.send({ t: 'state', p: c.pos, yaw: 0, pitch: 0, mv: 0 }), 50);
  return c;
}
const me = (c) => c.snap.players.find(p => p.id === c.id);
const A = client('Alaric'), B = client('Brisa');
await A.ready; await B.ready;
A.send({ t: 'create', name: 'Alaric' }); await sleep(300);
B.send({ t: 'join', name: 'Brisa', code: A.code }); await sleep(300);
A.send({ t: 'mode', mode: process.env.MODE || 'score' }); A.send({ t: 'start' }); await sleep(1800);
console.log('phase', A.snap.match.phase, 'mode', A.snap.match.mode, 'players', A.snap.players.length);
// fire at B
A.at(0, 14); B.at(0, 0); await sleep(1500);
A.send({ t: 'cast', cid: 1, spell: 0, origin: [0, 1.6, 14], target: [0, 0, 0.3], normal: [0, 1, 0], dir: [0, 0, -1] });
await sleep(600);
console.log('after fire B hp', me(B).hp, 'hits', B.log.filter(m => m.t === 'hit').map(m => m.dmg));
// relic
A.at(-31, 9.6); await sleep(6500);
console.log('relic', A.snap.relic.state, 'A sage', me(A).sage, 'events', A.log.filter(m => m.t === 'sage').length);
// Grand Fissure at B standing 13 m away
B.at(-31, -3.4); await sleep(1500);
A.send({ t: 'cast', cid: 2, spell: 7, origin: [-31, 0, 9.6], target: [-31, 0, -3.4], normal: [0, 1, 0], dir: [0, 0, -1] });
for (const ms of [300, 1200, 2000, 3000, 4500]) {
  await sleep(ms - (ms === 300 ? 0 : [300, 1200, 2000, 3000, 4500][[300, 1200, 2000, 3000, 4500].indexOf(ms) - 1]));
  const b = me(B); console.log(`+${ms}ms B hp ${b.hp} alive ${b.alive} frozen ${b.frozen.toFixed(1)} | A sage ${me(A).sage} score ${me(A).score} | relic ${A.snap.relic.state}`);
}
console.log('ko events', JSON.stringify(A.log.filter(m => m.t === 'ko')));
// second fissure must be refused (relic spent)
A.send({ t: 'cast', cid: 3, spell: 7, origin: [-31, 0, 9.6], target: [-31, 0, -3.4], normal: [0, 1, 0], dir: [0, 0, -1] });
await sleep(300);
console.log('second fissure accepted?', A.log.filter(m => m.t === 'cast' && m.spell === 7).length > 1);
console.log('relic cooldown left', A.snap.relic.cooldown.toFixed(1));
console.log('match', JSON.stringify(A.snap.match), 'rounds', A.snap.players.map(p => p.name + ':' + p.rounds).join(' '));
process.exit(0);
