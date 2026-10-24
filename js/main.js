// Boot, router and the global `app` object every screen talks to.
//
// Three modes:
//   local  — offline sandbox on one device (play as any nation; you're also the admin)
//   host   — this browser runs an online room: it owns the game, saves it, and is the admin
//   player — this browser joined a room by code: it sends actions to the host and shows what the host sends back
import { LocalStore } from './store.js';
import { h, emoji, select, logo } from './ui/dom.js';
import { closeSheet, toast } from './ui/sheet.js';
import { showReport } from './ui/report.js';
import { playersInTurn } from './engine/game.js';
import { OPEN, duelist } from './engine/duels.js';
import { runAction } from './engine/actions.js';
import { resumeHosting, resumePlayer } from './room.js';
import * as mapScreen from './ui/screens/map.js';
import * as nationsScreen from './ui/screens/nations.js';
import * as nationScreen from './ui/screens/nation.js';
import * as chronicleScreen from './ui/screens/chronicle.js';
import * as rulesScreen from './ui/screens/rules.js';
import * as adminScreen from './ui/screens/admin.js';
import * as setupScreen from './ui/screens/setup.js';
import * as lobbyScreen from './ui/screens/lobby.js';
import * as meScreen from './ui/screens/me.js';

const ROUTES = {
  map: mapScreen, nations: nationsScreen, nation: nationScreen, chronicle: chronicleScreen,
  events: chronicleScreen, rules: rulesScreen, admin: adminScreen, setup: setupScreen, join: setupScreen, lobby: lobbyScreen, me: meScreen,
};
const NAV = [
  ['map', 'world-map', 'Map'], ['nations', 'busts-in-silhouette', 'Nations'],
  ['events', 'newspaper', 'Events'], ['rules', 'scroll', 'Rules'], ['admin', 'hammer-and-wrench', 'Admin'],
];
const PHASE = { orders: 'Orders', duels: 'Duels', build: 'Build phase', ended: 'Game over' };
// Small, frequent choices aren't worth an undo step.
const NO_UNDO = new Set(['setOrder', 'addCede', 'toggleBuild', 'toggleDisband', 'setTag', 'updateNation', 'setSetting', 'setBotStyle', 'voteDraw']);

export const app = {
  mode: 'local',
  room: null,
  myId: null,
  state: null,
  prefs: { tint: 'owner', ...LocalStore.prefs() },
  current: null,
  results: null, // the turn report being shown on the map, until OK

  get me() {
    const s = this.state;
    if (!s) return null;
    if (this.mode === 'player') return s.nations.find((n) => n.id === this.myId) ?? null;
    if (this.mode === 'host') return s.nations.find((n) => n.id === this.room?.myNation()) ?? s.nations[0];
    return s.nations.find((n) => n.id === this.prefs.playAs) ?? s.nations.find((n) => !n.bot) ?? s.nations[0];
  },
  get isAdmin() { return this.mode !== 'player'; },

  setPrefs(p) {
    Object.assign(this.prefs, p);
    LocalStore.setPrefs(this.prefs);
  },

  /** Every game change goes through here. Players send it to the host; the host/offline app runs it. */
  act(name, ...args) {
    if (this.mode === 'player') { this.room.send(name, args); return null; }
    try {
      return this.commit((st) => runAction(st, this.me.id, true, name, args), { undo: !NO_UNDO.has(name) });
    } catch (err) {
      toast(err.message);
      return null;
    }
  },

  /** Host: run an action that arrived from a player's device, acting as that player. */
  commitFrom(actor, name, args) {
    return this.commit((st) => runAction(st, actor, false, name, args), { undo: !NO_UNDO.has(name) });
  },

  /** Apply a change, save, tell the room, re-render, and show any report. */
  commit(fn, { undo = true, report = true, render = true } = {}) {
    if (undo) LocalStore.pushUndo(this.state);
    const result = fn(this.state);
    LocalStore.save(this.state);
    if (this.mode === 'host') this.room?.broadcast();
    if (!render) return result;
    this.present(result, report);
    return result;
  },

  /** Show a report: turn results go on the map (until OK), anything else in a popup. */
  present(result, report = true) {
    if (report && result?.kind === 'turn') {
      this.results = result;
      if (parseRoute().name !== 'map') { this.go('map'); return; }
    }
    this.render();
    if (report && result && result.kind !== 'turn' && result.events?.length) showReport(this, result);
  },

  /** Player: a new view of the game arrived from the host. */
  receiveState(state) {
    const prevAt = this.state?.report?.at;
    const first = !this.state;
    this.state = state;
    const r = state.report;
    if (!first && r && r.at !== prevAt) this.present(r);
    else if (first && !['map', 'nations', 'nation', 'events', 'chronicle', 'rules', 'me'].includes(parseRoute().name)) this.go('map');
    else this.render();
  },

  setState(state) {
    this.state = state;
    this.results = null;
    if (state) LocalStore.save(state); else LocalStore.clear();
    if (this.mode === 'host' && state) this.room?.replaced();
    this.render();
  },

  undo() {
    const prev = LocalStore.popUndo();
    if (!prev) { toast('Nothing to undo'); return; }
    this.state = prev;
    LocalStore.save(prev);
    if (this.mode === 'host') this.room?.broadcast();
    this.render();
    toast('Undone');
  },

  go(route) { location.hash = '#/' + route; },
  toast,
  render,
};
window.openduel = app; // handy for poking at state from the console

const shell = {
  top: h('header', { class: 'topbar' }),
  main: h('main'),
  nav: h('nav', { class: 'nav' }),
};
document.getElementById('app').append(shell.top, shell.main, shell.nav);

function parseRoute() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const fallback = app.state ? 'map' : app.room ? 'lobby' : 'setup';
  return { name: ROUTES[name] ? name : fallback, params };
}

function renderTop() {
  const s = app.state;
  const me = app.me;
  const brand = h('div', { class: 'brand' }, emoji('person-fencing'), h('span', { class: 'hide-sm' }, 'OpenDuel'));
  const roomChip = app.room ? h('div', { class: 'roomchip', title: app.room.connected ? 'Connected' : 'Connecting…' },
    h('span', { class: `dot ${app.room.connected ? 'on' : ''}` }), `Room ${app.room.code}`, app.mode === 'host' ? ' · host' : '') : null;
  if (!s || !me) { shell.top.replaceChildren(brand, h('div', { class: 'grow' }), roomChip ?? ''); return; }
  const phase = h('div', { class: 'phase' }, s.phase === 'ended' ? PHASE.ended : `Turn ${s.turn} · ${PHASE[s.phase]}`);
  const right = app.mode === 'local'
    ? h('div', { class: 'playas' },
      logo(me, 's'),
      select(s.nations.map((n) => [n.id, `${n.name}${n.bot ? ' · bot' : ''}${n.out ? ' (out)' : n.vassalOf ? ' (conquered)' : ''}`]), me.id, (v) => {
        app.setPrefs({ playAs: v });
        closeSheet();
        render();
        toast(`Playing as ${app.me.name}`);
      }))
    : h('div', { class: 'playas' }, roomChip, logo(me, 's'));
  shell.top.replaceChildren(h('div', { class: 'col', style: 'gap:0;min-width:0' }, brand, phase), right);
}

function renderNav(active) {
  const s = app.state;
  const me = app.me;
  const badge = (key) => {
    if (!s || !me) return null;
    if (key === 'map' && s.duels.some((d) => OPEN(d) && [duelist(s, d, 'a'), duelist(s, d, 'b')].includes(me.id))) {
      return h('span', { class: 'badge' }, '!');
    }
    if (key === 'map' && s.phase === 'orders' && playersInTurn(s).some((n) => n.id === me.id) && !s.orders[me.id]?.submitted) {
      return h('span', { class: 'badge' }, '!');
    }
    return null;
  };
  const items = NAV.filter(([k]) => (s && me) || k === 'rules').filter(([k]) => k !== 'admin' || app.isAdmin);
  shell.nav.replaceChildren(...items.map(([key, icon, label]) =>
    h('a', { href: `#/${key}`, class: active === key || (active === 'nation' && key === 'nations') || (active === 'me' && key === 'nations') ? 'active' : '' },
      h('img', { src: `assets/emoji/${icon}.png`, alt: '' }), label, badge(key))));
}

function render() {
  const route = parseRoute();
  const needsGame = !['setup', 'join', 'rules', 'lobby'].includes(route.name);
  if (needsGame && !(app.state && app.me)) route.name = app.room ? 'lobby' : 'setup';
  if (route.name === 'admin' && !app.isAdmin) route.name = 'map';
  renderTop();
  renderNav(route.name);
  const screen = ROUTES[route.name];
  if (app.current && app.current.screen !== screen) app.current.screen.leave?.(app);
  const keep = app.current?.screen === screen && app.current.route === route.name && screen.update;
  if (keep) screen.update(app, route.params);
  else {
    const el = screen.render(app, route.params);
    shell.main.replaceChildren(el);
    app.current = { screen, el, route: route.name };
    screen.mounted?.(app, route.params);
  }
}

window.addEventListener('hashchange', () => { closeSheet(); render(); });

// Boot: a player tab rejoins its room; a host re-opens its room; otherwise load the offline game.
if (!location.hash.startsWith('#/join') && resumePlayer(app)) {
  // player mode: the state arrives from the host
} else {
  app.state = LocalStore.load();
  if (!location.hash.startsWith('#/join')) resumeHosting(app);
}
render();
