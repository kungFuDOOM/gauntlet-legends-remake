import { CODE_LENGTH, cleanCode, showCode } from './net.js';

// The online lobby: a panel to host or join a game by room code (opened from the PLAY ONLINE
// button the title screen draws), and a small status bar (room code, players, Leave) while online.

const CSS = `
#lobby button { font: bold 14px 'Trebuchet MS', sans-serif; color: #fff4d0; background: rgba(40,26,10,0.85);
  border: 2px solid #c89a3a; border-radius: 8px; padding: 9px 14px; cursor: pointer; touch-action: manipulation; }
#lobby button:hover { background: rgba(80,52,16,0.95); }
#lobby { position: fixed; inset: 0; z-index: 16; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); }
#lobby .box { background: #1a120a; border: 2px solid #c89a3a; border-radius: 12px; padding: 20px 22px; width: min(360px, 90vw);
  color: #f0e6d0; font: 14px 'Trebuchet MS', sans-serif; text-align: center; box-shadow: 0 8px 30px #000; }
#lobby h2 { margin: 0 0 6px; font: bold 22px Georgia, serif; color: #f2c14e; }
#lobby p { margin: 6px 0 14px; color: #c8b890; line-height: 1.35; }
#lobby .row { display: flex; gap: 8px; justify-content: center; margin: 8px 0; }
#lobby input { width: 150px; font: bold 22px monospace; letter-spacing: 4px; text-transform: uppercase; text-align: center;
  background: #0d0905; color: #ffe8a0; border: 2px solid #8a6a2a; border-radius: 8px; padding: 6px; }
#lobby .msg { min-height: 20px; margin-top: 10px; color: #ffb080; }
#lobby .close { background: transparent; border-color: #6a5a3a; color: #c8b890; margin-top: 8px; }
#online-bar { position: fixed; left: 50%; bottom: 6px; transform: translateX(-50%); z-index: 15; display: none; align-items: center; gap: 10px;
  background: rgba(20,14,6,0.85); border: 1px solid #c89a3a; border-radius: 16px; padding: 4px 6px 4px 14px;
  color: #f0e6d0; font: bold 13px 'Trebuchet MS', sans-serif; white-space: nowrap; }
#online-bar b { color: #ffe080; letter-spacing: 2px; }
#online-bar button { font: bold 12px sans-serif; color: #fff; background: #7a2a1a; border: 0; border-radius: 12px; padding: 4px 10px; cursor: pointer; }
#online-bar .host-tools { display: flex; gap: 6px; }
#online-bar .host-tools button { background: #3a3020; border: 1px solid #8a6a2a; }
#online-bar .host-tools button.on { background: #6a5010; }
`;

export class Lobby {
  // handlers: onHost(), onJoin(code), onLeave(), onKick(id), onLock()
  constructor(handlers) {
    this.h = handlers;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.id = 'lobby';
    this.panel.innerHTML = `
      <div class="box">
        <h2>Play online</h2>
        <p>Host a game and share its code with friends, or join a friend's game with theirs.</p>
        <div class="row"><button data-a="host">Host a game</button></div>
        <div class="row"><input maxlength="${CODE_LENGTH + 4}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"><button data-a="join">Join</button></div>
        <div class="msg"></div>
        <button class="close" data-a="close">Close</button>
      </div>`;
    document.body.appendChild(this.panel);
    this.input = this.panel.querySelector('input');
    this.msg = this.panel.querySelector('.msg');
    this.panel.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'host') { this.say('Creating a room...'); this.h.onHost(); }
      else if (a === 'join') this.join();
      else if (a === 'close' || e.target === this.panel) this.close();
    });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(); if (e.key === 'Escape') this.close(); });
    this.input.addEventListener('input', () => { this.input.value = cleanCode(this.input.value); });
    // keep the game from reacting to taps and keys aimed at the panel
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.bar = document.createElement('div');
    this.bar.id = 'online-bar';
    // built from text nodes only: nothing shown here is ever parsed as HTML
    this.barText = document.createElement('span');
    this.barCode = document.createElement('b');
    this.barRest = document.createElement('span');
    this.barText.append(this.barCode, this.barRest);
    this.tools = document.createElement('span'); // host only: Lock and Kick buttons
    this.tools.className = 'host-tools';
    this.toolsKey = '';
    const leave = document.createElement('button');
    leave.textContent = 'Leave';
    this.bar.append(this.barText, this.tools, leave);
    leave.addEventListener('click', () => this.h.onLeave());
    this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(this.bar);
  }

  get isOpen() { return this.panel.style.display === 'flex'; }

  open() {
    this.panel.style.display = 'flex';
    this.say('');
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.panel.style.display = 'none';
    this.input.blur();
  }

  join() {
    const code = cleanCode(this.input.value);
    if (code.length !== CODE_LENGTH) { this.say(`Enter the ${CODE_LENGTH}-letter code from the host.`); return; }
    this.say('Connecting...');
    this.h.onJoin(code);
  }

  say(text) { this.msg.textContent = text; }

  // Called every frame: show the right pieces for the current screen.
  //   online: null | { role: 'host' | 'guest', code, players }
  update(state, online) {
    if (online && this.isOpen) this.close();
    const showBar = !!online && state !== 'play';
    if (this.bar.style.display !== (showBar ? 'flex' : 'none')) this.bar.style.display = showBar ? 'flex' : 'none';
    if (online) {
      const before = online.role === 'host' ? 'ROOM ' : 'ONLINE · room ';
      const after = online.role === 'host'
        ? ` · ${online.players ? `${online.players} friend${online.players === 1 ? '' : 's'} online` : 'share the code with friends'}`
        : '';
      const code = showCode(cleanCode(online.code));
      if (this.barText.firstChild !== this.barCode) this.barText.prepend(document.createTextNode(''));
      if (this.barText.firstChild.textContent !== before) this.barText.firstChild.textContent = before;
      if (this.barCode.textContent !== code) this.barCode.textContent = code;
      if (this.barRest.textContent !== after) this.barRest.textContent = after;
    }
    // host tools: Lock (no new players) and a Kick button per online player
    const guests = online && online.role === 'host' ? online.guests || [] : [];
    const key = online && online.role === 'host' ? `${online.locked}|${guests.map((g) => g.id + g.label).join(',')}` : '';
    if (key !== this.toolsKey) {
      this.toolsKey = key;
      this.tools.replaceChildren();
      if (online && online.role === 'host') {
        const lock = document.createElement('button');
        lock.textContent = online.locked ? '🔒 Locked' : 'Lock';
        lock.title = 'Stop new players from joining';
        if (online.locked) lock.className = 'on';
        lock.addEventListener('click', () => this.h.onLock());
        this.tools.append(lock);
        for (const g of guests) {
          const kick = document.createElement('button');
          kick.textContent = `Kick ${g.label}`;
          kick.addEventListener('click', () => this.h.onKick(g.id));
          this.tools.append(kick);
        }
      }
    }
  }
}
