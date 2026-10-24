// Duel controls shown in the map bubble when a duel marker is tapped: who's fighting, report the result,
// throw rock-paper-scissors, concede or cede, and the admin's ruling.
import { h, emoji, logo, btn, chip, select } from './dom.js';
import { OPEN, duelist, sideOf, THROWS } from '../engine/duels.js';
import { crownHolder } from '../engine/state.js';

const KIND = { assault: 'Duel for', swap: 'Clash at', claim: 'Claim duel for' };
const RPS_ICON = { rock: 'rps-rock', paper: 'rps-paper', scissors: 'rps-scissors' };

export const openDuelsAt = (s, tid) => s.duels.filter((d) => OPEN(d) && d.territory === tid);

export function duelBubble(app, tid) {
  return openDuelsAt(app.state, tid).map((d) => duelBlock(app, d));
}

function fighterLine(app, d, side) {
  const s = app.state;
  const fighter = s.nations.find((n) => n.id === duelist(s, d, side));
  const owner = s.nations.find((n) => n.id === d[side].nation);
  return h('div', { class: 'duel-side' },
    logo(fighter, 's'),
    h('div', { class: 'grow' },
      h('b', {}, fighter.leader, fighter.id === app.me.id ? ' (you)' : ''),
      h('small', {}, fighter.name, ' · ', d[side].role === 'defend' ? 'defending' : 'attacking',
        fighter.id !== owner.id ? ` for ${owner.name}` : '', crownHolder(s) === owner.id ? ' · 1 touch down (Crown)' : '')));
}

function duelBlock(app, d) {
  const s = app.state;
  const me = app.me;
  const t = s.map.territories[d.territory];
  const mySide = sideOf(s, d, me.id);
  const parts = [];

  parts.push(h('div', { class: 'bubble-title' }, emoji('crossed-swords', 's'), ` ${KIND[d.kind]} ${t.name}`,
    d.status === 'disputed' ? chip('Disputed', { cls: 'bad', icon: 'warning' }) : null));
  parts.push(fighterLine(app, d, 'a'), h('div', { class: 'duel-vs' }, 'vs'), fighterLine(app, d, 'b'));

  if (d.rpsRounds?.length) {
    parts.push(h('div', { class: 'row wrap' }, h('small', { class: 'muted' }, 'Ties so far:'), d.rpsRounds.map((r) =>
      h('span', { class: 'chip' }, emoji(RPS_ICON[r.a], 's'), 'vs', emoji(RPS_ICON[r.b], 's')))));
  }
  if (d.status === 'disputed') {
    const said = (id) => s.nations.find((x) => x.id === duelist(s, d, d.reports[id]))?.leader ?? '—';
    const [ia, ib] = [duelist(s, d, 'a'), duelist(s, d, 'b')];
    parts.push(h('div', { class: 'small' }, `They disagree: ${s.nations.find((n) => n.id === ia).leader} says ${said(ia)} won, ${s.nations.find((n) => n.id === ib).leader} says ${said(ib)} won. The admin decides below.`));
  }

  if (mySide) {
    const oppSide = mySide === 'a' ? 'b' : 'a';
    const reported = d.reports[me.id];
    const thrown = d.rps?.[me.id];
    const oppThrown = d.rps?.[duelist(s, d, oppSide)];
    if (!s.settings.rpsOnly) {
      parts.push(h('div', { class: 'small', style: 'font-weight:600' }, reported ? `You reported: ${reported === mySide ? 'you won' : 'you lost'}` : 'Fought it in person? Report the result:'),
        h('div', { class: 'bubble-acts' },
          btn('I won', { color: 'green', icon: 'trophy', sm: true, onclick: () => app.act('reportDuel', d.id, mySide) }),
          btn('I lost', { color: 'gray', sm: true, onclick: () => app.act('reportDuel', d.id, oppSide) })));
    }
    parts.push(h('div', { class: 'small', style: 'font-weight:600' }, thrown
      ? `You threw ${thrown}. Waiting for your opponent…`
      : oppThrown ? 'Your opponent has thrown. Your turn!' : s.settings.rpsOnly ? 'Throw rock-paper-scissors (secretly):' : 'Or settle it with rock-paper-scissors (both must throw):'),
    h('div', { class: 'bubble-acts' }, THROWS.map((x) => btn(x[0].toUpperCase() + x.slice(1),
      { color: thrown === x ? 'yellow' : 'white', icon: RPS_ICON[x], sm: true, disabled: !!thrown, onclick: () => app.act('throwRps', d.id, x) }))));
    const extra = [btn('Concede', { color: 'red', sm: true, icon: 'white-flag', onclick: () => {
      if (confirm('Concede this duel? You lose it, but your troop survives.')) app.act('concedeDuel', d.id);
    } })];
    if (d.kind === 'assault' && mySide === 'a' && d.a.nation === me.id) {
      const pick = select([['', 'Cede it to…'], ...s.nations.filter((n) => !n.vassalOf && n.id !== me.id).map((n) => [n.id, n.name])], '', (v) => {
        if (v && confirm(`Cede ${t.name} to ${s.nations.find((n) => n.id === v).name}? All duels for it are called off.`)) app.act('cedeContested', d.id, v);
      });
      pick.className = 'bubble-select';
      extra.push(pick);
    }
    parts.push(h('div', { class: 'bubble-acts' }, extra));
  } else {
    parts.push(h('div', { class: 'small muted' }, app.mode === 'local' ? 'Only these two players settle this duel. Switch "play as" to act for them.' : 'Only these two players settle this duel.'));
  }

  const nm = (side) => s.nations.find((n) => n.id === duelist(s, d, side)).leader;
  if (app.isAdmin) parts.push(h('details', {},
    h('summary', { class: 'small muted', style: 'cursor:pointer' }, 'Admin ruling'),
    h('div', { class: 'bubble-acts', style: 'margin-top:6px' },
      btn(`${nm('a')} wins`, { sm: true, color: 'lime', onclick: () => app.act('adminSettleDuel', d.id, 'a') }),
      btn(`${nm('b')} wins`, { sm: true, color: 'lime', onclick: () => app.act('adminSettleDuel', d.id, 'b') }),
      btn('Random throws', { sm: true, color: 'yellow', icon: 'game-die', onclick: () => app.act('adminRps', d.id) }))));
  return h('div', { class: 'duel-block' }, parts);
}
