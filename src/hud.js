// 2D overlay drawn over the WebGL view: corner player panels, floating text, banners and menus.

import { VIEW_W, VIEW_H, CLASSES, BASE_CLASSES as CLASS_ORDER, POWERUPS, TURBO_COST, MAX_PLAYERS, TILE, xpForLevel } from './config.js';
import { T } from './level.js';
import { Input } from './input.js';
import { SHOP, priceOf } from './campaign.js';

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Trebuchet MS", Verdana, sans-serif';
const PANEL_W = 236, PANEL_H = 78, M = 10;

function outlined(ctx, text, x, y, fill, stroke = '#000', width = 4) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function frame(ctx, x, y, w, h, accent) {
  roundRect(ctx, x, y, w, h, 8);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(30,24,18,0.86)');
  g.addColorStop(1, 'rgba(8,6,4,0.86)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#f6dc8a'); bg.addColorStop(0.5, '#a07a30'); bg.addColorStop(1, '#5a3e14');
  ctx.strokeStyle = bg;
  ctx.stroke();
  roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------- in-game ----------

export function drawGameOverlay(ctx, g, r3d, opts) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // floating combat text, projected from 3D
  ctx.textAlign = 'center';
  for (const t of g.texts) {
    const s = r3d.toScreen(t.x, t.y, 40);
    ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
    ctx.font = `bold ${t.text.length > 6 ? 15 : 17}px ${SANS}`;
    outlined(ctx, t.text, s.x, s.y, t.color, '#000', 3);
  }
  ctx.globalAlpha = 1;

  // player name tags
  ctx.font = `bold 11px ${SANS}`;
  for (const p of g.livePlayers()) {
    const s = r3d.toScreen(p.x, p.y, 62);
    outlined(ctx, `P${p.slot + 1}`, s.x, s.y, p.def.color, '#000', 3);
  }

  // danger vignette when anyone is starving
  const low = g.livePlayers().some((p) => p.hp < 150);
  if (low) {
    const a = 0.25 + Math.sin(g.time * 6) * 0.12;
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    vg.addColorStop(0, 'rgba(255,0,0,0)');
    vg.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.65})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawBossBar(ctx, g);
  if (g.level.hub) drawHubLabels(ctx, g, r3d);
  if (!g.boss && !g.level.hub && opts.runes != null) drawRuneCount(ctx, opts.runes);
  if (g.treasureT > 0) {
    ctx.textAlign = 'center';
    ctx.font = `bold 34px ${SANS}`;
    const t = Math.ceil(g.treasureT);
    outlined(ctx, `${t}`, VIEW_W / 2, 80, t <= 5 && Math.floor(g.time * 4) % 2 ? '#ff5040' : '#ffe070', '#000', 6);
    ctx.font = `bold 12px ${SANS}`;
    outlined(ctx, 'TREASURE ROOM', VIEW_W / 2, 98, '#ffd860', '#000', 3);
  }
  if (opts.tutorial) drawTutorial(ctx, g, opts.tutorial);
  else drawBanner(ctx, g);
  for (let s = 0; s < MAX_PLAYERS; s++) drawPanel(ctx, g, s);
  if (opts.controls) drawControlsBar(ctx, g.players[2] || g.players[3] ? 440 : 680);
  if (opts.minimap || g.anyBuff('xray')) drawMinimap(ctx, g, g.anyBuff('xray'));
}

function panelPos(slot) {
  const right = slot % 2 === 1, bottom = slot >= 2;
  return { x: right ? VIEW_W - PANEL_W - M : M, y: bottom ? VIEW_H - PANEL_H - M : M, right, bottom };
}

function drawPanel(ctx, g, slot) {
  const p = g.players[slot];
  const { x, y } = panelPos(slot);
  if (!p) {
    // One small "join" note in the first free corner, shown in the hub and for the first
    // few seconds of a level, then it fades so the corners stay clear.
    if ([0, 1, 2, 3].find((i) => !g.players[i]) !== slot) return;
    const a = g.level.hub ? 0.75 : Math.min(0.75, Math.max(0, (8 - g.time) / 2));
    if (a <= 0) return;
    if (slot >= 2 && document.body.classList.contains('touching')) return; // under the touch controls
    ctx.globalAlpha = a;
    const jy = slot >= 2 ? VIEW_H - M - 24 : M;
    ctx.fillStyle = 'rgba(10,8,6,0.6)';
    roundRect(ctx, x, jy, PANEL_W, 24, 6);
    ctx.fill();
    ctx.font = `bold 11px ${SANS}`;
    ctx.textAlign = 'center';
    const how = document.body.classList.contains('touching') ? 'GAMEPAD A TO JOIN' : 'GAMEPAD A OR KEY 2 TO JOIN';
    outlined(ctx, `P${slot + 1}: ${how}`, x + PANEL_W / 2, jy + 16, '#e8d8a8', '#000', 3);
    ctx.globalAlpha = 1;
    return;
  }
  const def = p.def;
  frame(ctx, x, y, PANEL_W, PANEL_H, def.color);

  // colour crest
  const cg = ctx.createLinearGradient(x, y, x, y + PANEL_H);
  cg.addColorStop(0, def.color); cg.addColorStop(1, def.dark);
  ctx.fillStyle = cg;
  roundRect(ctx, x + 8, y + 8, 40, PANEL_H - 16, 5);
  ctx.fill();
  ctx.font = `bold 15px ${SERIF}`;
  ctx.textAlign = 'center';
  outlined(ctx, def.name.slice(0, 3).toUpperCase(), x + 28, y + 38, '#fff', 'rgba(0,0,0,0.6)', 3);
  ctx.font = `bold 10px ${SANS}`;
  outlined(ctx, `LV${p.lvl}`, x + 28, y + 62, '#ffe890', '#000', 3);

  ctx.textAlign = 'left';
  ctx.font = `italic bold 15px ${SERIF}`;
  outlined(ctx, def.name.toUpperCase(), x + 56, y + 22, def.color, '#000', 3);

  if (!p.alive) {
    ctx.font = `bold 13px ${SANS}`;
    const blink = Math.floor(g.time * 2) % 2;
    outlined(ctx, p.deadT > 1.5 ? `PRESS ${BTN('attack', p.source)}` : 'DEFEATED', x + 56, y + 44, blink ? '#ff6050' : '#a03020', '#000', 3);
    if (p.deadT > 1.5) outlined(ctx, 'TO CONTINUE', x + 56, y + 60, blink ? '#ff6050' : '#a03020', '#000', 3);
    return;
  }

  // health
  ctx.font = `bold 9px ${SANS}`;
  outlined(ctx, 'HEALTH', x + 56, y + 36, '#c8b88a', '#000', 2);
  ctx.font = `bold 26px ${SANS}`;
  const hc = p.hp < 200 ? (Math.floor(g.time * 5) % 2 ? '#ff3a2a' : '#ffd0c0') : '#ffffff';
  outlined(ctx, String(Math.max(0, Math.floor(p.hp))), x + 56, y + 61, hc, '#000', 4);

  // score
  ctx.textAlign = 'right';
  ctx.font = `bold 9px ${SANS}`;
  outlined(ctx, 'GOLD', x + PANEL_W - 12, y + 22, '#c8b88a', '#000', 2);
  ctx.font = `bold 13px ${SANS}`;
  outlined(ctx, String(p.gold), x + PANEL_W - 12, y + 36, '#ffe070', '#000', 3);

  // inventory: keys and potions
  let ix = x + 136;
  const iy = y + 50;
  for (let i = 0; i < Math.min(p.keys, 4); i++) drawKeyIcon(ctx, ix + i * 9, iy);
  if (p.keys > 4) { ctx.font = `bold 10px ${SANS}`; ctx.textAlign = 'left'; outlined(ctx, `x${p.keys}`, ix + 36, iy + 4, '#ffd040', '#000', 2); }
  ix = x + 184;
  // the potions' key, as a little key cap, so players know they have magic and how to use it
  const mk = btn('magic', p.source);
  if (mk.length <= 2) {
    ctx.font = `bold 9px ${SANS}`;
    ctx.textAlign = 'center';
    roundRect(ctx, ix - 13, iy - 6, 11, 12, 2);
    ctx.fillStyle = p.potions ? '#c8d0ff' : '#5a5a6a';
    ctx.fill();
    ctx.fillStyle = '#10142a';
    ctx.fillText(mk.toUpperCase(), ix - 7.5, iy + 3.5);
  }
  for (let i = 0; i < Math.min(p.potions, 3); i++) drawPotionIcon(ctx, ix + i * 11, iy);
  if (p.potions > 3) { ctx.font = `bold 10px ${SANS}`; ctx.textAlign = 'left'; outlined(ctx, `x${p.potions}`, ix + 32, iy + 4, '#8aa0ff', '#000', 2); }

  // turbo bar
  const bx = x + 136, by = y + 62, bw = PANEL_W - 148, bh = 7;
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(bx, by, bw, bh);
  const tg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  tg.addColorStop(0, '#ffe040'); tg.addColorStop(1, '#ff3a10');
  ctx.fillStyle = tg;
  ctx.fillRect(bx, by, bw * (p.turbo / 100), bh);
  if (p.turbo >= TURBO_COST) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.sin(g.time * 10) * 0.2})`;
    ctx.fillRect(bx, by, bw * (p.turbo / 100), bh);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx + bw * (TURBO_COST / 100), by - 1, 1, bh + 2);
  ctx.strokeStyle = '#a07a30';
  ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
  ctx.font = `bold 8px ${SANS}`;
  ctx.textAlign = 'left';
  outlined(ctx, 'TURBO', bx, by - 2, '#ffb040', '#000', 2);

  // xp sliver
  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(x + 56, y + PANEL_H - 9, 72, 2);
  ctx.fillStyle = '#ffe070';
  ctx.fillRect(x + 56, y + PANEL_H - 9, 72 * Math.min(1, p.xp / xpForLevel(p.lvl)), 2);

  // active power-ups
  let k = 0;
  for (const [name, t] of Object.entries(p.buffs)) {
    const px = x + PANEL_W - 14 - k * 14, py = y + 44;
    ctx.fillStyle = POWERUPS[name].color;
    ctx.globalAlpha = t < 3 && Math.floor(g.time * 8) % 2 ? 0.3 : 1;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    k++;
  }
}

function drawKeyIcon(ctx, x, y) {
  ctx.strokeStyle = '#ffd040';
  ctx.fillStyle = '#ffd040';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y - 3, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillRect(x - 1, y, 2, 7);
  ctx.fillRect(x, y + 4, 3, 2);
  ctx.lineWidth = 1;
}

function drawPotionIcon(ctx, x, y) {
  ctx.fillStyle = '#4a6aff';
  ctx.beginPath(); ctx.arc(x, y + 2, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 1.5, y - 6, 3, 5);
  ctx.fillStyle = '#c09060';
  ctx.fillRect(x - 2, y - 8, 4, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(x - 2.5, y, 1.5, 2);
}

function drawBossBar(ctx, g) {
  if (!g.boss) return;
  const e = g.boss;
  const w = 380, x = (VIEW_W - w) / 2, y = 22;
  frame(ctx, x - 12, y - 14, w + 24, 40, '#ff4020');
  ctx.font = `italic bold 14px ${SERIF}`;
  ctx.textAlign = 'center';
  outlined(ctx, g.info.boss.name.toUpperCase(), VIEW_W / 2, y + 2, '#ffd8a0', '#000', 3);
  ctx.fillStyle = '#300';
  ctx.fillRect(x, y + 8, w, 9);
  const hg = ctx.createLinearGradient(0, y + 8, 0, y + 17);
  hg.addColorStop(0, '#ff7040'); hg.addColorStop(1, '#a01808');
  ctx.fillStyle = hg;
  ctx.fillRect(x, y + 8, w * Math.max(0, e.hp / e.maxHp), 9);
}

// The current lesson in the Training Grounds, in a box at the top of the screen.
function drawTutorial(ctx, g, tut) {
  const w = 452, x = (VIEW_W - w) / 2, y = 10;
  ctx.font = `15px ${SANS}`;
  const rows = wrap(ctx, tut.text, w - 28);
  const h = 47 + rows.length * 19;
  frame(ctx, x, y, w, h, tut.done ? '#60e060' : '#f2c14e');
  ctx.textAlign = 'center';
  ctx.font = `bold 12px ${SANS}`;
  outlined(ctx, `TRAINING ${tut.n} / ${tut.of}`, VIEW_W / 2, y + 17, '#c8b88a', '#000', 2);
  ctx.font = `bold 17px ${SERIF}`;
  outlined(ctx, tut.done ? `${tut.title}  ✓` : tut.title, VIEW_W / 2, y + 35, tut.done ? '#80ff80' : '#ffe080', '#000', 3);
  ctx.font = `15px ${SANS}`;
  rows.forEach((r, i) => outlined(ctx, r, VIEW_W / 2, y + 56 + i * 19, '#f4ead0', '#000', 3));
  if (g.banner && g.banner.t > 0) {
    // the level-name banner still shows, lower down, when training starts
    drawBanner(ctx, g);
  }
}

// A strip of key caps along the bottom so the controls are always in sight.
function drawControlsBar(ctx, maxW) {
  const items = device === 'pad'
    ? [['STICK', 'move'], ['A', 'attack'], ['B', 'magic'], ['X', '+ A turbo'], ['START', 'pause']]
    : [['WASD', 'move'], ['ENTER', 'attack'], ['E', 'magic'], ['SHIFT', '+ ENTER turbo'], ['P', 'pause'], ['H', 'hide']];
  let size = 14;
  const measure = () => {
    let total = 0;
    for (const [k, label] of items) {
      ctx.font = `bold ${size}px ${SANS}`;
      total += ctx.measureText(k).width + 10 + 4;
      ctx.font = `${size}px ${SANS}`;
      total += ctx.measureText(label).width + 14;
    }
    return total - 14;
  };
  let total = measure();
  while (total > maxW && size > 9) { size--; total = measure(); }
  let x = (VIEW_W - total) / 2;
  const y = VIEW_H - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x - 10, y - size - 8, total + 20, size + 14, 6);
  ctx.fill();
  ctx.textAlign = 'left';
  for (const [k, label] of items) {
    ctx.font = `bold ${size}px ${SANS}`;
    const kw = ctx.measureText(k).width + 10;
    roundRect(ctx, x, y - size - 3, kw, size + 6, 3);
    ctx.fillStyle = '#e8dcc0';
    ctx.fill();
    ctx.fillStyle = '#1a1208';
    ctx.fillText(k, x + 5, y);
    x += kw + 4;
    ctx.font = `${size}px ${SANS}`;
    outlined(ctx, label, x, y, '#f0e6d0', '#000', 3);
    x += ctx.measureText(label).width + 14;
  }
}

function drawBanner(ctx, g) {
  if (!g.banner) return;
  const a = Math.min(1, g.banner.t, 1);
  ctx.globalAlpha = Math.max(0, a);
  ctx.textAlign = 'center';
  const y = 210;
  const grad = ctx.createLinearGradient(0, y - 46, 0, y + 30);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 56, VIEW_W, 96);
  if (g.banner.sub) {
    ctx.font = `italic 16px ${SERIF}`;
    outlined(ctx, g.banner.sub, VIEW_W / 2, y - 30, '#d8c8a0', '#000', 3);
  }
  ctx.font = `bold 38px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, y - 30, 0, y + 6);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(0.5, '#f2c14e'); tg.addColorStop(1, '#a0601a');
  outlined(ctx, g.banner.text, VIEW_W / 2, y + 6, tg, '#1a0a00', 6);
  ctx.globalAlpha = 1;
}

function drawMinimap(ctx, g, xray = false) {
  const maxW = 170, maxH = 120;
  const s = Math.min(maxW / g.w, maxH / g.h);
  const mw = g.w * s, mh = g.h * s;
  const ox = (VIEW_W - mw) / 2, oy = VIEW_H - mh - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      const t = g.tiles[i];
      if (xray && t === T.CRACKED) { ctx.fillStyle = Math.floor(g.time * 4) % 2 ? '#40ff80' : '#208040'; ctx.fillRect(ox + x * s - 1, oy + y * s - 1, Math.ceil(s) + 2, Math.ceil(s) + 2); continue; }
      if (!g.explored[i] && !xray) continue;
      if (t === T.WALL) continue;
      ctx.fillStyle = t === T.DOOR ? '#c08a3a' : t === T.EXIT ? '#6ad0ff' : t === T.SEALED ? '#a05050' : 'rgba(220,210,190,0.4)';
      ctx.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
    }
  for (const p of g.livePlayers()) {
    ctx.fillStyle = p.def.color;
    ctx.fillRect(ox + (p.x / TILE) * s - 2, oy + (p.y / TILE) * s - 2, 4, 4);
  }
}

// ---------- menus (drawn over the 3D showcase) ----------

export function drawLoading(ctx, progress, error) {
  ctx.fillStyle = '#0a0806';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 40px ${SERIF}`;
  outlined(ctx, 'GAUNTLET LEGENDS', VIEW_W / 2, 280, '#f2c14e', '#000', 5);
  const w = 360, x = (VIEW_W - w) / 2, y = 320;
  ctx.fillStyle = '#2a1e10';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(x, y, w * progress, 12);
  ctx.strokeStyle = '#a07a30';
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 13);
  ctx.font = `14px ${SANS}`;
  outlined(ctx, error ? `Failed to load assets: ${error.message}` : 'Loading the realm...', VIEW_W / 2, y + 40, error ? '#ff6050' : '#d8c8a0', '#000', 3);
}

export function titleShowcase(time) {
  return CLASS_ORDER.map((cls, i) => ({ cls, sx: 95 + i * 110, sy: 450, scale: 1.02, turn: Math.sin(time * 0.7 + i) * 0.35 }));
}

export function drawTitle(ctx, time, hiscores, progress = null) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 620);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = 'center';
  ctx.font = `bold 92px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 70, 0, 150);
  tg.addColorStop(0, '#fff6c8'); tg.addColorStop(0.45, '#f2c14e'); tg.addColorStop(0.55, '#c88a2a'); tg.addColorStop(1, '#6a3a0a');
  ctx.shadowColor = 'rgba(255,150,40,0.6)';
  ctx.shadowBlur = 24;
  outlined(ctx, 'GAUNTLET', VIEW_W / 2, 140, tg, '#1a0a00', 8);
  ctx.shadowBlur = 0;
  ctx.font = `bold 44px ${SERIF}`;
  const sg = ctx.createLinearGradient(0, 160, 0, 200);
  sg.addColorStop(0, '#f0f0f8'); sg.addColorStop(1, '#8a8aa0');
  outlined(ctx, 'L E G E N D S', VIEW_W / 2, 196, sg, '#000', 6);
  ctx.font = `italic 15px ${SERIF}`;
  outlined(ctx, 'a fan-made remake', VIEW_W / 2, 222, '#d8c8a0', '#000', 3);

  ctx.font = `bold 13px ${SANS}`;
  ctx.font = `bold 11px ${SANS}`;
  CLASS_ORDER.forEach((cls, i) => outlined(ctx, CLASSES[cls].name.toUpperCase(), 95 + i * 110, 470, CLASSES[cls].color, '#000', 4));

  if (Math.floor(time * 2) % 2) {
    ctx.font = `bold 24px ${SANS}`;
    const verb = device === 'touch' ? 'TAP' : 'PRESS';
    outlined(ctx, `${verb} ${BTN('attack')} TO ${progress ? 'CONTINUE YOUR QUEST' : 'START'}`, VIEW_W / 2, 498, '#ffffff', '#000', 5);
  }
  if (progress) {
    ctx.font = `bold 13px ${SANS}`;
    outlined(ctx, `Rune Stones: ${Object.keys(progress.runes).length} / 16   ·   ${btn('magic')}: begin a new quest`, VIEW_W / 2, 519, '#ffd890', '#000', 3);
  }
  ctx.font = `12px ${SANS}`;
  const lines = device === 'touch' ? [
    'Drag on the left side to move · ATTACK, MAGIC and TURBO buttons on the right',
    'II pauses · ♪ turns the sound on or off · gamepads join with A',
  ] : [
    'Move: WASD or ARROWS · Attack: ENTER or SPACE · Magic: E · Turbo: hold SHIFT + attack',
    'Second player on the keyboard: press 2 (ARROWS + ENTER) · Gamepads: A attack · B magic · X/RB turbo',
    'P pause · M mute · N music · V announcer · X pixel size · TAB map',
  ];
  lines.forEach((l, i) => outlined(ctx, l, VIEW_W / 2, 540 + i * 17, '#e0d4b8', '#000', 3));
  if (hiscores.length) {
    ctx.font = `bold 12px ${SANS}`;
    const h = hiscores[0];
    outlined(ctx, `HIGH SCORE  ${h.score}  ${h.name.toUpperCase()}  (LEVEL ${h.level})`, VIEW_W / 2, 624, '#ffd040', '#000', 3);
  }
}

// What to call a button for a given input source ('kb', 'kb1', 'kb2', 'padN', or one of
// the device kinds 'keys' / 'pad' / 'touch'), so prompts say "Press Enter" rather than
// leaving people to guess which key is Attack.
const BUTTON_NAMES = {
  attack: { kb: 'Enter', kb1: 'Space', kb2: 'Enter', pad: 'A', touch: 'ATTACK' },
  magic: { kb: 'E', kb1: 'E', kb2: '.', pad: 'B', touch: 'MAGIC' },
  turbo: { kb: 'Shift', kb1: 'Left Shift', kb2: 'Right Shift', pad: 'X', touch: 'TURBO' },
};
let device = 'keys';
export function setDevice(d) { device = d; }
export function btn(name, source = device) {
  let src = source === 'keys' ? 'kb' : source;
  if (src.startsWith('pad')) src = 'pad';
  if (src === 'kb' && document.body.classList.contains('touching') && device === 'touch') src = 'touch';
  return BUTTON_NAMES[name][src];
}
const BTN = (name, source) => btn(name, source).toUpperCase();

const SEL_W = 220, SEL_GAP = 12, SEL_X0 = (VIEW_W - (SEL_W * 4 + SEL_GAP * 3)) / 2, SEL_Y = 110, SEL_H = 470;

export function selectShowcase(slots, time) {
  const out = [];
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const slot = slots[s];
    if (!slot) continue;
    out.push({ cls: slot.cls, sx: SEL_X0 + s * (SEL_W + SEL_GAP) + SEL_W / 2, sy: SEL_Y + 262, scale: 1.75, turn: time * 0.9 + s, walk: false, cheer: slot.ready });
  }
  return out;
}

const SEL_ARROW_Y = 240, SEL_ARROW_INSET = 28;

function drawArrowButton(ctx, cx, cy, dir, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + dir * 9, cy);
  ctx.lineTo(cx - dir * 6, cy - 10);
  ctx.lineTo(cx - dir * 6, cy + 10);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

// Which hero-select arrow (if any) is under a tap or click at screen point (x, y).
// Generous hit areas: the outer third of each card, from the portrait down to the name.
export function selectArrowAt(x, y) {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const cx = SEL_X0 + s * (SEL_W + SEL_GAP);
    const lx = x - cx, ly = y - SEL_Y;
    if (lx < 0 || lx > SEL_W || ly < 120 || ly > 330) continue;
    if (lx < SEL_W / 3) return { slot: s, dir: -1 };
    if (lx > SEL_W * 2 / 3) return { slot: s, dir: 1 };
    return null;
  }
  return null;
}

export function drawSelect(ctx, time, slots, countdown, heroes = {}) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 42px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 40, 0, 80);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, 'CHOOSE YOUR HERO', VIEW_W / 2, 66, tg, '#1a0a00', 6);
  ctx.font = `13px ${SANS}`;
  const help = document.body.classList.contains('touching')
    ? 'Tap ◀ ▶ to change hero · ATTACK: ready · MAGIC: back'
    : `Left/Right or click ◀ ▶: choose · ${btn('attack')}: ready · ${btn('magic')}: back`;
  outlined(ctx, help, VIEW_W / 2, 92, '#e0d4b8', '#000', 3);

  for (let s = 0; s < MAX_PLAYERS; s++) {
    const x = SEL_X0 + s * (SEL_W + SEL_GAP), y = SEL_Y;
    const slot = slots[s];
    const def = slot ? CLASSES[slot.cls] : null;
    roundRect(ctx, x, y, SEL_W, SEL_H, 10);
    ctx.fillStyle = 'rgba(10,8,6,0.35)';
    ctx.fill();
    ctx.lineWidth = slot && slot.ready ? 4 : 2;
    ctx.strokeStyle = def ? def.color : 'rgba(160,130,80,0.5)';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.font = `bold 15px ${SANS}`;
    outlined(ctx, `PLAYER ${s + 1}`, x + SEL_W / 2, y + 24, '#f0e0b0', '#000', 3);
    if (!slot) {
      if (Math.floor(time * 2) % 2) outlined(ctx, 'PRESS A', x + SEL_W / 2, y + 230, '#c8b890', '#000', 3);
      ctx.font = `12px ${SANS}`;
      outlined(ctx, 'on a gamepad to join,', x + SEL_W / 2, y + 256, '#a89878', '#000', 2);
      if (!document.body.classList.contains('touching')) {
        outlined(ctx, 'or press 2 to share the keyboard', x + SEL_W / 2, y + 274, '#a89878', '#000', 2);
        ctx.font = `bold 15px ${SANS}`;
      }
      continue;
    }
    ctx.font = `11px ${SANS}`;
    outlined(ctx, Input.label(slot.source), x + SEL_W / 2, y + 42, '#b8a888', '#000', 2);
    if (def.secret) { ctx.font = `bold 11px ${SANS}`; outlined(ctx, '★ SECRET HERO ★', x + SEL_W / 2, y + 76, '#ff9af0', '#000', 3); }
    const saved = heroes[slot.cls];
    if (saved) { ctx.font = `bold 12px ${SANS}`; outlined(ctx, `SAVED HERO · LEVEL ${saved.lvl} · ${saved.gold} GOLD`, x + SEL_W / 2, y + 60, '#ffd860', '#000', 3); }
    if (!slot.ready) {
      for (const dir of [-1, 1]) drawArrowButton(ctx, x + SEL_W / 2 + dir * (SEL_W / 2 - SEL_ARROW_INSET), y + SEL_ARROW_Y, dir, def.color);
    }
    ctx.font = `bold 26px ${SERIF}`;
    outlined(ctx, def.name.toUpperCase(), x + SEL_W / 2, y + 306, def.color, '#000', 5);
    ctx.font = `12px ${SANS}`;
    outlined(ctx, def.blurb, x + SEL_W / 2, y + 326, '#e0d4b8', '#000', 3);
    const stats = [
      ['Health', def.hp / 900], ['Strength', def.strength / 26], ['Armor', def.armor / 0.3],
      ['Magic', def.magic / 2], ['Speed', def.speed / 155],
    ];
    stats.forEach(([n, v], i) => {
      const sy = y + 344 + i * 19;
      ctx.textAlign = 'left';
      outlined(ctx, n, x + 16, sy + 10, '#d8c8a8', '#000', 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 84, sy, 118, 11);
      const bg = ctx.createLinearGradient(0, sy, 0, sy + 11);
      bg.addColorStop(0, def.color); bg.addColorStop(1, def.dark);
      ctx.fillStyle = bg;
      ctx.fillRect(x + 84, sy, 118 * Math.min(1, v), 11);
      ctx.textAlign = 'center';
    });
    if (slot.ready) {
      ctx.font = `bold 22px ${SANS}`;
      outlined(ctx, 'READY!', x + SEL_W / 2, y + SEL_H - 14, '#80ff80', '#000', 4);
    }
  }
  if (countdown != null) {
    ctx.font = `bold 22px ${SANS}`;
    outlined(ctx, `Entering the realm in ${Math.ceil(countdown)}...`, VIEW_W / 2, 612, '#fff', '#000', 4);
  }
}

export function drawOverlay(ctx, title, lines, accent = '#f2c14e') {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 52px ${SERIF}`;
  outlined(ctx, title, VIEW_W / 2, 230, accent, '#000', 7);
  ctx.font = `17px ${SANS}`;
  lines.forEach((l, i) => outlined(ctx, l, VIEW_W / 2, 284 + i * 28, '#f0e6d0', '#000', 3));
}

// ---------- quest screens ----------

function drawRuneIcon(ctx, x, y, size, lit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = lit ? '#7a6aa0' : '#3a3440';
  ctx.strokeStyle = lit ? '#ffb0ff' : '#5a5060';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, -size * 0.5); ctx.lineTo(size * 0.4, -size * 0.55); ctx.lineTo(size * 0.45, size * 0.5); ctx.lineTo(-size * 0.45, size * 0.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = lit ? '#ffe0ff' : '#6a6070';
  ctx.beginPath(); ctx.moveTo(-size * 0.15, -size * 0.3); ctx.lineTo(size * 0.15, 0); ctx.lineTo(-size * 0.15, size * 0.3); ctx.stroke();
  ctx.restore();
}

function drawRuneCount(ctx, n) {
  const x = VIEW_W / 2;
  ctx.fillStyle = 'rgba(10,8,6,0.6)';
  roundRect(ctx, x - 62, 10, 124, 26, 8);
  ctx.fill();
  drawRuneIcon(ctx, x - 44, 23, 16, true);
  ctx.font = `bold 13px ${SANS}`;
  ctx.textAlign = 'left';
  outlined(ctx, `RUNES ${n}/16`, x - 30, 28, '#ffd0ff', '#000', 3);
}

// Heroes standing along the bottom of the menu screens.
export function partyShowcase(g, time, cheer = false, wide = false) {
  if (!g) return [];
  const ps = g.allPlayers();
  return ps.map((p, i) => ({
    cls: p.cls, sx: VIEW_W / 2 + (i - (ps.length - 1) / 2) * (wide ? 170 : 120), sy: wide ? 470 : 612, scale: wide ? 1.22 : 0.78,
    turn: Math.sin(time * 0.8 + i) * 0.3, cheer,
  }));
}

export function storyShowcase(time, g) {
  if (g) return partyShowcase(g, time, false, true);
  return CLASS_ORDER.slice(0, 4).map((cls, i) => ({ cls, sx: 210 + i * 180, sy: 400, scale: 1.14, turn: Math.sin(time * 0.6 + i) * 0.4 }));
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawStory(ctx, story, time) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.45, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!story) return;
  const line = story.lines[story.idx];
  const shown = line.slice(0, Math.floor(story.t * 45));
  frame(ctx, 90, 470, VIEW_W - 180, 130, '#f2c14e');
  ctx.font = `italic 21px ${SERIF}`;
  ctx.textAlign = 'center';
  const rows = wrap(ctx, line, VIEW_W - 240);
  // typewriter over the wrapped rows
  let left = shown.length;
  rows.forEach((r, i) => {
    const part = r.slice(0, Math.max(0, left));
    left -= r.length + 1;
    outlined(ctx, part, VIEW_W / 2, 512 + i * 28, '#f4e8c8', '#000', 4);
  });
  ctx.font = `12px ${SANS}`;
  outlined(ctx, `${story.idx + 1} / ${story.lines.length}     ${btn('attack')}: continue     ${btn('magic')}: skip`, VIEW_W / 2, 590, '#b8a888', '#000', 3);
  ctx.font = `bold 34px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 40, 0, 80);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, 'THE LEGEND', VIEW_W / 2, 72, tg, '#1a0a00', 6);
}

const REALM_NAMES = ['Mountain Kingdom', 'Castle Stronghold', 'Sky Dominion', 'Underworld'];
const REALM_COLORS = ['#ffb24a', '#a8c0ff', '#e0f4ff', '#ff6a3a'];
const STAGE_NAMES = [
  ['Valley of Fire', 'Dagger Peak', 'Cliffs of Desolation', 'The Dragon'],
  ['Castle Courtyard', 'Dungeon of Torment', 'Tower Armory', 'The Chimera'],
  ['Poisonous Fields', 'Haunted Cemetery', 'Venomous Spire', 'The Plague Fiend'],
  ['Gates of the Underworld', 'Lava Pits', 'Hall of Souls', 'Skorne'],
];

// Stage picker shown when the party steps onto a realm portal in the hub.
export function drawRealmPick(ctx, time, progress, pick) {
  const r = pick.realm;
  const cw = 300, ch = 372, x = (VIEW_W - cw) / 2, y0 = 120;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  frame(ctx, x, y0, cw, ch, REALM_COLORS[r]);
  ctx.textAlign = 'center';
  ctx.font = `italic bold 24px ${SERIF}`;
  outlined(ctx, REALM_NAMES[r], VIEW_W / 2, y0 + 36, REALM_COLORS[r], '#000', 4);
  for (let s = 1; s <= 4; s++) {
    const n = r * 4 + s;
    const sy = y0 + 56 + (s - 1) * 76;
    const open = s === 1 || progress.completed[n - 1];
    const done = !!progress.completed[n];
    const here = pick.stage === s;
    ctx.fillStyle = here ? 'rgba(255,220,140,0.22)' : 'rgba(0,0,0,0.35)';
    roundRect(ctx, x + 12, sy, cw - 24, 66, 6);
    ctx.fill();
    if (here) { ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    ctx.textAlign = 'left';
    ctx.font = `bold 10px ${SANS}`;
    outlined(ctx, s === 4 ? 'GUARDIAN' : `STAGE ${s}`, x + 24, sy + 18, s === 4 ? '#ff9a7a' : '#c8b88a', '#000', 2);
    ctx.font = `bold 15px ${SANS}`;
    outlined(ctx, open ? STAGE_NAMES[r][s - 1] : '? ? ?', x + 24, sy + 39, open ? '#f4ead0' : '#6a6050', '#000', 3);
    ctx.font = `11px ${SANS}`;
    outlined(ctx, done ? 'Cleared' : open ? 'Open' : 'Locked', x + 24, sy + 57, done ? '#80e080' : open ? '#ffe080' : '#8a7060', '#000', 2);
    drawRuneIcon(ctx, x + cw - 40, sy + 33, 20, !!progress.runes[s === 4 ? `g${n}` : `h${n}`]);
  }
  ctx.textAlign = 'center';
  ctx.font = `13px ${SANS}`;
  outlined(ctx, `Up/Down: choose     ${btn('attack')}: enter     ${btn('magic')}: back`, VIEW_W / 2, y0 + ch + 24, '#e0d4b8', '#000', 3);
}

// Labels over the hub's portals and merchant, and a prompt when someone stands at one.
function drawHubLabels(ctx, g, r3d) {
  ctx.textAlign = 'center';
  for (const pt of g.level.portals) {
    const p = r3d.toScreen((pt.x + 0.5) * TILE, (pt.y + 0.5) * TILE + 30, 0);
    p.y += 14;
    ctx.font = `italic bold 15px ${SERIF}`;
    const sealed = pt.realm === 3 && g.underworldSealed;
    outlined(ctx, REALM_NAMES[pt.realm], p.x, p.y, sealed ? '#8a7a6a' : REALM_COLORS[pt.realm], '#000', 4);
    if (sealed) { ctx.font = `bold 10px ${SANS}`; outlined(ctx, 'SEALED', p.x, p.y + 14, '#ff8060', '#000', 3); }
  }
  const sp = r3d.toScreen((g.level.shop.x + 0.5) * TILE, (g.level.shop.y + 0.5) * TILE, 80);
  ctx.font = `italic bold 15px ${SERIF}`;
  outlined(ctx, 'Merchant', sp.x, sp.y, '#ffd860', '#000', 4);
  if (g.hubFocus) {
    const text = g.hubFocus.type === 'shop' ? `Press ${btn('attack')} to trade` : (g.hubFocus.realm === 3 && g.underworldSealed ? 'The way is sealed' : `Press ${btn('attack')} to enter`);
    ctx.font = `bold 18px ${SANS}`;
    outlined(ctx, text, VIEW_W / 2, VIEW_H - 120, Math.floor(g.time * 3) % 2 ? '#ffffff' : '#ffe080', '#000', 4);
  }
}

const SHOP_W = 222, SHOP_GAP = 10, SHOP_X0 = (VIEW_W - (SHOP_W * 4 + SHOP_GAP * 3)) / 2;

export function drawShop(ctx, time, g, cursors) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(6,4,2,0.5)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 36px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 30, 0, 70);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, "THE MERCHANT'S STALL", VIEW_W / 2, 56, tg, '#1a0a00', 6);
  ctx.font = `13px ${SANS}`;
  outlined(ctx, `Up/Down: browse   ${btn('attack')}: buy   ${btn('magic')}: done   (everyone must finish)`, VIEW_W / 2, 80, '#e0d4b8', '#000', 3);
  const ps = g.allPlayers();
  const n = ps.length;
  const x0 = (VIEW_W - (SHOP_W * n + SHOP_GAP * (n - 1))) / 2;
  ps.forEach((p, i) => {
    const c = cursors[p.slot] || { idx: 0 };
    const x = x0 + i * (SHOP_W + SHOP_GAP), y = 96;
    frame(ctx, x, y, SHOP_W, 410, p.def.color);
    ctx.font = `italic bold 17px ${SERIF}`;
    outlined(ctx, `${p.name.toUpperCase()}  LV${p.lvl}`, x + SHOP_W / 2, y + 26, p.def.color, '#000', 4);
    ctx.font = `bold 16px ${SANS}`;
    outlined(ctx, `${p.gold} GOLD`, x + SHOP_W / 2, y + 48, c.deny > 0 ? '#ff5040' : '#ffd860', '#000', 3);
    SHOP.forEach((item, k) => {
      const iy = y + 62 + k * 40;
      const here = c.idx === k && !c.done;
      const cost = priceOf(p, item);
      const afford = item.id === 'done' || p.gold >= cost;
      ctx.fillStyle = here ? 'rgba(255,220,140,0.25)' : 'rgba(0,0,0,0.3)';
      roundRect(ctx, x + 10, iy, SHOP_W - 20, 34, 5);
      ctx.fill();
      if (here) { ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
      ctx.textAlign = 'left';
      ctx.font = `bold 13px ${SANS}`;
      outlined(ctx, item.name, x + 18, iy + 15, afford ? '#f4ead0' : '#8a7a68', '#000', 3);
      ctx.font = `10px ${SANS}`;
      outlined(ctx, item.desc, x + 18, iy + 28, '#b8a888', '#000', 2);
      if (item.price) {
        ctx.textAlign = 'right';
        ctx.font = `bold 12px ${SANS}`;
        outlined(ctx, `${cost}g`, x + SHOP_W - 18, iy + 21, afford ? '#ffd860' : '#8a6a40', '#000', 3);
      }
      ctx.textAlign = 'center';
    });
    ctx.font = `11px ${SANS}`;
    outlined(ctx, `STR ${Math.round(p.strength)}  ARM ${Math.round(p.armor * 100)}  SPD ${Math.round(p.speed)}  MAG ${p.magic.toFixed(1)}`, x + SHOP_W / 2, y + 400, '#d8c8a8', '#000', 2);
    if (c.done) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, x + 6, y + 56, SHOP_W - 12, 330, 6);
      ctx.fill();
      ctx.font = `bold 22px ${SANS}`;
      outlined(ctx, 'READY!', x + SHOP_W / 2, y + 220, '#80ff80', '#000', 4);
    }
    if (c.deny > 0) c.deny -= 0.016;
  });
}

export function drawEnding(ctx, time, g, progress) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 64px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 60, 0, 130);
  tg.addColorStop(0, '#fff6c8'); tg.addColorStop(0.5, '#f2c14e'); tg.addColorStop(1, '#8a4a10');
  ctx.shadowColor = 'rgba(255,180,60,0.7)';
  ctx.shadowBlur = 30;
  outlined(ctx, 'VICTORY', VIEW_W / 2, 120, tg, '#1a0a00', 8);
  ctx.shadowBlur = 0;
  ctx.font = `italic 20px ${SERIF}`;
  outlined(ctx, 'Skorne is sealed away, and the realms are free.', VIEW_W / 2, 160, '#f4e8c8', '#000', 4);
  ctx.font = `bold 15px ${SANS}`;
  outlined(ctx, `Rune Stones recovered: ${Object.keys(progress.runes).length} / 16`, VIEW_W / 2, 192, '#ffd0ff', '#000', 3);
  if (g) {
    const ps = g.allPlayers();
    ps.forEach((p, i) => {
      const sx = VIEW_W / 2 + (i - (ps.length - 1) / 2) * 170;
      ctx.font = `bold 15px ${SANS}`;
      outlined(ctx, `${p.name.toUpperCase()}`, sx, 520, p.def.color, '#000', 4);
      ctx.font = `12px ${SANS}`;
      outlined(ctx, `Level ${p.lvl} · ${p.score} pts`, sx, 538, '#e0d4b8', '#000', 3);
    });
  }
  if (time > 3 && Math.floor(time * 2) % 2) {
    ctx.font = `bold 18px ${SANS}`;
    outlined(ctx, `Press ${btn('attack')}`, VIEW_W / 2, 600, '#fff', '#000', 4);
  }
}
