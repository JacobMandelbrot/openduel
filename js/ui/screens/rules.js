// Rules page: renders the player-facing part of DESIGN.md, so rules and engine share one source of truth.
import { h } from '../dom.js';
import { renderMarkdown } from '../../markdown.js';

let cache = null;

export function render() {
  const body = h('div', { class: 'md' }, h('p', { class: 'muted' }, 'Loading rules…'));
  const load = cache ? Promise.resolve(cache) : fetch('DESIGN.md', { cache: 'no-cache' }).then((r) => r.text()).then((t) => (cache = t));
  load.then((text) => {
    const start = text.indexOf('<!-- rules:start -->'), end = text.indexOf('<!-- rules:end -->');
    body.innerHTML = renderMarkdown(text.slice(start, end));
  }).catch(() => { body.innerHTML = '<p>Could not load DESIGN.md. Open the app through <code>node tools/serve.mjs</code>.</p>'; });
  body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').startsWith('#/')) return;
    e.preventDefault();
    body.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
  });
  return h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon blue' }, 'Rules'),
    h('div', { class: 'panel' }, body)));
}
