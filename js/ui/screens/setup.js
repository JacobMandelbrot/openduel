// Home: create your nation, then host a room, join one by code, or play offline against bots.
import { h, emoji, logo, btn, field, toggle, emojiSrc } from '../dom.js';
import { CONFIG, NATION_COLORS, EMBLEMS } from '../../engine/config.js';
import * as G from '../../engine/game.js';
import { themeRecorder } from '../../audio/recorder.js';
import { createRoom, joinAsPlayer } from '../../room.js';
import { cleanCode } from '../../net.js';

let recorder = null;
export function leave() { recorder?.cleanup(); recorder = null; }

/** Name / leader / motto / emblem / colour inputs. Mutates `draft`, calls onchange. With lockName the name is shown, not editable. */
export function identityFields(draft, taken, onchange, { lockName = false } = {}) {
  const input = (key, placeholder, type = 'text') => h('input', { type, value: draft[key] ?? '', placeholder, maxlength: 60,
    oninput: (e) => { draft[key] = e.target.value; onchange(); } });
  const emblems = h('div', { class: 'grid-pick' });
  const drawEmblems = () => emblems.replaceChildren(...EMBLEMS.map((e) => h('button', {
    type: 'button', class: draft.emblem === e ? 'on' : '', title: e.replace(/-/g, ' '),
    onclick: () => { draft.emblem = e; drawEmblems(); onchange(); },
  }, h('img', { src: emojiSrc(e), alt: e }))));
  drawEmblems();
  const swatches = h('div', { class: 'swatches' });
  const drawSwatches = () => swatches.replaceChildren(...NATION_COLORS.map((c) => h('button', {
    type: 'button', style: `background:${c}`, title: c,
    class: `${draft.color === c ? 'on' : ''} ${taken.some((n) => n.color === c) ? 'taken' : ''}`,
    onclick: () => { draft.color = c; drawSwatches(); onchange(); },
  })));
  drawSwatches();
  return h('div', { class: 'col' },
    lockName
      ? h('div', { class: 'field' }, 'Nation name', h('div', { class: 'small muted' }, `${draft.name} — the name is set for the whole game.`))
      : field('Nation name', input('name', 'The Kingdom of …')),
    field('Your name (shown under the nation)', input('leader', 'Your name')),
    field('Motto', input('motto', 'Fortune favours the bold.')),
    h('div', { class: 'field' }, 'Emblem', emblems),
    h('div', { class: 'field' }, 'Colour', swatches));
}

export function update() { /* keep the form while room messages arrive */ }

/** "Cities resupply every 3 turns" slider (1–6). */
export function resupplySlider(value, onchange) {
  const label = h('b', {}, value);
  const hint = h('span', { class: 'small muted' });
  const say = (v) => { label.textContent = v; hint.textContent = v === 1 ? ' (every turn)' : ` (${v - 1} plain turn${v - 1 === 1 ? '' : 's'}, then one with a build stage)`; };
  say(value);
  return h('div', { class: 'field' }, h('span', {}, 'Cities resupply every ', label, ' turns', hint),
    h('input', { type: 'range', min: CONFIG.BUILD_EVERY_MIN, max: CONFIG.BUILD_EVERY_MAX, step: 1, value,
      oninput: (e) => say(+e.target.value), onchange: (e) => onchange(+e.target.value) }));
}

/** "Win with 40% of all cities" slider. */
export function winSlider(value, onchange) {
  const label = h('b', {}, `${Math.round(value * 100)}%`);
  return h('div', { class: 'field' }, h('span', {}, 'Win with ', label, ' of all cities', h('span', { class: 'small muted' }, ' (checked when cities resupply)')),
    h('input', { type: 'range', min: CONFIG.WIN_SHARE_MIN * 100, max: CONFIG.WIN_SHARE_MAX * 100, step: 5, value: Math.round(value * 100),
      oninput: (e) => { label.textContent = `${e.target.value}%`; }, onchange: (e) => onchange(+e.target.value / 100) }));
}

/** Optional turn limit (off by default). When on, the most cities after the last turn wins. */
export function turnLimitControl(value, onchange) {
  let current = value || CONFIG.TURN_LIMIT;
  const label = h('b', {}, current);
  const slider = h('input', { type: 'range', min: 10, max: 100, step: 5, value: current, disabled: !value,
    oninput: (e) => { label.textContent = e.target.value; }, onchange: (e) => { current = +e.target.value; onchange(current); } });
  const row = h('div', { class: 'field', style: value ? '' : 'opacity:.5' }, h('span', {}, 'Last turn: ', label, h('span', { class: 'small muted' }, ' — then the most cities wins')), slider);
  return h('div', { class: 'col', style: 'gap:4px' },
    toggle('Turn limit', !!value, (on) => { slider.disabled = !on; row.style.opacity = on ? '' : '.5'; onchange(on ? current : 0); }),
    row);
}

/** "Neutral land: 50%" slider (share of territories that start unclaimed). */
export function neutralSlider(value, onchange) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const label = h('b', {}, pct(value));
  return h('div', { class: 'field' }, h('span', {}, 'Neutral land: ', label, h('span', { class: 'small muted' }, ' of the map starts unclaimed')),
    h('input', { type: 'range', min: CONFIG.NEUTRAL_SHARE_MIN * 100, max: CONFIG.NEUTRAL_SHARE_MAX * 100, step: 5, value: Math.round(value * 100),
      oninput: (e) => { label.textContent = `${e.target.value}%`; }, onchange: (e) => onchange(+e.target.value / 100) }));
}

/** Home: found your nation, then host a room, join one by code, or practise offline against bots. */
export function render(app, params = []) {
  const saved = app.prefs.profile ?? {};
  const draft = {
    name: saved.name ?? '', leader: saved.leader ?? '', motto: saved.motto ?? '',
    emblem: saved.emblem ?? EMBLEMS[Math.floor(Math.random() * 12)], color: saved.color ?? NATION_COLORS[0], theme: saved.theme ?? null,
  };
  const opts = { bots: 7, seed: Math.random().toString(36).slice(2, 8), rpsOnly: false, neutralShare: CONFIG.NEUTRAL_SHARE, buildEvery: CONFIG.BUILD_EVERY_TURNS, winShare: CONFIG.WIN_SHARE, turnLimit: 0, code: cleanCode(params[0] || '') };
  const preview = h('div', {});
  const drawPreview = () => preview.replaceChildren(h('div', { class: 'row' }, logo(draft, 'l'),
    h('div', {}, h('h2', { style: 'margin:0' }, draft.name || 'Your nation'), h('div', { class: 'muted' }, draft.leader || 'Your name'))));
  drawPreview();
  const botCount = h('b', {}, opts.bots);

  const profileReady = () => {
    if (!draft.name.trim() || !draft.leader.trim()) { app.toast('Give your nation a name and yourself a name first'); return false; }
    app.setPrefs({ profile: { ...draft } });
    return true;
  };
  const host = () => {
    if (!profileReady()) return;
    try { createRoom(app, { ...draft }, { rpsOnly: opts.rpsOnly }); app.go('lobby'); } catch (e) { app.toast(e.message); }
  };
  const join = () => {
    if (!profileReady()) return;
    if (opts.code.length !== 5) { app.toast('Enter the 5-character room code'); return; }
    try { joinAsPlayer(app, opts.code, { ...draft }); app.go('lobby'); } catch (e) { app.toast(e.message); }
  };
  const offline = () => {
    if (!profileReady()) return;
    app.room?.close();
    const players = [{ ...draft, bot: null }, ...G.fakePlayers(opts.seed, opts.bots, [draft])];
    try {
      const state = G.createGame({ seed: opts.seed, players, settings: { rpsOnly: opts.rpsOnly, neutralShare: opts.neutralShare, buildEvery: opts.buildEvery, winShare: opts.winShare, turnLimit: opts.turnLimit } });
      app.setPrefs({ playAs: state.nations[0].id });
      app.setState(state);
      app.go('map');
    } catch (e) {
      app.toast(e.message);
    }
  };
  const codeInput = h('input', { value: opts.code, placeholder: 'ABCDE', maxlength: 5, autocapitalize: 'characters', class: 'code-input',
    oninput: (e) => { opts.code = cleanCode(e.target.value); e.target.value = opts.code; } });

  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'col center', style: 'align-items:center' },
      emoji('person-fencing', 'xl'),
      h('h1', {}, 'OpenDuel'),
      h('p', { class: 'muted' }, 'Diplomacy face to face. Battles settled by real duels. Everyone plays on their own phone — no accounts, just a room code.')),
    h('div', { class: 'ribbon green' }, 'Your nation'),
    h('div', { class: 'panel col' }, preview, identityFields(draft, [], drawPreview), themeSection(draft, app)),
    h('div', { class: 'ribbon blue' }, 'Play'),
    h('div', { class: 'panel col' },
      h('h3', { style: 'margin:0' }, emoji('link', 's'), ' Join a game'),
      h('div', { class: 'row' }, codeInput, btn('Join', { color: 'green', icon: 'door', onclick: join })),
      h('p', { class: 'small muted', style: 'margin:0' }, 'Ask the host for the room code (or open their invite link).')),
    h('div', { class: 'panel col' },
      h('h3', { style: 'margin:0' }, emoji('crown', 's'), ' Host a game'),
      h('p', { class: 'small muted', style: 'margin:0' }, 'You get a room code to share. Your device runs the game, so keep this page open until you finish.'),
      toggle('Rock-paper-scissors only (no in-person duels)', opts.rpsOnly, (v) => { opts.rpsOnly = v; }),
      h('p', { class: 'small muted', style: 'margin:0' }, 'In the room you can add bots and set the map, resupply, win and turn-limit options.'),
      btn('Create a room', { color: 'teal', block: true, icon: 'crown', onclick: host })),
    h('details', { class: 'panel' },
      h('summary', { style: 'cursor:pointer;font-weight:600' }, emoji('robot', 's'), ' Practise offline against bots'),
      h('div', { class: 'col', style: 'margin-top:8px' },
        h('p', { class: 'small muted', style: 'margin:0' }, 'Everything runs on this device. Use the "play as" menu to control any nation.'),
        h('div', { class: 'field' }, h('span', {}, 'Bots: ', botCount),
          h('input', { type: 'range', min: CONFIG.MIN_PLAYERS - 1, max: CONFIG.MAX_PLAYERS - 1, value: opts.bots,
            oninput: (e) => { opts.bots = +e.target.value; botCount.textContent = opts.bots; } })),
        neutralSlider(opts.neutralShare, (v) => { opts.neutralShare = v; }),
        resupplySlider(opts.buildEvery, (v) => { opts.buildEvery = v; }),
        winSlider(opts.winShare, (v) => { opts.winShare = v; }),
        turnLimitControl(opts.turnLimit, (v) => { opts.turnLimit = v; }),
        field('Map seed (same seed = same world)', h('input', { value: opts.seed, oninput: (e) => { opts.seed = e.target.value || 'openduel'; } })),
        btn('Start offline game', { color: 'white', block: true, icon: 'world-map', onclick: offline })))));
}

/** Optional victory theme, recorded on the piano or a MIDI keyboard. The recorder (and the MIDI permission prompt) only loads when opened. */
export function themeSection(draft, app, onSave) {
  const status = h('span', { class: 'small muted' }, draft.theme ? ' — recorded' : ' — optional');
  const box = h('div', { class: 'col', style: 'margin-top:8px' });
  const details = h('details', { ontoggle: () => {
    if (!details.open || recorder) return;
    recorder = themeRecorder(draft.theme, (theme) => {
      draft.theme = theme;
      onSave?.(theme);
      status.textContent = theme ? ' — recorded' : ' — optional';
      app.toast(theme ? 'Victory theme saved' : 'Theme cleared');
    });
    box.replaceChildren(h('p', { class: 'small muted', style: 'margin:0' }, 'Play up to 10 seconds. It plays whenever your nation wins a battle.'), recorder);
  } }, h('summary', { style: 'cursor:pointer;font-weight:600' }, emoji('musical-notes', 's'), ' Victory theme', status), box);
  return details;
}
