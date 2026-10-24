// Procedural world: a continent plus islands (hex cells) → territories → sea routes → home regions → cities.
import { CONFIG } from './config.js';
import { makeRng } from './rng.js';
import { nameTerritories } from './names.js';

const SQRT3 = Math.sqrt(3);
export const HEX = 10; // cell radius in map units

// odd-r offset neighbours, [dcol, drow]
const DIRS = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
];

export function hexCenter(col, row) {
  return { x: HEX * SQRT3 * (col + 0.5 * (row & 1)) + HEX, y: HEX * 1.5 * row + HEX };
}

export function hexNeighbors(col, row) {
  return DIRS[row & 1].map(([dc, dr]) => [col + dc, row + dr]);
}

/**
 * Generate a map for `numNations` nations. Returns { map, homes } where homes[i] is the
 * list of territory ids for nation slot i and map.territories[].homeOf is set to the slot index.
 */
export function generateMap(seed, numNations, { neutralShare = CONFIG.NEUTRAL_SHARE } = {}) {
  const share = Math.min(CONFIG.NEUTRAL_SHARE_MAX, Math.max(CONFIG.NEUTRAL_SHARE_MIN, +neutralShare || CONFIG.NEUTRAL_SHARE));
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng(`${seed}:map:${attempt}`);
    const result = tryGenerate(rng, numNations, share);
    if (result) return result;
  }
  throw new Error('Map generation failed — try another seed');
}

function tryGenerate(rng, P, neutralShare) {
  // Each nation gets 2 home cities, with a small chance of 3; its region is always big enough to hold them.
  const cities = Array.from({ length: P }, () => CONFIG.HOME_CITIES + (rng.chance(CONFIG.EXTRA_HOME_CITY_CHANCE) ? 1 : 0));
  const sizes = cities.map((c) => Math.max(c, rng.pick(CONFIG.HOME_REGION_SIZES)));
  const homeTotal = sizes.reduce((a, b) => a + b, 0);
  // Neutral territories so that `neutralShare` of the playable territories start unclaimed, plus some
  // impassable mountain territories on top.
  const playable = homeTotal + Math.max(P, Math.round(homeTotal * neutralShare / (1 - neutralShare)));
  const mountains = Math.max(1, Math.round(playable * CONFIG.MOUNTAIN_SHARE));
  const T = playable + mountains;
  const landTarget = T * CONFIG.CELLS_PER_TERRITORY;

  // Islands take a share of the land; the rest is one continent in the middle of a wider sea.
  const islandCount = Math.min(CONFIG.MAX_ISLANDS, Math.max(2, Math.round(P * CONFIG.ISLANDS_PER_PLAYER)));
  const islandSizes = Array.from({ length: islandCount }, () => rng.int(2, 4) * CONFIG.CELLS_PER_TERRITORY);
  const mainTarget = landTarget - islandSizes.reduce((a, b) => a + b, 0);
  const total = landTarget / 0.3;
  const rows = Math.max(12, Math.round(Math.sqrt(total / 1.1)));
  const cols = Math.max(12, Math.round(total / rows));

  const mask = makeContinent(rng, cols, rows, mainTarget);
  if (!mask) return null;
  const placedIslands = addIslands(rng, mask, cols, rows, islandSizes);
  if (placedIslands < 2) return null;

  const landCells = [];
  const index = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!mask[r * cols + c]) continue;
    index.set(`${c},${r}`, landCells.length);
    landCells.push({ col: c, row: r, ...hexCenter(c, r) });
  }
  const comp = components(landCells, index);

  let terrOf = partition(rng, landCells, index, comp, T);
  terrOf = mergeTiny(landCells, index, terrOf, 3);
  const tCount = Math.max(...terrOf) + 1;
  if (tCount < homeTotal + P) return null;

  const territories = buildTerritories(landCells, index, terrOf, tCount, comp);
  const routes = seaRoutes(rng, territories, landCells, terrOf, comp);
  const homes = assignHomes(rng, territories, sizes);
  if (!homes || homes.some((h, i) => h.length < cities[i])) return null;

  placeCities(rng, territories, homes, cities, Math.ceil(P * CONFIG.NEUTRAL_CITIES_PER_PLAYER));
  placeMountains(rng, territories, routes, mountains);
  nameTerritories(territories.filter((t) => !t.impassable), HEX * 4);

  const width = HEX * SQRT3 * (cols + 0.5) + HEX * 2;
  const height = HEX * 1.5 * (rows - 1) + HEX * 4;
  const deco = decorate(rng, landCells, territories, cols, rows, index);
  const cells = landCells.map((c, i) => ({ id: i, col: c.col, row: c.row, x: c.x, y: c.y, t: terrOf[i] }));
  return { map: { cols, rows, hex: HEX, width, height, cells, territories, routes, deco }, homes };
}

const inGrid = (c, r, cols, rows, margin = 0) => c >= margin && r >= margin && c < cols - margin && r < rows - margin;

/** The main continent: a noisy blob in the middle of the grid, with lakes filled in. Returns a land mask. */
function makeContinent(rng, cols, rows, landTarget) {
  const bumps = Array.from({ length: 9 }, () => ({
    x: 0.2 + rng.next() * 0.6, y: 0.2 + rng.next() * 0.6,
    r: 0.1 + rng.next() * 0.18, w: (rng.chance(0.3) ? -0.7 : 1) * (0.3 + rng.next() * 0.5),
  }));
  const all = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols, ny = (row + 0.5) / rows;
      const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
      let v = 1 - Math.sqrt(dx * dx + dy * dy) * 1.1;
      for (const b of bumps) v += b.w * Math.exp(-((nx - b.x) ** 2 + (ny - b.y) ** 2) / (b.r * b.r));
      v += (rng.next() - 0.5) * 0.14;
      all.push({ col, row, v: inGrid(col, row, cols, rows, 3) ? v : -99 });
    }
  }
  const key = (c, r) => r * cols + c;
  const sorted = all.slice().sort((a, b) => b.v - a.v);
  const isLand = new Uint8Array(cols * rows);
  for (let i = 0; i < landTarget && i < sorted.length; i++) if (sorted[i].v > -99) isLand[key(sorted[i].col, sorted[i].row)] = 1;

  // Keep the largest connected landmass.
  const comp = new Int32Array(cols * rows).fill(-1);
  let best = -1, bestSize = 0, compId = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!isLand[key(c, r)] || comp[key(c, r)] >= 0) continue;
    let size = 0;
    const stack = [[c, r]];
    comp[key(c, r)] = compId;
    while (stack.length) {
      const [cc, rr] = stack.pop();
      size++;
      for (const [nc, nr] of hexNeighbors(cc, rr)) {
        if (!inGrid(nc, nr, cols, rows)) continue;
        const k = key(nc, nr);
        if (isLand[k] && comp[k] < 0) { comp[k] = compId; stack.push([nc, nr]); }
      }
    }
    if (size > bestSize) { bestSize = size; best = compId; }
    compId++;
  }
  if (bestSize < landTarget * 0.85) return null;
  // Fill lakes: sea not reachable from the border becomes land.
  const outside = new Uint8Array(cols * rows);
  const stack = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r === 0 || c === 0 || r === rows - 1 || c === cols - 1) && comp[key(c, r)] !== best) { outside[key(c, r)] = 1; stack.push([c, r]); }
  }
  while (stack.length) {
    const [cc, rr] = stack.pop();
    for (const [nc, nr] of hexNeighbors(cc, rr)) {
      if (!inGrid(nc, nr, cols, rows)) continue;
      const k = key(nc, nr);
      if (!outside[k] && comp[k] !== best) { outside[k] = 1; stack.push([nc, nr]); }
    }
  }
  const mask = new Uint8Array(cols * rows);
  for (let k = 0; k < mask.length; k++) mask[k] = comp[k] === best || !outside[k] ? 1 : 0;
  return mask;
}

/** Hex steps from every grid cell to the nearest land. */
function seaDistance(mask, cols, rows) {
  const dist = new Int32Array(cols * rows).fill(1e9);
  const queue = [];
  for (let k = 0; k < mask.length; k++) if (mask[k]) { dist[k] = 0; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const c = k % cols, r = (k / cols) | 0;
    for (const [nc, nr] of hexNeighbors(c, r)) {
      if (!inGrid(nc, nr, cols, rows)) continue;
      const nk = nr * cols + nc;
      if (dist[nk] > dist[k] + 1) { dist[nk] = dist[k] + 1; queue.push(nk); }
    }
  }
  return dist;
}

/** Islands a few sea cells off any other land (at least two sea cells away). Returns how many were placed. */
function addIslands(rng, mask, cols, rows, sizes) {
  let placed = 0;
  for (const size of sizes) {
    const dist = seaDistance(mask, cols, rows);
    const seeds = [];
    for (let k = 0; k < mask.length; k++) {
      const c = k % cols, r = (k / cols) | 0;
      if (dist[k] >= 4 && dist[k] <= 7 && inGrid(c, r, cols, rows, 2)) seeds.push(k);
    }
    if (!seeds.length) continue;
    const seed = rng.pick(seeds);
    const island = new Set([seed]);
    const frontier = [seed];
    for (let guard = 0; island.size < size && guard < size * 40; guard++) {
      const from = rng.pick(frontier);
      const c = from % cols, r = (from / cols) | 0;
      const [nc, nr] = rng.pick(hexNeighbors(c, r));
      const nk = nr * cols + nc;
      if (!inGrid(nc, nr, cols, rows, 2) || island.has(nk) || dist[nk] < 3) continue; // keep two sea cells between islands and other land
      island.add(nk);
      frontier.push(nk);
    }
    if (island.size < size * 0.7) continue;
    for (const k of island) mask[k] = 1;
    placed++;
  }
  return placed;
}

function cellNeighbors(landCells, index, i) {
  const c = landCells[i];
  const out = [];
  for (const [nc, nr] of hexNeighbors(c.col, c.row)) {
    const j = index.get(`${nc},${nr}`);
    if (j !== undefined) out.push(j);
  }
  return out;
}

/** Connected landmass id for each land cell; 0 is always the largest (the continent). */
function components(landCells, index) {
  const comp = new Array(landCells.length).fill(-1);
  const groups = [];
  for (let i = 0; i < landCells.length; i++) {
    if (comp[i] >= 0) continue;
    const g = [];
    const stack = [i];
    comp[i] = groups.length;
    while (stack.length) {
      const j = stack.pop();
      g.push(j);
      for (const n of cellNeighbors(landCells, index, j)) if (comp[n] < 0) { comp[n] = groups.length; stack.push(n); }
    }
    groups.push(g);
  }
  const order = groups.map((g, id) => [id, g.length]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const remap = new Map(order.map((id, k) => [id, k]));
  return comp.map((c) => remap.get(c));
}

/** Territory seeds per landmass (so every island gets its own territories), then balanced growth. */
function partition(rng, landCells, index, comp, T) {
  const byComp = new Map();
  comp.forEach((c, i) => { if (!byComp.has(c)) byComp.set(c, []); byComp.get(c).push(i); });
  const avg = landCells.length / T;
  let seeds = [];
  for (const cells of byComp.values()) {
    const want = Math.max(1, Math.round(cells.length / avg));
    const mine = [rng.pick(cells)];
    while (mine.length < want) {
      let bestCell = -1, bestDist = -1;
      for (let k = 0; k < 25; k++) {
        const cand = rng.pick(cells);
        let d = Infinity;
        for (const s of mine) d = Math.min(d, (landCells[s].x - landCells[cand].x) ** 2 + (landCells[s].y - landCells[cand].y) ** 2);
        if (d > bestDist) { bestDist = d; bestCell = cand; }
      }
      mine.push(bestCell);
    }
    seeds.push(...mine);
  }
  let terrOf;
  for (let pass = 0; pass < 3; pass++) {
    terrOf = grow(rng, landCells, index, seeds);
    if (pass === 2) break;
    seeds = seeds.map((_, t) => {
      let sx = 0, sy = 0, n = 0;
      terrOf.forEach((tt, i) => { if (tt === t) { sx += landCells[i].x; sy += landCells[i].y; n++; } });
      sx /= n; sy /= n;
      let best = -1, bd = Infinity;
      terrOf.forEach((tt, i) => {
        if (tt !== t) return;
        const d = (landCells[i].x - sx) ** 2 + (landCells[i].y - sy) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    });
  }
  return terrOf;
}

function grow(rng, landCells, index, seeds) {
  const terrOf = new Array(landCells.length).fill(-1);
  const sizes = seeds.map(() => 1);
  const frontier = seeds.map(() => []);
  seeds.forEach((s, t) => {
    terrOf[s] = t;
    frontier[t].push(...cellNeighbors(landCells, index, s));
  });
  let remaining = landCells.length - seeds.length;
  while (remaining > 0) {
    let pickT = -1;
    for (let t = 0; t < seeds.length; t++) {
      frontier[t] = frontier[t].filter((c) => terrOf[c] < 0);
      if (!frontier[t].length) continue;
      if (pickT < 0 || sizes[t] < sizes[pickT] || (sizes[t] === sizes[pickT] && rng.chance(0.5))) pickT = t;
    }
    if (pickT < 0) break;
    const cell = rng.pick(frontier[pickT]);
    terrOf[cell] = pickT;
    sizes[pickT]++;
    remaining--;
    frontier[pickT].push(...cellNeighbors(landCells, index, cell).filter((c) => terrOf[c] < 0));
  }
  // Any stragglers join a neighbour.
  terrOf.forEach((t, i) => {
    if (t < 0) terrOf[i] = terrOf[cellNeighbors(landCells, index, i).find((j) => terrOf[j] >= 0)] ?? 0;
  });
  return terrOf;
}

function mergeTiny(landCells, index, terrOf, minCells) {
  let changed = true;
  while (changed) {
    changed = false;
    const count = new Map();
    terrOf.forEach((t) => count.set(t, (count.get(t) || 0) + 1));
    for (const [t, n] of count) {
      if (n >= minCells) continue;
      const nb = new Map();
      terrOf.forEach((tt, i) => {
        if (tt !== t) return;
        for (const j of cellNeighbors(landCells, index, i)) if (terrOf[j] !== t) nb.set(terrOf[j], count.get(terrOf[j]));
      });
      if (!nb.size) continue;
      const into = [...nb.entries()].sort((a, b) => a[1] - b[1])[0][0];
      terrOf.forEach((tt, i) => { if (tt === t) terrOf[i] = into; });
      changed = true;
      break;
    }
  }
  // Re-index to 0..n-1
  const remap = new Map();
  return terrOf.map((t) => {
    if (!remap.has(t)) remap.set(t, remap.size);
    return remap.get(t);
  });
}

function buildTerritories(landCells, index, terrOf, tCount, comp) {
  const territories = Array.from({ length: tCount }, (_, id) => ({
    id, name: '', cells: [], neighbors: [], landNeighbors: [], landmass: 0, coastal: false, anchor: -1, x: 0, y: 0,
    isCity: false, isCapital: false, homeOf: null,
  }));
  const nb = territories.map(() => new Set());
  terrOf.forEach((t, i) => {
    territories[t].cells.push(i);
    territories[t].landmass = comp[i];
    const ns = cellNeighbors(landCells, index, i);
    if (ns.length < 6) territories[t].coastal = true;
    for (const j of ns) if (terrOf[j] !== t) nb[t].add(terrOf[j]);
  });
  for (const t of territories) {
    t.neighbors = [...nb[t.id]].sort((a, b) => a - b);
    t.landNeighbors = t.neighbors.slice();
    let sx = 0, sy = 0;
    for (const i of t.cells) { sx += landCells[i].x; sy += landCells[i].y; }
    sx /= t.cells.length; sy /= t.cells.length;
    let bd = Infinity;
    for (const i of t.cells) {
      // Prefer interior cells (all six neighbours in the same territory) for the label.
      const interior = cellNeighbors(landCells, index, i).filter((j) => terrOf[j] === t.id).length;
      const d = (landCells[i].x - sx) ** 2 + (landCells[i].y - sy) ** 2 - interior * 12;
      if (d < bd) { bd = d; t.anchor = i; }
    }
    t.x = landCells[t.anchor].x;
    t.y = landCells[t.anchor].y;
  }
  return territories;
}

/**
 * Sea routes (drawn as white lines): every island is linked to the rest of the world by its shortest
 * crossing (a spanning tree grown from the continent), and some islands get a second route.
 * Territories joined by a route border each other for moves, attacks and supports.
 */
function seaRoutes(rng, territories, landCells, terrOf, comp) {
  const masses = new Map();
  comp.forEach((c, i) => { if (!masses.has(c)) masses.set(c, []); masses.get(c).push(i); });
  const coast = new Map([...masses].map(([c, cells]) => [c, cells.filter((i) => territories[terrOf[i]].coastal)]));
  const closest = (a, b) => {
    let best = null;
    for (const i of coast.get(a)) for (const j of coast.get(b)) {
      const d = (landCells[i].x - landCells[j].x) ** 2 + (landCells[i].y - landCells[j].y) ** 2;
      if (!best || d < best.d) best = { i, j, d };
    }
    return best;
  };
  const pairs = new Map();
  const ids = [...masses.keys()];
  for (const a of ids) for (const b of ids) if (a < b) pairs.set(`${a}-${b}`, closest(a, b));
  const pair = (a, b) => pairs.get(a < b ? `${a}-${b}` : `${b}-${a}`);

  const routes = [];
  const link = (p) => {
    const ta = terrOf[p.i], tb = terrOf[p.j];
    if (territories[ta].neighbors.includes(tb)) return;
    territories[ta].neighbors.push(tb);
    territories[tb].neighbors.push(ta);
    routes.push({ a: ta, b: tb, x1: landCells[p.i].x, y1: landCells[p.i].y, x2: landCells[p.j].x, y2: landCells[p.j].y });
  };
  const joined = new Set([0]);
  while (joined.size < ids.length) {
    let best = null;
    for (const a of joined) for (const b of ids) {
      if (joined.has(b)) continue;
      const p = pair(a, b);
      if (!best || p.d < best.p.d) best = { p, b };
    }
    link(best.p);
    joined.add(best.b);
  }
  // Every island needs at least two ways in: preferably a crossing to a second landmass, otherwise a
  // second crossing to the same neighbour from a different stretch of coast.
  const massOf = (tid) => territories[tid].landmass;
  const routesOf = (m) => routes.filter((r) => massOf(r.a) === m || massOf(r.b) === m);
  for (const a of ids) {
    if (a === 0) continue;
    for (let guard = 0; guard < 4 && routesOf(a).length < 2; guard++) {
      const mine = routesOf(a);
      const linkedTo = new Set(mine.map((r) => (massOf(r.a) === a ? massOf(r.b) : massOf(r.a))));
      const usedTerr = new Set(mine.flatMap((r) => [r.a, r.b]));
      let bestNew = null, bestSame = null;
      for (const b of ids) {
        if (b === a) continue;
        for (const i of coast.get(a)) for (const j of coast.get(b)) {
          const ta = terrOf[i], tb = terrOf[j];
          if (territories[ta].neighbors.includes(tb)) continue;
          const d = (landCells[i].x - landCells[j].x) ** 2 + (landCells[i].y - landCells[j].y) ** 2;
          if (!linkedTo.has(b)) { if (!bestNew || d < bestNew.d) bestNew = { i, j, d }; }
          else if (!usedTerr.has(ta) && !usedTerr.has(tb) && (!bestSame || d < bestSame.d)) bestSame = { i, j, d };
        }
      }
      const pick = bestNew && (!bestSame || bestNew.d <= bestSame.d * 2.5) ? bestNew : bestSame ?? bestNew;
      if (!pick) break;
      link(pick);
    }
  }
  for (const t of territories) t.neighbors.sort((a, b) => a - b);
  return routes;
}

export function territoryDistances(territories, from) {
  const dist = new Array(territories.length).fill(Infinity);
  const queue = [from];
  dist[from] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const t = queue[qi];
    for (const n of territories[t].neighbors) {
      if (dist[n] === Infinity) { dist[n] = dist[t] + 1; queue.push(n); }
    }
  }
  return dist;
}

/**
 * Capitals are spread out at random (not pushed to the edges), so some nations end up landlocked in the
 * interior. Some nations start on islands. Home regions grow over land only, never across the sea.
 */
function assignHomes(rng, territories, sizes) {
  const P = sizes.length;
  const capitals = new Array(P).fill(-1);
  const dists = [];
  const farEnough = (t, min) => dists.every((d) => d[t] >= min);
  const take = (slot, t) => { capitals[slot] = t; dists.push(territoryDistances(territories, t)); };

  // Island nations: the biggest islands that can hold a whole home region.
  const islands = new Map();
  for (const t of territories) if (t.landmass > 0) { if (!islands.has(t.landmass)) islands.set(t.landmass, []); islands.get(t.landmass).push(t.id); }
  const wantIslandHomes = Math.max(1, Math.round(P * CONFIG.ISLAND_HOME_SHARE));
  const bigIslands = [...islands.values()].filter((ts) => ts.length >= 2).sort((a, b) => b.length - a.length);
  for (const ts of bigIslands.slice(0, wantIslandHomes)) {
    const slot = sizes.map((sz, i) => [i, sz]).filter(([i, sz]) => capitals[i] < 0 && sz <= ts.length)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (slot === undefined) continue;
    const pick = rng.shuffle(ts).find((t) => farEnough(t, 3));
    if (pick !== undefined) take(slot, pick);
  }

  // Everyone else on the continent: random order, keeping capitals a few steps apart.
  const mainland = territories.filter((t) => t.landmass === 0).map((t) => t.id);
  for (let min = 4; min >= 2 && capitals.includes(-1); min--) {
    for (const t of rng.shuffle(mainland)) {
      const slot = capitals.indexOf(-1);
      if (slot < 0) break;
      if (!capitals.includes(t) && farEnough(t, min)) take(slot, t);
    }
  }
  if (capitals.includes(-1)) return null;

  const owner = new Array(territories.length).fill(-1);
  const homes = capitals.map((c, i) => { owner[c] = i; return [c]; });
  // Grow regions round-robin. First pass keeps clear of other capitals; on crowded maps (little
  // neutral land) a second pass allows it, so every nation can still reach its size.
  for (const spacious of [true, false]) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const i of rng.shuffle([...Array(P).keys()])) {
        if (homes[i].length >= sizes[i]) continue;
        const cands = new Map();
        for (const t of homes[i]) {
          for (const n of territories[t].landNeighbors) {
            if (owner[n] >= 0) continue;
            if (spacious && territories[n].neighbors.some((m) => owner[m] >= 0 && owner[m] !== i && capitals.includes(m))) continue;
            const compact = territories[n].landNeighbors.filter((m) => owner[m] === i).length;
            cands.set(n, compact + rng.next());
          }
        }
        if (!cands.size) continue;
        const pick = [...cands.entries()].sort((a, b) => b[1] - a[1])[0][0];
        owner[pick] = i;
        homes[i].push(pick);
        progress = true;
      }
    }
  }
  if (homes.some((h) => h.length < 2)) return null;
  homes.forEach((h, i) => {
    for (const t of h) territories[t].homeOf = i;
    territories[capitals[i]].isCapital = true;
  });
  return homes;
}

/**
 * Impassable mountain territories. Picked from plain neutral land (no cities, no sea-route ends, not
 * next to a capital), preferring spots next to other mountains so they form small ranges, and never
 * where they would cut the playable map in two. Afterwards nothing borders a mountain, so no troop
 * can move, attack or support into one.
 */
function placeMountains(rng, territories, routes, count) {
  const routeEnds = new Set(routes.flatMap((r) => [r.a, r.b]));
  const isOk = (t) => t.homeOf === null && !t.isCity && !t.impassable && !t.mountainChecked && !routeEnds.has(t.id)
    && !t.neighbors.some((n) => territories[n].isCapital);
  const stillConnected = (blocked) => {
    const open = territories.filter((t) => !t.impassable && t.id !== blocked);
    const seen = new Set([open[0].id]);
    const queue = [open[0].id];
    for (let qi = 0; qi < queue.length; qi++) {
      for (const n of territories[queue[qi]].neighbors) {
        if (n === blocked || territories[n].impassable || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return seen.size === open.length;
  };
  let placed = 0;
  for (let guard = 0; placed < count && guard < count * 6; guard++) {
    const cands = territories.filter(isOk);
    if (!cands.length) break;
    // Grow a range half the time; otherwise start somewhere new.
    const nearRange = cands.filter((t) => t.neighbors.some((n) => territories[n].impassable));
    const pool = nearRange.length && rng.chance(0.5) ? nearRange : cands;
    const t = rng.pick(pool);
    if (!stillConnected(t.id)) { t.mountainChecked = true; continue; }
    t.impassable = true;
    placed++;
  }
  for (const t of territories) {
    delete t.mountainChecked;
    if (t.impassable) { t.neighbors = []; t.landNeighbors = []; t.name = 'Mountains'; continue; }
    t.neighbors = t.neighbors.filter((n) => !territories[n].impassable);
    t.landNeighbors = t.landNeighbors.filter((n) => !territories[n].impassable);
  }
}

function placeCities(rng, territories, homes, cities, neutralCities) {
  homes.forEach((h, i) => {
    const capital = h[0];
    territories[capital].isCity = true;
    const want = cities[i];
    const others = rng.shuffle(h.slice(1))
      .sort((a, b) => Number(territories[a].neighbors.includes(capital)) - Number(territories[b].neighbors.includes(capital)));
    for (let k = 0; k < want - 1; k++) territories[others[k]].isCity = true;
  });
  const neutral = rng.shuffle(territories.filter((t) => t.homeOf === null));
  // Prefer neutral land that borders a home region but not a capital, and never two neutral cities side by side.
  neutral.sort((a, b) => scoreNeutral(territories, b) - scoreNeutral(territories, a));
  let placed = 0;
  for (const t of neutral) {
    if (placed >= neutralCities) break;
    if (t.neighbors.some((n) => territories[n].isCity && territories[n].homeOf === null)) continue;
    t.isCity = true;
    placed++;
  }
}

function scoreNeutral(territories, t) {
  const homesNear = new Set(t.neighbors.map((n) => territories[n].homeOf).filter((h) => h !== null));
  const nearCapital = t.neighbors.some((n) => territories[n].isCapital);
  return homesNear.size * 2 - (nearCapital ? 3 : 0) + (homesNear.size === 0 ? 1 : 0);
}

function decorate(rng, landCells, territories, cols, rows, index) {
  const deco = [];
  const anchors = new Set(territories.map((t) => t.anchor));
  const nearAnchor = new Set();
  for (const t of territories) {
    const a = landCells[t.anchor];
    for (const [c, r] of hexNeighbors(a.col, a.row)) {
      const j = index.get(`${c},${r}`);
      if (j !== undefined) nearAnchor.add(j);
    }
  }
  const terrOfCell = new Map();
  territories.forEach((t) => t.cells.forEach((c) => terrOfCell.set(c, t)));
  landCells.forEach((c, i) => {
    if (anchors.has(i) || nearAnchor.has(i)) return;
    const t = terrOfCell.get(i);
    const p = t.homeOf === null ? 0.22 : 0.08;
    if (!rng.chance(p)) return;
    const kind = rng.pick(['evergreen-tree', 'evergreen-tree', 'deciduous-tree', 'mountain', 'snow-capped-mountain']);
    deco.push({ x: c.x, y: c.y, kind });
  });
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (index.has(`${c},${r}`)) continue;
    const nearLand = hexNeighbors(c, r).some(([nc, nr]) => index.has(`${nc},${nr}`));
    if (!nearLand && rng.chance(0.025)) deco.push({ ...hexCenter(c, r), kind: 'water-wave' });
  }
  return deco;
}
