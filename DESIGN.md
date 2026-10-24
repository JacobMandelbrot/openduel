# OpenDuel — Game Mechanics & Code Architecture

**This file is the single source of truth.** If the code and this file disagree, one of them is a bug.
Change the rules here first, then change the code. Every tunable number lives in
`js/engine/config.js` and is listed in the [Numbers](#numbers) table below — keep the two in sync.

The in-app **Rules** page renders the section between the `rules:start` / `rules:end` markers
straight from this file, so players always read the same rules the engine implements.

---

<!-- rules:start -->

## The rules in one minute

1. **Everyone runs a country** on their own phone. One person hosts; everyone else joins with the room code.
2. **Triangles are troops. Circles are cities.** The big circle is your capital.
3. **Each turn, tap each of your troops** and choose:
   - **Hold** — stay put.
   - **Move** — go next door. Moving onto an enemy troop is an **attack**.
   - **Support** — help a troop next to you (any country's) by adding +1.
4. **Everyone's moves happen at the same time.**
5. **Bigger number wins.** Each troop counts 1, each support +1, and defending your home land +1.
   - Attacker bigger → the defender's troop is destroyed and the attacker moves in.
   - Defender bigger → nothing happens.
   - **A tie → the two players duel for real** (or play rock-paper-scissors). The loser's troop is destroyed.
6. **Every 3 turns, cities resupply** (the game's creator can change this): you can keep one troop per city you own, and you get one new
   troop if you're short. Too many troops? You must remove some.
7. **Lose your capital and you're conquered** — you end up fighting for whoever took it. An enemy
   troop in your capital only takes it if it's still there when cities resupply, so you have time to
   win it back. If you're conquered and someone then takes your *old* capital, you're out.
8. **To win, own 40% of all the cities** when cities resupply (the game's creator can change the
   %). Or everyone left can agree to a draw. If the game has a turn limit, the most cities at the end
   wins.
9. **Make deals out loud.** Nothing forces anyone to keep a promise.

The rest of this page has the full details.

## How OpenDuel works

OpenDuel is a game of **diplomacy and duels**. Every player leads a nation. Everyone writes their
orders in secret, then all orders happen **at the same time**. When two sides are perfectly matched,
the fight is settled by a **real duel**, right there and then.

A game is played **in one session**, with everyone together, **each on their own phone**. There are
no accounts: one player **hosts a room** and everyone else **joins with the 5-letter room code** (or
the host's invite link). Bots can fill empty seats. There is no in-game chat and no alliance button:
alliances are made (and broken) by talking to each other, face to face.

## Your nation

When you join you create a nation:

- **Name** and **motto**.
- **Emblem** and **colour** — your emblem is your flag on the map.
- **Leader** — your own name, shown under the nation name.
- **Victory theme** (optional) — a short tune you play on the on-screen piano or a connected
  MIDI keyboard (up to 10 seconds). It plays whenever your nation **wins a battle**.

**Everything except the nation's name can be changed during the game** (leader, motto, emblem,
colour and victory theme). The name is fixed once the game starts.

You can also secretly tag every other nation as **friend**, **neutral** or **enemy**. Only you see
your tags, and the map can be tinted by them.

## The map

The world is a generated **continent with islands around it**, split into **territories**.

- **Sea routes** are the white dashed lines across the water. The two territories a route joins
  border each other: troops can move, attack and support across it. Every island has **at least
  two** routes, usually to two different landmasses, so an island can never be sealed off by
  blocking one crossing.
- Nations start in all kinds of places: some on the **coast**, some **landlocked** in the interior
  with neighbours on every side, and some on an **island**, reachable only by sea route.
- Each nation starts with a **home region** of 2–5 territories, all on the same landmass.
- Some territories are **cities**. Your **capital** is a city; on your screen it has a gold
  circle around it. Every nation starts with **2 home
  cities**; about **1 in 4** nations gets a third.
- **Neutral land:** by default about **half the map** starts unclaimed; whoever creates the game
  picks anywhere from 20% to 75%. Some neutral territories are cities worth racing for.
- **Mountains** (grey-brown land covered in peaks) are **impassable**: no troop can move, attack or
  support into them. They form small ranges in neutral land and never cut the map in two. About 1 in
  12 territories is mountains, on top of the neutral land.
- Territories are named like a grid, in reading order from the top-left: **a1, b1 … z1, a2, b2 …**
  (names can be hidden with the names button).
- You start with **one troop on each of your home cities**.

A territory belongs to whoever's troop last **ended a turn** in it. It stays yours when you leave,
until someone else ends a turn there.

## A turn

Each troop gets one order. Tap your troop and its **Hold / Move / Support** buttons appear right
above it on the map.

| Order | What it does |
|---|---|
| **Hold** | Stay and defend. Troops with no order hold. |
| **Move** | Go to a bordering territory. Moving into a territory with another nation's troop is an **attack**. |
| **Support** | Add +1 strength to a troop holding in, or moving into, a territory that **borders your troop**. You can support any nation's troop. |

You can also **cede** an empty territory you own to any nation; it changes hands at the end of the turn.

The turn ends when **every nation has submitted**, or when the admin resolves it (anyone who hasn't
submitted simply holds). Then all orders are resolved at once and shown on the map.

**Strength** = 1 for the troop + 1 for each support that isn't cut + any bonuses.

- **Home turf:** a troop defending a territory in **its own home region** gets **+1**.
- **Support is cut** if the supporting troop is attacked by another nation — unless the attack
  comes from the very territory the support is aimed at.
- One troop per territory. You can never attack your own troop, and your supports never count
  toward dislodging your own troop.

## Battles

For every attacked territory, compare the strongest attack with the defence:

- **Attack stronger:** the attacker moves in and the **defending troop is destroyed**.
- **Attack weaker:** nothing happens. The attacker stays where it was and **loses nothing**.
- **Exactly equal:** it's a **duel**. Both troops stay put until the duel is fought.
- **Two troops trying to enter the same empty territory** with equal strength: both bounce. Nobody
  is defending, so there's no duel.
- **Several attackers tie each other** but are stronger than the defender: they block each other,
  and the defender survives.
- **Several attackers all tie the defender:** the defender must duel **each** of them.
- **Two troops swapping places** with equal strength: they duel each other.

## Duels

When a turn produces duels, they are **fought right away, in person**, in the format the admin
chooses. Each duel shows on the map as a pulsing red **⚔** marker; the two players tap it to report
the result or throw rock-paper-scissors. The next turn starts once every duel is settled.

- **Reporting:** both sides report who won. If they agree, it's settled. If they disagree, the
  **admin decides**.
- **Rock-paper-scissors:** instead of fighting in person, the two duelists can settle it with
  digital rock-paper-scissors in the app. Each throws secretly; throwing means you agree to settle it
  this way. A tie means another round.
- **Who fights:** each side's nation leader — except a **conquered** player, who duels for their
  conqueror only when it's their own troop **attacking** (see [Conquest](#conquest)).
- **The loser's troop is destroyed** — whether they were attacking or defending.
  - Defender wins: the attacking troop is destroyed.
  - Attacker wins: the defending troop is destroyed and the attacker moves in.
  - Swap duel: the winner moves into the loser's territory.
- **Concede:** either side can give up instead of fighting. They lose the duel, but **their troop
  survives**: an attacker stays home; a defender pulls back to a bordering empty territory it owns
  (or is disbanded if there's none).
- **Cede:** the defender can instead **cede the territory to any nation** — an attacker or a
  third party. All duels for it are called off, the defender pulls back, and only the recipient's
  attacking troop (if it was one) moves in.
- **Several attackers:** the defender must win **every** duel to keep the territory. If exactly one
  attacker beats the defender, that attacker takes it. If more than one did, those attackers duel
  each other (winner stays on) and the last one standing takes it.
- **The Crown:** the nation with the **most cities** (no ties) wears the Crown and starts every
  duel **one touch down** (or the equivalent handicap in the admin's duel format).

**Rock-paper-scissors only (game option):** the admin can turn this on when creating the game or
later. There are no in-person duels: **every** duel is settled by rock-paper-scissors in the app.
The game moves on as soon as all duels have been thrown.

## Conquest

**Lose your capital and your nation is conquered** by whoever took it — by force, through a duel, or
because you ceded it.

**A capital only changes hands at the build stage** (when cities resupply). When an enemy troop
moves into your capital it is just **occupied**: it still counts as your city, it shows a dashed
ring in the occupier's colour, and everyone is told. If that enemy troop is **still standing in it
at the next build stage**, the capital falls and your nation is conquered. If you take it back, or
the enemy troop leaves, before then, nothing happens. Ceding your capital also takes effect at the
build stage.

- All your territories and troops pass to the **conqueror**.
- You keep command of **one troop only: the one closest to your fallen capital** (ties go to the
  older troop). Every other troop now takes the conqueror's orders. If you had no troops left, you
  have none.
- Your one troop belongs to the conqueror: whatever it takes counts toward the conqueror's cities,
  allowance and victory, never yours.
- You fight duels for the conqueror **only when your troop is the attacker**. When it is
  defending, the conqueror's leader fights.
- There is no way back: you can't win on your own, take land for yourself, regain independence or
  get more troops. If your troop is destroyed, you're out of moves (but still a nation in the
  Events list). New troops are always built by the conqueror.
- If your conqueror is later conquered, you (and everyone they conquered) now fight for the new
  conqueror.
- **One capital each.** However many nations it has conquered, a nation can only be conquered by
  losing **its own** capital.
- **Your old capital is your lifeline.** Once conquered, your old capital (now your conqueror's land)
  matters only to you: if another nation takes it — an enemy troop still standing in it at the build
  stage, as with any capital — **you are out of the game**. Your last troop then answers to your
  conqueror, and your conqueror is *not* conquered by it. Your conqueror losing your old capital
  costs them that city like any other.

## Building troops

Every **3 turns** by default, after that turn's moves and duels, there is a **build phase**
("resupply"). Whoever creates the game can set this to anything from every turn to every 6 turns.
With every 3 turns, turns 1 and 2 are plain and turn 3 ends with a build stage, and so on. The map always shows
the turn number and how many turns until the next resupply (which is also when a win is checked).

- Your troop allowance = the number of **cities** you own (at most **8**).
- **Over your allowance?** If you have more troops than cities, you must disband troops until you
  match it. Tap the troops to disband (they get a red outline); anything you don't pick is picked
  for you.
- **Under it?** Build **one** new troop this phase. Losing several troops takes several build
  phases to recover from.
- New troops appear only in **empty cities you own that can build**:
  - your **home cities**, and
  - **integrated** cities — conquered cities you've held through **2** build phases in a row.
  If none of your build cities are empty, the build is lost for this phase. Cities you can build in
  have a dashed outline; tap one to choose it (gold outline).
- Only independent nations build or disband. Conquered players' troops can be disbanded by their
  conqueror like any other.

## Ending the game and playing again

The game ends in one of two ways:

- **Victory:** a nation that controls **at least 40% of all cities** on the map **on a build turn**
  (when cities resupply, after any duels) wins. Whoever creates the game can set this anywhere from
  25% to 75%. Reaching it between build turns doesn't count — you have to keep it until the next
  resupply. The leaderboard shows how many cities it takes ("win at 12"), and the map shows when the
  next check is.
- **Turn limit (optional, off by default):** whoever creates the game can switch on a last turn
  (50 suggested, 10–100). After that turn (and its build stage, if it has one), the nation with the
  most cities wins, ties going to the most territories, then the most duels won. The map shows
  "Turn 12 of 50".
- **Draw:** any independent nation can **offer a draw**; when **every remaining independent
  nation agrees**, the game ends drawn. You can withdraw your agreement until then. Conquered
  nations don't vote.

(The admin can also end the game early; then the nation with the most cities wins, ties going to the
most territories, then the most duels won.)

Restarting is one tap: **new map, same nations** (everyone keeps their nation, colour and theme),
**same map again** from turn 1, or **start from scratch**.

The **Events** page records every capture, duel and treaty, and each nation's page keeps its own
history.

When a turn ends, its results are shown **on the map**: every nation's orders are revealed as
arrows in that nation's colour, stopped attacks end at a red bar, destroyed troops show as a faded
✕, and land that changed hands is outlined in gold. Tap **OK** to carry on.

## Fine print (exact resolution)

These are the precise rules the engine follows when orders interact:

1. **Bad orders become holds.** Moving to a non-bordering territory, or supporting a territory
   your troop doesn't border, counts as a hold.
2. **Mismatched supports are void.** A support for a move only counts if that troop really ordered
   that move. A support for a hold only counts if the troop there didn't order a move. A void
   support still leaves the supporter holding.
3. **Cutting happens before battles.** Any attack on a supporter — even one that fails — cuts it,
   except an attack from the territory it is supporting into.
4. **Defending a territory:**
   - A troop that holds defends with 1 + its hold supports + bonuses.
   - A troop whose move failed defends with 1 + bonuses (hold supports don't apply to it).
   - An empty territory defends with 0.
   - If the troop there leaves successfully, the territory is empty.
5. **Swaps:** when two troops try to swap places, the stronger one pushes through, then still has to
   beat anyone else entering that territory. With equal strength it's a swap duel, unless a third
   party destroys one of them first.
6. **Circular moves** (A→B→C→A) all succeed if nobody else interferes.
7. **A troop that's waiting on a duel** defends its own territory as a troop whose move failed. If it is
   destroyed there, its duel is called off.
8. **Ownership** updates at the end of each turn: every territory with a troop belongs to that
   troop's nation. Cedes apply after that, and only to territories that are still empty and owned
   by the ceder. Capitals are the exception — every independent nation's capital, and every
   conquered player's old capital (until that player is out): they change hands only at the build
   stage, to whichever enemy troop is standing in it then (or, if empty, to a nation it was ceded
   to). An independent capital falling conquers its nation; an old capital falling knocks out only
   the conquered player. Capitals are settled before the win check. If two nations hold each other's capitals at
   the same build stage, they are settled in nation order, so the first one settled wins.
9. **Duels made moot by conquest:** if a conquest makes both sides of a pending duel the
   same nation, the duel is called off.

<!-- rules:end -->

---

## Numbers

All live in `js/engine/config.js`.

| Constant | Value | Meaning |
|---|---|---|
| `MIN_PLAYERS` / `MAX_PLAYERS` | 4 / 16 | Nations per game |
| `HOME_REGION_SIZES` | 2,3,3,4,4,5 | Weighted pick for each home region's territory count (raised to fit its cities) |
| `HOME_CITIES` | 2 | Home cities per nation (also the starting troops) |
| `EXTRA_HOME_CITY_CHANCE` | 0.25 | Chance a nation gets a third home city |
| `NEUTRAL_SHARE` | 0.5 (0.2–0.75) | Share of territories that start neutral; a game setting (slider when creating a game) |
| `ISLANDS_PER_PLAYER` / `MAX_ISLANDS` | 0.4 / 6 | Islands per nation (at least 2, at most 6), each 2–4 territories |
| `WIN_SHARE` | 0.4 (0.25–0.75) | Share of all cities needed to win at a build stage; a game setting |
| `TURN_LIMIT` | 50 (10–100) | Suggested last turn when the optional turn limit is on (off by default) |
| `MOUNTAIN_SHARE` | 0.08 | Impassable mountain territories, as a share of the playable territories (added on top) |
| `ISLAND_HOME_SHARE` | 0.2 | Share of nations that start on an island (at least 1, if an island is big enough) |
| `NEUTRAL_CITIES_PER_PLAYER` | 0.75 | Neutral cities (rounded up) |
| `CELLS_PER_TERRITORY` | 6 | Average hex cells per territory |
| `BUILD_EVERY_TURNS` | 3 (1–6) | Default turns between build stages; a game setting (`settings.buildEvery`, slider when creating a game) |
| `MAX_BUILDS_PER_PHASE` | 1 | New troops per build phase |
| `INTEGRATION_PHASES` | 2 | Build phases a conquered city must be held to build there |
| `HOME_TURF_BONUS` | 1 | Defence bonus on your own home land |
| `TROOP_CAP` | 8 | Maximum troops per nation |
| `THEME_MAX_MS` | 10000 | Longest victory theme recording |

---

## Code architecture

### Principles

- **Plain JavaScript, ES modules, no build step.** Open `index.html` through any static server.
- **The engine is pure.** `js/engine/*` has no DOM, no storage and no `Date.now()`/`Math.random()`
  (randomness comes from a seeded RNG passed in). The same files run in the browser, in Node tests
  and, later, in a Supabase Edge Function.
- **State is one JSON object** (`GameState`). It is serialisable as-is; the UI never keeps game
  facts anywhere else.
- **Every change is a named action** (`js/engine/actions.js`). Offline, the app runs actions itself;
  online, players send them to the host, which runs them as that player.
- **Storage is behind an adapter** (`js/store.js`). The prototype uses `localStorage`; the online
  version swaps in a Supabase adapter without touching the engine or screens.

### Folder layout

```
index.html            App shell (loads js/main.js)
DESIGN.md             This file — rules + architecture (rules page renders part of it)
css/app.css           Styles; UI-pack images used as 9-slice border-images
assets/ui/…           Cozy UI Pack (dobo_ui) — panels, buttons, ribbons
assets/emoji/…        Microsoft Fluent 3D emoji subset (MIT, see LICENSE.txt) — all icons
assets/piano/…        Piano samples (every minor third) for the theme sampler
js/engine/            Pure game logic
  config.js           Tunable numbers, nation colours and emblems
  rng.js              Seeded RNG (mulberry32)
  names.js            Territory/nation/leader/motto name generators
  mapgen.js           Hex continent + islands → territories → sea routes → home regions → cities
  adjudicate.js       Order validation + simultaneous resolution (one turn)
  state.js            Shared state helpers: ownership, conquest, withdraw, standings, Crown
  duels.js            Duel reporting, rock-paper-scissors, conceding, ceding, group outcomes
  builds.js           Build phase: allowances, integration, sites, resistance
  bots.js             Fake-player order + build generation
  chronicle.js        Event → headline text
  game.js             Game lifecycle: create, rematch, submit, resolve, phases, game end
js/store.js           Persistence adapter (localStorage; the host's copy of an online game lives here too)
js/net.js             Peer-to-peer connections (PeerJS over WebRTC): host a room code, join one
js/room.js            Online rooms: lobby, seats, sending each player their view, reconnects
js/main.js            Boot, router, global app object; modes local / host / player
js/engine/actions.js  Named actions with permissions, and viewFor() (what one player may see)
js/ui/screens/lobby.js Room lobby: code + invite link, who's joined, bots, start
js/ui/dom.js          Tiny hyperscript helper + emoji/logo/button builders
js/ui/mapview.js      SVG map renderer with pan/zoom/tap
js/ui/sheet.js        Bottom sheet / modal
js/ui/screens/*.js    One module per route (map, nations, nation, chronicle, rules, admin, setup, me)
js/ui/duel-bubble.js  Duel controls shown above a duel marker on the map (report, RPS, concede, cede, admin)
js/ui/report.js       Duel/build report popup (turn results are drawn on the map instead)
js/ui/restart.js      Restart: new map same nations, same map again, or from scratch
js/audio/piano.js     Web Audio sampler (pitch-shifts nearest sample)
js/audio/recorder.js  Theme recorder: on-screen piano + Web MIDI input
js/markdown.js        Minimal Markdown renderer for the rules page
tests/engine.test.mjs Node tests for the adjudicator, duels and builds (`node --test tests/`)
tools/serve.mjs       Zero-dependency static server (`node tools/serve.mjs`)
```

### GameState (shape)

```js
{
  version: 1, seed, turn, phase,            // phase: 'orders' | 'duels' | 'build' | 'ended'
  settings: { rpsOnly, neutralShare, buildEvery, winShare, turnLimit },   // turnLimit 0 = no limit
  result: null | { kind: 'win', nation, reason: 'cities' | 'limit' | 'admin' } | { kind: 'draw', nations },
  drawVotes: { [nationId]: true },          // independent nations currently agreeing to a draw
  map: {                                    // static after creation
    cols, rows, hex, width, height,         // hex = cell radius in map units
    cells: [{ id, col, row, x, y, t }],     // land cells only; t = territory id
    territories: [{ id, name, cells, neighbors, landNeighbors, landmass, coastal, anchor, x, y,
                    isCity, isCapital, homeOf, impassable }],   // impassable = mountains (no neighbours)   // neighbors include sea routes; landmass 0 = the continent
    routes: [{ a, b, x1, y1, x2, y2 }],     // sea routes between territories a and b (drawn as white lines)
    deco: [{ x, y, kind }],                 // decorative trees/mountains/waves (emoji)
  },
  nations: [{ id, name, leader, motto, emblem, color,
              theme: null | { notes: [{ n, t, d, v }], ms },   // midi note, start ms, length ms, velocity
              bot: null | 'aggressive' | 'defensive' | 'random',
              home: [territoryIds], capital,
              vassalOf: null | nationId, conqueredTurn }],     // vassalOf always points at an independent nation
  terr: { [territoryId]: { owner, held, heldBy } },   // held = consecutive build phases held (cities)
  troops: [{ id, nation, cmd, at }],        // nation = owner (always independent); cmd = player who orders it
  nextId,
  orders: { [playerId]: { submitted, troops: { [troopId]: Order }, cedes: [{ territory, to }] } },
  duels: [Duel],
  build: { [nationId]: { builds, disbands, sites, chosen: [tid], disband: [troopId] } } | null,
  tags: { [viewerNationId]: { [otherNationId]: 'friend' | 'neutral' | 'enemy' } },
  chronicle: [{ turn, kind, text, nations, territory }],
  stats: { [nationId]: { duelsWon, duelsLost, captures, losses } },
  report: { kind, turn, title, events } | null,  // kind 'turn' is shown on the map; others in a popup
  lastResolution: { turn, before: { [troopId]: { at, nation, cmd } }, orders, status, moved, destroyed, cut },
                                            // everything needed to replay the last turn on the map
}
```

`Order` = `{ type: 'hold' } | { type: 'move', to } | { type: 'support', target, from }`
(`from` = territory of the supported troop when supporting a move, `null` when supporting a hold).

`Duel` = `{ id, turn, kind: 'assault' | 'swap' | 'claim', territory, group, a, b, status, reports,
rps, rpsRounds, result, queue }`. `a`/`b` = `{ nation, troop, at, role: 'defend' | 'attack' }`.
In an assault, `a` is the defender. `status`: `'pending' | 'disputed' | 'settled' | 'cancelled'`.
`result` = `{ winner: 'a' | 'b', method: 'fought' | 'rps' | 'concede' | 'noshow' | 'admin' }`.
`reports` and `rps` are keyed by the **duelist's** player id (see `duelist()` in `duels.js`: an
attacking side is fought by the troop's commander, a defending side by its owning nation).

Players vs nations: every player founds one nation, so player ids and nation ids are the same.
A conquered player keeps their nation entry (name, emblem, theme, history) with `vassalOf` set,
and orders the troops whose `cmd` is their id.

### Turn pipeline

```
orders ──(all submitted / admin)──► adjudicate() ──► apply ──► duels? ──yes──► 'duels' phase
                                                                     │                 │ (fought in person; reports / admin)
                                                                     no                ▼
                                                                     └──────► afterCombat()
afterCombat: turn % settings.buildEvery == 0 ? settleCapitals → win check → startBuild() → 'build' → finishBuild() : nextTurn()
nextTurn: turn++, bots write orders, phase 'orders'
On a build turn, before resupply: a nation with > half of all cities → phase 'ended' (win).
voteDraw: when every independent nation agrees → phase 'ended' (draw).
```

With `settings.rpsOnly`, bot-vs-bot duels are thrown immediately and the `'duels'` phase lasts
only until the human duelists have thrown.

`adjudicate(map, terr, nations, troops, orders)` is a pure function returning
`{ moved, destroyed, duels, events }`. `game.js` applies the result to the state.

### Adjudication algorithm

1. Normalise every troop's order (default hold; invalid → hold; mismatched support → void).
2. Mark cut supports (attacked by another nation, except from the support's target).
3. Compute each move's strength (1 + counted supports) and defence strengths lazily.
4. Swaps first: equal → both fail and are flagged as a potential swap duel; unequal → the weaker
   fails and the stronger must beat the weaker's move strength at that territory.
5. Iterate over undecided moves until nothing changes. A move whose target's occupant is still
   undecided waits. Each decision follows the battle table above.
6. If a pass makes no progress, the remaining moves form cycles: resolve them as if the occupants leave.
7. Destroy dislodged defenders, cancel duels whose troops were destroyed, relocate winners, and
   update ownership.

### Bots (fake players)

`bots.js` gives each fake nation a style:
- **aggressive** — gangs up its own troops (mover + supporters) on beatable enemy troops, then grabs land.
- **defensive** — guards its cities, supports threatened neighbours, and expands only when safe.
- **random** — any valid order.

Bots also auto-place builds and disbands. In duels, a bot accepts whatever its human opponent
reports and throws a random rock-paper-scissors hand when its opponent throws. Bot-vs-bot duels are
settled by the admin (pick a winner, or "random throws").

### Online rooms (no backend)

The site is static files only. Online play is **peer-to-peer**: the **host's browser runs the game**
and players' browsers connect straight to it over WebRTC (PeerJS). PeerJS's free public broker only
introduces the browsers to each other; no game data is stored anywhere but the host's device.

- **Modes:** `local` (offline sandbox, "play as" any nation), `host` (owns the game, is the admin),
  `player` (joined by code; locked to one nation; sends actions, receives views).
- **Room code:** 5 characters (no look-alike letters). The host's PeerJS id is `openduel-room-<CODE>`.
- **Messages:** player → host `hello {token}`, `join {profile}`, `leave`, `claim {nationId}`,
  `act {name, args}`; host → player `welcome {you, started}`, `lobby`, `map` (once per game),
  `state {state, online}`, `pick {nations}`, `error`.
- **Secrets:** each player gets `viewFor(state, theirNation)`: other nations' unresolved orders,
  build picks, private tags and rock-paper-scissors throws are removed. (Resolved orders are public:
  they're drawn on the map after each turn.) A determined player could still read the host's own
  browser if they had the host's device; that's fine for a game played in person.
- **Seats:** a random token per browser tab identifies a player to the host. Reloading rejoins
  automatically. A player who lost their tab can **reclaim** their nation from the lobby screen as
  long as nobody is currently connected as it.
- **Host reloads:** the game is saved in the host's `localStorage`; reopening the page re-opens the
  same room code, and players reconnect on their own. The host must keep the page open for the game
  to continue.
- **Admin tools** (resolve now, settle bot duels, finish build phase, end game, restart, undo) are
  host-only.
- **Deploy:** any static host. Currently GitHub Pages (`tools/build.mjs` writes a slim `dist/`).

### Assets and credits

- UI: **Cozy UI Pack** by dobo_ui (itch.io).
- Icons and emblems: **Microsoft Fluent UI Emoji** (MIT licence, `assets/emoji/LICENSE.txt`). No hand-drawn icons.
- Piano samples copied from the PianoHunt prototype.
