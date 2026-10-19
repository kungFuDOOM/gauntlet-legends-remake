import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || globalThis; // the announcer looks for speech synthesis
const { Game } = await import('../src/game.js');
const { CLASS_ORDER, TURBO_COST } = await import('../src/config.js');

const DT = 1 / 60;
const idle = { get: () => ({ x: 0, y: 0, attack: false, magic: false, turbo: false, pressed: {} }) };

function arena(cls) {
  const g = new Game();
  const p = g.addPlayer(0, 'kb', cls);
  g.startHub();
  g.levelNum = 9;
  g.refreshDifficulty();
  p.invuln = 0;
  return { g, p };
}
// a tough, harmless dummy so hits land without killing it
function dummy(g, x, y) {
  const e = g.spawnEnemy('orc', x, y);
  e.hp = e.maxHp = 1e6;
  e.cd = 1e9;
  return e;
}
// run frames; return the biggest turbo gain in one frame beyond the passive recharge (dt * 4)
function maxExtraCharge(g, p, frames) {
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    p.hp = 1e6;
    const before = p.turbo;
    g.update(DT, idle);
    const passive = Math.min(100, before + DT * 4) - before;
    worst = Math.max(worst, p.turbo - before - passive);
  }
  return worst;
}

test('a hit flagged as Turbo adds 0 charge; a normal hit still charges', () => {
  const { g, p } = arena('warrior');
  const e = dummy(g, p.x + 200, p.y);
  p.turbo = 10;
  g.damageEnemy(e, 40, p, false, true);
  assert.equal(p.turbo, 10, 'turbo hit: no charge');
  g.damageEnemy(e, 40, p, false);
  assert.equal(p.turbo, 10 + 40 * 0.45, 'normal hit: charges as before');
  p.turbo = 10;
  const gen = { hp: 1e6, r: 10, x: p.x + 200, y: p.y, hurt: 0 };
  g.damageGen(gen, 40, p, true);
  assert.equal(p.turbo, 10, 'turbo hit on a generator: no charge');
  g.damageGen(gen, 40, p);
  assert.equal(p.turbo, 10 + 40 * 0.3, 'normal hit on a generator still charges');
});

for (const cls of CLASS_ORDER) {
  test(`${cls}: a full Turbo attack never refills the meter, but a normal shot does`, () => {
    const { g, p } = arena(cls);
    // enemies in melee range and in a ring/line for the projectile moves
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      dummy(g, p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60);
    }
    for (let i = 1; i <= 4; i++) dummy(g, p.x + p.fx * 80 * i, p.y + p.fy * 80 * i);
    p.turbo = TURBO_COST + 20;
    const hpBefore = g.enemies.map((e) => e.hp);
    g.turboAttack(p);
    assert.ok(Math.abs(p.turbo - 20) < 1e-9, 'cost is paid and instant hits (spin) add nothing');
    const extra = maxExtraCharge(g, p, 120);
    assert.ok(g.enemies.some((e, i) => e.hp < hpBefore[i]), 'the turbo attack did hit something');
    assert.ok(extra < 1e-9, `no extra charge during/after turbo (got ${extra})`);

    // control: an ordinary shot hit does charge
    const { g: g2, p: p2 } = arena(cls);
    const e2 = dummy(g2, p2.x + 30, p2.y);
    p2.turbo = 20;
    g2.fire(p2, Math.atan2(e2.y - p2.y, e2.x - p2.x));
    assert.ok(maxExtraCharge(g2, p2, 30) > 1, 'a normal projectile hit charges the meter');
  });

  test(`${cls}: a delayed Turbo projectile that lands after the move ends gives 0 charge`, () => {
    const { g, p } = arena(cls);
    const e = dummy(g, p.x + 400, p.y);
    p.fx = 1; p.fy = 0;
    p.turbo = 20;
    g.fire(p, 0, { turbo: true, speed: 300, life: 3 }); // ~1.3s of flight
    // let all turbo animation state expire before it arrives
    p.swing = 0; p.dash = null; p.shotCd = -1;
    const hp0 = e.hp;
    const extra = maxExtraCharge(g, p, 150);
    assert.ok(e.hp < hp0, 'the projectile landed');
    assert.ok(extra < 1e-9, 'late turbo hit gave no charge');
    // the same projectile untagged does charge
    const { g: g2, p: p2 } = arena(cls);
    const e2 = dummy(g2, p2.x + 400, p2.y);
    p2.fx = 1; p2.fy = 0; p2.turbo = 20;
    g2.fire(p2, 0, { speed: 300, life: 3 });
    assert.ok(maxExtraCharge(g2, p2, 150) > 1 && e2.hp < e2.maxHp);
  });
}

test('the player projectile carries the turbo tag (host state; guests only mirror p.turbo)', () => {
  const { g, p } = arena('wizard');
  g.fire(p, 0, { turbo: true });
  g.fire(p, 0);
  assert.equal(g.projs[0].turbo, true);
  assert.equal(g.projs[1].turbo, false);
});
