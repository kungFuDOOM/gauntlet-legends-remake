import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// a browser-like storage and page for stats.js
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, hidden: false };

const { Stats, loadStats } = await import('../src/stats.js');
const { Game } = await import('../src/game.js');

const solo = { mode: 'solo', n: 1 };
const hero = (slot, cls, score = 0) => ({ slot, cls, score, lvl: 1, kills: 0, gold: 0, alive: true });

beforeEach(() => store.clear());

test('stats add up per hero and survive a reload', () => {
  const s = new Stats();
  const p = hero(0, 'warrior');
  s.add(p, 'kills', 1, 'grunt');
  s.add(p, 'kills', 1, 'grunt');
  s.add(p, 'kills', 1, 'demon');
  s.add(p, 'gold', 250);
  s.add(p, 'nonsense', 5);
  s.tick(2, [p], 3, solo);
  s.save();
  const d = loadStats();
  assert.equal(d.kills, 3);
  assert.equal(d.byEnemy.grunt, 2);
  assert.equal(d.gold, 250);
  assert.equal(d.heroes.warrior.kills, 3);
  assert.equal(d.heroes.warrior.games, 1);
  assert.ok(Math.abs(d.time - 2) < 1e-9);
  assert.equal(d.nonsense, undefined);
});

test('the game reports kills, deaths and pickups to its stat hook', () => {
  const g = new Game();
  const p = g.addPlayer(0, 'kb', 'warrior');
  g.startLevel(1);
  const seen = [];
  g.onStat = (pl, key, n, sub) => seen.push([pl.slot, key, n, sub]);
  const e = g.enemies[0] || { type: 'grunt', def: { score: 10, xp: 5, color: '#fff' }, x: 0, y: 0, hp: 1 };
  g.onEnemyKilled(e, p);
  g.killPlayer(p);
  assert.equal(p.kills, 1);
  assert.deepEqual(seen[0], [0, 'kills', 1, e.type]);
  assert.deepEqual(seen[1], [0, 'deaths', 1, undefined]);
});

test('the leaderboard keeps each run at its best score, top 10 only', () => {
  const s = new Stats();
  const p = hero(0, 'wizard', 500);
  s.tick(1, [p], 2, solo);
  p.score = 1200;
  s.tick(1, [p], 5, solo);
  p.score = 600; // continued after a game over: the run keeps its best
  s.tick(1, [p], 5, solo);
  assert.equal(s.top.length, 1);
  assert.equal(s.top[0].score, 1200);
  assert.equal(s.top[0].level, 5);
  assert.equal(s.rankOf(p), 1);
  s.endRuns();
  // eleven more runs: the board keeps the best ten
  for (let i = 1; i <= 11; i++) {
    const q = hero(0, 'archer', i * 100);
    s.tick(1, [q], 1, solo);
    s.endRuns();
  }
  const d = loadStats();
  assert.equal(d.runs.length, 10);
  assert.equal(d.runs[0].score, 1200);
  assert.ok(d.runs.every((r, i) => i === 0 || r.score <= d.runs[i - 1].score));
  assert.ok(!d.runs.some((r) => r.score === 100 || r.score === 200));
});

test('co-op and online runs are labelled with the party', () => {
  const s = new Stats();
  const a = hero(0, 'warrior', 100), b = hero(1, 'valkyrie', 50);
  s.tick(1, [a, b], 1, { mode: 'coop', n: 2 });
  assert.deepEqual(s.top.map((r) => [r.cls, r.mode, r.players]), [['warrior', 'coop', 2], ['valkyrie', 'coop', 2]]);
});

test('an online guest counts its hero from what the host sends', () => {
  const s = new Stats();
  let p = hero(1, 'dwarf');
  s.guestTick(p);
  p.kills = 4; p.gold = 300; p.alive = false;
  s.guestTick(p);
  // the guest rebuilds its hero on a new level: still the same hero
  p = { ...p, alive: true, gold: 100 };
  s.guestTick(p);
  p.kills = 6;
  s.guestTick(p);
  assert.equal(s.data.kills, 6);
  assert.equal(s.data.gold, 300);
  assert.equal(s.data.deaths, 1);
});

test('the old high score list is brought over, and damaged data is ignored', () => {
  store.set('gl-remake-hiscores', JSON.stringify([{ name: 'Wizard', score: 900, level: 3 }, { name: 'Valkyrie', score: 400, level: 1 }]));
  let d = loadStats();
  assert.deepEqual(d.runs.map((r) => [r.cls, r.score]), [['wizard', 900], ['valkyrie', 400]]);

  store.set('gl-remake-stats', JSON.stringify({
    kills: -5, gold: 'lots', time: 1e99, byEnemy: { grunt: 3, __proto__: { polluted: 1 }, 'Bad Key': 2 },
    heroes: { warrior: { kills: 7, extra: 1 }, notahero: { kills: 9 } },
    runs: [{ id: 'x', cls: 'nobody', score: 5 }, { id: 'y', cls: 'archer', score: 1e20, mode: 'evil', players: 99 }, 'junk'],
  }));
  d = loadStats();
  assert.equal(d.kills, 0);
  assert.equal(d.gold, 0);
  assert.ok(d.time <= 1e12);
  assert.deepEqual(Object.keys(d.byEnemy), ['grunt']);
  assert.equal({}.polluted, undefined);
  assert.equal(d.heroes.warrior.kills, 7);
  assert.equal(d.heroes.warrior.extra, undefined);
  assert.equal(d.heroes.notahero, undefined);
  assert.equal(d.runs.length, 1);
  assert.deepEqual([d.runs[0].score, d.runs[0].mode, d.runs[0].players], [1e9, 'solo', 4]);

  store.set('gl-remake-stats', '{not json');
  assert.equal(loadStats().kills, 0);
});

test('a tie keeps the earlier run ahead, and finishing a game reports places on the board', () => {
  const s = new Stats();
  const a = hero(0, 'warrior', 1000);
  s.tick(1, [a], 1, solo);
  s.runs.get('0:warrior').date = 1000; // the first run, long ago
  assert.deepEqual(s.endRuns(), [{ cls: 'warrior', rank: 1, score: 1000 }]);
  const b = hero(0, 'wizard', 1000);
  s.tick(1, [b], 1, solo);
  assert.equal(s.top[0].cls, 'warrior', 'the earlier run keeps first place');
  assert.equal(s.top[1].cls, 'wizard');
  const placed = s.endRuns();
  assert.deepEqual(placed, [{ cls: 'wizard', rank: 2, score: 1000 }]);
  // the last game's run is remembered (for the board's NEW mark), even after a reload
  const fresh = new Stats();
  assert.ok(fresh.isRecent(fresh.top[1]) && !fresh.isRecent(fresh.top[0]));
  // a game with no points reports nothing and keeps the last highlight
  s.tick(1, [hero(0, 'archer', 0)], 1, solo);
  assert.deepEqual(s.endRuns(), []);
  assert.ok(new Stats().isRecent(new Stats().top[1]));
});

test('runs that fall off the top 10 are not announced', () => {
  const s = new Stats();
  for (let i = 0; i < 10; i++) { s.tick(1, [hero(0, 'warrior', 5000 + i)], 1, solo); s.endRuns(); }
  s.tick(1, [hero(0, 'dwarf', 10)], 1, solo);
  assert.deepEqual(s.endRuns(), []);
  assert.ok(!loadStats().runs.some((r) => r.cls === 'dwarf'));
});

test('points are worth more on deeper stages and half on a stage already cleared', () => {
  const g = new Game();
  const p = g.addPlayer(0, 'kb', 'warrior');
  g.isCleared = (n) => n === 3;
  const grunt = (n) => { g.startLevel(n); const before = p.score; g.onEnemyKilled({ type: 'grunt', def: { score: 100, xp: 0, color: '#fff' }, x: 0, y: 0, hp: 0 }, p); return p.score - before; };
  assert.equal(grunt(1), 100);
  assert.equal(grunt(16), 250);
  assert.equal(grunt(3), 60, 'stage 3 (x1.2) is a replay: half');
  // a treasure room pays like the guardian's stage before it
  g.isCleared = () => false;
  g.startLevel(8);
  g.startTreasure(1);
  assert.equal(g.scoreMul, 1.7);
});

test('clearing a stage pays a bonus: cleared, time under par, no deaths', () => {
  const g = new Game();
  const a = g.addPlayer(0, 'kb', 'warrior'), b = g.addPlayer(1, 'kb2', 'valkyrie');
  g.startLevel(1);
  g.time = 100;
  g.killPlayer(b);
  const before = [a.score, b.score];
  const bonus = g.stageBonus(false);
  assert.deepEqual(bonus.rows[0], { slot: 0, clear: 500, time: 1000, flawless: 1000 });
  assert.deepEqual(bonus.rows[1], { slot: 1, clear: 500, time: 1000, flawless: 0 }, 'a hero who died gets no flawless bonus');
  assert.equal(a.score - before[0], 2500);
  assert.equal(b.score - before[1], 1500);
  // past par there's no time bonus; dying and continuing costs half of what the stage earned
  g.startLevel(16);
  g.time = 999;
  assert.equal(g.stageBonus(true).rows[0].time, 0);
  const start = a.score;
  g.startLevel(2);
  g.addScore(a, 1000);
  g.killPlayer(a);
  g.respawn(a);
  assert.equal(a.score, start + 550);
});

test('a run is the whole quest: it carries on from the hero save, across sessions', () => {
  const g = new Game();
  let p = g.addPlayer(0, 'kb', 'archer');
  p.score = 4000; p.kills = 12;
  let s = new Stats();
  s.tick(1, [p], 3, solo);
  const saved = { ...g.heroSave(p), run: s.runInfo(p) };
  assert.equal(saved.score, 4000);
  s.endRuns();
  // next session: the same hero, and the same entry, still climbing
  s = new Stats();
  p = g.addPlayer(0, 'kb', 'archer', JSON.parse(JSON.stringify(saved)));
  assert.equal(p.score, 4000);
  assert.equal(p.kills, 12);
  p.score = 6500;
  s.tick(1, [p], 5, solo);
  assert.equal(s.top.length, 1);
  assert.equal(s.top[0].id, saved.run.id);
  assert.deepEqual([s.top[0].score, s.top[0].level, s.top[0].kills], [6500, 5, 12]);
  assert.ok(Math.abs(s.top[0].time - 2) < 1e-9, 'time played adds up over the quest');
  // the quest is won: its entry says so, after a reload too
  s.questWon([p]);
  s.endRuns();
  assert.equal(loadStats().runs[0].won, true);

  // an entry that fell off the board comes back from the hero's save
  store.clear();
  s = new Stats();
  p = g.addPlayer(0, 'kb', 'archer', JSON.parse(JSON.stringify(saved)));
  s.tick(1, [p], 3, solo);
  assert.equal(s.top[0].id, saved.run.id);
  assert.equal(s.top[0].score, 4000);
  // a hero with no run (a new quest) starts a new entry
  const q = g.addPlayer(1, 'kb2', 'wizard', { lvl: 3 });
  q.score = 10;
  s.tick(1, [q], 1, solo);
  assert.equal(s.top.length, 2);
  assert.notEqual(s.top[1].id, saved.run.id);
});
