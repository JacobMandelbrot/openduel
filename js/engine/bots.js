// Fake players. Each style writes orders only for the troops its player commands.
import { CONFIG } from './config.js';
import { nationById, troopsCommandedBy, troopAt } from './state.js';

export function botOrders(state, playerId, rng) {
  const me = nationById(state, playerId);
  const mine = troopsCommandedBy(state, playerId);
  const orders = {};
  if (!mine.length) return { submitted: true, troops: orders, cedes: [] };
  const owner = mine[0].nation;
  const T = state.map.territories;
  const style = me.bot || 'defensive';
  const free = new Set(mine.map((t) => t.id));
  const claimed = new Set();
  const enemyAt = (tid) => { const o = troopAt(state, tid); return o && o.nation !== owner ? o : null; };
  const defense = (occ) => 1 + (T[occ.at].homeOf === occ.nation ? CONFIG.HOME_TURF_BONUS : 0);
  const value = (tid) => (T[tid].isCapital ? 8 : T[tid].isCity ? 5 : 1) + (state.terr[tid].owner === null ? 1 : 0);
  const adjacentFree = (tid) => mine.filter((t) => free.has(t.id) && T[t.at].neighbors.includes(tid));
  const assign = (troop, order) => { orders[troop.id] = order; free.delete(troop.id); };

  if (style === 'random') {
    for (const t of mine) {
      const nb = T[t.at].neighbors;
      const roll = rng.next();
      if (roll < 0.5) assign(t, { type: 'move', to: rng.pick(nb) });
      else if (roll < 0.7) {
        const target = rng.pick(nb);
        const occ = troopAt(state, target);
        assign(t, occ ? { type: 'support', target, from: null } : { type: 'hold' });
      } else assign(t, { type: 'hold' });
    }
    return { submitted: true, troops: orders, cedes: [] };
  }

  // Gang up on beatable enemy troops (aggressive always looks; defensive only near home).
  const targets = new Set();
  for (const t of mine) for (const n of T[t.at].neighbors) if (enemyAt(n)) targets.add(n);
  const ranked = [...targets].sort((a, b) => value(b) - value(a) + (rng.next() - 0.5));
  for (const tid of ranked) {
    if (style === 'defensive' && T[tid].homeOf !== owner && !rng.chance(0.25)) continue;
    const occ = enemyAt(tid);
    const need = defense(occ) + 1;
    const avail = adjacentFree(tid);
    let use = 0;
    if (avail.length >= need) use = need;
    else if (style === 'aggressive' && avail.length === need - 1 && rng.chance(0.45)) use = avail.length; // dare a duel
    if (!use) continue;
    const [mover, ...helpers] = rng.shuffle(avail).slice(0, use);
    assign(mover, { type: 'move', to: tid });
    for (const h of helpers) assign(h, { type: 'support', target: tid, from: mover.at });
    claimed.add(tid);
  }

  // Defensive troops guard threatened cities and back each other up.
  if (style === 'defensive') {
    for (const t of mine) {
      if (!free.has(t.id) || !T[t.at].isCity) continue;
      if (T[t.at].neighbors.some((n) => enemyAt(n))) assign(t, { type: 'hold' });
    }
    for (const t of mine) {
      if (!free.has(t.id)) continue;
      const buddy = mine.find((o) => o.id !== t.id && orders[o.id]?.type === 'hold' && T[t.at].neighbors.includes(o.at)
        && T[o.at].neighbors.some((n) => enemyAt(n)));
      if (buddy && rng.chance(0.7)) assign(t, { type: 'support', target: buddy.at, from: null });
    }
  }

  // Expand into empty land.
  for (const t of rng.shuffle(mine)) {
    if (!free.has(t.id)) continue;
    const options = T[t.at].neighbors
      .filter((n) => !troopAt(state, n) && state.terr[n].owner !== owner && !claimed.has(n))
      .sort((a, b) => value(b) - value(a) + (rng.next() - 0.5));
    const keepHome = T[t.at].isCity && T[t.at].neighbors.some((n) => enemyAt(n));
    const eager = style === 'aggressive' ? 0.9 : 0.55;
    if (options.length && !keepHome && rng.chance(eager)) {
      assign(t, { type: 'move', to: options[0] });
      claimed.add(options[0]);
    } else {
      // Wander toward the border if stuck inside our own land.
      const inward = T[t.at].neighbors.filter((n) => !troopAt(state, n) && !claimed.has(n));
      if (!T[t.at].isCity && inward.length && rng.chance(0.4)) {
        const step = rng.pick(inward);
        assign(t, { type: 'move', to: step });
        claimed.add(step);
      } else assign(t, { type: 'hold' });
    }
  }
  return { submitted: true, troops: orders, cedes: [] };
}
