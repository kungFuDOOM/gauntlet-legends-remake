import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || globalThis; // the announcer looks for speech synthesis
const { Game } = await import('../src/game.js');

const idle = { get: () => ({ x: 0, y: 0, attack: false, magic: false, turbo: false, pressed: {} }) };

function arena() {
  const g = new Game();
  const p = g.addPlayer(0, 'kb', 'warrior');
  g.startHub();
  g.levelNum = 9;
  g.refreshDifficulty();
  p.invuln = 0;
  return { g, p };
}

test('chargers crouch, then lunge at the hero', () => {
  const { g, p } = arena();
  const e = g.spawnEnemy('spider', p.x + 130, p.y);
  e.cd = 0;
  let crouched = false, lunged = false, closest = Infinity;
  for (let i = 0; i < 180; i++) {
    g.update(1 / 60, idle);
    p.hp = 5000;
    if (e.cd2 > 0) crouched = true;
    if (e.charging > 0) lunged = true;
    closest = Math.min(closest, Math.hypot(e.x - p.x, e.y - p.y));
  }
  assert.ok(crouched && lunged, 'it winds up and charges');
  assert.ok(closest < 40, 'the lunge reaches the hero');
});

test('brutes shove the hero back', () => {
  const { g, p } = arena();
  const e = g.spawnEnemy('orc', p.x + 20, p.y);
  e.cd = 0;
  const x0 = p.x;
  for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
  assert.ok(p.x < x0 - 8, 'the hero was knocked away from the orc');
});

test('flyers cross lava; walkers go round it', () => {
  const { g } = arena();
  const bat = g.spawnEnemy('bat', 100, 100), goblin = g.spawnEnemy('goblin', 100, 100);
  g.collides = (x, y, r, avoid) => avoid; // pretend everything ahead is lava
  assert.equal(g.move(bat, 5, 0), false);
  assert.equal(g.move(goblin, 5, 0), true);
});
