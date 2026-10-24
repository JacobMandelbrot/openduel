// Bottom sheet (phone-friendly) and centred modal, both framed with the pack's panel.
import { h } from './dom.js';

let current = null;

export function closeSheet() {
  if (!current) return;
  const { back, sheet, onClose } = current;
  current = null;
  back.classList.remove('show');
  sheet.classList.remove('show');
  setTimeout(() => { back.remove(); sheet.remove(); }, 220);
  onClose?.();
}

export function openSheet(content, { onClose } = {}) {
  if (current) { current.onClose = null; closeSheet(); }
  const back = h('div', { class: 'sheet-back', onclick: closeSheet });
  const sheet = h('div', { class: 'sheet' }, h('div', { class: 'panel' }, h('div', { class: 'grab' }), content));
  document.body.append(back, sheet);
  requestAnimationFrame(() => { back.classList.add('show'); sheet.classList.add('show'); });
  current = { back, sheet, onClose };
  return closeSheet;
}

export const sheetOpen = () => !!current;

export function openModal(content, { onClose, dismissable = true } = {}) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); onClose?.(); };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(h('div', { class: 'modal panel' }, typeof content === 'function' ? content(close) : content));
  document.body.append(back);
  return close;
}

let toastTimer;
export function toast(text, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}
