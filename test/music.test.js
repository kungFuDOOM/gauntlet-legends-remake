import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TRACKS, TRACK_IDS, SCALES, DRUMS, trackFor, levelTrack, motifOf } = await import('../src/music-data.js');
const { BOSSES, LEVELS_PER_REALM } = await import('../src/level.js');
const { REALMS, STAGES } = await import('../src/campaign.js');

const regular = [];
const bosses = [];
for (let n = 1; n <= REALMS * STAGES; n++) (n % LEVELS_PER_REALM === 0 ? bosses : regular).push(n);

test('every level and guardian has its own track', () => {
  const ids = [...regular.map((n) => levelTrack(n, false)), ...bosses.map((n) => levelTrack(n, true))];
  assert.equal(ids.length, REALMS * STAGES);
  assert.equal(new Set(ids).size, ids.length, 'no two levels share a track id');
  for (const id of ids) assert.ok(TRACKS[id], `${id} exists`);
  assert.equal(bosses.length, BOSSES.length);
  for (const n of bosses) assert.ok(TRACKS[levelTrack(n, true)].boss, 'guardian tracks are boss tracks');
});

test('menus, hub, shop, training, treasure and stingers each have a track', () => {
  const base = { state: 'play', inLevel: true, levelNum: 1, isBoss: false };
  const picks = {
    title: trackFor({ state: 'title' }), story: trackFor({ state: 'story' }), shop: trackFor({ state: 'shop' }),
    victory: trackFor({ state: 'ending' }),
    hub: trackFor({ ...base, state: 'realm', hub: true }), training: trackFor({ ...base, tutorial: true }),
    treasure: trackFor({ ...base, treasure: true }), clear: trackFor({ ...base, state: 'levelclear' }),
    bossclear: trackFor({ ...base, state: 'levelclear', isBoss: true, levelNum: 4 }), defeat: trackFor({ ...base, state: 'gameover' }),
  };
  for (const [want, got] of Object.entries(picks)) assert.equal(got, want);
  assert.equal(trackFor({ ...base, state: 'paused', levelNum: 6 }), 'level_6', 'pausing keeps the level track');
  assert.equal(trackFor({ ...base, levelNum: 8, isBoss: true }), 'boss_2');
});

test('track ids, names and melodies are all unique', () => {
  assert.equal(new Set(TRACK_IDS).size, TRACK_IDS.length);
  for (const [id, t] of Object.entries(TRACKS)) assert.equal(t.id, id);
  assert.equal(new Set(Object.values(TRACKS).map((t) => t.name)).size, TRACK_IDS.length, 'names');
  assert.equal(new Set(Object.values(TRACKS).map((t) => motifOf(t))).size, TRACK_IDS.length, 'melodies');
  assert.equal(new Set(Object.values(TRACKS).map((t) => `${t.root}${t.mode}${t.bpm}`)).size, TRACK_IDS.length, 'key + tempo');
});

test('every spec is well formed, and loops line up', () => {
  for (const t of Object.values(TRACKS)) {
    assert.ok(SCALES[t.mode], `${t.id} scale`);
    assert.ok(DRUMS[t.drums], `${t.id} drums`);
    assert.ok(t.bpm >= 55 && t.bpm <= 170);
    assert.equal(t.bass.pat.length, 16, `${t.id} bass pattern is one bar`);
    for (const d of t.prog) assert.ok(d >= 1 && d <= 7);
    const m = motifOf(t);
    assert.ok(/^[0-9a-c.\-]+$/.test(m), `${t.id} melody characters`);
    assert.equal((t.prog.length * 16) % m.length, 0, `${t.id} melody divides the loop`);
  }
});

test('guardian themes are faster and heavier than the level music', () => {
  const lvl = Math.max(...regular.map((n) => TRACKS[levelTrack(n, false)].bpm));
  for (const n of bosses) assert.ok(TRACKS[levelTrack(n, true)].bpm > lvl, `boss ${n} is faster than every level`);
});
