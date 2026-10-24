// Shared helpers that read or mutate a GameState. Used by game.js, duels.js and builds.js.
import { territoryDistances } from './mapgen.js';
export const nationById = (state, id) => state.nations.find((n) => n.id === id);
export const troopById = (state, id) => state.troops.find((t) => t.id === id);
export const troopAt = (state, tid) => state.troops.find((t) => t.at === tid);
export const independents = (state) => state.nations.filter((n) => !n.vassalOf);
export const troopsOwnedBy = (state, nationId) => state.troops.filter((t) => t.nation === nationId);
export const troopsCommandedBy = (state, playerId) => state.troops.filter((t) => t.cmd === playerId);
export const territoriesOwnedBy = (state, nationId) =>
  state.map.territories.filter((t) => state.terr[t.id].owner === nationId);
export const citiesOwnedBy = (state, nationId) => territoriesOwnedBy(state, nationId).filter((t) => t.isCity);

export function removeTroop(state, id) {
  state.troops = state.troops.filter((t) => t.id !== id);
}

/**
 * Whose capital this is, and who has to lose it. An independent nation's capital is kept by that nation;
 * a conquered player's old capital is kept by their conqueror, but losing it only knocks that conquered
 * player out. Players already out have no capital any more.
 */
export function capitalInfo(state, tid) {
  const of = state.nations.find((n) => n.capital === tid && !n.out);
  return of ? { of, keeper: of.vassalOf ?? of.id } : null;
}

/**
 * Change a territory's owner. Capitals are special: they only change hands at the build stage
 * (settleCapitals). Until then an enemy troop standing in one just occupies it, and a cede of it is
 * remembered as `cededTo`.
 */
export function setOwner(state, tid, nationId, events, { now = false, cede = false } = {}) {
  const rec = state.terr[tid];
  const cap = capitalInfo(state, tid);
  if (cap && !now) {
    if (cede) rec.cededTo = nationId === cap.keeper ? null : nationId;
    return;
  }
  if (rec.owner === nationId) return;
  rec.owner = nationId;
  if (!cap || nationId === null || cap.keeper === nationId) return;
  if (cap.of.vassalOf) knockOut(state, cap.of.id, nationId, tid, events);
  else conquer(state, cap.of.id, nationId, tid, events);
}

/**
 * Build stage: a capital with an enemy troop standing in it falls to that troop's nation. An independent
 * nation is conquered; a conquered player whose old capital falls is out. An unoccupied capital that was
 * ceded goes to whoever it was ceded to.
 */
export function settleCapitals(state, events) {
  for (const n of state.nations) {
    if (n.out) continue;
    const keeper = n.vassalOf ?? n.id;
    const rec = state.terr[n.capital];
    const occ = troopAt(state, n.capital);
    const taker = occ ? (occ.nation !== keeper ? occ.nation : null) : rec.cededTo ?? null;
    rec.cededTo = null;
    if (taker) setOwner(state, n.capital, taker, events, { now: true });
  }
}

/** The nation whose troop is standing in someone's capital (it falls at the next build stage), or null. */
export function capitalOccupier(state, tid) {
  const cap = capitalInfo(state, tid);
  const occ = cap && troopAt(state, tid);
  return occ && occ.nation !== cap.keeper ? occ.nation : null;
}

/**
 * A conquered player whose old capital fell is out: the conqueror keeps everything else, and the
 * conquered player's last troop now answers to the conqueror.
 */
export function knockOut(state, victimId, byId, tid, events) {
  const victim = nationById(state, victimId);
  victim.out = true;
  victim.outTurn = state.turn;
  for (const t of state.troops) if (t.cmd === victimId) t.cmd = victim.vassalOf;
  events.push({ kind: 'knocked_out', nation: byId, victim: victimId, overlord: victim.vassalOf, territory: tid, battle: true });
}

/**
 * `victim` becomes a vassal of `by`: its land and troops pass to `by`. The conquered player keeps
 * commanding just one troop — the one closest to the fallen capital. The rest obey the conqueror.
 */
export function conquer(state, victimId, byId, tid, events) {
  const victim = nationById(state, victimId);
  victim.vassalOf = byId;
  victim.conqueredTurn = state.turn;
  for (const n of state.nations) if (n.vassalOf === victimId) n.vassalOf = byId;
  const dist = territoryDistances(state.map.territories, tid);
  const kept = state.troops.filter((t) => t.cmd === victimId)
    .sort((a, b) => dist[a.at] - dist[b.at] || a.id - b.id)[0];
  for (const t of state.troops) {
    if (t.nation !== victimId) continue;
    t.nation = byId;
    if (t.cmd === victimId && t !== kept) t.cmd = byId;
  }
  for (const rec of Object.values(state.terr)) if (rec.owner === victimId) rec.owner = byId;
  if (state.orders[victimId]) state.orders[victimId].cedes = [];
  for (const d of state.duels) {
    if (d.status !== 'pending' && d.status !== 'disputed') continue;
    for (const side of [d.a, d.b]) if (side.nation === victimId) side.nation = byId;
    if (d.a.nation === d.b.nation) {
      d.status = 'cancelled';
      events.push({ kind: 'duel_cancelled', territory: d.territory });
    }
  }
  events.push({ kind: 'conquest', nation: byId, victim: victimId, territory: tid, battle: true });
}

/** A troop that yields pulls back to a bordering empty territory its nation owns (cities first), or disbands. */
export function withdraw(state, troop, events) {
  const from = troop.at;
  const options = state.map.territories[from].neighbors
    .filter((n) => state.terr[n].owner === troop.nation && !troopAt(state, n))
    .sort((a, b) => Number(state.map.territories[b].isCity) - Number(state.map.territories[a].isCity));
  if (options.length) {
    troop.at = options[0];
    events.push({ kind: 'withdraw', nation: troop.nation, from, to: options[0] });
  } else {
    removeTroop(state, troop.id);
    events.push({ kind: 'disbanded', nation: troop.nation, territory: from });
  }
}

/** The independent nation with strictly the most cities wears the Crown. */
export function crownHolder(state) {
  const counts = independents(state).map((n) => [n.id, citiesOwnedBy(state, n.id).length])
    .sort((a, b) => b[1] - a[1]);
  if (!counts.length || (counts[1] && counts[1][1] === counts[0][1])) return null;
  return counts[0][0];
}

export function standings(state) {
  return independents(state).map((n) => ({
    nation: n,
    cities: citiesOwnedBy(state, n.id).length,
    territories: territoriesOwnedBy(state, n.id).length,
    troops: troopsOwnedBy(state, n.id).length,
    duelsWon: state.stats[n.id]?.duelsWon ?? 0,
    vassals: state.nations.filter((v) => v.vassalOf === n.id),
  })).sort((a, b) => b.cities - a.cities || b.territories - a.territories || b.duelsWon - a.duelsWon);
}

export function bump(state, nationId, key, by = 1) {
  if (!nationId) return;
  state.stats[nationId] ??= { duelsWon: 0, duelsLost: 0, captures: 0, losses: 0 };
  state.stats[nationId][key] += by;
}
