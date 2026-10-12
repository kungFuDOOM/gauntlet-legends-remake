// The guardians' fights. Each guardian has its own moves, chosen from a set that grows over
// three phases (at two thirds and one third of its health, it roars and gets nastier).
// Every move is telegraphed: the guardian winds up (glowing, jaw open) and attacks that land
// on the ground mark their spot first, so a fight is about reading and dodging, not
// standing still. Some moves leave the guardian stunned for a moment, taking extra damage.
//
// Magic is no shortcut: a potion takes off at most a slice of a guardian's health, and then
// the guardian is warded against magic for a while (see Game.usePotion).

import { BLAST } from './config.js';
import { enemyWeights } from './level.js';
import { sfx } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const BOSS_HP_MAGIC_CAP = 0.06; // most of its health a potion can take
export const BOSS_WARD = 8;            // seconds a guardian shrugs off magic after a potion

// moves per phase; the last phase adds the deadliest versions
const MOVESETS = {
  dragon: [['breath', 'leap', 'fan'], ['breath', 'leap', 'meteors', 'fan'], ['breath2', 'leap', 'meteors', 'summon', 'fan']],
  chimera: [['triple', 'charge', 'stomp'], ['triple', 'charge', 'stomp', 'summon'], ['triple', 'charge2', 'stomp', 'summon']],
  fiend: [['flasks', 'vomit', 'nova'], ['flasks', 'vomit', 'swarm', 'nova'], ['flasks', 'vomit', 'swarm', 'nova2']],
  skorne: [['rings', 'teleport', 'summon'], ['rings', 'teleport', 'meteors', 'summon'], ['rings2', 'teleport', 'meteors', 'summon']],
};
const GAP = [1.5, 1.1, 0.75]; // rest between moves, per phase

export function phaseOf(e) { return e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3; }

export function initBoss(e, model) {
  e.model = MOVESETS[model] ? model : 'skorne';
  e.bphase = 1; e.ward = 0; e.stun = 0; e.roar = 0; e.air = false;
  e.move = null; e.rest = 2.0; e.last = null; e.trail = 0;
}

// Damage taken: none while airborne, vanished or roaring; extra while stunned.
export function bossDamage(g, e, amount) {
  if (e.air || e.roar > 0) return 0;
  if (e.stun > 0) amount *= 1.5;
  return amount;
}

export function updateBoss(g, e, p, d, dt, contact) {
  e.ward = Math.max(0, e.ward - dt);
  e.stun = Math.max(0, e.stun - dt);
  e.cd = (e.cd || 0) - dt;
  const ph = phaseOf(e);
  if (ph > e.bphase) { phaseChange(g, e, ph); return; }
  if (e.roar > 0) { e.roar -= dt; return; }
  if (e.stun > 0 && !e.move) return; // dazed: a chance to pile on
  if (ph === 3 && e.model === 'fiend') { // the Plague Fiend leaves poison behind it
    e.trail -= dt;
    if (e.trail <= 0) { e.trail = 1.4; pool(g, e, e.x, e.y, 4); }
  }
  if (e.move) {
    e.move.t += dt;
    if (MOVES[e.move.name](g, e, p, e.move, dt)) { e.move = null; e.rest = GAP[e.bphase - 1] * rand(0.8, 1.2); }
    return;
  }
  // between moves: close in and swipe at anyone in reach
  if (contact && e.cd <= 0) { e.cd = 1.5; e.act = { type: 'melee', t: g.time }; g.hurtPlayer(p, e.def.dmg, e); }
  else if (!contact) g.steer(e, p, d, dt);
  e.rest -= dt;
  if (e.rest <= 0) {
    const set = MOVESETS[e.model][e.bphase - 1].filter((m) => m !== e.last);
    const name = set[Math.floor(Math.random() * set.length)];
    e.last = name;
    e.move = { name, t: 0, step: 0 };
    e.act = { type: 'windup', t: g.time };
  }
}

function phaseChange(g, e, ph) {
  e.bphase = ph;
  e.move = null; e.air = false; e.invisible = false; e.charging = 0;
  e.roar = 1.6;
  e.act = { type: 'roar', t: g.time };
  e.speed = e.baseSpeed * (ph === 3 ? 1.3 : 1.12);
  g.shake = Math.max(g.shake, 14);
  g.flash = 0.5;
  sfx.explode();
  g.text(e.x, e.y - 60, ph === 3 ? 'FURIOUS!' : 'ENRAGED!', '#ff6040', 2);
  g.burst(e.x, e.y, '#ff6040', 40, 220);
  summon(g, e, ph === 3 ? 4 : 3);
  // a breather for the heroes: food tumbles into the arena
  for (let i = 0, tries = 0; i < 2 && tries < 20; tries++) {
    const a = Math.random() * Math.PI * 2, r = rand(140, 260);
    const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (g.collides(x, y, 14, true)) continue;
    g.items.push({ type: 'food', x, y, r: 10, bob: 0 });
    i++;
  }
}

// ---------- helpers ----------
const aim = (e, p) => Math.atan2(p.y - e.y, p.x - e.x);
const dmg = (e, n) => n * (e.dmgMul || 1);
function lob(g, e, kind, tx, ty, T, n, extra = {}) {
  g.projs.push({ owner: 'enemy', kind, x: e.x, y: e.y, sx: kind === 'meteor' || kind === 'quake' ? tx : e.x, sy: kind === 'meteor' || kind === 'quake' ? ty : e.y, tx, ty, t: 0, T, dmg: dmg(e, n), r: 6, z: 0, ...extra });
}
function pool(g, e, x, y, n) {
  g.projs.push({ owner: 'enemy', kind: 'pool', x, y, vx: 0, vy: 0, t: 0, T: 6, tick: 0.3, dmg: dmg(e, n), r: BLAST.pool, z: 0, life: 6 });
}
function ring(g, e, n, kind, dmgN, speed, off = Math.random()) {
  for (let i = 0; i < n; i++) g.enemyShot(e, ((i + off) / n) * Math.PI * 2, kind, dmgN, speed);
}
// Summoned thralls are weaker than the realm's own monsters, and only so many at once:
// they're there to split the heroes' attention, not to be the fight.
export const THRALL = { hp: 0.5, dmg: 0.6, max: 3 }; // max: alive at once, plus the phase
function summon(g, e, n) {
  const kinds = enemyWeights(g.levelNum).map(([k]) => k);
  const room = THRALL.max + e.bphase - g.enemies.filter((m) => m.thrall && m.hp > 0).length;
  for (let i = 0; i < Math.min(n, room); i++) {
    const a = Math.random() * Math.PI * 2;
    const x = e.x + Math.cos(a) * 70, y = e.y + Math.sin(a) * 70;
    if (g.collides(x, y, 12)) continue;
    const m = g.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], x, y);
    m.fromGen = true; m.thrall = true;
    m.hp = m.maxHp = Math.max(1, Math.round(m.hp * THRALL.hp));
    m.dmgMul *= THRALL.dmg;
  }
  g.burst(e.x, e.y, '#a080ff', 20, 160);
}
const targets = (g) => g.livePlayers();

// ---------- the moves: each returns true when finished ----------
// m.t: seconds since the wind-up began. m.step: progress marker so each part fires once.
const MOVES = {
  // a sweeping stream of fire (the Dragon)
  breath(g, e, p, m) {
    const WIND = 0.75, DUR = 1.0;
    if (m.step === 0) { m.a0 = aim(e, p); m.step = 1; }
    if (m.t < WIND) return false;
    if (m.step === 1) { e.act = { type: 'breath', t: g.time }; m.step = 2; m.next = WIND; sfx.shoot('fireball'); }
    while (m.next <= m.t && m.next < WIND + DUR) {
      const k = (m.next - WIND) / DUR;
      g.enemyShot(e, m.a0 + (k - 0.5) * 1.1, 'efire', 6, 280);
      m.next += 0.06;
    }
    return m.t >= WIND + DUR;
  },
  // two crossing sweeps
  breath2(g, e, p, m) {
    const WIND = 0.65, DUR = 1.6;
    if (m.step === 0) { m.a0 = aim(e, p); m.step = 1; }
    if (m.t < WIND) return false;
    if (m.step === 1) { e.act = { type: 'breath', t: g.time }; m.step = 2; m.next = WIND; }
    while (m.next <= m.t && m.next < WIND + DUR) {
      const k = (m.next - WIND) / DUR;
      const s = k < 0.5 ? k * 2 : 2 - k * 2; // there and back
      g.enemyShot(e, m.a0 + (s - 0.5) * 1.3, 'efire', 6, 290);
      m.next += 0.055;
    }
    return m.t >= WIND + DUR;
  },
  // volleys of fireballs in a fan
  fan(g, e, p, m) {
    const WIND = 0.45;
    if (m.t < WIND) return false;
    const volleys = e.bphase + 1;
    while (m.step < volleys && m.t >= WIND + m.step * 0.38) {
      const a = aim(e, p), n = 5 + e.bphase;
      for (let i = 0; i < n; i++) g.enemyShot(e, a + (i / (n - 1) - 0.5) * 1.05, 'efire', 8, 240);
      e.act = { type: 'cast', t: g.time };
      m.step++;
    }
    return m.step >= volleys && m.t > WIND + volleys * 0.38;
  },
  // leap into the air and crash down where a hero stood (marked on the ground)
  leap(g, e, p, m) {
    const WIND = 0.5, AIR = 1.1;
    if (m.t < WIND) return false;
    if (m.step === 0) {
      m.step = 1; m.sx = e.x; m.sy = e.y; m.tx = p.x; m.ty = p.y;
      e.air = true; e.act = { type: 'leap', t: g.time };
      lob(g, e, 'quake', m.tx, m.ty, AIR, 24);
    }
    if (m.step === 1) {
      const k = Math.min(1, (m.t - WIND) / AIR);
      const nx = m.sx + (m.tx - m.sx) * k, ny = m.sy + (m.ty - m.sy) * k;
      if (!g.collides(nx, ny, e.r * 0.6, false)) { e.x = nx; e.y = ny; }
      if (k >= 1) {
        m.step = 2; e.air = false;
        g.shake = Math.max(g.shake, 14); sfx.explode();
        g.burst(e.x, e.y, '#c8a070', 30, 200);
        ring(g, e, 10 + e.bphase * 2, 'efire', 8, 210);
        e.stun = 1.4; // winded by the landing
        g.text(e.x, e.y - 50, 'STUNNED!', '#ffe070', 1.2);
      }
    }
    return m.step === 2;
  },
  // fire rains from the sky on marked spots
  meteors(g, e, p, m) {
    const WIND = 0.6;
    if (m.t < WIND) return false;
    if (m.step === 0) {
      m.step = 1; e.act = { type: 'cast', t: g.time };
      const n = e.bphase === 3 ? 10 : 6;
      const ps = targets(g);
      for (let i = 0; i < n; i++) {
        const q = ps[i % ps.length];
        const near = i < ps.length; // one lands right where each hero stands
        const tx = q.x + (near ? 0 : rand(-140, 140)), ty = q.y + (near ? 0 : rand(-110, 110));
        if (g.blocksShots(Math.floor(tx / 32), Math.floor(ty / 32))) continue;
        lob(g, e, 'meteor', tx, ty, rand(1.2, 1.9), 20, { z: 420 });
      }
      g.text(e.x, e.y - 50, 'LOOK UP!', '#ff9050', 1.2);
    }
    return m.t > WIND + 0.4;
  },
  summon(g, e, p, m) {
    if (m.t < 0.5) return false;
    e.act = { type: 'cast', t: g.time };
    summon(g, e, 1 + e.bphase);
    return true;
  },
  // the Chimera's three heads breathe fire, poison and lightning at once
  triple(g, e, p, m) {
    const WIND = 0.6, DUR = 1.1;
    if (m.t < WIND) return false;
    if (m.step === 0) { m.step = 1; m.next = WIND; e.act = { type: 'breath', t: g.time }; }
    while (m.next <= m.t && m.next < WIND + DUR) {
      const a = aim(e, p);
      [['efire', -0.42], ['gbolt', 0], ['bolt', 0.42]].forEach(([kind, off]) => g.enemyShot(e, a + off + rand(-0.06, 0.06), kind, 7, 250));
      m.next += 0.15;
    }
    return m.t >= WIND + DUR;
  },
  // a long telegraphed charge; slamming into a wall stuns it
  charge(g, e, p, m, dt) { return chargeMove(g, e, p, m, dt, 1); },
  charge2(g, e, p, m, dt) { return chargeMove(g, e, p, m, dt, 2); },
  // stamps the ground: a ring of marked shockwaves around it, then a wave of bolts
  stomp(g, e, p, m) {
    const WIND = 0.5;
    if (m.t < WIND) return false;
    if (m.step === 0) {
      m.step = 1; e.act = { type: 'cast', t: g.time };
      const n = 6 + e.bphase;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(0, 0.4), r = rand(70, 120);
        lob(g, e, 'quake', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 0.9, 20);
      }
      lob(g, e, 'quake', p.x, p.y, 1.0, 20);
    }
    if (m.step === 1 && m.t >= WIND + 0.9) { m.step = 2; g.shake = Math.max(g.shake, 10); ring(g, e, 16, 'bolt', 8, 200); }
    return m.step === 2;
  },
  // lobbed flasks that leave pools of poison
  flasks(g, e, p, m) {
    const WIND = 0.45;
    if (m.t < WIND) return false;
    if (m.step === 0) {
      m.step = 1; e.act = { type: 'cast', t: g.time };
      const ps = targets(g), n = 3 + e.bphase;
      for (let i = 0; i < n; i++) {
        const q = ps[i % ps.length];
        lob(g, e, 'flask', q.x + (i < ps.length ? 0 : rand(-120, 120)), q.y + (i < ps.length ? 0 : rand(-90, 90)), rand(0.9, 1.3), 12, { poolDmg: dmg(e, 4) });
      }
    }
    return m.t > WIND + 0.3;
  },
  // a spray of poison
  vomit(g, e, p, m) {
    const WIND = 0.7, DUR = 1.1;
    if (m.step === 0) { m.a0 = aim(e, p); m.step = 1; }
    if (m.t < WIND) return false;
    if (m.step === 1) { m.step = 2; m.next = WIND; e.act = { type: 'breath', t: g.time }; }
    while (m.next <= m.t && m.next < WIND + DUR) {
      g.enemyShot(e, m.a0 + rand(-0.45, 0.45), 'gbolt', 6, rand(180, 260));
      m.next += 0.065;
    }
    return m.t >= WIND + DUR;
  },
  // rings of poison bolts
  nova(g, e, p, m) { return ringsMove(g, e, m, 1, 18, 'gbolt', 7); },
  nova2(g, e, p, m) { return ringsMove(g, e, m, 3, 16, 'gbolt', 7); },
  swarm(g, e, p, m) {
    if (m.t < 0.6) return false;
    e.act = { type: 'cast', t: g.time };
    summon(g, e, 2 + e.bphase);
    return true;
  },
  // Skorne's rings of hellfire
  rings(g, e, p, m) { return ringsMove(g, e, m, 2, 14, 'efire', 5); },
  rings2(g, e, p, m) { return ringsMove(g, e, m, 3, 16, 'efire', 5); },
  // vanishes, then strikes where a hero stood (the spot glows first)
  teleport(g, e, p, m) {
    const WIND = 0.35, GONE = 0.85;
    if (m.t < WIND) return false;
    if (m.step === 0) {
      m.step = 1; e.air = true; e.invisible = true; e.act = { type: 'teleport', t: g.time };
      g.burst(e.x, e.y, '#a040ff', 25, 180);
      m.tx = p.x; m.ty = p.y;
      lob(g, e, 'quake', m.tx, m.ty, GONE, 20);
    }
    if (m.step === 1 && m.t >= WIND + GONE) {
      m.step = 2; e.air = false; e.invisible = false;
      if (!g.collides(m.tx, m.ty, e.r * 0.6, false)) { e.x = m.tx; e.y = m.ty; }
      e.act = { type: 'melee', t: g.time };
      g.burst(e.x, e.y, '#a040ff', 30, 200); g.shake = Math.max(g.shake, 10); sfx.explode();
      ring(g, e, 6 + e.bphase * 2, 'hbolt', 6, 220);
      e.stun = 1.0;
    }
    return m.step === 2;
  },
};

function chargeMove(g, e, p, m, dt, times) {
  const WIND = 0.7;
  if (m.step === 0) { m.step = 1; m.count = 0; g.text(e.x, e.y - 50, '!', '#ff5030', WIND); }
  if (m.t < WIND) return false;
  if (m.step === 1) { // launch a charge at the nearest hero
    const a = aim(e, p);
    e.charging = 0.9; e.cvx = Math.cos(a) * 420; e.cvy = Math.sin(a) * 420;
    e.act = { type: 'melee', t: g.time };
    m.count++; m.hit = false; m.step = 2;
    sfx.turbo();
  }
  if (m.step === 2) {
    e.charging -= dt;
    const blocked = g.move(e, e.cvx * dt, e.cvy * dt);
    for (const q of g.livePlayers()) if (!m.hit && dist(q, e) < e.r + q.r) { m.hit = true; g.hurtPlayer(q, 32, e); }
    if (blocked) { // into the wall: dazed
      e.charging = 0; g.shake = Math.max(g.shake, 12); sfx.explode();
      e.stun = 1.8; g.text(e.x, e.y - 50, 'STUNNED!', '#ffe070', 1.4);
      return true;
    }
    if (e.charging <= 0) { e.charging = 0; m.step = 3; m.pause = 0.4; }
    return false;
  }
  m.pause -= dt; // step 3: catch its breath, then charge again or stop
  if (m.pause > 0) return false;
  if (m.count < times) { m.step = 1; return false; }
  return true;
}

function ringsMove(g, e, m, count, n, kind, dmgN) {
  const WIND = 0.45;
  if (m.t < WIND) return false;
  while (m.step < count && m.t >= WIND + m.step * 0.38) {
    ring(g, e, n, kind, dmgN, 200, m.step * 0.5 / n + Math.random() * 0.1);
    e.act = { type: 'cast', t: g.time };
    m.step++;
  }
  return m.step >= count && m.t > WIND + count * 0.38;
}
