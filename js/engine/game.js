// Game lifecycle: create → orders → resolve → duels → build → next turn. DESIGN.md "Turn pipeline".
import { CONFIG, NATION_COLORS, EMBLEMS } from './config.js';
import { makeRng } from './rng.js';
import { generateMap } from './mapgen.js';
import { adjudicate } from './adjudicate.js';
import { botOrders } from './bots.js';
import { botIdentity } from './names.js';
import { record } from './chronicle.js';
import * as D from './duels.js';
import * as B from './builds.js';
import { nationById, troopById, troopAt, troopsCommandedBy, removeTroop, setOwner, standings, bump, independents, settleCapitals, capitalOccupier } from './state.js';

const rngFor = (state, label) => makeRng(`${state.seed}:${state.turn}:${label}:${state.nextId}`);

/** Fill in identities for fake players so a sandbox needs only a count. */
export function fakePlayers(seed, count, taken = []) {
  const rng = makeRng(`${seed}:bots`);
  const used = new Set(taken.map((p) => p.name));
  const colors = rng.shuffle(NATION_COLORS.filter((c) => !taken.some((p) => p.color === c)));
  const emblems = rng.shuffle(EMBLEMS.filter((e) => !taken.some((p) => p.emblem === e)));
  const styles = ['aggressive', 'defensive', 'random', 'aggressive', 'defensive'];
  return Array.from({ length: count }, (_, i) => ({
    ...botIdentity(rng, used),
    emblem: emblems[i % emblems.length],
    color: colors[i % colors.length] ?? NATION_COLORS[i % NATION_COLORS.length],
    bot: styles[i % styles.length],
  }));
}

/** Play again with the same nations (names, emblems, colours, themes, bot styles). Pass the old seed to replay the same map. */
export function rematch(state, seed) {
  const players = state.nations.map(({ name, leader, motto, emblem, color, theme, bot }) => ({ name, leader, motto, emblem, color, theme, bot }));
  return createGame({ seed, players, settings: { rpsOnly: state.settings.rpsOnly, neutralShare: state.settings.neutralShare, buildEvery: state.settings.buildEvery, winShare: state.settings.winShare, turnLimit: state.settings.turnLimit } });
}

export function createGame({ seed, players, settings = {} }) {
  if (players.length < CONFIG.MIN_PLAYERS || players.length > CONFIG.MAX_PLAYERS) {
    throw new Error(`Games need ${CONFIG.MIN_PLAYERS}–${CONFIG.MAX_PLAYERS} nations`);
  }
  const rng = makeRng(`${seed}:setup`);
  const { map, homes } = generateMap(seed, players.length, { neutralShare: settings.neutralShare });
  const slotOwner = rng.shuffle(players.map((_, i) => i));
  const nations = players.map((p, i) => ({
    id: `n${i}`, name: p.name, leader: p.leader, motto: p.motto ?? '', emblem: p.emblem, color: p.color,
    theme: p.theme ?? null, bot: p.bot ?? null,
    home: [], capital: null, vassalOf: null, conqueredTurn: null,
  }));
  homes.forEach((h, slot) => {
    const n = nations[slotOwner[slot]];
    n.home = h.slice();
    n.capital = h[0];
  });
  for (const t of map.territories) if (t.homeOf !== null) t.homeOf = nations[slotOwner[t.homeOf]].id;

  const terr = {};
  for (const t of map.territories) terr[t.id] = { owner: t.homeOf, held: 0, heldBy: t.homeOf };
  const state = {
    version: 1, seed: String(seed), turn: 1, phase: 'orders',
    settings: { rpsOnly: false, neutralShare: CONFIG.NEUTRAL_SHARE, buildEvery: CONFIG.BUILD_EVERY_TURNS, winShare: CONFIG.WIN_SHARE, turnLimit: 0, ...settings },
    map, nations, terr, troops: [], nextId: 1,
    orders: {}, duels: [], build: null, tags: {}, chronicle: [], stats: {}, report: null,
  };
  for (const n of nations) {
    state.stats[n.id] = { duelsWon: 0, duelsLost: 0, captures: 0, losses: 0 };
    for (const tid of n.home) {
      if (map.territories[tid].isCity) state.troops.push({ id: state.nextId++, nation: n.id, cmd: n.id, at: tid });
    }
  }
  state.chronicle.push({ turn: 1, kind: 'start', text: `A new world: ${nations.length} nations divide the continent.`, nations: [], territory: null });
  startOrders(state);
  return state;
}

// ---------- Orders ----------

/** Players who give orders this turn: every independent nation, plus conquered players who still command troops. */
export const playersInTurn = (state) =>
  state.nations.filter((n) => !n.vassalOf || troopsCommandedBy(state, n.id).length);

function startOrders(state) {
  state.phase = 'orders';
  state.orders = {};
  for (const n of playersInTurn(state)) {
    state.orders[n.id] = n.bot ? botOrders(state, n.id, rngFor(state, `bot:${n.id}`)) : { submitted: false, troops: {}, cedes: [] };
  }
}

export function setOrder(state, playerId, troopId, order) {
  const t = troopById(state, troopId);
  if (state.phase !== 'orders' || !t || t.cmd !== playerId) return;
  const o = (state.orders[playerId] ??= { submitted: false, troops: {}, cedes: [] });
  if (order) o.troops[troopId] = order;
  else delete o.troops[troopId];
}

export function addCede(state, playerId, territory, to) {
  const o = state.orders[playerId];
  const n = nationById(state, playerId);
  if (!o || n.vassalOf || state.terr[territory].owner !== playerId) return;
  o.cedes = o.cedes.filter((c) => c.territory !== territory);
  if (to) o.cedes.push({ territory, to });
}

export function setSubmitted(state, playerId, submitted) {
  if (state.phase !== 'orders' || !state.orders[playerId]) return null;
  state.orders[playerId].submitted = submitted;
  if (submitted && playersInTurn(state).every((n) => state.orders[n.id]?.submitted)) return resolveTurn(state);
  return null;
}

/** Resolve the turn now. Missing human orders become holds; missing bot orders are generated. */
export function resolveTurn(state) {
  if (state.phase !== 'orders') return null;
  for (const n of playersInTurn(state)) {
    if (!state.orders[n.id]) state.orders[n.id] = n.bot ? botOrders(state, n.id, rngFor(state, `bot:${n.id}`)) : { troops: {}, cedes: [] };
  }
  const merged = {};
  for (const t of state.troops) {
    const o = state.orders[t.cmd]?.troops[t.id];
    if (o) merged[t.id] = o;
  }
  const result = adjudicate({ territories: state.map.territories, terr: state.terr, troops: state.troops, orders: merged });
  const events = result.events.slice();
  // Everything needed to replay this turn on the map: where every troop stood, every (normalised) order and its outcome.
  state.lastResolution = {
    turn: state.turn,
    before: Object.fromEntries(state.troops.map((t) => [t.id, { at: t.at, nation: t.nation, cmd: t.cmd }])),
    orders: result.orders, status: result.status, moved: result.moved, destroyed: result.destroyed, cut: result.cut,
  };

  for (const ev of events) {
    if (ev.kind === 'capture' && ev.battle) { bump(state, ev.nation, 'captures'); bump(state, ev.victim, 'losses'); }
  }
  for (const id of result.destroyed) removeTroop(state, id);
  for (const m of result.moved) { const t = troopById(state, m.troop); if (t) t.at = m.to; }
  D.createDuels(state, result.duels);
  for (const t of state.troops.slice()) setOwner(state, t.at, t.nation, events);
  // A capital with an enemy troop in it is only occupied for now; it falls at the next build stage.
  for (const n of state.nations) {
    if (n.out) continue;
    const rec = state.terr[n.capital];
    const occ = capitalOccupier(state, n.capital);
    if (occ && rec.occupiedBy !== occ) events.push({ kind: 'capital_occupied', nation: occ, victim: n.id, territory: n.capital, conquered: !!n.vassalOf });
    rec.occupiedBy = occ;
  }
  for (const [playerId, o] of Object.entries(state.orders)) {
    for (const c of o.cedes || []) {
      if (state.terr[c.territory].owner !== playerId || troopAt(state, c.territory) || nationById(state, playerId).vassalOf) continue;
      events.push({ kind: 'cede', from: playerId, to: c.to, territory: c.territory });
      setOwner(state, c.territory, c.to, events, { cede: true });
    }
  }
  if (state.settings.rpsOnly) settleBotDuels(state, events);
  if (state.duels.some(D.OPEN)) state.phase = 'duels';
  else afterCombat(state, events);
  return finish(state, events, `Turn ${state.lastResolution.turn} results`, 'turn');
}

// ---------- Duels ----------

const bothBots = (state, d) => ['a', 'b'].every((s) => nationById(state, D.duelist(state, d, s))?.bot);

/** Bot-vs-bot duels (including follow-up claim duels) settled by random rock-paper-scissors. */
function settleBotDuels(state, events) {
  for (let d; (d = state.duels.find((x) => D.OPEN(x) && bothBots(state, x)));) {
    D.autoRps(state, d, rngFor(state, `rps:${d.id}`), events);
  }
}

function duelAction(state, fn, title) {
  if (state.phase !== 'duels') return null;
  const events = [];
  fn(events);
  if (state.settings.rpsOnly) settleBotDuels(state, events);
  if (!state.duels.some(D.OPEN)) afterCombat(state, events);
  return events.length ? finish(state, events, title) : null;
}

export const reportDuel = (state, duelId, playerId, winnerSide) =>
  duelAction(state, (ev) => D.report(state, duelId, playerId, winnerSide, ev), 'Duel results');
export const throwRps = (state, duelId, playerId, choice) =>
  duelAction(state, (ev) => D.throwRps(state, duelId, playerId, choice, rngFor(state, `rps:${duelId}`), ev), 'Rock, paper, scissors!');
/** Admin: settle one duel with random throws for both sides. */
export const adminRps = (state, duelId) =>
  duelAction(state, (ev) => {
    const d = state.duels.find((x) => x.id === duelId);
    if (d && D.OPEN(d)) D.autoRps(state, d, rngFor(state, `rps:${duelId}`), ev);
  }, 'Rock, paper, scissors!');
export const adminSettleDuel = (state, duelId, winnerSide, method = 'admin') =>
  duelAction(state, (ev) => D.adminSettle(state, duelId, winnerSide, method, ev), 'Duel results');
export const concedeDuel = (state, duelId, side) =>
  duelAction(state, (ev) => D.concede(state, duelId, side, ev), 'Duel results');
export const cedeContested = (state, territory, to) =>
  duelAction(state, (ev) => D.cedeContested(state, territory, to, ev), 'Territory ceded');
export const settleAllBotDuels = (state) =>
  duelAction(state, (ev) => settleBotDuels(state, ev), 'Bot duels');

// ---------- Build ----------

/** How many turns between build stages in this game (setting; falls back to the default). */
export const buildEvery = (state) => Math.max(CONFIG.BUILD_EVERY_MIN, Math.min(CONFIG.BUILD_EVERY_MAX, state.settings?.buildEvery || CONFIG.BUILD_EVERY_TURNS));

/** Build turns (every buildEvery turns, after duels): capitals settle, then the win check, then resupply. */
function afterCombat(state, events) {
  const buildTurn = state.turn % buildEvery(state) === 0;
  if (buildTurn) settleCapitals(state, events); // occupied capitals fall now
  if (buildTurn && checkMajority(state, events)) return;
  if (buildTurn && B.startBuild(state, events)) {
    state.phase = 'build';
    for (const id of Object.keys(state.build)) {
      if (nationById(state, id).bot) { B.autoChoose(state, id, rngFor(state, `build:${id}`)); state.build[id].done = true; }
    }
    if (Object.values(state.build).every((b) => b.done)) finishBuildPhase(state, events);
    return;
  }
  nextTurn(state, events);
}

function finishBuildPhase(state, events) {
  B.finishBuild(state, rngFor(state, 'build'), events);
  nextTurn(state, events);
}

export const toggleBuild = (state, nationId, tid) => B.toggleBuild(state, nationId, tid);
export const toggleDisband = (state, nationId, troopId) => B.toggleDisband(state, nationId, troopId);

export function submitBuild(state, nationId) {
  if (state.phase !== 'build' || !state.build?.[nationId]) return null;
  state.build[nationId].done = true;
  if (!Object.values(state.build).every((b) => b.done)) return null;
  const events = [];
  finishBuildPhase(state, events);
  return finish(state, events, 'Build phase');
}

export function forceFinishBuild(state) {
  if (state.phase !== 'build') return null;
  const events = [];
  finishBuildPhase(state, events);
  return finish(state, events, 'Build phase');
}

// ---------- Turns & game end ----------

function nextTurn(state, events) {
  // Optional turn limit: after the last turn (and its build stage, if any), the most cities wins.
  if (state.settings.turnLimit && state.turn >= state.settings.turnLimit) {
    endGame(state, events, { kind: 'win', nation: standings(state)[0].nation.id, reason: 'limit' });
    return;
  }
  state.turn++;
  startOrders(state);
}

/** Cities needed to win: more than half of all cities on the map. */
export function majorityTarget(state) {
  const share = Math.min(CONFIG.WIN_SHARE_MAX, Math.max(CONFIG.WIN_SHARE_MIN, state.settings?.winShare || CONFIG.WIN_SHARE));
  return Math.max(1, Math.ceil(state.map.territories.filter((t) => t.isCity).length * share - 1e-9));
}

/** Checked only on build turns: a nation holding at least the winning share of all cities (default 40%) wins. */
function checkMajority(state, events) {
  if (state.phase === 'ended') return true;
  const top = standings(state)[0];
  if (top && top.cities >= majorityTarget(state)) {
    endGame(state, events, { kind: 'win', nation: top.nation.id, reason: 'cities' });
    return true;
  }
  return false;
}

function endGame(state, events, result) {
  state.phase = 'ended';
  state.result = result;
  state.build = null;
  for (const d of state.duels) if (D.OPEN(d)) d.status = 'cancelled';
  events.push(result.kind === 'draw'
    ? { kind: 'game_draw', nations: result.nations }
    : { kind: 'game_won', nation: result.nation, reason: result.reason, target: majorityTarget(state), battle: true });
}

/**
 * Agree to (or withdraw from) a draw. When every remaining independent nation agrees, the game ends drawn.
 * Prototype: fake players go along with a draw as soon as a human nation offers one.
 */
export function voteDraw(state, playerId, agree) {
  const n = nationById(state, playerId);
  if (state.phase === 'ended' || !n || n.vassalOf) return null;
  state.drawVotes ??= {};
  if (agree) state.drawVotes[playerId] = true;
  else delete state.drawVotes[playerId];
  if (agree && !n.bot) for (const b of independents(state)) if (b.bot) state.drawVotes[b.id] = true;
  const voters = independents(state);
  if (!voters.every((x) => state.drawVotes[x.id])) return null;
  const events = [];
  endGame(state, events, { kind: 'draw', nations: voters.map((x) => x.id) });
  return finish(state, events, 'Game drawn');
}

/** Admin override: end now; the nation with the most cities wins. */
export function endGameNow(state) {
  if (state.phase === 'ended') return null;
  const events = [];
  endGame(state, events, { kind: 'win', nation: standings(state)[0].nation.id, reason: 'admin' });
  return finish(state, events, 'Game over');
}

function finish(state, events, title, kind = 'other') {
  const entries = events.map((ev) => ({ ...ev, text: record(state, ev).text }));
  state.report = { kind, turn: state.turn, title, events: entries, at: state.nextId };
  return state.report;
}

/** Who won a battle in these events (victory banner and themes). */
export function victors(events) {
  const out = [];
  for (const ev of events) {
    if (!ev.battle) continue;
    const who = ev.kind === 'duel_result' ? ev.winner : ev.nation;
    if (who && !out.includes(who)) out.push(who);
  }
  return out;
}

export { standings };
