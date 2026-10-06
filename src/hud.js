// 2D overlay drawn over the WebGL view: corner player panels, floating text, banners and menus.

import { VIEW_W, VIEW_H, CLASSES, CLASS_ORDER, POWERUPS, TURBO_COST, MAX_PLAYERS, TILE, xpForLevel } from './config.js';
import { T } from './level.js';
import { Input } from './input.js';

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
  drawBanner(ctx, g);
  for (let s = 0; s < MAX_PLAYERS; s++) drawPanel(ctx, g, s);
  if (opts.minimap) drawMinimap(ctx, g);
}

function panelPos(slot) {
  const right = slot % 2 === 1, bottom = slot >= 2;
  return { x: right ? VIEW_W - PANEL_W - M : M, y: bottom ? VIEW_H - PANEL_H - M : M, right, bottom };
}

function drawPanel(ctx, g, slot) {
  const p = g.players[slot];
  const { x, y } = panelPos(slot);
  if (!p) {
    if (slot >= 2 && !g.players[slot - 2] && !g.players[slot === 2 ? 1 : 0]) return;
    ctx.globalAlpha = 0.55 + Math.sin(g.time * 4) * 0.25;
    frame(ctx, x, y + PANEL_H - 30, PANEL_W, 30, '#888');
    ctx.font = `bold 12px ${SANS}`;
    ctx.textAlign = 'center';
    outlined(ctx, `PLAYER ${slot + 1}: PRESS ATTACK TO JOIN`, x + PANEL_W / 2, y + PANEL_H - 11, '#e8d8a8', '#000', 3);
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
    outlined(ctx, p.deadT > 1.5 ? 'PRESS ATTACK' : 'DEFEATED', x + 56, y + 44, blink ? '#ff6050' : '#a03020', '#000', 3);
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
  outlined(ctx, 'SCORE', x + PANEL_W - 12, y + 22, '#c8b88a', '#000', 2);
  ctx.font = `bold 13px ${SANS}`;
  outlined(ctx, String(p.score), x + PANEL_W - 12, y + 36, '#ffe070', '#000', 3);

  // inventory: keys and potions
  let ix = x + 136;
  const iy = y + 50;
  for (let i = 0; i < Math.min(p.keys, 4); i++) drawKeyIcon(ctx, ix + i * 9, iy);
  if (p.keys > 4) { ctx.font = `bold 10px ${SANS}`; ctx.textAlign = 'left'; outlined(ctx, `x${p.keys}`, ix + 36, iy + 4, '#ffd040', '#000', 2); }
  ix = x + 184;
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

function drawMinimap(ctx, g) {
  const maxW = 170, maxH = 120;
  const s = Math.min(maxW / g.w, maxH / g.h);
  const mw = g.w * s, mh = g.h * s;
  const ox = (VIEW_W - mw) / 2, oy = VIEW_H - mh - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!g.explored[i]) continue;
      const t = g.tiles[i];
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

export function titleShowcase(time) {
  return CLASS_ORDER.map((cls, i) => ({ cls, sx: 210 + i * 180, sy: 440, scale: 1.6, turn: Math.sin(time * 0.7 + i) * 0.35 }));
}

export function drawTitle(ctx, time, hiscores) {
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
  CLASS_ORDER.forEach((cls, i) => outlined(ctx, CLASSES[cls].name.toUpperCase(), 210 + i * 180, 466, CLASSES[cls].color, '#000', 4));

  if (Math.floor(time * 2) % 2) {
    ctx.font = `bold 24px ${SANS}`;
    outlined(ctx, 'PRESS ATTACK TO START', VIEW_W / 2, 508, '#ffffff', '#000', 5);
  }
  ctx.font = `12px ${SANS}`;
  const lines = [
    'P1: WASD move · SPACE attack · E magic · hold SHIFT + attack = turbo',
    'P2: ARROWS move · ENTER attack · . magic · hold RIGHT SHIFT + attack = turbo',
    'Gamepads: stick move · A attack · B magic · hold X/RB + A = turbo · up to 4 players',
  ];
  lines.forEach((l, i) => outlined(ctx, l, VIEW_W / 2, 532 + i * 17, '#e0d4b8', '#000', 3));
  if (hiscores.length) {
    ctx.font = `bold 12px ${SANS}`;
    const h = hiscores[0];
    outlined(ctx, `HIGH SCORE  ${h.score}  ${h.name.toUpperCase()}  (LEVEL ${h.level})`, VIEW_W / 2, 618, '#ffd040', '#000', 3);
  }
}

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

export function drawSelect(ctx, time, slots, countdown) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `bold 42px ${SERIF}`;
  const tg = ctx.createLinearGradient(0, 40, 0, 80);
  tg.addColorStop(0, '#fff4c0'); tg.addColorStop(1, '#c88a2a');
  outlined(ctx, 'CHOOSE YOUR HERO', VIEW_W / 2, 66, tg, '#1a0a00', 6);
  ctx.font = `13px ${SANS}`;
  outlined(ctx, 'Left/Right: choose · Attack: ready · Magic: back · Other players press Attack to join', VIEW_W / 2, 92, '#e0d4b8', '#000', 3);

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
      if (Math.floor(time * 2) % 2) outlined(ctx, 'PRESS ATTACK', x + SEL_W / 2, y + 230, '#c8b890', '#000', 3);
      continue;
    }
    ctx.font = `11px ${SANS}`;
    outlined(ctx, Input.label(slot.source), x + SEL_W / 2, y + 42, '#b8a888', '#000', 2);
    ctx.font = `bold 26px ${SERIF}`;
    outlined(ctx, `◀ ${def.name.toUpperCase()} ▶`, x + SEL_W / 2, y + 306, def.color, '#000', 5);
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
