// One-tap restarts: same nations on a new map, the same map again, or a brand-new game.
import { h, btn } from './dom.js';
import { openModal } from './sheet.js';
import * as G from '../engine/game.js';

const KINDS = {
  rematch: { label: 'New map, same nations', color: 'green', icon: 'world-map', text: 'Everyone keeps their nation, colour and theme on a freshly generated map.' },
  replay: { label: 'Same map again', color: 'teal', icon: 'counterclockwise-arrows-button', text: 'Restart this exact map from turn 1 with the same nations.' },
  fresh: { label: 'Start from scratch', color: 'red', icon: 'wastebasket', text: 'Create new nations and a new map.' },
};

export function restart(app, kind) {
  const k = KINDS[kind];
  openModal((close) => h('div', { class: 'col' },
    h('h2', {}, `${k.label}?`),
    h('p', {}, `${k.text} The current game will be lost.`),
    h('div', { class: 'row' },
      btn('Cancel', { color: 'gray', onclick: close }),
      btn(k.label, { color: k.color, onclick: () => {
        close();
        if (kind === 'fresh') { app.room?.close(); app.setState(null); app.go('setup'); return; }
        const seed = kind === 'replay' ? app.state.seed : Math.random().toString(36).slice(2, 8);
        const me = app.me;
        const next = G.rematch(app.state, seed);
        app.results = null;
        app.setPrefs({ playAs: next.nations.find((n) => n.name === me.name)?.id ?? next.nations[0].id });
        app.setState(next);
        app.go('map');
        app.toast(kind === 'replay' ? 'Same map, turn 1' : 'New map — good luck!');
      } }))));
}

export function restartButtons(app, { sm } = {}) {
  return h('div', { class: 'row wrap' }, Object.entries(KINDS).map(([kind, k]) =>
    btn(k.label, { color: k.color, icon: k.icon, sm, onclick: () => restart(app, kind) })));
}
