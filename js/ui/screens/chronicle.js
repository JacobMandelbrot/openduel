// Events: every capture, duel, treaty and conquest, newest first.
import { h, emoji } from '../dom.js';
import { eventIcon } from '../report.js';

export function render(app) {
  const s = app.state;
  const byTurn = new Map();
  for (const c of s.chronicle.slice().reverse()) {
    if (!byTurn.has(c.turn)) byTurn.set(c.turn, []);
    byTurn.get(c.turn).push(c);
  }
  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon yellow' }, 'Events'),
    [...byTurn.entries()].map(([turn, items]) => h('div', { class: 'panel paper' },
      h('h3', {}, `Turn ${turn}`),
      items.map((c) => h('div', { class: 'news' }, emoji(eventIcon(c.kind)), h('div', { class: 'grow' }, c.text)))))));
}
