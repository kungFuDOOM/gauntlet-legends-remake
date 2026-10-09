// Game state for online play. The host packs its Game into a compact snapshot about 20
// times a second; each guest unpacks it into a "mirror" Game that the normal renderer and
// HUD draw. Levels aren't sent: guests generate the same level from its key and only
// receive the tiles that changed (opened gates, broken walls). Effects, sounds and
// announcer lines travel as events with the snapshot.

import { CLASSES, ENEMIES } from './config.js';
import { sfx, say } from './audio.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const act = (a) => (a ? [a.type, r3(a.t)] : 0);
const buffs = (b) => { const o = {}; for (const k of Object.keys(b)) o[k] = r1(b[k]); return o; };

// ---------- host side ----------

export class SnapshotWriter {
  constructor() {
    this.ids = new WeakMap();
    this.next = 1;
  }

  id(o) {
    let i = this.ids.get(o);
    if (!i) { i = this.next++; this.ids.set(o, i); }
    return i;
  }

  game(g) {
    if (!g || !g.level) return null;
    const tiles = [];
    for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] !== g.tiles0[i]) tiles.push(i, g.tiles[i]);
    return {
      k: g.levelKey, q: g.levelSeq, tm: r3(g.time), fl: r2(g.flash), sh: r1(g.shake),
      bn: g.banner ? [g.banner.text, g.banner.sub || '', r2(g.banner.t)] : 0,
      tr: r2(g.treasureT || 0), uw: g.underworldSealed ? 1 : 0, hf: g.hubFocus || 0, rf: g.runesFound.length,
      tiles,
      P: g.players.map((p) => p && [
        p.slot, p.cls, p.source, r1(p.x), r1(p.y), r2(p.fx), r2(p.fy), Math.round(p.hp), p.alive ? 1 : 0, r2(p.deadT),
        p.score, p.gold, p.keys, p.potions, Math.round(p.turbo), p.lvl, p.xp, buffs(p.buffs), r2(p.hurtFlash), r2(p.invuln),
        act(p.act), p.dash ? 1 : 0, p.famX !== undefined ? r1(p.famX) : null, p.famY !== undefined ? r1(p.famY) : null,
        p.maxHp || 0, r2(p.strength), r2(p.armor), r2(p.magic), r1(p.speed), r1(p.shotDmg),
      ]),
      E: g.enemies.map((e) => [
        this.id(e), e.type, r1(e.x), r1(e.y), Math.round(e.hp), e.maxHp, r2(e.hurt), e.invisible ? 1 : 0, act(e.act),
        r2(e.charging || 0), r2(e.cvx || 0), r2(e.cvy || 0), r2(e.cd2 || 0), e.fromGen ? 1 : 0, e.vanish ? 1 : 0,
      ]),
      G: g.gens.map((s) => [this.id(s), s.type, r1(s.x), r1(s.y), Math.round(s.hp), r2(s.hurt)]),
      I: g.items.map((it) => [this.id(it), it.type, it.sub ?? 0, r1(it.x), r1(it.y)]),
      R: g.projs.map((pr) => [
        this.id(pr), pr.kind, r1(pr.x), r1(pr.y), r1(pr.vx || 0), r1(pr.vy || 0), r1(pr.z || 0),
        r1(pr.tx || 0), r1(pr.ty || 0), r2(pr.t || 0), r2(pr.T || 0), pr.super ? 1 : 0, r2(pr.spin || 0),
      ]),
    };
  }
}

// ---------- guest side ----------

// Positions glide from where they're drawn now to the newest snapshot over one snapshot
// interval, which hides the gaps between updates at the cost of ~50 ms of extra delay.
const SNAP = 200; // jumps farther than this (teleports, respawns) aren't smoothed

function glide(o, x, y) {
  if (o._x1 === undefined || Math.abs(x - o.x) > SNAP || Math.abs(y - o.y) > SNAP) { o.x = o._x0 = o._x1 = x; o.y = o._y0 = o._y1 = y; return; }
  o._x0 = o.x; o._y0 = o.y; o._x1 = x; o._y1 = y;
}

export class SnapshotReader {
  constructor(GameClass) {
    this.Game = GameClass;
    this.game = null;
    this.maps = { E: new Map(), G: new Map(), I: new Map(), R: new Map() };
    this.players = [];
    this.arrived = 0;
    this.interval = 50;
  }

  // Apply one snapshot `s` (the `g` part of the host's message) plus its effect events.
  apply(s, fx, now = performance.now()) {
    if (!s) { this.game = null; return null; }
    if (this.arrived) this.interval = this.interval * 0.8 + Math.min(200, Math.max(16, now - this.arrived)) * 0.2;
    this.arrived = now;
    let g = this.game;
    if (!g || g.levelKey !== s.k || this.seq !== s.q) {
      g = this.game || new this.Game();
      g.loadMirror(s.k);
      this.seq = s.q;
      this.game = g;
      for (const m of Object.values(this.maps)) m.clear();
      this.players = [];
      g.time = s.tm;
    }
    g._t0 = g.time; g._t1 = s.tm;
    g.flash = s.fl; g.shake = s.sh;
    g.banner = s.bn ? { text: s.bn[0], sub: s.bn[1] || undefined, t: s.bn[2] } : null;
    g.treasureT = s.tr; g.underworldSealed = !!s.uw; g.hubFocus = s.hf || null;
    g.runesFound.length = s.rf;
    // tiles the host changed since the level was generated (they only ever open up)
    for (let i = 0; i < s.tiles.length; i += 2) g.tiles[s.tiles[i]] = s.tiles[i + 1];

    g.players = [];
    for (const row of s.P) {
      if (!row) continue;
      const [slot, cls] = row;
      let p = this.players[slot];
      if (!p || p.cls !== cls) {
        const def = CLASSES[cls];
        p = this.players[slot] = { kind: 'player', slot, cls, def, name: def.name, color: def.color, r: 12, buffs: {} };
      }
      [, , p.source, , , p.fx, p.fy, p.hp, , p.deadT, p.score, p.gold, p.keys, p.potions, p.turbo, p.lvl, p.xp, p.buffs, p.hurtFlash, p.invuln] = row;
      p.alive = !!row[8];
      glide(p, row[3], row[4]);
      const a = row[20];
      if (a && (!p.act || p.act.t !== a[1])) p.act = { type: a[0], t: a[1] };
      p.dash = row[21] ? {} : null;
      if (row[22] !== null) { p.famX = row[22]; p.famY = row[23]; } else { delete p.famX; delete p.famY; }
      if (row[24]) p.maxHp = row[24];
      [p.strength, p.armor, p.magic, p.speed, p.shotDmg] = row.slice(25, 30);
      g.players[slot] = p;
    }

    const sync = (key, rows, make, update) => {
      const map = this.maps[key];
      const seen = new Set();
      const list = rows.map((row) => {
        let o = map.get(row[0]);
        if (!o) { o = make(row); map.set(row[0], o); }
        update(o, row);
        seen.add(row[0]);
        return o;
      });
      for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
      return list;
    };
    g.enemies = sync('E', s.E, (row) => {
      const type = row[1];
      const def = type === 'boss' ? { ...g.info.boss, ai: 'boss' } : ENEMIES[type];
      return { kind: 'enemy', type, def, r: type === 'boss' ? 30 : def.r, phase: Math.random() * 10, walk: 0, fromGen: !!row[13] };
    }, (e, row) => {
      glide(e, row[2], row[3]);
      [, , , , e.hp, e.maxHp, e.hurt] = row;
      e.invisible = !!row[7];
      const a = row[8];
      if (a && (!e.act || e.act.t !== a[1])) e.act = { type: a[0], t: a[1] };
      [e.charging, e.cvx, e.cvy, e.cd2] = row.slice(9, 13);
      e.vanish = !!row[14];
    });
    g.boss = g.enemies.find((e) => e.type === 'boss') || null;
    g.gens = sync('G', s.G, (row) => ({ type: row[1], r: 14 }), (o, row) => { glide(o, row[2], row[3]); o.hp = row[4]; o.hurt = row[5]; });
    g.items = sync('I', s.I, (row) => ({ type: row[1], sub: row[2] || undefined, r: 10, bob: Math.random() * 6 }), (o, row) => { o.x = row[3]; o.y = row[4]; });
    g.projs = sync('R', s.R, (row) => ({ kind: row[1] }), (o, row) => {
      glide(o, row[2], row[3]);
      [, , , , o.vx, o.vy, o.z, o.tx, o.ty, o.t, o.T] = row;
      o.super = !!row[11]; o.spin = row[12];
    });

    for (const ev of fx || []) playEvent(g, ev);
    return g;
  }

  // Called every frame on the guest: smooth positions, run local-only effects, follow with
  // the camera.
  tick(dt, now = performance.now()) {
    const g = this.game;
    if (!g) return;
    const a = Math.min(1, (now - this.arrived) / this.interval);
    const lerp = (o) => { if (o._x1 !== undefined) { o.x = o._x0 + (o._x1 - o._x0) * a; o.y = o._y0 + (o._y1 - o._y0) * a; } };
    if (g._t1 !== undefined) g.time = g._t0 + (g._t1 - g._t0) * a;
    for (const p of g.allPlayers()) lerp(p);
    for (const e of g.enemies) lerp(e);
    for (const s of g.gens) lerp(s);
    for (const pr of g.projs) lerp(pr);
    for (const it of g.items) it.bob += dt * 3;
    for (const pt of g.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt; }
    g.particles = g.particles.filter((pt) => pt.life > 0);
    for (const t of g.texts) { t.y -= 30 * dt; t.life -= dt; }
    g.texts = g.texts.filter((t) => t.life > 0);
    g.exploreT = (g.exploreT || 0) - dt;
    if (g.exploreT <= 0) { g.exploreT = 0.2; g.updateExplored(); }
    if (g.camX === undefined || !Number.isFinite(g.camX)) { g.camX = g.camTargetX(); g.camY = g.camTargetY(); }
    const k = 1 - Math.pow(0.001, dt);
    g.camX += (g.camTargetX() - g.camX) * k;
    g.camY += (g.camTargetY() - g.camY) * k;
  }
}

function playEvent(g, ev) {
  switch (ev[0]) {
    case 'p': g.particle(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7]); break;
    case 'b': g.burst(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
    case 't': g.text(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
    default: playSound(ev);
  }
}

// Sounds and announcer lines (also sent outside a level, e.g. on menus).
export function playSound(ev) {
  if (ev[0] === 'a' && sfx[ev[1]]) sfx[ev[1]](...ev.slice(2));
  else if (ev[0] === 'v') say(ev[1], ev[2], ev[3]);
}
