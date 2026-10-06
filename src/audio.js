// Synthesized sound effects (Web Audio) and the announcer (Web Speech).

let ctx = null;
let master = null;
let muted = false;
let voiceOn = true;
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
  return muted;
}
export const isMuted = () => muted;

export function toggleVoice() {
  voiceOn = !voiceOn;
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
