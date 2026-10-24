// Minimal Markdown → HTML for the rules page (headings, lists, tables, bold, code, links, rules).
import { escapeHtml } from './ui/dom.js';

export const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('<!--')) { i++; continue; }
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl} id="${slug(hm[2])}">${inline(hm[2])}</h${lvl}>`);
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      out.push(list(lines, () => i, (v) => { i = v; }, indentOf(line)));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*([-*]|\d+\.)\s|---)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const indentOf = (l) => l.match(/^\s*/)[0].length;

function list(lines, get, set, indent) {
  let i = get();
  const ordered = /^\s*\d+\./.test(lines[i]);
  const items = [];
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; if (i < lines.length && indentOf(lines[i]) >= indent && /^\s*([-*]|\d+\.)\s/.test(lines[i])) continue; break; }
    const ind = indentOf(l);
    if (ind < indent) break;
    const m = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (m && ind === indent) { items.push({ text: m[2], sub: '' }); i++; continue; }
    if (m && ind > indent) {
      set(i);
      items[items.length - 1].sub += list(lines, get, set, ind);
      i = get();
      continue;
    }
    if (items.length) { items[items.length - 1].text += ' ' + l.trim(); i++; continue; }
    break;
  }
  set(i);
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub}</li>`).join('')}</${tag}>`;
}
