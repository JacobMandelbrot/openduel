// Online rooms. The host's browser owns the game: it runs every action, saves the game, and sends each
// player a view of the state with other players' secrets removed. Players' browsers only send actions.
//
// Messages (all plain objects with a `t` field):
//   player → host: hello {token} · join {profile} · leave · claim {nationId} · act {name, args}
//   host → player: welcome {you, started} · lobby {lobby} · map {seed, map} · state {state, online} · pick {nations} · error {message}
import { hostRoom, joinRoom, newRoomCode } from './net.js';
import { viewFor, runAction } from './engine/actions.js';
import * as G from './engine/game.js';
import { LocalStore } from './store.js';

const randomToken = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const META_KEY = 'openduel.room.v1';
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)); } catch { return null; } };
const writeMeta = (m) => { try { if (m) localStorage.setItem(META_KEY, JSON.stringify(m)); else localStorage.removeItem(META_KEY); } catch { /* storage unavailable */ } };
const clientKey = 'openduel.client.v1';
const readClient = () => { try { return JSON.parse(sessionStorage.getItem(clientKey)); } catch { return null; } };
const writeClient = (c) => { try { if (c) sessionStorage.setItem(clientKey, JSON.stringify(c)); else sessionStorage.removeItem(clientKey); } catch { /* storage unavailable */ } };

// ====================================================================== Host

/** Create a new room with the host's own nation in the lobby. */
export function createRoom(app, hostProfile, { rpsOnly = false } = {}) {
  const meta = {
    code: newRoomCode(), hostToken: randomToken(), seats: {},
    lobby: { players: [{ token: null, profile: hostProfile, host: true }], bots: 0, rpsOnly, neutralShare: 0.5, buildEvery: 3, winShare: 0.4, turnLimit: 0 },
  };
  meta.lobby.players[0].token = meta.hostToken;
  writeMeta(meta);
  app.setState(null);
  hostWith(app, meta);
}

/** Re-open the room after the host reloads (the game itself is in LocalStore). */
export function resumeHosting(app) {
  const meta = readMeta();
  if (!meta) return false;
  hostWith(app, meta);
  return true;
}

function hostWith(app, meta) {
  const tokenOf = new Map(); // conn -> token
  const online = () => new Set([meta.hostToken, ...tokenOf.values()]);
  const lobbyView = () => meta.lobby && ({
    code: meta.code, bots: meta.lobby.bots, rpsOnly: meta.lobby.rpsOnly, neutralShare: meta.lobby.neutralShare ?? 0.5, buildEvery: meta.lobby.buildEvery ?? 3, winShare: meta.lobby.winShare ?? 0.4, turnLimit: meta.lobby.turnLimit ?? 0,
    players: meta.lobby.players.map((p) => ({ ...p.profile, host: !!p.host, online: online().has(p.token), token: undefined })),
  });
  const onlineNations = () => [...online()].map((t) => meta.seats[t]).filter(Boolean);
  const sendState = (conn) => {
    const id = meta.seats[tokenOf.get(conn)];
    if (id && app.state) net.send(conn, { t: 'state', state: viewFor(app.state, id), online: onlineNations() });
  };
  const sendMap = (conn) => { if (app.state) net.send(conn, { t: 'map', seed: app.state.seed, map: app.state.map }); };

  const room = {
    role: 'host', code: meta.code, connected: false,
    get lobby() { return lobbyView(); },
    get isLobby() { return !!meta.lobby; },
    hostToken: meta.hostToken,
    myNation: () => meta.seats[meta.hostToken] ?? null,
    online: onlineNations,
    /** After any change to the game: save it and send everyone their view. */
    broadcast() {
      if (meta.lobby) { net.broadcast(() => ({ t: 'lobby', lobby: lobbyView() })); return; }
      net.broadcast((conn) => {
        const id = meta.seats[tokenOf.get(conn)];
        return id && app.state ? { t: 'state', state: viewFor(app.state, id), online: onlineNations() } : null;
      });
    },
    /** Send the map again (after a restart on a new map). */
    broadcastMap() { net.broadcast((conn) => (meta.seats[tokenOf.get(conn)] && app.state ? { t: 'map', seed: app.state.seed, map: app.state.map } : null)); },
    setBots(n) { if (meta.lobby) { meta.lobby.bots = Math.max(0, Math.min(15, n | 0)); writeMeta(meta); room.broadcast(); app.render(); } },
    setLobbyRps(v) { if (meta.lobby) { meta.lobby.rpsOnly = !!v; writeMeta(meta); room.broadcast(); app.render(); } },
    setNeutral(v) { if (meta.lobby) { meta.lobby.neutralShare = v; writeMeta(meta); room.broadcast(); app.render(); } },
    setBuildEvery(v) { if (meta.lobby) { meta.lobby.buildEvery = v; writeMeta(meta); room.broadcast(); app.render(); } },
    setWinShare(v) { if (meta.lobby) { meta.lobby.winShare = v; writeMeta(meta); room.broadcast(); app.render(); } },
    setTurnLimit(v) { if (meta.lobby) { meta.lobby.turnLimit = v; writeMeta(meta); room.broadcast(); app.render(); } },
    updateHostProfile(profile) { if (meta.lobby) { meta.lobby.players[0].profile = profile; writeMeta(meta); room.broadcast(); } },
    kick(index) { if (meta.lobby && index > 0) { meta.lobby.players.splice(index, 1); writeMeta(meta); room.broadcast(); app.render(); } },
    /** Start: every lobby player gets a nation, empty seats are filled with bots. */
    start() {
      const humans = meta.lobby.players;
      const total = humans.length + meta.lobby.bots;
      if (total < 4) throw new Error(`Games need at least 4 nations — add ${4 - total} bot${4 - total === 1 ? '' : 's'}.`);
      if (total > 16) throw new Error('Games can have at most 16 nations.');
      const seed = newRoomCode().toLowerCase();
      const players = humans.map((p) => ({ ...p.profile, bot: null }));
      players.push(...G.fakePlayers(seed, meta.lobby.bots, players));
      const state = G.createGame({ seed, players, settings: { rpsOnly: meta.lobby.rpsOnly, neutralShare: meta.lobby.neutralShare ?? 0.5, buildEvery: meta.lobby.buildEvery ?? 3, winShare: meta.lobby.winShare ?? 0.4, turnLimit: meta.lobby.turnLimit ?? 0 } });
      meta.seats = Object.fromEntries(humans.map((p, i) => [p.token, state.nations[i].id]));
      meta.lobby = null;
      writeMeta(meta);
      app.setState(state);
      net.broadcast((conn) => ({ t: 'welcome', you: meta.seats[tokenOf.get(conn)] ?? null, started: true }));
      room.broadcastMap();
      room.broadcast();
    },
    /** Restart with the same seats (nation ids are kept by rematch). */
    replaced() { room.broadcastMap(); room.broadcast(); },
    close() { net.stop(); writeMeta(null); app.room = null; app.mode = 'local'; },
  };

  const net = hostRoom(meta.code, {
    onReady: () => { room.connected = true; app.render(); },
    onError: (err) => { room.connected = false; app.toast(`Room problem: ${err.message || err.type}`); app.render(); },
    onDisconnect: (conn) => { tokenOf.delete(conn); room.broadcast(); app.render(); },
    onMessage: (conn, msg) => {
      try {
        handle(conn, msg);
      } catch (err) {
        net.send(conn, { t: 'error', message: err.message });
      }
    },
  });

  function handle(conn, msg) {
    if (msg?.t === 'hello') {
      tokenOf.set(conn, String(msg.token));
      if (meta.lobby) {
        net.send(conn, { t: 'welcome', you: null, started: false });
        net.send(conn, { t: 'lobby', lobby: lobbyView() });
      } else if (meta.seats[msg.token]) {
        net.send(conn, { t: 'welcome', you: meta.seats[msg.token], started: true });
        sendMap(conn);
        sendState(conn);
        room.broadcast();
      } else {
        net.send(conn, { t: 'welcome', you: null, started: true });
        net.send(conn, { t: 'pick', nations: claimable() });
      }
      app.render();
      return;
    }
    const token = tokenOf.get(conn);
    if (!token) throw new Error('Say hello first');
    if (msg.t === 'join') {
      if (!meta.lobby) throw new Error('This game has already started.');
      const p = meta.lobby.players.find((x) => x.token === token);
      const profile = sanitizeProfile(msg.profile);
      if (!profile.name || !profile.leader) throw new Error('Your nation needs a name and you need a name.');
      if (meta.lobby.players.some((x) => x.token !== token && x.profile.name.toLowerCase() === profile.name.toLowerCase())) throw new Error('Another nation already has that name.');
      if (p) p.profile = profile;
      else {
        if (meta.lobby.players.length + meta.lobby.bots >= 16) throw new Error('This room is full.');
        meta.lobby.players.push({ token, profile });
      }
      writeMeta(meta);
      room.broadcast();
      app.render();
    } else if (msg.t === 'leave') {
      if (meta.lobby) { meta.lobby.players = meta.lobby.players.filter((x) => x.token !== token || x.host); writeMeta(meta); room.broadcast(); app.render(); }
    } else if (msg.t === 'claim') {
      if (meta.lobby) throw new Error('The game hasn\'t started yet.');
      if (!claimable().some((n) => n.id === msg.nationId)) throw new Error('That nation is already being played.');
      for (const [t, id] of Object.entries(meta.seats)) if (id === msg.nationId) delete meta.seats[t];
      meta.seats[token] = msg.nationId;
      writeMeta(meta);
      net.send(conn, { t: 'welcome', you: msg.nationId, started: true });
      sendMap(conn);
      sendState(conn);
    } else if (msg.t === 'act') {
      const actor = meta.seats[token];
      if (!actor || !app.state) throw new Error('You are not playing a nation in this game.');
      app.commitFrom(actor, msg.name, msg.args || []);
    }
  }

  /** Human nations nobody is connected as (so a player who lost their tab can take their nation back). */
  function claimable() {
    if (!app.state) return [];
    const taken = new Set(onlineNations());
    return app.state.nations.filter((n) => !n.bot && !taken.has(n.id)).map((n) => ({ id: n.id, name: n.name, leader: n.leader, emblem: n.emblem, color: n.color }));
  }

  app.mode = 'host';
  app.room = room;
  return room;
}

function sanitizeProfile(p = {}) {
  const str = (v, n) => String(v ?? '').slice(0, n).trim();
  const theme = p.theme && Array.isArray(p.theme.notes) ? {
    notes: p.theme.notes.slice(0, 400).map((x) => ({ n: x.n | 0, t: x.t | 0, d: x.d | 0, v: Math.max(0, Math.min(1, +x.v || 0.8)) })),
    ms: p.theme.ms | 0,
  } : null;
  return { name: str(p.name, 60), leader: str(p.leader, 60), motto: str(p.motto, 80), emblem: str(p.emblem, 40), color: str(p.color, 9), theme };
}

// ====================================================================== Player

/** Join a room as a player. `profile` is sent while the room is still in its lobby. */
export function joinAsPlayer(app, code, profile) {
  const saved = readClient();
  const token = saved?.code === code ? saved.token : randomToken();
  writeClient({ code, token, profile });
  let mapSeed = null;

  const room = {
    role: 'player', code, connected: false, lobby: null, pick: null, started: false, error: null,
    myNation: () => app.myId,
    online: () => room.onlineNations ?? [],
    onlineNations: [],
    send: (name, args) => {
      if (!net.send({ t: 'act', name, args })) app.toast('Not connected to the host right now — try again in a moment.');
    },
    updateProfile(p) { writeClient({ code, token, profile: p }); net.send({ t: 'join', profile: p }); },
    claim(nationId) { net.send({ t: 'claim', nationId }); },
    close() { net.send({ t: 'leave' }); net.stop(); writeClient(null); app.room = null; app.mode = 'local'; app.myId = null; app.state = null; },
  };

  const net = joinRoom(code, {
    onOpen: () => { room.connected = true; room.error = null; net.send({ t: 'hello', token }); app.render(); },
    onClose: () => { room.connected = false; app.render(); },
    onError: (err) => { room.error = err.message || err.type; app.render(); },
    onMessage: (msg) => {
      if (msg.t === 'welcome') {
        app.myId = msg.you;
        room.started = msg.started;
        room.pick = null;
        if (!msg.started && readClient()?.profile) net.send({ t: 'join', profile: readClient().profile });
        if (!msg.you) { if (!location.hash.startsWith('#/lobby')) app.go('lobby'); else app.render(); }
      } else if (msg.t === 'lobby') {
        room.lobby = msg.lobby;
        if (!location.hash.startsWith('#/lobby')) app.go('lobby'); else app.render();
      } else if (msg.t === 'pick') {
        room.pick = msg.nations;
        app.go('lobby');
        app.render();
      } else if (msg.t === 'map') {
        mapSeed = msg.seed;
        room.map = msg.map;
      } else if (msg.t === 'state') {
        if (!room.map || msg.state.seed !== mapSeed) return; // map arrives first
        room.onlineNations = msg.online || [];
        app.receiveState({ ...msg.state, map: room.map });
      } else if (msg.t === 'error') {
        app.toast(msg.message);
      }
    },
  });

  app.mode = 'player';
  app.room = room;
  app.state = null;
  return room;
}

/** A player tab that was reloaded rejoins its room automatically. */
export function resumePlayer(app) {
  const c = readClient();
  if (!c?.code) return false;
  joinAsPlayer(app, c.code, c.profile);
  return true;
}
