// Bootstrap + state machine: title -> select -> play <-> paused -> levelclear / gameover.

import { VIEW_W, VIEW_H, CLASS_ORDER, MAX_PLAYERS } from './config.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { initAudio, sfx, toggleMute, toggleVoice, say } from './audio.js';
import { drawWorld, drawHud, drawMinimap, drawBanner, drawTitle, drawSelect, drawOverlay } from './render.js';
import { levelInfo } from './level.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const input = new Input();
let game = null;
let state = 'title';
let stateT = 0;
let slots = [];       // character select: { source, cls, ready }
let countdown = null;
let clearInfo = null;
let toast = null;

const HISCORE_KEY = 'gl-remake-hiscores';
function loadScores() {
  try { return JSON.parse(localStorage.getItem(HISCORE_KEY)) || []; } catch { return []; }
}
function saveScores(g) {
  try {
    const list = loadScores();
    for (const p of g.allPlayers()) list.push({ name: p.name, score: p.score, level: g.levelNum });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(HISCORE_KEY, JSON.stringify(list.slice(0, 10)));
  } catch { /* storage unavailable */ }
}
let hiscores = loadScores();

function setState(s) { state = s; stateT = 0; }

function usedSources() { return slots.filter(Boolean).map((s) => s.source); }

function nextFreeClass(taken) {
  return CLASS_ORDER.find((c) => !taken.includes(c)) || CLASS_ORDER[0];
}

function updateTitle() {
  if (input.firstPressed('attack') || input.anyStart()) {
    initAudio();
    sfx.join();
    slots = [];
    const src = input.firstPressed('attack') || input.sources().find((id) => input.get(id).pressed.start);
    slots[0] = { source: src, cls: 'warrior', ready: false };
    countdown = null;
    setState('select');
  }
}

function updateSelect(dt) {
  const joiner = input.firstPressed('attack', usedSources());
  if (joiner && slots.filter(Boolean).length < MAX_PLAYERS) {
    const idx = [0, 1, 2, 3].find((i) => !slots[i]);
    slots[idx] = { source: joiner, cls: nextFreeClass(slots.filter(Boolean).map((s) => s.cls)), ready: false };
    sfx.join();
    countdown = null;
    return;
  }
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const s = slots[i];
    if (!s) continue;
    const inp = input.get(s.source);
    if (!s.ready) {
      const dir = (inp.pressed.right || inp.pressed.down ? 1 : 0) - (inp.pressed.left || inp.pressed.up ? 1 : 0);
      if (dir) {
        const k = CLASS_ORDER.indexOf(s.cls);
        s.cls = CLASS_ORDER[(k + dir + CLASS_ORDER.length) % CLASS_ORDER.length];
        sfx.select();
      }
      if (inp.pressed.attack) { s.ready = true; sfx.join(); say(CLASSES_NAME(s.cls), `pick${i}`, 500); }
      if (inp.pressed.magic) {
        slots[i] = null; countdown = null;
        if (!slots.some(Boolean)) setState('title');
      }
    } else if (inp.pressed.magic) {
      s.ready = false; countdown = null;
    }
  }
  const active = slots.filter(Boolean);
  if (active.length && active.every((s) => s.ready)) {
    if (countdown == null) countdown = 2;
    countdown -= dt;
    if (countdown <= 0) startGame();
  } else countdown = null;
}

function CLASSES_NAME(cls) { return cls[0].toUpperCase() + cls.slice(1); }

function startGame() {
  game = new Game();
  slots.forEach((s, i) => { if (s) game.addPlayer(i, s.source, s.cls); });
  game.startLevel(1);
  setState('play');
}

function updatePlay(dt) {
  if (input.key('Escape') || input.key('KeyP') || input.anyStart()) { setState('paused'); return; }

  // Drop-in join / continue
  const used = game.allPlayers().map((p) => p.source);
  const joiner = input.firstPressed('attack', used);
  if (joiner && game.allPlayers().length < MAX_PLAYERS) {
    const slot = [0, 1, 2, 3].find((i) => !game.players[i]);
    game.joinMidGame(slot, joiner, nextFreeClass(game.allPlayers().map((p) => p.cls)));
  }
  for (const p of game.allPlayers()) {
    if (!p.alive && p.deadT > 1.5 && input.get(p.source).pressed.attack) game.respawn(p);
  }

  game.update(dt, input);

  if (game.exitReached) {
    const info = levelInfo(game.levelNum);
    clearInfo = { level: game.levelNum, wasBoss: info.isBoss, realm: info.theme.name };
    setState('levelclear');
    return;
  }
  if (!game.livePlayers().length && game.allPlayers().every((p) => p.deadT > 2.5)) {
    saveScores(game);
    hiscores = loadScores();
    setState('gameover');
  }
}

function updateLevelClear() {
  if (stateT > 1 && (input.firstPressed('attack') || stateT > 6)) {
    const g = game;
    for (const p of g.allPlayers()) {
      if (!p.alive) { p.alive = true; p.hp = Math.floor(p.def.hp / 2); }
    }
    g.startLevel(g.levelNum + 1);
    setState('play');
  }
}

function updateGameOver() {
  if (stateT < 1.5) return;
  if (input.firstPressed('attack')) {
    // Continue: everyone revives and the level restarts. Scores are halved.
    for (const p of game.allPlayers()) {
      p.alive = true; p.hp = p.def.hp; p.score = Math.floor(p.score / 2); p.keys = 0;
    }
    game.startLevel(game.levelNum);
    setState('play');
  } else if (input.firstPressed('magic')) {
    setState('title');
    game = null;
  }
}

function render() {
  ctx.textBaseline = 'alphabetic';
  if (state === 'title') { drawTitle(ctx, stateT, hiscores); }
  else if (state === 'select') { drawSelect(ctx, stateT, slots, countdown); }
  else if (game) {
    drawWorld(ctx, game);
    drawBanner(ctx, game);
    drawMinimap(ctx, game);
    drawHud(ctx, game, input);
    if (state === 'paused') {
      drawOverlay(ctx, 'PAUSED', ['Press P / ESC / Start to resume', 'M: mute sound   V: toggle announcer', `Level ${game.levelNum} — ${game.theme.name}`]);
    } else if (state === 'levelclear') {
      const lines = clearInfo.wasBoss
        ? [`The guardian of the ${clearInfo.realm} has fallen!`, 'A new realm awaits...']
        : [`Level ${clearInfo.level} complete`, ''];
      for (const p of game.allPlayers()) lines.push(`${p.name}: ${p.score} pts · level ${p.lvl}`);
      if (stateT > 1) lines.push('', 'Press Attack to continue');
      drawOverlay(ctx, clearInfo.wasBoss ? 'REALM CONQUERED' : 'LEVEL CLEAR', lines, '#8fe0ff');
    } else if (state === 'gameover') {
      const lines = game.allPlayers().map((p) => `${p.name}: ${p.score} pts`);
      lines.push('', 'Attack: continue (restart level, half score)', 'Magic: return to title');
      drawOverlay(ctx, 'GAME OVER', lines, '#ff6060');
    }
  }
  if (toast) {
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, toast.t)})`;
    ctx.fillText(toast.text, VIEW_W - 12, VIEW_H - 140);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stateT += dt;
  input.poll();

  if (input.key('KeyM')) { initAudio(); toast = { text: toggleMute() ? 'Sound OFF' : 'Sound ON', t: 1.5 }; }
  if (input.key('KeyV')) { toast = { text: toggleVoice() ? 'Announcer ON' : 'Announcer OFF', t: 1.5 }; }
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  switch (state) {
    case 'title': updateTitle(); break;
    case 'select': updateSelect(dt); break;
    case 'play': updatePlay(dt); break;
    case 'paused':
      if (input.key('Escape') || input.key('KeyP') || input.anyStart()) setState('play');
      break;
    case 'levelclear': updateLevelClear(); break;
    case 'gameover': updateGameOver(); break;
  }
  render();
  requestAnimationFrame(frame);
}

// Debug/test hook (used by automated smoke tests).
window.__gl = { get game() { return game; }, get state() { return state; } };

// Scale canvas to fit window while keeping aspect ratio.
function fit() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
}
window.addEventListener('resize', fit);
fit();
requestAnimationFrame(frame);
