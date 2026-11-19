/* Shared between the browser client and the Node match server. */

export type Vec3 = [number, number, number];

export const MAX_PLAYERS = 4;
export const TICK_HZ = 20;
export const MAX_HP = 100;
export const PROJECTILE_SPEED = 85; // m/s, used by both sides so impacts line up
export const RESPAWN_SECONDS = 3;
export const SPAWN_SHIELD_SECONDS = 1.5;

export type GameMode = 'score' | 'last' | 'sage';
export const MODES: Record<GameMode, { name: string; blurb: string }> = {
  score: { name: 'Score Battle', blurb: '8-minute match with respawns. A knockout scores 1 point and a Grand Fissure knockout scores 3.' },
  last: { name: 'Last Standing', blurb: 'No respawns. The last wizard alive wins the round. First to 3 rounds wins.' },
  sage: { name: 'Sage Duel', blurb: 'Respawns on. Claim the relic and land the Grand Fissure on an enemy to win the round. First to 3 rounds.' },
};
export const SCORE_MATCH_SECONDS = 480;
export const ROUNDS_TO_WIN = 3;

// Spell ids 0..6 match the original single-player game, 7 is the ultimate.
export const SPELL_FIRE = 0, SPELL_VOID = 1, SPELL_TORNADO = 2, SPELL_FROST = 3, SPELL_STORM = 4, SPELL_GALE = 5, SPELL_BLOOM = 6, SPELL_FISSURE = 7;

export interface SpellDef { name: string; desc: string; color: number; cd: number; runeN: number; projectile: boolean }
export const SPELLS: SpellDef[] = [
  { name: 'Inferno', desc: 'Detonates a massive firestorm', color: 0xff6a1a, cd: 0.9, runeN: 6, projectile: true },
  { name: 'Void Singularity', desc: 'A black hole that pulls in and crushes everything', color: 0xa64dff, cd: 9, runeN: 9, projectile: true },
  { name: 'Fire Tornado', desc: 'A roaring vortex of flame that lifts its victims', color: 0xff9a2a, cd: 8, runeN: 5, projectile: true },
  { name: 'Glacial Nova', desc: 'Freezes the ground and anyone standing on it', color: 0x7fd8ff, cd: 5, runeN: 6, projectile: true },
  { name: 'Storm Lance', desc: 'Rapid electric discharge from the heavens', color: 0xa8c8ff, cd: 2.2, runeN: 4, projectile: false },
  { name: 'Gale Blast', desc: 'A kinetic shockwave that hurls enemies away', color: 0xbff7e4, cd: 1.2, runeN: 3, projectile: false },
  { name: 'Verdant Bloom', desc: 'Grows a tree and heals everyone in the bloom', color: 0x86ff5a, cd: 7, runeN: 7, projectile: true },
  { name: 'Grand Fissure', desc: 'Grand Sage only: split the earth, freeze the fallen, then swallow them in a black hole', color: 0xffd36a, cd: 0, runeN: 8, projectile: false },
];

// Gameplay tuning shared by server (damage) and client (visual radii)
export const TUNE = {
  fire: { radius: 7.5, damage: 46, knock: 17 },
  void: { life: 7.2, pullRadius: 14, coreRadius: 2.6, coreDps: 30, pull: 16 },
  tornado: { life: 9.5, radius: 5.5, dps: 16, lift: 10 },
  frost: { radius: 9, damage: 14, freeze: 2.6 },
  storm: { strikeTimes: [0.0, 0.18, 0.36, 0.55, 0.78], radius: 3.4, damage: 20, maxOffset: 5.5 },
  gale: { radius: 12, damage: 8, knock: 24 },
  bloom: { radius: 7, heal: 30 },
  fissure: { length: 30, width: 4.2, damage: 30, launch: 13, freezeAt: 1.0, freezeTime: 3.8, holeAt: 1.7, holeLife: 3.4, holeRadius: 20, holeCore: 3.2, holeDps: 60, holePull: 24 },
  relic: { radius: 3.2, captureSeconds: 5, decaySeconds: 8, resetSeconds: 12 },
  maxCastRange: 145,
};

// World layout shared by both sides (x, z; clients compute the ground height)
export const ALTAR = { x: -31, z: 9.6 };
export const SPAWNS: [number, number][] = [[0, 26], [28, 22], [-14, 30], [32, -8], [-6, -14], [10, 4]];

// ---------- client -> server
export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; name: string; code: string }
  | { t: 'mode'; mode: GameMode }
  | { t: 'start' }
  | { t: 'lobby' }
  | { t: 'state'; p: Vec3; yaw: number; pitch: number; mv: number }
  | { t: 'cast'; cid: number; spell: number; origin: Vec3; target: Vec3; normal: Vec3; dir: Vec3; strikes?: [number, number][]; seed?: number };

// ---------- server -> client
export interface PlayerSnap {
  id: number; name: string; color: number;
  p: Vec3; yaw: number; pitch: number; mv: number;
  hp: number; alive: boolean; frozen: number; shield: number;
  sage: boolean; score: number; rounds: number; kos: number; castSeq: number; host: boolean;
}
export interface RelicSnap { state: 'altar' | 'held' | 'cooldown'; holder: number; capper: number; progress: number; contested: boolean; cooldown: number }
export interface FieldSnap { k: string; kind: 'tornado'; x: number; z: number }
export interface MatchSnap { mode: GameMode; phase: 'lobby' | 'playing' | 'roundEnd' | 'over'; timeLeft: number; round: number; banner: string }
export interface Snapshot { t: 'snap'; now: number; players: PlayerSnap[]; relic: RelicSnap; fields: FieldSnap[]; match: MatchSnap }

export interface CastEvent { t: 'cast'; by: number; cid: number; spell: number; origin: Vec3; target: Vec3; normal: Vec3; dir: Vec3; strikes?: [number, number][]; seed?: number }

export type ServerMsg =
  | { t: 'welcome'; id: number; code: string; color: number }
  | { t: 'error'; message: string }
  | Snapshot
  | CastEvent
  | { t: 'push'; v: Vec3 }
  | { t: 'hit'; victim: number; by: number; dmg: number; spell: number }
  | { t: 'ko'; victim: number; by: number; spell: number; fissure: boolean }
  | { t: 'respawn'; p: Vec3 }
  | { t: 'sage'; id: number }
  | { t: 'relicReset' }
  | { t: 'reset'; seed: number }
  | { t: 'over'; winners: number[]; title: string; standings: { id: number; name: string; value: number }[] };

export const PLAYER_COLORS = [0x5aa8ff, 0xff5a6e, 0x6dff8a, 0xffc94a];

export function dist2(ax: number, az: number, bx: number, bz: number) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
// distance from point to segment in the xz plane, plus position along it (0..1)
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  const cx = ax + vx * t, cz = az + vz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}
