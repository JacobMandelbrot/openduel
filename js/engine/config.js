// Every tunable number in the game. DESIGN.md "Numbers" must match this file.
export const CONFIG = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 16,
  HOME_REGION_SIZES: [2, 3, 3, 4, 4, 5],
  HOME_CITIES: 2,
  EXTRA_HOME_CITY_CHANCE: 0.25,
  NEUTRAL_SHARE: 0.5, // default share of territories that start neutral (setting: 0.2–0.75)
  NEUTRAL_SHARE_MIN: 0.2,
  NEUTRAL_SHARE_MAX: 0.75,
  WIN_SHARE: 0.4, // default share of all cities needed to win (setting: 0.25–0.75)
  WIN_SHARE_MIN: 0.25,
  WIN_SHARE_MAX: 0.75,
  TURN_LIMIT: 50, // suggested turn limit when the (optional, off by default) limit is switched on
  MOUNTAIN_SHARE: 0.08, // impassable mountain territories, as a share of the playable territories
  ISLANDS_PER_PLAYER: 0.4,
  MAX_ISLANDS: 6,
  ISLAND_HOME_SHARE: 0.2,
  NEUTRAL_CITIES_PER_PLAYER: 0.75,
  CELLS_PER_TERRITORY: 6,
  BUILD_EVERY_TURNS: 3, // default; a game setting (1–6) chosen when the world is created
  BUILD_EVERY_MIN: 1,
  BUILD_EVERY_MAX: 6,
  MAX_BUILDS_PER_PHASE: 1,
  INTEGRATION_PHASES: 2,
  HOME_TURF_BONUS: 1,
  TROOP_CAP: 8,
  THEME_MAX_MS: 10000,
};


export const NATION_COLORS = [
  '#e8574f', '#3fa89a', '#4f9fe0', '#f2b632', '#5fbf3a', '#f27fb2', '#d9844e', '#8d6fd6',
  '#2e7d55', '#3559b8', '#a8323a', '#c98a12', '#58c4c9', '#a35aa6', '#7d8c3c', '#5b5f80',
];

export const EMBLEMS = [
  'lion', 'eagle', 'wolf', 'dragon', 'bear', 'fox', 'owl', 'horse', 'unicorn', 'shark', 'tiger-face',
  'deer', 'bison', 'rooster', 'swan', 'peacock', 'hedgehog', 'octopus', 'crab', 'scorpion', 'snake',
  'spouting-whale', 'bat', 'butterfly', 'honeybee', 'rose', 'sunflower', 'cherry-blossom', 'maple-leaf',
  'mushroom', 'fire', 'high-voltage', 'snowflake', 'sun', 'crescent-moon', 'glowing-star', 'gem-stone',
  'anchor', 'trident-emblem', 'dagger', 'bow-and-arrow', 'skull', 'crystal-ball', 'volcano', 'rainbow',
  'feather', 'dove', 'teddy-bear', 'polar-bear', 'penguin', 'frog', 'turtle', 'gorilla', 'mammoth',
  't-rex', 'dodo', 'flamingo', 'parrot', 'panda', 'raccoon', 'otter', 'boar', 'ram', 'elephant',
  'rhinoceros', 'rocket', 'japanese-castle', 'kangaroo', 'koala', 'crown', 'shield', 'castle',
];
