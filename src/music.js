// The music engine: a small step sequencer that plays the tracks in music-data.js with
// Web Audio. It works on any audio context, so tools/render-music.mjs runs this very code
// in an OfflineAudioContext to make preview files.
//
//   const m = createMusic(ctx, destination);
//   m.play('boss_1');          // crossfades from whatever was playing
//   m.setIntensity(2);         // boss layers: 0 calm, 1 enraged, 2 furious
//   m.setPaused(true);         // hold the song where it is (and back on)
//   m.tick();                  // call every ~40 ms; schedules notes just ahead of the clock
//
// Everything is synthesized: a few oscillators per note, one shared noise buffer. Notes
// are scheduled only ~0.2 s ahead, so a busy boss track costs about 150 short-lived nodes
// a second.

import { TRACKS, SCALES, DRUMS, motifOf } from './music-data.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 0.2;

// harmonics for the custom waveforms (index 0 = fundamental)
const WAVES = {
  organ: [1, 0.55, 0.4, 0.3, 0.12, 0.1, 0.05],
  choir: [1, 0.15, 0.55, 0.1, 0.38, 0.12, 0.2, 0.04, 0.1],
  bell:  [1, 0, 0.3, 0, 0, 0.5, 0, 0.1, 0, 0, 0.25],
  glass: [1, 0.2, 0, 0.45, 0, 0, 0.22, 0, 0, 0, 0.15],
  flute: [1, 0.12, 0.05, 0.02],
  horn:  [1, 0.8, 0.55, 0.35, 0.22, 0.12, 0.06],
  pipe:  [1, 0, 0.5, 0, 0.3, 0, 0.18, 0, 0.1],
  reed:  [1, 0.1, 0.7, 0.1, 0.5, 0.1, 0.35, 0.1, 0.2],
  brass: [1, 0.9, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12, 0.08],
};
// how each instrument's note behaves: waveform, attack, release factor, filter brightness
const INSTR = {
  choir: { w: 'choir', atk: 0.18, rel: 0.5, bright: 1, det: 7 },
  organ: { w: 'organ', atk: 0.04, rel: 0.2, bright: 1, det: 4 },
  bell:  { w: 'bell',  atk: 0.005, rel: 1, bright: 1, ring: true },
  glass: { w: 'glass', atk: 0.005, rel: 1, bright: 1, ring: true },
  pluck: { w: 'saw',   atk: 0.004, rel: 1, bright: 0.6, ring: true, pluck: true },
  flute: { w: 'flute', atk: 0.05, rel: 0.4, bright: 1 },
  horn:  { w: 'horn',  atk: 0.06, rel: 0.4, bright: 0.8, scoop: true },
  pipe:  { w: 'pipe',  atk: 0.02, rel: 0.3, bright: 1 },
  reed:  { w: 'reed',  atk: 0.02, rel: 0.3, bright: 0.9, scoop: true },
  brass: { w: 'brass', atk: 0.03, rel: 0.3, bright: 1, scoop: true },
  saw: { w: 'sawtooth', atk: 0.02, rel: 0.4, bright: 1, det: 6 },
  square: { w: 'square', atk: 0.01, rel: 0.4, bright: 1 },
  tri: { w: 'triangle', atk: 0.02, rel: 0.4, bright: 1 },
  sine: { w: 'sine', atk: 0.02, rel: 0.4, bright: 1 },
};

// degree (1-based, can pass 7) -> MIDI note
function degree(t, d, chordRoot = 0) {
  const sc = SCALES[t.mode];
  const i = d - 1;
  return t.root + sc[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7) + chordRoot;
}
// triad on a scale degree, stacked in thirds from the scale itself
function triad(t, d) {
  return [0, 2, 4].map((k) => degree(t, d + k));
}

export function createMusic(ctx, destination) {
  const out = ctx.createGain();
  out.gain.value = 1;
  const comp = ctx.createDynamicsCompressor(); // keeps the loudest tracks from clipping
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  out.connect(comp).connect(destination);

  const waves = {};
  const wave = (name) => {
    if (!waves[name]) {
      const h = WAVES[name];
      const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
      h.forEach((a, i) => { imag[i + 1] = a; });
      waves[name] = ctx.createPeriodicWave(real, imag);
    }
    return waves[name];
  };
  let noiseBuf = null;
  const noise = () => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let seed = 12345; // fixed, so renders are repeatable
      for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    }
    return noiseBuf;
  };

  // ----- voices -----
  function voice(bus, name, freq, t, dur, vol, cut, extra = {}) {
    const ins = INSTR[name];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    if (WAVES[ins.w]) osc.setPeriodicWave(wave(ins.w)); else osc.type = ins.w;
    f.type = 'lowpass';
    const c = Math.min(cut * ins.bright, 9000);
    f.frequency.setValueAtTime(ins.pluck ? c * 0.45 : c, t);
    if (ins.pluck) f.frequency.exponentialRampToValueAtTime(Math.max(c * 0.12, 200), t + dur * 0.8);
    const atk = Math.min(extra.atk ?? ins.atk, dur * 0.5);
    const end = t + dur + (ins.ring ? dur * 0.5 : dur * ins.rel * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    if (ins.ring) g.gain.exponentialRampToValueAtTime(0.0001, end);
    else { g.gain.setValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, end); }
    osc.frequency.setValueAtTime(ins.scoop ? freq * 0.97 : freq, t);
    if (ins.scoop) osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    osc.connect(f).connect(g).connect(bus);
    osc.start(t); osc.stop(end + 0.05);
    if (ins.det) { // a second, slightly detuned oscillator for width
      const o2 = ctx.createOscillator();
      if (WAVES[ins.w]) o2.setPeriodicWave(wave(ins.w)); else o2.type = ins.w;
      o2.frequency.setValueAtTime(freq, t);
      o2.detune.value = ins.det;
      o2.connect(f); o2.start(t); o2.stop(end + 0.05);
    }
  }

  function drum(bus, kind, t, vol = 1) {
    if (kind === 'k' || kind === 't') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      const hi = kind === 'k' ? 150 : 190, lo = kind === 'k' ? 42 : 95, len = kind === 'k' ? 0.2 : 0.28;
      osc.frequency.setValueAtTime(hi, t);
      osc.frequency.exponentialRampToValueAtTime(lo, t + len * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((kind === 'k' ? 0.5 : 0.32) * vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(g).connect(bus);
      osc.start(t); osc.stop(t + len + 0.02);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loopStart = 0;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const len = kind === 's' ? 0.17 : kind === 'o' ? 0.18 : kind === 'c' ? 1.2 : 0.045;
    f.type = kind === 's' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 's' ? 1900 : kind === 'c' ? 5000 : 7500;
    const peak = (kind === 's' ? 0.3 : kind === 'c' ? 0.16 : kind === 'o' ? 0.06 : 0.05) * vol;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(bus);
    src.start(t, 0.1 * ((t * 7) % 1), len + 0.02); // different slice each hit
  }

  // ----- one playing track -----
  function makePlayer(id, startAt) {
    const tr = TRACKS[id];
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(out);
    const p = {
      id, tr, bus, step: 0, next: startAt, done: false, lead: motifOf(tr), sixteenth: 60 / tr.bpm / 4,
      dr: DRUMS[tr.drums], ended: false,
    };
    return p;
  }

  function stepPlayer(p, t, level) {
    const tr = p.tr, bus = p.bus;
    const bars = tr.prog.length;
    const stepInLoop = p.step % (bars * 16);
    const bar = (stepInLoop / 16) | 0;
    const s16 = stepInLoop % 16;
    const sx = p.sixteenth;
    const d = tr.prog[bar];
    const rootNote = degree(tr, d);
    const chord = triad(tr, d);
    const swung = s16 % 2 ? t + (tr.swing || 0) * sx : t;

    if (s16 === 0) { // pad: the chord, held for the bar
      for (const n of chord) voice(bus, tr.pad.w, midi(n + 12), t, sx * 16 * 0.95, tr.pad.vol, tr.pad.cut);
      if (level >= 2 && tr.boss) voice(bus, 'saw', midi(rootNote), t, sx * 16 * 0.95, 0.03, 500);
      if (level >= 1 && tr.boss && bar % 2 === 0) drum(bus, 'c', t, level >= 2 ? 1 : 0.6);
    }
    // bass
    const bc = tr.bass.pat[s16];
    const lowRoot = rootNote - 12;
    const bassNote = { r: lowRoot, 5: lowRoot + 7, o: lowRoot + 12, 7: lowRoot + 10, c: lowRoot + 1 }[bc];
    if (bassNote !== undefined) voice(bus, tr.bass.w, midi(bassNote), t, sx * 2.6, tr.bass.vol, tr.bass.cut);
    else if (level >= 2 && tr.boss && s16 % 2 === 0) voice(bus, tr.bass.w, midi(lowRoot), t, sx * 1.4, tr.bass.vol * 0.8, tr.bass.cut);
    // arpeggio: chord tones in a pattern, faster when the boss is enraged
    const rate = level >= 1 && tr.boss ? Math.max(1, tr.arp.rate >> 1) : tr.arp.rate;
    if (s16 % rate === 0) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
      const k = p.step / rate | 0;
      const idx = {
        up: k % 5, down: 4 - (k % 5), updown: [0, 1, 2, 3, 4, 3, 2, 1][k % 8],
        skip: [0, 2, 1, 3][k % 4], broken: [0, 2, 1, 2, 0, 3, 1, 4][k % 8],
      }[tr.arp.pat];
      voice(bus, tr.arp.w, midi(tones[idx] + 12 * (tr.arp.oct - 1) + 12), swung, sx * rate * 1.3, tr.arp.vol, 3200);
    }
    // lead melody
    const ch = p.lead[stepInLoop % p.lead.length];
    if (ch !== '.' && ch !== '-') {
      let len = 1;
      while (p.lead[(stepInLoop + len) % p.lead.length] === '-' && len < 16) len++;
      const dg = parseInt(ch, 36) - 0; // '1'-'9' then a=10...
      const note = degree(tr, dg) + 12 * (tr.lead.oct - 1) + 12;
      voice(bus, tr.lead.w, midi(note), swung, sx * len * 0.95, tr.lead.vol, 3800);
      if (level >= 2 && tr.boss) voice(bus, tr.lead.w, midi(note + 12), swung, sx * len * 0.9, tr.lead.vol * 0.4, 3800);
    }
    // drums
    const dr = p.dr;
    const hit = (k, vol = 1) => drum(bus, k, swung, vol);
    for (const [key, name] of [['k', 'k'], ['s', 's'], ['h', 'h'], ['o', 'o'], ['t', 't']]) {
      const c = dr[key][s16];
      if (c === 'x') hit(name); else if (c === 'g') hit(name, 0.4);
    }
    if (tr.boss) {
      if (level >= 1 && dr.h[s16] !== 'x') hit('h', 0.7);                  // hats on every 16th
      if (level >= 1 && s16 === 14) hit('t', 0.7);                          // fill into the next bar
      if (level >= 2 && s16 % 4 === 2) hit('k', 0.6);                       // kick pushes the off-beats
    }
    // stingers end on a held chord after the last bar
    if (tr.once && p.step >= bars * 16 - 1) p.done = true;
  }

  // ----- the mixer -----
  let players = [];
  let current = null;
  let intensity = 0;
  let paused = false;
  let cancelled = false;

  function fade(p, to, secs) {
    const t = ctx.currentTime;
    p.bus.gain.cancelScheduledValues(t);
    p.bus.gain.setValueAtTime(Math.max(p.bus.gain.value, 0.0001), t);
    p.bus.gain.linearRampToValueAtTime(to, t + secs);
  }

  function retire(p, secs) {
    fade(p, 0.0001, secs);
    p.ended = true;
    if (typeof setTimeout === 'function' && !cancelled) {
      setTimeout(() => { try { p.bus.disconnect(); } catch { /* gone */ } players = players.filter((q) => q !== p); }, (secs + 2.5) * 1000);
    }
  }

  function play(id, { fadeIn, fadeOut, at } = {}) {
    if (!TRACKS[id] || (current && current.id === id && !current.ended)) return;
    const boss = TRACKS[id].boss;
    const inSecs = fadeIn ?? (boss ? 0.5 : 1.2);
    const outSecs = fadeOut ?? (boss ? 0.5 : 1.0);
    if (current) retire(current, outSecs);
    while (players.length > 3) { const o = players.shift(); try { o.bus.disconnect(); } catch { /* gone */ } }
    const p = makePlayer(id, (at ?? ctx.currentTime) + 0.05);
    players.push(p);
    current = p;
    intensity = 0;
    p.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    if (current.tr.once) p.bus.gain.setValueAtTime(1, ctx.currentTime); else fade(p, 1, inSecs);
    if (paused) p.bus.gain.value = 0.0001;
  }

  function stop(secs = 0.6) {
    if (current) { retire(current, secs); current = null; }
  }

  // boss layers: change takes effect on the next beat, with a cymbal swell as it hits
  function setIntensity(level) {
    if (level === intensity) return;
    if (current && current.tr.boss && level > intensity) {
      drum(current.bus, 'c', ctx.currentTime + 0.02, 1);
      drum(current.bus, 't', ctx.currentTime + 0.02, 1);
    }
    intensity = level;
  }

  function setPaused(on) {
    if (on === paused) return;
    paused = on;
    const t = ctx.currentTime;
    for (const p of players) {
      if (p.ended) continue;
      p.bus.gain.cancelScheduledValues(t);
      p.bus.gain.setValueAtTime(Math.max(p.bus.gain.value, 0.0001), t);
      p.bus.gain.linearRampToValueAtTime(on ? 0.0001 : 1, t + (on ? 0.08 : 0.25));
      if (!on) p.next = t + 0.05; // carry on from the same beat
    }
  }

  function pump(until) {
    for (const p of players) {
      if (p.ended || p.done) continue;
      if (p.next < ctx.currentTime - 0.3) p.next = ctx.currentTime + 0.05; // after a stall: don't rush to catch up
      let guard = 0;
      while (p.next < until && !p.done && guard++ < 4096) {
        stepPlayer(p, p.next, intensity);
        p.next += p.sixteenth;
        p.step++;
      }
    }
  }

  function tick() {
    if (paused) return;
    pump(ctx.currentTime + LOOKAHEAD);
  }

  function dispose() {
    cancelled = true;
    for (const p of players) { try { p.bus.disconnect(); } catch { /* gone */ } }
    players = [];
  }

  return { play, stop, setIntensity, setPaused, tick, pump, dispose, out, get current() { return current ? current.id : null; }, get intensity() { return intensity; }, get paused() { return paused; } };
}
