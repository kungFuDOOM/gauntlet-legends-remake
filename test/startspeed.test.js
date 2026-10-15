import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, startSpeed, maxSpeed, START_SPEED_BOOST_MIN, START_SPEED_BOOST_MAX } from '../src/config.js';

test('starting speed is boosted 10-20%, scaled by the speed stat', () => {
  const ratios = Object.values(CLASSES).map(d => ({ d, r: startSpeed(d) / d.speed - 1 }));
  for (const { r } of ratios) assert.ok(r >= START_SPEED_BOOST_MIN - 1e-9 && r <= START_SPEED_BOOST_MAX + 1e-9);
  const slow = ratios.reduce((a, b) => (b.d.speed < a.d.speed ? b : a));
  const fast = ratios.reduce((a, b) => (b.d.speed > a.d.speed ? b : a));
  assert.ok(Math.abs(slow.r - START_SPEED_BOOST_MIN) < 1e-9);
  assert.ok(Math.abs(fast.r - START_SPEED_BOOST_MAX) < 1e-9);
  for (const d of Object.values(CLASSES)) assert.ok(startSpeed(d) <= maxSpeed(d));
});
