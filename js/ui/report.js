// Duel / build report popup; plays the winner's victory theme. (Turn results are drawn on the map instead.)
import { h, emoji, logo, btn } from './dom.js';
import { openModal } from './sheet.js';
import { victors } from '../engine/game.js';
import { playTheme } from '../audio/piano.js';

const ICON = {
  capture: 'crossed-swords', claim: 'triangular-flag', repelled: 'shield', bounce: 'collision', duel_called: 'person-fencing',
  duel_result: 'trophy', duel_cancelled: 'white-flag', cede: 'handshake', withdraw: 'footprints', disbanded: 'wastebasket',
  conquest: 'crown', capital_occupied: 'castle', knocked_out: 'white-flag', build: 'military-helmet', disband: 'wastebasket', integrated: 'classical-building', game_won: 'trophy', game_draw: 'handshake',
};
export const eventIcon = (kind) => ICON[kind] ?? 'scroll';

export function showReport(app, report) {
  const s = app.state;
  const me = app.me;
  const winners = victors(report.events).map((id) => s.nations.find((n) => n.id === id)).filter(Boolean);
  const featured = winners.find((n) => n.id === me.id && n.theme) ?? winners.find((n) => n.theme) ?? winners.find((n) => n.id === me.id) ?? winners[0];
  const stop = featured?.theme ? playTheme(featured.theme) : null; // the click that produced this report allows audio
  openModal((close) => h('div', { class: 'col' },
    h('div', { class: 'ribbon' }, report.title),
    featured ? h('div', { class: 'victory col', style: 'align-items:center;margin-bottom:10px' },
      logo(featured, 'xl'),
      h('h2', {}, featured.id === me.id ? 'Victory!' : `${featured.name} triumphs!`),
      winners.length > 1 ? h('div', { class: 'row wrap', style: 'justify-content:center' }, winners.filter((n) => n !== featured).map((n) => logo(n, 's'))) : null) : null,
    h('div', { class: 'col' }, report.events.length
      ? report.events.map((ev) => h('div', { class: 'news' }, emoji(eventIcon(ev.kind)), h('div', { class: 'grow' }, ev.text)))
      : h('p', { class: 'muted' }, 'Nothing changed.')),
    btn('Continue', { color: 'green', block: true, onclick: () => close() })), { onClose: () => stop?.() });
}
