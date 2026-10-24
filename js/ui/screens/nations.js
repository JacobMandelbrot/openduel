// Nations: standings and your private friend/neutral/enemy tags.
import { h, emoji, logo, btn } from '../dom.js';
import { standings, citiesOwnedBy, territoriesOwnedBy, troopsCommandedBy } from '../../engine/state.js';

const TAGS = [['friend', 'handshake', 'Friend'], ['neutral', 'neutral-face', 'Neutral'], ['enemy', 'angry-face', 'Enemy']];

export function tagBar(app, other) {
  const me = app.me;
  const current = app.state.tags[me.id]?.[other.id] ?? 'neutral';
  return h('div', { class: 'tagbar', onclick: (e) => e.stopPropagation(), title: 'Only you can see this' },
    TAGS.map(([key, icon, label]) => h('button', { class: current === key ? 'on' : '', title: label, 'aria-label': label, type: 'button',
      onclick: () => app.act('setTag', other.id, key) },
    h('img', { src: `assets/emoji/${icon}.png`, alt: '' }))));
}

function nationRow(app, n, rank) {
  const s = app.state;
  const me = app.me;
  const isMe = n.id === me.id;
  return h('div', { class: 'item click col', onclick: () => app.go(`nation/${n.id}`), style: `align-items:stretch;gap:8px;${n.vassalOf ? 'margin-left:28px' : ''}` },
    h('div', { class: 'row', style: 'gap:12px' },
    rank ? h('b', { style: 'width:20px;text-align:center' }, rank) : null,
    logo(n),
    h('div', { class: 'grow col', style: 'gap:2px;min-width:0' },
      h('div', { class: 'title' }, n.name, isMe ? ' (you) ' : ' ', n.bot ? emoji('robot', 's') : null),
      h('div', { class: 'sub' }, n.leader),
      n.vassalOf
        ? h('div', { class: 'stats' }, h('span', {}, emoji('white-flag', 's'), n.out ? 'Out of the game' : `Fights for ${s.nations.find((x) => x.id === n.vassalOf).name}`),
          h('span', {}, emoji('military-helmet', 's'), troopsCommandedBy(s, n.id).length))
        : h('div', { class: 'stats' },
          h('span', { title: 'Cities' }, emoji('classical-building', 's'), citiesOwnedBy(s, n.id).length),
          h('span', { title: 'Territories' }, emoji('triangular-flag', 's'), territoriesOwnedBy(s, n.id).length),
          h('span', { title: 'Troops' }, emoji('military-helmet', 's'), s.troops.filter((t) => t.nation === n.id).length),
          h('span', { title: 'Duels won' }, emoji('person-fencing', 's'), s.stats[n.id]?.duelsWon ?? 0)))),
    isMe ? null : h('div', { class: 'row' }, tagBar(app, n)));
}

export function render(app) {
  const s = app.state;
  const rows = [];
  standings(s).forEach((r, i) => {
    rows.push(nationRow(app, r.nation, i + 1));
    for (const v of r.vassals) rows.push(nationRow(app, v, null));
  });
  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon teal' }, s.phase === 'ended' ? 'Final standings' : 'Nations'),
    h('div', { class: 'panel paper small' },
      h('div', { class: 'row' }, emoji('speech-balloon'), h('div', { class: 'grow' },
        'Alliances are made by talking, face to face. Your friend / neutral / enemy tags are private — only you see them.'))),
    h('div', { class: 'row' }, h('div', { class: 'grow' }), btn('Edit my nation', { color: 'yellow', sm: true, icon: 'pencil', onclick: () => app.go('me') })),
    h('div', { class: 'list' }, rows)));
}
