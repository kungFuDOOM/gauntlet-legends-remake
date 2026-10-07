// Keyboard, gamepad and touch input. Every device is an "input source" a player can claim.
//
// The keyboard and the touch screen belong to the person sitting at this device, so by
// default they are one source, 'kb': WASD, the arrow keys and the touch controls all drive
// the same hero. A second player on the same keyboard has to ask for it (see splitKeyboard
// in main.js); then 'kb1' is WASD plus touch and 'kb2' is the arrow keys. Gamepads are
// always their own sources.

const KB_SCHEMES = {
  kb1: {
    label: 'Keyboard 1 (WASD)',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    attack: ['Space', 'KeyF'], magic: ['KeyE', 'KeyG'], turbo: ['ShiftLeft', 'KeyQ', 'KeyH'],
  },
  kb2: {
    label: 'Keyboard 2 (Arrows)',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    attack: ['Enter', 'Slash', 'Numpad0'], magic: ['Period', 'NumpadDecimal', 'Quote'], turbo: ['ShiftRight', 'Comma', 'Numpad1'],
  },
};

const BUTTONS = ['attack', 'magic', 'turbo', 'up', 'down', 'left', 'right'];
const EMPTY = Object.freeze({ x: 0, y: 0, attack: false, magic: false, turbo: false, pressed: {} });
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.globalPressed = new Set();
    this.prevRaw = {};
    this.state = {};
    this.split = false; // two players sharing the keyboard
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.globalPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  static label(id) {
    if (id === 'kb') return document.body.classList.contains('touching') ? 'Touch screen' : 'Keyboard';
    if (KB_SCHEMES[id]) return KB_SCHEMES[id].label;
    return `Gamepad ${Number(id.slice(3)) + 1}`;
  }

  poll() {
    const raw = {};
    for (const [id, s] of Object.entries(KB_SCHEMES)) {
      // A key tapped and released between two polls still counts as held for one frame.
      const down = (list) => list.some((k) => this.keys.has(k) || this.globalPressed.has(k));
      raw[id] = {
        up: down(s.up), down: down(s.down), left: down(s.left), right: down(s.right),
        attack: down(s.attack), magic: down(s.magic), turbo: down(s.turbo), ax: 0, ay: 0,
      };
    }
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) < 0.3) { ax = 0; ay = 0; }
      raw[`pad${pad.index}`] = {
        up: b(12) || ay < -0.5, down: b(13) || ay > 0.5, left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
        attack: b(0) || b(7), magic: b(1) || b(3), turbo: b(2) || b(5) || b(6), ax, ay,
        start: b(9),
      };
    }

    // fold the touch controls (and, unless split, the second keyboard half) into one source
    const touch = this.touch && this.touch.active ? this.touch.raw() : null;
    const merged = [raw.kb1, touch, this.split ? null : raw.kb2].filter(Boolean);
    const kb = {};
    for (const k of [...BUTTONS, 'start']) kb[k] = merged.some((r) => r[k]);
    kb.ax = touch ? touch.ax : 0;
    kb.ay = touch ? touch.ay : 0;
    const keyDir = (r) => r && (r.up || r.down || r.left || r.right);
    if (keyDir(raw.kb1) || (!this.split && keyDir(raw.kb2))) { kb.ax = 0; kb.ay = 0; } // arrow keys win over the stick
    delete raw.kb1;
    if (this.split) raw.kb1 = kb;
    else { delete raw.kb2; raw.kb = kb; }

    const state = {};
    // when the keyboard is split or rejoined, a key still held must not count as a fresh press
    const pr = this.prevRaw;
    const either = (a = {}, b = {}) => Object.fromEntries([...BUTTONS, 'start'].map((k) => [k, a[k] || b[k]]));
    const prevOf = (id) => pr[id] || (id === 'kb' ? either(pr.kb1, pr.kb2) : id === 'kb1' || id === 'kb2' ? pr.kb : null) || {};
    for (const [id, r] of Object.entries(raw)) {
      const prev = prevOf(id);
      const pressed = {};
      for (const k of BUTTONS) pressed[k] = r[k] && !prev[k];
      pressed.start = !!r.start && !prev.start;
      let x = (r.right ? 1 : 0) - (r.left ? 1 : 0);
      let y = (r.down ? 1 : 0) - (r.up ? 1 : 0);
      if (r.ax || r.ay) { x = r.ax; y = r.ay; }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      state[id] = { x, y, attack: r.attack, magic: r.magic, turbo: r.turbo, pressed };
    }
    this.prevRaw = raw;
    this.state = state;
    this.frameGlobal = this.globalPressed;
    this.globalPressed = new Set();
  }

  get(id) { return this.state[id] || EMPTY; }

  sources() { return Object.keys(this.state); }

  // Returns the first source id that just pressed the button, excluding `except`.
  firstPressed(btn, except = []) {
    for (const [id, s] of Object.entries(this.state)) {
      if (!except.includes(id) && s.pressed[btn]) return id;
    }
    return null;
  }

  key(code) { return this.frameGlobal && this.frameGlobal.has(code); }

  anyStart() {
    return Object.values(this.state).some((s) => s.pressed.start);
  }
}
