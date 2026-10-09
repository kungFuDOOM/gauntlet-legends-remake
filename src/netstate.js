// Game state for online play. The host packs its Game into a compact snapshot about 20
// times a second; each guest unpacks it into a "mirror" Game that the normal renderer and
// HUD draw. Levels aren't sent: guests generate the same level from its key and only
// receive the tiles that changed (opened gates, broken walls). Effects, sounds and
// announcer lines travel as events with the snapshot.

import { CLASSES, ENEMIES, POWERUPS, MAX_PLAYERS } from './config.js';
import { SHOP } from './campaign.js';
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

// ---------- checking what a host sends ----------
// A guest can't trust the host's browser: everything is checked against what this game
// expects (known types only, numbers in range, short strings, bounded lists) before use.
// Nothing from a host is ever inserted into the page as HTML; text is only drawn on canvas.

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const color = (v) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#ffffff');
const LEVEL_KEY = /^(H|U|T[0-2]|L([1-9]|1[0-6]))$/;
const ITEM_TYPES = new Set(['food', 'poison', 'gold', 'gem', 'chest', 'barrel', 'key', 'potion', 'amulet', 'rune']);
const PROJ_KINDS = new Set(['axe', 'sword', 'arrow', 'fireball', 'efire', 'dagger', 'spark', 'bolt', 'lob']);
const ACT_TYPES = new Set(['melee', 'shoot', 'turbo', 'throw', 'cast']);
const STATES = new Set(['title', 'confirm', 'story', 'select', 'realm', 'shop', 'ending', 'play', 'paused', 'levelclear', 'gameover']);
const POS = 20000; // generous bound for positions in pixels
const cleanAct = (a) => (Array.isArray(a) && ACT_TYPES.has(a[0]) ? [a[0], num(a[1], -1e6, 1e6)] : 0);
const cleanSource = (v) => { const t = str(v, 8); return /^(kb[12]?|pad\d|touch|net\d{1,4})$/.test(t) ? t : 'net0'; };

export function cleanGame(s) {
  if (!s || typeof s !== 'object' || typeof s.k !== 'string' || !LEVEL_KEY.test(s.k)) return null;
  const buffs = (b) => {
    const o = {};
    if (b && typeof b === 'object') for (const k of Object.keys(b).slice(0, 12)) if (own(POWERUPS, k)) o[k] = num(b[k], 0, 600);
    return o;
  };
  return {
    k: s.k, q: int(s.q, 0, 1e9), tm: num(s.tm, 0, 1e7), fl: num(s.fl, 0, 1), sh: num(s.sh, 0, 40),
    bn: Array.isArray(s.bn) ? [str(s.bn[0], 80), str(s.bn[1], 80), num(s.bn[2], 0, 10)] : 0,
    tr: num(s.tr, 0, 600), uw: s.uw ? 1 : 0, rf: int(s.rf, 0, 16),
    hf: s.hf && typeof s.hf === 'object' && (s.hf.type === 'shop' || s.hf.type === 'portal') ? { type: s.hf.type, realm: int(s.hf.realm, 0, 3) } : 0,
    tiles: list(s.tiles, 40000).map((v, i) => (i % 2 ? int(v, 0, 9) : int(v, -1, 1e6, -1))), // bad index: -1, skipped
    P: list(s.P, MAX_PLAYERS).map((r) => {
      if (!Array.isArray(r) || !own(CLASSES, r[1])) return null;
      return [
        int(r[0], 0, MAX_PLAYERS - 1), r[1], cleanSource(r[2]), num(r[3], -POS, POS), num(r[4], -POS, POS), num(r[5], -1, 1), num(r[6], -1, 1),
        num(r[7], -1e5, 1e5), r[8] ? 1 : 0, num(r[9], 0, 1e5), int(r[10], 0, 1e9), int(r[11], 0, 1e9), int(r[12], 0, 99), int(r[13], 0, 99),
        num(r[14], 0, 100), int(r[15], 1, 999), num(r[16], 0, 1e9), buffs(r[17]), num(r[18], 0, 5), num(r[19], 0, 60),
        cleanAct(r[20]), r[21] ? 1 : 0, r[22] == null ? null : num(r[22], -POS, POS), r[23] == null ? null : num(r[23], -POS, POS),
        num(r[24], 0, 1e5), num(r[25], 0, 1e4), num(r[26], 0, 1), num(r[27], 0, 100), num(r[28], 0, 2000), num(r[29], 0, 1e4),
      ];
    }),
    E: list(s.E, 400).filter((r) => Array.isArray(r) && (r[1] === 'boss' || own(ENEMIES, r[1]))).map((r) => [
      int(r[0], 1, 1e9), r[1], num(r[2], -POS, POS), num(r[3], -POS, POS), num(r[4], -1e6, 1e6), num(r[5], 1, 1e6), num(r[6], 0, 5),
      r[7] ? 1 : 0, cleanAct(r[8]), num(r[9], 0, 60), num(r[10], -2, 2), num(r[11], -2, 2), num(r[12], -60, 60), r[13] ? 1 : 0, r[14] ? 1 : 0,
    ]),
    G: list(s.G, 120).filter((r) => Array.isArray(r) && own(ENEMIES, r[1])).map((r) => [int(r[0], 1, 1e9), r[1], num(r[2], -POS, POS), num(r[3], -POS, POS), num(r[4], 0, 1e4), num(r[5], 0, 5)]),
    I: list(s.I, 1200).filter((r) => Array.isArray(r) && ITEM_TYPES.has(r[1]) && (r[1] !== 'amulet' || own(POWERUPS, r[2]))).map((r) => [
      int(r[0], 1, 1e9), r[1], r[1] === 'amulet' ? r[2] : r[2] === 'hidden' ? 'hidden' : 0, num(r[3], -POS, POS), num(r[4], -POS, POS),
    ]),
    R: list(s.R, 800).filter((r) => Array.isArray(r) && PROJ_KINDS.has(r[1])).map((r) => [
      int(r[0], 1, 1e9), r[1], num(r[2], -POS, POS), num(r[3], -POS, POS), num(r[4], -5000, 5000), num(r[5], -5000, 5000), num(r[6], -500, 500),
      num(r[7], -POS, POS), num(r[8], -POS, POS), num(r[9], 0, 60), num(r[10], 0, 60), r[11] ? 1 : 0, num(r[12], -1e4, 1e4),
    ]),
  };
}

// Effects, sounds and announcer lines.
export function cleanEvents(fx) {
  const out = [];
  for (const ev of list(fx, 600)) {
    if (!Array.isArray(ev)) continue;
    switch (ev[0]) {
      case 'p': out.push(['p', num(ev[1], -POS, POS), num(ev[2], -POS, POS), num(ev[3], -2000, 2000), num(ev[4], -2000, 2000), color(ev[5]), num(ev[6], 0, 3), num(ev[7], 0, 10)]); break;
      case 'b': out.push(['b', num(ev[1], -POS, POS), num(ev[2], -POS, POS), color(ev[3]), int(ev[4], 0, 100), num(ev[5], 0, 1000)]); break;
      case 't': out.push(['t', num(ev[1], -POS, POS), num(ev[2], -POS, POS), str(ev[3], 60), color(ev[4]), num(ev[5], 0, 5)]); break;
      case 'a': if (own(sfx, ev[1])) out.push(['a', ev[1], ...ev.slice(2, 4).map((a) => str(a, 16))]); break;
      case 'v': out.push(['v', str(ev[1], 300), str(ev[2], 80), num(ev[3], 0, 60000)]); break;
      default: break;
    }
  }
  return out;
}

// The menu state that comes with each snapshot (hero select, story, stage picker, shop...).
export function cleanUi(st, ui) {
  if (!STATES.has(st) || !ui || typeof ui !== 'object') return null;
  const flags = (o, keyOk) => {
    const out = {};
    if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 64)) if (keyOk(k)) out[k] = !!o[k];
    return out;
  };
  const p = ui.prog && typeof ui.prog === 'object' ? ui.prog : {};
  const heroes = {};
  if (ui.heroes && typeof ui.heroes === 'object') {
    for (const k of Object.keys(ui.heroes)) {
      const h = ui.heroes[k];
      if (own(CLASSES, k) && h && typeof h === 'object') heroes[k] = { lvl: int(h.lvl, 1, 999), gold: int(h.gold, 0, 1e9) };
    }
  }
  const cursor = (c) => (c && typeof c === 'object' ? { idx: int(c.idx, 0, SHOP.length - 1), done: !!c.done, flash: num(c.flash, 0, 1), deny: num(c.deny, 0, 1) } : null);
  const ci = ui.ci && typeof ui.ci === 'object' ? ui.ci : null;
  return {
    slots: list(ui.slots, MAX_PLAYERS).map((x) => (x && typeof x === 'object' && own(CLASSES, x.cls) ? { source: cleanSource(x.source), cls: x.cls, ready: !!x.ready } : null)),
    cd: ui.cd == null ? null : num(ui.cd, 0, 10),
    rp: ui.rp && typeof ui.rp === 'object' ? { realm: int(ui.rp.realm, 0, 3), stage: int(ui.rp.stage, 1, 4) } : null,
    shop: list(ui.shop, MAX_PLAYERS).map(cursor),
    ci: ci && {
      level: int(ci.level, 1, 16), wasBoss: !!ci.wasBoss, realm: str(ci.realm, 40), name: str(ci.name, 60), newRunes: int(ci.newRunes, 0, 16),
      unlocked: list(ci.unlocked, 4).filter((c) => own(CLASSES, c)), hidden: !!ci.hidden,
    },
    story: ui.story && typeof ui.story === 'object'
      ? { lines: list(ui.story.lines, 12).map((l) => str(l, 400)), idx: int(ui.story.idx, 0, 11), t: num(ui.story.t, 0, 1e4) }
      : null,
    toast: ui.toast ? str(ui.toast, 120) : null,
    prog: {
      completed: flags(p.completed, (k) => /^([1-9]|1[0-6])$/.test(k)),
      runes: flags(p.runes, (k) => /^[hg]([1-9]|1[0-6])$/.test(k)),
      seenRealm: flags(p.seenRealm, (k) => /^[0-3]$/.test(k)),
      seenIntro: !!p.seenIntro, won: !!p.won, tutorialDone: !!p.tutorialDone,
    },
    heroes,
    tut: Array.isArray(ui.tut) ? [int(ui.tut[0], 0, 7), ui.tut[1] ? 1 : 0] : null,
  };
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
  apply(raw, rawFx, now = performance.now()) {
    const s = cleanGame(raw);
    if (!s) { this.game = null; return null; }
    const fx = cleanEvents(rawFx);
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
    for (let i = 0; i + 1 < s.tiles.length; i += 2) if (s.tiles[i] >= 0 && s.tiles[i] < g.tiles.length) g.tiles[s.tiles[i]] = s.tiles[i + 1];

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
  if (ev[0] === 'a' && own(sfx, ev[1])) sfx[ev[1]](...ev.slice(2));
  else if (ev[0] === 'v') say(ev[1], ev[2], ev[3]);
}
