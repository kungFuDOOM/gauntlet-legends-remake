// All drawing. Graphics are procedural (canvas shapes) so no external art assets are needed.

import { TILE, VIEW_W, VIEW_H, HUD_H, CLASSES, POWERUPS, TURBO_COST, MAX_PLAYERS, xpForLevel } from './config.js';
import { T } from './level.js';
import { Input } from './input.js';

const WALL_H = 12;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let lightCanvas = null;

export function drawWorld(ctx, g) {
  const th = g.theme;
  const sx = (Math.random() - 0.5) * g.shake, sy = (Math.random() - 0.5) * g.shake;
  const cx = Math.round(g.camX + sx), cy = Math.round(g.camY + sy);

  ctx.fillStyle = th.void;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-cx, -cy);

  const x0 = Math.max(0, Math.floor(cx / TILE) - 1), x1 = Math.min(g.w - 1, Math.floor((cx + VIEW_W) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(cy / TILE) - 1), y1 = Math.min(g.h - 1, Math.floor((cy + VIEW_H) / TILE) + 2);

  // floor
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const t = g.tile(tx, ty);
      if (t === T.WALL) continue;
      const px = tx * TILE, py = ty * TILE;
      const hv = hash(tx, ty);
      ctx.fillStyle = (tx + ty) % 2 ? th.floorA : th.floorB;
      ctx.fillRect(px, py, TILE, TILE);
      if (hv < 0.18) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + 4 + hv * 40, py + 6 + hv * 30, 6, 4); }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      if (t === T.EXIT || t === T.SEALED) drawExit(ctx, px, py, t === T.SEALED, g.time, th);
      // wall shadow
      if (g.solid(tx, ty - 1) && g.tile(tx, ty - 1) !== T.DOOR) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py, TILE, 8); }
    }

  // walls & doors
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const t = g.tile(tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (t === T.DOOR) { drawDoor(ctx, px, py, g, tx, ty); continue; }
      if (t !== T.WALL) continue;
      let nearFloor = false;
      for (let oy = -1; oy <= 1 && !nearFloor; oy++)
        for (let ox = -1; ox <= 1; ox++) { const n = g.tile(tx + ox, ty + oy); if (n !== T.WALL) { nearFloor = true; break; } }
      if (!nearFloor) continue;
      const below = g.tile(tx, ty + 1);
      if (below !== T.WALL) {
        ctx.fillStyle = th.wallSide;
        ctx.fillRect(px, py + TILE - WALL_H, TILE, WALL_H);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let bx = 0; bx < TILE; bx += 16) ctx.fillRect(px + bx + ((ty % 2) * 8), py + TILE - WALL_H, 1, WALL_H);
      }
      ctx.fillStyle = th.wallTop;
      ctx.fillRect(px, py - WALL_H, TILE, below !== T.WALL ? TILE : TILE + WALL_H);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px + 2, py - WALL_H + 2, TILE - 4, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      if (hash(tx, ty) < 0.4) ctx.fillRect(px + 6, py - WALL_H + 10, 10, 6);
    }

  // items
  for (const it of g.items) if (g.onScreen(it, 40)) drawItem(ctx, it, g.time);

  // y-sorted actors
  const actors = [];
  for (const gen of g.gens) if (g.onScreen(gen, 60)) actors.push(gen);
  for (const e of g.enemies) if (g.onScreen(e, 60)) actors.push(e);
  for (const p of g.allPlayers()) if (p.alive) actors.push(p);
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a.kind === 'player') drawPlayer(ctx, a, g.time);
    else if (a.kind === 'enemy') a.type === 'boss' ? drawBoss(ctx, a, g) : drawEnemy(ctx, a, g.time);
    else drawGenerator(ctx, a, g.time);
  }

  for (const pr of g.projs) drawProjectile(ctx, pr, g.time);

  for (const pt of g.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
    ctx.fillStyle = '#000';
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawLighting(ctx, g, cx, cy);

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.6})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawLighting(ctx, g, cx, cy) {
  if (g.theme.dark <= 0) return;
  if (!lightCanvas) { lightCanvas = document.createElement('canvas'); lightCanvas.width = VIEW_W; lightCanvas.height = VIEW_H; }
  const l = lightCanvas.getContext('2d');
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, VIEW_W, VIEW_H);
  l.fillStyle = `rgba(0,0,0,${g.theme.dark})`;
  l.fillRect(0, 0, VIEW_W, VIEW_H);
  l.globalCompositeOperation = 'destination-out';
  for (const p of g.livePlayers()) {
    const x = p.x - cx, y = p.y - cy;
    const grad = l.createRadialGradient(x, y, 40, x, y, 300);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = grad;
    l.fillRect(x - 300, y - 300, 600, 600);
  }
  for (const pr of g.projs) {
    if (pr.kind !== 'fireball' && pr.kind !== 'efire') continue;
    const x = pr.x - cx, y = pr.y - cy;
    const grad = l.createRadialGradient(x, y, 0, x, y, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = grad;
    l.fillRect(x - 60, y - 60, 120, 120);
  }
  ctx.drawImage(lightCanvas, 0, 0);
}

function drawExit(ctx, px, py, sealed, time, th) {
  const cx = px + TILE / 2, cy = py + TILE / 2;
  ctx.fillStyle = '#05050a';
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
  if (sealed) {
    ctx.strokeStyle = '#6a5a5a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 10, cy - 10); ctx.lineTo(cx + 10, cy + 10); ctx.moveTo(cx + 10, cy - 10); ctx.lineTo(cx - 10, cy + 10); ctx.stroke();
    ctx.lineWidth = 1;
    return;
  }
  for (let i = 0; i < 3; i++) {
    const r = ((time * 14 + i * 5) % 15);
    ctx.strokeStyle = `rgba(160,220,255,${1 - r / 15})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 15 - r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', cx, cy + 3);
}

function drawDoor(ctx, px, py, g, tx, ty) {
  const vertical = g.tile(tx, ty - 1) === T.DOOR || g.tile(tx, ty + 1) === T.DOOR;
  ctx.fillStyle = '#6b4a22';
  ctx.fillRect(px, py - WALL_H, TILE, TILE + WALL_H);
  ctx.fillStyle = '#4a3214';
  if (vertical) for (let i = 0; i < 4; i++) ctx.fillRect(px, py - WALL_H + i * 11 + 4, TILE, 2);
  else for (let i = 0; i < 4; i++) ctx.fillRect(px + i * 8 + 3, py - WALL_H, 2, TILE + WALL_H);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(px + 12, py + 2, 8, 8);
  ctx.fillStyle = '#2a1a08';
  ctx.fillRect(px + 15, py + 5, 2, 4);
}

function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
}

function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
}

function drawItem(ctx, it, time) {
  const bob = Math.sin(it.bob) * 2;
  const x = it.x, y = it.y + bob;
  shadow(ctx, it.x, it.y + 2, 8);
  switch (it.type) {
    case 'food':
      ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x + 2, y - 2, 9, 3);
      circle(ctx, x + 11, y - 2, 2.5, '#e8e0d0');
      circle(ctx, x - 2, y - 1, 7, '#a0522d', '#5a2a10');
      circle(ctx, x - 4, y - 3, 2.5, '#c8794a');
      break;
    case 'gold':
      for (const [ox, oy] of [[-4, 2], [4, 2], [0, -2]]) circle(ctx, x + ox, y + oy, 5, '#f2c14e', '#a07818');
      break;
    case 'gem':
      ctx.fillStyle = '#5ad0ff';
      ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x, y + 8); ctx.lineTo(x - 7, y - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 2, y - 5, 3, 3);
      break;
    case 'key':
      circle(ctx, x - 5, y, 5, null, '#f2c14e');
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x, y - 1.5, 11, 3); ctx.fillRect(x + 7, y, 2, 5); ctx.fillRect(x + 10, y, 2, 4);
      break;
    case 'potion':
      ctx.fillStyle = '#8a5ad9';
      ctx.beginPath(); ctx.arc(x, y + 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 3, y - 9, 6, 7);
      ctx.fillStyle = '#c0a070'; ctx.fillRect(x - 3, y - 11, 6, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - 4, y, 2, 3);
      break;
    case 'chest':
      ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x - 11, y - 7, 22, 15);
      ctx.fillStyle = '#9a6a2a'; ctx.fillRect(x - 11, y - 9, 22, 6);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(x - 11, y - 3, 22, 2); ctx.fillRect(x - 2, y - 4, 4, 5);
      break;
    case 'amulet': {
      const c = POWERUPS[it.sub].color;
      ctx.strokeStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(x, y - 6, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = c; ctx.globalAlpha = 0.5 + Math.sin(time * 6) * 0.3;
      circle(ctx, x, y + 1, 9, c);
      ctx.globalAlpha = 1;
      circle(ctx, x, y + 1, 5, '#fff', '#c9a24a');
      break;
    }
    case 'rune':
      ctx.fillStyle = '#5a4a6a'; ctx.fillRect(x - 9, y - 12, 18, 22);
      ctx.strokeStyle = `hsl(${(time * 120) % 360},90%,70%)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 4, y); ctx.lineTo(x - 4, y + 6); ctx.stroke(); ctx.lineWidth = 1;
      break;
  }
}

function drawPlayer(ctx, p, time) {
  const def = p.def;
  const bounce = Math.abs(Math.sin(p.walk)) * 2;
  const x = p.x, y = p.y - bounce;
  if (p.invuln > 0 && Math.floor(time * 20) % 2) ctx.globalAlpha = 0.5;
  shadow(ctx, p.x, p.y, 11);
  if (p.buffs.shield) { ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(time * 10) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
  if (p.buffs.speed) { ctx.fillStyle = 'rgba(74,217,217,0.3)'; ctx.beginPath(); ctx.arc(p.x - p.fx * 8, p.y - p.fy * 8, 11, 0, Math.PI * 2); ctx.fill(); }

  // weapon behind/in front based on facing
  const ang = Math.atan2(p.fy, p.fx);
  const swingA = p.swing > 0 ? Math.sin((p.swing / 0.18) * Math.PI) * 1.4 - 0.7 : 0;
  const drawWeapon = () => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + swingA);
    if (def.shot === 'axe') {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(6, -1.5, 16, 3);
      ctx.fillStyle = '#c8c8d0'; ctx.beginPath(); ctx.moveTo(18, -1); ctx.lineTo(24, -8); ctx.lineTo(26, 0); ctx.lineTo(24, 8); ctx.closePath(); ctx.fill();
    } else if (def.shot === 'sword') {
      ctx.fillStyle = '#dde'; ctx.fillRect(8, -1.5, 18, 3);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(7, -5, 2, 10);
    } else if (def.shot === 'fireball') {
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(4, -1, 20, 2);
      circle(ctx, 24, 0, 3.5, `hsl(${20 + Math.sin(time * 10) * 15},100%,60%)`);
    } else {
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(8, 0, 10, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8 + Math.cos(-1.2) * 10, Math.sin(-1.2) * 10); ctx.lineTo(8 + Math.cos(1.2) * 10, Math.sin(1.2) * 10); ctx.stroke();
    }
    ctx.restore();
  };
  if (p.fy < 0) drawWeapon();

  // body
  circle(ctx, x, y + 2, 11, p.hurtFlash > 0 ? '#fff' : def.dark);
  circle(ctx, x, y, 10, p.hurtFlash > 0 ? '#fff' : def.color, def.dark);
  // face
  const fx = p.fx * 3, fy = p.fy * 3;
  circle(ctx, x + fx, y - 2 + fy, 5, '#f0c8a0');
  if (p.fy > -0.3) { ctx.fillStyle = '#222'; ctx.fillRect(x + fx - 3, y - 3 + fy, 2, 2); ctx.fillRect(x + fx + 1, y - 3 + fy, 2, 2); }

  // headgear
  ctx.fillStyle = def.accent;
  switch (p.cls) {
    case 'warrior':
      ctx.fillStyle = '#9a9aa8'; ctx.fillRect(x - 6, y - 9, 12, 4);
      ctx.fillStyle = '#eee8d0';
      ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 11, y - 15); ctx.lineTo(x - 4, y - 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 11, y - 15); ctx.lineTo(x + 4, y - 9); ctx.fill();
      break;
    case 'valkyrie':
      ctx.fillStyle = '#c8c8d8'; ctx.beginPath(); ctx.arc(x, y - 6, 6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(x - 6, y - 7); ctx.lineTo(x - 13, y - 13); ctx.lineTo(x - 7, y - 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 7); ctx.lineTo(x + 13, y - 13); ctx.lineTo(x + 7, y - 4); ctx.fill();
      ctx.fillStyle = '#f2d16e'; ctx.fillRect(x - 8, y - 2, 3, 8); ctx.fillRect(x + 5, y - 2, 3, 8);
      break;
    case 'wizard':
      ctx.fillStyle = def.accent;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 2, y - 22); ctx.lineTo(x + 9, y - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe070'; ctx.fillRect(x - 1, y - 13, 2, 2);
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(x - 4 + fx, y + 1 + fy); ctx.lineTo(x + fx, y + 9 + fy); ctx.lineTo(x + 4 + fx, y + 1 + fy); ctx.fill();
      break;
    case 'archer':
      ctx.fillStyle = '#2a7a3a'; ctx.beginPath(); ctx.arc(x, y - 5, 7, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 4, y - 10); ctx.lineTo(x - 2, y - 17); ctx.lineTo(x + 3, y - 10); ctx.fill();
      ctx.fillStyle = '#c4553a'; ctx.fillRect(x + 3, y - 14, 2, 6);
      break;
  }
  if (p.fy >= 0) drawWeapon();
  ctx.globalAlpha = 1;

  // name tag
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = def.color;
  if (p.slot >= 0) ctx.fillText(`P${p.slot + 1}`, p.x, p.y - 24);
}

function drawEnemy(ctx, e, time) {
  const x = e.x, y = e.y - Math.abs(Math.sin(e.walk)) * 1.5;
  const hurt = e.hurt > 0;
  const c = hurt ? '#fff' : e.def.color;
  if (e.invisible) ctx.globalAlpha = 0.15;
  if (e.type !== 'ghost') shadow(ctx, e.x, e.y, e.r);
  switch (e.type) {
    case 'grunt':
      circle(ctx, x, y, e.r, c, '#3a2410');
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 8, y - 9, 16, 4);
      ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x - 5, y - 3, 3, 3); ctx.fillRect(x + 2, y - 3, 3, 3);
      ctx.fillStyle = '#6a4a2a'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 6 + e.phase) * 0.5 + (e.dirX < 0 ? Math.PI : 0)); ctx.fillRect(6, -2, 12, 4); ctx.fillRect(15, -4, 5, 8); ctx.restore();
      break;
    case 'ghost': {
      const gy = y + Math.sin(time * 4 + e.phase) * 3;
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, gy - 2, e.r, Math.PI, 0);
      for (let i = 0; i <= 4; i++) ctx.lineTo(x + e.r - i * (e.r / 2), gy + 9 + (i % 2 ? -4 : 0));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#223'; circle(ctx, x - 4, gy - 3, 2.5, '#223'); circle(ctx, x + 4, gy - 3, 2.5, '#223');
      ctx.beginPath(); ctx.ellipse(x, gy + 3, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'lobber':
      circle(ctx, x, y + 1, e.r, c, '#2a3a10');
      circle(ctx, x, y - 6, 6, hurt ? '#fff' : '#8faa4a');
      ctx.fillStyle = '#ff0'; ctx.fillRect(x - 3, y - 7, 2, 2); ctx.fillRect(x + 1, y - 7, 2, 2);
      circle(ctx, x + 8, y - 8, 3.5, '#7a6a5a');
      break;
    case 'demon':
      circle(ctx, x, y, e.r, c, '#5a1010');
      ctx.fillStyle = '#e8d8b0';
      ctx.beginPath(); ctx.moveTo(x - 7, y - 8); ctx.lineTo(x - 11, y - 18); ctx.lineTo(x - 3, y - 10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 7, y - 8); ctx.lineTo(x + 11, y - 18); ctx.lineTo(x + 3, y - 10); ctx.fill();
      ctx.fillStyle = '#ffde3a'; ctx.fillRect(x - 6, y - 4, 4, 3); ctx.fillRect(x + 2, y - 4, 4, 3);
      ctx.fillStyle = '#300'; ctx.fillRect(x - 4, y + 3, 8, 2);
      break;
    case 'sorcerer':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(x - 11, y + 10); ctx.lineTo(x, y - 16); ctx.lineTo(x + 11, y + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; circle(ctx, x, y - 4, 5, '#111');
      ctx.fillStyle = '#ff40ff'; ctx.fillRect(x - 3, y - 5, 2, 2); ctx.fillRect(x + 1, y - 5, 2, 2);
      circle(ctx, x + 10, y - 6, 3, `hsl(${(time * 200) % 360},100%,70%)`);
      break;
    case 'death': {
      ctx.fillStyle = hurt ? '#555' : '#141418';
      ctx.beginPath(); ctx.moveTo(x - 13, y + 12); ctx.lineTo(x - 8, y - 10); ctx.lineTo(x + 8, y - 10); ctx.lineTo(x + 13, y + 12); ctx.closePath(); ctx.fill();
      circle(ctx, x, y - 8, 7, '#e8e4d8');
      ctx.fillStyle = '#000'; ctx.fillRect(x - 4, y - 10, 3, 3); ctx.fillRect(x + 1, y - 10, 3, 3);
      ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 12); ctx.lineTo(x + 12, y - 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 4, y - 18, 9, -0.2, Math.PI * 0.9, true); ctx.stroke(); ctx.lineWidth = 1;
      break;
    }
  }
  ctx.globalAlpha = 1;
}

function drawBoss(ctx, e, g) {
  const b = g.info.boss;
  const t = g.time;
  const x = e.x, y = e.y + Math.sin(t * 3) * 2;
  shadow(ctx, e.x, e.y + 6, e.r);
  const c = e.hurt > 0 ? '#fff' : b.color;
  if (e.charging > 0) { ctx.fillStyle = 'rgba(255,80,40,0.35)'; circle(ctx, x, y, e.r + 8, 'rgba(255,80,40,0.35)'); }
  // wings / arms
  ctx.fillStyle = c;
  ctx.globalAlpha = 0.8;
  const flap = Math.sin(t * 5) * 6;
  ctx.beginPath(); ctx.moveTo(x - 20, y - 5); ctx.lineTo(x - 52, y - 24 - flap); ctx.lineTo(x - 40, y + 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 20, y - 5); ctx.lineTo(x + 52, y - 24 - flap); ctx.lineTo(x + 40, y + 10); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  circle(ctx, x, y, e.r, c, '#111');
  circle(ctx, x, y + 6, e.r * 0.6, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = b.horn;
  ctx.beginPath(); ctx.moveTo(x - 14, y - 20); ctx.lineTo(x - 24, y - 44); ctx.lineTo(x - 6, y - 26); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 14, y - 20); ctx.lineTo(x + 24, y - 44); ctx.lineTo(x + 6, y - 26); ctx.fill();
  const enraged = e.hp < e.maxHp * 0.4;
  ctx.fillStyle = enraged ? '#ff2020' : '#ffe040';
  ctx.fillRect(x - 13, y - 10, 8, 5); ctx.fillRect(x + 5, y - 10, 8, 5);
  ctx.fillStyle = '#200';
  ctx.fillRect(x - 10, y + 6, 20, 5);
  ctx.fillStyle = '#eee';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 9 + i * 5, y + 6, 2, 3);
}

function drawGenerator(ctx, g, time) {
  const tier = Math.ceil(g.hp / 15);
  const s = 8 + tier * 3;
  const x = g.x, y = g.y;
  shadow(ctx, x, y, s);
  ctx.fillStyle = g.hurt > 0 ? '#fff' : '#5a4a3a';
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = '#7a6a54';
  ctx.fillRect(x - s, y - s - 4, s * 2, 6);
  ctx.strokeStyle = '#2a2018';
  ctx.strokeRect(x - s + 0.5, y - s - 3.5, s * 2 - 1, s * 2 + 3);
  const colors = { grunt: '#c07a3a', ghost: '#c0d0ff', lobber: '#9acf4a', demon: '#ff4a3a', sorcerer: '#c04aff', death: '#888' };
  const glow = 0.5 + Math.sin(time * 5 + g.x) * 0.3;
  ctx.globalAlpha = glow;
  circle(ctx, x, y, s * 0.6, colors[g.type] || '#fff');
  ctx.globalAlpha = 1;
  // skull mark
  circle(ctx, x, y - 1, s * 0.35, '#e8e0d0');
  ctx.fillStyle = '#000';
  ctx.fillRect(x - s * 0.2, y - s * 0.2, 2, 2); ctx.fillRect(x + s * 0.2 - 2, y - s * 0.2, 2, 2);
}

function drawProjectile(ctx, pr, time) {
  if (pr.kind === 'lob') {
    shadow(ctx, pr.x, pr.y, 5);
    circle(ctx, pr.x, pr.y - pr.z, 6, '#8a7a5a', '#4a3a2a');
    // landing marker
    ctx.strokeStyle = 'rgba(255,80,60,0.6)';
    ctx.beginPath(); ctx.arc(pr.tx, pr.ty, 22 * (pr.t / pr.T), 0, Math.PI * 2); ctx.stroke();
    return;
  }
  const ang = Math.atan2(pr.vy, pr.vx);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  switch (pr.kind) {
    case 'axe':
      ctx.rotate(pr.spin);
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-7, -1.5, 14, 3);
      ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); ctx.moveTo(4, -1); ctx.lineTo(9, -7); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill();
      break;
    case 'sword':
      ctx.rotate(pr.spin);
      ctx.fillStyle = '#e8e8f8'; ctx.fillRect(-9, -1.5, 18, 3);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-6, -4, 2, 8);
      break;
    case 'arrow':
      ctx.rotate(ang);
      ctx.fillStyle = '#c8a070'; ctx.fillRect(-9, -1, 16, 2);
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3); ctx.fill();
      ctx.fillStyle = '#c44'; ctx.fillRect(-10, -3, 3, 6);
      break;
    case 'fireball':
    case 'efire': {
      const enemy = pr.kind === 'efire';
      ctx.rotate(ang);
      ctx.fillStyle = enemy ? 'rgba(255,60,20,0.4)' : 'rgba(255,160,40,0.4)';
      ctx.beginPath(); ctx.ellipse(-5, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      circle(ctx, 0, 0, pr.r, enemy ? '#ff4a20' : '#ffa030');
      circle(ctx, 1, 0, pr.r * 0.5, '#fff6a0');
      break;
    }
    case 'bolt':
      circle(ctx, 0, 0, 6, `hsl(${(time * 400) % 360},100%,65%)`);
      circle(ctx, 0, 0, 3, '#fff');
      break;
  }
  ctx.restore();
}

// ---------- HUD ----------

export function drawHud(ctx, g, input, slotsInfo) {
  ctx.fillStyle = 'rgba(8,6,12,0.88)';
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.fillStyle = g.theme.accent;
  ctx.fillRect(0, HUD_H - 2, VIEW_W, 2);
  const pw = VIEW_W / MAX_PLAYERS;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const p = g.players[s];
    const x = s * pw;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(x + 0.5, 0.5, pw - 1, HUD_H - 3);
    if (!p) {
      if (Math.floor(g.time * 2) % 2) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS ATTACK TO JOIN', x + pw / 2, 33);
      }
      continue;
    }
    drawPlayerPanel(ctx, p, x, pw, g);
  }
}

function drawPlayerPanel(ctx, p, x, pw, g) {
  const def = p.def;
  ctx.fillStyle = def.color;
  ctx.fillRect(x + 2, 2, 5, HUD_H - 6);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = def.color;
  ctx.fillText(`${def.name.toUpperCase()}`, x + 12, 16);
  ctx.fillStyle = '#aaa';
  ctx.font = '10px sans-serif';
  ctx.fillText(`LV ${p.lvl}`, x + 12 + ctx.measureText(def.name.toUpperCase()).width * 1.3 + 6, 16);

  if (!p.alive) {
    ctx.fillStyle = Math.floor(g.time * 2) % 2 ? '#ff6060' : '#a04040';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(p.deadT > 1.5 ? 'PRESS ATTACK TO CONTINUE' : 'DEFEATED', x + 12, 36);
    ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif';
    ctx.fillText(`SCORE ${p.score}`, x + 12, 50);
    return;
  }
  // health
  ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
  ctx.fillStyle = p.hp < 200 ? (Math.floor(g.time * 4) % 2 ? '#ff4040' : '#ffb0b0') : '#fff';
  ctx.fillText(String(Math.max(0, Math.floor(p.hp))), x + 12, 38);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`SCORE ${p.score}`, x + 12, 51);

  // keys and potions
  const ix = x + 82;
  for (let i = 0; i < Math.min(p.keys, 6); i++) {
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath(); ctx.arc(ix + i * 10, 24, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(ix + i * 10 - 1, 26, 2, 7);
  }
  if (p.keys > 6) { ctx.fillStyle = '#f2c14e'; ctx.fillText(`+${p.keys - 6}`, ix + 60, 32); }
  for (let i = 0; i < Math.min(p.potions, 6); i++) {
    ctx.fillStyle = '#8a5ad9';
    ctx.beginPath(); ctx.arc(ix + i * 10, 44, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(ix + i * 10 - 1.5, 37, 3, 4);
  }
  if (p.potions > 6) { ctx.fillStyle = '#c9a0ff'; ctx.fillText(`+${p.potions - 6}`, ix + 60, 48); }

  // turbo meter
  const bx = x + pw - 30, bh = HUD_H - 16;
  ctx.fillStyle = '#222';
  ctx.fillRect(bx, 8, 8, bh);
  const fill = p.turbo / 100;
  ctx.fillStyle = p.turbo >= TURBO_COST ? `hsl(${40 + Math.sin(g.time * 8) * 15},100%,55%)` : '#a06a20';
  ctx.fillRect(bx, 8 + bh * (1 - fill), 8, bh * fill);
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx - 2, 8 + bh * (1 - TURBO_COST / 100), 12, 1);
  // xp bar
  const xpw = pw - 60;
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 12, HUD_H - 6, xpw, 2);
  ctx.fillStyle = '#ffe070';
  ctx.fillRect(x + 12, HUD_H - 6, xpw * Math.min(1, p.xp / xpForLevel(p.lvl)), 2);

  // buffs
  let by = 10;
  for (const [k, t] of Object.entries(p.buffs)) {
    ctx.fillStyle = POWERUPS[k].color;
    ctx.fillRect(bx - 14, by, 8, 8 * Math.min(1, t / POWERUPS[k].dur));
    by += 11;
  }
}

export function drawMinimap(ctx, g) {
  const maxW = 150, maxH = 110;
  const s = Math.min(maxW / g.w, maxH / g.h);
  const mw = g.w * s, mh = g.h * s;
  const ox = VIEW_W - mw - 10, oy = VIEW_H - mh - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(ox - 3, oy - 3, mw + 6, mh + 6);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!g.explored[i]) continue;
      const t = g.tiles[i];
      if (t === T.WALL) continue;
      ctx.fillStyle = t === T.DOOR ? '#a07a3a' : t === T.EXIT ? '#6ad0ff' : t === T.SEALED ? '#a05050' : 'rgba(200,200,200,0.35)';
      ctx.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
    }
  for (const p of g.livePlayers()) {
    ctx.fillStyle = p.color;
    ctx.fillRect(ox + (p.x / TILE) * s - 2, oy + (p.y / TILE) * s - 2, 4, 4);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(ox + (g.camX / TILE) * s, oy + ((g.camY + HUD_H) / TILE) * s, (VIEW_W / TILE) * s, ((VIEW_H - HUD_H) / TILE) * s);
}

export function drawBanner(ctx, g) {
  if (g.boss) {
    const e = g.boss;
    const w = 420, x = (VIEW_W - w) / 2, y = VIEW_H - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, y - 18, w + 8, 34);
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.info.boss.name.toUpperCase(), VIEW_W / 2, y - 4);
    ctx.fillStyle = '#400';
    ctx.fillRect(x, y + 2, w, 9);
    ctx.fillStyle = e.hp < e.maxHp * 0.4 ? '#ff3030' : '#d04020';
    ctx.fillRect(x, y + 2, w * Math.max(0, e.hp / e.maxHp), 9);
  }
  if (!g.banner) return;
  const a = Math.min(1, g.banner.t);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 150, VIEW_W, 60);
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillStyle = '#000';
  ctx.fillText(g.banner.text, VIEW_W / 2 + 2, 192);
  ctx.fillStyle = g.theme.accent;
  ctx.fillText(g.banner.text, VIEW_W / 2, 190);
  ctx.globalAlpha = 1;
}

// ---------- menus ----------

export function drawTitle(ctx, time, hiscores) {
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // torchlit stone backdrop
  for (let y = 0; y < VIEW_H; y += 32)
    for (let x = 0; x < VIEW_W; x += 64) {
      const off = (y / 32) % 2 ? 32 : 0;
      ctx.fillStyle = `rgba(80,70,60,${0.15 + hash(x, y) * 0.1})`;
      ctx.fillRect(x + off, y, 62, 30);
    }
  const grad = ctx.createRadialGradient(VIEW_W / 2, 220, 50, VIEW_W / 2, 220, 500);
  grad.addColorStop(0, 'rgba(255,140,40,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = 'center';
  ctx.font = 'bold 76px Georgia, serif';
  ctx.fillStyle = '#2a1a08';
  ctx.fillText('GAUNTLET', VIEW_W / 2 + 4, 174);
  const tg = ctx.createLinearGradient(0, 110, 0, 180);
  tg.addColorStop(0, '#fff2b0'); tg.addColorStop(0.5, '#f2c14e'); tg.addColorStop(1, '#a0601a');
  ctx.fillStyle = tg;
  ctx.fillText('GAUNTLET', VIEW_W / 2, 170);
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillStyle = '#d8d0c0';
  ctx.fillText('L E G E N D S', VIEW_W / 2, 220);
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillStyle = '#a89878';
  ctx.fillText('a fan-made remake', VIEW_W / 2, 248);

  // the four heroes
  const order = ['warrior', 'valkyrie', 'wizard', 'archer'];
  order.forEach((cls, i) => {
    const p = fakePlayer(cls, VIEW_W / 2 - 150 + i * 100, 320, time + i);
    drawPlayer(ctx, p, time);
  });

  if (Math.floor(time * 2) % 2) {
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('PRESS ATTACK TO BEGIN', VIEW_W / 2, 400);
  }
  ctx.font = '13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#b8b0a0';
  const lines = [
    'P1: WASD move · SPACE attack · E magic potion · SHIFT (hold) + attack = turbo',
    'P2: ARROWS move · ENTER attack · . (period) magic · RIGHT SHIFT + attack = turbo',
    'Gamepads: stick/d-pad move · A attack · B magic · X/RB + A = turbo  ·  Up to 4 players',
    'P / ESC pause · M mute · V toggle announcer',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 450 + i * 20));
  if (hiscores.length) {
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#f2c14e';
    ctx.fillText('HALL OF LEGENDS', VIEW_W / 2, 552);
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#ccc';
    hiscores.slice(0, 3).forEach((h, i) => ctx.fillText(`${i + 1}. ${h.name} — ${h.score} (level ${h.level})`, VIEW_W / 2, 570 + i * 16));
  }
}

function fakePlayer(cls, x, y, t) {
  const def = CLASSES[cls];
  return { def, cls, x, y, fx: 0, fy: 1, walk: t * 4, swing: 0, buffs: {}, invuln: 0, hurtFlash: 0, color: def.color, slot: -1 };
}

export function drawSelect(ctx, time, slots, countdown) {
  ctx.fillStyle = '#0c0a12';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillStyle = '#f2c14e';
  ctx.fillText('CHOOSE YOUR HERO', VIEW_W / 2, 70);
  ctx.font = '14px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Left/Right to choose · Attack to lock in · Magic to back out · Others press Attack to join', VIEW_W / 2, 98);

  const pw = 220, gap = 14, x0 = (VIEW_W - (pw * 4 + gap * 3)) / 2;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const x = x0 + s * (pw + gap), y = 130;
    const slot = slots[s];
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, pw, 400);
    ctx.strokeStyle = slot ? CLASSES[slot.cls].color : '#333';
    ctx.lineWidth = slot && slot.ready ? 4 : 2;
    ctx.strokeRect(x, y, pw, 400);
    ctx.lineWidth = 1;
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.fillText(`PLAYER ${s + 1}`, x + pw / 2, y + 28);
    if (!slot) {
      if (Math.floor(time * 2) % 2) { ctx.fillStyle = '#777'; ctx.fillText('PRESS ATTACK', x + pw / 2, y + 200); }
      continue;
    }
    const def = CLASSES[slot.cls];
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(Input.label(slot.source), x + pw / 2, y + 46);
    ctx.save();
    ctx.translate(x + pw / 2, y + 130);
    ctx.scale(3, 3);
    drawPlayer(ctx, fakePlayer(slot.cls, 0, 0, slot.ready ? time * 2 : 0), time);
    ctx.restore();
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillStyle = def.color;
    ctx.fillText(`◀ ${def.name.toUpperCase()} ▶`, x + pw / 2, y + 230);
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.fillText(def.blurb, x + pw / 2, y + 252);
    const stats = [
      ['Health', def.hp / 900], ['Strength', def.strength / 26], ['Armor', def.armor / 0.3],
      ['Magic', def.magic / 2], ['Speed', def.speed / 155], ['Shots', (def.shotDmg / def.shotCooldown) / 35],
    ];
    stats.forEach(([n, v], i) => {
      const sy = y + 276 + i * 18;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#999';
      ctx.fillText(n, x + 16, sy + 9);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 84, sy, 116, 10);
      ctx.fillStyle = def.color;
      ctx.fillRect(x + 84, sy, 116 * Math.min(1, v), 10);
      ctx.textAlign = 'center';
    });
    if (slot.ready) {
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#7f7';
      ctx.fillText('READY!', x + pw / 2, y + 390);
    }
  }
  if (countdown != null) {
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Entering the realm in ${Math.ceil(countdown)}...`, VIEW_W / 2, 580);
  }
}

export function drawOverlay(ctx, title, lines, accent = '#f2c14e') {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.fillStyle = accent;
  ctx.fillText(title, VIEW_W / 2, 220);
  ctx.font = '18px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ddd';
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 280 + i * 30));
}
