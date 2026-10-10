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
