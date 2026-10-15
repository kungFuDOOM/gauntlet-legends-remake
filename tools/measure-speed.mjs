// Headless speed measurement: runs the real Game loop and measures distance/time for every class.
globalThis.window = globalThis.window || globalThis;
const { Game } = await import('../src/game.js');
const { CLASSES, maxSpeed } = await import('../src/config.js');
const { SHOP, buy, maxed } = await import('../src/campaign.js');
const R = { x: 1, y: 0, attack: false, magic: false, turbo: false, pressed: {} };
const idle = { x: 0, y: 0, attack: false, magic: false, turbo: false, pressed: {} };
function run(cls, mode) {
  const g = new Game();
  const p = g.addPlayer(0, 'kb', cls);
  g.startHub();
  p.hp = p.maxHp = 1e9; p.drain = 0; p.invuln = 1e9;
  if (mode !== 'start') {
    p.gold = 1e9; const it = SHOP.find((i) => i.id === 'speed'); let n = 0;
    while (!maxed(p, it) && n++ < 200) buy(p, it);
  }
  if (mode === 'boots') p.buffs.speed = 20;
  let best = 0;
  // try a few open spots/directions; take the longest unobstructed 1s run
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const inp = { ...R, x: dx, y: dy };
    const g2 = g; const x0 = p.x, y0 = p.y;
    for (let i = 0; i < 30; i++) { p.buffs.speed && (p.buffs.speed = 20); g2.update(1 / 60, { get: () => inp }); }
    const d = Math.hypot(p.x - x0, p.y - y0) / 0.5; // 30 frames = 0.5s
    best = Math.max(best, d);
    for (let i = 0; i < 30; i++) g2.update(1 / 60, { get: () => ({ ...inp, x: -dx, y: -dy }) });
  }
  return { speed: p.speed, measured: best };
}
const rows = [];
for (const cls of Object.keys(CLASSES)) {
  const s = run(cls, 'start'), m = run(cls, 'max'), b = run(cls, 'boots');
  rows.push({ cls, base: CLASSES[cls].speed, start: +s.measured.toFixed(1), max: +m.measured.toFixed(1), boots: +b.measured.toFixed(1), cap: maxSpeed(CLASSES[cls]) });
}
console.table(rows);
console.log(JSON.stringify(rows));
