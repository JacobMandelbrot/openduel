// Edit the nation you're playing as: everything except its name can change during the game.
// The screen keeps its DOM while other players' moves arrive, so typing or recording isn't interrupted.
import { h, logo, btn } from '../dom.js';
import { identityFields, themeSection, leave as leaveSetup } from './setup.js';

export function leave() { leaveSetup(); }
export function update() { /* keep the form as it is while the game changes around it */ }

export function render(app) {
  const s = app.state;
  const me = app.me;
  const draft = { name: me.name, leader: me.leader, motto: me.motto, emblem: me.emblem, color: me.color, theme: me.theme };
  const preview = h('div', {});
  const drawPreview = () => preview.replaceChildren(h('div', { class: 'row' }, logo({ ...me, ...draft }, 'l'),
    h('div', {}, h('h2', { style: 'margin:0' }, me.name), h('div', { class: 'muted' }, draft.leader))));
  drawPreview();
  const taken = s.nations.filter((n) => n.id !== me.id);
  leaveSetup();

  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon green' }, 'My nation'),
    h('div', { class: 'panel col' },
      preview,
      identityFields(draft, taken, drawPreview, { lockName: true }),
      themeSection(draft, app, (theme) => app.act('updateNation', { theme })),
      btn('Save changes', { color: 'green', block: true, icon: 'floppy-disk', onclick: () => {
        const { leader, motto, emblem, color } = draft;
        app.act('updateNation', { leader, motto, emblem, color });
        app.toast('Saved');
      } }))));
}
