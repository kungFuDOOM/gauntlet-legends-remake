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
#lobby input { width: 110px; font: bold 22px monospace; letter-spacing: 4px; text-transform: uppercase; text-align: center;
  background: #0d0905; color: #ffe8a0; border: 2px solid #8a6a2a; border-radius: 8px; padding: 6px; }
#lobby .msg { min-height: 20px; margin-top: 10px; color: #ffb080; }
#lobby .close { background: transparent; border-color: #6a5a3a; color: #c8b890; margin-top: 8px; }
#online-bar { position: fixed; left: 50%; bottom: 6px; transform: translateX(-50%); z-index: 15; display: none; align-items: center; gap: 10px;
  background: rgba(20,14,6,0.85); border: 1px solid #c89a3a; border-radius: 16px; padding: 4px 6px 4px 14px;
  color: #f0e6d0; font: bold 13px 'Trebuchet MS', sans-serif; white-space: nowrap; }
#online-bar b { color: #ffe080; letter-spacing: 2px; }
#online-bar button { font: bold 12px sans-serif; color: #fff; background: #7a2a1a; border: 0; border-radius: 12px; padding: 4px 10px; cursor: pointer; }
`;

export class Lobby {
  // handlers: onHost(), onJoin(code), onLeave()
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
        <div class="row"><input maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false"><button data-a="join">Join</button></div>
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
    this.input.addEventListener('input', () => { this.input.value = this.input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    // keep the game from reacting to taps and keys aimed at the panel
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.bar = document.createElement('div');
    this.bar.id = 'online-bar';
    this.bar.innerHTML = '<span></span><button>Leave</button>';
    this.barText = this.bar.querySelector('span');
    this.bar.querySelector('button').addEventListener('click', () => this.h.onLeave());
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
    const code = this.input.value.trim().toUpperCase();
    if (code.length !== 4) { this.say('Enter the 4-letter code from the host.'); return; }
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
      const text = online.role === 'host'
        ? `ROOM <b>${online.code}</b> · ${online.players ? `${online.players} friend${online.players === 1 ? '' : 's'} online` : 'share the code with friends'}`
        : `ONLINE · room <b>${online.code}</b>`;
      if (this.barText.innerHTML !== text) this.barText.innerHTML = text;
    }
  }
}
