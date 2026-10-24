// Name generators for territories and fake nations.

/**
 * Short grid-style territory names in reading order (top row first, left to right):
 * a1, b1 … z1, then a2, b2 … — so a name also hints where it is on the map.
 */
export function nameTerritories(territories, rowHeight) {
  const order = territories.slice().sort((p, q) => Math.round(p.y / rowHeight) - Math.round(q.y / rowHeight) || p.x - q.x);
  order.forEach((t, i) => { t.name = String.fromCharCode(97 + (i % 26)) + (Math.floor(i / 26) + 1); });
}

const NATION_A = ['Amber', 'Iron', 'Crimson', 'Silver', 'Golden', 'Verdant', 'Azure', 'Ashen', 'Northern',
  'Sunlit', 'Misty', 'Thorned', 'Copper', 'Velvet', 'Storm', 'Hollow', 'Frosted', 'Gilded'];
const NATION_B = ['Dominion', 'Republic', 'Marches', 'Concord', 'League', 'Kingdom', 'Commonwealth',
  'Free Cities', 'Duchy', 'Compact', 'Union', 'Realm', 'Isles', 'Hegemony', 'Confederacy', 'Principality'];
const LEADERS = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Harper', 'Jordan', 'Kai', 'Logan',
  'Morgan', 'Noel', 'Parker', 'Quinn', 'Riley', 'Rowan', 'Sage', 'Taylor', 'Reese', 'Skyler', 'Jules', 'Marlow'];
const MOTTOS = ['Steel and patience.', 'We bend, we do not break.', 'First to the field.', 'Honour above all.',
  'The tide always returns.', 'Slow roots, tall trees.', 'Ask nicely. Then ask again.', 'Fortune favours the bold.',
  'Never the first blow.', 'One touch is enough.', 'Hold the line.', 'From ashes, embers.', 'Smile, then strike.',
  'Our word is our wall.', 'Fear the quiet ones.', 'Every border a promise.'];

export function botIdentity(rng, usedNames) {
  let name;
  let guard = 0;
  do {
    name = `The ${rng.pick(NATION_A)} ${rng.pick(NATION_B)}`;
  } while (usedNames.has(name) && guard++ < 100);
  usedNames.add(name);
  return { name, leader: rng.pick(LEADERS) + ' (bot)', motto: rng.pick(MOTTOS) };
}
