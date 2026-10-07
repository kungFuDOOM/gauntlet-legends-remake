import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, bfs, walkable, T, levelInfo } from '../src/level.js';

// Simulate a party that collects every reachable key and opens doors in the worst order.
function solvable(L) {
  const { w, h } = L;
  const tiles = L.tiles.slice();
  const keyCells = new Set(L.items.filter((i) => i.type === 'key').map((i) => i.y * w + i.x));
  let keys = 0;
  for (let guard = 0; guard < 200; guard++) {
    const d = bfs(tiles, w, h, [[L.start.x, L.start.y]], walkable);
    for (const c of [...keyCells]) if (d[c] >= 0) { keyCells.delete(c); keys++; }
    if (d[L.exit.y * w + L.exit.x] >= 0) return true;
    // frontier doors: pick the LAST one found (adversarial-ish ordering)
    let door = -1;
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] !== T.DOOR) continue;
      const x = i % w, y = (i / w) | 0;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d[(y + dy) * w + x + dx] >= 0)) door = i;
    }
    if (door < 0 || keys <= 0) return false;
    keys--;
    const stack = [door];
    while (stack.length) {
      const c = stack.pop();
      if (tiles[c] !== T.DOOR) continue;
      tiles[c] = T.FLOOR;
      stack.push(c + 1, c - 1, c + w, c - w);
    }
  }
  return false;
}

test('levels 1-24 are generated and the exit is always reachable', () => {
  for (let n = 1; n <= 24; n++) {
    const L = generateLevel(n);
    assert.ok(L.w > 0 && L.h > 0);
    assert.equal(L.tiles.length, L.w * L.h);
    if (levelInfo(n).isBoss) {
      assert.ok(L.boss, `level ${n} should have a boss`);
      assert.equal(L.tiles[L.exit.y * L.w + L.exit.x], T.SEALED);
      continue;
    }
    assert.equal(L.tiles[L.exit.y * L.w + L.exit.x], T.EXIT);
    assert.ok(solvable(L), `level ${n} must be solvable with the keys provided`);
  }
});

test('many random seeds are solvable', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const n = 1 + (seed % 11);
    if (levelInfo(n).isBoss) continue;
    assert.ok(solvable(generateLevel(n, seed * 31337)), `seed ${seed} level ${n}`);
  }
});

test('generation is deterministic', () => {
  const a = generateLevel(3), b = generateLevel(3);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.deepEqual(a.items, b.items);
});

test('spawned things sit on walkable floor', () => {
  for (let n = 1; n <= 24; n++) {
    const L = generateLevel(n);
    for (const thing of [...L.items, ...L.generators, ...L.enemies]) {
      assert.equal(L.tiles[thing.y * L.w + thing.x], T.FLOOR, `level ${n} ${thing.type} at ${thing.x},${thing.y}`);
    }
  }
});

test('every level hides exactly one Rune Stone, and secret rooms open only by breaking the cracked wall', () => {
  for (let n = 1; n <= 16; n++) {
    if (levelInfo(n).isBoss) continue;
    const L = generateLevel(n);
    const runes = L.items.filter((i) => i.type === 'rune');
    assert.equal(runes.length, 1, `level ${n} rune count`);
    const r = runes[0];
    assert.equal(L.tiles[r.y * L.w + r.x], T.FLOOR);
    if (!L.secret) continue;
    const open = (t) => t === T.FLOOR || t === T.EXIT || t === T.BRIDGE || t === T.SPIKES || t === T.DOOR;
    const before = bfs(L.tiles, L.w, L.h, [[L.start.x, L.start.y]], open);
    const after = bfs(L.tiles, L.w, L.h, [[L.start.x, L.start.y]], (t) => open(t) || t === T.CRACKED);
    const i = r.y * L.w + r.x;
    assert.equal(before[i], -1, `level ${n}: the secret rune must be sealed off`);
    assert.ok(after[i] >= 0, `level ${n}: breaking the wall must open the way`);
  }
});
