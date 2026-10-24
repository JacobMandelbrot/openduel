// Peer-to-peer rooms (PeerJS over WebRTC). The host's browser runs the game; players connect to it with a
// room code. No server of our own and no logins: PeerJS's free public broker only introduces the browsers.
const PREFIX = 'openduel-room-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newRoomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function peerLib() {
  if (!window.Peer) throw new Error('Could not load the networking library. Check your internet connection.');
  return window.Peer;
}

/**
 * Host a room. handlers: onReady(code), onConnect(conn), onMessage(conn, msg), onDisconnect(conn), onError(err).
 * If the code is taken (or still held after a reload), retries a few times before giving up.
 */
export function hostRoom(code, handlers) {
  const Peer = peerLib();
  let peer = null;
  let stopped = false;
  let tries = 0;
  const conns = new Set();
  const start = () => {
    peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => { tries = 0; handlers.onReady?.(code); });
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.add(conn); handlers.onConnect?.(conn); });
      conn.on('data', (msg) => handlers.onMessage?.(conn, msg));
      conn.on('close', () => { conns.delete(conn); handlers.onDisconnect?.(conn); });
      conn.on('error', () => { conns.delete(conn); handlers.onDisconnect?.(conn); });
    });
    peer.on('error', (err) => {
      if (stopped) return;
      // After a reload the broker may still hold our id for a few seconds.
      if (err.type === 'unavailable-id' && tries++ < 8) { peer.destroy(); setTimeout(start, 2500); return; }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && tries++ < 20) { peer.destroy(); setTimeout(start, 3000); return; }
      handlers.onError?.(err);
    });
    peer.on('disconnected', () => { if (!stopped) peer.reconnect(); });
  };
  start();
  return {
    code,
    send: (conn, msg) => { if (conn.open) conn.send(msg); },
    broadcast: (fn) => { for (const c of conns) if (c.open) { const m = fn(c); if (m) c.send(m); } },
    connections: () => [...conns],
    stop: () => { stopped = true; peer?.destroy(); },
  };
}

/**
 * Join a room. handlers: onOpen(), onMessage(msg), onClose(), onError(err).
 * Reconnects automatically if the connection drops (for example when the host reloads).
 */
export function joinRoom(code, handlers) {
  const Peer = peerLib();
  let peer = null;
  let conn = null;
  let stopped = false;
  let timer = null;
  const retry = (ms = 3000) => { if (!stopped) { clearTimeout(timer); timer = setTimeout(connect, ms); } };
  const connect = () => {
    if (stopped) return;
    if (!peer || peer.destroyed) {
      peer = new Peer({ debug: 0 });
      peer.on('open', connect);
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') { handlers.onError?.(Object.assign(new Error('No game with that code is running right now.'), { type: err.type })); retry(4000); return; }
        handlers.onError?.(err);
        peer.destroy();
        retry();
      });
      return;
    }
    if (!peer.open) return;
    conn = peer.connect(PREFIX + code, { reliable: true });
    conn.on('open', () => handlers.onOpen?.());
    conn.on('data', (msg) => handlers.onMessage?.(msg));
    conn.on('close', () => { handlers.onClose?.(); retry(); });
    conn.on('error', () => { handlers.onClose?.(); retry(); });
  };
  connect();
  return {
    code,
    send: (msg) => { if (conn?.open) { conn.send(msg); return true; } return false; },
    isOpen: () => !!conn?.open,
    stop: () => { stopped = true; clearTimeout(timer); peer?.destroy(); },
  };
}
