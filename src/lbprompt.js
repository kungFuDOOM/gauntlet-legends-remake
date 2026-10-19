import { cleanName, getName, setName, submitScore, friendlyError } from './leaderboard.js';

// The "put your score on the global leaderboard" panel, shown when a run ends. A DOM panel (so
// phones get a real keyboard and desktops can type), styled like the online lobby. The name
// is remembered; SUBMIT sends the score, SKIP closes. Gamepads: main.js calls submit() / skip()
// (A / B) so nobody needs a keyboard. The game never waits on the network: it only ever
// shows "OFFLINE" here and carries on.

const CSS = `
#lbprompt { position: fixed; inset: 0; z-index: 17; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); }
#lbprompt .box { background: #1a120a; border: 2px solid #c89a3a; border-radius: 12px; padding: 16px 20px; width: min(380px, 92vw);
  color: #f0e6d0; font: 14px 'Trebuchet MS', sans-serif; text-align: center; box-shadow: 0 8px 30px #000; }
#lbprompt h2 { margin: 0 0 4px; font: bold 21px Georgia, serif; color: #f2c14e; }
#lbprompt p { margin: 4px 0 8px; color: #c8b890; line-height: 1.3; }
#lbprompt .score { font: bold 26px 'Trebuchet MS', sans-serif; color: #ffe070; margin: 2px 0 6px; }
#lbprompt input { width: 210px; font: bold 20px monospace; text-align: center; background: #0d0905; color: #ffe8a0;
  border: 2px solid #8a6a2a; border-radius: 8px; padding: 6px; }
#lbprompt .row { display: flex; gap: 10px; justify-content: center; margin: 10px 0 4px; }
#lbprompt button { font: bold 15px 'Trebuchet MS', sans-serif; color: #fff4d0; background: rgba(90,60,16,0.95); border: 2px solid #c89a3a;
  border-radius: 8px; padding: 10px 18px; min-height: 44px; cursor: pointer; touch-action: manipulation; }
#lbprompt button.skip { background: transparent; border-color: #6a5a3a; color: #c8b890; }
#lbprompt button:disabled { opacity: 0.5; cursor: default; }
#lbprompt .msg { min-height: 20px; color: #ffb080; font-weight: bold; }
#lbprompt .msg.ok { color: #9fe89f; }
#lbprompt .hint { font-size: 12px; color: #8a7a60; margin-top: 6px; }
`;

export class LbPrompt {
  // opts: { touch(): bool } (whether to show gamepad/keyboard hints)
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.panel = document.createElement('div');
    this.panel.id = 'lbprompt';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Submit score to the global leaderboard');
    this.panel.innerHTML = `<div class="box">
      <h2>GLOBAL LEADERBOARD</h2>
      <div class="score"></div>
      <p class="what"></p>
      <input class="name" maxlength="12" placeholder="YOUR NAME" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Your name (3-12 characters)">
      <div class="msg" aria-live="polite"></div>
      <div class="row"><button class="go">SUBMIT</button><button class="skip">SKIP</button></div>
      <div class="hint"></div></div>`;
    document.body.appendChild(this.panel);
    const q = (s) => this.panel.querySelector(s);
    this.scoreEl = q('.score'); this.whatEl = q('.what'); this.input = q('.name'); this.msg = q('.msg');
    this.goBtn = q('.go'); this.skipBtn = q('.skip'); this.hint = q('.hint');
    this.isOpen = false; this.busy = false; this.done = false; this.info = null; this.onClose = null;
    this.goBtn.addEventListener('click', () => this.submit());
    this.skipBtn.addEventListener('click', () => this.skip());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } else if (e.key === 'Escape') this.skip(); });
    // keep the game from reacting to taps aimed at the panel
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // info: { name: default name, score, cls (key), clsName, level, won }
  open(info, hintText = '') {
    this.info = info; this.done = false; this.busy = false;
    const remembered = getName();
    this.input.value = remembered || info.clsName || '';
    this.scoreEl.textContent = Math.round(info.score).toLocaleString('en-US');
    this.whatEl.textContent = `${info.clsName}${info.won ? ' · quest complete!' : ''}. Enter a name to put this run on the worldwide top 10.`;
    this.msg.textContent = ''; this.msg.className = 'msg';
    this.goBtn.disabled = false; this.goBtn.textContent = 'SUBMIT'; this.skipBtn.textContent = 'SKIP';
    this.hint.textContent = hintText;
    this.panel.style.display = 'flex';
    this.isOpen = true;
    // phones: don't pop the on-screen keyboard open by itself (the remembered name is ready to send)
    if (!document.body.classList.contains('touching')) { try { this.input.focus(); this.input.select(); } catch { /* ignore */ } }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.style.display = 'none';
    try { if (document.activeElement && this.panel.contains(document.activeElement)) document.activeElement.blur(); } catch { /* ignore */ }
    if (this.onClose) this.onClose(this.done);
  }

  skip() { if (this.isOpen) this.close(); }

  async submit() {
    if (!this.isOpen || this.busy) return;
    if (this.done) { this.close(); return; }
    const c = cleanName(this.input.value);
    if (!c.ok) { this.msg.textContent = c.err; this.msg.className = 'msg'; return; }
    this.busy = true; this.goBtn.disabled = true; this.msg.textContent = 'SENDING...'; this.msg.className = 'msg';
    setName(c.name);
    try {
      const r = await submitScore({ name: c.name, score: this.info.score, cls: this.info.cls, level: this.info.level, won: this.info.won });
      this.done = true;
      this.msg.textContent = r && r.rank ? `SAVED - YOU ARE #${r.rank} WORLDWIDE!` : 'SAVED!';
      this.msg.className = 'msg ok';
      this.goBtn.textContent = 'DONE'; this.skipBtn.textContent = 'CLOSE';
      this.result = r;
    } catch (e) {
      this.msg.textContent = friendlyError(e); this.msg.className = 'msg';
    }
    this.busy = false; this.goBtn.disabled = false;
  }
}
