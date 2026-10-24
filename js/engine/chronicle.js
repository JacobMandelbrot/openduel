// Turns engine events into Chronicle headlines.
export function headline(state, ev) {
  const n = (id) => state.nations.find((x) => x.id === id)?.name ?? 'Neutral land';
  const t = (id) => state.map.territories[id]?.name ?? '?';
  const list = (ids) => ids.map(n).join(' and ');
  switch (ev.kind) {
    case 'capture':
      return ev.battle
        ? `${n(ev.nation)} stormed ${t(ev.territory)}, destroying ${n(ev.victim)}'s troop.`
        : `${n(ev.nation)} marched into ${t(ev.territory)}, taking it from ${n(ev.victim)}.`;
    case 'claim': return `${n(ev.nation)} claimed ${t(ev.territory)}.`;
    case 'repelled': return `${n(ev.nation)} held ${t(ev.territory)} against ${list(ev.attackers)}.`;
    case 'bounce': return `${list(ev.attackers)} clashed over ${t(ev.territory)}; nobody advanced.`;
    case 'duel_called': return `A duel! ${list(ev.nations)} must fight for ${t(ev.territory)}.`;
    case 'duel_result': {
      const how = { concede: ' after a concession', rps: ' at rock-paper-scissors', admin: ' (admin ruling)' }[ev.method] ?? '';
      return `${n(ev.winner)} beat ${n(ev.loser)} in the duel for ${t(ev.territory)}${how}.`;
    }
    case 'duel_cancelled': return `The duel for ${t(ev.territory)} was called off.`;
    case 'cede': return `${n(ev.from)} ceded ${t(ev.territory)} to ${n(ev.to)}.`;
    case 'withdraw': return `${n(ev.nation)}'s troop pulled back from ${t(ev.from)} to ${t(ev.to)}.`;
    case 'disbanded': return `${n(ev.nation)}'s troop in ${t(ev.territory)} had nowhere to go and disbanded.`;
    case 'capital_occupied': return ev.conquered
      ? `${n(ev.nation)} is occupying ${n(ev.victim)}'s old capital ${t(ev.territory)}. If it's still there at the next resupply, ${n(ev.victim)} is out of the game.`
      : `${n(ev.nation)} is occupying ${n(ev.victim)}'s capital ${t(ev.territory)}. It falls at the next resupply unless it's retaken.`;
    case 'knocked_out': return `${n(ev.victim)} is out of the game: ${n(ev.nation)} took its old capital ${t(ev.territory)}. Its last troop now answers to ${n(ev.overlord)}.`;
    case 'conquest': return `${n(ev.victim)} has fallen! ${n(ev.nation)} took its capital ${t(ev.territory)}, and ${n(ev.victim)} now fights for ${n(ev.nation)}.`;
    case 'build': return `${n(ev.nation)} raised ${ev.count} new troop${ev.count > 1 ? 's' : ''}.`;
    case 'disband': return `${n(ev.nation)} disbanded ${ev.count} troop${ev.count > 1 ? 's' : ''}.`;
    case 'integrated': return `${t(ev.territory)} is now part of ${n(ev.nation)}.`;
    case 'game_won': return ev.reason === 'limit' ? `The turn limit is reached. ${n(ev.nation)} has the most cities and wins the game!`
      : ev.reason === 'admin' ? `The game was ended early. ${n(ev.nation)} has the most cities and wins!`
        : `${n(ev.nation)} holds ${ev.target ?? 'enough'} cities at a resupply and wins the game!`;
    case 'game_draw': return `The remaining nations — ${list(ev.nations)} — agreed to a draw.`;
    default: return ev.text ?? ev.kind;
  }
}

export function record(state, ev) {
  const nations = [ev.nation, ev.victim, ev.winner, ev.loser, ev.from, ev.to, ...(ev.attackers || []), ...(ev.nations || [])]
    .filter((x) => x != null);
  const entry = { turn: state.turn, kind: ev.kind, text: headline(state, ev), nations: [...new Set(nations)], territory: ev.territory ?? null };
  state.chronicle.push(entry);
  return entry;
}
