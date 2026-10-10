// 2D overlay drawn over the WebGL view: corner player panels, floating text, banners and menus.

import { VIEW_W, VIEW_H, CLASSES, BASE_CLASSES as CLASS_ORDER, ENEMIES, POWERUPS, TURBO_COST, MAX_PLAYERS, TILE, xpForLevel } from './config.js';
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
  if (g.level.hub) drawHubLabels(ctx, g, r3d, opts.hubPrompt !== false);
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
    : [['WASD', 'move'], ['SPACE', 'attack'], ['E', 'magic'], ['SHIFT', '+ SPACE turbo'], ['ESC', 'pause'], ['H', 'hide']];
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

// The PLAY ONLINE button on the title screen (tapped, clicked, or O on the keyboard).
const ONLINE_BTN = { x: VIEW_W / 2 - 170, y: 518, w: 340, h: 44 };
export function titleOnlineAt(x, y) {
  const b = ONLINE_BTN;
  return x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 8 && y <= b.y + b.h + 8;
}

function drawOnlineButton(ctx, time) {
  const { x, y, w, h } = ONLINE_BTN;
  const pulse = 0.5 + Math.sin(time * 3) * 0.5;
  ctx.save();
  ctx.shadowColor = `rgba(80,200,255,${0.45 + pulse * 0.45})`;
  ctx.shadowBlur = 12 + pulse * 16;
  roundRect(ctx, x, y, w, h, 12);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3fb4f0'); g.addColorStop(1, '#1a5fb0');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#d8f2ff';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `bold 21px ${SANS}`;
  outlined(ctx, '🌐  PLAY ONLINE WITH FRIENDS', VIEW_W / 2, y + 29, '#ffffff', '#0a2a50', 4);
  ctx.restore();
  if (device !== 'touch') {
    ctx.font = `bold 13px ${SANS}`;
    ctx.textAlign = 'left';
    outlined(ctx, '(or press O)', x + w + 12, y + 27, '#a8d8f0', '#000', 3);
  }
}

export function drawTitle(ctx, time, hiscores, progress = null, online = false) {
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
    outlined(ctx, `Rune Stones: ${Object.keys(progress.runes).length} / 16   ·   ${btn('magic')}: begin a new quest`, VIEW_W / 2, 246, '#ffd890', '#000', 3);
  }
  if (online) drawOnlineButton(ctx, time);
  if (online) drawRecordsButton(ctx);
  ctx.font = `12px ${SANS}`;
  const lines = device === 'touch' ? [
    'Drag on the left side to move · ATTACK, MAGIC and TURBO buttons on the right',
    'II pauses · ♪ turns the sound on or off · gamepads join with A',
  ] : [
    'Move: WASD or ARROWS · Attack: SPACE or ENTER · Magic: E · Turbo: hold SHIFT + attack',
    'Second player on the keyboard: press 2 (ARROWS + ENTER) · Gamepads: A attack · B magic · X/RB turbo',
    'ESC pause / back · M mute · N music · V announcer · X pixel size · TAB map',
  ];
  lines.forEach((l, i) => outlined(ctx, l, VIEW_W / 2, (online ? 592 : 540) + i * 15, '#e0d4b8', '#000', 3));
  if (hiscores.length) {
    ctx.font = `bold 12px ${SANS}`;
    const h = hiscores[0];
    // with the online button showing, the bottom is full: the high score goes under the logo
    const hy = !online ? 624 : progress ? 264 : 246;
    outlined(ctx, `HIGH SCORE  ${h.score}  ${h.name.toUpperCase()}  (LEVEL ${h.level})`, VIEW_W / 2, hy, '#ffd040', '#000', 3);
  }
}

// What to call a button for a given input source ('kb', 'kb1', 'kb2', 'padN', or one of
// the device kinds 'keys' / 'pad' / 'touch'), so prompts say "Press Enter" rather than
// leaving people to guess which key is Attack.
const BUTTON_NAMES = {
  attack: { kb: 'Space', kb1: 'Space', kb2: 'Enter', pad: 'A', touch: 'ATTACK' },
  magic: { kb: 'E', kb1: 'E', kb2: '.', pad: 'B', touch: 'MAGIC' },
  back: { kb: 'Esc', kb1: 'Esc', kb2: '.', pad: 'B', touch: 'MAGIC' }, // leaving a menu
  turbo: { kb: 'Shift', kb1: 'Left Shift', kb2: 'Right Shift', pad: 'X', touch: 'TURBO' },
};
let device = 'keys';
export function setDevice(d) { device = d; }
export function btn(name, source = device) {
  let src = source === 'keys' ? 'kb' : source;
  if (src.startsWith('net')) src = device === 'keys' ? 'kb' : device; // an online player: name this screen's own buttons
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
    : `Left/Right or click ◀ ▶: choose · ${btn('attack')}: ready · ${btn('back')}: back`;
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
    const saved = !slot.source.startsWith('net') && heroes[slot.cls]; // online guests play fresh heroes
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
  // as large as fits, so the lines stay readable on a phone
  let size = 23;
  ctx.font = `${size}px ${SANS}`;
  const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  if (widest > VIEW_W - 60) size = Math.floor(size * (VIEW_W - 60) / widest);
  if (lines.length > 1) size = Math.min(size, Math.floor(316 / (lines.length - 1) / 1.55)); // last line by y 600
  size = Math.max(15, size);
  ctx.font = `${size}px ${SANS}`;
  const gap = Math.round(size * 1.55);
  lines.forEach((l, i) => outlined(ctx, l, VIEW_W / 2, 284 + i * gap, '#f0e6d0', '#000', 3));
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
  outlined(ctx, `${story.idx + 1} / ${story.lines.length}     ${btn('attack')}: continue     ${btn('back')}: skip`, VIEW_W / 2, 590, '#b8a888', '#000', 3);
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
// It's drawn at 1.3x around the screen centre so it stays readable on a phone.
const RP_W = 300, RP_H = 372, RP_X = (VIEW_W - RP_W) / 2, RP_Y = 120, RP_SCALE = 1.3;
const rpRow = (s) => ({ x: RP_X + 12, y: RP_Y + 56 + (s - 1) * 76, w: RP_W - 24, h: 66 });

// Which stage (1-4) a tap at (x, y) lands on, or 0.
export function realmStageAt(x, y) {
  const ux = VIEW_W / 2 + (x - VIEW_W / 2) / RP_SCALE, uy = VIEW_H / 2 + (y - VIEW_H / 2) / RP_SCALE;
  for (let s = 1; s <= 4; s++) {
    const r = rpRow(s);
    if (ux >= r.x && ux <= r.x + r.w && uy >= r.y - 5 && uy <= r.y + r.h + 5) return s;
  }
  return 0;
}

export function drawRealmPick(ctx, time, progress, pick) {
  const r = pick.realm;
  const cw = RP_W, ch = RP_H, x = RP_X, y0 = RP_Y;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(RP_SCALE, RP_SCALE);
  ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
  frame(ctx, x, y0, cw, ch, REALM_COLORS[r]);
  ctx.textAlign = 'center';
  ctx.font = `italic bold 24px ${SERIF}`;
  outlined(ctx, REALM_NAMES[r], VIEW_W / 2, y0 + 36, REALM_COLORS[r], '#000', 4);
  for (let s = 1; s <= 4; s++) {
    const n = r * 4 + s;
    const sy = rpRow(s).y;
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
  const help = device === 'touch' ? `Tap a stage, tap again to enter     ${btn('back')}: back` : `Up/Down: choose     ${btn('attack')}: enter     ${btn('back')}: back`;
  outlined(ctx, help, VIEW_W / 2, y0 + ch + 24, '#e0d4b8', '#000', 3);
  ctx.restore();
}

// Labels over the hub's portals and merchant, and a prompt when someone stands at one.
function drawHubLabels(ctx, g, r3d, prompt = true) {
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
  if (g.hubFocus && prompt) {
    const text = g.hubFocus.type === 'shop' ? `Press ${btn('attack')} to trade` : (g.hubFocus.realm === 3 && g.underworldSealed ? 'The way is sealed' : `Press ${btn('attack')} to enter`);
    ctx.font = `bold 18px ${SANS}`;
    outlined(ctx, text, VIEW_W / 2, VIEW_H - 120, Math.floor(g.time * 3) % 2 ? '#ffffff' : '#ffe080', '#000', 4);
  }
}

// Shop panels, sized for the party: a solo hero gets one big two-column panel (readable on a
// phone, where this whole screen is shrunk to fit), two or three heroes get large columns, and
// four share the screen at the normal size. Items run top to bottom, then on to the next column.
const SHOP_TOP = 90, SHOP_BOTTOM = 584; // (room below for the online bar)
function shopLayout(n, i) {
  // with touch controls on screen, keep clear of the buttons down the right side
  const touch = document.body.classList.contains('touching');
  const left = touch ? 16 : 40, right = touch ? 816 : VIEW_W - 40;
  if (n <= 1) return { x: left, y: SHOP_TOP, w: right - left, h: SHOP_BOTTOM - SHOP_TOP, cols: 2, top: 60, rowH: 86, gap: 8, pad: 22, f: 1.85, wide: true };
  const gap = 10, room = touch ? right - left : VIEW_W - 30, w = Math.min(440, (room - gap * (n - 1)) / n);
  const f = Math.min((SHOP_BOTTOM - SHOP_TOP) / 410, w / 222);
  const x0 = (touch ? left : (VIEW_W - room) / 2) + (room - (w * n + gap * (n - 1))) / 2;
  return { x: x0 + i * (w + gap), y: SHOP_TOP, w, h: 410 * f, cols: 1, top: 62 * f, rowH: 34 * f, gap: 6 * f, pad: 10 * f, f };
}

function shopRow(L, k) {
  const per = Math.ceil(SHOP.length / L.cols);
  const col = Math.floor(k / per), row = k % per;
  const cw = (L.w - L.pad * 2 - L.gap * (L.cols - 1)) / L.cols;
  return { x: L.x + L.pad + col * (cw + L.gap), y: L.y + L.top + row * (L.rowH + L.gap), w: cw, h: L.rowH };
}

// Which panel and item a tap at (x, y) lands on, or null.
export function shopItemAt(x, y, n) {
  for (let i = 0; i < n; i++) {
    const L = shopLayout(n, i);
    for (let k = 0; k < SHOP.length; k++) {
      const r = shopRow(L, k);
      if (x >= r.x && x <= r.x + r.w && y >= r.y - L.gap / 2 && y <= r.y + r.h + L.gap / 2) return { i, k };
    }
  }
  return null;
}

export function drawShop(ctx, time, g, cursors) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(6,4,2,0.5)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const cx = document.body.classList.contains('touching') ? 416 : VIEW_W / 2; // over the panels
  ctx.textAlign = 'center';
  ctx.font = `bold 36px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 30, 0, 70);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, "THE MERCHANT'S STALL", cx, 52, tg, '#1a0a00', 6);
  ctx.font = `bold 16px ${SANS}`;
  const help = device === 'touch'
    ? `Tap an item, tap again to buy   ${btn('back')}: done   (everyone must finish)`
    : `Up/Down: browse   ${btn('attack')}: buy   ${btn('back')}: done   (everyone must finish)`;
  outlined(ctx, help, cx, 78, '#e0d4b8', '#000', 3);
  const ps = g.allPlayers();
  const n = ps.length;
  ps.forEach((p, i) => {
    const c = cursors[p.slot] || { idx: 0 };
    const L = shopLayout(n, i), f = L.f, { x, y } = L;
    frame(ctx, x, y, L.w, L.h, p.def.color);
    const gold = `${p.gold} GOLD`, goldColor = c.deny > 0 ? '#ff5040' : '#ffd860';
    if (L.wide) {
      ctx.textAlign = 'left';
      ctx.font = `italic bold 28px ${SERIF}`;
      outlined(ctx, `${p.name.toUpperCase()}  LV${p.lvl}`, x + L.pad + 6, y + 40, p.def.color, '#000', 4);
      ctx.textAlign = 'right';
      ctx.font = `bold 28px ${SANS}`;
      outlined(ctx, gold, x + L.w - L.pad - 6, y + 40, goldColor, '#000', 4);
    } else {
      ctx.textAlign = 'center';
      ctx.font = `italic bold ${17 * f}px ${SERIF}`;
      outlined(ctx, `${p.name.toUpperCase()}  LV${p.lvl}`, x + L.w / 2, y + 26 * f, p.def.color, '#000', 4);
      ctx.font = `bold ${16 * f}px ${SANS}`;
      outlined(ctx, gold, x + L.w / 2, y + 48 * f, goldColor, '#000', 3);
    }
    SHOP.forEach((item, k) => {
      const r = shopRow(L, k);
      const here = c.idx === k && !c.done;
      const cost = priceOf(p, item);
      const afford = item.id === 'done' || p.gold >= cost;
      ctx.fillStyle = here ? 'rgba(255,220,140,0.25)' : 'rgba(0,0,0,0.3)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 5 * f);
      ctx.fill();
      if (here) { ctx.strokeStyle = '#ffe080'; ctx.lineWidth = 2 * Math.min(f, 1.5); ctx.stroke(); ctx.lineWidth = 1; }
      ctx.textAlign = 'left';
      ctx.font = `bold ${13 * f}px ${SANS}`;
      outlined(ctx, item.name, r.x + 8 * f, r.y + r.h * 0.44, afford ? '#f4ead0' : '#8a7a68', '#000', 3);
      ctx.font = `${10 * f}px ${SANS}`;
      outlined(ctx, item.desc, r.x + 8 * f, r.y + r.h * 0.82, '#b8a888', '#000', 2);
      if (item.price) {
        ctx.textAlign = 'right';
        ctx.font = `bold ${12 * f}px ${SANS}`;
        outlined(ctx, `${cost}g`, r.x + r.w - 8 * f, r.y + r.h * (L.wide ? 0.5 : 0.62), afford ? '#ffd860' : '#8a6a40', '#000', 3);
      }
    });
    ctx.textAlign = 'center';
    ctx.font = `${(L.wide ? 19 : 11 * f)}px ${SANS}`;
    outlined(ctx, `STR ${Math.round(p.strength)}  ARM ${Math.round(p.armor * 100)}  SPD ${Math.round(p.speed)}  MAG ${p.magic.toFixed(1)}`, x + L.w / 2, y + L.h - (L.wide ? 16 : 10 * f), '#d8c8a8', '#000', L.wide ? 3 : 2);
    if (c.done) {
      const last = shopRow(L, Math.ceil(SHOP.length / L.cols) - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, x + 6, y + L.top - 6 * f, L.w - 12, last.y + last.h - (y + L.top) + 12 * f, 6);
      ctx.fill();
      ctx.font = `bold ${L.wide ? 40 : 22 * f}px ${SANS}`;
      outlined(ctx, 'READY!', x + L.w / 2, (y + L.top + last.y + last.h) / 2 + 10, '#80ff80', '#000', 4);
    }
    if (c.deny > 0) c.deny -= 0.016;
  });
}

// ---------- stats & leaderboard ----------

// The title screen's button for it, top left.
const RECORDS_BTN = { x: 14, y: 14, w: 290, h: 42 };
export function titleRecordsAt(x, y) {
  const b = RECORDS_BTN;
  return x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8;
}

function drawRecordsButton(ctx) {
  const { x, y, w, h } = RECORDS_BTN;
  roundRect(ctx, x, y, w, h, 12);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(120,84,20,0.92)'); g.addColorStop(1, 'rgba(60,38,8,0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#f2c14e';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.font = `bold 18px ${SANS}`;
  outlined(ctx, '🏆  STATS & LEADERBOARD', x + w / 2, y + 27, '#fff0c0', '#2a1800', 4);
  if (device !== 'touch') {
    ctx.font = `bold 12px ${SANS}`;
    outlined(ctx, '(or press L)', x + w / 2, y + h + 15, '#e0c890', '#000', 3);
  }
}

const RECORD_TABS = ['OVERVIEW', 'HEROES', 'LEADERBOARD'];
const TAB_W = 220, TAB_H = 42, TAB_GAP = 12, TAB_Y = 72;
const TAB_X0 = (VIEW_W - (TAB_W * 3 + TAB_GAP * 2)) / 2;
const BACK_BTN = { x: 14, y: 14, w: 116, h: 40 };

// What a tap on the stats screen hits: a tab (0-2), 'back', or null.
export function recordsTapAt(x, y) {
  const b = BACK_BTN;
  if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return 'back';
  if (y < TAB_Y - 6 || y > TAB_Y + TAB_H + 6) return null;
  for (let i = 0; i < 3; i++) {
    const tx = TAB_X0 + i * (TAB_W + TAB_GAP);
    if (x >= tx && x <= tx + TAB_W) return i;
  }
  return null;
}

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
function hours(sec) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
function stageName(n) {
  if (!n) return 'The hub';
  return STAGE_NAMES[Math.floor((n - 1) / 4)][(n - 1) % 4];
}

// The stats screen. data: see stats.js · progress: the quest save · heroes: saved heroes
// (for their levels) · unlocked: heroes that can be played · tab: 0-2
export function drawRecords(ctx, time, data, progress, heroes, unlocked, tab) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(4,3,2,0.86)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 40px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 20, 0, 60);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, 'HALL OF LEGENDS', VIEW_W / 2, 52, tg, '#1a0a00', 6);

  // back button and tabs
  const b = BACK_BTN;
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fillStyle = 'rgba(40,26,10,0.9)'; ctx.fill();
  ctx.strokeStyle = '#a07a30'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  ctx.font = `bold 18px ${SANS}`;
  outlined(ctx, '◀ BACK', b.x + b.w / 2, b.y + 26, '#f0e6d0', '#000', 3);
  RECORD_TABS.forEach((name, i) => {
    const x = TAB_X0 + i * (TAB_W + TAB_GAP), on = i === tab;
    roundRect(ctx, x, TAB_Y, TAB_W, TAB_H, 10);
    ctx.fillStyle = on ? 'rgba(200,150,50,0.9)' : 'rgba(30,22,12,0.9)'; ctx.fill();
    ctx.strokeStyle = on ? '#ffe9a0' : '#6a5328'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    ctx.font = `bold 20px ${SANS}`;
    outlined(ctx, name, x + TAB_W / 2, TAB_Y + 28, on ? '#fff' : '#c8b890', '#000', 3);
  });

  if (tab === 0) drawOverview(ctx, data, progress, unlocked);
  else if (tab === 1) drawHeroTable(ctx, data, heroes, unlocked);
  else drawLeaderboard(ctx, data);

  ctx.textAlign = 'center';
  ctx.font = `15px ${SANS}`;
  const help = device === 'touch' ? `Tap a tab to switch pages · ${btn('back')} or ◀ BACK: return` : `Left/Right: switch pages   ${btn('back')}: back`;
  outlined(ctx, help, VIEW_W / 2, 628, '#b8a888', '#000', 3);
}

function drawOverview(ctx, d, progress, unlocked) {
  const tiles = [
    ['Time played', hours(d.time)], ['Games played', fmt(d.games)], ['Levels cleared', fmt(d.levels)], ['Guardians defeated', fmt(d.bosses)],
    ['Monsters slain', fmt(d.kills)], ['Generators smashed', fmt(d.gens)], ['Gold collected', fmt(d.gold)], ['Deaths', fmt(d.deaths)],
    ['Food eaten', fmt(d.food)], ['Potions used', fmt(d.potions)], ['Turbo attacks', fmt(d.turbo)], ['Rune Stones', `${Object.keys(progress.runes).length} / 16`],
  ];
  const w = (VIEW_W - 80 - 3 * 12) / 4, h = 104;
  tiles.forEach(([name, value], i) => {
    const x = 40 + (i % 4) * (w + 12), y = 130 + Math.floor(i / 4) * (h + 12);
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(40,30,16,0.85)'; ctx.fill();
    ctx.strokeStyle = '#5a4520'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.font = `bold 36px ${SANS}`;
    outlined(ctx, value, x + w / 2, y + 54, '#ffe9a0', '#000', 4);
    ctx.font = `17px ${SANS}`;
    outlined(ctx, name, x + w / 2, y + 86, '#c8b890', '#000', 3);
  });
  // favourites
  const foe = Object.entries(d.byEnemy).filter(([k]) => ENEMIES[k]).sort((a, b) => b[1] - a[1])[0];
  const fav = Object.entries(d.heroes).sort((a, b) => b[1].time - a[1].time)[0];
  const secrets = unlocked.filter((c) => CLASSES[c].secret).length;
  ctx.font = `19px ${SANS}`;
  const line1 = [
    foe ? `Most slain: ${ENEMIES[foe[0]].name} × ${fmt(foe[1])}` : null,
    fav && fav[1].time > 0 ? `Favourite hero: ${CLASSES[fav[0]].name} (${hours(fav[1].time)})` : null,
  ].filter(Boolean).join('     ·     ');
  outlined(ctx, line1 || 'Play a game and your stats will appear here.', VIEW_W / 2, 518, '#f0e6d0', '#000', 3);
  outlined(ctx, `Online games: ${fmt(d.online)}     ·     Treasure rooms: ${fmt(d.treasure)}     ·     Keys used: ${fmt(d.keys)}     ·     Secret heroes: ${secrets} / 4`, VIEW_W / 2, 554, '#c8b890', '#000', 3);
}

function drawHeroTable(ctx, d, heroes, unlocked) {
  const cols = [['HERO', 60, 'left'], ['LEVEL', 330, 'center'], ['TIME', 430, 'center'], ['KILLS', 540, 'center'], ['DEATHS', 650, 'center'], ['GOLD', 760, 'center'], ['BEST', 900, 'right']];
  ctx.font = `bold 15px ${SANS}`;
  for (const [name, x, align] of cols) { ctx.textAlign = align; outlined(ctx, name, x, 150, '#a89870', '#000', 3); }
  const hidden = 4 - unlocked.filter((c) => CLASSES[c].secret).length;
  const rows = unlocked.length + (hidden ? 1 : 0);
  const rh = Math.min(48, (590 - 166) / rows);
  unlocked.forEach((cls, i) => {
    const y = 166 + i * rh, h = d.heroes[cls], saved = heroes[cls];
    ctx.fillStyle = i % 2 ? 'rgba(40,30,16,0.55)' : 'rgba(20,15,8,0.55)';
    ctx.fillRect(40, y, VIEW_W - 80, rh - 4);
    const ty = y + rh / 2 + 5;
    ctx.textAlign = 'left';
    ctx.font = `italic bold ${Math.min(22, rh * 0.5)}px ${SERIF}`;
    outlined(ctx, CLASSES[cls].name.toUpperCase(), 60, ty, CLASSES[cls].color, '#000', 4);
    ctx.font = `${Math.min(20, rh * 0.45)}px ${SANS}`;
    const vals = [saved ? saved.lvl : 1, h ? hours(h.time) : '—', h ? fmt(h.kills) : '—', h ? fmt(h.deaths) : '—', h ? fmt(h.gold) : '—', h && h.best ? fmt(h.best) : '—'];
    vals.forEach((v, k) => { ctx.textAlign = cols[k + 1][2]; outlined(ctx, String(v), cols[k + 1][1], ty, '#f0e6d0', '#000', 3); });
  });
  if (hidden) {
    ctx.textAlign = 'left';
    ctx.font = `italic ${Math.min(19, rh * 0.45)}px ${SANS}`;
    outlined(ctx, `🔒  ${hidden} secret hero${hidden === 1 ? '' : 'es'} still to find`, 60, 166 + unlocked.length * rh + rh / 2 + 5, '#8a7a60', '#000', 3);
  }
}

function drawLeaderboard(ctx, d) {
  const runs = d.runs.slice(0, 10);
  const cols = [['#', 64, 'center'], ['HERO', 100, 'left'], ['SCORE', 400, 'right'], ['REACHED', 440, 'left'], ['PARTY', 690, 'left'], ['DATE', 900, 'right']];
  ctx.font = `bold 15px ${SANS}`;
  for (const [name, x, align] of cols) { ctx.textAlign = align; outlined(ctx, name, x, 150, '#a89870', '#000', 3); }
  if (!runs.length) {
    ctx.textAlign = 'center';
    ctx.font = `italic 22px ${SERIF}`;
    outlined(ctx, 'No legends yet. Go and make your name!', VIEW_W / 2, 320, '#c8b890', '#000', 3);
    return;
  }
  const medal = ['#ffd84a', '#d8dce8', '#e09a5a'];
  runs.forEach((r, i) => {
    const y = 162 + i * 43, ty = y + 27;
    ctx.fillStyle = i % 2 ? 'rgba(40,30,16,0.55)' : 'rgba(20,15,8,0.55)';
    ctx.fillRect(40, y, VIEW_W - 80, 39);
    ctx.textAlign = 'center';
    ctx.font = `bold 21px ${SANS}`;
    outlined(ctx, String(i + 1), 64, ty, medal[i] || '#c8b890', '#000', 3);
    ctx.textAlign = 'left';
    ctx.font = `italic bold 21px ${SERIF}`;
    outlined(ctx, `${CLASSES[r.cls].name.toUpperCase()}${r.lvl ? `  LV${r.lvl}` : ''}`, 100, ty, CLASSES[r.cls].color, '#000', 4);
    ctx.textAlign = 'right';
    ctx.font = `bold 21px ${SANS}`;
    outlined(ctx, fmt(r.score), 400, ty, '#ffe070', '#000', 3);
    ctx.textAlign = 'left';
    ctx.font = `19px ${SANS}`;
    outlined(ctx, stageName(r.level), 440, ty, '#f0e6d0', '#000', 3);
    outlined(ctx, r.mode === 'solo' ? 'Solo' : `${r.mode === 'online' ? 'Online' : 'Co-op'} ${r.players}P`, 690, ty, r.mode === 'online' ? '#8fe0ff' : '#f0e6d0', '#000', 3);
    ctx.textAlign = 'right';
    outlined(ctx, r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—', 900, ty, '#c8b890', '#000', 3);
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
