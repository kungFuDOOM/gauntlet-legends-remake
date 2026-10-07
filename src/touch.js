// On-screen controls for phones and tablets: a floating joystick on the left half of the
// screen and Attack / Magic / Turbo buttons on the right, plus Pause and a sound toggle.
// They appear on the first touch and act as one more input source ('touch').

const CSS = `
#touch { position: fixed; inset: 0; z-index: 10; display: none; touch-action: none; user-select: none; -webkit-user-select: none; pointer-events: none; }
#touch.on { display: block; }
#touch .zone { position: absolute; left: 0; top: 0; bottom: 0; width: 50%; pointer-events: auto; }
#touch .stick { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  border: 2px solid rgba(255,230,170,0.35); background: rgba(0,0,0,0.18); display: none; pointer-events: none; }
#touch .knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
  background: rgba(255,220,140,0.45); border: 2px solid rgba(255,240,200,0.7); }
#touch .hint { position: absolute; left: 6%; bottom: 8%; color: rgba(255,230,170,0.45); font: bold 13px sans-serif; pointer-events: none; }
#touch .btn { position: absolute; border-radius: 50%; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  font: bold 13px 'Trebuchet MS', sans-serif; color: #fff; text-shadow: 0 1px 2px #000; border: 2px solid rgba(255,255,255,0.55); }
#touch .btn.down { filter: brightness(1.6); transform: scale(0.93); }
#touch .attack { width: 92px; height: 92px; right: 5%; bottom: 10%; background: rgba(200,50,30,0.55); font-size: 15px; }
#touch .magic { width: 64px; height: 64px; right: calc(5% + 100px); bottom: 7%; background: rgba(70,90,230,0.55); }
#touch .turbo { width: 64px; height: 64px; right: calc(5% + 14px); bottom: calc(10% + 104px); background: rgba(230,150,20,0.6); }
#touch .small { width: 46px; height: 46px; top: 10px; font-size: 18px; background: rgba(0,0,0,0.35); }
#touch .pause { right: 12px; }
#touch .mute { right: 66px; }
#rotate { position: fixed; inset: 0; z-index: 20; display: none; background: #000; color: #f2c14e; font: bold 22px Georgia, serif;
  align-items: center; justify-content: center; text-align: center; padding: 30px; }
@media (orientation: portrait) { body.touching #rotate { display: flex; } }
`;

export class TouchControls {
  constructor({ onFirstTouch = () => {}, onMute = () => {} } = {}) {
    this.active = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.held = { attack: false, magic: false, turbo: false, start: false };
    this.tapped = new Set(); // buttons pressed and released between two polls
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="zone"></div><div class="stick"><div class="knob"></div></div>
      <div class="hint">drag to move</div>
      <div class="btn attack" data-b="attack">ATTACK</div>
      <div class="btn magic" data-b="magic">MAGIC</div>
      <div class="btn turbo" data-b="turbo">TURBO</div>
      <div class="btn small pause" data-b="start">II</div>
      <div class="btn small mute" data-b="mute">♪</div>`;
    document.body.appendChild(root);
    const rotate = document.createElement('div');
    rotate.id = 'rotate';
    rotate.textContent = 'Turn your phone sideways to play';
    document.body.appendChild(rotate);
    this.root = root;
    this.stickEl = root.querySelector('.stick');
    this.knobEl = root.querySelector('.knob');
    this.hintEl = root.querySelector('.hint');

    const show = () => {
      if (this.active) return;
      this.active = true;
      root.classList.add('on');
      document.body.classList.add('touching');
      onFirstTouch();
    };
    window.addEventListener('touchstart', show, { passive: true });
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) show();
    // keep the page from scrolling, zooming or bouncing
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // joystick: appears wherever the thumb lands on the left half
    const zone = root.querySelector('.zone');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      show();
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      zone.setPointerCapture(e.pointerId);
      this.stickEl.style.display = 'block';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(0,0)';
      this.hintEl.style.display = 'none';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      const R = 50;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.stick.x = dx / R;
      this.stick.y = dy / R;
      this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
      this.stickEl.style.display = 'none';
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    // buttons
    for (const el of root.querySelectorAll('.btn')) {
      const b = el.dataset.b;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        show();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        if (b === 'mute') { onMute(); return; }
        this.held[b] = true;
        this.tapped.add(b);
      });
      const up = () => { el.classList.remove('down'); if (b !== 'mute') this.held[b] = false; };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }

  // Raw state for Input.poll, in the same shape as a gamepad.
  raw() {
    const h = (b) => this.held[b] || this.tapped.has(b);
    let { x, y } = this.stick;
    if (Math.hypot(x, y) < 0.22) { x = 0; y = 0; }
    // the Turbo button fires the turbo attack on its own (it holds Turbo + Attack)
    const r = {
      up: y < -0.5, down: y > 0.5, left: x < -0.5, right: x > 0.5,
      attack: h('attack') || h('turbo'), magic: h('magic'), turbo: h('turbo'), start: h('start'), ax: x, ay: y,
    };
    this.tapped.clear();
    return r;
  }
}
