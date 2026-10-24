// Persistence adapter. The prototype keeps everything in this browser's localStorage.
// The online version replaces LocalStore with a Supabase-backed store with the same methods.
const KEY = 'openduel.game.v1';
const UNDO = 'openduel.undo.v1';
const PREFS = 'openduel.prefs.v1';
const UNDO_DEPTH = 8;

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

export const LocalStore = {
  load: () => read(KEY, null),
  save: (state) => write(KEY, state),
  clear() { try { localStorage.removeItem(KEY); localStorage.removeItem(UNDO); } catch { /* storage unavailable */ } },
  pushUndo(state) {
    const stack = read(UNDO, []);
    stack.push(state);
    while (stack.length > UNDO_DEPTH) stack.shift();
    if (!write(UNDO, stack)) write(UNDO, stack.slice(-2));
  },
  popUndo() {
    const stack = read(UNDO, []);
    const prev = stack.pop() ?? null;
    write(UNDO, stack);
    return prev;
  },
  undoDepth: () => read(UNDO, []).length,
  prefs: () => read(PREFS, {}),
  setPrefs: (p) => write(PREFS, p),
};
