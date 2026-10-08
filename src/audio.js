// Synthesized sound effects (Web Audio) and the announcer (Web Speech).

let ctx = null;
let master = null;
let muted = false;
// The spoken announcer is off unless the player turns it on (V); browser voices sound robotic.
let voiceOn = false;
try { voiceOn = localStorage.getItem('gl-remake-voice') === 'on'; } catch { /* storage unavailable */ }
const lastPlayed = {};

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
  if (musicBus) musicBus.gain.setTargetAtTime(muted || !musicOn ? 0 : MUSIC_VOL, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;

export function toggleVoice() {
  voiceOn = !voiceOn;
  if (!voiceOn && window.speechSynthesis) window.speechSynthesis.cancel();
  try { localStorage.setItem('gl-remake-voice', voiceOn ? 'on' : 'off'); } catch { /* storage unavailable */ }
  return voiceOn;
}

function throttle(name, ms) {
  const now = performance.now();
  if (lastPlayed[name] && now - lastPlayed[name] < ms) return false;
  lastPlayed[name] = now;
  return true;
}

function tone(freq, dur, { type = 'square', vol = 0.25, slide = null, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(slide, 20), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 1200, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  shoot(kind) {
    if (!throttle('shoot', 45)) return;
    if (kind === 'fireball') { noise(0.18, { vol: 0.15, freq: 900 }); tone(300, 0.15, { type: 'sawtooth', vol: 0.08, slide: 120 }); }
    else if (kind === 'arrow') tone(900, 0.07, { type: 'triangle', vol: 0.12, slide: 400 });
    else tone(520, 0.09, { type: 'square', vol: 0.08, slide: 260 });
  },
  melee() { if (throttle('melee', 60)) { noise(0.08, { vol: 0.25, freq: 2500 }); tone(180, 0.08, { vol: 0.1, slide: 90 }); } },
  hit() { if (throttle('hit', 40)) noise(0.06, { vol: 0.18, freq: 1800 }); },
  enemyShot() { if (throttle('eshot', 80)) tone(240, 0.12, { type: 'sawtooth', vol: 0.06, slide: 160 }); },
  hurt() { if (throttle('hurt', 140)) tone(140, 0.14, { type: 'square', vol: 0.15, slide: 70 }); },
  die() { tone(400, 0.6, { type: 'sawtooth', vol: 0.2, slide: 50 }); },
  food() { tone(392, 0.08, { vol: 0.12 }); tone(523, 0.08, { vol: 0.12, delay: 0.07 }); tone(659, 0.12, { vol: 0.12, delay: 0.14 }); },
  gold() { if (throttle('gold', 50)) { tone(1046, 0.06, { type: 'triangle', vol: 0.15 }); tone(1568, 0.1, { type: 'triangle', vol: 0.15, delay: 0.05 }); } },
  key() { tone(784, 0.07, { type: 'triangle', vol: 0.15 }); tone(1175, 0.15, { type: 'triangle', vol: 0.15, delay: 0.07 }); },
  door() { noise(0.35, { vol: 0.3, freq: 400 }); tone(90, 0.35, { type: 'sawtooth', vol: 0.12, slide: 60 }); },
  potion() { noise(0.6, { vol: 0.45, freq: 600 }); tone(120, 0.6, { type: 'sawtooth', vol: 0.2, slide: 40 }); },
  explode() { if (throttle('explode', 70)) noise(0.3, { vol: 0.3, freq: 700 }); },
  powerup() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.13, delay: i * 0.06 })); },
  levelup() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.09, delay: i * 0.07 })); },
  turbo() { noise(0.25, { vol: 0.25, freq: 3000 }); tone(220, 0.25, { type: 'sawtooth', vol: 0.12, slide: 880 }); },
  exit() { [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); },
  join() { tone(659, 0.08, { vol: 0.1 }); tone(988, 0.15, { vol: 0.1, delay: 0.08 }); },
  select() { tone(880, 0.05, { type: 'triangle', vol: 0.1 }); },
  boss() { tone(70, 1.2, { type: 'sawtooth', vol: 0.25, slide: 40 }); noise(1.2, { vol: 0.2, freq: 300 }); },
};

const lastSaid = {};
export function say(text, key = text, cooldown = 8000) {
  if (muted || !voiceOn || !window.speechSynthesis) return;
  const now = performance.now();
  if (lastSaid[key] && now - lastSaid[key] < cooldown) return;
  lastSaid[key] = now;
  if (window.speechSynthesis.speaking && window.speechSynthesis.pending) return;
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 0.45;
  u.rate = 0.9;
  u.volume = 0.9;
  window.speechSynthesis.speak(u);
}

// ---------- music ----------
// A tiny step sequencer that composes each track from a chord progression: pad chords,
// a bass line, an arpeggio and a drum pattern, scheduled ahead on the audio clock.

const MUSIC_VOL = 0.55;
let musicBus = null;
let musicOn = true;
let track = null;
let timer = null;
let nextStep = 0;
let step = 0;

// semitone offsets from the root for minor/major triads
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7] };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// root: MIDI note; prog: [semitones above root, quality] per bar; drums: pattern strings per 16th
const TRACKS = {
  title:    { bpm: 84,  root: 50, prog: [[0, 'm'], [-4, 'M'], [-2, 'M'], [-5, 'M']], arp: 'slow', drums: 'none', lead: true },
  canyon:   { bpm: 112, root: 52, prog: [[0, 'm'], [3, 'M'], [-2, 'M'], [-5, 'M']], arp: 'run', drums: 'march' },
  castle:   { bpm: 100, root: 48, prog: [[0, 'm'], [-4, 'M'], [-7, 'M'], [-5, 'M']], arp: 'broken', drums: 'march' },
  sky:      { bpm: 92,  root: 55, prog: [[0, 'M'], [5, 'M'], [-3, 'm'], [7, 'M']], arp: 'bell', drums: 'soft' },
  inferno:  { bpm: 124, root: 45, prog: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']], arp: 'run', drums: 'driving' },
  boss:     { bpm: 140, root: 47, prog: [[0, 'm'], [1, 'M'], [-1, 'M'], [0, 'm']], arp: 'run', drums: 'driving', lead: true },
  shop:     { bpm: 96,  root: 53, prog: [[0, 'M'], [-3, 'm'], [5, 'M'], [7, 'M']], arp: 'bell', drums: 'soft' },
  treasure: { bpm: 150, root: 57, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [5, 'M']], arp: 'run', drums: 'driving' },
  victory:  { bpm: 90,  root: 53, prog: [[0, 'M'], [5, 'M'], [-3, 'm'], [7, 'M']], arp: 'slow', drums: 'soft', lead: true },
};

const DRUMS = {
  none:    { k: '', s: '', h: '' },
  soft:    { k: 'x.......x.......', s: '', h: '..x...x...x...x.' },
  march:   { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  driving: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
};

function note(freq, t, dur, { type = 'triangle', vol = 0.1, cutoff = 2400, attack = 0.01 } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(f).connect(g).connect(musicBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function drum(kind, t) {
  if (kind === 'k') {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(musicBus);
    osc.start(t); osc.stop(t + 0.2);
    return;
  }
  const len = kind === 's' ? 0.16 : 0.04;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = kind === 's' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 's' ? 1800 : 7000;
  const g = ctx.createGain();
  g.gain.value = kind === 's' ? 0.28 : 0.07;
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
}

function scheduleStep(tr, t) {
  const sixteenth = 60 / tr.bpm / 4;
  const bar = Math.floor(step / 16) % tr.prog.length;
  const s16 = step % 16;
  const [offset, q] = tr.prog[bar];
  const root = tr.root + offset;
  const chord = TRIAD[q].map((iv) => root + iv);
  if (s16 === 0) {
    // pad: the whole chord, held for the bar
    for (const n of chord) note(midi(n + 12), t, sixteenth * 16, { type: 'sawtooth', vol: 0.025, cutoff: 900, attack: 0.25 });
  }
  if (s16 % 4 === 0 || (tr.drums === 'driving' && s16 % 2 === 0)) {
    note(midi(root - 12 + (s16 === 8 && tr.drums !== 'none' ? 7 : 0)), t, sixteenth * 3, { type: 'square', vol: 0.07, cutoff: 500 });
  }
  const arpNotes = [...chord, chord[0] + 12, chord[1] + 12];
  const arp = { slow: s16 % 4 === 0, run: true, broken: s16 % 2 === 0, bell: s16 % 3 === 0 }[tr.arp];
  if (arp) {
    const n = arpNotes[(step * (tr.arp === 'broken' ? 3 : 1)) % arpNotes.length] + 12;
    note(midi(n), t, sixteenth * (tr.arp === 'bell' ? 4 : 1.5), { type: tr.arp === 'bell' ? 'sine' : 'square', vol: tr.arp === 'bell' ? 0.05 : 0.025, cutoff: 3000 });
  }
  if (tr.lead && (s16 === 0 || s16 === 6 || s16 === 10)) {
    const melody = [chord[2] + 12, chord[1] + 12, chord[0] + 12][(s16 / 4) | 0] ?? chord[0] + 12;
    note(midi(melody), t, sixteenth * 5, { type: 'triangle', vol: 0.06, cutoff: 2600, attack: 0.03 });
  }
  const dr = DRUMS[tr.drums];
  for (const k of ['k', 's', 'h']) if (dr[k][s16] === 'x') drum(k, t);
}

function tick() {
  if (!ctx || !track) return;
  const tr = TRACKS[track];
  const sixteenth = 60 / tr.bpm / 4;
  while (nextStep < ctx.currentTime + 0.12) {
    scheduleStep(tr, nextStep);
    nextStep += sixteenth;
    step++;
  }
}

export function playMusic(name) {
  if (!ctx || name === track) return;
  if (!musicBus) {
    musicBus = ctx.createGain();
    musicBus.gain.value = muted || !musicOn ? 0 : MUSIC_VOL;
    musicBus.connect(master);
  }
  track = TRACKS[name] ? name : null;
  step = 0;
  nextStep = ctx.currentTime + 0.05;
  if (!timer) timer = setInterval(tick, 25);
}

export function toggleMusic() {
  musicOn = !musicOn;
  if (musicBus) musicBus.gain.setTargetAtTime(muted || !musicOn ? 0 : MUSIC_VOL, ctx.currentTime, 0.05);
  return musicOn;
}
