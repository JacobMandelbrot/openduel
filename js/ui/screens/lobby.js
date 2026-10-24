// Room lobby: the host shares the code and starts the game; players wait here (or pick their nation to rejoin).
import { h, emoji, logo, btn, toggle } from '../dom.js';
import { neutralSlider, resupplySlider, winSlider, turnLimitControl } from './setup.js';

let refs = null;

export function render(app) {
  const room = app.room;
  if (!room) { app.go('setup'); return h('div'); }
  if (app.state && app.me) { setTimeout(() => app.go('map')); return h('div'); }
  refs = { status: h('div'), list: h('div', { class: 'list' }), controls: h('div', { class: 'col' }), pick: h('div', { class: 'col' }) };
  const link = `${location.origin}${location.pathname}#/join/${room.code}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'OpenDuel', text: `Join my OpenDuel game: room ${room.code}`, url: link });
      else { await navigator.clipboard.writeText(link); app.toast('Invite link copied'); }
    } catch { /* cancelled */ }
  };

  if (room.role === 'host') {
    const botCount = h('b', {}, room.lobby?.bots ?? 0);
    const slider = h('input', { type: 'range', min: 0, max: 15, value: room.lobby?.bots ?? 0,
      oninput: (e) => { botCount.textContent = e.target.value; }, onchange: (e) => room.setBots(+e.target.value) });
    refs.controls.append(
      h('div', { class: 'field' }, h('span', {}, 'Fill empty seats with bots: ', botCount), slider),
      neutralSlider(room.lobby?.neutralShare ?? 0.5, (v) => room.setNeutral(v)),
      resupplySlider(room.lobby?.buildEvery ?? 3, (v) => room.setBuildEvery(v)),
      winSlider(room.lobby?.winShare ?? 0.4, (v) => room.setWinShare(v)),
      turnLimitControl(room.lobby?.turnLimit ?? 0, (v) => room.setTurnLimit(v)),
      toggle('Rock-paper-scissors only (no in-person duels)', !!room.lobby?.rpsOnly, (v) => room.setLobbyRps(v)),
      btn('Start the game', { color: 'green', block: true, icon: 'crossed-swords', onclick: () => {
        try { room.start(); app.go('map'); } catch (e) { app.toast(e.message); }
      } }),
      btn('Close the room', { color: 'gray', sm: true, onclick: () => { if (confirm('Close this room? Players will be disconnected.')) { room.close(); app.go('setup'); } } }));
  } else {
    refs.controls.append(btn('Leave', { color: 'gray', sm: true, onclick: () => { room.close(); app.go('setup'); } }));
  }

  const el = h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'ribbon teal' }, room.role === 'host' ? 'Your room' : 'Room'),
    h('div', { class: 'panel col center', style: 'align-items:center' },
      h('div', { class: 'small muted' }, 'Room code'),
      h('div', { class: 'room-code' }, room.code),
      room.role === 'host' ? h('div', { class: 'row wrap', style: 'justify-content:center' },
        btn(navigator.share ? 'Share invite' : 'Copy invite link', { color: 'teal', sm: true, icon: 'link', onclick: share })) : null,
      refs.status),
    refs.pick,
    h('div', { class: 'panel col' }, h('b', {}, 'Nations in the room'), refs.list),
    h('div', { class: 'panel col' }, refs.controls)));
  update(app);
  return el;
}

export function update(app) {
  const room = app.room;
  if (!room || !refs) return;
  if (app.state && app.me) { app.go('map'); return; }
  const lobby = room.lobby;
  refs.status.replaceChildren(h('div', { class: 'small' },
    h('span', { class: `dot ${room.connected ? 'on' : ''}` }), ' ',
    room.connected ? (room.role === 'host' ? 'Room is open. Players can join now.' : lobby ? 'Connected. Waiting for the host to start…' : 'Connected.')
      : room.error ? room.error : room.role === 'host' ? 'Opening the room…' : 'Connecting to the host…'));
  refs.list.replaceChildren(...[
    ...(lobby?.players ?? []).map((p) => h('div', { class: 'item' },
      logo(p, 's'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name, p.host ? ' (host)' : ''), h('div', { class: 'sub' }, p.leader)),
      h('span', { class: `dot ${p.online ? 'on' : ''}`, title: p.online ? 'Connected' : 'Not connected' }))),
    lobby && lobby.bots ? h('div', { class: 'small muted' }, emoji('robot', 's'), ` + ${lobby.bots} bot${lobby.bots === 1 ? '' : 's'}`) : null,
    !lobby ? h('div', { class: 'small muted' }, 'Waiting for the room…') : null,
  ].filter(Boolean));
  if (room.role === 'player' && room.pick) {
    refs.pick.replaceChildren(h('div', { class: 'panel col' },
      h('b', {}, 'This game has already started'),
      h('p', { class: 'small muted', style: 'margin:0' }, room.pick.length ? 'If you were playing and lost your connection, pick your nation to carry on:' : 'Every nation is already being played.'),
      room.pick.map((n) => h('button', { class: 'item click', onclick: () => room.claim(n.id) }, logo(n, 's'),
        h('div', { class: 'grow', style: 'text-align:left' }, h('div', { class: 'title' }, n.name), h('div', { class: 'sub' }, n.leader))))));
  } else refs.pick.replaceChildren();
}

export function leave() { refs = null; }
