import type { GameMode, MatchSnap, PlayerSnap, RelicSnap } from '../../shared/protocol';
import { SPELLS } from '../../shared/protocol';

/** Mutable client-side game state shared by the gameplay modules. */
export const G = {
  myId: -1,
  roomCode: '',
  connected: false,
  inMatch: false,          // the 3D view is live (lobby or playing)
  curSpell: 0,
  cooldowns: SPELLS.map(() => 0),
  alive: true,
  hp: 100,
  frozen: 0,
  shield: 0,
  sage: false,
  hurt: 0,                 // red screen pulse
  players: new Map<number, PlayerSnap>(),
  relic: { state: 'altar', holder: -1, capper: -1, progress: 0, contested: false, cooldown: 0 } as RelicSnap,
  match: { mode: 'score' as GameMode, phase: 'lobby', timeLeft: 0, round: 0, banner: '' } as MatchSnap,
  look: { dragging: false, moved: 0, lx: 0, ly: 0, dyaw: 0, dpitch: 0, button: 0 },
  castCounter: 1,
};
export function me(): PlayerSnap | undefined { return G.players.get(G.myId); }
export function isHost() { return !!me()?.host; }
