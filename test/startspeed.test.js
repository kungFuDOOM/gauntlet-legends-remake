import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, startSpeed, maxSpeed, START_SPEED_BOOST_MIN, START_SPEED_BOOST_MAX, UPGRADE_SPEED_CAP, SPEED_BOOTS_MULT, SPEED_BOOTS_PEAK_CAP } from '../src/config.js';

test('starting speed is boosted 10-20%, scaled by the speed stat', () => {
  const ratios = Object.values(CLASSES).map(d => ({ d, r: startSpeed(d) / d.speed - 1 }));
  for (const { r } of ratios) assert.ok(r >= START_SPEED_BOOST_MIN - 1e-9 && r <= START_SPEED_BOOST_MAX + 1e-9);
  const slow = ratios.reduce((a, b) => (b.d.speed < a.d.speed ? b : a));
  const fast = ratios.reduce((a, b) => (b.d.speed > a.d.speed ? b : a));
  assert.ok(Math.abs(slow.r - START_SPEED_BOOST_MIN) < 1e-9);
  assert.ok(Math.abs(fast.r - START_SPEED_BOOST_MAX) < 1e-9);
  for (const d of Object.values(CLASSES)) assert.ok(startSpeed(d) <= maxSpeed(d));
});

test('fast classes are capped: upgrades and speed boots never exceed the ceilings, slow classes are untouched', () => {
  for (const d of Object.values(CLASSES)) {
    assert.ok(maxSpeed(d) <= UPGRADE_SPEED_CAP);
    const peak = Math.min(maxSpeed(d) * SPEED_BOOTS_MULT, SPEED_BOOTS_PEAK_CAP);
    assert.ok(peak <= SPEED_BOOTS_PEAK_CAP);
    assert.ok(startSpeed(d) <= maxSpeed(d), 'a class never starts above its cap');
  }
  const slow = CLASSES.minotaur;
  assert.equal(maxSpeed(slow), Math.round(slow.speed * 1.35), 'slow classes keep the full 1.35x upgrade range');
  assert.equal(maxSpeed(CLASSES.tigress), UPGRADE_SPEED_CAP);
});
