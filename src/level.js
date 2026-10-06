// Procedural dungeon generation. Pure module (no DOM) so it can be unit tested in Node.

export const T = { WALL: 0, FLOOR: 1, DOOR: 2, EXIT: 3, SEALED: 4 };

export const THEMES = [
  { name: 'Mountain Kingdom',  floorA: '#4a4438', floorB: '#544c3f', wallTop: '#8f846d', wallSide: '#5c5444', dark: 0.35, accent: '#d9c27a', void: '#14110c' },
  { name: 'Castle Stronghold', floorA: '#3b3e4a', floorB: '#444857', wallTop: '#80869b', wallSide: '#4e5263', dark: 0.45, accent: '#9fb0d9', void: '#0e0f14' },
  { name: 'Sky Dominion',      floorA: '#3f5361', floorB: '#4a5f6e', wallTop: '#b0cad9', wallSide: '#6a8698', dark: 0.18, accent: '#e0f0ff', void: '#1a2836' },
  { name: 'Underworld',        floorA: '#3a2222', floorB: '#452827', wallTop: '#8f3c2a', wallSide: '#5a2418', dark: 0.55, accent: '#ff7a3a', void: '#120606' },
];

export const BOSSES = [
  { name: 'The Ogre Chieftain', color: '#6a8a3a', horn: '#d9d0b0', hp: 520, speed: 70 },
  { name: 'The Gargoyle Lord',  color: '#7a7a8c', horn: '#3a3a44', hp: 700, speed: 80 },
  { name: 'The Storm Dragon',   color: '#3f86c9', horn: '#e0f0ff', hp: 880, speed: 88 },
  { name: 'The Lich King',      color: '#9a3ad0', horn: '#e8e0ff', hp: 1100, speed: 92 },
];

export const LEVELS_PER_REALM = 4;

export function levelInfo(n) {
  const realm = Math.floor((n - 1) / LEVELS_PER_REALM);
  return {
    realm,
    theme: THEMES[realm % THEMES.length],
    isBoss: n % LEVELS_PER_REALM === 0,
    stage: ((n - 1) % LEVELS_PER_REALM) + 1,
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
export function bfs(tiles, w, h, sources, passable) {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const [sx, sy] of sources) {
    const i = sy * w + sx;
    if (dist[i] === -1) { dist[i] = 0; queue[tail++] = i; }
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
      queue[tail++] = j;
    }
  }
  return dist;
}

export const walkable = (t) => t === T.FLOOR || t === T.EXIT;
export const walkableOrDoor = (t) => t === T.FLOOR || t === T.EXIT || t === T.DOOR;

function enemyWeights(n) {
  const w = [['grunt', 5], ['ghost', 3]];
  if (n >= 2) w.push(['lobber', 2]);
  if (n >= 3) w.push(['demon', 2]);
  if (n >= 5) w.push(['sorcerer', 2]);
  return w;
}

function pickWeighted(R, list) {
  const total = list.reduce((s, [, wt]) => s + wt, 0);
  let r = R() * total;
  for (const [k, wt] of list) { if ((r -= wt) < 0) return k; }
  return list[list.length - 1][0];
}

export function generateLevel(n, seed = n * 7919 + 13) {
  const info = levelInfo(n);
  return info.isBoss ? generateBossLevel(n, seed, info) : generateDungeon(n, seed, info);
}

function generateDungeon(n, seed, info) {
  const R = makeRng(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const w = Math.min(44 + n * 4, 96);
  const h = Math.min(34 + n * 3, 72);
  const tiles = new Uint8Array(w * h);
  const roomId = new Int16Array(w * h).fill(-1);
  const rooms = [];
  const target = Math.min(7 + n, 18);

  for (let a = 0; a < 600 && rooms.length < target; a++) {
    const rw = ri(5, 11), rh = ri(4, 9);
    const x = ri(2, w - rw - 3), y = ri(2, h - rh - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + rw + 3 > r.x && y < r.y + r.h + 3 && y + rh + 3 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
  }
  rooms.forEach((r, id) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) { tiles[y * w + x] = T.FLOOR; roomId[y * w + x] = id; }
  });

  const carve = (x, y) => {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1) tiles[cy * w + cx] = T.FLOOR;
      }
  };
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = R() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
    carve(x, y);
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };

  // Prim-style spanning tree so every room is connected, plus a few loops.
  const connected = [0];
  const pending = new Set(rooms.map((_, i) => i).slice(1));
  while (pending.size) {
    let best = null, bd = Infinity;
    for (const i of pending)
      for (const j of connected) {
        const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
        if (d < bd) { bd = d; best = [i, j]; }
      }
    corridor(rooms[best[1]], rooms[best[0]]);
    connected.push(best[0]);
    pending.delete(best[0]);
  }
  for (let k = 0; k < Math.floor(rooms.length / 4); k++) {
    const a = ri(0, rooms.length - 1), b = ri(0, rooms.length - 1);
    if (a !== b) corridor(rooms[a], rooms[b]);
  }

  // Door candidates: corridor cells touching a room's edge, grouped into small segments.
  const isCand = (i) => {
    if (tiles[i] !== T.FLOOR || roomId[i] !== -1) return false;
    const x = i % w, y = (i / w) | 0;
    return DIRS4.some(([dx, dy]) => roomId[(y + dy) * w + x + dx] >= 0);
  };
  const seen = new Uint8Array(w * h);
  const doorSegs = [];
  const pDoor = Math.min(0.3 + n * 0.04, 0.65);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !isCand(i)) continue;
    const seg = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      seg.push(c);
      const x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of DIRS4) {
        const j = (y + dy) * w + x + dx;
        if (!seen[j] && isCand(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (seg.length >= 2 && seg.length <= 3 && R() < pDoor) {
      seg.forEach((c) => (tiles[c] = T.DOOR));
      doorSegs.push(seg);
    }
  }

  const start = { x: rooms[0].cx, y: rooms[0].cy };
  const occupied = new Set();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied.add((start.y + dy) * w + start.x + dx);

  const items = [];
  const freeCellIn = (cells) => {
    const opts = cells.filter((c) => !occupied.has(c));
    if (!opts.length) return null;
    const c = opts[Math.floor(R() * opts.length)];
    occupied.add(c);
    return c;
  };
  const addItem = (type, c, sub) => { if (c != null) items.push({ type, x: c % w, y: (c / w) | 0, sub }); };

  // Exit goes in the room farthest from the start.
  const fullDist = bfs(tiles, w, h, [[start.x, start.y]], walkableOrDoor);
  let exitRoom = rooms.length > 1 ? 1 : 0, far = -1;
  rooms.forEach((r, i) => {
    if (i === 0) return;
    const d = fullDist[r.cy * w + r.cx];
    if (d > far) { far = d; exitRoom = i; }
  });
  const exit = { x: rooms[exitRoom].cx, y: rooms[exitRoom].cy };
  tiles[exit.y * w + exit.x] = T.EXIT;
  occupied.add(exit.y * w + exit.x);

  // Key placement. Each door segment's key goes in the door-free region on its near side
  // (the side closer to the start), plus one spare key in the start region. Whenever a door
  // is adjacent to the party, either its key's region is already reached (so that key was
  // collected) or opening the door reveals its key; with the spare in hand the party can
  // never run out of keys, no matter which doors are opened first.
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
  const startDist = bfs(tiles, w, h, [[start.x, start.y]], walkableOrDoor);
  const placeKeyInComp = (id) => {
    const cells = compCells[id];
    const inRooms = cells.filter((c) => roomId[c] >= 0);
    let c = freeCellIn(inRooms.length ? inRooms : cells);
    if (c == null) c = freeCellIn(cells);
    if (c == null) c = cells[Math.floor(R() * cells.length)];
    addItem('key', c);
  };
  for (const seg of doorSegs) {
    let best = -1, bd = Infinity;
    for (const c of seg) {
      const x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of DIRS4) {
        const j = (y + dy) * w + x + dx;
        if (comp[j] >= 0 && startDist[j] >= 0 && startDist[j] < bd) { bd = startDist[j]; best = comp[j]; }
      }
    }
    if (best >= 0) placeKeyInComp(best);
  }
  placeKeyInComp(comp[start.y * w + start.x]);

  const roomCells = (i) => {
    const r = rooms[i], out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(y * w + x);
    return out;
  };
  const otherRooms = rooms.map((_, i) => i).filter((i) => i !== 0);
  const randomRoomCell = (includeStart = false) => {
    const list = includeStart || !otherRooms.length ? rooms.map((_, i) => i) : otherRooms;
    return freeCellIn(roomCells(list[Math.floor(R() * list.length)]));
  };

  // pickups
  addItem('food', freeCellIn(roomCells(0)));
  for (let k = 0; k < 2 + Math.floor(rooms.length / 3); k++) addItem('food', randomRoomCell());
  for (let k = 0; k < 6 + n; k++) addItem(R() < 0.15 ? 'gem' : 'gold', randomRoomCell());
  for (let k = 0; k < 2 + Math.floor(n / 2); k++) addItem('chest', randomRoomCell());
  for (let k = 0; k < 1 + Math.floor(n / 3); k++) addItem('potion', randomRoomCell());
  if (n >= 2) addItem('amulet', randomRoomCell(), ['speed', 'rapid', 'shield', 'triple'][ri(0, 3)]);

  const weights = enemyWeights(n);
  const generators = [];
  const genCount = Math.min(3 + Math.floor(n * 1.3), 18);
  for (let k = 0; k < genCount && otherRooms.length; k++) {
    const c = randomRoomCell();
    if (c != null) generators.push({ type: pickWeighted(R, weights), x: c % w, y: (c / w) | 0 });
  }
  const enemies = [];
  for (const i of otherRooms) {
    for (let k = 0; k < 2; k++) {
      const c = freeCellIn(roomCells(i));
      if (c != null) enemies.push({ type: pickWeighted(R, weights), x: c % w, y: (c / w) | 0 });
    }
  }
  if (n >= 5 && R() < 0.6) {
    const c = freeCellIn(roomCells(exitRoom));
    if (c != null) enemies.push({ type: 'death', x: c % w, y: (c / w) | 0 });
  }

  return { n, w, h, tiles, rooms, start, exit, items, generators, enemies, boss: null, info, doorSegs: doorSegs.length };
}

function generateBossLevel(n, seed, info) {
  const R = makeRng(seed);
  const w = 42, h = 32;
  const tiles = new Uint8Array(w * h);
  const fill = (x0, y0, x1, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * w + x] = t;
  };
  fill(3, 12, 10, 19, T.FLOOR);   // antechamber
  fill(11, 15, 15, 16, T.FLOOR);  // corridor
  fill(16, 3, 38, 28, T.FLOOR);   // arena
  // pillars
  for (const [px, py] of [[20, 7], [34, 7], [20, 23], [34, 23], [27, 10], [27, 20]]) fill(px, py, px + 1, py + 1, T.WALL);
  const exit = { x: 37, y: 15 };
  tiles[exit.y * w + exit.x] = T.SEALED;
  const items = [
    { type: 'food', x: 4, y: 13 }, { type: 'food', x: 4, y: 18 }, { type: 'food', x: 9, y: 13 },
    { type: 'potion', x: 9, y: 18 }, { type: 'potion', x: 5, y: 15 },
    { type: 'gold', x: 17, y: 4 }, { type: 'gold', x: 17, y: 27 }, { type: 'gem', x: 37, y: 4 },
  ];
  if (R() < 0.7) items.push({ type: 'amulet', x: 6, y: 16, sub: ['speed', 'rapid', 'shield', 'triple'][Math.floor(R() * 4)] });
  const generators = [
    { type: 'grunt', x: 17, y: 4 + 1 }, { type: 'grunt', x: 17, y: 26 },
  ];
  if (info.realm >= 1) generators.push({ type: 'ghost', x: 37, y: 27 }, { type: 'ghost', x: 37, y: 5 });
  const rooms = [{ x: 3, y: 12, w: 8, h: 8, cx: 6, cy: 15 }, { x: 16, y: 3, w: 23, h: 26, cx: 27, cy: 15 }];
  return {
    n, w, h, tiles, rooms, start: { x: 6, y: 15 }, exit, items, generators, enemies: [],
    boss: { x: 30, y: 15 }, info, doorSegs: 0,
  };
}
