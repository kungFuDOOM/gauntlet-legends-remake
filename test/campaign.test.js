import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSave, loadSave, writeSave, isUnlocked, completeLevel, runeCount, guardiansDefeated, nextStage, levelNumber,
  SHOP, buy, priceOf, TOTAL_RUNES,
} from '../src/campaign.js';

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('stages unlock in order and the Underworld needs all three guardians', () => {
  const s = newSave();
  assert.ok(isUnlocked(s.progress, 0, 1));
  assert.ok(!isUnlocked(s.progress, 0, 2));
  assert.ok(isUnlocked(s.progress, 1, 1), 'every realm can be started');
  assert.ok(!isUnlocked(s.progress, 3, 1), 'Underworld starts sealed');
  completeLevel(s.progress, levelNumber(0, 1), []);
  assert.ok(isUnlocked(s.progress, 0, 2));
  for (const r of [0, 1, 2]) completeLevel(s.progress, levelNumber(r, 4), ['guardian']);
  assert.equal(guardiansDefeated(s.progress), 3);
  assert.ok(isUnlocked(s.progress, 3, 1));
});

test('rune stones are counted once per level and kind', () => {
  const s = newSave();
  completeLevel(s.progress, 1, ['hidden']);
  completeLevel(s.progress, 1, ['hidden']);
  completeLevel(s.progress, 4, ['guardian']);
  assert.equal(runeCount(s.progress), 2);
  assert.equal(TOTAL_RUNES, 16);
});

test('beating Skorne wins the quest', () => {
  const s = newSave();
  completeLevel(s.progress, 16, ['guardian']);
  assert.ok(s.progress.won);
});

test('nextStage points at the first open, unfinished stage', () => {
  const s = newSave();
  assert.deepEqual(nextStage(s.progress), { realm: 0, stage: 1 });
  completeLevel(s.progress, 1, []);
  assert.deepEqual(nextStage(s.progress), { realm: 0, stage: 2 });
});

test('shop purchases cost gold, apply effects and stat prices escalate', () => {
  const p = { gold: 2000, hp: 100, potions: 0, keys: 0, strength: 10, shotDmg: 5, armor: 0.1, speed: 100, magic: 1 };
  const str = SHOP.find((i) => i.id === 'strength');
  assert.equal(priceOf(p, str), 500);
  assert.ok(buy(p, str));
  assert.equal(p.strength, 14);
  assert.equal(p.gold, 1500);
  assert.equal(priceOf(p, str), 750);
  assert.ok(buy(p, SHOP.find((i) => i.id === 'food')));
  assert.equal(p.hp, 350);
  p.gold = 10;
  assert.ok(!buy(p, SHOP.find((i) => i.id === 'potion')), 'cannot buy without gold');
  assert.equal(p.potions, 0);
});

test('saves round-trip and survive corrupt data', () => {
  const st = memoryStorage();
  const s = newSave();
  completeLevel(s.progress, 1, ['hidden']);
  s.heroes.warrior = { lvl: 4, gold: 120 };
  writeSave(s, st);
  const back = loadSave(st);
  assert.deepEqual(back.progress.completed, { 1: true });
  assert.equal(back.heroes.warrior.lvl, 4);
  st.setItem('gl-remake-save', '{not json');
  assert.deepEqual(loadSave(st).progress.completed, {});
});

test('secret heroes unlock from guardians and Rune Stones', async () => {
  const { unlockedClasses } = await import('../src/campaign.js');
  const s = newSave();
  assert.deepEqual(unlockedClasses(s.progress), ['warrior', 'valkyrie', 'wizard', 'archer']);
  completeLevel(s.progress, 4, ['guardian']);
  assert.ok(unlockedClasses(s.progress).includes('minotaur'));
  assert.ok(!unlockedClasses(s.progress).includes('tigress'));
  for (let n = 1; n <= 12; n++) completeLevel(s.progress, n, ['hidden']);
  const all = unlockedClasses(s.progress);
  for (const c of ['minotaur', 'falconess', 'jackal', 'tigress']) assert.ok(all.includes(c), c);
});

test('difficulty ramps with level and party size', async () => {
  const { difficulty } = await import('../src/config.js');
  const a = difficulty(1, 1), b = difficulty(16, 1), c = difficulty(1, 4);
  assert.equal(a.hp, 1);
  assert.ok(b.hp > 2 && b.dmg > 1.5, 'late levels are much tougher');
  assert.ok(c.hp > 1.8 && c.spawn > 1.5 && c.localCap > a.localCap, 'bigger parties face more monsters');
  assert.ok(b.gold > a.gold, 'later realms pay more');
});
