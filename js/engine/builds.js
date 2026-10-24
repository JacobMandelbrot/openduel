// Build phase: allowances, integration, build sites, disbands. DESIGN.md "Building troops".
import { CONFIG } from './config.js';
import { independents, troopsOwnedBy, citiesOwnedBy, troopAt, removeTroop, nationById } from './state.js';

/** Update city integration counters and work out what every nation must build or disband. */
export function startBuild(state, events) {
  for (const t of state.map.territories) {
    if (!t.isCity) continue;
    const rec = state.terr[t.id];
    if (rec.owner === null) { rec.held = 0; rec.heldBy = null; continue; }
    if (rec.owner === rec.heldBy) rec.held++;
    else { rec.heldBy = rec.owner; rec.held = 1; }
    if (rec.held === CONFIG.INTEGRATION_PHASES && t.homeOf !== rec.owner) {
      events.push({ kind: 'integrated', nation: rec.owner, territory: t.id });
    }
  }
  const build = {};
  for (const n of independents(state)) {
    const cities = citiesOwnedBy(state, n.id).length;
    const troops = troopsOwnedBy(state, n.id).length;
    const allowance = Math.min(cities, CONFIG.TROOP_CAP);
    const delta = allowance - troops;
    if (delta > 0) {
      const sites = buildSites(state, n.id);
      const builds = Math.min(delta, CONFIG.MAX_BUILDS_PER_PHASE, sites.length);
      if (builds > 0) build[n.id] = { builds, disbands: 0, sites, chosen: [], disband: [] };
    } else if (delta < 0) {
      build[n.id] = { builds: 0, disbands: -delta, sites: [], chosen: [], disband: [] };
    }
  }
  state.build = Object.keys(build).length ? build : null;
  return !!state.build;
}

export function buildSites(state, nationId) {
  return citiesOwnedBy(state, nationId)
    .filter((t) => !troopAt(state, t.id))
    .filter((t) => t.homeOf === nationId || state.terr[t.id].held >= CONFIG.INTEGRATION_PHASES)
    .map((t) => t.id);
}

/** Tap a build site to choose it; tap it again to unchoose. When you're already at your limit, the new
 * pick replaces your oldest one, so you can never hold more choices than you're allowed. */
export function toggleBuild(state, nationId, tid) {
  const b = state.build?.[nationId];
  if (!b || !b.builds || !b.sites.includes(tid)) return;
  if (b.chosen.includes(tid)) { b.chosen = b.chosen.filter((x) => x !== tid); return; }
  b.chosen.push(tid);
  while (b.chosen.length > b.builds) b.chosen.shift();
}

/** Same for disbanding: the newest pick replaces the oldest once you've picked enough. */
export function toggleDisband(state, nationId, troopId) {
  const b = state.build?.[nationId];
  if (!b || !b.disbands) return;
  if (!state.troops.some((t) => t.id === troopId && t.nation === nationId)) return;
  if (b.disband.includes(troopId)) { b.disband = b.disband.filter((x) => x !== troopId); return; }
  b.disband.push(troopId);
  while (b.disband.length > b.disbands) b.disband.shift();
}

/** Fill in any choices nobody made (bots, or players who skipped choosing). */
export function autoChoose(state, nationId, rng) {
  const b = state.build[nationId];
  const n = nationById(state, nationId);
  const sites = rng.shuffle(b.sites.filter((s) => !b.chosen.includes(s)))
    .sort((x, y) => Number(y === n.capital) - Number(x === n.capital));
  while (b.chosen.length < b.builds && sites.length) b.chosen.push(sites.shift());
  const troops = rng.shuffle(troopsOwnedBy(state, nationId).filter((t) => !b.disband.includes(t.id)))
    .sort((x, y) => Number(state.map.territories[x.at].isCity) - Number(state.map.territories[y.at].isCity));
  while (b.disband.length < b.disbands && troops.length) b.disband.push(troops.shift().id);
}

export function finishBuild(state, rng, events) {
  if (!state.build) return;
  for (const nationId of Object.keys(state.build)) {
    autoChoose(state, nationId, rng);
    const b = state.build[nationId];
    for (const tid of b.chosen) {
      if (troopAt(state, tid)) continue;
      state.troops.push({ id: state.nextId++, nation: nationId, cmd: nationId, at: tid });
    }
    for (const id of b.disband) removeTroop(state, id);
    if (b.chosen.length) events.push({ kind: 'build', nation: nationId, count: b.chosen.length });
    if (b.disband.length) events.push({ kind: 'disband', nation: nationId, count: b.disband.length });
  }
  state.build = null;
}
