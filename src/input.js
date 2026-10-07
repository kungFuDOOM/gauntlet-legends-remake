// Keyboard, gamepad and touch input. Every device is an "input source" a player can claim.

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
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.globalPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  static label(id) {
    if (KB_SCHEMES[id]) return KB_SCHEMES[id].label;
    if (id === 'touch') return 'Touch screen';
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

    if (this.touch && this.touch.active) raw.touch = this.touch.raw();

    const state = {};
    for (const [id, r] of Object.entries(raw)) {
      const prev = this.prevRaw[id] || {};
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
