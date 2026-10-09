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
