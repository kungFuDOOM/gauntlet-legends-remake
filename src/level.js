// Procedural level generation. Pure module (no DOM) so it can be unit tested in Node.
//
// Each realm has its own layout style, after the arcade original's level design:
//   canyon  - Mountain Kingdom: winding mountain paths and clearings, lava rivers with bridges
//   castle  - Castle Stronghold: grassy courtyards and halls joined by wide passages
//   sky     - Sky Dominion: stone islands floating above the clouds, linked by narrow bridges
//   inferno - Underworld: scorched caverns full of lava
// Every style yields the same thing: a tile grid, "areas" (open spaces used for placing
// things), key-locked gates, and a start/exit pair.

import { POWERUP_ORDER } from './config.js';

export const T = { WALL: 0, FLOOR: 1, DOOR: 2, EXIT: 3, SEALED: 4, LAVA: 5, VOID: 6, BRIDGE: 7, CRACKED: 8, SPIKES: 9 };
export const GROUND = { DEFAULT: 0, GRASS: 1 };

export const THEMES = [
  {
    name: 'Mountain Kingdom', style: 'canyon', stages: ['Valley of Fire', 'Dagger Peak', 'Cliffs of Desolation'],
    floorA: '#4a4438', floorB: '#544c3f', wallTop: '#8f846d', wallSide: '#5c5444', rock: '#8a6a4c', dark: 0.35, accent: '#ffb24a',
    void: '#14110c', sky: '#2a1a12', fog: '#3a2416', light: '#ffc890', ambient: 0.75,
  },
  {
    name: 'Castle Stronghold', style: 'castle', stages: ['Castle Courtyard', 'Dungeon of Torment', 'Tower Armory'],
    floorA: '#3b3e4a', floorB: '#444857', wallTop: '#80869b', wallSide: '#4e5263', rock: '#6a6a74', dark: 0.45, accent: '#a8c0ff',
    void: '#0e0f14', sky: '#0c0e16', fog: '#141826', light: '#e0e4ff', ambient: 0.62,
  },
  {
    name: 'Sky Dominion', style: 'sky', stages: ['Poisonous Fields', 'Haunted Cemetery', 'Venomous Spire'],
    floorA: '#3f5361', floorB: '#4a5f6e', wallTop: '#b0cad9', wallSide: '#6a8698', rock: '#8a949c', dark: 0.18, accent: '#e0f4ff',
    void: '#1a2836', sky: '#7aaee0', fog: '#a8cdf0', light: '#ffffff', ambient: 0.95,
  },
  {
    name: 'Underworld', style: 'inferno', stages: ['Gates of the Underworld', 'Lava Pits', 'Hall of Souls'],
    floorA: '#3a2222', floorB: '#452827', wallTop: '#8f3c2a', wallSide: '#5a2418', rock: '#4a3632', dark: 0.55, accent: '#ff6a3a',
    void: '#120606', sky: '#140604', fog: '#2a0c06', light: '#ffc0a0', ambient: 0.55,
  },
];

// Each stage's own look, layered over its realm's theme: colours and light, the hazard's
// colour (lava, poison sludge, soul fire), drifting particles (see render3d), props, and how
// much lava the canyon layouts cut through it.
//   particles: embers | snow | ash | motes | spores | wisps | souls | sparks | drips
//   features: procedural dressing scattered near walls (crystals, mushrooms, braziers, webs, chains)
export const STAGE_LOOKS = {
  1: { // Valley of Fire: a sun-baked canyon crossed by lava
    sky: '#3a1608', fog: '#4a2010', light: '#ffb070', ambient: 0.8, rock: '#9a6a44', floorTint: '#f0d0b0',
    particles: { type: 'embers', color: '#ff8a30', count: 90 }, lava: { rivers: 1, pools: 0.32 }, lantern: '#ff9a40',
    features: [{ kind: 'crystal', color: '#ff7a30', rate: 0.05 }],
  },
  2: { // Dagger Peak: snow on the heights, cold blue light, ice crystals
    sky: '#4a5a78', fog: '#8a9ab8', light: '#e0eaff', ambient: 0.95, rock: '#8e94a4', floorTint: '#dfe6f2', cap: '#eef4ff',
    particles: { type: 'snow', color: '#ffffff', count: 160 }, lava: { rivers: -1, pools: 0 }, lantern: '#a0c8ff',
    features: [{ kind: 'crystal', color: '#80d0ff', rate: 0.09 }],
    deco: { corner: ['tree_dead_small', 'rubble', 'tree_dead_medium'], scatter: ['rubble', 'bones_a', 'skull'] },
  },
  3: { // Cliffs of Desolation: purple dusk, drifting ash, bones everywhere
    sky: '#1a0e24', fog: '#2e1a34', light: '#d8a8ff', ambient: 0.7, rock: '#6a5868', floorTint: '#c8b0c0',
    particles: { type: 'ash', color: '#b8a8b8', count: 120 }, lava: { rivers: 0, pools: 0.15 }, lantern: '#c890ff',
    deco: { corner: ['tree_dead_medium', 'ribcage', 'tree_dead_small'], scatter: ['bones_a', 'bones_b', 'skull', 'ribcage', 'skull'] },
    features: [{ kind: 'crystal', color: '#b070ff', rate: 0.04 }],
  },
  5: { // Castle Courtyard: daylight, banners and golden motes
    light: '#fff2d8', ambient: 0.85, fog: '#3a4258', sky: '#202838',
    particles: { type: 'motes', color: '#ffe8a0', count: 70 }, lantern: '#ffc070', banners: 0.16,
  },
  6: { // Dungeon of Torment: dark cells, green torchlight, chains and webs
    light: '#c8f0d0', ambient: 0.45, fog: '#08100a', sky: '#040806', wallTint: '#8a9a90', wallSide: '#3e4a44', wallTop: '#68786e', floorTint: '#a8b8a8',
    particles: { type: 'drips', color: '#80ff90', count: 70 }, lantern: '#50ff70', banners: 0,
    deco: { corner: ['coffin', 'bones_a', 'skull_candle'], scatter: ['bones_a', 'bones_b', 'skull', 'ribcage'] },
    features: [{ kind: 'chains', rate: 0.07 }, { kind: 'web', rate: 0.06 }],
  },
  7: { // Tower Armory: braziers, weapon racks and red banners
    light: '#ffd8a0', ambient: 0.7, fog: '#1a1010', sky: '#120a08', wallTint: '#e0c4a8', wallSide: '#5a4a44', wallTop: '#9a8070', floorTint: '#e8d0c0',
    particles: { type: 'sparks', color: '#ffb040', count: 60 }, lantern: '#ff9040', banners: 0.3, bannerColor: 'red',
    deco: { corner: ['sword_shield', 'barrel_stack', 'crates'], scatter: ['sword_shield', 'keg'] },
    features: [{ kind: 'brazier', rate: 0.05 }],
  },
  9: { // Poisonous Fields: sickly green skies, toxic spores, giant mushrooms
    sky: '#7aa060', fog: '#9ac088', light: '#eaffc8', ambient: 0.9, rock: '#7a8a6a', floorTint: '#c8dcb0',
    particles: { type: 'spores', color: '#b0ff50', count: 130 }, lantern: '#a0ff60',
    deco: { corner: ['tree_dead_small', 'pumpkin', 'fence'], scatter: ['bones_a', 'skull', 'pumpkin'] },
    features: [{ kind: 'mushroom', color: '#a0e040', rate: 0.12 }],
  },
  10: { // Haunted Cemetery: moonlit night, ghost wisps among the graves
    sky: '#141428', fog: '#262844', light: '#a8b8ff', ambient: 0.6, rock: '#6a7084', floorTint: '#a0a8c0',
    particles: { type: 'wisps', color: '#a0c0ff', count: 60 }, lantern: '#90b0ff',
    deco: { corner: ['gravestone', 'grave', 'tree_dead_medium', 'fence'], scatter: ['candles', 'skull', 'gravestone'] },
  },
  11: { // Venomous Spire: violet sky, poison crystals
    sky: '#4a2a6a', fog: '#6a4a8a', light: '#f0d0ff', ambient: 0.85, rock: '#8a7a9a', floorTint: '#d0b8e0',
    particles: { type: 'spores', color: '#e080ff', count: 110 }, lantern: '#e080ff',
    deco: { corner: ['column', 'candles', 'grave'], scatter: ['skull', 'candles'] },
    features: [{ kind: 'crystal', color: '#d050ff', rate: 0.1 }, { kind: 'mushroom', color: '#c060ff', rate: 0.04 }],
  },
  13: { // Gates of the Underworld: black iron, brimstone and falling ash
    sky: '#0e0404', fog: '#260806', light: '#ff9a80', ambient: 0.55, rock: '#4a2e2a',
    particles: { type: 'ash', color: '#ff7040', count: 110 }, lava: { rivers: 0, pools: 0.4 },
    features: [{ kind: 'brazier', rate: 0.04 }, { kind: 'chains', rate: 0.03 }],
  },
  14: { // Lava Pits: rivers of fire and showers of embers
    sky: '#2a0802', fog: '#4a1206', light: '#ffa060', ambient: 0.7, rock: '#5a3020', floorTint: '#e0a888',
    particles: { type: 'embers', color: '#ffa030', count: 170 }, lava: { rivers: 1, pools: 0.65 },
  },
  15: { // Hall of Souls: violet gloom, pools of soul fire, rising spirits
    sky: '#0a0614', fog: '#160c24', light: '#b8a8ff', ambient: 0.55, rock: '#3a2e4a', floorTint: '#b0a0c8',
    particles: { type: 'souls', color: '#80b0ff', count: 90 }, hazard: 'souls', lantern: '#7090ff', lava: { rivers: 0, pools: 0.45 },
    features: [{ kind: 'crystal', color: '#6080ff', rate: 0.06 }],
  },
};
// the guardians' lairs and anything else fall back to a look per realm
const REALM_LOOKS = [
  { particles: { type: 'embers', color: '#ff8a30', count: 80 } },
  { particles: { type: 'motes', color: '#c8d0ff', count: 50 } },
  { particles: { type: 'spores', color: '#c0ff70', count: 80 } },
  { particles: { type: 'embers', color: '#ff5020', count: 140 } },
];

export const BOSSES = [
  { name: 'The Dragon',       model: 'dragon',  color: '#b8321e', horn: '#e8d8b0', hp: 520,  speed: 70 },
  { name: 'The Chimera',      model: 'chimera', color: '#9a7a3a', horn: '#3a2a1a', hp: 700,  speed: 82 },
  { name: 'The Plague Fiend', model: 'fiend',   color: '#5a8a3a', horn: '#d0e0a0', hp: 880,  speed: 88 },
  { name: 'Skorne',           model: 'skorne',  color: '#4a2a5a', horn: '#d8c8a0', hp: 1150, speed: 92 },
];

export const LEVELS_PER_REALM = 4;

export function levelInfo(n) {
  const realm = Math.floor((n - 1) / LEVELS_PER_REALM);
  const theme = { ...THEMES[realm % THEMES.length], ...(STAGE_LOOKS[n] || REALM_LOOKS[realm % 4]) };
  return {
    realm,
    theme,
    style: theme.style,
    isBoss: n % LEVELS_PER_REALM === 0,
    stage: ((n - 1) % LEVELS_PER_REALM) + 1,
    stageName: n % LEVELS_PER_REALM === 0
      ? `${BOSSES[realm % BOSSES.length].name.replace(/^The /, '')}'s Lair`
      : theme.stages[(n - 1) % LEVELS_PER_REALM],
    boss: BOSSES[realm % BOSSES.length],
  };
}

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Multi-source BFS over a tile grid. Returns Int32Array of distances (-1 = unreachable).
export function bfs(tiles, w, h, sources, passable, parents = null) {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const [sx, sy] of sources) {
    const i = sy * w + sx;
    if (dist[i] === -1) { dist[i] = 0; queue[tail++] = i; if (parents) parents[i] = -1; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] !== -1 || !passable(tiles[j])) continue;
      dist[j] = dist[i] + 1;
      if (parents) parents[j] = i;
      queue[tail++] = j;
    }
  }
  return dist;
}

export const walkable = (t) => t === T.FLOOR || t === T.EXIT || t === T.BRIDGE || t === T.SPIKES;
export const walkableOrDoor = (t) => walkable(t) || t === T.DOOR;

// Which monsters live where: each realm has its own, and each stage of a realm adds tougher
// ones (index: realm, then stage 1-3; weights are how common each is).
export const ROSTERS = [
  [[['goblin', 6], ['bat', 3], ['bomber', 1]],
   [['goblin', 5], ['bat', 3], ['bomber', 2], ['orc', 1]],
   [['goblin', 4], ['bat', 2], ['bomber', 2], ['orc', 2], ['shaman', 2]]],
  [[['grunt', 5], ['ghost', 3], ['archer', 2]],
   [['grunt', 4], ['ghost', 3], ['archer', 2], ['lobber', 1], ['knight', 1]],
   [['grunt', 3], ['ghost', 2], ['archer', 3], ['knight', 2], ['sorcerer', 2]]],
  [[['zombie', 5], ['wraith', 2], ['plaguer', 2], ['spider', 1]],
   [['zombie', 4], ['wraith', 4], ['spider', 2], ['witch', 1]],
   [['zombie', 3], ['wraith', 2], ['spider', 3], ['plaguer', 2], ['witch', 2]]],
  [[['imp', 6], ['skull', 3], ['demon', 2]],
   [['imp', 4], ['skull', 3], ['hound', 2], ['demon', 2]],
   [['imp', 3], ['skull', 2], ['hound', 3], ['demon', 2], ['warlock', 3]]],
];

export function enemyWeights(n) {
  const realm = Math.min(3, Math.floor((n - 1) / LEVELS_PER_REALM));
  const stage = Math.min(2, (n - 1) % LEVELS_PER_REALM); // a guardian's lair uses the last stage's
  return ROSTERS[realm][stage];
}

function pickWeighted(R, list) {
  const total = list.reduce((s, [, wt]) => s + wt, 0);
  let r = R() * total;
  for (const [k, wt] of list) { if ((r -= wt) < 0) return k; }
  return list[list.length - 1][0];
}

export function generateLevel(n, seed = n * 7919 + 13) {
  const info = levelInfo(n);
  if (info.isBoss) return generateBossLevel(n, seed, info);
  const R = makeRng(seed);
  const map = info.style === 'castle' ? castleLayout(n, R) : info.style === 'sky' ? skyLayout(n, R) : caveLayout(n, R, info.style === 'inferno');
  return populate(n, R, info, map);
}

// ---------- shared helpers for layouts ----------

function grid(w, h, fill) {
  const tiles = new Uint8Array(w * h);
  if (fill) tiles.fill(fill);
  return tiles;
}

// Carve a filled disc of `tile` (only over cells matching `over`, if given).
function disc(tiles, w, h, cx, cy, r, tile, over = null, R = null) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
      const jitter = R ? (R() - 0.5) * r * 0.6 : 0;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2 + jitter * r) continue;
      const i = y * w + x;
      if (over === null || over.includes(tiles[i])) tiles[i] = tile;
    }
}

// A wandering path from a to b, carved with a round brush. Returns the visited centre cells.
function wander(tiles, w, h, a, b, R, radius, tile, wobble = 0.35) {
  let x = a.x, y = a.y;
  const path = [];
  for (let guard = 0; guard < 2000; guard++) {
    path.push([Math.round(x), Math.round(y)]);
    disc(tiles, w, h, x, y, radius, tile);
    const dx = b.x - x, dy = b.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 1) break;
    let ax = dx / d, ay = dy / d;
    if (R() < wobble) { const ang = (R() - 0.5) * Math.PI * 1.4; const c = Math.cos(ang), s = Math.sin(ang); [ax, ay] = [ax * c - ay * s, ax * s + ay * c]; }
    x = Math.max(3, Math.min(w - 4, x + ax));
    y = Math.max(3, Math.min(h - 4, y + ay));
  }
  return path;
}

// Find a narrow spot along a path and drop a gate (DOOR tiles) across it.
function gateAcross(tiles, w, h, path, from, to, maxWidth = 5, avoid = null) {
  let best = null;
  for (let k = Math.max(0, from); k < Math.min(path.length, to); k++) {
    const [x, y] = path[k];
    if (tiles[y * w + x] !== T.FLOOR) continue;
    if (avoid && Math.abs(x - avoid.x) + Math.abs(y - avoid.y) < 8) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const cells = [[x, y]];
      let ok = true;
      for (const s of [1, -1]) {
        let cx = x, cy = y;
        for (;;) {
          cx += dx * s; cy += dy * s;
          const t = tiles[cy * w + cx];
          if (t === T.FLOOR) { cells.push([cx, cy]); if (cells.length > maxWidth) { ok = false; break; } }
          else if (t === T.WALL || t === T.VOID) break;
          else { ok = false; break; } // lava/bridge/door: not a clean chokepoint
        }
        if (!ok) break;
      }
      // the cells beyond the line must be open floor on both sides so the gate blocks a passage
      if (!ok || cells.length < 2) continue;
      const nx = dy, ny = dx;
      const sideA = cells.some(([cx, cy]) => tiles[(cy + ny) * w + cx + nx] !== T.WALL && tiles[(cy + ny) * w + cx + nx] !== T.VOID);
      const sideB = cells.some(([cx, cy]) => tiles[(cy - ny) * w + cx - nx] !== T.WALL && tiles[(cy - ny) * w + cx - nx] !== T.VOID);
      if (!sideA || !sideB) continue;
      if (!best || cells.length < best.length) best = cells;
    }
  }
  if (!best) return false;
  for (const [x, y] of best) tiles[y * w + x] = T.DOOR;
  return true;
}

// Lay bridges over lava (or void) so every floor cell is reachable from the start.
function bridgeGaps(tiles, w, h, start, gap) {
  for (let pass = 0; pass < 80; pass++) {
    const reach = bfs(tiles, w, h, [[start.x, start.y]], walkableOrDoor);
    let target = -1;
    for (let i = 0; i < w * h; i++) if (walkable(tiles[i]) && reach[i] < 0) { target = i; break; }
    if (target < 0) return;
    const parents = new Int32Array(w * h).fill(-1);
    const d = bfs(tiles, w, h, [[start.x, start.y]], (t) => walkableOrDoor(t) || t === gap, parents);
    if (d[target] < 0) { tiles[target] = T.WALL; continue; } // unreachable even over the gap: drop it
    for (let c = target; c >= 0; c = parents[c]) {
      if (tiles[c] !== gap) continue;
      tiles[c] = T.BRIDGE;
      // make bridges two tiles wide where possible
      const p = parents[c];
      const horizontal = p >= 0 && Math.abs(p - c) === 1;
      const side = horizontal ? c + w : c + 1;
      if (tiles[side] === gap) tiles[side] = T.BRIDGE;
    }
  }
}

// Remove floor pockets that aren't connected to the main area.
function dropIslands(tiles, w, h, start, fill) {
  const reach = bfs(tiles, w, h, [[start.x, start.y]], (t) => walkableOrDoor(t) || t === T.LAVA);
  for (let i = 0; i < w * h; i++) if (reach[i] < 0 && (walkable(tiles[i]) || tiles[i] === T.LAVA)) tiles[i] = fill;
}

function areaFromDisc(w, h, cx, cy, r, extra = {}) {
  const cells = [];
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) cells.push(y * w + x);
  return { cx: Math.round(cx), cy: Math.round(cy), cells, ...extra };
}

// Small locked treasure vault off an area, reached by a short gated passage.
function addVault(tiles, w, h, area, R, wallTile) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const dir = DIRS4[Math.floor(R() * 4)];
    const reach = Math.round(5 + R() * 4);
    const vx = area.cx + dir[0] * reach, vy = area.cy + dir[1] * reach;
    const hw = 2, hh = 2;
    if (vx - hw < 3 || vy - hh < 3 || vx + hw > w - 4 || vy + hh > h - 4) continue;
    let clear = true;
    for (let y = vy - hh - 1; y <= vy + hh + 1 && clear; y++)
      for (let x = vx - hw - 1; x <= vx + hw + 1; x++) if (tiles[y * w + x] !== wallTile) { clear = false; break; }
    if (!clear) continue;
    const cells = [];
    for (let y = vy - hh; y <= vy + hh; y++) for (let x = vx - hw; x <= vx + hw; x++) { tiles[y * w + x] = T.FLOOR; cells.push(y * w + x); }
    // two-wide passage back toward the area, gated where it meets the vault
    let x = vx - dir[0] * (hw + 1), y = vy - dir[1] * (hh + 1);
    for (let step = 0; step < 24; step++) {
      const side = dir[0] ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]];
      if (step > 0 && side.some(([sx, sy]) => walkableOrDoor(tiles[sy * w + sx]))) break;
      for (const [sx, sy] of side) {
        const i = sy * w + sx;
        if (tiles[i] === wallTile) tiles[i] = step === 0 ? T.DOOR : T.FLOOR;
        else if (tiles[i] === T.LAVA) tiles[i] = T.BRIDGE;
      }
      x -= dir[0]; y -= dir[1];
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) break;
    }
    return { cx: vx, cy: vy, cells, vault: true };
  }
  return null;
}

// ---------- layout: canyon / inferno caves ----------

function caveLayout(n, R, inferno) {
  const w = Math.min(60 + n * 4, 110), h = Math.min(40 + n * 3, 80);
  const tiles = grid(w, h, T.WALL);
  const areas = [];
  const count = Math.min(7 + Math.floor(n * 0.8), 15);
  // waypoints snake from the left edge to the right edge
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = 6 + ((w - 12) * i) / (count - 1);
    const y = i === 0 ? h / 2 : Math.max(6, Math.min(h - 7, pts[i - 1].y + (R() - 0.5) * h * 0.7));
    pts.push({ x, y });
  }
  const mainPath = [];
  for (let i = 0; i < count - 1; i++) mainPath.push(...wander(tiles, w, h, pts[i], pts[i + 1], R, R() < 0.3 ? 2.6 : 1.8, T.FLOOR));
  pts.forEach((p, i) => {
    const r = i === 0 ? 4 : 3.5 + R() * 3.5;
    disc(tiles, w, h, p.x, p.y, r, T.FLOOR, null, R);
    areas.push(areaFromDisc(w, h, p.x, p.y, r));
  });
  // side branches lead to dead-end clearings (treasure, generators)
  const branches = Math.floor(count / 2);
  for (let b = 0; b < branches; b++) {
    const from = pts[1 + Math.floor(R() * (count - 2))];
    const to = { x: Math.max(6, Math.min(w - 7, from.x + (R() - 0.5) * 20)), y: from.y < h / 2 ? Math.min(h - 7, from.y + 10 + R() * 10) : Math.max(6, from.y - 10 - R() * 10) };
    wander(tiles, w, h, from, to, R, 1.5, T.FLOOR, 0.5);
    const r = 3 + R() * 2.5;
    disc(tiles, w, h, to.x, to.y, r, T.FLOOR, null, R);
    areas.push(areaFromDisc(w, h, to.x, to.y, r));
  }
  smooth(tiles, w, h, 2);
  const start = { x: Math.round(pts[0].x), y: Math.round(pts[0].y) };
  disc(tiles, w, h, start.x, start.y, 2.5, T.FLOOR);

  // lava rivers cut across the canyon; pools sit in some clearings
  const look = STAGE_LOOKS[n] && STAGE_LOOKS[n].lava;
  const rivers = Math.max(0, (inferno ? 2 + Math.floor(R() * 2) : 1 + (n >= 3 ? 1 : 0)) + (look ? look.rivers : 0));
  for (let k = 0; k < rivers; k++) {
    let x = w * (0.25 + 0.6 * ((k + R() * 0.6) / rivers));
    const width = inferno ? 2.2 : 1.6;
    for (let y = 2; y < h - 2; y++) {
      x += (R() - 0.5) * 1.6;
      disc(tiles, w, h, x, y, width, T.LAVA, [T.FLOOR]);
    }
  }
  areas.slice(2).forEach((a) => {
    if (R() < (look ? look.pools : inferno ? 0.45 : 0.2)) disc(tiles, w, h, a.cx + (R() - 0.5) * 2, a.cy + (R() - 0.5) * 2, 1.5 + R(), T.LAVA, [T.FLOOR], R);
  });
  disc(tiles, w, h, start.x, start.y, 3, T.FLOOR, [T.LAVA]);
  bridgeGaps(tiles, w, h, start, T.LAVA);
  dropIslands(tiles, w, h, start, T.WALL);

  // gates across the trail, and a couple of locked treasure vaults
  const gates = Math.min(1 + Math.floor(n / 2), 4);
  for (let g = 0; g < gates; g++) {
    const at = Math.floor(mainPath.length * (g + 1) / (gates + 1));
    if (!gateAcross(tiles, w, h, mainPath, at - 30, at + 30, 5, start)) gateAcross(tiles, w, h, mainPath, at - 60, at + 60, 7, start);
  }
  for (const a of areas.slice(-branches)) {
    if (Math.hypot(a.cx - start.x, a.cy - start.y) < 12) continue;
    if (R() < 0.6) { const v = addVault(tiles, w, h, a, R, T.WALL); if (v) areas.push(v); }
  }
  return { w, h, tiles, areas, start, ground: grid(w, h, 0) };
}

// Cellular-automata smoothing to give carved paths natural, rocky edges.
function smooth(tiles, w, h, passes) {
  for (let p = 0; p < passes; p++) {
    const copy = tiles.slice();
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        let walls = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && copy[(y + oy) * w + x + ox] === T.WALL) walls++;
        const i = y * w + x;
        if (copy[i] === T.WALL && walls <= 3) tiles[i] = T.FLOOR;
        else if (copy[i] === T.FLOOR && walls >= 6) tiles[i] = T.WALL;
      }
  }
}

// ---------- layout: castle courtyards and halls ----------

// The castle is laid out on a coarse grid: a main route of halls and courtyards snakes from
// the start (west) to the exit (east), with a few side rooms hanging off it. Gates go only
// where they matter: across the main route (their keys wait in the rooms before them,
// usually a side room) and at the single entrance of a treasure vault.
function castleLayout(n, R) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const w = Math.min(54 + n * 4, 104), h = Math.min(40 + n * 3, 78);
  const tiles = grid(w, h, T.WALL);
  const ground = grid(w, h, 0);
  const COLS = n >= 6 ? 5 : 4, ROWS = 3;
  const cw = Math.floor((w - 6) / COLS), ch = Math.floor((h - 6) / ROWS);
  const cellAt = new Map(); // "c,r" -> room index
  const rooms = [];
  const roomOf = new Int16Array(w * h).fill(-1);

  const addRoom = (c, r, kind) => {
    const big = kind === 'route' && R() < 0.4;
    const rw = big ? ri(Math.min(11, cw - 5), cw - 4) : ri(6, Math.min(10, cw - 5));
    const rh = big ? ri(Math.min(9, ch - 5), ch - 4) : ri(5, Math.min(8, ch - 5));
    const x0 = 3 + c * cw, y0 = 3 + r * ch;
    const x = ri(x0 + 1, x0 + cw - rw - 1), y = ri(y0 + 1, y0 + ch - rh - 1);
    const room = { x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1), courtyard: big, c, r, kind, id: rooms.length };
    rooms.push(room);
    cellAt.set(`${c},${r}`, room.id);
    for (let yy = y; yy < y + rh; yy++)
      for (let xx = x; xx < x + rw; xx++) {
        tiles[yy * w + xx] = T.FLOOR;
        roomOf[yy * w + xx] = room.id;
        if (big) ground[yy * w + xx] = GROUND.GRASS;
      }
    if (big) for (const [px, py] of [[x + 2, y + 2], [x + rw - 3, y + 2], [x + 2, y + rh - 3], [x + rw - 3, y + rh - 3]]) tiles[py * w + px] = T.WALL;
    return room;
  };

  // the main route: west to east, wandering up and down a little in each column
  const route = [];
  let r = ri(0, ROWS - 1);
  for (let c = 0; c < COLS; c++) {
    route.push(addRoom(c, r, 'route'));
    if (c === COLS - 1) break;
    if (R() < 0.6) {
      const dir = r === 0 ? 1 : r === ROWS - 1 ? -1 : R() < 0.5 ? -1 : 1;
      const steps = R() < 0.3 ? 2 : 1;
      for (let k = 0; k < steps; k++) {
        const rr = r + dir;
        if (rr < 0 || rr >= ROWS || cellAt.has(`${c},${rr}`)) break;
        r = rr;
        route.push(addRoom(c, r, 'route'));
      }
    }
  }

  // corridors: 3 wide, L-shaped, never cutting through other rooms' floors
  const hall = (a, b) => {
    const cells = [];
    let x = a.cx, y = a.cy;
    const carve = () => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx, cy = y + dy, i = cy * w + cx;
        if (cx > 1 && cy > 1 && cx < w - 2 && cy < h - 2 && roomOf[i] < 0) { tiles[i] = T.FLOOR; cells.push(i); }
      }
    };
    const horizFirst = a.r === b.r ? true : a.c === b.c ? false : R() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    return cells;
  };
  const halls = [];
  for (let i = 1; i < route.length; i++) halls.push({ a: route[i - 1], b: route[i], cells: hall(route[i - 1], route[i]), idx: i });

  // side rooms in free neighbouring cells
  const sides = [];
  const want = Math.min(2 + Math.floor((n - 4) / 2), 4);
  const order = route.slice(0, -1).map((_, i) => i).sort(() => R() - 0.5);
  for (const i of order) {
    if (sides.length >= want) break;
    const p = route[i];
    const free = DIRS4.map(([dx, dy]) => [p.c + dx, p.r + dy]).filter(([c, rr]) => c >= 0 && rr >= 0 && c < COLS && rr < ROWS && !cellAt.has(`${c},${rr}`));
    if (!free.length) continue;
    const [c, rr] = free[Math.floor(R() * free.length)];
    const s = addRoom(c, rr, 'side');
    s.parent = i;
    sides.push({ room: s, cells: hall(p, s) });
  }

  // gates across the main route, spread out, never on the first corridor
  const gateCount = Math.min(1 + Math.floor((n - 1) / 3), 3, halls.length - 1);
  const gateHalls = [];
  for (let g = 1; g <= gateCount; g++) gateHalls.push(halls[Math.min(halls.length - 1, Math.round((g * halls.length) / (gateCount + 1)))]);
  const gateOn = (cells, into) => {
    // the strip of corridor tiles touching the room the corridor leads into
    const strip = [...new Set(cells)].filter((i) => tiles[i] === T.FLOOR && DIRS4.some(([dx, dy]) => roomOf[i + dy * w + dx] === into.id));
    if (strip.length < 2 || strip.length > 4) return null;
    strip.forEach((i) => (tiles[i] = T.DOOR));
    return strip;
  };
  const gates = [];
  for (const hl of [...new Set(gateHalls)]) { const g = gateOn(hl.cells, hl.b); if (g) gates.push({ strip: g, before: hl.idx - 1 }); }
  // one or two side rooms become locked treasure vaults (never the ones holding keys)
  const vaultIds = new Set();
  const lastGateBefore = gates.length ? Math.max(...gates.map((g) => g.before)) : -1;
  for (const sd of sides.slice().sort(() => R() - 0.5)) {
    if (vaultIds.size >= (n >= 7 ? 2 : 1)) break;
    if (sd.room.parent <= lastGateBefore && sides.filter((o) => o.room.parent <= lastGateBefore && !vaultIds.has(o.room.id)).length <= 1) continue; // keep a key room
    if (gateOn(sd.cells, sd.room)) vaultIds.add(sd.room.id);
  }

  // a shortcut between route rooms that sit side by side, as long as it skips no gate
  for (let i = 0; i < route.length; i++)
    for (let j = i + 2; j < route.length; j++) {
      if (Math.abs(route[i].c - route[j].c) + Math.abs(route[i].r - route[j].r) !== 1) continue;
      if (gates.some((g) => g.before >= i && g.before < j)) continue;
      if (R() < 0.6) hall(route[i], route[j]);
    }

  // a gate that can be walked around is no gate at all: open it up
  const start = { x: route[0].cx, y: route[0].cy };
  {
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] !== T.DOOR || seen[i]) continue;
      const seg = [], stack = [i];
      seen[i] = 1;
      while (stack.length) { const c = stack.pop(); seg.push(c); for (const j of [c + 1, c - 1, c + w, c - w]) if (tiles[j] === T.DOOR && !seen[j]) { seen[j] = 1; stack.push(j); } }
      // floor on both sides of the gate must be disconnected while every gate is shut
      const shut = bfs(tiles, w, h, [[start.x, start.y]], walkable);
      const sidesReach = seg.flatMap((c) => [c + 1, c - 1, c + w, c - w]).filter((j) => walkable(tiles[j]));
      const reached = sidesReach.filter((j) => shut[j] >= 0).length;
      if (reached === sidesReach.length) seg.forEach((c) => (tiles[c] = T.FLOOR)); // both sides reachable: pointless
    }
  }

  const keyRooms = new Set(sides.filter((sd) => !vaultIds.has(sd.room.id)).map((sd) => sd.room.id));
  const areas = rooms.map((rm) => {
    const cells = [];
    for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) cells.push(y * w + x);
    return { cx: rm.cx, cy: rm.cy, cells, id: rm.id, vault: vaultIds.has(rm.id), side: rm.kind === 'side', keyRoom: keyRooms.has(rm.id), exitHere: rm === route[route.length - 1] };
  });
  return { w, h, tiles, areas, start, ground };
}

// ---------- layout: sky islands ----------

function skyLayout(n, R) {
  const w = Math.min(60 + n * 4, 108), h = Math.min(42 + n * 3, 80);
  const tiles = grid(w, h, T.VOID);
  const count = Math.min(7 + Math.floor(n * 0.7), 14);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = 7 + ((w - 14) * i) / (count - 1);
    const y = i === 0 ? h / 2 : Math.max(7, Math.min(h - 8, pts[i - 1].y + (R() - 0.5) * h * 0.75));
    pts.push({ x, y, r: i === 0 ? 4.5 : 3.5 + R() * 3.5 });
  }
  const areas = [];
  const bridges = [];
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    disc(tiles, w, h, p.x, p.y, p.r, T.FLOOR, null, R);
    areas.push(areaFromDisc(w, h, p.x, p.y, p.r));
    if (i > 0) bridges.push(straightBridge(tiles, w, h, pts[i - 1], p));
  }
  // extra islands hanging off the main chain
  const extras = Math.floor(count / 2);
  for (let k = 0; k < extras; k++) {
    const from = pts[1 + Math.floor(R() * (count - 2))];
    const to = { x: Math.max(7, Math.min(w - 8, from.x + (R() - 0.5) * 16)), y: from.y < h / 2 ? Math.min(h - 8, from.y + 11 + R() * 6) : Math.max(7, from.y - 11 - R() * 6), r: 3 + R() * 2 };
    disc(tiles, w, h, to.x, to.y, to.r, T.FLOOR, null, R);
    areas.push(areaFromDisc(w, h, to.x, to.y, to.r));
    bridges.push(straightBridge(tiles, w, h, from, to));
  }
  // tidy ragged island edges: drop lone specks, fill pinholes
  for (let pass = 0; pass < 2; pass++) {
    const copy = tiles.slice();
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        let open = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && copy[(y + oy) * w + x + ox] !== T.VOID) open++;
        const i = y * w + x;
        if (copy[i] === T.FLOOR && open <= 1) tiles[i] = T.VOID;
        else if (copy[i] === T.VOID && open >= 5) tiles[i] = T.FLOOR;
      }
  }
  // ruined columns on the larger islands
  for (const a of areas) {
    if (a.cells.length < 70) continue;
    for (let k = 0; k < 3; k++) {
      const c = a.cells[Math.floor(R() * a.cells.length)];
      const x = c % w, y = (c / w) | 0;
      if (Math.hypot(x - a.cx, y - a.cy) > 2 && tiles[c] === T.FLOOR) tiles[c] = T.WALL;
    }
  }
  const start = { x: Math.round(pts[0].x), y: Math.round(pts[0].y) };
  disc(tiles, w, h, start.x, start.y, 2.5, T.FLOOR);
  dropIslands(tiles, w, h, start, T.VOID);
  // gates on some of the bridges
  const gates = Math.min(1 + Math.floor(n / 2), 4);
  const order = bridges.map((b, i) => i).filter((i) => i > 0 && i < count - 1);
  for (let g = 0; g < gates && order.length; g++) {
    const i = order.splice(Math.floor(R() * order.length), 1)[0];
    const b = bridges[i];
    if (!gateAcross(tiles, w, h, b, Math.floor(b.length * 0.25), Math.ceil(b.length * 0.75), 3, start)) gateAcross(tiles, w, h, b, 0, b.length, 4, start);
  }
  return { w, h, tiles, areas, start, ground: grid(w, h, 0) };
}

function straightBridge(tiles, w, h, a, b) {
  const path = [];
  let x = a.x, y = a.y;
  const d = Math.hypot(b.x - x, b.y - y);
  const steps = Math.ceil(d);
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(a.x + ((b.x - a.x) * s) / steps), py = Math.round(a.y + ((b.y - a.y) * s) / steps);
    path.push([px, py]);
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (py + oy) * w + px + ox;
      if (tiles[i] === T.VOID) tiles[i] = T.FLOOR;
    }
  }
  return path;
}

// Carve a 3x3 room into solid rock (or open sky) beside an area, sealed by a cracked wall.
function addSecret(tiles, w, h, areas, R) {
  const solid = (i) => tiles[i] === T.WALL || tiles[i] === T.VOID;
  for (let attempt = 0; attempt < 120 && areas.length; attempt++) {
    const a = areas[Math.floor(R() * areas.length)];
    const c = a.cells[Math.floor(R() * a.cells.length)];
    if (tiles[c] !== T.FLOOR) continue;
    const x = c % w, y = (c / w) | 0;
    const [dx, dy] = DIRS4[Math.floor(R() * 4)];
    const wx = x + dx, wy = y + dy;          // the cracked wall
    const rx = x + dx * 3, ry = y + dy * 3;  // room centre
    if (rx < 4 || ry < 4 || rx > w - 5 || ry > h - 5) continue;
    let ok = solid(wy * w + wx);
    for (let oy = -2; oy <= 2 && ok; oy++)
      for (let ox = -2; ox <= 2; ox++) if (!solid((ry + oy) * w + rx + ox)) { ok = false; break; }
    // the wall must sit flush against rock on both sides so the room has one way in
    if (ok && !(solid((wy + dx) * w + wx + dy) && solid((wy - dx) * w + wx - dy))) ok = false;
    if (!ok) continue;
    const cells = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const i = (ry + oy) * w + rx + ox; tiles[i] = T.FLOOR; cells.push(i); }
    tiles[wy * w + wx] = T.CRACKED;
    return { cells, wall: wy * w + wx };
  }
  return null;
}

// ---------- shared population: keys, exit, pickups, monsters ----------

function populate(n, R, info, map) {
  const { w, h, tiles, start, ground } = map;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = (start.y + dy) * w + start.x + dx; if (!walkable(tiles[i]) && tiles[i] !== T.LAVA) tiles[i] = T.FLOOR; }
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  // areas only keep cells that ended up as plain floor
  const areas = map.areas.map((a) => ({ ...a, cells: a.cells.filter((c) => tiles[c] === T.FLOOR) })).filter((a) => a.cells.length >= 4);
  const startArea = 0;

  // door segments = connected groups of DOOR tiles
  const doorSegs = [];
  const seenDoor = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (tiles[i] !== T.DOOR || seenDoor[i]) continue;
    const seg = [], stack = [i];
    seenDoor[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      seg.push(c);
      for (const j of [c + 1, c - 1, c + w, c - w]) if (tiles[j] === T.DOOR && !seenDoor[j]) { seenDoor[j] = 1; stack.push(j); }
    }
    doorSegs.push(seg);
  }

  const occupied = new Set();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied.add((start.y + dy) * w + start.x + dx);
  const items = [];
  const freeCellIn = (cells) => {
    const opts = cells.filter((c) => !occupied.has(c) && tiles[c] === T.FLOOR);
    if (!opts.length) return null;
    const c = opts[Math.floor(R() * opts.length)];
    occupied.add(c);
    return c;
  };
  const addItem = (type, c, sub) => { if (c != null) items.push({ type, x: c % w, y: (c / w) | 0, sub }); };

  // Spike traps on the connecting paths (not in open areas, not near the start).
  const inAreaEarly = new Set(areas.flatMap((a) => a.cells));
  if (info.style !== 'sky') {
    const cand = [];
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] !== T.FLOOR || inAreaEarly.has(i)) continue;
      const x = i % w, y = (i / w) | 0;
      if (Math.abs(x - start.x) + Math.abs(y - start.y) < 10) continue;
      cand.push(i);
    }
    const clusters = Math.min(2 + Math.floor(n / 2), 7);
    for (let k = 0; k < clusters && cand.length; k++) {
      const c = cand[Math.floor(R() * cand.length)];
      for (const j of [c, c + 1, c + w, c + w + 1]) if (tiles[j] === T.FLOOR && !inAreaEarly.has(j)) tiles[j] = T.SPIKES;
    }
  }

  // A secret room behind a cracked wall holds this level's hidden Rune Stone.
  const secret = addSecret(tiles, w, h, areas.slice(1).filter((a) => !a.vault), R);

  // Exit goes in the open area farthest from the start (never a vault).
  const fullDist = bfs(tiles, w, h, [[start.x, start.y]], walkableOrDoor);
  let exitArea = -1, far = -1;
  areas.forEach((a, i) => {
    if (i === startArea || a.vault || a.side) return;
    const c = a.cells.reduce((best, cell) => (Math.abs((cell % w) - a.cx) + Math.abs(((cell / w) | 0) - a.cy) < Math.abs((best % w) - a.cx) + Math.abs(((best / w) | 0) - a.cy) ? cell : best), a.cells[0]);
    a.center = c;
    const d = fullDist[c];
    if (d > far) { far = d; exitArea = i; }
  });
  const marked = areas.findIndex((a) => a.exitHere);
  if (marked > 0) exitArea = marked;
  if (exitArea < 0) exitArea = 0;
  const exitCell = areas[exitArea].center ?? areas[exitArea].cells[0];
  const exit = { x: exitCell % w, y: (exitCell / w) | 0 };
  tiles[exitCell] = T.EXIT;
  occupied.add(exitCell);

  // Keys. Each gate's key goes in the gate-free region on its near side (closer to the start),
  // plus one spare in the start region. Whenever a gate is next to the party, either its key's
  // region was already reached (key collected) or opening it reveals its key; with the spare
  // in hand the party can never run out of keys, whatever order gates are opened in.
  const comp = new Int32Array(w * h).fill(-1);
  const compCells = [];
  for (let i = 0; i < w * h; i++) {
    if (comp[i] !== -1 || !walkable(tiles[i])) continue;
    const id = compCells.length;
    const d = bfs(tiles, w, h, [[i % w, (i / w) | 0]], walkable);
    const cells = [];
    for (let j = 0; j < w * h; j++) if (d[j] >= 0) { comp[j] = id; cells.push(j); }
    compCells.push(cells);
  }
  const inArea = new Set(areas.flatMap((a) => a.cells));
  // side rooms marked as key rooms get the keys first (one each), so there's a reason to explore
  const keyRoomCells = areas.filter((a) => a.keyRoom).map((a) => new Set(a.cells));
  const usedKeyRooms = new Set();
  const placeKeyInComp = (id) => {
    const cells = compCells[id].filter((c) => tiles[c] === T.FLOOR);
    const kr = keyRoomCells.find((set) => !usedKeyRooms.has(set) && cells.some((c) => set.has(c)));
    if (kr) {
      usedKeyRooms.add(kr);
      const c = freeCellIn(cells.filter((x) => kr.has(x)));
      if (c != null) { addItem('key', c); return; }
    }
    const preferred = cells.filter((c) => inArea.has(c));
    let c = freeCellIn(preferred.length ? preferred : cells);
    if (c == null) c = freeCellIn(cells);
    if (c == null) c = cells[Math.floor(R() * cells.length)];
    addItem('key', c);
  };
  for (const seg of doorSegs) {
    let best = -1, bd = Infinity;
    for (const c of seg)
      for (const j of [c + 1, c - 1, c + w, c - w]) {
        if (comp[j] >= 0 && fullDist[j] >= 0 && fullDist[j] < bd) { bd = fullDist[j]; best = comp[j]; }
      }
    if (best >= 0) placeKeyInComp(best);
  }
  placeKeyInComp(comp[start.y * w + start.x]);

  const others = areas.map((_, i) => i).filter((i) => i !== startArea && !areas[i].vault);
  const vaults = areas.filter((a) => a.vault);
  const randomAreaCell = () => (others.length ? freeCellIn(areas[others[Math.floor(R() * others.length)]].cells) : null);

  addItem('food', freeCellIn(areas[startArea].cells));
  for (let k = 0; k < 2 + Math.floor(areas.length / 3); k++) addItem(n >= 3 && R() < 0.22 ? 'poison' : 'food', randomAreaCell());
  for (let k = 0; k < 6 + n; k++) addItem(R() < 0.15 ? 'gem' : 'gold', randomAreaCell());
  for (let k = 0; k < 2 + Math.floor(n / 2); k++) addItem('chest', randomAreaCell());
  for (let k = 0; k < 8 + n; k++) addItem('barrel', randomAreaCell());
  for (let k = 0; k < 1 + Math.floor(n / 3); k++) addItem('potion', randomAreaCell());
  if (n >= 2) addItem('amulet', randomAreaCell(), POWERUP_ORDER[Math.floor(R() * POWERUP_ORDER.length)]);
  // vaults hold the good stuff
  for (const v of vaults) {
    addItem('chest', freeCellIn(v.cells));
    addItem('gem', freeCellIn(v.cells));
    addItem(R() < 0.5 ? 'potion' : 'amulet', freeCellIn(v.cells), POWERUP_ORDER[Math.floor(R() * POWERUP_ORDER.length)]);
    for (let k = 0; k < 3; k++) addItem('gold', freeCellIn(v.cells));
  }

  // the hidden Rune Stone: in the secret room, else a vault, else the farthest dead end
  let runeCell = secret ? secret.cells[4] : null;
  if (runeCell == null && vaults.length) runeCell = freeCellIn(vaults[0].cells);
  if (runeCell == null) runeCell = freeCellIn(areas[areas.length - 1].cells);
  if (runeCell != null) { occupied.add(runeCell); items.push({ type: 'rune', sub: 'hidden', x: runeCell % w, y: (runeCell / w) | 0 }); }
  if (secret) for (let k = 0; k < 2; k++) addItem('gold', freeCellIn(secret.cells));

  const weights = enemyWeights(n);
  const generators = [];
  const genCount = Math.min(4 + Math.floor(n * 1.3), 19);
  for (let k = 0; k < genCount && others.length; k++) {
    const c = randomAreaCell();
    if (c != null) generators.push({ type: pickWeighted(R, weights), x: c % w, y: (c / w) | 0 });
  }
  const enemies = [];
  const perArea = 2 + (n >= 6 ? 1 : 0) + (n >= 11 ? 1 : 0); // later stages start more crowded
  for (const i of others) {
    for (let k = 0; k < perArea; k++) {
      const c = freeCellIn(areas[i].cells);
      if (c != null) enemies.push({ type: pickWeighted(R, weights), x: c % w, y: (c / w) | 0 });
    }
  }
  if (n >= 5 && R() < (n >= 9 ? 0.85 : 0.6)) {
    const c = freeCellIn(areas[exitArea].cells);
    if (c != null) enemies.push({ type: 'death', x: c % w, y: (c / w) | 0 });
  }

  const rooms = areas.map((a) => ({ cx: a.cx, cy: a.cy, size: a.cells.length, vault: !!a.vault }));
  return { n, w, h, tiles, ground, rooms, start, exit, items, generators, enemies, boss: null, info, doorSegs: doorSegs.length, secret: !!secret };
}

// ---------- the hub (Dark Legacy style): a plaza with a portal to each realm ----------

export const HUB_PORTALS = [
  { realm: 0, x: 6, y: 6 }, { realm: 1, x: 21, y: 6 }, { realm: 2, x: 6, y: 16 }, { realm: 3, x: 21, y: 16 },
];

export function generateHub() {
  const base = levelInfo(LEVELS_PER_REALM + 1); // castle look
  const info = { ...base, style: 'castle', isBoss: false, hub: true, stageName: 'The Hub', stage: 0, theme: { ...base.theme, name: 'Choose your realm' } };
  const w = 28, h = 23;
  const tiles = grid(w, h, T.WALL);
  const ground = grid(w, h, 0);
  for (let y = 3; y <= h - 4; y++) for (let x = 3; x <= w - 4; x++) tiles[y * w + x] = T.FLOOR;
  // grassy centre with pillars at its corners
  for (let y = 9; y <= 13; y++) for (let x = 10; x <= 17; x++) ground[y * w + x] = GROUND.GRASS;
  for (const [px, py] of [[10, 9], [17, 9], [10, 13], [17, 13]]) tiles[py * w + px] = T.WALL;
  const shop = { x: 13, y: 4 };
  const items = [{ type: 'food', x: 12, y: 11 }, { type: 'food', x: 15, y: 11 }];
  return {
    n: 0, w, h, tiles, ground, rooms: [{ cx: 13, cy: 11, size: 300 }], start: { x: 13, y: 15 }, exit: null,
    items, generators: [], enemies: [], boss: null, info, doorSegs: 0, hub: true, portals: HUB_PORTALS, shop,
  };
}

// ---------- training grounds (the first-time tutorial) ----------

// A row of small rooms joined by gates. src/tutorial.js opens each gate once the lesson in
// the room before it is done; the gate out of the key room is a real locked door.
export const TUTORIAL_ROOMS = 8, TUTORIAL_PITCH = 12, TUTORIAL_MID = 6;
export const tutorialRoomX = (k) => k * TUTORIAL_PITCH + TUTORIAL_PITCH / 2; // centre column of room k

export function generateTutorial() {
  const base = levelInfo(LEVELS_PER_REALM + 1); // castle look
  const info = { ...base, style: 'castle', isBoss: false, tutorial: true, stageName: 'Training Grounds', stage: 0, theme: { ...base.theme, name: 'Learn the ropes' } };
  const P = TUTORIAL_PITCH, M = TUTORIAL_MID;
  const w = TUTORIAL_ROOMS * P + 1, h = M * 2 + 1;
  const tiles = grid(w, h, T.WALL);
  const ground = grid(w, h, 0);
  for (let k = 0; k < TUTORIAL_ROOMS; k++) {
    for (let y = 1; y < h - 1; y++) for (let x = k * P + 1; x < (k + 1) * P; x++) tiles[y * w + x] = T.FLOOR;
    if (k > 0) for (let y = M - 1; y <= M + 1; y++) tiles[y * w + k * P] = T.DOOR; // gate into room k
  }
  for (let y = M - 2; y <= M + 2; y++) for (let x = (TUTORIAL_ROOMS - 1) * P + 3; x < TUTORIAL_ROOMS * P - 2; x++) ground[y * w + x] = GROUND.GRASS;
  const cx = tutorialRoomX;
  const start = { x: 2, y: M };
  const exit = { x: cx(TUTORIAL_ROOMS - 1) + 3, y: M };
  tiles[exit.y * w + exit.x] = T.EXIT;
  const items = [
    { type: 'gold', x: 5, y: 2 }, { type: 'gold', x: 9, y: M }, { type: 'gold', x: 5, y: h - 3 }, // 0: move
    { type: 'key', x: cx(3), y: 2 },                                                           // 3: keys
    { type: 'potion', x: cx(4) - 3, y: M },                                                    // 4: magic
    { type: 'food', x: cx(6) - 2, y: M - 2 }, { type: 'food', x: cx(6) + 2, y: M + 2 },        // 6: food
    { type: 'poison', x: cx(6) + 2, y: M - 2 },
  ];
  const rooms = [];
  for (let k = 0; k < TUTORIAL_ROOMS; k++) rooms.push({ cx: cx(k), cy: M, size: 110 });
  return { n: 0, w, h, tiles, ground, rooms, start, exit, items, generators: [], enemies: [], boss: null, info, doorSegs: 0, tutorial: true };
}

// ---------- treasure room (bonus round after each guardian) ----------

export function generateTreasureRoom(realm, seed = 4242 + realm * 97) {
  const R = makeRng(seed);
  const base = levelInfo(realm * LEVELS_PER_REALM + 1);
  const info = { ...base, style: 'castle', isBoss: false, treasure: true, stageName: 'Treasure Room', stage: 0 };
  const w = 30, h = 22;
  const tiles = grid(w, h, T.WALL);
  const ground = grid(w, h, 0);
  for (let y = 3; y <= h - 4; y++) for (let x = 3; x <= w - 4; x++) tiles[y * w + x] = T.FLOOR;
  // four pillars and a raised dais of grass in the middle
  for (const [px, py] of [[8, 7], [w - 9, 7], [8, h - 8], [w - 9, h - 8]]) tiles[py * w + px] = T.WALL;
  for (let y = 9; y <= h - 10; y++) for (let x = 12; x <= w - 13; x++) ground[y * w + x] = GROUND.GRASS;
  const start = { x: 5, y: Math.floor(h / 2) };
  const exit = { x: w - 5, y: Math.floor(h / 2) };
  tiles[exit.y * w + exit.x] = T.EXIT;
  const items = [];
  const taken = new Set([start.y * w + start.x, exit.y * w + exit.x]);
  const put = (type, n) => {
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 50; tries++) {
        const x = 4 + Math.floor(R() * (w - 8)), y = 4 + Math.floor(R() * (h - 8));
        const i = y * w + x;
        if (tiles[i] !== T.FLOOR || taken.has(i)) continue;
        taken.add(i);
        items.push({ type, x, y });
        break;
      }
    }
  };
  put('gold', 46 + realm * 8);
  put('gem', 8 + realm * 2);
  put('chest', 6);
  put('food', 2);
  return { n: 0, w, h, tiles, ground, rooms: [{ cx: 15, cy: 11, size: 300 }], start, exit, items, generators: [], enemies: [], boss: null, info, doorSegs: 0, treasure: true };
}

// ---------- boss arenas ----------

function generateBossLevel(n, seed, info) {
  const R = makeRng(seed);
  const w = 42, h = 32;
  const edge = info.style === 'sky' ? T.VOID : T.WALL;
  const tiles = grid(w, h, edge);
  const ground = grid(w, h, 0);
  const fill = (x0, y0, x1, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * w + x] = t;
  };
  if (info.style === 'castle') {
    fill(3, 12, 10, 19, T.FLOOR);
    fill(11, 15, 15, 16, T.FLOOR);
    fill(16, 3, 38, 28, T.FLOOR);
    for (let y = 3; y <= 28; y++) for (let x = 16; x <= 38; x++) ground[y * w + x] = GROUND.GRASS;
  } else {
    // round arena reached from a small landing
    disc(tiles, w, h, 6.5, 15.5, 4, T.FLOOR);
    fill(10, 15, 16, 16, T.FLOOR);
    disc(tiles, w, h, 27, 15.5, 12.5, T.FLOOR);
  }
  for (const [px, py] of [[20, 7], [34, 7], [20, 23], [34, 23]]) fill(px, py, px + 1, py + 1, T.WALL);
  if (info.style === 'canyon' || info.style === 'inferno') {
    for (const [lx, ly] of [[22, 11], [32, 11], [22, 20], [32, 20]]) disc(tiles, w, h, lx, ly, 1.6, T.LAVA, [T.FLOOR]);
  }
  const exit = { x: 37, y: 15 };
  fill(36, 14, 38, 17, T.FLOOR);
  tiles[exit.y * w + exit.x] = T.SEALED;
  const items = [
    { type: 'food', x: 4, y: 14 }, { type: 'food', x: 4, y: 17 }, { type: 'food', x: 8, y: 13 },
    { type: 'potion', x: 8, y: 18 }, { type: 'potion', x: 5, y: 15 },
    { type: 'gold', x: 18, y: 10 }, { type: 'gold', x: 18, y: 21 }, { type: 'gem', x: 35, y: 15 },
  ];
  if (R() < 0.7) items.push({ type: 'amulet', x: 6, y: 16, sub: POWERUP_ORDER[Math.floor(R() * POWERUP_ORDER.length)] });
  // the realm's foot soldiers and its flyers
  const [melee, flyer] = ROSTERS[Math.min(3, info.realm)][0].map(([k]) => k);
  const generators = [{ type: melee, x: 19, y: 9 }, { type: melee, x: 19, y: 22 }];
  if (info.realm >= 1) generators.push({ type: flyer, x: 35, y: 21 }, { type: flyer, x: 35, y: 10 });
  for (const it of [...items, ...generators]) tiles[it.y * w + it.x] = T.FLOOR;
  const rooms = [{ cx: 6, cy: 15, size: 50 }, { cx: 27, cy: 15, size: 480 }];
  return { n, w, h, tiles, ground, rooms, start: { x: 6, y: 15 }, exit, items, generators, enemies: [], boss: { x: 30, y: 15 }, info, doorSegs: 0 };
}
