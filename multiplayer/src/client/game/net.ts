import type { ClientMsg, ServerMsg } from '../../shared/protocol';

type Handler = (m: ServerMsg) => void;

/** Thin WebSocket wrapper. The server lives on the same origin under /ws (or ?server=host:port). */
export class Net {
  ws: WebSocket | null = null;
  onMessage: Handler = () => {};
  onClose: (reason: string) => void = () => {};

  connect(): Promise<void> {
    const q = new URLSearchParams(location.search).get('server');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = q ? (q.startsWith('ws') ? q : `${proto}://${q}/ws`) : `${proto}://${location.host}/ws`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => { ws.close(); reject(new Error('The match server did not answer. Check that it is running.')); }, 8000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the match server.')); };
      ws.onclose = () => this.onClose('Disconnected from the match server.');
      ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    });
  }
  send(m: ClientMsg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
}
export const net = new Net();
