# Arcanum Online

A 4-player online version of Arcanum: The Shattered Meadow, written in TypeScript with Three.js and plain CSS.
Up to four wizards share the destructible meadow. The prize is the **Sage Relic**: whoever claims it becomes the **Grand Sage** and can cast the ultimate spell, **Grand Fissure**, exactly once.

## How to play

1. One player clicks **Create match** and shares the four-letter code (or the Copy link).
2. Friends enter the code and click **Join**. Everyone can practise spells in the lobby.
3. The host picks a mode and clicks **Start match**.

| Input | Action |
| --- | --- |
| WASD / Shift / Space | Move, sprint, jump |
| Drag the mouse | Look around |
| Click or F | Cast at the rune circle |
| 1–7 or mouse wheel | Switch spell |
| G (or 8) | Ready the Grand Fissure (Grand Sage only) |
| Tab | Standings |

### The Grand Sage

A golden beam marks the relic altar in the ruins. Stand inside its ring alone for 5 seconds to claim it; a second wizard in the ring contests it.
The Grand Sage wears a golden halo that everyone can see. Their **Grand Fissure** works in three stages:

1. **Break:** the earth splits in a 30 m line from the Sage's feet. Slabs erupt and anyone in the rift takes damage and is thrown into the air.
2. **Freeze:** the rift freezes solid and traps everyone in it for almost 4 seconds.
3. **Black hole:** a black hole opens where the Sage aimed, pulls the frozen victims in and crushes them.

The Fissure can be cast only once. After that the Sage loses the title and the relic reforms at the altar 12 seconds later, ready for anyone to claim. A Sage who is knocked out before casting drops the relic.

### Modes (chosen by the host)

- **Score Battle:** 8 minutes with respawns. A knockout scores 1 point and a Grand Fissure knockout scores 3. The highest score wins.
- **Last Standing:** no respawns. The last wizard alive wins the round, and the first to 3 rounds wins.
- **Sage Duel:** respawns on. Landing a Grand Fissure knockout wins the round, and the first to 3 rounds wins.

The match winner is crowned Grand Sage of the Meadow.

## Run it locally

Requires Node 18 or newer.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:8080. To play together on one network, others open `http://<your-computer's-IP>:8080`.

For development with hot reload, run `npm run dev`. It starts the server on port 8080 and Vite on http://localhost:5173.

Add `?lowspec` to the URL on weaker machines. It uses less grass, a smaller shadow map and no MSAA.

## Put it online

The server runs every match and also serves the game page, so you only need to deploy one thing.

- **Render (free):** push this repository to GitHub, then in Render choose New → Blueprint and select the repository. `render.yaml` sets the service root to `multiplayer/`, plus the build and start commands. Share the URL Render gives you.
- **Fly.io, Railway or any VPS:** build the `Dockerfile` in this folder. The server listens on `$PORT` (8080 by default).

If the page is hosted separately from the server, point it at the server with `?server=your-server.example.com`.

## How it is built

```
src/shared/protocol.ts   message types, spell stats, tuning, map layout (used by both sides)
src/server/              Node + ws match server: rooms, combat, relic, game modes (authoritative)
src/client/engine/       the rendering and physics engine ported from the single-player game
src/client/game/         multiplayer layer: player, staff, avatars, relic altar, HUD, networking
src/client/main.ts       wiring and the game loop
test/server-sim.mjs      scripted two-player check of the server (needs a server running on port 8090)
```

- The server decides damage, freezes, pulls, knockouts, relic capture and scoring. Clients send their position and cast requests. The server checks cooldowns, range and Grand Sage status before it accepts a cast.
- Every client replays each cast's visuals and simulates the falling stones locally. Structures start identical on every client, but debris can land slightly differently on each screen. That only affects the scenery, never who gets hit.
