// Core simulation: players, enemies, generators, projectiles, pickups.

import {
  TILE, WORLD_VIEW_W as VIEW_W, WORLD_VIEW_H as VIEW_H, HUD_H, CLASSES, CLASS_ORDER, ENEMIES, GENERATOR_HP, MAX_ENEMIES,
  POWERUPS, POWERUP_ORDER, difficulty, TURBO_COST, MAX_KEYS, MAX_POTIONS, HEALTH_DRAIN, FOOD_HEAL, xpForLevel,
} from './config.js';
import { T, generateLevel, generateTreasureRoom, generateHub, generateTutorial, bfs, walkable } from './level.js';
import { sfx, say } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SPREAD_X = VIEW_W - 110;
const SPREAD_Y = VIEW_H - 110;

export class Game {
  constructor() {
    this.players = [];
    this.levelNum = 1;
    this.time = 0;
    this.stats = { magic: 0, turbo: 0, food: 0 }; // things the tutorial waits for
    this.fx = null;       // when hosting online: effects to forward to guests (see net.js)
    this.levelSeq = 0;    // counts level loads, so guests notice even a restart of the same level
  }

  // ---------- setup ----------

  // `saved` restores a hero's level, stats and gold from a previous session.
  addPlayer(slot, source, cls, saved = null) {
    const def = CLASSES[cls];
    const p = {
      kind: 'player', slot, source, cls, def, name: def.name, color: def.color,
      x: 0, y: 0, r: 12, fx: 0, fy: 1, alive: true,
      hp: def.hp, score: 0, keys: 0, potions: 1, xp: 0, lvl: 1,
      strength: def.strength, shotDmg: def.shotDmg, armor: def.armor, speed: def.speed, magic: def.magic,
      shotCd: 0, turbo: 50, buffs: {}, hurtFlash: 0, invuln: 0, dash: null, swing: 0, walk: 0, throwT: 0,
      warnT: 0, deadT: 0, drain: 0, gold: 0,
    };
    if (saved) {
      for (const k of ['lvl', 'xp', 'strength', 'shotDmg', 'armor', 'speed', 'magic', 'gold', 'potions']) if (typeof saved[k] === 'number') p[k] = saved[k];
      p.maxHp = def.hp + (p.lvl - 1) * 40;
      p.hp = p.maxHp;
    }
    this.players[slot] = p;
    return p;
  }

  // The parts of a hero worth keeping between sessions.
  heroSave(p) {
    const { lvl, xp, strength, shotDmg, armor, speed, magic, gold, potions } = p;
    return { lvl, xp, strength, shotDmg, armor, speed, magic, gold, potions };
  }

  // Drop-in mid game: spawn next to the other players.
  joinMidGame(slot, source, cls, saved = null) {
    const p = this.addPlayer(slot, source, cls, saved);
    this.refreshDifficulty();
    const anchor = this.livePlayers()[0];
    const pos = anchor ? this.findOpenSpotNear(anchor.x, anchor.y) : this.spawnPoint(slot);
    p.x = pos.x; p.y = pos.y;
    p.invuln = 2;
    say(`Welcome, ${p.name}`, `welcome${slot}`, 2000);
    sfx.join();
    return p;
  }

  livePlayers() { return this.players.filter((p) => p && p.alive); }
  allPlayers() { return this.players.filter(Boolean); }

  startLevel(n) {
    this.levelNum = n;
    this.loadLevel(generateLevel(n), `L${n}`);
  }

  // The hub: realm portals and the merchant. `fromRealm` puts the party by that portal.
  startHub(fromRealm = null) {
    this.levelNum = 0;
    this.loadLevel(generateHub(), 'H');
    this.hubFocus = null;
    if (fromRealm != null) {
      const pt = this.level.portals[fromRealm];
      this.allPlayers().forEach((p, i) => {
        const s = this.findOpenSpotNear((pt.x + 0.5) * TILE + (pt.x < 13 ? 50 : -50), (pt.y + 0.5) * TILE + (i - 1.5) * 20);
        p.x = s.x; p.y = s.y;
      });
      this.camX = this.camTargetX(); this.camY = this.camTargetY();
    }
  }

  updateHubFocus() {
    this.hubFocus = null;
    const L = this.level;
    for (const p of this.livePlayers()) {
      for (const pt of L.portals) if (Math.hypot(p.x - (pt.x + 0.5) * TILE, p.y - (pt.y + 0.5) * TILE) < 30) this.hubFocus = { type: 'portal', realm: pt.realm };
      if (Math.hypot(p.x - (L.shop.x + 0.5) * TILE, p.y - (L.shop.y + 1.5) * TILE) < 40) this.hubFocus = { type: 'shop' };
    }
  }

  // The Training Grounds: src/tutorial.js drives the lessons.
  startTutorial() {
    this.levelNum = 0;
    this.loadLevel(generateTutorial(), 'U');
  }

  addGenerator(type, tx, ty) {
    const g = { type, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, r: 14, hp: GENERATOR_HP, timer: 1, hurt: 0 };
    this.gens.push(g);
    this.burst(g.x, g.y, '#9a8a6a', 20, 140);
    return g;
  }

  // Timed bonus round full of gold, no monsters, no health drain.
  startTreasure(realm) {
    this.loadLevel(generateTreasureRoom(realm), `T${realm}`);
    this.treasureT = 25;
    this.banner = { text: 'Treasure Room!', sub: 'Grab all the gold you can', t: 2.5 };
    say('Treasure room! Collect the gold!', 'treasure', 2000);
  }

  // Online guests rebuild the same level from its key (levels are generated
  // deterministically) and get everything in it from the host's snapshots.
  loadMirror(key) {
    const L = key === 'H' ? generateHub() : key === 'U' ? generateTutorial()
      : key[0] === 'T' ? generateTreasureRoom(Number(key.slice(1))) : generateLevel(Number(key.slice(1)));
    if (key[0] === 'L') this.levelNum = Number(key.slice(1));
    this.setLevel(L, key);
  }

  setLevel(L, key) {
    this.treasureT = 0;
    this.level = L;
    this.levelKey = key;
    this.levelSeq++;
    this.w = L.w; this.h = L.h; this.tiles = L.tiles;
    this.tiles0 = L.tiles.slice(); // as generated, to send guests only what changed
    this.theme = L.info.theme;
    this.info = L.info;
    this.explored = new Uint8Array(L.w * L.h);
    this.enemies = []; this.gens = []; this.projs = []; this.items = []; this.particles = []; this.texts = [];
    this.flash = 0; this.shake = 0; this.exitReached = false; this.boss = null;
    this.flowT = 0; this.exploreT = 0; this.time = 0;
    this.crackHp = new Map(); this.runesFound = [];
    this.refreshDifficulty();
    this.banner = { text: L.info.stageName, sub: L.info.theme.name, t: 3.5 };
  }

  loadLevel(L, key = 'L0') {
    this.setLevel(L, key);

    const c = (tx) => tx * TILE + TILE / 2;
    for (const it of L.items) this.items.push({ type: it.type, sub: it.sub, x: c(it.x), y: c(it.y), r: 10, bob: Math.random() * 6 });
    for (const g of L.generators) this.gens.push({ type: g.type, x: c(g.x), y: c(g.y), r: 14, hp: GENERATOR_HP, timer: rand(0.5, 3), hurt: 0 });
    for (const e of L.enemies) this.spawnEnemy(e.type, c(e.x), c(e.y));
    if (L.boss) this.spawnBoss(c(L.boss.x), c(L.boss.y));

    this.allPlayers().forEach((p, i) => {
      const s = this.spawnPoint(i);
      p.x = s.x; p.y = s.y;
      p.alive = true;
      if (p.hp <= 0) p.hp = p.def.hp;
      p.dash = null; p.invuln = 1.5; p.buffs = {};
    });
    this.camX = this.camTargetX(); this.camY = this.camTargetY();
    this.updateFlow();
    if (L.info.isBoss) { sfx.boss(); say(`Beware! ${L.info.boss.name}`, 'boss', 1000); }
  }

  spawnPoint(i) {
    const s = this.level.start;
    const off = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]][i % 4];
    return { x: (s.x + 0.5 + off[0]) * TILE, y: (s.y + 0.5 + off[1]) * TILE };
  }

  findOpenSpotNear(x, y) {
    for (let r = 0; r < 4; r++)
      for (let a = 0; a < 8; a++) {
        const nx = x + Math.cos(a * Math.PI / 4) * r * TILE * 0.8;
        const ny = y + Math.sin(a * Math.PI / 4) * r * TILE * 0.8;
        if (!this.collides(nx, ny, 12)) return { x: nx, y: ny };
      }
    return { x, y };
  }

  refreshDifficulty() {
    this.diff = difficulty(this.levelNum, Math.max(1, this.allPlayers().length));
  }

  spawnEnemy(type, x, y) {
    const d = ENEMIES[type];
    if (!this.diff) this.refreshDifficulty();
    const scale = this.diff.hp;
    const e = {
      kind: 'enemy', type, def: d, x, y, r: d.r, hp: Math.round(d.hp * scale), maxHp: Math.round(d.hp * scale), dmgMul: this.diff.dmg,
      speed: d.speed * (1 + Math.min(this.levelNum, 12) * 0.015), cd: rand(0.5, 1.5), hurt: 0,
      phase: Math.random() * 10, invisible: false, drained: 0, walk: Math.random() * 10,
    };
    this.enemies.push(e);
    return e;
  }

  spawnBoss(x, y) {
    const b = this.info.boss;
    const hp = Math.round(b.hp * (1 + 0.35 * (this.livePlayers().length - 1)));
    const e = {
      kind: 'enemy', type: 'boss', def: { ...b, ai: 'boss', dmg: 25, r: 30, xp: 400, score: 5000 },
      x, y, r: 30, hp, maxHp: hp, speed: b.speed, dmgMul: this.diff ? this.diff.dmg : 1, cd: 2, cd2: 6, cd3: 3, hurt: 0, phase: 0, walk: 0,
      charging: 0, cvx: 0, cvy: 0,
    };
    this.enemies.push(e);
    this.boss = e;
  }

  // ---------- tile helpers ----------

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.WALL;
    return this.tiles[ty * this.w + tx];
  }

  // Blocks walking. Open sky (VOID) blocks feet but not shots; monsters also refuse to step
  // into lava, while heroes may wade through it and burn.
  solid(tx, ty, avoidLava = false, float = false) {
    const t = this.tile(tx, ty);
    return t === T.WALL || t === T.DOOR || t === T.SEALED || (t === T.VOID && !float) || t === T.CRACKED || (avoidLava && t === T.LAVA);
  }

  blocksShots(tx, ty) {
    const t = this.tile(tx, ty);
    return t === T.WALL || t === T.DOOR || t === T.SEALED || t === T.CRACKED;
  }

  // Cracked walls crumble after a few hits and reveal a secret room.
  damageCracked(tx, ty, amount) {
    if (this.tile(tx, ty) !== T.CRACKED) return false;
    const i = ty * this.w + tx;
    const hp = (this.crackHp.get(i) ?? 40) - amount;
    this.crackHp.set(i, hp);
    const cx = tx * TILE + 16, cy = ty * TILE + 16;
    this.burst(cx, cy, '#a89070', 5, 90);
    sfx.hit();
    if (hp <= 0) {
      this.tiles[i] = T.FLOOR;
      this.burst(cx, cy, '#a89070', 30, 200);
      this.shake = 8;
      sfx.door();
      this.text(cx, cy - 20, 'SECRET!', '#ffe070', 2);
      say('You found a secret area', 'secret', 4000);
      this.updateFlow();
    }
    return true;
  }

  anyBuff(name) { return this.livePlayers().some((p) => p.buffs[name]); }

  spikeCycle() { return Math.floor(this.time / 2.6); }
  spikesUp() { return this.time % 2.6 < 0.8; }

  collides(x, y, r, avoidLava = false, float = false) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.solid(tx, ty, avoidLava, float)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    return false;
  }

  move(e, dx, dy) {
    let blocked = false;
    const avoid = e.kind === 'enemy' && e.type !== 'ghost';
    const float = e.kind === 'player' && !!e.buffs.levitate;
    if (dx) { if (!this.collides(e.x + dx, e.y, e.r, avoid, float)) e.x += dx; else blocked = true; }
    if (dy) { if (!this.collides(e.x, e.y + dy, e.r, avoid, float)) e.y += dy; else blocked = true; }
    return blocked;
  }

  lineOfSight(a, b) {
    const d = dist(a, b);
    const steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const x = a.x + (b.x - a.x) * (i / steps), y = a.y + (b.y - a.y) * (i / steps);
      if (this.blocksShots(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }

  openDoorAt(tx, ty) {
    const stack = [[tx, ty]];
    let count = 0;
    while (stack.length) {
      const [x, y] = stack.pop();
      if (this.tile(x, y) !== T.DOOR) continue;
      this.tiles[y * this.w + x] = T.FLOOR;
      count++;
      for (let k = 0; k < 6; k++) this.particle(x * TILE + 16, y * TILE + 16, rand(-80, 80), rand(-80, 80), '#c9a24a', 0.6, 3);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (count) { sfx.door(); this.updateFlow(); }
  }

  // Flow field toward the nearest player, used for enemy pathing.
  updateFlow() {
    const sources = this.livePlayers().map((p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)]);
    this.flow = sources.length ? bfs(this.tiles, this.w, this.h, sources, walkable) : null;
  }

  // ---------- camera ----------

  camTargetX() {
    const ps = this.livePlayers().length ? this.livePlayers() : this.allPlayers();
    if (!ps.length) return 0;
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    return Math.max(-60, Math.min(this.w * TILE - VIEW_W + 60, cx - VIEW_W / 2));
  }
  camTargetY() {
    const ps = this.livePlayers().length ? this.livePlayers() : this.allPlayers();
    if (!ps.length) return 0;
    const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    return Math.max(-60, Math.min(this.h * TILE - VIEW_H + 60, cy - VIEW_H / 2));
  }

  onScreen(e, pad = 0) {
    return e.x > this.camX - pad && e.x < this.camX + VIEW_W + pad && e.y > this.camY + HUD_H - pad && e.y < this.camY + VIEW_H + pad;
  }

  // Would moving player p to (nx, ny) push the group wider than one screen?
  spreadOk(p, nx, ny) {
    let minX = nx, maxX = nx, minY = ny, maxY = ny;
    for (const q of this.livePlayers()) {
      if (q === p) continue;
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    return { x: maxX - minX <= SPREAD_X, y: maxY - minY <= SPREAD_Y };
  }

  // ---------- effects ----------

  particle(x, y, vx, vy, color, life = 0.5, size = 3) {
    if (this.fx && !this.fxQuiet) this.fx.push(['p', Math.round(x), Math.round(y), Math.round(vx), Math.round(vy), color, +life.toFixed(2), +size.toFixed(1)]);
    if (this.particles.length > 600) return;
    this.particles.push({ x, y, vx, vy, color, life, max: life, size });
  }
  burst(x, y, color, n = 10, speed = 120) {
    if (this.fx) this.fx.push(['b', Math.round(x), Math.round(y), color, n, speed]);
    this.fxQuiet = true; // guests make the burst's particles themselves
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.3, 0.7), rand(2, 4));
    }
    this.fxQuiet = false;
  }
  text(x, y, text, color = '#fff', life = 1.2) {
    if (this.fx) this.fx.push(['t', Math.round(x), Math.round(y), text, color, life]);
    this.texts.push({ x, y, text, color, life, max: life });
  }

  // ---------- main update ----------

  update(dt, input) {
    this.time += dt;
    if (this.level.hub) this.updateHubFocus();
    if (this.treasureT > 0) {
      this.treasureT -= dt;
      if (this.treasureT <= 0 || !this.items.some((i) => i.type === 'gold' || i.type === 'gem' || i.type === 'chest')) { this.treasureT = 0.0001; this.exitReached = true; }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    this.flash = Math.max(0, this.flash - dt * 2);
    this.shake = Math.max(0, this.shake - dt * 20);

    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.25; this.updateFlow(); }
    this.exploreT -= dt;
    if (this.exploreT <= 0) { this.exploreT = 0.2; this.updateExplored(); }

    for (const p of this.allPlayers()) this.updatePlayer(p, dt, input.get(p.source));
    for (const g of this.gens) this.updateGenerator(g, dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.separateEnemies();
    for (const pr of this.projs) this.updateProjectile(pr, dt);
    this.updateItems(dt);

    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.gens = this.gens.filter((g) => g.hp > 0);
    this.projs = this.projs.filter((p) => !p.dead);
    this.items = this.items.filter((i) => !i.dead);
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 30 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);

    const k = 1 - Math.pow(0.001, dt);
    this.camX += (this.camTargetX() - this.camX) * k;
    this.camY += (this.camTargetY() - this.camY) * k;
  }

  updateExplored() {
    const R = 8;
    for (const p of this.livePlayers()) {
      const px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
      for (let y = py - R; y <= py + R; y++)
        for (let x = px - R; x <= px + R; x++)
          if (x >= 0 && y >= 0 && x < this.w && y < this.h && (x - px) ** 2 + (y - py) ** 2 <= R * R) this.explored[y * this.w + x] = 1;
    }
  }

  // ---------- players ----------

  updatePlayer(p, dt, inp) {
    if (!p.alive) { p.deadT += dt; return; }
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.shotCd -= dt;
    p.swing = Math.max(0, p.swing - dt);
    p.throwT = Math.max(0, p.throwT - dt);
    p.turbo = Math.min(100, p.turbo + dt * 4); // turbo slowly recharges
    p.warnT -= dt;
    for (const k of Object.keys(p.buffs)) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }

    // Health drains over time (not in the treasure room).
    if (!this.treasureT && !this.level.hub && !this.level.tutorial) p.drain += HEALTH_DRAIN * dt;
    if (p.drain >= 1) { const d = Math.floor(p.drain); p.drain -= d; p.hp -= d; }
    this.healthWarnings(p);
    if (p.hp <= 0) { this.killPlayer(p); return; }

    // Movement / dash
    let speed = p.speed * (p.buffs.speed ? 1.5 : 1);
    let mx = inp.x, my = inp.y;
    if (p.dash) {
      p.dash.t -= dt;
      mx = p.dash.vx; my = p.dash.vy; speed = 520;
      for (const e of this.enemies) {
        if (!p.dash.hit.has(e) && dist(p, e) < p.r + e.r + 8) { p.dash.hit.add(e); this.damageEnemy(e, p.strength * 1.6, p, true); }
      }
      if (p.dash.t <= 0) p.dash = null;
    } else if (inp.attack && p.shotCd > -0.05) {
      speed *= 0.55; // slow down while attacking, like the arcade
    }
    if (mx || my) {
      if (!p.dash) { const l = Math.hypot(mx, my); p.fx = mx / l; p.fy = my / l; }
      p.walk += dt * 10;
      const dx = mx * speed * dt, dy = my * speed * dt;
      const ok = this.spreadOk(p, p.x + dx, p.y + dy);
      const blocked = this.move(p, ok.x ? dx : 0, ok.y ? dy : 0);
      if (blocked && p.keys > 0) this.tryOpenDoor(p, mx, my);
    }

    if (p.buffs.phoenix) this.updateFamiliar(p, dt);

    // Levitation: remember solid ground; if it wears off over the void, land back on it
    const under = this.tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    if (under !== T.VOID && under !== T.LAVA) { p.safeX = p.x; p.safeY = p.y; }
    else if (under === T.VOID && !p.buffs.levitate) {
      p.x = p.safeX ?? p.x; p.y = p.safeY ?? p.y;
      this.text(p.x, p.y - 20, 'FELL!', '#ff8080', 1.2);
      this.hurtPlayer(p, 40, null);
      if (!p.alive) return;
    }

    // Spike traps stab anyone standing on them while they're up (once per cycle)
    if (this.tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === T.SPIKES && this.spikesUp() && p.spikeHit !== this.spikeCycle() && !p.buffs.levitate) {
      p.spikeHit = this.spikeCycle();
      this.hurtPlayer(p, 40, null);
      if (!p.alive) return;
    }

    // Lava burns anyone wading through it
    if (this.tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === T.LAVA && !p.dash && p.invuln <= 0 && !p.buffs.shield && !p.buffs.levitate) {
      p.burn = (p.burn || 0) + 45 * dt;
      if (p.burn >= 1) { const d = Math.floor(p.burn); p.burn -= d; p.hp -= d; }
      p.hurtFlash = Math.max(p.hurtFlash, 0.05);
      if (Math.random() < dt * 20) this.particle(p.x + rand(-8, 8), p.y + rand(-8, 8), rand(-20, 20), rand(-40, -10), Math.random() < 0.5 ? '#ff8a20' : '#ffd040', 0.5, 3);
      sfx.hurt();
      if (p.hp <= 0) { this.killPlayer(p); return; }
    }

    // Exit
    if (this.tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === T.EXIT && !this.exitReached) {
      this.exitReached = true;
      p.score += 500;
      sfx.exit();
    }

    // Actions
    if (inp.turbo && inp.attack && p.turbo >= TURBO_COST && p.shotCd <= 0 && !p.dash) this.turboAttack(p);
    else if (inp.attack && p.shotCd <= 0 && !p.dash) this.attack(p);
    if (inp.pressed.magic) this.usePotion(p);
  }

  healthWarnings(p) {
    if (p.warnT > 0) return;
    if (p.hp < 100) { say(`${p.name} is about to die!`, `die${p.slot}`, 15000); p.warnT = 6; }
    else if (p.hp < 220) { say(`${p.name} needs food, badly!`, `food${p.slot}`, 20000); p.warnT = 6; }
  }

  tryOpenDoor(p, mx, my) {
    const probe = [[p.x + mx * (p.r + 4), p.y + my * (p.r + 4)], [p.x + (p.r + 4), p.y], [p.x - (p.r + 4), p.y], [p.x, p.y + (p.r + 4)], [p.x, p.y - (p.r + 4)]];
    for (const [x, y] of probe) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.tile(tx, ty) === T.DOOR) {
        p.keys--;
        this.openDoorAt(tx, ty);
        return;
      }
    }
  }

  killPlayer(p) {
    p.alive = false; p.hp = 0; p.deadT = 0; p.dash = null;
    this.burst(p.x, p.y, p.color, 30, 200);
    sfx.die();
    say(`${p.name} has died`, `dead${p.slot}`, 3000);
    this.text(p.x, p.y - 20, 'DEFEATED', '#ff5050', 2);
  }

  respawn(p) {
    const anchor = this.livePlayers()[0];
    const pos = anchor ? this.findOpenSpotNear(anchor.x, anchor.y) : this.spawnPoint(p.slot);
    p.x = pos.x; p.y = pos.y;
    p.alive = true; p.hp = p.def.hp; p.invuln = 3; p.keys = 0; p.buffs = {};
    p.score = Math.floor(p.score * 0.9);
    sfx.join();
    this.text(p.x, p.y - 20, 'CONTINUE!', '#ffe070', 1.5);
  }

  gainXp(p, amount) {
    p.xp += amount;
    while (p.xp >= xpForLevel(p.lvl)) {
      p.xp -= xpForLevel(p.lvl);
      p.lvl++;
      p.strength += 3; p.shotDmg += 1.2; p.armor = Math.min(0.6, p.armor + 0.015);
      p.speed += 2; p.magic += 0.1; p.hp += 120;
      sfx.levelup();
      this.text(p.x, p.y - 30, `LEVEL ${p.lvl}!`, '#ffe070', 2);
      this.burst(p.x, p.y, '#ffe070', 20, 150);
    }
  }

  hurtPlayer(p, amount, source) {
    if (source && source.dmgMul) amount *= source.dmgMul;
    if (!p.alive || p.invuln > 0 || p.buffs.shield || p.dash) return;
    const dmg = Math.max(1, Math.round(amount * (1 - Math.min(0.75, p.armor + (p.buffs.grow ? 0.15 : 0)))));
    p.hp -= dmg;
    p.hurtFlash = 0.15;
    sfx.hurt();
    this.text(p.x + rand(-6, 6), p.y - 18, `-${dmg}`, '#ff6060', 0.7);
    if (this.level.tutorial) p.hp = Math.max(p.hp, 60); // nobody dies while learning
    if (p.hp <= 0) this.killPlayer(p);
  }

  attack(p) {
    const cd = p.def.shotCooldown * (p.buffs.rapid ? 0.5 : 1);
    p.shotCd = cd;
    if (p.buffs.fire) { this.breathFire(p); sfx.shoot('fireball'); }
    if (p.buffs.lightning) this.lightningArc(p);
    // Melee if something is right in front of us.
    const reach = p.r + 26;
    const targets = [];
    for (const e of this.enemies) {
      if (e.invisible) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d < reach + e.r && (dx * p.fx + dy * p.fy) / (d || 1) > 0.3) targets.push(e);
    }
    for (const g of this.gens) {
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      if (d < reach + g.r && (dx * p.fx + dy * p.fy) / (d || 1) > 0.3) targets.push(g);
    }
    const ftx = Math.floor((p.x + p.fx * (p.r + 14)) / TILE), fty = Math.floor((p.y + p.fy * (p.r + 14)) / TILE);
    if (!targets.length && this.tile(ftx, fty) === T.CRACKED) {
      p.swing = 0.18;
      p.act = { type: 'melee', t: this.time };
      p.shotCd = cd * 1.1;
      sfx.melee();
      this.damageCracked(ftx, fty, p.strength);
      return;
    }
    if (targets.length) {
      p.swing = 0.18;
      p.act = { type: 'melee', t: this.time };
      p.shotCd = cd * 1.1;
      sfx.melee();
      const str = p.strength * (p.buffs.grow ? 1.5 : 1);
      targets.slice(0, 3).forEach((t) => (t.kind === 'enemy' ? this.damageEnemy(t, str, p, true) : this.damageGen(t, str * 0.6, p)));
      return;
    }
    const angles = p.buffs.triple ? [-0.22, 0, 0.22] : [0];
    p.throwT = 0.15;
    p.act = { type: 'shoot', t: this.time };
    for (const a of angles) this.fire(p, Math.atan2(p.fy, p.fx) + a, {});
    sfx.shoot(p.def.shot);
  }

  fire(p, angle, { dmg = p.shotDmg, pierce = 0, speed = p.def.shotSpeed, kind = p.def.shot, life = 1.6 } = {}) {
    const sup = !!p.buffs.super;
    this.projs.push({
      owner: 'player', p, kind, x: p.x + Math.cos(angle) * 10, y: p.y + Math.sin(angle) * 10,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: (kind === 'fireball' ? 7 : 5) * (sup ? 2 : 1),
      dmg: dmg * (sup ? 1.7 : 1) * (p.buffs.grow ? 1.4 : 1), pierce: pierce + (sup ? 3 : 0), life, hits: new Set(), spin: 0,
      super: sup, bounces: p.buffs.reflect ? 3 : 0,
    });
  }

  // Lightning Breath: each attack also arcs to the three nearest monsters.
  lightningArc(p) {
    const near = this.enemies.filter((e) => e.hp > 0 && !e.invisible && !e.def.immune && dist(e, p) < 200).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 3);
    let from = p;
    for (const e of near) {
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        this.particle(from.x + (e.x - from.x) * k + rand(-6, 6), from.y + (e.y - from.y) * k + rand(-6, 6), 0, 0, i % 2 ? '#e0f8ff' : '#80c8ff', 0.25, 4);
      }
      this.damageEnemy(e, p.shotDmg * 1.2, p, false);
      from = e;
    }
  }

  // Phoenix familiar: circles the hero and spits fire at the nearest monster.
  updateFamiliar(p, dt) {
    const a = this.time * 3 + p.slot;
    p.famX = p.x + Math.cos(a) * 30;
    p.famY = p.y + Math.sin(a) * 30;
    p.famT = (p.famT || 0) - dt;
    if (p.famT > 0) return;
    let best = null, bd = 280;
    for (const e of this.enemies) { if (e.hp <= 0 || e.invisible || e.def.immune) continue; const d = Math.hypot(e.x - p.famX, e.y - p.famY); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    p.famT = 0.7;
    const ang = Math.atan2(best.y - p.famY, best.x - p.famX);
    this.projs.push({ owner: 'player', p, kind: 'fireball', x: p.famX, y: p.famY, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, r: 6, dmg: p.shotDmg, pierce: 0, life: 1.2, hits: new Set(), spin: 0, bounces: 0 });
  }

  // Fire Breath power-up: a short cone of flame in front of the hero.
  breathFire(p) {
    const range = 110;
    for (let i = 0; i < 14; i++) {
      const a = Math.atan2(p.fy, p.fx) + (Math.random() - 0.5) * 0.9, sp = rand(160, 320);
      this.particle(p.x + p.fx * 14, p.y + p.fy * 14, Math.cos(a) * sp, Math.sin(a) * sp, Math.random() < 0.5 ? '#ff6a10' : '#ffd040', 0.4, 5);
    }
    const inCone = (o) => {
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
      return d < range + (o.r || 0) && (dx * p.fx + dy * p.fy) / (d || 1) > 0.55;
    };
    for (const e of this.enemies) if (e.hp > 0 && !e.def.immune && inCone(e)) this.damageEnemy(e, p.shotDmg * 1.3, p, false);
    for (const gn of this.gens) if (gn.hp > 0 && inCone(gn)) this.damageGen(gn, p.shotDmg * 0.8, p);
  }

  turboAttack(p) {
    p.act = { type: 'turbo', t: this.time };
    p.turbo -= TURBO_COST;
    p.shotCd = 0.5;
    this.stats.turbo++;
    sfx.turbo();
    this.shake = 6;
    switch (p.def.turbo) {
      case 'spin':
        p.swing = 0.5;
        this.burst(p.x, p.y, '#f2c14e', 30, 220);
        for (const e of this.enemies) {
          if (dist(p, e) < 90 + e.r) {
            this.damageEnemy(e, p.strength * 2.2, p, true);
            const d = dist(p, e) || 1;
            this.move(e, (e.x - p.x) / d * 30, (e.y - p.y) / d * 30);
          }
        }
        for (const g of this.gens) if (dist(p, g) < 90 + g.r) this.damageGen(g, p.strength * 1.2, p);
        break;
      case 'dash':
        p.dash = { t: 0.32, vx: p.fx, vy: p.fy, hit: new Set() };
        this.burst(p.x, p.y, '#bcd4ff', 20, 160);
        break;
      case 'nova':
        for (let i = 0; i < 16; i++) this.fire(p, (i / 16) * Math.PI * 2, { dmg: p.shotDmg * 1.6, pierce: 1, kind: 'fireball' });
        this.burst(p.x, p.y, '#ff8a3a', 30, 200);
        break;
      case 'volley': {
        const base = Math.atan2(p.fy, p.fx);
        for (let i = -4; i <= 4; i++) this.fire(p, base + i * 0.1, { dmg: p.shotDmg * 1.5, pierce: 3, speed: 650 });
        break;
      }
    }
  }

  usePotion(p, power = 1, fromShot = false) {
    if (!fromShot) {
      if (p.potions <= 0) return;
      p.potions--;
      this.stats.magic++;
    }
    sfx.potion();
    this.flash = 1;
    this.shake = 10;
    const dmg = 45 * p.magic * power;
    for (const e of this.enemies) {
      if (!this.onScreen(e, 20)) continue;
      if (e.type === 'death') { e.hp = 0; this.onEnemyKilled(e, p); continue; }
      this.damageEnemy(e, e.type === 'boss' ? dmg * 1.5 : dmg, p, false);
    }
    for (const g of this.gens) if (this.onScreen(g, 20)) this.damageGen(g, 16 * p.magic * power, p);
    if (!fromShot) this.text(p.x, p.y - 26, 'MAGIC!', '#c9a0ff', 1.2);
  }

  // ---------- damage ----------

  damageEnemy(e, amount, p, melee) {
    if (e.hp <= 0) return;
    if (e.def.immune) { if (melee) this.text(e.x, e.y - 16, 'IMMUNE', '#999', 0.6); return; }
    amount = Math.round(amount);
    e.hp -= amount;
    e.hurt = 0.12;
    if (p) p.turbo = Math.min(100, p.turbo + amount * 0.45);
    sfx.hit();
    this.burst(e.x, e.y, e.type === 'ghost' ? '#e0e8ff' : '#b02020', 4, 80);
    if (e.type === 'boss') this.shake = Math.max(this.shake, 2);
    else if (melee && p) {
      // melee hits shove the target back and jolt the camera a little
      const d = dist(p, e) || 1;
      this.move(e, ((e.x - p.x) / d) * 7, ((e.y - p.y) / d) * 7);
      this.shake = Math.max(this.shake, 2.5);
    }
    if (e.hp <= 0) this.onEnemyKilled(e, p);
  }

  onEnemyKilled(e, p) {
    e.hp = 0;
    this.burst(e.x, e.y, e.def.color || '#888', e.type === 'boss' ? 80 : 12, e.type === 'boss' ? 300 : 140);
    if (p) { p.score += e.def.score; this.gainXp(p, Math.round(e.def.xp * this.diff.xp)); }
    if (e.type === 'death') this.text(e.x, e.y - 20, 'DEATH DEFEATED! +1000', '#ffe070', 2);
    if (e.type === 'boss') this.onBossKilled(e);
  }

  onBossKilled(e) {
    sfx.explode(); sfx.exit();
    this.shake = 20; this.flash = 1;
    say(`${this.info.boss.name} has been defeated!`, 'bossdead', 1000);
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === T.SEALED) this.tiles[i] = T.EXIT;
    this.items.push({ type: 'rune', x: e.x, y: e.y, r: 12, bob: 0 });
    this.items.push({ type: 'food', x: e.x + 30, y: e.y, r: 10, bob: 0 }, { type: 'food', x: e.x - 30, y: e.y, r: 10, bob: 0 });
    this.banner = { text: 'Rune Stone recovered! The exit is open.', t: 4 };
    this.boss = null;
    // clear the minions
    for (const m of this.enemies) if (m !== e && m.hp > 0) { m.hp = 0; this.burst(m.x, m.y, '#fff', 6, 90); }
    this.gens.forEach((g) => { g.hp = 0; this.burst(g.x, g.y, '#888', 15, 140); });
  }

  damageGen(g, amount, p) {
    if (g.hp <= 0) return;
    g.hp -= amount;
    g.hurt = 0.12;
    if (p) p.turbo = Math.min(100, p.turbo + amount * 0.3);
    sfx.hit();
    this.burst(g.x, g.y, '#9a8a6a', 5, 90);
    if (g.hp <= 0) {
      sfx.explode();
      this.burst(g.x, g.y, '#c0a070', 25, 180);
      if (p) { p.score += 100; this.gainXp(p, 15); }
      this.text(g.x, g.y - 20, '+100', '#ffe070');
    }
  }

  // ---------- generators ----------

  updateGenerator(g, dt) {
    g.hurt = Math.max(0, g.hurt - dt);
    const ps = this.livePlayers();
    if (!ps.length) return;
    const near = Math.min(...ps.map((p) => dist(p, g)));
    if (near > 520) return;
    g.timer -= dt;
    if (g.timer > 0) return;
    const tier = Math.ceil(g.hp / (GENERATOR_HP / 3));
    g.timer = rand(2.2, 3.6) / (0.6 + tier * 0.25) / this.diff.spawn;
    if (this.enemies.length >= MAX_ENEMIES) return;
    const local = this.enemies.filter((e) => Math.abs(e.x - g.x) < 200 && Math.abs(e.y - g.y) < 200).length;
    if (local >= this.diff.localCap) return;
    const a = Math.random() * Math.PI * 2;
    const x = g.x + Math.cos(a) * 26, y = g.y + Math.sin(a) * 26;
    const r = ENEMIES[g.type].r;
    if (!this.collides(x, y, r, true)) {
      this.spawnEnemy(g.type, x, y).fromGen = true;
      this.burst(x, y, '#6a5a8a', 5, 60);
    }
  }

  // ---------- enemies ----------

  nearestPlayer(e) {
    let best = null, bd = Infinity;
    for (const p of this.livePlayers()) {
      const d = dist(p, e);
      if (p.buffs.invisible && d > 44) continue; // invisible heroes go unnoticed unless bumped into
      if (d < bd) { bd = d; best = p; }
    }
    return [best, bd];
  }

  // Move enemy along the flow field toward (or away from) players.
  steer(e, target, d, dt, flee = false) {
    let dx = 0, dy = 0;
    if (!flee && d < 150 && this.lineOfSight(e, target)) {
      dx = target.x - e.x; dy = target.y - e.y;
    } else if (this.flow) {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      const here = this.flow[ty * this.w + tx];
      let best = null, bv = flee ? -1 : (here >= 0 ? here : 1e9);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = tx + ox, ny = ty + oy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          if (ox && oy && (this.solid(tx + ox, ty) || this.solid(tx, ty + oy))) continue;
          const v = this.flow[ny * this.w + nx];
          if (v < 0) continue;
          if (flee ? v > bv : v < bv) { bv = v; best = [nx, ny]; }
        }
      if (best) { dx = (best[0] + 0.5) * TILE - e.x; dy = (best[1] + 0.5) * TILE - e.y; }
      else if (!flee) { dx = target.x - e.x; dy = target.y - e.y; }
    }
    const l = Math.hypot(dx, dy);
    if (l < 0.01) return;
    const sp = e.speed * dt;
    e.walk += dt * 8;
    e.dirX = dx / l;
    this.move(e, (dx / l) * sp, (dy / l) * sp);
  }

  updateEnemy(e, dt) {
    if (e.hp <= 0) return;
    e.cd -= dt;
    e.hurt = Math.max(0, e.hurt - dt);
    e.phase += dt;
    const [p, d] = this.nearestPlayer(e);
    if (!p) return;
    if (d > 900 && e.type !== 'boss') return;
    const contact = d < e.r + p.r + 3;
    const def = e.def;

    switch (def.ai) {
      case 'melee':
        if (!contact) this.steer(e, p, d, dt);
        else if (e.cd <= 0) { e.cd = 0.7; e.act = { type: 'melee', t: this.time }; this.hurtPlayer(p, def.dmg, e); }
        break;
      case 'kamikaze':
        if (!contact) this.steer(e, p, d, dt);
        else { this.hurtPlayer(p, def.dmg, e); e.hp = 0; e.vanish = true; this.burst(e.x, e.y, '#e0e8ff', 12, 120); }
        break;
      case 'death':
        if (!contact) this.steer(e, p, d, dt);
        else if (p.buffs.antideath) {
          this.onEnemyKilled(e, p);
          this.text(e.x, e.y - 24, 'DEATH BANISHED!', '#fff080', 2);
          sfx.powerup();
        } else if (e.cd <= 0) {
          e.cd = 0.1;
          if (!e.act || this.time - e.act.t > 1) e.act = { type: 'melee', t: this.time };
          if (p.invuln <= 0 && !p.buffs.shield) {
            p.hp -= 3; e.drained += 3; p.hurtFlash = 0.1;
            if (p.hp <= 0) this.killPlayer(p);
            if (e.drained >= 180) { e.hp = 0; e.vanish = true; this.burst(e.x, e.y, '#333', 20, 120); this.text(e.x, e.y - 20, 'Death vanishes...', '#aaa', 1.5); }
          }
          say('Death!', 'death', 10000);
        }
        break;
      case 'lobber':
        if (d < 110) this.steer(e, p, d, dt, true);
        else if (d > def.range) this.steer(e, p, d, dt);
        if (d < def.range + 40 && e.cd <= 0) {
          e.cd = def.cooldown * rand(0.8, 1.2);
          e.act = { type: 'throw', t: this.time };
          this.projs.push({ owner: 'enemy', kind: 'lob', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: p.x + rand(-20, 20), ty: p.y + rand(-20, 20), t: 0, T: 1.0, dmg: def.dmg * (e.dmgMul || 1), r: 6, z: 0 });
        }
        break;
      case 'shooter':
      case 'sorcerer':
        if (def.ai === 'sorcerer') {
          const cycle = e.phase % 4;
          e.invisible = cycle > 2.6;
        }
        if (contact) {
          if (e.cd <= 0) { e.cd = 0.8; e.act = { type: 'melee', t: this.time }; this.hurtPlayer(p, def.dmg, e); }
        } else {
          const los = d < def.range && this.lineOfSight(e, p);
          if (los && e.cd <= 0 && !e.invisible) {
            e.cd = def.cooldown * rand(0.8, 1.2);
            e.act = { type: 'cast', t: this.time };
            this.enemyShot(e, Math.atan2(p.y - e.y, p.x - e.x), def.ai === 'sorcerer' ? 'bolt' : 'efire', def.dmg, 230);
          }
          if (!los || d > 140) this.steer(e, p, d, dt);
        }
        break;
      case 'boss':
        this.updateBoss(e, p, d, dt, contact);
        break;
    }
  }

  enemyShot(e, angle, kind, dmg, speed) {
    dmg *= e.dmgMul || 1;
    this.projs.push({ owner: 'enemy', kind, x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 6, dmg, life: 3 });
    sfx.enemyShot();
  }

  updateBoss(e, p, d, dt, contact) {
    e.cd2 -= dt; e.cd3 -= dt;
    const enraged = e.hp < e.maxHp * 0.4;
    if (e.charging > 0) {
      e.charging -= dt;
      const blocked = this.move(e, e.cvx * dt, e.cvy * dt);
      if (blocked) { e.charging = 0; this.shake = 8; sfx.explode(); }
      for (const q of this.livePlayers()) if (dist(q, e) < e.r + q.r) this.hurtPlayer(q, 40, e);
      return;
    }
    if (contact && e.cd <= 0) { e.cd = 0.9; e.act = { type: 'melee', t: this.time }; this.hurtPlayer(p, e.def.dmg, e); }
    else if (!contact) this.steer(e, p, d, dt);
    // Radial fire burst
    if (e.cd2 <= 0) {
      e.cd2 = enraged ? 2.2 : 3.4;
      e.act = { type: 'cast', t: this.time };
      const n = enraged ? 20 : 14;
      const off = Math.random();
      for (let i = 0; i < n; i++) this.enemyShot(e, ((i + off) / n) * Math.PI * 2, 'efire', 18, 200);
    }
    // Charge or summon
    if (e.cd3 <= 0) {
      e.cd3 = enraged ? 3.5 : 5;
      if (Math.random() < 0.55 && this.lineOfSight(e, p)) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.charging = 0.8; e.cvx = Math.cos(a) * 380; e.cvy = Math.sin(a) * 380;
        this.text(e.x, e.y - 40, 'CHARGE!', '#ff8060', 1);
      } else {
        const kinds = ['grunt', 'ghost', 'demon', 'sorcerer'];
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const x = e.x + Math.cos(a) * 50, y = e.y + Math.sin(a) * 50;
          const kind = kinds[Math.floor(Math.random() * (Math.min(this.info.realm, 3) + 1))];
          if (!this.collides(x, y, 12)) this.spawnEnemy(kind, x, y).fromGen = true;
        }
        this.burst(e.x, e.y, '#a080ff', 20, 160);
      }
    }
  }

  separateEnemies() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          if (a.type !== 'boss') this.move(a, -ux * push, -uy * push);
          if (b.type !== 'boss') this.move(b, ux * push, uy * push);
        }
      }
      // keep enemies from overlapping players
      for (const p of this.livePlayers()) {
        const dx = a.x - p.x, dy = a.y - p.y;
        const min = a.r + p.r;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min && a.type !== 'boss') this.move(a, (dx / d) * (min - d), (dy / d) * (min - d));
      }
    }
  }

  // ---------- projectiles ----------

  updateProjectile(pr, dt) {
    if (pr.kind === 'lob') {
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.T);
      pr.x = pr.sx + (pr.tx - pr.sx) * k;
      pr.y = pr.sy + (pr.ty - pr.sy) * k;
      pr.z = Math.sin(k * Math.PI) * 60;
      if (k >= 1) {
        pr.dead = true;
        this.burst(pr.x, pr.y, '#8a7a5a', 10, 100);
        for (const p of this.livePlayers()) if (dist(p, pr) < 28) this.hurtPlayer(p, pr.dmg, null);
      }
      return;
    }
    pr.life -= dt;
    if (pr.life <= 0) { pr.dead = true; return; }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.spin = (pr.spin || 0) + dt * 20;
    if (this.blocksShots(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE))) {
      if (pr.owner === 'player') this.damageCracked(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE), pr.dmg);
      if (pr.bounces > 0 && this.tile(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE)) !== T.CRACKED) {
        // Reflect Shot: bounce off the wall face that was hit
        const px = pr.x - pr.vx * dt, py = pr.y - pr.vy * dt;
        const hitX = this.blocksShots(Math.floor(pr.x / TILE), Math.floor(py / TILE));
        const hitY = this.blocksShots(Math.floor(px / TILE), Math.floor(pr.y / TILE));
        pr.x = px; pr.y = py;
        if (hitX || !hitY) pr.vx = -pr.vx;
        if (hitY || !hitX) pr.vy = -pr.vy;
        pr.bounces--;
        pr.hits.clear();
        pr.life = Math.max(pr.life, 0.9);
        this.burst(pr.x, pr.y, '#8ad0ff', 4, 60);
        return;
      }
      pr.dead = true;
      this.burst(pr.x - pr.vx * dt, pr.y - pr.vy * dt, pr.owner === 'player' ? '#ddd' : '#ff8040', 4, 60);
      return;
    }
    if (pr.owner === 'enemy') {
      for (const p of this.livePlayers()) {
        if (dist(p, pr) < p.r + pr.r) { this.hurtPlayer(p, pr.dmg, null); pr.dead = true; return; }
      }
      return;
    }
    // player projectile
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.invisible || pr.hits.has(e)) continue;
      if (dist(e, pr) < e.r + pr.r) {
        if (e.def.immune) { pr.dead = true; this.burst(pr.x, pr.y, '#888', 4, 60); return; }
        this.damageEnemy(e, pr.dmg, pr.p, false);
        pr.hits.add(e);
        if (pr.pierce-- <= 0) { pr.dead = true; return; }
      }
    }
    for (const g of this.gens) {
      if (g.hp > 0 && dist(g, pr) < g.r + pr.r) { this.damageGen(g, pr.dmg, pr.p); pr.dead = true; return; }
    }
    for (const it of this.items) {
      if (it.dead || dist(it, pr) > it.r + pr.r) continue;
      if (it.type === 'poison') { it.dead = true; pr.dead = true; this.burst(it.x, it.y, '#60ff40', 12, 100); this.text(it.x, it.y - 14, 'POISON DESTROYED', '#80ff60', 1.2); return; }
      if (it.type === 'food') {
        it.dead = true; pr.dead = true;
        this.burst(it.x, it.y, '#c08040', 10, 100);
        this.text(it.x, it.y - 14, 'FOOD DESTROYED', '#ff8080', 1.4);
        say(`${pr.p.name} shot the food!`, 'shotfood', 6000);
        return;
      }
      if (it.type === 'potion') {
        it.dead = true; pr.dead = true;
        this.usePotion(pr.p, 0.5, true);
        this.text(it.x, it.y - 14, 'POTION SHATTERED', '#c9a0ff', 1.4);
        return;
      }
      if (it.type === 'chest' || it.type === 'barrel') {
        it.dead = true; pr.dead = true;
        this.openChest(it);
        return;
      }
    }
  }

  openChest(it) {
    sfx.door();
    this.burst(it.x, it.y, '#c9a24a', 14, 120);
    const roll = Math.random();
    const drops = [];
    if (it.type === 'barrel') {
      // barrels are usually empty, sometimes hide food or gold
      if (roll < 0.25) drops.push('food'); else if (roll < 0.5) drops.push('gold');
      this.burst(it.x, it.y, '#8a5a2a', 16, 140);
    } else if (roll < 0.35) drops.push('gold', 'gold', 'gem');
    else if (roll < 0.55) drops.push('food');
    else if (roll < 0.7) drops.push('potion');
    else if (roll < 0.85) drops.push('key', 'gold');
    else drops.push('amulet');
    drops.forEach((type, i) => {
      const a = (i / drops.length) * Math.PI * 2;
      this.items.push({
        type, x: it.x + Math.cos(a) * 14 * (drops.length > 1 ? 1 : 0), y: it.y + Math.sin(a) * 14 * (drops.length > 1 ? 1 : 0),
        r: 10, bob: Math.random() * 6, sub: type === 'amulet' ? POWERUP_ORDER[Math.floor(Math.random() * POWERUP_ORDER.length)] : undefined,
      });
    });
  }

  // ---------- items ----------

  updateItems(dt) {
    for (const it of this.items) {
      it.bob += dt * 3;
      if (it.dead || it.type === 'chest' || it.type === 'barrel') continue;
      for (const p of this.livePlayers()) {
        if (dist(p, it) > p.r + it.r) continue;
        if (this.pickup(p, it)) { it.dead = true; break; }
      }
    }
  }

  pickup(p, it) {
    switch (it.type) {
      case 'poison':
        this.hurtPlayer(p, 110, null);
        this.burst(it.x, it.y, '#60ff40', 18, 120);
        this.text(it.x, it.y - 10, 'POISONED!', '#80ff60', 1.5);
        say(`${p.name} ate poisoned food!`, 'poison', 6000);
        return true;
      case 'food':
        p.hp += FOOD_HEAL; sfx.food(); this.stats.food++; this.text(it.x, it.y - 10, `+${FOOD_HEAL}`, '#80ff80'); return true;
      case 'gold':
        { const gv = Math.round(50 * this.diff.gold); p.score += 100; p.gold += gv; sfx.gold(); this.text(it.x, it.y - 10, `+${gv} GOLD`, '#ffe070'); return true; }
      case 'gem':
        { const gv = Math.round(200 * this.diff.gold); p.score += 500; p.gold += gv; sfx.gold(); this.text(it.x, it.y - 10, `+${gv} GOLD`, '#80e0ff'); return true; }
      case 'rune': {
        const guardian = it.sub !== 'hidden';
        p.score += guardian ? 5000 : 2500;
        p.gold += guardian ? 500 : 300;
        this.runesFound.push(guardian ? 'guardian' : 'hidden');
        sfx.powerup(); sfx.levelup();
        this.flash = 0.6;
        this.text(it.x, it.y - 10, 'RUNE STONE!', '#ffb0ff', 2.5);
        this.banner = { text: 'Rune Stone recovered!', sub: guardian ? 'The guardian has fallen' : 'A hidden stone, found at last', t: 3 };
        say(`${p.name} has found a Rune Stone!`, 'rune', 3000);
        return true;
      }
      case 'key':
        if (p.keys >= MAX_KEYS) return false;
        p.keys++; sfx.key(); this.text(it.x, it.y - 10, 'KEY', '#ffe070'); return true;
      case 'potion':
        if (p.potions >= MAX_POTIONS) return false;
        p.potions++; sfx.key(); this.text(it.x, it.y - 10, 'POTION', '#c9a0ff'); return true;
      case 'amulet': {
        const pu = POWERUPS[it.sub];
        p.buffs[it.sub] = pu.dur;
        sfx.powerup();
        this.text(it.x, it.y - 10, pu.name.toUpperCase(), pu.color, 2);
        return true;
      }
    }
    return false;
  }
}

export { CLASS_ORDER };
