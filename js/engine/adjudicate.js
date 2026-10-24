// Simultaneous order resolution for one turn. Pure: reads its inputs, returns what happened.
// Rules: DESIGN.md "Battles" and "Fine print (exact resolution)".
import { CONFIG } from './config.js';

const HOLD = { type: 'hold' };

/**
 * @param {object} p
 * @param {Array} p.territories  map.territories
 * @param {object} p.terr        { [tid]: { owner } }
 * @param {Array} p.troops       [{ id, nation, at }]
 * @param {object} p.orders      { [troopId]: Order }
 * @returns {{ moved, destroyed, duels, events, status, orders }}
 */
export function adjudicate({ territories, terr, troops, orders }) {
  const adj = (a, b) => territories[a]?.neighbors.includes(b);
  const troopAt = new Map(troops.map((t) => [t.at, t]));
  const ownerOf = (tid) => terr[tid]?.owner ?? null;

  // 1. Normalise orders.
  const ord = new Map();
  for (const t of troops) {
    const o = orders[t.id] || HOLD;
    if (o.type === 'move' && adj(t.at, o.to)) ord.set(t.id, { type: 'move', to: o.to });
    else if (o.type === 'support' && adj(t.at, o.target)) {
      ord.set(t.id, { type: 'support', target: o.target, from: o.from ?? null });
    } else ord.set(t.id, HOLD);
  }
  const supports = [];
  for (const t of troops) {
    const o = ord.get(t.id);
    if (o.type !== 'support') continue;
    let valid;
    if (o.from === null) {
      const occ = troopAt.get(o.target);
      valid = !!occ && ord.get(occ.id).type !== 'move';
    } else {
      const s = troopAt.get(o.from);
      valid = !!s && o.from !== t.at && ord.get(s.id).type === 'move' && ord.get(s.id).to === o.target;
    }
    if (valid) supports.push({ troop: t, target: o.target, from: o.from, cut: false });
    else ord.set(t.id, { ...o, void: true });
  }

  const moves = troops.filter((t) => ord.get(t.id).type === 'move')
    .map((t) => ({ troop: t, from: t.at, to: ord.get(t.id).to }));
  const movesInto = new Map();
  for (const m of moves) {
    if (!movesInto.has(m.to)) movesInto.set(m.to, []);
    movesInto.get(m.to).push(m);
  }

  // 2. Cut supports.
  for (const s of supports) {
    const at = s.troop.at;
    if ((movesInto.get(at) || []).some((m) => m.troop.nation !== s.troop.nation && m.from !== s.target)) s.cut = true;
  }

  // 3. Strengths.
  const bonus = (tid, nation) => (territories[tid].homeOf === nation ? CONFIG.HOME_TURF_BONUS : 0);
  const strength = new Map();
  for (const m of moves) {
    const occ = troopAt.get(m.to);
    const occStays = occ && ord.get(occ.id).type !== 'move';
    let s = 1;
    for (const sup of supports) {
      if (sup.cut || sup.from !== m.from || sup.target !== m.to) continue;
      if (occStays && occ.nation === sup.troop.nation) continue; // never help dislodge your own troop
      s++;
    }
    strength.set(m.troop.id, s);
  }
  const holdStrength = (occ) => 1 + bonus(occ.at, occ.nation)
    + supports.filter((s) => !s.cut && s.from === null && s.target === occ.at).length;
  const failedStrength = (occ) => 1 + bonus(occ.at, occ.nation);

  // 4. Swaps (head-to-head).
  const status = new Map(moves.map((m) => [m.troop.id, 'pending']));
  const swapDefense = new Map();
  const swapLost = new Set();
  const swapTies = [];
  const swapTied = new Set();
  for (const m of moves) {
    const other = moves.find((x) => x.from === m.to && x.to === m.from);
    if (!other || m.troop.id > other.troop.id) continue;
    const sa = strength.get(m.troop.id), sb = strength.get(other.troop.id);
    if (m.troop.nation === other.troop.nation) {
      status.set(m.troop.id, 'fail'); status.set(other.troop.id, 'fail');
    } else if (sa === sb) {
      status.set(m.troop.id, 'fail'); status.set(other.troop.id, 'fail');
      swapTies.push([m, other]); swapTied.add(m.troop.id); swapTied.add(other.troop.id);
    } else if (sa > sb) {
      status.set(other.troop.id, 'fail'); swapLost.add(other.troop.id); swapDefense.set(m.troop.id, sb);
    } else {
      status.set(m.troop.id, 'fail'); swapLost.add(m.troop.id); swapDefense.set(other.troop.id, sa);
    }
  }

  // 5. Iterate to a fixed point.
  const group = new Map(); // troopId -> territory of the duel it's in
  const defenseFor = (m, assumeLeaves) => {
    const occ = troopAt.get(m.to);
    if (!occ) return { D: 0, defender: null };
    if (swapDefense.has(m.troop.id)) return { D: swapDefense.get(m.troop.id), defender: occ };
    if (ord.get(occ.id).type !== 'move') return { D: holdStrength(occ), defender: occ };
    const st = status.get(occ.id);
    if (st === 'pending') return assumeLeaves ? { D: 0, defender: null } : null;
    if (st === 'ok') return { D: 0, defender: null };
    return { D: failedStrength(occ), defender: occ };
  };
  const decide = (m, def) => {
    const contenders = (movesInto.get(m.to) || []).filter((x) => !swapLost.has(x.troop.id));
    const top = Math.max(...contenders.map((x) => strength.get(x.troop.id)));
    const mine = strength.get(m.troop.id);
    if (mine < top) return 'fail';
    if (def.defender && def.defender.nation === m.troop.nation) return 'fail';
    const tops = contenders.filter((x) => strength.get(x.troop.id) === top);
    if (tops.length > 1) {
      if (tops.some((x) => swapTied.has(x.troop.id))) return 'fail';
      return def.defender && def.D === top ? 'duel' : 'fail';
    }
    if (top > def.D) return 'ok';
    if (top === def.D && def.defender) return 'duel';
    return 'fail';
  };
  for (let guard = 0; guard < 1000; guard++) {
    let progress = false;
    for (const m of moves) {
      if (status.get(m.troop.id) !== 'pending') continue;
      const def = defenseFor(m, false);
      if (!def) continue;
      status.set(m.troop.id, decide(m, def));
      progress = true;
    }
    if (progress) continue;
    const pending = moves.filter((m) => status.get(m.troop.id) === 'pending');
    if (!pending.length) break;
    // Stuck: remaining moves wait on each other (cycles). Best case = occupants leave.
    const best = pending.map((m) => [m, decide(m, defenseFor(m, true))]);
    const failures = best.filter(([, r]) => r !== 'ok');
    if (failures.length) failures.forEach(([m]) => status.set(m.troop.id, 'fail'));
    else best.forEach(([m]) => status.set(m.troop.id, 'ok'));
  }
  for (const m of moves) if (status.get(m.troop.id) === 'duel') group.set(m.troop.id, m.to);

  // 6. Outcomes.
  const destroyed = new Set();
  const moved = [];
  const events = [];
  for (const m of moves) {
    if (status.get(m.troop.id) !== 'ok') continue;
    moved.push({ troop: m.troop.id, from: m.from, to: m.to });
    const occ = troopAt.get(m.to);
    const occLeft = occ && ord.get(occ.id).type === 'move' && status.get(occ.id) === 'ok';
    if (occ && !occLeft) {
      destroyed.add(occ.id);
      events.push({ kind: 'capture', territory: m.to, nation: m.troop.nation, victim: occ.nation, battle: true });
    } else {
      const prev = ownerOf(m.to);
      if (prev !== m.troop.nation) events.push({ kind: prev === null ? 'claim' : 'capture', territory: m.to, nation: m.troop.nation, victim: prev, battle: false });
    }
  }
  // Repelled attacks / bounces (one event per territory).
  const reported = new Set();
  for (const m of moves) {
    if (status.get(m.troop.id) !== 'fail' || reported.has(m.to)) continue;
    const occ = troopAt.get(m.to);
    const attackers = (movesInto.get(m.to) || []).filter((x) => status.get(x.troop.id) === 'fail' && x.troop.nation !== occ?.nation);
    if (!attackers.length) continue;
    reported.add(m.to);
    const occHeld = occ && !destroyed.has(occ.id) && !(ord.get(occ.id).type === 'move' && status.get(occ.id) === 'ok');
    if (occHeld) {
      events.push({ kind: 'repelled', territory: m.to, nation: occ.nation, attackers: [...new Set(attackers.map((x) => x.troop.nation))], battle: true });
    } else if (attackers.length > 1) {
      events.push({ kind: 'bounce', territory: m.to, attackers: [...new Set(attackers.map((x) => x.troop.nation))] });
    }
  }

  const duels = [];
  const byTerritory = new Map();
  for (const m of moves) {
    if (status.get(m.troop.id) !== 'duel' || destroyed.has(m.troop.id)) continue;
    if (!byTerritory.has(m.to)) byTerritory.set(m.to, []);
    byTerritory.get(m.to).push(m);
  }
  for (const [tid, attackers] of byTerritory) {
    const def = troopAt.get(tid);
    if (!def || destroyed.has(def.id)) continue;
    for (const m of attackers) {
      duels.push({ kind: 'assault', territory: tid,
        a: { nation: def.nation, troop: def.id, at: def.at },
        b: { nation: m.troop.nation, troop: m.troop.id, at: m.from } });
    }
  }
  for (const [m, o] of swapTies) {
    if (destroyed.has(m.troop.id) || destroyed.has(o.troop.id)) continue;
    duels.push({ kind: 'swap', territory: m.to,
      a: { nation: o.troop.nation, troop: o.troop.id, at: o.from },
      b: { nation: m.troop.nation, troop: m.troop.id, at: m.from } });
  }
  for (const d of duels) events.push({ kind: 'duel_called', territory: d.territory, nations: [d.a.nation, d.b.nation], duelKind: d.kind });

  return {
    moved,
    destroyed: [...destroyed],
    duels,
    events,
    status: Object.fromEntries(status),
    orders: Object.fromEntries(ord),
    cut: supports.filter((s) => s.cut).map((s) => s.troop.id),
  };
}
