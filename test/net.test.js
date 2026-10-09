import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { SnapshotWriter, SnapshotReader } from '../src/netstate.js';
import { T } from '../src/level.js';

const idle = { get: () => ({ x: 0, y: 0, attack: false, magic: false, turbo: false, pressed: {} }) };
const wire = (o) => JSON.parse(JSON.stringify(o)); // what a data channel would deliver

test('a guest mirrors the host game from snapshots', () => {
  const host = new Game();
  host.addPlayer(0, 'kb', 'warrior');
  host.addPlayer(1, 'net1', 'valkyrie');
  host.startLevel(5);
  host.fx = [];
  for (let i = 0; i < 30; i++) host.update(1 / 60, idle);
  const writer = new SnapshotWriter();
  const reader = new SnapshotReader(Game);

  const g = reader.apply(wire(writer.game(host)), wire(host.fx));
  assert.equal(g.levelKey, 'L5');
  assert.equal(g.w, host.w);
  assert.deepEqual([...g.tiles], [...host.tiles]);
  assert.equal(g.allPlayers().length, 2);
  assert.equal(g.players[1].cls, 'valkyrie');
  assert.equal(g.players[1].source, 'net1');
  assert.equal(g.enemies.length, host.enemies.length);
  assert.equal(g.items.length, host.items.length);
  assert.equal(g.gens.length, host.gens.length);
  assert.ok(Math.abs(g.players[0].x - host.players[0].x) < 0.2);

  // objects keep their identity between snapshots (the renderer keys models on them)
  const firstEnemy = g.enemies[0], hero = g.players[0];
  host.players[0].x += 40;
  host.enemies[0].hp -= 1;
  // open a gate on the host: the guest gets the changed tiles
  const door = host.tiles.indexOf(T.DOOR);
  assert.ok(door >= 0, 'level 5 has a gate');
  host.openDoorAt(door % host.w, Math.floor(door / host.w));
  host.fx = [];
  host.text(100, 100, 'HELLO');
  const g2 = reader.apply(wire(writer.game(host)), wire(host.fx));
  assert.equal(g2, g);
  assert.equal(g.enemies[0], firstEnemy);
  assert.equal(g.players[0], hero);
  assert.equal(firstEnemy.hp, host.enemies[0].hp);
  assert.equal(g.tiles[door], T.FLOOR);
  assert.ok(g.texts.some((t) => t.text === 'HELLO'), 'effects arrive as events');
  // positions glide toward the new snapshot rather than jumping
  reader.tick(1 / 60, reader.arrived + reader.interval);
  assert.ok(Math.abs(hero.x - host.players[0].x) < 0.2);

  // a monster the host removed disappears for the guest
  host.enemies.shift();
  reader.apply(wire(writer.game(host)), []);
  assert.equal(g.enemies.length, host.enemies.length);
  assert.ok(!g.enemies.includes(firstEnemy));

  // a new level replaces the mirror's level
  host.startHub();
  reader.apply(wire(writer.game(host)), []);
  assert.equal(g.levelKey, 'H');
  assert.ok(g.level.hub);
});

test('snapshots stay small enough to send 20 times a second', () => {
  const host = new Game();
  for (let i = 0; i < 4; i++) host.addPlayer(i, `net${i}`, ['warrior', 'valkyrie', 'wizard', 'archer'][i]);
  host.startLevel(13);
  for (let i = 0; i < 60; i++) host.spawnEnemy('grunt', host.players[0].x + i, host.players[0].y);
  const bytes = JSON.stringify(new SnapshotWriter().game(host)).length;
  assert.ok(bytes < 12000, `${bytes} bytes`);
});

test('guests shrug off malicious or malformed snapshots from a host', async () => {
  const { cleanUi, cleanEvents, cleanGame } = await import('../src/netstate.js');
  const reader = new SnapshotReader(Game);
  const evil = {
    k: 'L999', q: 1, tm: 'soon', tiles: [1e12, 99, -5, 3], P: [], E: [], G: [], I: [], R: [],
  };
  assert.equal(reader.apply(evil, []), null, 'an unknown level key is refused');
  assert.equal(cleanGame({ k: '__proto__' }), null);

  const host = new Game();
  host.addPlayer(0, 'kb', 'warrior');
  host.startLevel(1);
  const snap = wire(new SnapshotWriter().game(host));
  snap.tiles = [0, 99, 5, 3, 1e9, 2, 'x', 'y'];
  snap.P = [snap.P[0], [3, 'archer', '<img src=x onerror=alert(1)>', 'NaN', Infinity], [1, '__proto__', 'net1'], 'junk', [2, 'wizard']];
  snap.E = [...snap.E, [1e15, 'toString', 1, 1], [7, 'grunt', NaN, 'a', {}, null]];
  snap.I = [[1, 'amulet', '__proto__', 1, 1], [2, 'rune', 'hidden', 5, 5], [3, 'gold<script>', 0, 1, 1]];
  snap.R = [[1, 'nuke', 0, 0], [2, 'arrow', 1, 1, 1, 1]];
  snap.E.length = Math.min(snap.E.length, 50);
  const fx = [['a', 'constructor'], ['a', '__proto__'], ['p', 1, 1, 1, 1, 'url(javascript:alert(1))'], ['t', 0, 0, 'x'.repeat(10000)], ['zz'], 'junk', ['b', 0, 0, '#fff', 1e9, 1e9]];
  const g = reader.apply(snap, fx);
  assert.ok(g, 'the valid parts still apply');
  assert.equal(g.tiles[0], 9, 'tile values are clamped to real tile types');
  assert.deepEqual(g.allPlayers().map((p) => p.cls).sort(), ['archer', 'warrior'], 'unknown hero classes are dropped');
  const archer = g.allPlayers().find((p) => p.cls === 'archer');
  assert.equal(archer.source, 'net0', 'odd source names are replaced');
  assert.ok(Number.isFinite(archer.x) && Number.isFinite(archer.y));
  assert.ok(!g.enemies.some((e) => e.type === 'toString'));
  assert.ok(g.enemies.every((e) => Number.isFinite(e.x) && Number.isFinite(e.hp)));
  assert.deepEqual(g.items.map((i) => i.type), ['rune']);
  assert.deepEqual(g.projs.map((p) => p.kind), ['arrow']);
  assert.ok(g.particles.length <= 120, 'bursts are capped');
  assert.ok(g.particles.every((p) => /^#[0-9a-f]{3,8}$/i.test(p.color)), 'colors are checked');
  assert.ok(g.texts.every((t) => t.text.length <= 60), 'floating text is capped');
  assert.deepEqual(cleanEvents([['a', 'hasOwnProperty'], ['a', 'join', 'x'.repeat(99)]]).map((e) => e[1]), ['join']);

  // menu state
  assert.equal(cleanUi('hacked', {}), null);
  const ui = cleanUi('select', {
    slots: [{ cls: '__proto__' }, { cls: 'wizard', source: 'net1', ready: 1 }, 5],
    prog: { completed: { 4: true, __proto__: { polluted: true }, 99: true }, runes: { h1: true, 'x"><b>': true } },
    heroes: { wizard: { lvl: 1e12, gold: -5 }, constructor: { lvl: 1 } },
    story: { lines: ['ok', 42, 'y'.repeat(5000)], idx: 99 },
    toast: '<b>hi</b>'.repeat(50),
  });
  assert.deepEqual(ui.slots, [null, { source: 'net1', cls: 'wizard', ready: true }, null]);
  assert.deepEqual(Object.keys(ui.prog.completed), ['4']);
  assert.deepEqual(Object.keys(ui.prog.runes), ['h1']);
  assert.equal(({}).polluted, undefined, 'no prototype pollution');
  assert.deepEqual(ui.heroes, { wizard: { lvl: 999, gold: 0 } });
  assert.deepEqual(ui.story.lines.map((l) => l.length), [2, 0, 400]);
  assert.equal(ui.story.idx, 11);
  assert.ok(ui.toast.length <= 120);
});

test('room codes are letters only and the right length', async () => {
  const { cleanCode, CODE_LENGTH } = await import('../src/net.js');
  assert.equal(CODE_LENGTH, 6);
  assert.equal(cleanCode(' ab-c1d<e>f9g '), 'ABCDEF');
  assert.equal(cleanCode(null), '');
});
