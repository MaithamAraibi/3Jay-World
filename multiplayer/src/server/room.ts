import type { WebSocket } from 'ws';
import {
  ALTAR, CastEvent, ClientMsg, FieldSnap, GameMode, MAX_HP, MAX_PLAYERS, MODES, PLAYER_COLORS, PROJECTILE_SPEED, PlayerSnap,
  RESPAWN_SECONDS, ROUNDS_TO_WIN, SCORE_MATCH_SECONDS, SPAWNS, SPAWN_SHIELD_SECONDS, SPELLS, SPELL_BLOOM, SPELL_FIRE, SPELL_FISSURE,
  SPELL_FROST, SPELL_GALE, SPELL_STORM, SPELL_TORNADO, SPELL_VOID, ServerMsg, TICK_HZ, TUNE, Vec3, segDist,
} from '../shared/protocol.js';

interface Player {
  id: number; ws: WebSocket; name: string; color: number;
  p: Vec3; yaw: number; pitch: number; mv: number;
  hp: number; alive: boolean; frozenUntil: number; shieldUntil: number; respawnAt: number;
  sage: boolean; score: number; rounds: number; kos: number; castSeq: number;
  cooldowns: number[]; lastStateAt: number; lastHitBy: number; lastHitAt: number; fissureMarkUntil: number; fissureBy: number;
}
interface Field {
  k: string; kind: 'void' | 'tornado' | 'hole'; by: number; x: number; y: number; z: number;
  born: number; life: number; tx: number; tz: number; vx: number; vz: number; hx: number; hz: number; fissure: boolean;
}
interface Pending { at: number; run: () => void }

const now = () => performance.now() / 1000;
const rnd = (a: number, b: number) => a + (b - a) * Math.random();

export class Room {
  readonly code: string;
  players = new Map<number, Player>();
  hostId = -1;
  mode: GameMode = 'score';
  phase: 'lobby' | 'playing' | 'roundEnd' | 'over' = 'lobby';
  round = 0;
  matchEndsAt = 0;
  phaseEndsAt = 0;
  banner = '';
  fields: Field[] = [];
  pending: Pending[] = [];
  relic = { state: 'altar' as 'altar' | 'held' | 'cooldown', holder: -1, capper: -1, progress: 0, contested: false, cooldownUntil: 0 };
  private timer: ReturnType<typeof setInterval>;
  private nextId = 1;
  private lastTick = now();
  private worldSeed = 1;

  constructor(code: string, private onEmpty: (code: string) => void) {
    this.code = code;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  // ------------------------------------------------------------------ membership
  add(ws: WebSocket, name: string): Player | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    const used = new Set([...this.players.values()].map(p => p.color));
    const color = PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[0];
    const id = this.nextId++;
    const sp = this.spawnPoint();
    const pl: Player = {
      id, ws, name: (name || 'Wizard').slice(0, 16), color, p: sp, yaw: 0, pitch: 0, mv: 0,
      hp: MAX_HP, alive: true, frozenUntil: 0, shieldUntil: now() + SPAWN_SHIELD_SECONDS, respawnAt: 0,
      sage: false, score: 0, rounds: 0, kos: 0, castSeq: 0, cooldowns: SPELLS.map(() => 0), lastStateAt: now(), lastHitBy: -1, lastHitAt: 0, fissureMarkUntil: 0, fissureBy: -1,
    };
    // joining a Last Standing round in progress: wait for the next round
    if (this.phase === 'playing' && this.mode === 'last') { pl.alive = false; pl.hp = 0; }
    this.players.set(id, pl);
    if (this.hostId < 0) this.hostId = id;
    this.send(pl, { t: 'welcome', id, code: this.code, color });
    this.send(pl, { t: 'reset', seed: this.worldSeed });
    this.send(pl, { t: 'respawn', p: sp });
    return pl;
  }
  remove(id: number) {
    const pl = this.players.get(id); if (!pl) return;
    if (pl.sage) this.dropRelic();
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.size ? [...this.players.keys()][0] : -1;
    if (!this.players.size) { clearInterval(this.timer); this.onEmpty(this.code); }
  }

  // ------------------------------------------------------------------ messages
  handle(pl: Player, m: ClientMsg) {
    switch (m.t) {
      case 'mode': if (pl.id === this.hostId && this.phase !== 'playing' && MODES[m.mode]) this.mode = m.mode; break;
      case 'start': if (pl.id === this.hostId && this.phase !== 'playing') this.startMatch(); break;
      case 'lobby': if (pl.id === this.hostId && this.phase !== 'playing') {
        this.phase = 'lobby'; this.banner = '';
        for (const p of this.players.values()) if (!p.alive) p.respawnAt = now() + 0.5;
      } break;
      case 'state': {
        if (!valid3(m.p)) return;
        if (!pl.alive || now() < pl.frozenUntil) { pl.yaw = num(m.yaw); pl.pitch = num(m.pitch); pl.mv = 0; if (!pl.alive) return; }
        // follow the client, but never faster than 60 m/s (blocks teleport cheats, tolerates knockback)
        const t = now(), maxD = 60 * Math.min(0.5, t - pl.lastStateAt) + 0.5; pl.lastStateAt = t;
        const dx = m.p[0] - pl.p[0], dy = m.p[1] - pl.p[1], dz = m.p[2] - pl.p[2], d = Math.hypot(dx, dy, dz);
        if (d <= maxD) pl.p = m.p;
        else { const k = maxD / d; pl.p = [pl.p[0] + dx * k, pl.p[1] + dy * k, pl.p[2] + dz * k]; }
        pl.yaw = num(m.yaw); pl.pitch = num(m.pitch); pl.mv = num(m.mv);
        break;
      }
      case 'cast': this.cast(pl, m); break;
    }
  }

  private cast(pl: Player, m: Extract<ClientMsg, { t: 'cast' }>) {
    const t = now();
    const s = m.spell | 0;
    if (!SPELLS[s] || !valid3(m.target) || !valid3(m.origin)) return;
    if (!pl.alive || t < pl.frozenUntil) return;
    if (this.phase === 'roundEnd' || this.phase === 'over') return;
    if (s === SPELL_FISSURE) { if (!pl.sage) return; }
    else if (t < pl.cooldowns[s] - 0.15) return;
    if (Math.hypot(m.target[0] - pl.p[0], m.target[2] - pl.p[2]) > TUNE.maxCastRange) return;
    pl.cooldowns[s] = t + SPELLS[s].cd;
    pl.castSeq++;
    const ev: CastEvent = { t: 'cast', by: pl.id, cid: m.cid | 0, spell: s, origin: m.origin, target: m.target, normal: valid3(m.normal) ? m.normal : [0, 1, 0], dir: valid3(m.dir) ? m.dir : [0, 0, -1] };
    if (s === SPELL_STORM && Array.isArray(m.strikes)) ev.strikes = m.strikes.slice(0, 5).map(([x, z]) => [clampAbs(num(x), TUNE.storm.maxOffset), clampAbs(num(z), TUNE.storm.maxOffset)] as [number, number]);
    if (s === SPELL_BLOOM) ev.seed = ((m.seed ?? 0) | 0) || 1;
    this.broadcast(ev);

    const [tx, ty, tz] = m.target;
    const delay = SPELLS[s].projectile ? Math.hypot(tx - m.origin[0], ty - m.origin[1], tz - m.origin[2]) / PROJECTILE_SPEED : 0;
    const key = `${pl.id}:${ev.cid}`;
    const at = t + delay;
    switch (s) {
      case SPELL_FIRE: this.later(at, () => this.blast(pl.id, s, tx, ty, tz, TUNE.fire.radius, TUNE.fire.damage, TUNE.fire.knock, 0.5)); break;
      case SPELL_VOID: this.later(at, () => this.fields.push(this.field(key, 'void', pl.id, tx, ty + 2.6, tz, TUNE.void.life))); break;
      case SPELL_TORNADO: this.later(at, () => this.fields.push(this.field(key, 'tornado', pl.id, tx, ty, tz, TUNE.tornado.life))); break;
      case SPELL_FROST: this.later(at, () => this.frost(pl.id, tx, tz, TUNE.frost.radius, TUNE.frost.damage, TUNE.frost.freeze, s)); break;
      case SPELL_STORM: {
        const strikes = ev.strikes && ev.strikes.length ? ev.strikes : [[0, 0]];
        TUNE.storm.strikeTimes.forEach((st, i) => {
          const o = strikes[i % strikes.length];
          this.later(t + st, () => this.blast(pl.id, s, tx + o[0], ty, tz + o[1], TUNE.storm.radius, TUNE.storm.damage, 7, 0.6));
        });
        break;
      }
      case SPELL_GALE: this.blast(pl.id, s, tx, ty, tz, TUNE.gale.radius, TUNE.gale.damage, TUNE.gale.knock, 0.3, ev.dir); break;
      case SPELL_BLOOM: this.later(at, () => {
        for (const v of this.alive()) if (Math.hypot(v.p[0] - tx, v.p[2] - tz) < TUNE.bloom.radius) v.hp = Math.min(MAX_HP, v.hp + TUNE.bloom.heal);
      }); break;
      case SPELL_FISSURE: this.fissure(pl, m.origin, m.target); break;
    }
  }

  // ------------------------------------------------------------------ effects on players
  private blast(by: number, spell: number, x: number, y: number, z: number, r: number, dmg: number, knock: number, up: number, dir?: Vec3) {
    for (const v of this.alive()) {
      if (v.id === by) continue;
      const dx = v.p[0] - x, dy = v.p[1] + 1 - y, dz = v.p[2] - z, d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const f = 1 - d / r;
      const l = Math.hypot(dx, dz) || 1;
      let px = dx / l, pz = dz / l;
      if (dir) { px = px * 0.5 + dir[0]; pz = pz * 0.5 + dir[2]; const n = Math.hypot(px, pz) || 1; px /= n; pz /= n; }
      this.push(v, [px * knock * f, knock * up * f + 3, pz * knock * f]);
      this.damage(v, by, dmg * (0.35 + 0.65 * f), spell);
    }
  }
  private frost(by: number, x: number, z: number, r: number, dmg: number, freeze: number, spell: number) {
    const t = now();
    for (const v of this.alive()) {
      if (v.id === by) continue;
      const d = Math.hypot(v.p[0] - x, v.p[2] - z);
      if (d > r) continue;
      v.frozenUntil = Math.max(v.frozenUntil, t + freeze * (0.5 + 0.5 * (1 - d / r)));
      this.damage(v, by, dmg, spell);
    }
  }
  private fissure(pl: Player, origin: Vec3, target: Vec3) {
    const t = now();
    // the relic is spent: the Grand Sage title is gone until someone reclaims it
    pl.sage = false;
    this.relic = { state: 'cooldown', holder: -1, capper: -1, progress: 0, contested: false, cooldownUntil: t + TUNE.relic.resetSeconds };
    this.broadcast({ t: 'relicReset' });
    const near = Math.hypot(origin[0] - pl.p[0], origin[2] - pl.p[2]) < 4;
    const ax = near ? origin[0] : pl.p[0], az = near ? origin[2] : pl.p[2];
    let dx = target[0] - ax, dz = target[2] - az; const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const len = TUNE.fissure.length;
    const bx = ax + dx * len, bz = az + dz * len;
    const F = TUNE.fissure;
    const inLine = (v: Player, extra = 0) => { const s = segDist(v.p[0], v.p[2], ax + dx * 2, az + dz * 2, bx, bz); return s.d < F.width + extra; };
    // 1. the earth splits
    this.later(t + 0.15, () => {
      for (const v of this.alive()) {
        if (v.id === pl.id || !inLine(v)) continue;
        v.fissureMarkUntil = now() + 6; v.fissureBy = pl.id;
        this.push(v, [0, F.launch, 0]);
        this.damage(v, pl.id, F.damage, SPELL_FISSURE);
      }
    });
    // 2. everything in the rift freezes
    this.later(t + F.freezeAt, () => {
      for (const v of this.alive()) {
        if (v.id === pl.id || !inLine(v, 3)) continue;
        v.fissureMarkUntil = now() + 6; v.fissureBy = pl.id;
        v.frozenUntil = Math.max(v.frozenUntil, now() + F.freezeTime);
      }
    });
    // 3. a black hole opens over the rift and swallows the frozen
    this.later(t + F.holeAt, () => {
      const along = Math.max(4, Math.min(len, (target[0] - ax) * dx + (target[2] - az) * dz));
      const hx = ax + dx * along, hz = az + dz * along;
      const f = this.field(`${pl.id}:fissure:${t}`, 'hole', pl.id, hx, origin[1] + 3.2, hz, F.holeLife);
      f.fissure = true;
      this.fields.push(f);
    });
  }
  private push(v: Player, dv: Vec3) { this.send(v, { t: 'push', v: dv }); }
  private damage(v: Player, by: number, amount: number, spell: number) {
    if (!v.alive || now() < v.shieldUntil) return;
    if (amount <= 0) return;
    v.hp -= amount;
    if (by !== v.id) { v.lastHitBy = by; v.lastHitAt = now(); }
    this.broadcast({ t: 'hit', victim: v.id, by, dmg: Math.round(amount), spell });
    if (v.hp <= 0) this.knockout(v, spell);
  }
  private knockout(v: Player, spell: number) {
    v.hp = 0; v.alive = false;
    const t = now();
    const killerId = t - v.lastHitAt < 6 ? v.lastHitBy : -1;
    const fissure = spell === SPELL_FISSURE || (t < v.fissureMarkUntil && v.fissureBy === killerId);
    const killer = this.players.get(killerId);
    if (killer && killer.id !== v.id) { killer.kos++; killer.score += fissure ? 3 : 1; }
    this.broadcast({ t: 'ko', victim: v.id, by: killer ? killer.id : -1, spell, fissure });
    if (v.sage) this.dropRelic();
    if (this.mode !== 'last' || this.phase !== 'playing') v.respawnAt = t + RESPAWN_SECONDS;
    if (this.phase === 'playing' && this.mode === 'sage' && fissure && killer) this.endRound(killer, `${killer.name} split the earth and claimed the round`);
  }
  private dropRelic() {
    for (const p of this.players.values()) p.sage = false;
    this.relic = { state: 'cooldown', holder: -1, capper: -1, progress: 0, contested: false, cooldownUntil: now() + 4 };
    this.broadcast({ t: 'relicReset' });
  }

  private field(k: string, kind: Field['kind'], by: number, x: number, y: number, z: number, life: number): Field {
    return { k, kind, by, x, y, z, born: now(), life, tx: x, tz: z, vx: 0, vz: 0, hx: x, hz: z, fissure: false };
  }

  // ------------------------------------------------------------------ match flow
  private startMatch() {
    this.round = 1; this.banner = '';
    for (const p of this.players.values()) { p.score = 0; p.rounds = 0; p.kos = 0; }
    this.matchEndsAt = now() + SCORE_MATCH_SECONDS;
    this.resetRound();
  }
  private resetRound() {
    this.phase = 'playing';
    this.fields = []; this.pending = [];
    this.relic = { state: 'altar', holder: -1, capper: -1, progress: 0, contested: false, cooldownUntil: 0 };
    this.worldSeed = (Math.random() * 1e9) | 0;
    this.broadcast({ t: 'reset', seed: this.worldSeed });
    const spawns = [...SPAWNS].sort(() => Math.random() - 0.5);
    let i = 0;
    for (const p of this.players.values()) {
      p.sage = false; p.hp = MAX_HP; p.alive = true; p.frozenUntil = 0; p.respawnAt = 0;
      p.shieldUntil = now() + SPAWN_SHIELD_SECONDS; p.cooldowns = SPELLS.map(() => 0);
      const s = spawns[i++ % spawns.length]; p.p = [s[0], 0, s[1]];
      this.send(p, { t: 'respawn', p: p.p });
    }
  }
  private endRound(winner: Player | null, text: string) {
    if (this.phase !== 'playing') return;
    if (winner) winner.rounds++;
    this.banner = text;
    if (winner && winner.rounds >= ROUNDS_TO_WIN) { this.finish([winner.id], 'rounds'); return; }
    this.phase = 'roundEnd'; this.phaseEndsAt = now() + 5;
  }
  private finish(winners: number[], by: 'rounds' | 'score') {
    this.phase = 'over';
    const list = [...this.players.values()];
    const standings = list.map(p => ({ id: p.id, name: p.name, value: by === 'score' ? p.score : p.rounds })).sort((a, b) => b.value - a.value);
    const names = winners.map(id => this.players.get(id)?.name).filter(Boolean).join(' & ');
    this.banner = winners.length ? `${names} ${winners.length > 1 ? 'are' : 'is'} the Grand Sage of the Meadow` : 'No winner this time';
    this.broadcast({ t: 'over', winners, title: this.banner, standings });
    this.fields = []; this.pending = [];
  }

  // ------------------------------------------------------------------ simulation tick
  private tick() {
    const t = now(), dt = Math.min(0.1, t - this.lastTick); this.lastTick = t;
    // scheduled impacts
    if (this.pending.length) {
      const due = this.pending.filter(p => p.at <= t);
      this.pending = this.pending.filter(p => p.at > t);
      for (const p of due) p.run();
    }
    if (this.phase === 'playing' || this.phase === 'lobby') {
      this.updateFields(t, dt);
      this.updateRelic(t, dt);
      // respawns
      for (const p of this.players.values()) {
        if (!p.alive && p.respawnAt && t >= p.respawnAt) {
          const s = this.spawnPoint();
          p.alive = true; p.hp = MAX_HP; p.frozenUntil = 0; p.respawnAt = 0; p.shieldUntil = t + SPAWN_SHIELD_SECONDS; p.p = s;
          this.send(p, { t: 'respawn', p: s });
        }
      }
    }
    if (this.phase === 'playing') {
      if (this.mode === 'score' && t >= this.matchEndsAt) {
        const best = Math.max(...[...this.players.values()].map(p => p.score));
        this.finish([...this.players.values()].filter(p => p.score === best).map(p => p.id), 'score');
      }
      if (this.mode === 'last' && this.players.size >= 2) {
        const alive = this.alive();
        if (alive.length <= 1) this.endRound(alive[0] || null, alive[0] ? `${alive[0].name} is the last wizard standing` : 'Everyone fell. The round is void');
      }
    }
    if (this.phase === 'roundEnd' && t >= this.phaseEndsAt) { this.round++; this.banner = ''; this.resetRound(); }
    this.broadcastSnapshot(t);
  }
  private updateFields(t: number, dt: number) {
    for (const f of this.fields) {
      const age = t - f.born;
      if (f.kind === 'tornado') {
        if (Math.hypot(f.tx - f.x, f.tz - f.z) < 1.5 || Math.random() < dt * 0.4) { const a = rnd(0, 6.28), d = rnd(2, 11); f.tx = f.hx + Math.cos(a) * d; f.tz = f.hz + Math.sin(a) * d; }
        let ux = f.tx - f.x, uz = f.tz - f.z; const l = Math.hypot(ux, uz) || 1; ux = ux / l * 3.2; uz = uz / l * 3.2;
        const k = 1 - Math.exp(-dt * 0.9); f.vx += (ux - f.vx) * k; f.vz += (uz - f.vz) * k;
        f.x += f.vx * dt; f.z += f.vz * dt;
        for (const v of this.alive()) {
          if (v.id === f.by) continue;
          const dx = f.x - v.p[0], dz = f.z - v.p[2], d = Math.hypot(dx, dz);
          if (d > TUNE.tornado.radius) continue;
          const s = 1 - d / TUNE.tornado.radius;
          this.push(v, [(-dz / (d || 1) * 7 + dx / (d || 1) * 3) * s * dt * 4, TUNE.tornado.lift * s * dt * 4, (dx / (d || 1) * 7 + dz / (d || 1) * 3) * s * dt * 4]);
          this.damage(v, f.by, TUNE.tornado.dps * dt * (0.4 + s), SPELL_TORNADO);
        }
      } else {
        const hole = f.kind === 'hole';
        const R = hole ? TUNE.fissure.holeRadius : TUNE.void.pullRadius, core = hole ? TUNE.fissure.holeCore : TUNE.void.coreRadius;
        const dps = hole ? TUNE.fissure.holeDps : TUNE.void.coreDps, pull = hole ? TUNE.fissure.holePull : TUNE.void.pull;
        const ramp = Math.min(1, age / 0.6) * (age > f.life - 0.6 ? Math.max(0, (f.life - age) / 0.6) : 1);
        for (const v of this.alive()) {
          if (v.id === f.by) continue;
          const dx = f.x - v.p[0], dz = f.z - v.p[2], d = Math.hypot(dx, dz);
          if (d > R) continue;
          const s = (1 - d / R) * ramp;
          this.push(v, [dx / (d || 1) * pull * s * dt * 3, 0, dz / (d || 1) * pull * s * dt * 3]);
          if (d < core) this.damage(v, f.by, dps * dt * ramp, hole ? SPELL_FISSURE : SPELL_VOID);
        }
      }
    }
    this.fields = this.fields.filter(f => t - f.born < f.life);
  }
  private updateRelic(t: number, dt: number) {
    const R = this.relic;
    if (R.state === 'cooldown') { if (t >= R.cooldownUntil) { R.state = 'altar'; R.progress = 0; R.capper = -1; } return; }
    if (R.state === 'held') {
      const h = this.players.get(R.holder);
      if (!h || !h.alive || !h.sage) this.dropRelic();
      return;
    }
    const inside = this.alive().filter(p => Math.hypot(p.p[0] - ALTAR.x, p.p[2] - ALTAR.z) < TUNE.relic.radius);
    R.contested = inside.length > 1;
    if (inside.length === 1) {
      const p = inside[0];
      if (R.capper !== p.id) {
        R.progress -= dt / 1.0;
        if (R.progress <= 0) { R.progress = 0; R.capper = p.id; }
      } else R.progress += dt / TUNE.relic.captureSeconds;
      if (R.progress >= 1) {
        R.state = 'held'; R.holder = p.id; R.progress = 1; p.sage = true;
        this.broadcast({ t: 'sage', id: p.id });
      }
    } else if (inside.length === 0) {
      R.progress = Math.max(0, R.progress - dt / TUNE.relic.decaySeconds);
      if (R.progress === 0) R.capper = -1;
    }
  }

  private broadcastSnapshot(t: number) {
    const players: PlayerSnap[] = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, p: p.p, yaw: p.yaw, pitch: p.pitch, mv: p.mv,
      hp: Math.max(0, Math.round(p.hp)), alive: p.alive, frozen: Math.max(0, p.frozenUntil - t), shield: Math.max(0, p.shieldUntil - t),
      sage: p.sage, score: p.score, rounds: p.rounds, kos: p.kos, castSeq: p.castSeq, host: p.id === this.hostId,
    }));
    const fields: FieldSnap[] = this.fields.filter(f => f.kind === 'tornado').map(f => ({ k: f.k, kind: 'tornado', x: f.x, z: f.z }));
    const timeLeft = this.phase === 'playing' && this.mode === 'score' ? Math.max(0, this.matchEndsAt - t) : this.phase === 'roundEnd' ? Math.max(0, this.phaseEndsAt - t) : 0;
    const R = this.relic;
    this.broadcast({
      t: 'snap', now: t, players, fields,
      relic: { state: R.state, holder: R.holder, capper: R.capper, progress: R.progress, contested: R.contested, cooldown: Math.max(0, R.cooldownUntil - t) },
      match: { mode: this.mode, phase: this.phase, timeLeft, round: this.round, banner: this.banner },
    });
  }

  // ------------------------------------------------------------------ helpers
  private alive() { return [...this.players.values()].filter(p => p.alive); }
  private later(at: number, run: () => void) { this.pending.push({ at, run }); }
  private spawnPoint(): Vec3 {
    // furthest spawn from living players
    let best = SPAWNS[0], bd = -1;
    for (const s of SPAWNS) {
      let d = 1e9; for (const p of this.alive()) d = Math.min(d, Math.hypot(p.p[0] - s[0], p.p[2] - s[1]));
      d += Math.random() * 6;
      if (d > bd) { bd = d; best = s; }
    }
    return [best[0], 0, best[1]];
  }
  send(p: Player, m: ServerMsg) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); }
  broadcast(m: ServerMsg) { const s = JSON.stringify(m); for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
}

function num(v: unknown) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function valid3(v: unknown): v is Vec3 { return Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 5000); }
function clampAbs(v: number, m: number) { return Math.max(-m, Math.min(m, v)); }
