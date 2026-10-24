// Victory theme recorder: on-screen piano, computer keys and Web MIDI input. Captures note events, not audio.
import { h, btn, emoji } from '../ui/dom.js';
import { noteOn, preload, playTheme, noteName, audioContext } from './piano.js';
import { CONFIG } from '../engine/config.js';

const LOW = 48, HIGH = 84; // C3..C6
const BLACK = new Set([1, 3, 6, 8, 10]);
const COMPUTER_KEYS = 'awsedftgyhujkolp;'; // C4 upward

/**
 * @param {object|null} theme  existing { notes, ms }
 * @param {(theme|null) => void} onSave
 */
export function themeRecorder(theme, onSave) {
  let notes = theme?.notes ? theme.notes.map((x) => ({ ...x })) : [];
  let recording = false;
  let t0 = null;
  let stopTimer = null;
  let stopPlayback = null;
  const held = new Map(); // midi -> { voice, start, idx }
  const keyEls = new Map();

  const status = h('div', { class: 'small muted' });
  const timeline = h('div', { class: 'timeline' });
  const midiLine = h('div', { class: 'small muted row' }, emoji('musical-keyboard', 's'), 'Checking for MIDI keyboards…');
  const recBtn = btn('Record', { color: 'red', icon: 'record-button', onclick: () => (recording ? stopRec() : startRec()) });
  const playBtn = btn('Play', { color: 'teal', icon: 'play-button', onclick: () => play() });
  const clearBtn = btn('Clear', { color: 'gray', icon: 'wastebasket', sm: true, onclick: () => { notes = []; draw(); } });
  const saveBtn = btn('Save theme', { color: 'green', icon: 'check-mark-button', onclick: () => save() });

  const now = () => performance.now();

  function down(n, velocity = 0.8) {
    if (held.has(n)) return;
    const voice = noteOn(n, velocity);
    keyEls.get(n)?.classList.add('down');
    let idx = -1;
    if (recording) {
      if (t0 === null) {
        t0 = now();
        stopTimer = setTimeout(stopRec, CONFIG.THEME_MAX_MS);
      }
      notes.push({ n, t: Math.round(now() - t0), d: 0, v: Math.round(velocity * 100) / 100 });
      idx = notes.length - 1;
    }
    held.set(n, { voice, idx, start: now() });
  }

  function up(n) {
    const hd = held.get(n);
    if (!hd) return;
    held.delete(n);
    hd.voice.stop();
    keyEls.get(n)?.classList.remove('down');
    if (hd.idx >= 0 && notes[hd.idx]) notes[hd.idx].d = Math.round(now() - hd.start);
    draw();
  }

  function startRec() {
    audioContext();
    notes = [];
    t0 = null;
    recording = true;
    recBtn.lastChild.textContent = 'Stop';
    draw();
  }

  function stopRec() {
    if (!recording) return;
    clearTimeout(stopTimer);
    for (const n of [...held.keys()]) up(n);
    recording = false;
    recBtn.lastChild.textContent = 'Record';
    draw();
  }

  function play() {
    stopRec();
    if (stopPlayback) { stopPlayback(); return; }
    playBtn.lastChild.textContent = 'Stop';
    stopPlayback = playTheme({ notes }, { onEnd: () => { stopPlayback = null; playBtn.lastChild.textContent = 'Play'; } });
  }

  function save() {
    stopRec();
    const clean = notes.filter((x) => x.d > 0 || x.t >= 0).map((x) => ({ ...x, d: x.d || 200 }));
    onSave(clean.length ? { notes: clean, ms: Math.max(...clean.map((x) => x.t + x.d)) } : null);
  }

  function draw() {
    const ms = notes.length ? Math.max(CONFIG.THEME_MAX_MS / 4, ...notes.map((x) => x.t + (x.d || 200))) : CONFIG.THEME_MAX_MS;
    timeline.replaceChildren(...notes.map((x) => h('i', {
      style: `left:${(x.t / ms) * 100}%;width:${Math.max(1, ((x.d || 150) / ms) * 100)}%;top:${4 + ((HIGH - x.n) / (HIGH - LOW)) * 20}px`,
    })));
    const secs = notes.length ? (Math.max(...notes.map((x) => x.t + x.d)) / 1000).toFixed(1) : 0;
    status.replaceChildren(recording
      ? h('span', { class: 'row' }, h('span', { class: 'rec-dot' }), t0 === null ? 'Recording — play your first note to start the clock (10 s max)' : 'Recording…')
      : notes.length ? `${notes.length} notes · ${secs}s` : 'No theme yet. Press Record, then play up to 10 seconds.');
    playBtn.disabled = !notes.length;
  }

  // Keyboard UI
  const keys = h('div', { class: 'keys' });
  let whiteIndex = 0;
  for (let n = LOW; n <= HIGH; n++) {
    const isBlack = BLACK.has(n % 12);
    const el = h('div', { class: isBlack ? 'b' : 'w', 'data-n': n }, !isBlack && n % 12 === 0 ? noteName(n) : '');
    if (isBlack) el.style.left = `${whiteIndex * 44 - 14}px`;
    else whiteIndex++;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* fine without capture */ } down(n); });
    el.addEventListener('pointerup', () => up(n));
    el.addEventListener('pointercancel', () => up(n));
    el.addEventListener('lostpointercapture', () => up(n));
    keyEls.set(n, el);
    keys.append(el);
  }
  const piano = h('div', { class: 'piano' }, keys);
  requestAnimationFrame(() => { piano.scrollLeft = 7 * 44 - 8; });

  // Computer keys (desktop)
  const onKey = (e) => {
    if (e.repeat || e.target.closest?.('input,textarea,select')) return;
    const i = COMPUTER_KEYS.indexOf(e.key.toLowerCase());
    if (i < 0) return;
    if (e.type === 'keydown') down(60 + i); else up(60 + i);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // Web MIDI
  let midiAccess = null;
  const onMidi = (msg) => {
    const [st, n, vel] = msg.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && vel > 0) down(n, vel / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) up(n);
  };
  const hookInputs = () => {
    const names = [];
    midiAccess.inputs.forEach((input) => { input.onmidimessage = onMidi; names.push(input.name); });
    midiLine.replaceChildren(emoji('musical-keyboard', 's'),
      names.length ? `MIDI connected: ${names.join(', ')}` : 'No MIDI keyboard found. Plug one in, or use the keys below.');
  };
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then((access) => {
      midiAccess = access;
      hookInputs();
      access.onstatechange = hookInputs;
    }).catch(() => midiLine.replaceChildren(emoji('musical-keyboard', 's'), 'MIDI access was blocked. You can still use the on-screen piano.'));
  } else {
    midiLine.replaceChildren(emoji('musical-keyboard', 's'), 'This browser has no Web MIDI (try Chrome or Edge on a computer). Use the on-screen piano.');
  }

  preload(LOW, HIGH).catch(() => {});
  draw();

  const el = h('div', { class: 'col' },
    midiLine,
    piano,
    h('div', { class: 'small muted' }, 'On a computer you can also play with the A–; row (A = middle C).'),
    timeline,
    status,
    h('div', { class: 'recbar' }, recBtn, playBtn, clearBtn, saveBtn));
  el.cleanup = () => {
    stopRec();
    stopPlayback?.();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    if (midiAccess) midiAccess.inputs.forEach((input) => { input.onmidimessage = null; });
  };
  return el;
}
