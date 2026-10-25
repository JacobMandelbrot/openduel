// SVG map: hex territories, borders, cities, troop tokens, order arrows, pan/pinch/zoom, tap.
import { emojiSrc, mix } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const LAND = '#f4e8c8';
// Corner pair for each neighbour direction (0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE), pointy-top hexes.
const EDGE = { 0: [0, 1], 5: [1, 2], 4: [2, 3], 3: [3, 4], 2: [4, 5], 1: [5, 0] };
const DIRS = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
];

const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
};
const f = (n) => Math.round(n * 10) / 10;
const INK = '#4a2c22';
const NEUTRAL_CITY = '#efe4c6';
const ROCK = '#bcb09c';

/** Upward equilateral triangle centred (by centroid) on x, y. */
export function triangle(x, y, side) {
  const h = side * Math.sqrt(3) / 2;
  return `M${f(x)},${f(y - h * 2 / 3)}L${f(x + side / 2)},${f(y + h / 3)}L${f(x - side / 2)},${f(y + h / 3)}Z`;
}

export class MapView {
  constructor(container, { onTap } = {}) {
    this.onTap = onTap;
    this.wrap = container;
    this.svg = s('svg', { 'aria-label': 'Map' });
    container.append(this.svg);
    this.geomKey = null;
    this.view = null;
    this.bindGestures();
    this.ro = new ResizeObserver(() => this.fitAspect());
    this.ro.observe(container);
  }

  destroy() { this.ro.disconnect(); }

  buildGeometry(map) {
    const r = map.hex;
    const corners = (x, y) => Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return [x + r * Math.cos(a), y + r * Math.sin(a)];
    });
    const byPos = new Map(map.cells.map((c) => [`${c.col},${c.row}`, c]));
    const tPaths = map.territories.map(() => []);
    const outline = map.territories.map(() => []);
    const borders = new Map(); // "a-b" -> segments
    const coast = [];
    for (const c of map.cells) {
      const pts = corners(c.x, c.y);
      tPaths[c.t].push('M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z');
      DIRS[c.row & 1].forEach(([dc, dr], d) => {
        const n = byPos.get(`${c.col + dc},${c.row + dr}`);
        const [i, j] = EDGE[d];
        const seg = `M${f(pts[i][0])},${f(pts[i][1])}L${f(pts[j][0])},${f(pts[j][1])}`;
        if (!n) { coast.push(seg); outline[c.t].push(seg); return; }
        if (n.t === c.t) return;
        outline[c.t].push(seg);
        if (c.id < n.id) {
          const key = c.t < n.t ? `${c.t}-${n.t}` : `${n.t}-${c.t}`;
          if (!borders.has(key)) borders.set(key, []);
          borders.get(key).push(seg);
        }
      });
    }
    this.geom = {
      tPaths: tPaths.map((p) => p.join('')),
      outline: outline.map((p) => p.join('')),
      borders: [...borders.entries()].map(([k, segs]) => ({ a: +k.split('-')[0], b: +k.split('-')[1], d: segs.join('') })),
      coast: coast.join(''),
    };
  }

  buildStatic(map) {
    this.svg.replaceChildren();
    this.svg.append(s('rect', { x: -2000, y: -2000, width: map.width + 4000, height: map.height + 4000, fill: '#a9dbe6' }));
    const deco = s('g', { 'pointer-events': 'none' });
    for (const dc of map.deco.filter((x) => x.kind === 'water-wave')) {
      deco.append(s('image', { href: emojiSrc(dc.kind), x: dc.x - 5, y: dc.y - 5, width: 10, height: 10, opacity: 0.55 }));
    }
    this.svg.append(deco);
    // Sea routes: white dashed lines between coasts. Drawn under the land so only the sea crossing shows.
    const routes = s('g', { 'pointer-events': 'none' });
    for (const r of map.routes || []) {
      const d = `M${f(r.x1)},${f(r.y1)}L${f(r.x2)},${f(r.y2)}`;
      routes.append(s('path', { d, class: 'route-under' }), s('path', { d, class: 'route' }));
    }
    this.svg.append(routes);
    this.gTerr = s('g');
    this.terrEls = this.geom.tPaths.map((d, id) => {
      const p = s('path', { d, class: 'terr cell', 'data-t': id, fill: LAND, stroke: LAND, 'stroke-width': '0.8' });
      this.gTerr.append(p);
      return p;
    });
    this.svg.append(this.gTerr);
    const landDeco = s('g', { 'pointer-events': 'none' });
    const rock = new Set(map.territories.filter((t) => t.impassable).flatMap((t) => t.cells));
    for (const dc of map.deco.filter((x) => x.kind !== 'water-wave')) {
      landDeco.append(s('image', { href: emojiSrc(dc.kind), x: dc.x - 5, y: dc.y - 5.5, width: 10, height: 10, opacity: 0.8 }));
    }
    // Impassable mountains: a peak on every cell.
    map.cells.forEach((c, i) => {
      if (!rock.has(i)) return;
      landDeco.append(s('image', { href: emojiSrc(i % 3 ? 'mountain' : 'snow-capped-mountain'), x: c.x - 7, y: c.y - 7.5, width: 14, height: 14 }));
    });
    this.svg.append(landDeco);
    this.svg.append(s('path', { d: this.geom.borders.map((b) => b.d).join(''), class: 'border' }));
    this.nborder = s('path', { class: 'nborder' });
    this.svg.append(this.nborder);
    this.svg.append(s('path', { d: this.geom.coast, class: 'coast' }));
    this.gHl = s('g');
    this.gIcons = s('g', { 'pointer-events': 'none' });
    this.gArrows = s('g', { 'pointer-events': 'none' });
    this.svg.append(this.gHl, this.gIcons, this.gArrows);
  }

  /**
   * @param state GameState
   * @param opts { fill: (tid) => color|null, selected, highlights: Set, arrows: [{from,to,via,kind,color}], marks: Map tid->emoji }
   */
  update(state, opts = {}) {
    const map = state.map;
    const key = `${state.seed}:${map.cells.length}`;
    if (key !== this.geomKey) {
      this.geomKey = key;
      this.buildGeometry(map);
      this.buildStatic(map);
      this.view = null;
    }
    this.map = map;
    if (!this.view) this.fitAll();
    const nationOf = new Map(state.nations.map((n) => [n.id, n]));

    map.territories.forEach((t, id) => {
      const custom = opts.fill?.(id);
      const owner = state.terr[id].owner;
      const color = t.impassable ? ROCK : custom ?? (owner ? mix(LAND, nationOf.get(owner).color, 0.42) : LAND);
      this.terrEls[id].setAttribute('fill', color);
      this.terrEls[id].setAttribute('stroke', color);
    });
    const own = (tid) => state.terr[tid].owner;
    this.nborder.setAttribute('d', this.geom.borders.filter((b) => own(b.a) !== own(b.b)).map((b) => b.d).join(''));

    this.gHl.replaceChildren();
    for (const tid of opts.highlights || []) this.gHl.append(s('path', { d: this.geom.outline[tid], class: 'hl' }));
    for (const tid of opts.captured || []) this.gHl.append(s('path', { d: this.geom.outline[tid], class: 'hl cap' }));
    for (const tid of opts.picked || []) this.gHl.append(s('path', { d: this.geom.outline[tid], class: 'hl pick' }));
    for (const tid of opts.dropped || []) this.gHl.append(s('path', { d: this.geom.outline[tid], class: 'hl drop' }));
    if (opts.selected != null) this.gHl.append(s('path', { d: this.geom.outline[opts.selected], class: 'hl sel' }));

    this.gIcons.replaceChildren();
    this.armyAt = new Map();
    const troopAt = new Map(state.troops.map((t) => [t.at, t]));
    for (const t of map.territories) {
      const tr = troopAt.get(t.id);
      const owner = nationOf.get(state.terr[t.id].owner);
      const cityR = t.isCapital ? 6 : 4.2;
      // City: a circle in the owner's colour (neutral cities are pale). Capitals are bigger, with an inner ring.
      if (t.isCity) {
        const cx = tr ? t.x - cityR - 1 : t.x, cy = t.y;
        if (opts.myCapital === t.id) {
          // Your own capital: a steady gold ring.
          this.gIcons.append(s('circle', { cx, cy, r: cityR + 3.6, fill: 'rgba(255,212,59,.35)', stroke: '#ffd43b', 'stroke-width': 2.4 }));
        }
        this.gIcons.append(s('circle', { cx, cy, r: cityR, fill: owner?.color ?? NEUTRAL_CITY, stroke: INK, 'stroke-width': 1.3 }));
        if (t.isCapital) this.gIcons.append(s('circle', { cx, cy, r: cityR - 2.1, fill: 'none', stroke: '#fffbea', 'stroke-width': 1.1 }));
        const occupier = opts.occupied?.get(t.id);
        if (occupier) this.gIcons.append(s('circle', { cx, cy, r: cityR + 2.4, fill: 'none', stroke: occupier, 'stroke-width': 2, 'stroke-dasharray': '2.5 1.8' }));
      }
      // Troop: an upward triangle in the owner's colour. A conquered player's troop has an inner triangle in their colour.
      if (tr) {
        const n = nationOf.get(tr.nation);
        const cmd = nationOf.get(tr.cmd);
        const ax = t.isCity ? t.x + cityR + 2 : t.x, ay = t.y - 1;
        this.armyAt.set(t.id, { x: ax, y: ay });
        this.gIcons.append(s('ellipse', { cx: ax, cy: ay + 5, rx: 5.8, ry: 1.5, fill: 'rgba(60,30,20,.25)' }));
        this.gIcons.append(s('path', { d: triangle(ax, ay, 12.5), fill: n.color, stroke: INK, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
        if (cmd.id !== n.id) this.gIcons.append(s('path', { d: triangle(ax, ay + 0.5, 5.6), fill: cmd.color, stroke: '#fffbea', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }));
      }
      const mark = opts.marks?.get(t.id);
      if (mark) this.gIcons.append(s('image', { href: emojiSrc(mark), x: t.x + 7, y: t.y + 2, width: 10, height: 10 }));
    }
    this.drawLabels(map, troopAt, opts.capitalNames ?? new Map(), opts.labels !== false);
    // Duel markers: a pulsing red badge with crossed swords above the contested piece.
    for (const tid of opts.duelAt || []) {
      const a = this.anchorOf(tid);
      const x = a.x, y = a.y - 9;
      this.gIcons.append(s('circle', { cx: x, cy: y, r: 8, class: 'duel-pulse' }));
      this.gIcons.append(s('circle', { cx: x, cy: y, r: 7, fill: '#e8574f', stroke: INK, 'stroke-width': 1.6 }));
      this.gIcons.append(s('image', { href: emojiSrc('crossed-swords'), x: x - 4.8, y: y - 4.8, width: 9.6, height: 9.6 }));
    }

    this.gArrows.replaceChildren();
    for (const g of opts.ghosts || []) this.drawGhost(g.at, g.color);
    for (const a of opts.arrows || []) this.drawArrow(a);
  }

  /** Territory names, nudged down (then shrunk) where they would overlap a neighbour's. Cities get first pick. */
  /**
   * Labels. A capital shows its country's name in the country's colour (always, even with names off),
   * followed by its code; other territories show their code (a1, b1 …) when names are on.
   * Capitals get first pick of space, then cities.
   */
  drawLabels(map, troopAt, capitalNames, showCodes) {
    const placed = [];
    const hits = (r) => placed.some((p) => r.x1 < p.x2 && r.x2 > p.x1 && r.y1 < p.y2 && r.y2 > p.y1);
    const rank = (t) => (capitalNames.has(t.id) ? 2 : t.isCity ? 1 : 0);
    const order = map.territories.slice().sort((a, b) => rank(b) - rank(a));
    for (const t of order) {
      if (t.impassable) continue;
      const country = capitalNames.get(t.id);
      if (!country && !showCodes) continue;
      const code = showCodes ? t.name : '';
      const text = country ? `${country.name}${code ? ' ' + code : ''}` : code;
      const base = t.y + (troopAt.has(t.id) || t.isCity ? (t.isCapital ? 14 : 12) : 4);
      let size = 8.5, y = base, rect;
      for (const [dy, sz] of [[0, 8.5], [8, 8.5], [-9, 8.5], [0, 6.8], [7, 6.8]]) {
        size = sz; y = base + dy;
        const w = text.length * size * 0.56;
        rect = { x1: t.x - w / 2, x2: t.x + w / 2, y1: y - size * 0.8, y2: y + size * 0.2 };
        if (!hits(rect)) break;
      }
      placed.push(rect);
      const label = s('text', { x: t.x, y, class: `label ${country ? 'country' : ''}`, style: size !== 8.5 ? `font-size:${size}px` : null });
      if (country) {
        const nameSpan = s('tspan', { fill: mix(country.color, INK, 0.3) });
        nameSpan.textContent = country.name;
        label.append(nameSpan);
        if (code) { const c = s('tspan', { class: 'code' }); c.textContent = ' ' + code; label.append(c); }
      } else label.textContent = code;
      this.gIcons.append(label);
    }
  }

  /**
   * kind: 'move' (solid, arrowhead), 'fail' (solid, stops halfway at a red bar — the attack was stopped),
   * 'support' (dashed, arrowhead), 'cut' (grey dashed — the support was cut). color = the ordering nation's colour.
   */
  drawArrow({ from, to, via, kind, color = '#ffffff' }) {
    const pos = (tid) => this.armyAt?.get(tid) ?? { x: this.map.territories[tid].x, y: this.map.territories[tid].y - 1 };
    const support = kind === 'support' || kind === 'cut';
    const A = pos(from), B = pos(to);
    let ax = A.x, ay = A.y, bx = B.x, by = B.y;
    if (support && via != null) {
      // Point at the midpoint of the supported move.
      const V = pos(via);
      bx = (V.x + B.x) / 2; by = (V.y + B.y) / 2;
    }
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const sx = ax + (dx / len) * 8, sy = ay + (dy / len) * 8;
    let ex = bx - (dx / len) * (support ? 3 : 8), ey = by - (dy / len) * (support ? 3 : 8);
    if (kind === 'fail') { ex = ax + dx * 0.55; ey = ay + dy * 0.55; }
    const cx = (sx + ex) / 2 - dy * 0.12, cy = (sy + ey) / 2 + dx * 0.12;
    const d = `M${f(sx)},${f(sy)} Q${f(cx)},${f(cy)} ${f(ex)},${f(ey)}`;
    const stroke = kind === 'cut' ? '#a99d92' : color;
    this.gArrows.append(s('path', { d, class: 'arrow-outline' }));
    this.gArrows.append(s('path', { d, class: `arrow ${support ? 'support' : ''}`, stroke }));
    // Head (or the red "stopped" bar), oriented along the curve's end tangent.
    const tx = ex - cx, ty = ey - cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
    if (kind === 'fail') {
      const bar = `M${f(ex - uy * 5)},${f(ey + ux * 5)}L${f(ex + uy * 5)},${f(ey - ux * 5)}`;
      this.gArrows.append(s('path', { d: bar, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }));
      this.gArrows.append(s('path', { d: bar, stroke: '#e8574f', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    } else {
      const bx2 = ex - ux * 5.5, by2 = ey - uy * 5.5;
      const head = `M${f(ex)},${f(ey)}L${f(bx2 - uy * 3.6)},${f(by2 + ux * 3.6)}L${f(bx2 + uy * 3.6)},${f(by2 - ux * 3.6)}Z`;
      this.gArrows.append(s('path', { d: head, fill: stroke, stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
    }
  }

  /** A troop destroyed this turn: a faded triangle with a red cross where it stood. */
  drawGhost(tid, color) {
    const t = this.map.territories[tid];
    const occupied = this.armyAt?.get(tid); // the winner now stands here; put the ghost beside it
    const x = occupied ? occupied.x - 13 : t.isCity ? t.x + (t.isCapital ? 6 : 4.2) + 2 : t.x, y = t.y - 1;
    this.gArrows.append(s('path', { d: triangle(x, y, 12.5), fill: color, stroke: INK, 'stroke-width': 1.2, opacity: 0.45, 'stroke-linejoin': 'round' }));
    const cross = `M${f(x - 5)},${f(y - 5)}L${f(x + 5)},${f(y + 5)}M${f(x + 5)},${f(y - 5)}L${f(x - 5)},${f(y + 5)}`;
    this.gArrows.append(s('path', { d: cross, stroke: INK, 'stroke-width': 4.2, 'stroke-linecap': 'round' }));
    this.gArrows.append(s('path', { d: cross, stroke: '#e8574f', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
  }

  // ---------- viewport ----------
  setView(v) {
    this.view = v;
    this.svg.setAttribute('viewBox', `${f(v.x)} ${f(v.y)} ${f(v.w)} ${f(v.h)}`);
    this.onView?.();
  }

  /** Map units → pixels inside the map container (for HTML overlays that follow the map). */
  toScreen(x, y) {
    const v = this.view, w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    const k = Math.min(w / v.w, h / v.h); // viewBox is letterboxed with preserveAspectRatio "meet"
    return { x: (x - v.x) * k + (w - v.w * k) / 2, y: (y - v.y) * k + (h - v.h * k) / 2 };
  }

  /** Where a territory's piece sits: the troop if there is one, otherwise the city/centre. */
  anchorOf(tid) {
    const t = this.map.territories[tid];
    const a = this.armyAt?.get(tid);
    return a ? { x: a.x, y: a.y - 8 } : { x: t.x, y: t.y - (t.isCity ? (t.isCapital ? 7 : 5) : 2) };
  }

  fitAll() {
    const m = this.map;
    const cw = this.wrap.clientWidth || 360, ch = this.wrap.clientHeight || 600;
    const pad = 14;
    let w = m.width + pad * 2, h = m.height + pad * 2;
    if (w / h > cw / ch) h = w * ch / cw; else w = h * cw / ch;
    this.setView({ x: m.width / 2 - w / 2, y: m.height / 2 - h / 2, w, h });
  }

  fitAspect() {
    if (!this.view || !this.map) return;
    const cw = this.wrap.clientWidth, ch = this.wrap.clientHeight;
    if (!cw || !ch) return;
    const v = this.view;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const h = v.w * ch / cw;
    this.setView({ x: v.x, y: cy - h / 2, w: v.w, h });
    if (cx == null) this.fitAll();
  }

  zoomBy(factor, px = 0.5, py = 0.5) {
    const v = this.view;
    const maxW = (this.map.width + 28) * 1.6, minW = 60;
    const w = Math.min(maxW, Math.max(minW, v.w * factor));
    const k = w / v.w;
    const h = v.h * k;
    this.setView({ x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h });
  }

  focus(tid, width) {
    const t = this.map.territories[tid];
    this.focusAt(t.x, t.y, width);
  }

  focusAt(x, y, width) {
    const v = this.view;
    const w = width ?? v.w, h = v.h * (w / v.w);
    this.setView({ x: x - w / 2, y: y - h / 2, w, h });
  }

  /** The territory under a tap. Falls back to whatever cell is under the point, in case a line or label caught it. */
  territoryAt(target, x, y) {
    const own = target?.getAttribute?.('data-t');
    if (own != null) return Number(own);
    const cell = document.elementsFromPoint(x, y).find((el) => el.hasAttribute?.('data-t') && this.svg.contains(el));
    return cell ? Number(cell.getAttribute('data-t')) : null;
  }

  bindGestures() {
    const pts = new Map();
    let start = null, pinch = null, moved = false;
    const el = this.wrap;
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone; gestures still work without capture */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, view: { ...this.view }, t: performance.now(), target: e.target };
        moved = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: { ...this.view }, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !this.view) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = el.getBoundingClientRect();
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k = pinch.d / d;
        const v = pinch.view;
        const w = Math.min((this.map.width + 28) * 1.6, Math.max(60, v.w * k));
        const kk = w / v.w;
        const px = (pinch.mid.x - rect.left) / rect.width, py = (pinch.mid.y - rect.top) / rect.height;
        this.setView({ x: v.x + (v.w - w) * px, y: v.y + (v.h - v.h * kk) * py, w, h: v.h * kk });
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      const scale = start.view.w / rect.width;
      this.setView({ ...start.view, x: start.view.x - dx * scale, y: start.view.y - dy * scale });
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (start && !moved && e.type === 'pointerup') {
          this.onTap?.(this.territoryAt(start.target, e.clientX, e.clientY));
        }
        start = null; pinch = null;
      } else if (pts.size === 1) {
        const [p] = [...pts.values()];
        start = { x: p.x, y: p.y, view: { ...this.view }, t: performance.now(), target: null };
        pinch = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      this.zoomBy(Math.exp(e.deltaY * 0.0015), (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    }, { passive: false });
  }
}
