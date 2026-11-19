import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg } from '../shared/protocol.js';
import { Room } from './room.js';

const PORT = Number(process.env.PORT) || 8080;
// dist/server/server/index.js -> dist/client
const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = process.env.CLIENT_DIR || join(here, '..', '..', 'client');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${rooms.size} rooms`); return; }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(400); res.end(); return; }
  let file = join(CLIENT_DIR, path || 'index.html');
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); }
  catch { file = join(CLIENT_DIR, 'index.html'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400' });
    res.end(body);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Client not built. Run npm run build.'); }
});

const rooms = new Map<string, Room>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() { let c = ''; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; }

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null; let id = -1;
  const fail = (message: string) => ws.send(JSON.stringify({ t: 'error', message }));
  ws.on('message', (raw) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!room) {
      if (m.t === 'create') {
        const code = newCode(); room = new Room(code, (c) => rooms.delete(c)); rooms.set(code, room);
        id = room.add(ws, String(m.name || ''))!.id;
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return fail('No match with that code. Check the four letters and try again.');
        const pl = r.add(ws, String(m.name || ''));
        if (!pl) return fail('That match already has 4 wizards.');
        room = r; id = pl.id;
      }
      return;
    }
    const pl = room.players.get(id); if (pl) room.handle(pl, m);
  });
  ws.on('close', () => { if (room) room.remove(id); });
});

server.listen(PORT, () => console.log(`Arcanum Online listening on http://localhost:${PORT}`));
