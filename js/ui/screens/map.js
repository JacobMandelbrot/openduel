// Map screen: view the world, give troop orders, cede land, place builds.
import { h, emoji, logo, btn, sqbtn, chip, select, mix } from '../dom.js';
import { MapView } from '../mapview.js';
import { openSheet, closeSheet, toast } from '../sheet.js';
import * as G from '../../engine/game.js';
import { OPEN, duelist } from '../../engine/duels.js';
import { standings, crownHolder, capitalOccupier, capitalInfo } from '../../engine/state.js';
import { triangle } from '../mapview.js';
import { restart } from '../restart.js';
import { duelBubble, openDuelsAt } from '../duel-bubble.js';
import { eventIcon } from '../report.js';
import { playTheme } from '../../audio/piano.js';

let mv = null;
let refs = null;
let ui = { mode: 'idle', troop: null, selected: null, bubble: null };
let hudOpen = false;
let toolsOpen = false;

const T = (s, id) => s.map.territories[id];
const nation = (s, id) => s.nations.find((n) => n.id === id);
const troopAt = (s, tid) => s.troops.find((t) => t.at === tid);

export function describeOrder(s, order) {
  if (!order || order.type === 'hold') return 'Hold';
  if (order.type === 'move') return `Move to ${T(s, order.to).name}`;
  if (order.from == null) return `Support the troop holding ${T(s, order.target).name}`;
  return `Support ${T(s, order.from).name} → ${T(s, order.target).name}`;
}

export function render(app) {
  ui = { mode: 'idle', troop: null, selected: null, bubble: null };
  const wrap = h('div', { class: 'mapwrap' });
  refs = {
    hud: h('div', { class: 'map-hud' }),
    tools: h('div', { class: 'map-tools' }),
    bar: h('div', { class: 'submitbar' }),
    bubble: h('div', { class: 'bubble-layer' }),
  };
  mv = new MapView(wrap, { onTap: (tid) => onTap(app, tid) });
  mv.onView = positionBubble;
  return h('div', { style: 'position:absolute;inset:0' }, wrap, refs.bubble, refs.hud, refs.tools, refs.bar);
}

export function mounted(app) {
  update(app);
  // Phones: start zoomed in on your land rather than showing the whole continent tiny.
  if (!mv || mv.wrap.clientWidth >= 700) return;
  const s = app.state;
  const owner = app.me.vassalOf ?? app.me.id;
  const mine = s.map.territories.filter((t) => s.terr[t.id].owner === owner);
  if (!mine.length) return;
  const cx = mine.reduce((a, t) => a + t.x, 0) / mine.length, cy = mine.reduce((a, t) => a + t.y, 0) / mine.length;
  mv.focusAt(cx, cy, 160);
}

// Same shapes the map draws, for the key.
const piece = (inner) => h('span', { html: `<svg width="44" height="44" viewBox="-12 -12 24 24">${inner}</svg>` });
const army = (color, cmdColor) => piece(`<path d="${triangle(0, 0.5, 19)}" fill="${color}" stroke="#4a2c22" stroke-width="2" stroke-linejoin="round"/>${
  cmdColor ? `<path d="${triangle(0, 1.3, 8.5)}" fill="${cmdColor}" stroke="#fffbea" stroke-width="1.2" stroke-linejoin="round"/>` : ''}`);
const city = (color, capital) => piece(`<circle r="${capital ? 9.5 : 6.5}" fill="${color}" stroke="#4a2c22" stroke-width="1.8"/>${
  capital ? '<circle r="6.3" fill="none" stroke="#fffbea" stroke-width="1.6"/>' : ''}`);

function legendSheet(app) {
  const s = app.state;
  const me = app.me;
  const row = (icon, title, text) => h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' },
    h('div', { style: 'width:52px;display:grid;place-items:center;flex:none' }, icon),
    h('div', { class: 'grow' }, h('b', {}, title), h('div', { class: 'small' }, text)));
  openSheet(h('div', { class: 'col', style: 'gap:12px' },
    h('h2', { style: 'margin:0' }, 'Map key'),
    row(army(me.color), 'Troop', 'A triangle. Its colour is the nation that owns it. One troop per territory.'),
    row(piece(`<circle cx="-5" r="5.5" fill="${me.color}" stroke="#4a2c22" stroke-width="1.6"/><circle cx="6.5" r="5.5" fill="#efe4c6" stroke="#4a2c22" stroke-width="1.6"/>`), 'City', 'A circle in the colour of whoever owns it; pale circles are neutral. Each city you own lets you keep one troop. Home cities (and cities you\'ve held long enough) can build new troops.'),
    row(piece(`<circle r="6.5" fill="${me.color}" stroke="#4a2c22" stroke-width="1.8"/><circle r="9" fill="none" stroke="#e8574f" stroke-width="2" stroke-dasharray="2.5 1.8"/>`), 'Occupied capital',
      "A dashed ring in an enemy's colour: their troop is standing in this capital. If it is still there when cities resupply, the capital falls and its nation is conquered."),
    row(city(me.color, true), 'Capital', 'A bigger circle with a ring. Yours has a gold circle around it. Lose your capital and your nation is conquered.'),
    row(army(s.nations.find((n) => n.id !== me.id && !n.vassalOf)?.color ?? '#3fa89a', me.color), 'Conquered player\'s troop', 'The outer colour is the conqueror who owns it; the small inner triangle is the conquered player who commands it.'),
    row(piece('<rect x="-12" y="-12" width="24" height="24" rx="5" fill="#a9dbe6"/><path d="M-10,6L10,-6" stroke="rgba(40,80,90,.35)" stroke-width="5" stroke-linecap="round"/><path d="M-10,6L10,-6" stroke="#fff" stroke-width="2.6" stroke-dasharray="6 4" stroke-linecap="round"/>'),
      'Sea route', 'A white dashed line across the water. The two territories it joins border each other: troops can move, attack and support across it.'),
    row(h('span', { class: 'tok-duel' }, emoji('crossed-swords', 's')), 'Duel', 'A duel to settle here. The two players tap it to fight in person or throw rock-paper-scissors.'),
    row(piece('<rect x="-12" y="-12" width="24" height="24" rx="5" fill="#bcb09c"/>'), 'Mountains', 'Grey-brown land covered in peaks. Impassable: no troop can move, attack or support into it. Mountains never cut the map in two.'),
    row(emoji('shield', 'l'), 'Hold order', 'Your troop will stay and defend.'),
    row(h('span', { class: 'tok-dash' }), 'Dashed outline', 'Where you can move, support or build right now.'),
    row(h('span', { class: 'tok-dash pick' }), 'Gold outline', 'A city you chose to build a new troop in (build phase).'),
    row(h('span', { class: 'tok-dash drop' }), 'Red outline', 'A troop you chose to disband (build phase).'),
    row(emoji('hammer-and-wrench', 'l'), 'Map buttons', 'Bottom right. Tap it to show zoom, fit-the-map, this key and the draw button.'),
    row(emoji('white-flag', 'l'), 'Draw button', 'Offer (or agree to) a draw. The badge shows how many nations agree; the game ends drawn when everyone left agrees.')));
}
export function leave() { mv?.destroy(); mv = null; }

export function update(app) {
  if (!mv) return;
  const s = app.state;
  const me = app.me;
  const myOrders = s.orders[me.id]?.troops ?? {};
  const opts = { highlights: new Set(), arrows: [], marks: new Map(), selected: ui.selected, labels: true };

  if (app.results) {
    resultsOverlay(app, opts);
  } else if (s.phase === 'orders') {
    for (const t of s.troops.filter((x) => x.cmd === me.id)) {
      const o = myOrders[t.id];
      if (o?.type === 'move') opts.arrows.push({ from: t.at, to: o.to, kind: 'move' });
      else if (o?.type === 'support') opts.arrows.push({ from: t.at, to: o.target, via: o.from, kind: 'support' });
      else if (o?.type === 'hold') opts.marks.set(t.at, 'shield');
    }
    for (const c of s.orders[me.id]?.cedes ?? []) opts.marks.set(c.territory, 'handshake');
    if (ui.mode === 'move' || ui.mode === 'support') {
      const tr = s.troops.find((x) => x.id === ui.troop);
      if (tr) for (const n of T(s, tr.at).neighbors) opts.highlights.add(n);
    }
  }
  if (s.phase === 'build' && s.build?.[me.id]) {
    // Outlines only: dashed = you can build here, solid gold = chosen build, solid red = chosen to disband.
    const b = s.build[me.id];
    if (b.builds) for (const tid of b.sites) if (!b.chosen.includes(tid)) opts.highlights.add(tid);
    opts.picked = new Set(b.chosen);
    opts.dropped = new Set(b.disband.map((id) => s.troops.find((x) => x.id === id)?.at).filter((x) => x != null));
  }
  opts.duelAt = new Set(s.duels.filter(OPEN).map((d) => d.territory));
  opts.myCapital = me.out ? null : me.capital;
  // Each capital is labelled with its country's name in the country's colour.
  opts.capitalNames = new Map(s.nations.filter((n) => !n.out).map((n) => [n.capital, { name: n.name.replace(/^The /, ''), color: n.color }]));
  opts.occupied = new Map(s.nations.filter((n) => !n.out).map((n) => [n.capital, capitalOccupier(s, n.capital)]).filter(([, o]) => o).map(([tid, o]) => [tid, nation(s, o).color]));

  mv.update(s, opts);
  renderHud(app);
  renderBubble(app);
}

/** "Turn 3 · Cities resupply after this turn" — always at the top of the map's status card. */
function turnLine(s) {
  const every = G.buildEvery(s);
  const left = (every - (s.turn % every)) % every; // turns still to play after this one before the build phase
  const when = s.phase === 'build' ? 'Cities are resupplying now (no one has a majority)'
    : s.phase === 'ended' ? 'Game over'
      : left === 0 ? (s.phase === 'duels' ? 'Resupply and win check once these duels are done' : 'Resupply and win check after this turn')
        : left === 1 ? `Resupply and win check after next turn (turn ${s.turn + 1})` : `Resupply and win check after turn ${s.turn + left}`;
  return h('div', { class: 'turnline' }, h('b', {}, s.settings.turnLimit ? `Turn ${s.turn} of ${s.settings.turnLimit}` : `Turn ${s.turn}`), h('span', {}, emoji('classical-building', 's'), ' ', when));
}

function renderHud(app) {
  const s = app.state;
  const me = app.me;
  const inTurn = G.playersInTurn(s).some((n) => n.id === me.id);
  const myTroops = s.troops.filter((t) => t.cmd === me.id);
  const myOrders = s.orders[me.id]?.troops ?? {};
  refs.bar.replaceChildren();

  if (app.results) {
    // The turn report stays a full card: it is only up until the player taps OK.
    const card = h('div', { class: 'hud-card grow' }, turnLine(s));
    resultsCard(app, card);
    refs.hud.replaceChildren(card);
    renderTools(app);
    return;
  }

  // Everything else is one short line ("Orders 0/3"); tap it for the details.
  let icon = 'scroll';
  let head = `Turn ${s.turn}`;
  const more = [];
  const extra = [];
  if (ui.mode !== 'idle') {
    icon = ui.mode === 'move' ? 'footprints' : 'handshake';
    head = ui.mode === 'move' ? 'Tap where to move' : 'Tap where to support';
    refs.bar.append(btn('Cancel', { color: 'gray', onclick: () => { ui.mode = 'idle'; update(app); } }));
  } else if (s.phase === 'orders') {
    const submittedCount = G.playersInTurn(s).filter((n) => s.orders[n.id]?.submitted).length;
    if (!inTurn) {
      icon = 'eye';
      head = 'Watching';
      more.push(me.out ? 'You are out of the game: your old capital was taken. You can keep watching.'
        : me.vassalOf ? `Conquered by ${nation(s, me.vassalOf).name}. You have no troops left to command.` : 'Nothing to order this turn.');
    } else {
      head = `Orders ${myTroops.filter((t) => myOrders[t.id]).length}/${myTroops.length}`;
      more.push(myTroops.length ? 'Tap one of your troops to give it an order. No order = hold.' : 'You have no troops.');
      const sub = s.orders[me.id]?.submitted;
      refs.bar.append(sub
        ? btn('Submitted — tap to edit', { color: 'lime', icon: 'check-mark-button', onclick: () => app.act('setSubmitted', false) })
        : btn('Submit orders', { color: 'green', icon: 'outbox-tray', onclick: () => submit(app) }));
    }
    more.push(`${submittedCount}/${G.playersInTurn(s).length} nations submitted`);
  } else if (s.phase === 'duels') {
    const n = s.duels.filter(OPEN).length;
    icon = 'person-fencing';
    head = `Duels ${n}`;
    more.push(s.settings.rpsOnly
      ? 'Tap a red ⚔ marker on the map to throw rock-paper-scissors.'
      : 'Tap a red ⚔ marker on the map. Fight it in person and report the winner, or throw rock-paper-scissors.');
    const mine = s.duels.filter(OPEN).find((d) => [duelist(s, d, 'a'), duelist(s, d, 'b')].includes(me.id));
    refs.bar.append(btn(mine ? 'Your duel' : 'Next duel', { color: 'red', icon: 'crossed-swords', onclick: () => openDuel(app, (mine ?? s.duels.find(OPEN)).territory) }));
    if (app.isAdmin && s.duels.some((d) => OPEN(d) && ['a', 'b'].every((x) => nation(s, duelist(s, d, x))?.bot))) {
      extra.push(btn('Settle bot duels', { color: 'yellow', sm: true, icon: 'robot', onclick: () => app.act('settleAllBotDuels') }));
    }
  } else if (s.phase === 'build') {
    const b = s.build?.[me.id];
    if (b && !b.done) {
      const cities = s.map.territories.filter((t) => t.isCity && s.terr[t.id].owner === me.id).length;
      const troops = s.troops.filter((t) => t.nation === me.id).length;
      icon = b.disbands ? 'wastebasket' : 'military-helmet';
      head = [b.builds ? `Build ${b.chosen.length}/${b.builds}` : null, b.disbands ? `Disband ${b.disband.length}/${b.disbands}` : null].filter(Boolean).join(' · ') || 'Build';
      if (b.builds) more.push('Tap a city with a dashed outline to build a troop there.');
      if (b.disbands) more.push(`Tap your troops to disband: you have ${troops} troops but only ${cities} cit${cities === 1 ? 'y' : 'ies'} to supply them.`);
      more.push('Anything you leave unchosen is picked for you.');
      refs.bar.append(btn('Confirm', { color: 'green', icon: 'check-mark-button', onclick: () => app.act('submitBuild') }));
    } else {
      icon = 'hourglass-not-done';
      head = 'Build: waiting';
      more.push('Waiting for the other nations to choose their builds.');
      if (app.isAdmin) refs.bar.append(btn('Finish build phase (host)', { color: 'yellow', sm: true, onclick: () => app.act('forceFinishBuild') }));
    }
  } else if (s.phase === 'ended') {
    const r = s.result;
    const winner = nation(s, r?.nation) ?? G.standings(s)[0]?.nation;
    icon = r?.kind === 'draw' ? 'handshake' : 'trophy';
    head = r?.kind === 'draw' ? 'Draw' : `${winner?.name.replace(/^The /, '')} wins`;
    more.push(r?.kind === 'draw' ? 'Game drawn — every remaining nation agreed.'
      : `${winner?.name} wins${r?.reason === 'admin' ? ' (game ended early)' : r?.reason === 'limit' ? ' — most cities at the turn limit' : ` with ${G.majorityTarget(s)}+ cities`}!`);
    if (app.isAdmin) refs.bar.append(btn('Play again', { color: 'green', icon: 'world-map', onclick: () => restart(app, 'rematch') }));
    refs.bar.append(
      btn('Standings', { color: 'yellow', icon: 'trophy', sm: true, onclick: () => app.go('nations') }));
  }
  const toggle = () => { hudOpen = !hudOpen; renderHud(app); };
  const card = h('div', { class: 'hud-card hud-turn' },
    h('button', { class: 'hud-head', type: 'button', onclick: toggle, 'aria-expanded': String(hudOpen), title: 'Tap for details' },
      emoji(icon, 's'), h('b', {}, head), h('span', { class: 'hud-caret' }, hudOpen ? '▾' : '▸')),
    hudOpen ? h('div', { class: 'hud-more' }, turnLine(s), more.map((t) => h('div', { class: 'small' }, t))) : null,
    ...extra);
  refs.hud.replaceChildren(leaderboard(app), card);
  renderTools(app);
}

/** Right-hand buttons, folded behind one toggle so they don't cover the map. */
function renderTools(app) {
  const s = app.state;
  const draw = drawButton(app);
  const items = [
    sqbtn('information', { title: 'What am I looking at?', onclick: () => legendSheet(app) }),
    sqbtn('plus', { title: 'Zoom in', onclick: () => mv.zoomBy(0.75) }),
    sqbtn('minus', { title: 'Zoom out', onclick: () => mv.zoomBy(1.33) }),
    sqbtn('world-map', { title: 'Fit map', onclick: () => mv.fitAll() }),
    draw,
    s.phase === 'orders' && app.isAdmin ? sqbtn('hourglass-not-done', { title: 'Resolve turn now (admin)', onclick: () => {
      ui = { mode: 'idle', troop: null, selected: null, bubble: null };
      app.act('resolveTurn');
    } }) : null,
  ].filter(Boolean);
  const toggle = sqbtn(toolsOpen ? 'cross-mark' : 'hammer-and-wrench', {
    title: toolsOpen ? 'Hide map buttons' : 'Map buttons', on: toolsOpen,
    onclick: () => { toolsOpen = !toolsOpen; renderTools(app); },
  });
  // Folded away, the toggle carries the draw badge so a draw offer is still noticed.
  const badge = draw?.querySelector('.sq-badge');
  if (!toolsOpen && badge) toggle.append(badge.cloneNode(true));
  refs.tools.replaceChildren(...(toolsOpen ? items : []), toggle);
}

// ---------- Turn results, shown on the map ----------

let stopTheme = null;

/** Every order from the turn just resolved, drawn in its nation's colour, plus destroyed troops and captured land. */
function resultsOverlay(app, opts) {
  const s = app.state;
  const R = s.lastResolution;
  if (!R) return;
  const color = (id) => nation(s, id)?.color ?? '#ffffff';
  for (const [id, o] of Object.entries(R.orders)) {
    const b = R.before[id];
    if (!b) continue;
    if (o.type === 'move') opts.arrows.push({ from: b.at, to: o.to, kind: R.status[id] === 'ok' ? 'move' : 'fail', color: color(b.nation) });
    else if (o.type === 'support' && !o.void) {
      opts.arrows.push({ from: b.at, to: o.target, via: o.from, kind: R.cut.includes(Number(id)) ? 'cut' : 'support', color: color(b.nation) });
    }
  }
  opts.ghosts = R.destroyed.filter((id) => R.before[id]).map((id) => ({ at: R.before[id].at, color: color(R.before[id].nation) }));
  opts.captured = new Set(app.results.events.filter((e) => ['capture', 'claim', 'cede', 'conquest'].includes(e.kind)).map((e) => e.territory));
}

function resultsCard(app, card) {
  const s = app.state;
  const me = app.me;
  const r = app.results;
  const ev = r.events;
  const count = (kinds) => ev.filter((e) => kinds.includes(e.kind)).length;
  const won = G.victors(ev).includes(me.id);
  const winners = G.victors(ev).map((id) => nation(s, id)).filter((n) => n?.theme);
  const featured = winners.find((n) => n.id === me.id) ?? winners[0];
  if (featured && !r.played) {
    r.played = true;
    stopTheme = playTheme(featured.theme, { onEnd: () => { stopTheme = null; } });
  }
  const stat = (n, label, icon) => (n ? h('span', {}, emoji(icon, 's'), `${n} ${label}`) : null);
  card.append(
    h('div', { class: 'row' }, emoji('scroll'), h('b', { class: 'grow' }, r.title), won ? chip('Victory!', { icon: 'trophy', cls: 'gold' }) : null),
    h('div', { class: 'stats', style: 'margin:4px 0' },
      stat(count(['capture', 'claim']), 'taken', 'triangular-flag'),
      stat(count(['repelled', 'bounce']), 'stopped', 'shield'),
      stat(R_destroyed(s), 'lost', 'cross-mark'),
      stat(count(['duel_called']), 'duels', 'person-fencing'),
      stat(count(['conquest']), 'conquered', 'crown')),
    h('details', {}, h('summary', { class: 'small', style: 'cursor:pointer;font-weight:600' }, `Key & what happened (${ev.length})`),
      h('div', { style: 'max-height:30vh;overflow-y:auto' },
        h('div', { class: 'small muted', style: 'margin:4px 0' }, 'Arrows show every order, in the colour of the nation that gave it. Solid arrow = moved · red bar = stopped · dashed = support (grey if cut) · faded ✕ = destroyed · gold outline = changed hands.'),
        ev.length ? ev.map((e) => h('div', { class: 'news small' }, emoji(eventIcon(e.kind), 's'), h('div', { class: 'grow' }, e.text)))
          : h('div', { class: 'small' }, 'A quiet turn. Everyone held their ground.'))));
  refs.bar.append(btn('OK', { color: 'green', icon: 'check-mark-button', onclick: () => {
    stopTheme?.();
    app.results = null;
    update(app);
  } }));
}

const R_destroyed = (s) => s.lastResolution?.destroyed.length ?? 0;

/** Draw button for the right-hand column: badge = how many nations agree; highlighted once you agree. */
function drawButton(app) {
  const s = app.state;
  const me = app.me;
  if (s.phase === 'ended' || me.vassalOf) return null;
  const voters = s.nations.filter((n) => !n.vassalOf);
  const votes = s.drawVotes ?? {};
  const agreed = voters.filter((n) => votes[n.id]).length;
  const mine = !!votes[me.id];
  const b = sqbtn('white-flag', {
    title: mine ? `Withdraw from the draw (${agreed}/${voters.length} agree)` : agreed ? `Agree to a draw (${agreed}/${voters.length} agree)` : 'Offer a draw',
    on: mine,
    onclick: () => {
      const msg = mine ? `Withdraw your agreement to a draw? (${agreed}/${voters.length} agree now)`
        : agreed ? `Agree to a draw? ${agreed} of ${voters.length} nations already agree. The game ends drawn once everyone left agrees.`
          : 'Offer a draw? The game ends drawn once every remaining nation agrees.';
      if (confirm(msg)) app.act('voteDraw', !mine);
    },
  });
  if (agreed) b.append(h('span', { class: 'sq-badge' }, `${agreed}/${voters.length}`));
  return b;
}

/** Top-left: every nation ranked by cities held. Conquered nations listed last, greyed. Tap a row for that nation. */
function leaderboard(app) {
  const s = app.state;
  const open = app.prefs.lbOpen === true; // starts folded: phones need the map space
  const crown = crownHolder(s);
  const short = (n) => n.name.replace(/^The /, '');
  const toggle = () => { app.setPrefs({ lbOpen: !open }); renderHud(app); };
  // Cities first (they decide the game), then troops.
  const row = (n, rank, cities, troops) => h('a', { href: `#/nation/${n.id}`, class: `lb-row ${n.id === app.me.id ? 'me' : ''} ${n.vassalOf ? 'out' : ''}` },
    h('span', { class: 'rk' }, rank ?? ''),
    h('span', { class: 'dot', style: `background:${n.color}` }),
    h('span', { class: 'nm' }, short(n)),
    n.id === crown ? emoji('crown', 's') : null,
    h('b', { class: 'lb-num' }, cities ?? '–'),
    h('span', { class: 'lb-num lb-troops' }, troops ?? '–'));
  return h('div', { class: `hud-card lb ${open ? 'open' : ''}` },
    h('button', { class: 'lb-head', type: 'button', onclick: toggle, 'aria-expanded': String(open) },
      h('span', { class: 'dot', style: 'background:#fffbea' }), h('span', { class: 'grow' }, 'Cities', h('small', { class: 'lb-target', title: 'Checked on resupply turns' }, ` · win at ${G.majorityTarget(s)}`)), open ? '▾' : '▸'),
    open ? h('div', { class: 'lb-cols' }, h('span', { class: 'grow' }), h('span', { class: 'lb-num' }, 'cities'), h('span', { class: 'lb-num lb-troops' }, 'troops')) : null,
    open ? h('div', { class: 'lb-list' },
      standings(s).map((r, i) => row(r.nation, i + 1, r.cities, r.troops)),
      s.nations.filter((n) => n.vassalOf).map((n) => row(n, null, null, s.troops.filter((t) => t.cmd === n.id).length))) : null);
}

function submit(app) {
  ui = { mode: 'idle', troop: null, selected: null, bubble: null };
  const r = app.act('setSubmitted', true);
  if (!r) toast('Orders submitted. The turn resolves when every nation has submitted.');
}

function onTap(app, tid) {
  const s = app.state;
  const me = app.me;
  if (tid == null) { ui = { mode: 'idle', troop: null, selected: null, bubble: null }; closeSheet(); update(app); return; }

  if (s.phase === 'duels' && openDuelsAt(s, tid).length) { openDuel(app, tid); return; }

  if (s.phase === 'orders' && ui.mode === 'move') {
    const tr = s.troops.find((x) => x.id === ui.troop);
    // A near miss keeps you choosing; tapping the troop itself (or the sea) cancels.
    if (tr && tid !== tr.at && !T(s, tr.at).neighbors.includes(tid)) { toast('Tap a territory with a dashed outline'); return; }
    ui = { mode: 'idle', troop: null, selected: null, bubble: null };
    if (tr && T(s, tr.at).neighbors.includes(tid)) {
      app.act('setOrder', tr.id, { type: 'move', to: tid });
      toast(`Ordered: move to ${T(s, tid).name}`);
    } else update(app);
    return;
  }
  if (s.phase === 'orders' && ui.mode === 'support') {
    const tr = s.troops.find((x) => x.id === ui.troop);
    if (tr && tid !== tr.at && !T(s, tr.at).neighbors.includes(tid)) { toast('Tap a territory with a dashed outline'); return; }
    ui = { mode: 'idle', troop: null, selected: null, bubble: null };
    if (tr && T(s, tr.at).neighbors.includes(tid)) ui ={ mode: 'idle', troop: null, selected: tid, bubble: { tid, kind: 'support', supporter: tr.id } };
    update(app);
    return;
  }
  if (s.phase === 'build' && s.build?.[me.id] && !s.build[me.id].done) {
    const b = s.build[me.id];
    const tr = troopAt(s, tid);
    if (b.builds && b.sites.includes(tid)) { ui = { mode: 'idle', troop: null, selected: null, bubble: null }; app.act('toggleBuild', tid); return; }
    if (b.disbands && tr?.nation === me.id) { ui = { mode: 'idle', troop: null, selected: null, bubble: null }; app.act('toggleDisband', tr.id); return; }
  }
  // Tapping the same piece again closes its buttons.
  ui = ui.bubble?.tid === tid && ui.bubble.kind === 'unit'
    ? { mode: 'idle', troop: null, selected: null, bubble: null }
    : { mode: 'idle', troop: null, selected: tid, bubble: { tid, kind: 'unit' } };
  update(app);
  if (ui.bubble) makeRoomAbove(tid);
}

/** If a tapped piece is up under the status cards, slide the map down so its buttons fit above it. */
function makeRoomAbove(tid) {
  const a = mv.toScreen(...Object.values(mv.anchorOf(tid)));
  const top = mv.wrap.getBoundingClientRect().top;
  const hudBottom = refs.hud.getBoundingClientRect().bottom - top;
  const bubbleH = refs.bubble.firstChild?.offsetHeight ?? 110;
  const want = Math.min(hudBottom + bubbleH + 24, mv.wrap.clientHeight * 0.7);
  if (a.y >= want) return;
  const unitsPerPx = mv.view.w / mv.wrap.clientWidth;
  mv.setView({ ...mv.view, y: mv.view.y - (want - a.y) * unitsPerPx });
}

// ---------- Floating buttons above the tapped troop or city ----------

/** Centre the map on a duel and open its controls above the marker. */
function openDuel(app, tid) {
  ui = { mode: 'idle', troop: null, selected: tid, bubble: { tid, kind: 'duel' } };
  update(app);
  // Slide the map so the duel marker sits in the clear space above the docked panel.
  const el = refs.bubble.firstChild;
  if (!el) return;
  const top = mv.wrap.getBoundingClientRect().top;
  const free = el.getBoundingClientRect().top - top;
  const want = Math.max(40, free / 2);
  const a = mv.toScreen(...Object.values(mv.anchorOf(tid)));
  const unitsPerPx = mv.view.w / mv.wrap.clientWidth;
  mv.setView({ ...mv.view, x: mv.view.x + (a.x - mv.wrap.clientWidth / 2) * unitsPerPx, y: mv.view.y + (a.y - want) * unitsPerPx });
}

function closeBubble(app) {
  ui = { mode: 'idle', troop: null, selected: null, bubble: null };
  update(app);
}

function renderBubble(app) {
  const layer = refs.bubble;
  if (!ui.bubble || app.results) { layer.replaceChildren(); refs.hud.style.visibility = ''; return; }
  const s = app.state;
  const me = app.me;
  const { tid, kind } = ui.bubble;
  const t = T(s, tid);
  const tr = troopAt(s, tid);
  const owner = nation(s, s.terr[tid].owner);
  const info = act('Info', 'information', false, () => { closeBubble(app); territorySheet(app, tid); });
  const parts = [];

  if (kind === 'duel') {
    const blocks = duelBubble(app, tid);
    if (!blocks.length) { ui.bubble = null; layer.replaceChildren(); refs.hud.style.visibility = ''; return; }
    parts.push(h('div', { class: 'bubble-scroll' }, blocks), h('div', { class: 'bubble-acts' }, btn('Close', { color: 'gray', sm: true, onclick: () => closeBubble(app) })));
  } else if (kind === 'support') {
    const supporter = s.troops.find((x) => x.id === ui.bubble.supporter);
    const { defend, attack, choose } = supportOptions(app, supporter, tid);
    parts.push(h('div', { class: 'bubble-title' }, `${T(s, supporter.at).name} supports into ${t.name}`));
    const opt = (o, icon) => h('button', { class: 'bubble-opt', type: 'button', onclick: () => { ui.bubble = null; choose(o); } },
      emoji(icon, 's'), h('span', { class: 'grow' }, o.title, h('small', {}, o.sub)));
    parts.push(...defend.map((o) => opt(o, 'shield')), ...attack.map((o) => opt(o, 'crossed-swords')));
    if (!defend.length && !attack.length) parts.push(h('div', { class: 'small' }, 'Nothing to support here: no troop is in it and no other troop borders it.'));
    parts.push(h('div', { class: 'bubble-acts' }, btn('Cancel', { color: 'gray', sm: true, onclick: () => closeBubble(app) })));
  } else {
    const occupier = t.isCapital && capitalOccupier(s, tid);
    const capOf = occupier && capitalInfo(s, tid).of;
    const sub = t.impassable ? 'Impassable mountains — no troop can ever enter' : occupier ? (capOf.vassalOf
      ? `${capOf.name}'s old capital, occupied by ${nation(s, occupier).name} — ${capOf.name} is out if it's still there at the next resupply`
      : `Occupied by ${nation(s, occupier).name} — falls at the next resupply unless retaken`)
      : tr ? `Troop · ${nation(s, tr.cmd).name}` : owner ? owner.name : 'Neutral land';
    parts.push(h('div', { class: 'bubble-title' }, t.name, t.isCapital ? ' (capital)' : t.isCity ? ' (city)' : '', h('small', {}, sub)));
    const myTroop = s.phase === 'orders' && tr && tr.cmd === me.id;
    if (myTroop) {
      const current = s.orders[me.id]?.troops[tr.id];
      parts.push(h('div', { class: 'bubble-acts' },
        act('Hold', 'shield', current?.type === 'hold', () => {
          ui = { mode: 'idle', troop: null, selected: null, bubble: null };
          app.act('setOrder', tr.id, { type: 'hold' });
        }),
        act('Move', 'footprints', current?.type === 'move', () => {
          ui = { mode: 'move', troop: tr.id, selected: tid, bubble: null };
          update(app);
        }),
        act('Support', 'handshake', current?.type === 'support', () => {
          ui = { mode: 'support', troop: tr.id, selected: tid, bubble: null };
          update(app);
        }),
        current ? act('Clear', 'cross-mark', false, () => {
          ui = { mode: 'idle', troop: null, selected: null, bubble: null };
          app.act('setOrder', tr.id, null);
        }) : null,
        info));
    } else if (s.phase === 'orders' && !tr && owner?.id === me.id && !me.vassalOf) {
      parts.push(h('div', { class: 'bubble-acts' }, act('Cede…', 'handshake', false, () => { closeBubble(app); territorySheet(app, tid); }), info));
    } else {
      parts.push(h('div', { class: 'bubble-acts' }, info));
    }
  }
  layer.replaceChildren(h('div', { class: `bubble ${kind === 'unit' ? '' : 'wide'}` }, parts));
  positionBubble();
}

const sqIcon = (icon, title, onclick) => h('button', { class: 'bubble-icon', type: 'button', title, 'aria-label': title, onclick }, emoji(icon, 's'));
/** Compact order tile: icon over a short label; 'on' marks the troop's current order. */
const act = (label, icon, on, onclick) => h('button', { class: `bubble-act ${on ? 'on' : ''}`, type: 'button', onclick }, emoji(icon, 's'), label);

/** Keep the bubble pinned above its piece while the map pans and zooms (or below it near the top edge). */
function positionBubble() {
  const el = refs?.bubble.firstChild;
  if (!el || !ui.bubble || !mv?.view) return;
  const anchor = mv.anchorOf(ui.bubble.tid);
  if (ui.bubble.kind === 'duel') anchor.y -= 12;
  const a = mv.toScreen(anchor.x, anchor.y);
  const W = refs.bubble.clientWidth, H = refs.bubble.clientHeight;
  const w = el.offsetWidth, hgt = el.offsetHeight;
  // Tall panels (duels) dock above the button bar instead of covering their own piece.
  const docked = ui.bubble.kind === 'duel' || hgt > H * 0.5;
  el.classList.toggle('docked', docked);
  refs.hud.style.visibility = docked ? 'hidden' : ''; // give the map room above a docked panel
  if (docked) {
    el.style.left = `${Math.max(8, (W - w) / 2)}px`;
    el.style.top = `${Math.max(8, H - hgt - 84)}px`;
    el.classList.remove('below', 'offscreen');
    return;
  }
  const below = a.y - hgt - 16 < 70;
  const left = Math.max(8, Math.min(W - w - 8, a.x - w / 2));
  const top = below ? a.y + 26 : a.y - hgt - 12;
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(8, Math.min(H - hgt - 8, top))}px`;
  el.style.setProperty('--ax', `${Math.max(16, Math.min(w - 16, a.x - left))}px`);
  el.classList.toggle('below', below);
  el.classList.toggle('offscreen', a.x < 0 || a.y < 0 || a.x > W || a.y > H);
}

function territorySheet(app, tid) {
  const s = app.state;
  const me = app.me;
  const t = T(s, tid);
  const owner = nation(s, s.terr[tid].owner);
  const tr = troopAt(s, tid);
  const home = t.homeOf ? nation(s, t.homeOf) : null;
  const rows = [];

  rows.push(h('div', { class: 'row' },
    emoji(t.isCapital ? 'castle' : t.isCity ? 'classical-building' : 'evergreen-tree', 'l'),
    h('div', { class: 'grow' },
      h('h2', { style: 'margin:0' }, t.name),
      h('div', { class: 'row wrap small' },
        t.isCapital ? chip(`Capital of ${home?.name}`, { cls: 'gold' }) : t.isCity ? chip('City', { cls: 'gold' }) : chip('Countryside'),
        home && !t.isCapital ? chip(`Homeland of ${home.name}`) : null,
        t.isCity && owner && t.homeOf !== owner.id ? chip(`Held ${s.terr[tid].held}/2 build phases`, { icon: 'hourglass-not-done' }) : null))));

  rows.push(h('div', { class: 'item' }, owner ? logo(owner) : emoji('evergreen-tree', 'l'),
    h('div', { class: 'grow' }, h('div', { class: 'sub' }, 'Owner'), h('div', { class: 'title' }, owner ? owner.name : 'Neutral land'))));

  if (tr) {
    const tn = nation(s, tr.nation), cmd = nation(s, tr.cmd);
    rows.push(h('div', { class: 'item' }, logo(cmd),
      h('div', { class: 'grow' }, h('div', { class: 'sub' }, 'Troop'),
        h('div', { class: 'title' }, cmd.id === tn.id ? tn.name : `${cmd.name} (fighting for ${tn.name})`))));
  }

  if (s.phase === 'orders' && tr && tr.cmd === me.id) {
    const current = s.orders[me.id]?.troops[tr.id];
    rows.push(h('div', { class: 'small muted' }, `Current order: ${current ? describeOrder(s, current) : 'none (holds)'}`));
    rows.push(h('div', { class: 'row wrap' },
      btn('Hold', { color: 'blue', icon: 'shield', onclick: () => { closeSheet(); app.act('setOrder', tr.id, { type: 'hold' }); } }),
      btn('Move', { color: 'green', icon: 'footprints', onclick: () => { closeSheet(); ui = { mode: 'move', troop: tr.id, selected: tid }; update(app); } }),
      btn('Support', { color: 'teal', icon: 'handshake', onclick: () => { closeSheet(); ui = { mode: 'support', troop: tr.id, selected: tid }; update(app); } }),
      current ? btn('Clear', { color: 'gray', sm: true, onclick: () => { closeSheet(); app.act('setOrder', tr.id, null); } }) : null));
  }

  if (s.phase === 'orders' && !tr && owner?.id === me.id && !me.vassalOf) {
    const cede = s.orders[me.id]?.cedes?.find((c) => c.territory === tid);
    rows.push(h('div', { class: 'field' }, 'Cede this territory (happens at the end of the turn)',
      select([['', '— keep it —'], ...s.nations.filter((n) => n.id !== me.id && !n.vassalOf).map((n) => [n.id, n.name])], cede?.to ?? '',
        (v) => app.act('addCede', tid, v || null))));
  }

  openSheet(h('div', { class: 'col' }, rows), { onClose: () => { if (ui.mode === 'idle') { ui.selected = null; update(app); } } });
}

/** What `supporter` can usefully support into `target`: defend the troop there, or back a move/attack into it. */
function supportOptions(app, supporter, target) {
  const s = app.state;
  const me = app.me;
  const tname = T(s, target).name;
  const myOrders = s.orders[me.id]?.troops ?? {};
  const mine = (t) => t.cmd === me.id;
  const who = (t) => nation(s, t.cmd).name;
  const occ = troopAt(s, target);
  const occLeaving = occ && mine(occ) && myOrders[occ.id]?.type === 'move';
  // Your supports never count toward attacking a territory your own troop is staying in, so don't offer them.
  const ownTroopStays = occ && occ.nation === supporter.nation && !occLeaving;

  const defend = [];
  if (occ && occ.id !== supporter.id && !occLeaving) {
    defend.push({
      troop: occ, order: { type: 'support', target, from: null },
      title: mine(occ) ? `Help your troop defend ${tname}` : `Help ${who(occ)} defend ${tname}`,
      sub: mine(occ) ? 'Counts as long as that troop stays put (Hold or Support).' : `Counts only if ${who(occ)}'s troop stays put this turn.`,
    });
  }
  const attack = [];
  if (!ownTroopStays) {
    for (const x of s.troops) {
      if (x.id === supporter.id || x.at === target || !T(s, x.at).neighbors.includes(target)) continue;
      if (occ && x.nation === occ.nation && !occLeaving) continue; // a nation can't attack its own troop
      const from = T(s, x.at).name;
      const attacking = occ && !occLeaving;
      const alreadyOrdered = myOrders[x.id]?.type === 'move' && myOrders[x.id].to === target;
      attack.push({
        troop: x, order: { type: 'support', target, from: x.at }, alsoMove: mine(x) && !alreadyOrdered ? x : null,
        title: mine(x)
          ? `Back up your troop from ${from} as it ${attacking ? 'attacks' : 'moves into'} ${tname}`
          : `Help ${who(x)}'s troop from ${from} ${attacking ? 'attack' : 'move into'} ${tname}`,
        sub: mine(x) ? (alreadyOrdered ? 'That troop is already ordered to go there.' : `This also orders your ${from} troop to go there.`)
          : `Counts only if ${who(x)} really orders that move. Agree on it with them.`,
      });
    }
  }
  const choose = (o) => {
    if (o.alsoMove) app.act('setOrder', o.alsoMove.id, { type: 'move', to: target });
    app.act('setOrder', supporter.id, o.order);
    toast(o.alsoMove ? `Ordered: ${T(s, o.alsoMove.at).name} moves in, ${T(s, supporter.at).name} supports` : 'Support ordered');
  };
  return { defend, attack, choose };
}

export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export { mix };
