// Duels: creation, reporting, rock-paper-scissors, conceding, ceding and group outcomes. DESIGN.md "Duels".
import { nationById, troopById, troopAt, removeTroop, setOwner, withdraw, bump } from './state.js';

export const OPEN = (d) => d.status === 'pending' || d.status === 'disputed';
const other = (side) => (side === 'a' ? 'b' : 'a');

export function createDuels(state, found) {
  for (const f of found) {
    const id = state.nextId++;
    state.duels.push({
      id, turn: state.turn, kind: f.kind, territory: f.territory,
      group: f.kind === 'assault' ? `${state.turn}:${f.territory}` : `d${id}`,
      a: { ...f.a, role: f.kind === 'assault' ? 'defend' : 'attack' },
      b: { ...f.b, role: 'attack' },
      status: 'pending', reports: {}, rps: {}, rpsRounds: [], result: null,
      queue: [],
    });
  }
}

/**
 * Who fights for a side. A conquered player only duels when their own troop is the attacker;
 * when defending, the owning (independent) nation's leader fights.
 */
export function duelist(state, duel, side) {
  const s = duel[side];
  if (s.role === 'attack') return troopById(state, s.troop)?.cmd ?? s.nation;
  return s.nation;
}

export const sideOf = (state, duel, playerId) =>
  duelist(state, duel, 'a') === playerId ? 'a' : duelist(state, duel, 'b') === playerId ? 'b' : null;

const isBot = (state, id) => !!nationById(state, id)?.bot;

export function report(state, duelId, playerId, winnerSide, events) {
  const d = state.duels.find((x) => x.id === duelId);
  if (!d || !OPEN(d) || !sideOf(state, d, playerId)) return;
  d.reports[playerId] = winnerSide;
  const ids = [duelist(state, d, 'a'), duelist(state, d, 'b')];
  for (const id of ids) if (isBot(state, id) && !(id in d.reports)) d.reports[id] = winnerSide; // bots agree
  if (ids.every((id) => id in d.reports)) {
    if (d.reports[ids[0]] === d.reports[ids[1]]) settle(state, d, winnerSide, 'fought', events);
    else d.status = 'disputed';
  }
}

export const THROWS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

/**
 * Digital rock-paper-scissors. Each duelist throws secretly; throwing means you agree to settle this way.
 * When both have thrown: a tie starts a new round, otherwise the duel is settled.
 */
export function throwRps(state, duelId, playerId, choice, rng, events) {
  const d = state.duels.find((x) => x.id === duelId);
  if (!d || !OPEN(d) || !sideOf(state, d, playerId) || !THROWS.includes(choice)) return;
  d.rps[playerId] = choice;
  const ids = [duelist(state, d, 'a'), duelist(state, d, 'b')];
  for (const id of ids) if (isBot(state, id) && !d.rps[id]) d.rps[id] = rng.pick(THROWS);
  if (ids.every((id) => d.rps[id])) resolveRps(state, d, rng, events);
}

/** Bots (or the admin on a player's behalf) throw at random until the duel is decided. */
export function autoRps(state, d, rng, events) {
  const ids = [duelist(state, d, 'a'), duelist(state, d, 'b')];
  for (let guard = 0; guard < 50 && OPEN(d); guard++) {
    for (const id of ids) if (!d.rps[id]) d.rps[id] = rng.pick(THROWS);
    resolveRps(state, d, rng, events);
  }
}

function resolveRps(state, d, rng, events) {
  const [ia, ib] = [duelist(state, d, 'a'), duelist(state, d, 'b')];
  if (ia === ib) { settle(state, d, 'a', 'admin', events); return; } // can't duel yourself; shouldn't happen
  const ta = d.rps[ia], tb = d.rps[ib];
  d.rpsRounds.push({ a: ta, b: tb });
  d.rps = {};
  if (ta === tb) {
    // Tie: bots throw again straight away; humans see the tie and throw again.
    if (isBot(state, ia)) d.rps[ia] = rng.pick(THROWS);
    if (isBot(state, ib)) d.rps[ib] = rng.pick(THROWS);
    if (d.rps[ia] && d.rps[ib]) resolveRps(state, d, rng, events);
    return;
  }
  settle(state, d, BEATS[ta] === tb ? 'a' : 'b', 'rps', events);
}

export function adminSettle(state, duelId, winnerSide, method, events) {
  const d = state.duels.find((x) => x.id === duelId);
  if (d && OPEN(d)) settle(state, d, winnerSide, method, events);
}

export function concede(state, duelId, side, events) {
  const d = state.duels.find((x) => x.id === duelId);
  if (d && OPEN(d)) settle(state, d, other(side), 'concede', events);
}

/** The defender of an assault cedes the contested territory to any nation. */
export function cedeContested(state, tid, toNation, events) {
  const group = state.duels.filter((d) => d.kind === 'assault' && d.territory === tid && OPEN(d));
  if (!group.length) return;
  const defender = troopById(state, group[0].a.troop);
  const fromNation = group[0].a.nation;
  for (const d of group) { d.status = 'cancelled'; d.result = { method: 'cede', to: toNation }; }
  if (defender) withdraw(state, defender, events);
  events.push({ kind: 'cede', from: fromNation, to: toNation, territory: tid });
  const incoming = group.map((d) => troopById(state, d.b.troop)).find((t) => t && t.nation === toNation);
  if (incoming && !troopAt(state, tid)) incoming.at = tid;
  setOwner(state, tid, toNation, events, { cede: true });
}

function settle(state, d, winner, method, events) {
  d.status = 'settled';
  d.result = { winner, method };
  const w = duelist(state, d, winner), l = duelist(state, d, other(winner));
  bump(state, w, 'duelsWon');
  bump(state, l, 'duelsLost');
  events.push({ kind: 'duel_result', winner: w, loser: l, territory: d.territory, method, battle: true, duel: d.id });

  if (d.kind === 'swap') {
    const loser = troopById(state, d[other(winner)].troop);
    const champ = troopById(state, d[winner].troop);
    if (loser) {
      if (method === 'concede') withdraw(state, loser, events);
      else removeTroop(state, loser.id);
    }
    const target = d[other(winner)].at;
    if (champ && !troopAt(state, target)) { champ.at = target; setOwner(state, target, champ.nation, events); }
    return;
  }
  resolveGroup(state, d.group, events);
}

function resolveGroup(state, group, events) {
  const ds = state.duels.filter((x) => x.group === group);
  if (ds.some(OPEN)) return;
  const tid = ds[0].territory;

  if (ds[0].kind === 'assault') {
    const defender = troopById(state, ds[0].a.troop);
    const winners = [];
    const lostBy = [];
    for (const x of ds) {
      if (x.status !== 'settled') continue;
      if (x.result.winner === 'a') {
        if (x.result.method !== 'concede') removeTroop(state, x.b.troop);
      } else {
        winners.push(x.b);
        lostBy.push(x.result.method);
      }
    }
    if (!winners.length) return;
    if (defender) {
      if (lostBy.every((m) => m === 'concede')) withdraw(state, defender, events);
      else removeTroop(state, defender.id);
    }
    // Two winning troops of the same nation never duel each other: the first one moves in.
    const rivals = winners.filter((w, i) => winners.findIndex((x) => x.nation === w.nation) === i);
    if (rivals.length === 1) moveIn(state, rivals[0], tid, events);
    else startClaim(state, tid, rivals[0], rivals[1], rivals.slice(2));
    return;
  }

  // 'claim': attackers who all beat the defender fight on; winner stays on.
  const x = ds[0];
  if (x.status !== 'settled') return;
  const win = x[x.result.winner], lose = x[other(x.result.winner)];
  if (x.result.method !== 'concede') removeTroop(state, lose.troop);
  if (x.queue.length) startClaim(state, tid, win, x.queue[0], x.queue.slice(1));
  else moveIn(state, win, tid, events);
}

function startClaim(state, tid, a, b, queue) {
  const id = state.nextId++;
  state.duels.push({
    id, turn: state.turn, kind: 'claim', territory: tid, group: `d${id}`,
    a: { ...a, role: 'attack' }, b: { ...b, role: 'attack' },
    status: 'pending', reports: {}, rps: {}, rpsRounds: [], result: null, queue,
  });
}

function moveIn(state, side, tid, events) {
  const troop = troopById(state, side.troop);
  if (!troop || troopAt(state, tid)) return;
  troop.at = tid;
  setOwner(state, tid, troop.nation, events);
}
