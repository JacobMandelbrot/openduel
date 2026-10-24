// Every way a player can change the game, as named actions. The host (or the offline app) runs them;
// in online play the actor is whoever sent the message, so nobody can act for another nation.
import * as G from './game.js';
import { sideOf } from './duels.js';
import { nationById } from './state.js';

const PATCHABLE = ['leader', 'motto', 'emblem', 'color', 'theme'];
const duelById = (s, id) => s.duels.find((d) => d.id === id);

export const ACTIONS = {
  // ---- Players (act as themselves) ----
  setOrder: { run: (s, me, troopId, order) => G.setOrder(s, me, troopId, order) },
  addCede: { run: (s, me, tid, to) => G.addCede(s, me, tid, to) },
  setSubmitted: { run: (s, me, value) => G.setSubmitted(s, me, value) },
  toggleBuild: { run: (s, me, tid) => G.toggleBuild(s, me, tid) },
  toggleDisband: { run: (s, me, troopId) => G.toggleDisband(s, me, troopId) },
  submitBuild: { run: (s, me) => G.submitBuild(s, me) },
  reportDuel: { run: (s, me, duelId, winnerSide) => G.reportDuel(s, duelId, me, winnerSide) },
  throwRps: { run: (s, me, duelId, choice) => G.throwRps(s, duelId, me, choice) },
  concedeDuel: {
    run: (s, me, duelId) => {
      const d = duelById(s, duelId);
      const side = d && sideOf(s, d, me);
      return side ? G.concedeDuel(s, duelId, side) : null;
    },
  },
  cedeContested: {
    run: (s, me, duelId, to) => {
      const d = duelById(s, duelId);
      if (!d || d.kind !== 'assault' || d.a.nation !== me || sideOf(s, d, me) !== 'a') return null;
      return G.cedeContested(s, d.territory, to);
    },
  },
  voteDraw: { run: (s, me, agree) => G.voteDraw(s, me, !!agree) },
  setTag: {
    run: (s, me, other, tag) => {
      if (!['friend', 'neutral', 'enemy'].includes(tag)) return null;
      (s.tags[me] ??= {})[other] = tag;
      return null;
    },
  },
  /** Everything about your nation except its name can change during the game. */
  updateNation: {
    run: (s, me, patch) => {
      const n = nationById(s, me);
      if (!n || !patch) return null;
      for (const k of PATCHABLE) if (k in patch) n[k] = patch[k];
      return null;
    },
  },

  // ---- Admin (the host, or the offline player) ----
  resolveTurn: { admin: true, run: (s) => G.resolveTurn(s) },
  settleAllBotDuels: { admin: true, run: (s) => G.settleAllBotDuels(s) },
  forceFinishBuild: { admin: true, run: (s) => G.forceFinishBuild(s) },
  endGameNow: { admin: true, run: (s) => G.endGameNow(s) },
  adminSettleDuel: { admin: true, run: (s, me, duelId, side) => G.adminSettleDuel(s, duelId, side) },
  adminRps: { admin: true, run: (s, me, duelId) => G.adminRps(s, duelId) },
  setSetting: { admin: true, run: (s, me, key, value) => { if (key === 'rpsOnly') s.settings.rpsOnly = !!value; return null; } },
  setBotStyle: { admin: true, run: (s, me, nationId, style) => { const n = nationById(s, nationId); if (n) n.bot = style || null; return null; } },
  fastForward: {
    admin: true,
    run: (s, me, turns) => {
      const target = s.turn + Math.min(20, Math.max(1, turns | 0));
      for (let guard = 0; guard < 500 && s.phase !== 'ended' && s.turn < target; guard++) {
        if (s.phase === 'orders') G.resolveTurn(s);
        else if (s.phase === 'duels') { for (const d of s.duels.filter((x) => x.status === 'pending' || x.status === 'disputed')) G.adminRps(s, d.id); }
        else if (s.phase === 'build') G.forceFinishBuild(s);
      }
      return null;
    },
  },
};

/** Run an action for `actor`. Admin actions need isAdmin. Returns the engine's report (or null). */
export function runAction(state, actor, isAdmin, name, args = []) {
  const a = ACTIONS[name];
  if (!a) throw new Error(`Unknown action ${name}`);
  if (a.admin && !isAdmin) throw new Error('Only the host can do that');
  return a.run(state, actor, ...args) ?? null;
}

/**
 * What one player is allowed to see: other nations' unresolved orders, build picks, private tags and
 * rock-paper-scissors throws are hidden (a hidden throw shows as 'hidden' so you know they've thrown).
 * The map is sent separately (it never changes during a game).
 */
export function viewFor(state, playerId) {
  const { map, ...rest } = state;
  const v = JSON.parse(JSON.stringify(rest));
  for (const id of Object.keys(v.orders)) {
    if (id !== playerId) v.orders[id] = { submitted: !!v.orders[id].submitted, troops: {}, cedes: [] };
  }
  v.tags = { [playerId]: v.tags?.[playerId] ?? {} };
  if (v.build) for (const id of Object.keys(v.build)) if (id !== playerId) v.build[id] = { ...v.build[id], chosen: [], disband: [] };
  for (const d of v.duels) for (const k of Object.keys(d.rps || {})) if (k !== playerId) d.rps[k] = 'hidden';
  return v;
}
