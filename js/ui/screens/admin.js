// Admin / sandbox controls: restart, game options, fast-forward, bots, undo, save files.
import { h, emoji, logo, btn, field, toggle, select } from '../dom.js';
import * as G from '../../engine/game.js';
import { OPEN } from '../../engine/duels.js';
import { restartButtons } from '../restart.js';

export function render(app) {
  const s = app.state;
  const set = (key, value) => app.act('setSetting', key, value);

  const fastForward = (turns) => {
    app.act('fastForward', turns);
    app.toast(`Fast-forwarded to turn ${app.state.turn}`);
  };

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `openduel-turn${s.turn}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importSave = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const state = JSON.parse(await file.text());
      if (!state.map || !state.nations) throw new Error('Not an OpenDuel save');
      app.setState(state);
      app.toast('Save loaded');
    } catch (err) { app.toast(err.message); }
  } });

  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon' }, 'Admin'),
    h('div', { class: 'panel col' },
      h('h3', {}, emoji('counterclockwise-arrows-button'), ' Restart'),
      restartButtons(app)),

    h('div', { class: 'panel col' },
      h('h3', {}, emoji('gear'), ' Game options'),
      toggle('Rock-paper-scissors only (no in-person duels; every duel is thrown in the app)', !!s.settings.rpsOnly, (v) => set('rpsOnly', v))),

    h('div', { class: 'panel col' },
      h('h3', {}, emoji('hourglass-not-done'), ' Turn control'),
      h('div', { class: 'row wrap' },
        s.phase === 'orders' ? btn('Resolve turn now', { color: 'green', icon: 'hourglass-not-done', onclick: () => app.act('resolveTurn') }) : null,
        s.phase === 'duels' ? btn('Settle bot-vs-bot duels', { color: 'yellow', icon: 'robot', onclick: () => app.act('settleAllBotDuels') }) : null,
        s.phase === 'build' ? btn('Finish build phase', { color: 'yellow', icon: 'military-helmet', onclick: () => app.act('forceFinishBuild') }) : null,
        btn('Fast-forward 5 turns', { color: 'blue', icon: 'rocket', onclick: () => fastForward(5) }),
        s.phase !== 'ended' ? btn('End game now', { color: 'red', icon: 'trophy', onclick: () => {
          if (confirm('End the game now? The nation with the most cities wins.')) app.act('endGameNow');
        } }) : null),
      h('p', { class: 'small muted' }, 'Fast-forward settles every duel with random throws, including yours.')),

    h('div', { class: 'panel col' },
      h('h3', {}, emoji('robot'), ' Players'),
      h('p', { class: 'small muted' }, 'Switch any nation between human (you play it via "play as") and a bot style.'),
      s.nations.map((n) => h('div', { class: 'row' }, logo(n, 's'), h('div', { class: 'grow', style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, n.name),
        (() => {
          const sel = select([['', 'Human'], ['aggressive', 'Bot: aggressive'], ['defensive', 'Bot: defensive'], ['random', 'Bot: random']], n.bot ?? '',
            (v) => app.act('setBotStyle', n.id, v));
          sel.style.cssText = 'padding:6px;border-radius:10px;border:2px solid var(--outline);background:var(--paper)';
          return sel;
        })()))),

    h('div', { class: 'panel col' },
      h('h3', {}, emoji('floppy-disk'), ' Game file'),
      h('div', { class: 'row wrap' },
        btn('Undo last action', { color: 'white', icon: 'counterclockwise-arrows-button', onclick: () => app.undo() }),
        btn('Export save', { color: 'teal', icon: 'outbox-tray', onclick: exportSave }),
        btn('Import save', { color: 'teal', icon: 'inbox-tray', onclick: () => importSave.click() }), importSave),
      h('p', { class: 'small muted' }, `Seed “${s.seed}” · ${s.nations.length} nations · ${s.map.territories.length} territories`))));
}
