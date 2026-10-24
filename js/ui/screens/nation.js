// One nation's page: identity, victory theme, territories and its own history.
import { h, emoji, logo, btn, chip } from '../dom.js';
import { citiesOwnedBy, territoriesOwnedBy, troopsCommandedBy } from '../../engine/state.js';
import { tagBar } from './nations.js';
import { playTheme } from '../../audio/piano.js';

let stop = null;
export function leave() { stop?.(); stop = null; }
import { eventIcon } from '../report.js';

export function render(app, [id]) {
  const s = app.state;
  const n = s.nations.find((x) => x.id === id) ?? app.me;
  const me = app.me;
  const overlord = n.vassalOf && s.nations.find((x) => x.id === n.vassalOf);
  const vassals = s.nations.filter((x) => x.vassalOf === n.id);
  const st = s.stats[n.id] ?? {};
  const owned = territoriesOwnedBy(s, n.id);
  const history = s.chronicle.filter((c) => c.nations.includes(n.id)).slice(-40).reverse();

  const themeBtn = n.theme ? btn('Play victory theme', { color: 'teal', icon: 'musical-notes', onclick: () => {
    if (stop) { stop(); return; }
    themeBtn.lastChild.textContent = 'Stop';
    stop = playTheme(n.theme, { onEnd: () => { stop = null; themeBtn.lastChild.textContent = 'Play victory theme'; } });
  } }) : null;

  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'panel col', style: 'align-items:center;text-align:center' },
      logo(n, 'xl'),
      h('h1', { style: 'margin:6px 0 0' }, n.name),
      h('div', { class: 'muted' }, n.leader),
      n.motto ? h('p', { style: 'font-style:italic;font-size:1.1rem' }, `“${n.motto}”`) : null,
      h('div', { class: 'row wrap', style: 'justify-content:center' },
        n.out ? chip(`Out of the game (turn ${n.outTurn})`, { icon: 'white-flag', cls: 'bad' })
          : overlord ? chip(`Conquered by ${overlord.name} (turn ${n.conqueredTurn})`, { icon: 'white-flag', cls: 'bad' }) : chip('Independent', { icon: 'crown', cls: 'good' }),
        n.bot ? chip(`Bot · ${n.bot}`, { icon: 'robot' }) : null),
      themeBtn,
      n.id !== me.id ? h('div', { class: 'row wrap', style: 'justify-content:center' }, tagBar(app, n)) : btn('Edit my nation', { color: 'yellow', icon: 'pencil', onclick: () => app.go('me') })),

    h('div', { class: 'panel' },
      h('div', { class: 'stats', style: 'justify-content:space-around;font-size:1rem' },
        h('span', {}, emoji('classical-building'), citiesOwnedBy(s, n.id).length, ' cities'),
        h('span', {}, emoji('triangular-flag'), owned.length, ' lands'),
        h('span', {}, emoji('military-helmet'), troopsCommandedBy(s, n.id).length, ' troops'),
        h('span', {}, emoji('person-fencing'), `${st.duelsWon ?? 0}–${st.duelsLost ?? 0}`, ' duels'))),

    vassals.length ? h('div', { class: 'panel' }, h('b', {}, 'Conquered nations fighting for us'),
      h('div', { class: 'row wrap', style: 'margin-top:6px' }, vassals.map((v) => h('a', { href: `#/nation/${v.id}`, class: 'chip' }, logo(v, 's'), v.name)))) : null,

    owned.length ? h('div', { class: 'panel' }, h('b', {}, 'Territories'),
      h('div', { class: 'row wrap', style: 'margin-top:6px' }, owned.map((t) =>
        chip(t.name, { icon: t.isCapital ? 'castle' : t.isCity ? 'classical-building' : 'triangular-flag' })))) : null,

    h('div', { class: 'panel' }, h('b', {}, 'History'),
      history.length ? history.map((c) => h('div', { class: 'news' }, h('div', { class: 'turn' }, `Turn ${c.turn}`), emoji(eventIcon(c.kind), 's'), h('div', { class: 'grow' }, c.text)))
        : h('p', { class: 'muted' }, 'No history yet.'))));
}
