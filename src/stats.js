// Lifetime stats and the leaderboard, kept in this browser.
//
// Stats cover the heroes played on this device (an online guest's own hero included); the
// leaderboard keeps the 10 best runs, a run being one hero's score from starting a game to
// leaving it. Everything is saved every few seconds and when the page is hidden, so a closed
// tab loses at most a moment of play.

import { CLASSES } from './config.js';

const KEY = 'gl-remake-stats';
const OLD_SCORES = 'gl-remake-hiscores';
const TOP = 10;
const COUNTERS = ['kills', 'gens', 'deaths', 'gold', 'food', 'potions', 'turbo', 'keys'];

function blank() {
  const s = { v: 1, time: 0, games: 0, online: 0, levels: 0, bosses: 0, treasure: 0, byEnemy: {}, heroes: {}, runs: [] };
  for (const k of COUNTERS) s[k] = 0;
  return s;
}

function blankHero() {
  const h = { time: 0, levels: 0, best: 0, games: 0 };
  for (const k of COUNTERS) h[k] = 0;
  return h;
}

const count = (v, max = 1e12) => (typeof v === 'number' && v >= 0 && Number.isFinite(v) ? Math.min(v, max) : 0);
const label = (v, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');

// Reads whatever is stored, keeping only well-formed values (it's this browser's own data,
// but a damaged or hand-edited save shouldn't break the screen).
export function loadStats() {
  const s = blank();
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable or damaged */ }
  if (raw && typeof raw === 'object') {
    for (const k of ['time', 'games', 'online', 'levels', 'bosses', 'treasure', ...COUNTERS]) s[k] = count(raw[k]);
    if (raw.byEnemy && typeof raw.byEnemy === 'object') {
      for (const [k, v] of Object.entries(raw.byEnemy).slice(0, 60)) if (/^[a-z]{1,20}$/.test(k)) s.byEnemy[k] = count(v);
    }
    if (raw.heroes && typeof raw.heroes === 'object') {
      for (const cls of Object.keys(CLASSES)) {
        const h = raw.heroes[cls];
        if (!h || typeof h !== 'object') continue;
        const out = s.heroes[cls] = blankHero();
        for (const k of Object.keys(out)) out[k] = count(h[k]);
      }
    }
    if (Array.isArray(raw.runs)) s.runs = raw.runs.slice(0, TOP * 2).map(cleanRun).filter(Boolean);
  } else {
    // the old high score list becomes the first leaderboard
    try {
      const old = JSON.parse(localStorage.getItem(OLD_SCORES));
      if (Array.isArray(old)) {
        s.runs = old.slice(0, TOP).map((o, i) => o && cleanRun({
          id: `old${i}`, cls: Object.keys(CLASSES).find((c) => CLASSES[c].name === o.name) || 'warrior',
          score: o.score, level: o.level, mode: 'solo', players: 1, date: 0,
        })).filter(Boolean);
      }
    } catch { /* nothing to bring over */ }
  }
  sortRuns(s.runs);
  return s;
}

function cleanRun(r) {
  if (!r || typeof r !== 'object' || !Object.hasOwn(CLASSES, r.cls)) return null;
  return {
    id: label(r.id, 24), cls: r.cls, score: count(r.score, 1e9), level: Math.floor(count(r.level, 16)),
    lvl: Math.floor(count(r.lvl, 999)), kills: count(r.kills, 1e9), time: count(r.time, 1e8),
    mode: ['solo', 'coop', 'online'].includes(r.mode) ? r.mode : 'solo', players: Math.max(1, Math.floor(count(r.players, 4))),
    date: count(r.date, 1e14),
  };
}

const heroKey = (p) => `${p.slot}:${p.cls}`;

function sortRuns(runs) { runs.sort((a, b) => b.score - a.score || b.date - a.date); }

export class Stats {
  constructor() {
    this.data = loadStats();
    this.dirty = false;
    this.savedAt = 0;
    // keyed by slot and hero (an online guest's copy of its hero is rebuilt on each level)
    this.runs = new Map(); // hero -> its run this session
    this.seen = new Map(); // online guest: last kills / gold / alive seen on our hero
    const flush = () => this.save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  hero(cls) { return this.data.heroes[cls] || (this.data.heroes[cls] = blankHero()); }

  // One stat for one of this device's heroes. `n` is how much; `sub` the monster type for kills.
  add(p, key, n = 1, sub) {
    if (!COUNTERS.includes(key)) return;
    this.data[key] += n;
    this.hero(p.cls)[key] += n;
    if (key === 'kills' && sub) this.data.byEnemy[sub] = (this.data.byEnemy[sub] || 0) + n;
    this.dirty = true;
  }

  // A game begins (or a hero joins one) on this device.
  startRun(p, mode, players) {
    this.runs.set(heroKey(p), { id: Math.random().toString(36).slice(2, 12), cls: p.cls, score: 0, level: 0, lvl: p.lvl || 1, kills: 0, time: 0, mode, players, date: Date.now() });
    this.hero(p.cls).games++;
    this.dirty = true;
  }

  gameStarted(online) {
    this.data.games++;
    if (online) this.data.online++;
    this.dirty = true;
  }

  levelCleared(heroes, boss) {
    this.data.levels++;
    if (boss) this.data.bosses++;
    for (const p of heroes) this.hero(p.cls).levels++;
    this.dirty = true;
  }

  treasureDone() { this.data.treasure++; this.dirty = true; }

  // Every frame of play: time played, and each hero's run on the leaderboard.
  //   heroes: this device's heroes in the game · levelNum: the stage being played (0 = hub)
  tick(dt, heroes, levelNum, players) {
    this.data.time += dt;
    for (const p of heroes) {
      const h = this.hero(p.cls);
      h.time += dt;
      let run = this.runs.get(heroKey(p));
      if (!run) { this.startRun(p, players.mode, players.n); run = this.runs.get(heroKey(p)); }
      run.time += dt;
      run.players = Math.max(run.players, players.n);
      if (players.mode !== 'solo' && run.mode === 'solo') run.mode = players.mode;
      if (levelNum > run.level) run.level = levelNum;
      run.lvl = p.lvl || run.lvl;
      run.kills = p.kills || 0;
      if (p.score > run.score) { // (a run's best: continuing after a game over halves the score)
        run.score = p.score;
        if (run.score > h.best) h.best = run.score;
        if (run.score > 0) this.board(run);
      }
    }
    const now = Date.now();
    if (now - this.savedAt > 5000) { this.savedAt = now; this.save(); }
  }

  // Online guest: the host plays out the game, so read our hero's progress off what it sends.
  guestTick(p) {
    const last = this.seen.get(heroKey(p));
    if (last) {
      if (p.kills > last.kills) this.add(p, 'kills', p.kills - last.kills);
      if (p.gold > last.gold) this.add(p, 'gold', p.gold - last.gold);
      if (last.alive && !p.alive) this.add(p, 'deaths');
    }
    this.seen.set(heroKey(p), { kills: p.kills || 0, gold: p.gold || 0, alive: p.alive });
  }

  board(run) {
    const runs = this.data.runs;
    if (!runs.includes(run)) {
      const i = runs.findIndex((r) => r.id === run.id);
      if (i >= 0) runs[i] = run; else runs.push(run);
    }
    sortRuns(runs);
    this.dirty = true;
  }

  // The game is over or left: these runs are finished.
  endRuns() {
    this.runs.clear();
    this.seen.clear();
    this.save();
  }

  // Place on the leaderboard (1-based) of a hero's current run, or 0.
  rankOf(p) {
    const run = this.runs.get(heroKey(p));
    const i = run ? this.data.runs.indexOf(run) : -1;
    return i >= 0 && i < TOP ? i + 1 : 0;
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    const keep = new Set([...this.runs.values()]);
    // the top 10, plus runs still being played (they may climb back on)
    this.data.runs = this.data.runs.filter((r, i) => i < TOP || keep.has(r));
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  get top() { return this.data.runs.slice(0, TOP); }
}
