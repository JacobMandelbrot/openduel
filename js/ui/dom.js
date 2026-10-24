// Tiny hyperscript helper and shared visual builders. Every icon is a Fluent emoji image.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const emojiSrc = (name) => `assets/emoji/${name}.png`;
export const emoji = (name, cls = '') => h('img', { class: `emoji ${cls}`, src: emojiSrc(name), alt: '', draggable: 'false' });

export function logo(nation, size = '') {
  return h('div', { class: `logo ${size}`, style: `--c:${nation.color}`, title: nation.name },
    h('img', { src: emojiSrc(nation.emblem), alt: '' }),
    nation.vassalOf ? h('img', { class: 'vassal', src: emojiSrc('white-flag'), alt: 'conquered' }) : null);
}

export function btn(label, { color = '', icon, sm, block, disabled, onclick, title, cls = '' } = {}) {
  return h('button', { class: `btn ${color} ${sm ? 'sm' : ''} ${block ? 'block' : ''} ${cls}`, disabled, onclick, title, type: 'button' },
    icon ? emoji(icon, 's') : null, label);
}

export const sqbtn = (icon, { onclick, title, on } = {}) =>
  h('button', { class: `sqbtn ${on ? 'on' : ''}`, onclick, title, 'aria-label': title, type: 'button' }, h('img', { src: emojiSrc(icon), alt: '' }));

export const chip = (text, { icon, cls = '' } = {}) => h('span', { class: `chip ${cls}` }, icon ? emoji(icon, 's') : null, text);

export function field(label, input) {
  return h('label', { class: 'field' }, label, input);
}

export function toggle(label, checked, onchange) {
  return h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), h('span', { class: 'sw' }), label);
}

export function select(options, value, onchange) {
  const s = h('select', { onchange: (e) => onchange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
  return s;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Mix a hex colour with another by t (0..1). */
export function mix(a, b, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
