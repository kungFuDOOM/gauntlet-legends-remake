import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, hidden: false };

const lb = await import('../src/leaderboard.js');
const { Stats } = await import('../src/stats.js');
beforeEach(() => store.clear());

test('cleanName accepts normal names and trims', () => {
  assert.deepEqual(lb.cleanName('  Harambe 22 '), { ok: true, name: 'Harambe 22' });
  assert.equal(lb.cleanName('a_b-c.d').ok, true);
});
test('cleanName enforces 3-12 chars and charset', () => {
  for (const n of ['ab', '', 'x'.repeat(13), 'né♥me', '<b>hi</b>']) assert.equal(lb.cleanName(n).ok, false, n);
});
test('cleanName blocks profanity (incl. leetspeak) and personal info, not innocent words', () => {
  for (const n of ['f u c k', 'SH1T', 'b1tch', 'n4zi', '5551234567', 'joe.com']) assert.equal(lb.cleanName(n).ok, false, n);
  for (const n of ['Classic', 'Assassin', 'Warrior', 'Sorceress']) assert.equal(lb.cleanName(n).ok, true, n);
});
test('token is stable and only a random hex string', () => {
  const a = lb.getToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(lb.getToken(), a);
});
test('cleanRows keeps well-formed rows only and clamps values', () => {
  const rows = lb.cleanRows([
    { id: 1, name: 'AAA', score: 500, cls: 'warrior', level: 3, won: false, created_at: '2026-10-18T00:00:00Z' },
    { id: 2, name: 'BBB', score: 9e99, cls: 'x'.repeat(40), level: 99, won: 'yes', created_at: 'nope' },
    { id: 3, name: 7, score: 1 }, null, 'x', { name: 'CCC', score: 'a' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].score, 1e7); assert.equal(rows[1].level, 16); assert.equal(rows[1].won, false); assert.equal(rows[1].cls.length, 16);
  assert.deepEqual(lb.cleanRows('junk'), []);
});
test('no wallet or contact fields exist in the client or the submit payload', async () => {
  const sent = [];
  globalThis.fetch = async (url, o) => { sent.push({ url, body: JSON.parse(o.body) }); return { ok: true, json: async () => ({ id: 5, rank: 2 }) }; };
  const r = await lb.submitScore({ name: 'Tester', score: 1234.6, cls: 'warrior', level: 4, won: false });
  assert.deepEqual(r, { id: 5, rank: 2 });
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['p_cls', 'p_level', 'p_name', 'p_score', 'p_token', 'p_won']);
  assert.equal(sent[0].body.p_score, 1235);
  assert.match(sent[0].url, /\/rest\/v1\/rpc\/submit_gauntlet_score$/);
  assert.deepEqual(lb.getMine(), [5]);
});
test('offline or rejected submits fail soft with a friendly message', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(lb.submitScore({ name: 'Tester', score: 1, cls: 'warrior', level: 0, won: false }), (e) => lb.friendlyError(e) === 'OFFLINE - SCORE NOT SAVED');
  await assert.rejects(lb.fetchTop(), TypeError);
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ message: 'slow down' }) });
  await assert.rejects(lb.submitScore({ name: 'Tester', score: 1, cls: 'warrior', level: 0, won: false }), (e) => /SLOW DOWN/.test(lb.friendlyError(e)));
});
test('only this device\'s own heroes are offered, best run first', () => {
  const s = new Stats();
  const mine = { slot: 0, cls: 'warrior', score: 400, lvl: 1, kills: 0, gold: 0, alive: true };
  const mine2 = { slot: 1, cls: 'wizard', score: 900, lvl: 1, kills: 0, gold: 0, alive: true };
  const other = { slot: 2, cls: 'archer', score: 99999, lvl: 1, kills: 0, gold: 0, alive: true };
  for (const p of [mine, mine2, other]) s.startRun(p, 'online', 3);
  assert.equal(s.globalCandidate([mine, mine2]).cls, 'wizard');
  assert.equal(s.globalCandidate([mine]).score, 400);
  assert.equal(s.globalCandidate([]), null);
  const zero = { slot: 3, cls: 'dwarf', score: 0, lvl: 1, kills: 0, gold: 0, alive: true };
  s.startRun(zero, 'solo', 1);
  assert.equal(s.globalCandidate([zero]), null);
});
