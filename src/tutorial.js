// The Training Grounds: one short lesson per room. Each lesson says what to press (named for
// the device the player is using), waits until the party has done it, then opens the gate to
// the next room. The level itself comes from generateTutorial in level.js.

import { TILE, TURBO_COST } from './config.js';
import { T, TUTORIAL_PITCH, TUTORIAL_MID, TUTORIAL_ROOMS, tutorialRoomX } from './level.js';
import { sfx, say } from './audio.js';

const M = TUTORIAL_MID;
const cx = tutorialRoomX;
const inRoom = (k, o) => Math.floor(o.x / TILE / TUTORIAL_PITCH) === k;

// `b(name)` gives a button's name for the current device ('Enter', 'A', 'ATTACK', ...);
// `dev` is that device: 'keys', 'pad' or 'touch'.
const STEPS = [
  {
    title: 'MOVE',
    text: (b, dev) => ({
      touch: 'Drag your thumb on the left side of the screen to move. Grab all the gold!',
      pad: 'Move with the left stick. Grab all the gold!',
      keys: 'Move with WASD or the arrow keys. Grab all the gold!',
    })[dev],
    done: (g) => !g.items.some((i) => i.type === 'gold' && inRoom(0, i)),
  },
  {
    title: 'ATTACK',
    button: 'attack',
    text: (b) => `Press ${b('attack')} to attack. Fighters swing, magic users and archers shoot. Defeat the grunts!`,
    start: (g) => { for (const [dx, dy] of [[2, -3], [3, 0], [2, 3]]) g.spawnEnemy('grunt', (cx(1) + dx + 0.5) * TILE, (M + dy + 0.5) * TILE); },
    done: (g) => g.enemies.length === 0,
  },
  {
    title: 'GENERATORS',
    text: (b) => `Monsters keep pouring out of generators. Attack the bone pile with ${b('attack')} until it breaks!`,
    start: (g) => g.addGenerator('grunt', cx(2) + 3, M),
    done: (g) => g.gens.length === 0 && g.enemies.length === 0,
  },
  {
    title: 'KEYS & DOORS',
    text: () => 'Locked doors need a key. Pick up the key, then walk into the locked door to open it.',
    gateIsDoor: true, // the way out is a real locked door
    done: (g) => g.tile(4 * TUTORIAL_PITCH, M) !== T.DOOR,
  },
  {
    title: 'MAGIC',
    button: 'magic',
    text: (b) => `Too many monsters? Grab the blue potion and press ${b('magic')} for MAGIC. It hits every monster on the screen!`,
    start: (g) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.spawnEnemy(i % 3 ? 'grunt' : 'ghost', (cx(4) + 2.5 + Math.cos(a) * 3.2) * TILE, (M + 0.5 + Math.sin(a) * 3.6) * TILE);
      }
    },
    update: (g) => {
      // someone used their potion early: hand out another one
      if (!g.items.some((i) => i.type === 'potion') && g.livePlayers().every((p) => p.potions === 0)) for (const p of g.livePlayers()) p.potions = 1;
    },
    done: (g, s) => g.stats.magic > s.magic,
  },
  {
    title: 'TURBO',
    button: 'turbo',
    text: (b, dev) => dev === 'touch'
      ? 'When the orange TURBO bar is full, tap TURBO for a powerful special attack. Try it!'
      : `When the orange TURBO bar is full, hold ${b('turbo')} and press ${b('attack')} for a powerful special attack. Try it!`,
    start: (g) => { for (const [dx, dy] of [[2, -2], [3, 0], [2, 2], [4, -3], [4, 3]]) g.spawnEnemy('grunt', (cx(5) + dx + 0.5) * TILE, (M + dy + 0.5) * TILE); },
    update: (g) => { for (const p of g.livePlayers()) p.turbo = Math.max(p.turbo, TURBO_COST + 5); },
    done: (g, s) => g.stats.turbo > s.turbo,
  },
  {
    title: 'FOOD',
    text: () => 'Your health slowly drains in every level, so eat food to heal. Careful: poisoned food (the green one) hurts you. Shoot it instead!',
    done: (g, s) => g.stats.food > s.food,
  },
  {
    title: 'READY!',
    text: (b, dev) => `That's everything! ${dev === 'touch' ? 'Tap II' : dev === 'pad' ? 'Press Start' : 'Press Esc'} to pause any time. Walk into the glowing exit to begin your quest.`,
  },
];

export class Tutorial {
  // `touch` (optional) is the on-screen controls, so the button a lesson is about can throb
  constructor(game, touch = null) {
    this.game = game;
    this.touch = touch;
    this.idx = -1;
    this.doneT = 0;
    this.next();
  }

  get step() { return STEPS[this.idx]; }
  get count() { return STEPS.length; }

  next() {
    const g = this.game;
    this.idx++;
    this.mark = { ...g.stats };
    const st = this.step;
    if (st.start) st.start(g);
    if (st.button && this.touch && this.touch.active) this.touch.pulse(st.button);
    say(st.title === 'READY!' ? 'Well done!' : st.title.toLowerCase(), `tut${this.idx}`, 0);
  }

  update(dt) {
    const g = this.game, st = this.step;
    if (st.update) st.update(g);
    if (!st.done || this.idx >= STEPS.length - 1) return;
    if (this.doneT > 0) {
      // a short pause so the "done" tick is seen before the next lesson appears
      this.doneT -= dt;
      if (this.doneT <= 0) {
        if (!st.gateIsDoor && this.idx + 1 < TUTORIAL_ROOMS) g.openDoorAt((this.idx + 1) * TUTORIAL_PITCH, M);
        this.next();
      }
      return;
    }
    if (st.done(g, this.mark)) {
      this.doneT = 1;
      sfx.join();
      for (const p of g.livePlayers()) g.text(p.x, p.y - 30, 'NICE!', '#80ff80', 1.2);
    }
  }

  // what the HUD shows: { n, of, title, text, done }
  view(b, dev) { return tutorialView(this.idx, this.doneT > 0, b, dev); }
}

// The lesson box for step `idx` (also used by online guests, who only get the step number).
export function tutorialView(idx, done, b, dev) {
  const st = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx))];
  return { n: idx + 1, of: STEPS.length, title: st.title, text: st.text(b, dev), done };
}
