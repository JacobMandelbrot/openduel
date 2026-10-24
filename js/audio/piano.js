// Web Audio piano: samples every minor third (C, D#, F#, A); other notes are pitch-shifted ±1 semitone.
const PC = { C: 0, Ds: 3, Fs: 6, A: 9 };
const SAMPLES = [];
for (let oct = 0; oct <= 8; oct++) {
  for (const [name, pc] of Object.entries(PC)) {
    const midi = 12 * (oct + 1) + pc;
    if (midi >= 21 && midi <= 108) SAMPLES.push({ midi, file: `assets/piano/${name}${oct}.mp3` });
  }
}

let ctx = null;
let master = null;
const buffers = new Map(); // midi -> Promise<AudioBuffer>

export function audioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const nearest = (n) => SAMPLES.reduce((best, s) => (Math.abs(s.midi - n) < Math.abs(best.midi - n) ? s : best));

function load(sample) {
  if (!buffers.has(sample.midi)) {
    buffers.set(sample.midi, fetch(sample.file).then((r) => r.arrayBuffer()).then((b) => audioContext().decodeAudioData(b)));
  }
  return buffers.get(sample.midi);
}

export function preload(lo = 48, hi = 84) {
  const set = new Set();
  for (let n = lo; n <= hi; n++) set.add(nearest(n));
  return Promise.all([...set].map(load));
}

/** Start a note now (or at `when` in context time). Returns { stop(at) }. */
export function noteOn(n, velocity = 0.8, when = 0) {
  const c = audioContext();
  const sample = nearest(n);
  const voice = { src: null, gain: null, stopped: false, stopAt: null };
  load(sample).then((buf) => {
    if (voice.stopped && voice.stopAt === null) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 2 ** ((n - sample.midi) / 12);
    const g = c.createGain();
    g.gain.value = 0.25 + 0.75 * velocity;
    src.connect(g).connect(master);
    const t = Math.max(when, c.currentTime);
    src.start(t);
    voice.src = src; voice.gain = g;
    if (voice.stopAt !== null) release(voice, voice.stopAt);
  });
  return {
    stop(at = 0) {
      voice.stopped = true;
      if (voice.src) release(voice, at);
      else voice.stopAt = at;
    },
  };
}

function release(voice, at) {
  const t = Math.max(at || 0, ctx.currentTime);
  voice.gain.gain.setTargetAtTime(0, t, 0.08);
  voice.src.stop(t + 0.6);
}

/** Play a recorded theme. notes: [{ n, t, d, v }] in ms. Returns a stop() function. */
export function playTheme(theme, { onEnd } = {}) {
  if (!theme?.notes?.length) { onEnd?.(); return () => {}; }
  const c = audioContext();
  let cancelled = false;
  const voices = [];
  let timer;
  const lo = Math.min(...theme.notes.map((x) => x.n)), hi = Math.max(...theme.notes.map((x) => x.n));
  preload(lo, hi).then(() => {
    if (cancelled) return;
    const t0 = c.currentTime + 0.05;
    for (const x of theme.notes) {
      const v = noteOn(x.n, x.v ?? 0.8, t0 + x.t / 1000);
      v.stop(t0 + (x.t + Math.max(x.d, 80)) / 1000);
      voices.push(v);
    }
    const end = Math.max(...theme.notes.map((x) => x.t + x.d));
    timer = setTimeout(() => onEnd?.(), end + 400);
  });
  return () => {
    cancelled = true;
    clearTimeout(timer);
    voices.forEach((v) => v.stop());
    onEnd?.();
  };
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
