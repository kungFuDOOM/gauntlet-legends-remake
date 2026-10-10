// Bootstrap + state machine:
//   title -> (intro story) -> hero select -> realm map -> play <-> paused
//   play -> level clear -> shop -> realm map ... -> Skorne -> ending story -> ending

import { VIEW_W, VIEW_H, CLASS_ORDER, MAX_PLAYERS } from './config.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Tutorial, tutorialView } from './tutorial.js';
import { Game } from './game.js';
import { initAudio, sfx, toggleMute, toggleVoice, toggleMusic, playMusic, say, stopVoice, audioTap } from './audio.js';
import { Host, Guest, showCode } from './net.js';
import { SnapshotWriter, SnapshotReader, playSound, cleanUi, cleanEvents, cleanGame } from './netstate.js';
import { Lobby } from './lobby.js';
import { Renderer3D } from './render3d.js';
import { loadAssets } from './assets.js';
import { drawGameOverlay, drawLoading, drawTitle, drawSelect, drawOverlay, drawStory, drawRealmPick, drawShop, drawEnding, selectArrowAt, shopItemAt, realmStageAt, titleOnlineAt, setDevice, btn, titleShowcase, selectShowcase, storyShowcase, partyShowcase } from './hud.js';
import { realmOf, unlockedClasses, SECRET_HEROES, loadSave, writeSave, newSave, hasProgress, isUnlocked, levelNumber, nextStage, completeLevel, runeCount, TOTAL_RUNES, SHOP, buy, STORY } from './campaign.js';
import { levelInfo } from './level.js';

// Always load the newest version of the game after an update (see sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

const stage = document.getElementById('stage');
const hudCanvas = document.getElementById('hud');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
hudCanvas.width = VIEW_W * DPR;
hudCanvas.height = VIEW_H * DPR;
const ctx = hudCanvas.getContext('2d');
ctx.scale(DPR, DPR);
let r3d;
try {
  r3d = new Renderer3D(document.getElementById('webgl'));
} catch (err) {
  stage.style.display = 'none';
  document.getElementById('error').style.display = 'block';
  throw err;
}
let showMinimap = false;
try {
  const saved = Number(localStorage.getItem('gl-remake-pixels'));
  if (saved >= 0 && saved <= 2 && localStorage.getItem('gl-remake-pixels') !== null) r3d.setPixelation(saved);
} catch { /* storage unavailable */ }

const input = new Input();
input.touch = new TouchControls({
  onFirstTouch: (handheld) => {
    initAudio(); // phones only allow sound to start from a touch
    const el = document.documentElement;
    // phones and tablets go fullscreen landscape; a touchscreen laptop stays as it is
    if (handheld && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  },
  onMute: () => { initAudio(); toast = { text: toggleMute() ? 'Sound OFF' : 'Sound ON', t: 1.5, local: true }; },
});
// Taps and clicks on the screen itself (not the on-screen buttons), in game coordinates.
const taps = [];
window.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || (e.target.closest && e.target.closest('.btn, #rotate, #lobby, #online-bar'))) return;
  const r = stage.getBoundingClientRect();
  if (!r.width) return;
  taps.push({ x: (e.clientX - r.left) * VIEW_W / r.width, y: (e.clientY - r.top) * VIEW_H / r.height });
}, true);
let game = null;
let state = 'loading';
let loadProgress = 0;
let loadError = null;
loadAssets((p) => (loadProgress = p)).then(() => setState('title')).catch((err) => { loadError = err; console.error(err); });
let stateT = 0;
let slots = [];       // character select: { source, cls, ready }
let countdown = null;
let clearInfo = null;
let toast = null;
let tutorial = null;  // the Training Grounds lessons, while they're being played
let showControls = true; // the key-cap strip along the bottom (H toggles it)
try { showControls = localStorage.getItem('gl-remake-controls') !== 'off'; } catch { /* storage unavailable */ }
let magicHint = { t: 20, shown: 0 }; // reminders that magic exists

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

function setState(s) {
  if (window.__traceStates) console.log(`state ${state} -> ${s}`);
  if (s === 'title') input.split = false; // a new party starts with one keyboard player
  state = s; stateT = 0;
}

// A second player on the same keyboard joins with the 2 key: player 1 keeps WASD (and the
// touch controls) as 'kb1', the newcomer gets the arrow keys as 'kb2'. Returns true if the
// keyboard was split. `owners` are the slots or players holding input sources.
function splitKeyboard(owners) {
  const kbOwner = owners.find((o) => o && o.source === 'kb');
  if (input.split || !kbOwner || !input.key('Digit2')) return false;
  input.split = true;
  kbOwner.source = 'kb1';
  return true;
}

// Undo the split once only one keyboard player is left.
function unsplitKeyboard(owners) {
  if (!input.split) return;
  const kbOwners = owners.filter((o) => o && (o.source === 'kb1' || o.source === 'kb2'));
  if (kbOwners.length > 1) return;
  input.split = false;
  if (kbOwners[0]) kbOwners[0].source = 'kb';
}

function usedSources() { return slots.filter(Boolean).map((s) => s.source); }

function nextFreeClass(taken) {
  const pool = unlockedClasses(save.progress);
  return pool.find((c) => !taken.includes(c)) || pool[0];
}

// ---------- quest save ----------

let save = loadSave();
// Saves the quest and the heroes of the players on this machine (online guests' heroes are
// theirs for the session only, so they never overwrite the host's saved heroes).
function persist() {
  if (game) for (const p of game.allPlayers()) if (!isNet(p.source)) save.heroes[p.cls] = game.heroSave(p);
  writeSave(save);
}
let story = null;     // { lines, idx, t, next }
let shop = [];        // per player slot: { idx, done }

function showStory(lines, next) {
  story = { lines, idx: 0, t: 0, next };
  say(lines[0], `story${lines[0].length}`, 0);
  setState('story');
}

function updateStory(dt) {
  story.t += dt;
  const line = story.lines[story.idx];
  const shown = Math.floor(story.t * 45);
  const any = (b) => input.firstPressed(b) || (b === 'attack' && input.anyStart());
  if (anyBack()) { stopVoice(); story.next(); return; }
  if (any('attack')) {
    if (shown < line.length) { story.t = line.length / 45 + 0.01; return; }
    story.idx++;
    story.t = 0;
    if (story.idx >= story.lines.length) { story.next(); return; }
    say(story.lines[story.idx], `story${story.lines[story.idx].length}`, 0);
  }
}

// ---------- title ----------

// On the title screen almost any key starts (people try A, Enter, Space...), except the
// ones that do something else there.
const TITLE_IGNORE = /^(Key[EGMNVXPO]|Period|NumpadDecimal|Quote|Tab|Escape|F\d+|Meta|Alt|Control|OS|ContextMenu|CapsLock)/;

function updateTitle() {
  // the PLAY ONLINE button: tap or click it, or press O
  if (!net && !lobby.isOpen && (input.key('KeyO') || taps.some((t) => titleOnlineAt(t.x, t.y)))) { initAudio(); sfx.select(); lobby.open(); return; }
  if (lobby.isOpen) { if (input.key('Escape')) lobby.close(); return; } // don't start the game under the panel
  // Only players on this machine act here: online guests must never start a new quest
  // (it wipes the save) or start the host's game for them.
  const guests = [...input.remote.keys()];
  const anyKey = input.frameGlobal && [...input.frameGlobal].some((k) => !TITLE_IGNORE.test(k));
  const atk = input.firstPressed('attack', guests) || input.sources().find((id) => !isNet(id) && input.get(id).pressed.start) || (anyKey && 'kb');
  if (input.firstPressed('magic', guests) && hasProgress(save)) { initAudio(); setState('confirm'); return; }
  if (atk) {
    initAudio();
    sfx.join();
    const begin = () => { slots = [{ source: atk, cls: 'warrior', ready: false }]; countdown = null; setState('select'); };
    if (!save.progress.seenIntro) {
      showStory(STORY.intro, () => { save.progress.seenIntro = true; writeSave(save); begin(); });
    } else begin();
  }
}

function updateConfirm() {
  // wiping the save: the host's own players only
  if (input.firstPressed('attack', [...input.remote.keys()])) { save = newSave(); writeSave(save); toast = { text: 'A new quest begins', t: 2, local: true }; setState('title'); }
  else if (input.sources().some((id) => !isNet(id) && backPressed(id))) setState('title');
}

// ---------- hero select ----------

function cycleClass(s, dir) {
  const pool = unlockedClasses(save.progress);
  const k = Math.max(0, pool.indexOf(s.cls));
  s.cls = pool[(k + dir + pool.length) % pool.length];
  sfx.select();
}

function updateSelect(dt) {
  for (const t of taps) {
    const hit = selectArrowAt(t.x, t.y);
    const s = hit && slots[hit.slot];
    if (s && !s.ready) { initAudio(); cycleClass(s, hit.dir); countdown = null; }
  }
  const full = slots.filter(Boolean).length >= MAX_PLAYERS;
  if (!full && splitKeyboard(slots)) {
    const idx = [0, 1, 2, 3].find((i) => !slots[i]);
    slots[idx] = { source: 'kb2', cls: nextFreeClass(slots.filter(Boolean).map((s) => s.cls)), ready: false };
    sfx.join();
    countdown = null;
    return;
  }
  const joiner = input.firstPressed('attack', usedSources());
  if (joiner && !full) {
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
      if (dir) cycleClass(s, dir);
      if (inp.pressed.attack) { s.ready = true; sfx.join(); say(CLASSES_NAME(s.cls), `pick${i}`, 500); }
      if (backPressed(s.source)) {
        slots[i] = null; countdown = null;
        unsplitKeyboard(slots);
        if (!slots.some(Boolean)) setState('title');
      }
    } else if (backPressed(s.source)) {
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
  // online guests start with fresh heroes; players here continue their saved ones
  slots.forEach((s, i) => { if (s) game.addPlayer(i, s.source, s.cls, isNet(s.source) ? null : save.heroes[s.cls]); });
  if (!save.progress.tutorialDone) startTutorial();
  else openMap();
}

// ---------- the Training Grounds (first-time tutorial) ----------

function startTutorial() {
  game.startTutorial();
  tutorial = new Tutorial(game, input.touch);
  setState('play');
}

function finishTutorial(skipped = false) {
  save.progress.tutorialDone = true;
  tutorial = null;
  persist();
  toast = { text: skipped ? 'Training skipped' : 'Training complete! Choose a realm.', t: 2.5 };
  openHub();
}

// ---------- the hub ----------

let realmPick = null; // { realm, stage } while choosing a stage at a portal

function openHub(fromRealm = null) {
  for (const p of game.allPlayers()) { p.alive = true; p.hp = Math.max(p.hp, p.def.hp); }
  game.underworldSealed = !isUnlocked(save.progress, 3, 1);
  game.startHub(fromRealm);
  setState('play');
}
const openMap = () => openHub();

// "Back" in menus: Esc on the keyboard ('.' for a second keyboard player), B on a gamepad,
// MAGIC on the touch screen. (E is the magic key in play, which made a poor exit key.)
const isKb = (src) => src === 'kb' || src === 'kb1' || src === 'kb2';
function backPressed(src) {
  if (!isKb(src)) return !!input.get(src).pressed.magic;
  if (src === 'kb2') return input.key('Period') || input.key('NumpadDecimal');
  return input.key('Escape') || input.key('Backspace') || (input.lastDevice === 'touch' && !!input.get(src).pressed.magic);
}
const anyBack = () => input.sources().some(backPressed);
const partyBack = () => partySources().some(backPressed);

function partySources() { return game ? game.allPlayers().map((p) => p.source) : []; }
function partyPressed(btn) { return partySources().some((src) => input.get(src).pressed[btn]); }

// In the hub, Attack at a portal picks a stage; at the merchant it opens the shop.
function updateHubActions() {
  const f = game.hubFocus;
  if (!f || !partyPressed('attack')) return;
  if (f.type === 'shop') {
    shop = game.players.map((p) => (p ? { idx: 0, done: false } : null));
    setState('shop');
    return;
  }
  if (f.realm === 3 && game.underworldSealed) { sfx.hurt(); toast = { text: 'Sealed! Defeat the three guardians first', t: 2 }; return; }
  const next = nextStage(save.progress);
  let stage = 1;
  for (let s = 1; s <= 4; s++) if (isUnlocked(save.progress, f.realm, s) && !save.progress.completed[levelNumber(f.realm, s)]) { stage = s; break; }
  if (next.realm === f.realm) stage = next.stage;
  realmPick = { realm: f.realm, stage };
  sfx.select();
  setState('realm');
}

function updateRealmPick() {
  // tapping a stage picks it, tapping it again enters
  let enter = false;
  for (const t of taps) {
    const s = realmStageAt(t.x, t.y);
    if (!s) continue;
    initAudio();
    if (s === realmPick.stage) enter = true;
    else { realmPick.stage = s; sfx.select(); }
  }
  if (partyPressed('up')) { realmPick.stage = Math.max(1, realmPick.stage - 1); sfx.select(); }
  if (partyPressed('down')) { realmPick.stage = Math.min(4, realmPick.stage + 1); sfx.select(); }
  if (partyBack()) { setState('play'); return; }
  if (enter || partyPressed('attack')) {
    const { realm, stage } = realmPick;
    if (!isUnlocked(save.progress, realm, stage)) { sfx.hurt(); toast = { text: 'Clear the previous stage first', t: 1.8 }; return; }
    const go = () => {
      for (const p of game.allPlayers()) { p.alive = true; p.hp = Math.max(p.hp, p.def.hp); }
      game.startLevel(levelNumber(realm, stage));
      setState('play');
    };
    if (!save.progress.seenRealm[realm]) {
      save.progress.seenRealm[realm] = true;
      writeSave(save);
      showStory(STORY.realms[realm], go);
    } else go();
  }
}

// ---------- online play ----------
// One player hosts: their browser runs the game and streams it to up to three guests, whose
// button presses come back as extra input sources ('net1', 'net2', ...) that join like
// gamepads. Guests draw what the host sends. See net.js (connection) and netstate.js (state).

let net = null; // host: { role, link, code, writer, fx, sendT } · guest: { role, link, code, me, reader, ui }
function isNet(src) { return src.startsWith('net'); }
const lobby = new Lobby({
  onHost: hostOnline,
  onJoin: joinOnline,
  onLeave: () => leaveOnline('You left the online game.'),
  onKick: (id) => { if (net && net.role === 'host') net.link.kick(id); },
  onNewCode: () => {
    if (!net || net.role !== 'host') return;
    const link = net.link;
    link.newCode().then((code) => {
      if (!net || net.link !== link) return;
      net.code = code;
      toast = { text: `New room code: ${showCode(code)} (the old one no longer works)`, t: 4, local: true };
    }).catch((err) => { toast = { text: err.message, t: 3, local: true }; });
  },
  onLock: () => {
    if (!net || net.role !== 'host') return;
    net.link.locked = !net.link.locked;
    toast = { text: net.link.locked ? 'Room locked: no new players can join' : 'Room unlocked', t: 2.5, local: true };
  },
});

// How the host's room bar names each online player ("P2", or "guest" before they pick a hero).
function guestList() {
  return net.link.guests.map((id) => {
    const i = game ? game.players.findIndex((p) => p && p.source === id) : slots.findIndex((x) => x && x.source === id);
    return { id, label: i >= 0 ? `P${i + 1}` : 'guest' };
  });
}

async function hostOnline() {
  initAudio();
  const link = new Host({
    onJoin: (id) => {
      input.remote.set(id, { held: {}, acc: {} });
      sfx.join();
      toast = { text: 'A friend connected! They press Attack to join in.', t: 3.5, local: true };
    },
    onLeave: (id) => dropGuest(id),
    onInput: (id, m) => input.remoteInput(id, m),
    onError: (text) => { toast = { text, t: 3, local: true }; },
  });
  try {
    const code = await link.start();
    net = { role: 'host', link, code, writer: new SnapshotWriter(), fx: [], sendT: 0 };
    audioTap.fn = (ev) => { if (net && net.role === 'host' && net.link.count) net.fx.push(ev); };
    toast = { text: `You're hosting! Room code: ${showCode(code)}`, t: 5, local: true };
  } catch (err) {
    lobby.say(err.message);
    link.close();
  }
}

// An online guest disconnected: their hero leaves the party.
function dropGuest(id) {
  input.remote.delete(id);
  const i = slots.findIndex((s) => s && s.source === id);
  if (i >= 0) {
    slots[i] = null;
    countdown = null;
    if (state === 'select' && !slots.some(Boolean)) setState('title');
  }
  if (game) for (const p of game.allPlayers()) if (p.source === id) game.players[p.slot] = undefined;
  toast = { text: 'An online player left', t: 2.5 };
}

async function joinOnline(code) {
  initAudio();
  const link = new Guest({ onMessage: guestMessage, onClose: (reason) => leaveOnline(reason) });
  try {
    const me = await link.join(code);
    net = { role: 'guest', link, code: code.toUpperCase(), me, reader: new SnapshotReader(Game), ui: {}, sendT: 0, joinedAt: performance.now() };
    Input.me = me;
    game = null; tutorial = null; story = null; slots = [];
    toast = { text: 'Connected! Press Attack to join the party.', t: 4, local: true };
  } catch (err) {
    lobby.say(err.message);
    link.close();
  }
}

function leaveOnline(reason) {
  if (!net) return;
  const was = net;
  net = null;
  was.link.close();
  if (was.role === 'host') {
    audioTap.fn = null;
    for (const id of [...input.remote.keys()]) dropGuest(id);
    if (game) game.fx = null;
  } else {
    game = null; story = null; tutorial = null; slots = [];
    setState('title');
  }
  input.remote.clear();
  Input.me = null;
  if (reason) toast = { text: reason, t: 4, local: true };
}

// Host: about 20 times a second, send every guest the screen state and the game.
function hostSend(dt) {
  const live = net.link.count > 0;
  if (game) game.fx = live ? game.fx || [] : null;
  net.sendT -= dt;
  if (!live || net.sendT > 0) return;
  net.sendT = 0.05;
  const fx = net.fx.concat(game && game.fx ? game.fx : []);
  net.fx = [];
  if (game && game.fx) game.fx = [];
  const ui = {
    slots, cd: countdown, rp: realmPick, shop, ci: clearInfo,
    story: story && state === 'story' ? { lines: story.lines, idx: story.idx, t: story.t } : null,
    toast: toast && !toast.local ? toast.text : null,
    prog: save.progress, heroes: state === 'select' ? save.heroes : null,
    tut: tutorial ? [tutorial.idx, tutorial.doneT > 0 ? 1 : 0] : null,
  };
  net.link.send({ t: 's', st: state, stT: Math.round(stateT * 100) / 100, ui, g: game ? net.writer.game(game) : null, fx });
}

// Guest: apply what the host sent (all of it checked first: see netstate.js).
function guestMessage(m) {
  if (!net || m.t !== 's') return;
  try {
    const ui = cleanUi(m.st, m.ui, !!cleanGame(m.g));
    if (!ui) return; // malformed, or a screen without the data it needs: ignore it
    net.heardAt = performance.now();
    // keep our own clock for the screen's animations; only resync when it drifts
    const stT = Math.min(1e5, Math.max(0, Number(m.stT) || 0));
    if (state !== m.st || Math.abs(stateT - stT) > 0.5) stateT = stT;
    state = m.st;
    net.ui = ui;
    slots = ui.slots;
    countdown = ui.cd;
    realmPick = ui.rp;
    shop = ui.shop;
    clearInfo = ui.ci;
    story = ui.story ? { ...ui.story, next() {} } : null;
    if (ui.toast && ui.toast !== net.lastToast) toast = { text: ui.toast, t: 2.5, local: true };
    net.lastToast = ui.toast;
    game = net.reader.apply(m.g, m.fx);
    if (!m.g) for (const ev of cleanEvents(m.fx)) playSound(ev);
  } catch (err) {
    console.error(err);
    leaveOnline('The host sent something this game could not read.');
  }
}

// Guest: everything on this device (keys, touch, gamepad) drives this guest's one hero.
function guestFrame(dt) {
  // a host that goes silent (gone, or hostile) doesn't leave us stuck on its last screen
  if (performance.now() - (net.heardAt || net.joinedAt) > 15000) { leaveOnline('Lost the connection to the host.'); return; }
  let x = 0, y = 0, a = false, mg = false, u = false, st = false;
  for (const s of Object.values(input.state)) {
    if (!x && !y) { x = s.x; y = s.y; }
    a = a || s.attack; mg = mg || s.magic; u = u || s.turbo; st = st || s.pressed.start;
  }
  // Esc backs out of menus and pauses during play, as it does for the host
  const menu = ['select', 'story', 'realm', 'shop', 'gameover', 'confirm', 'levelclear'].includes(state);
  if (input.key('Escape') || input.key('Backspace')) { if (menu) mg = true; else st = true; }
  if (input.key('KeyP')) st = true;
  // pausing always shows this guest the Leave button for a while, even if the host
  // doesn't pause, so a guest can never be stuck in someone's game
  if (st) net.menuUntil = performance.now() + 5000;
  // tapping the arrows on your own hero card
  if (state === 'select') {
    for (const t of taps) {
      const hit = selectArrowAt(t.x, t.y);
      if (hit && slots[hit.slot] && slots[hit.slot].source === net.me) x = hit.dir;
    }
  }
  // tapping a stage at a portal: the same, for the party's shared choice
  if (state === 'realm' && realmPick) {
    for (const t of taps) {
      const s = realmStageAt(t.x, t.y);
      if (!s) continue;
      if (s === realmPick.stage) a = true;
      else { x = 0; y = s < realmPick.stage ? -1 : 1; }
    }
  }
  // tapping in the shop: a tap on your chosen item buys it, a tap on another steps toward it
  if (state === 'shop' && game) {
    const ps = game.allPlayers();
    for (const t of taps) {
      const hit = shopItemAt(t.x, t.y, ps.length);
      const p = hit && ps[hit.i];
      const c = p && p.source === net.me && shop && shop[p.slot];
      if (!c || c.done) continue;
      if (c.idx === hit.k) a = true;
      else { x = 0; y = hit.k < c.idx ? -1 : 1; }
    }
  }
  const pkt = { t: 'i', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: a ? 1 : 0, m: mg ? 1 : 0, u: u ? 1 : 0, s: st ? 1 : 0 };
  const key = `${pkt.x},${pkt.y},${pkt.a}${pkt.m}${pkt.u}${pkt.s}`;
  net.sendT -= dt;
  if (key !== net.lastPkt || net.sendT <= 0) { net.link.send(pkt); net.lastPkt = key; net.sendT = 0.1; }
  if (net.reader.game) net.reader.tick(dt);
}

// ---------- playing ----------

// When someone is swamped or nearly dead and still has a potion, remind them about magic
// (a few times per session, so it doesn't nag).
function updateMagicHint(dt) {
  magicHint.t -= dt;
  if (magicHint.t > 0 || magicHint.shown >= 4) return;
  for (const p of game.livePlayers()) {
    if (p.potions <= 0) continue;
    const crowd = game.enemies.filter((e) => game.onScreen(e)).length;
    if (crowd < 12 && p.hp > 160) continue;
    game.text(p.x, p.y - 40, `${btn('magic', p.source).toUpperCase()}: MAGIC!`, '#c9a0ff', 2.5);
    toast = { text: `${p.name}: press ${btn('magic', p.source)} to use magic — it hits every monster on screen!`, t: 3.5 };
    if (input.touch) input.touch.pulse('magic');
    magicHint = { t: 45, shown: magicHint.shown + 1 };
    return;
  }
}

// Start pressed by anyone; an online guest can only pause or resume once a second, so one
// can't keep flipping the game in and out of pause.
const netPauseAt = new Map();
function startPressed() {
  for (const id of input.sources()) {
    if (!input.get(id).pressed.start) continue;
    if (!isNet(id)) return true;
    const now = performance.now();
    if (now - (netPauseAt.get(id) || -1e9) < 1000) continue;
    netPauseAt.set(id, now);
    return true;
  }
  return false;
}

function updatePlay(dt) {
  if (input.key('Escape') || input.key('KeyP') || startPressed()) { setState('paused'); return; }

  // Drop-in join / continue
  const used = game.allPlayers().map((p) => p.source);
  const roomy = game.allPlayers().length < MAX_PLAYERS;
  const joiner = roomy && splitKeyboard(game.allPlayers()) ? 'kb2' : input.firstPressed('attack', used);
  if (joiner && roomy) {
    const slot = [0, 1, 2, 3].find((i) => !game.players[i]);
    const cls = nextFreeClass(game.allPlayers().map((p) => p.cls));
    game.joinMidGame(slot, joiner, cls, isNet(joiner) ? null : save.heroes[cls]);
  }
  for (const p of game.allPlayers()) {
    if (!p.alive && p.deadT > 1.5 && input.get(p.source).pressed.attack) game.respawn(p);
  }

  game.update(dt, input);
  if (game.level.hub) { updateHubActions(); return; }
  if (game.level.tutorial) {
    if (tutorial) tutorial.update(dt);
    if (game.exitReached) finishTutorial();
    return;
  }
  updateMagicHint(dt);

  if (game.exitReached && game.level.treasure) {
    // treasure room over: back to the hub with the loot
    persist();
    toast = { text: 'Treasure room complete!', t: 2 };
    openHub(realmOf(clearInfo.level));
    return;
  }
  if (game.exitReached) {
    const n = game.levelNum;
    const info = levelInfo(n);
    const runesBefore = runeCount(save.progress);
    const unlockedBefore = unlockedClasses(save.progress);
    completeLevel(save.progress, n, game.runesFound);
    const fresh = unlockedClasses(save.progress).filter((c) => !unlockedBefore.includes(c));
    for (const c of fresh) say(`A secret hero joins the legend: the ${c}!`, `unlock${c}`, 0);
    persist();
    clearInfo = { level: n, wasBoss: info.isBoss, realm: info.theme.name, name: info.stageName, newRunes: runeCount(save.progress) - runesBefore, unlocked: fresh, hidden: game.level.items.some((i) => i.type === 'rune' && i.sub === 'hidden') };
    if (save.progress.won && n === levelNumber(3, 4)) {
      saveScores(game);
      hiscores = loadScores();
      showStory(STORY.ending, () => setState('ending'));
      return;
    }
    setState('levelclear');
    return;
  }
  if (!game.livePlayers().length && game.allPlayers().every((p) => p.deadT > 2.5)) {
    persist();
    saveScores(game);
    hiscores = loadScores();
    setState('gameover');
  }
}

function updateLevelClear() {
  if (stateT > 1 && (input.firstPressed('attack') || stateT > 8)) {
    for (const p of game.allPlayers()) {
      if (!p.alive) { p.alive = true; p.hp = Math.floor(p.def.hp / 2); }
    }
    // beating a guardian earns a treasure room before the shop
    if (clearInfo.wasBoss && realmOf(clearInfo.level) < 3) {
      game.startTreasure(realmOf(clearInfo.level));
      setState('play');
      return;
    }
    openHub(realmOf(clearInfo.level));
  }
}

function updateShop() {
  let allDone = true;
  const ps = game.allPlayers();
  // tapping an item picks it, tapping it again buys it (touch screens, this device's heroes)
  for (const t of taps) {
    const hit = shopItemAt(t.x, t.y, ps.length);
    const p = hit && ps[hit.i];
    const c = p && !isNet(p.source) && shop[p.slot];
    if (!c || c.done) continue;
    initAudio();
    if (c.idx === hit.k) shopBuy(p, c);
    else { c.idx = hit.k; sfx.select(); }
  }
  for (const p of ps) {
    const c = shop[p.slot] || (shop[p.slot] = { idx: 0, done: false });
    const inp = input.get(p.source);
    if (!c.done) {
      if (inp.pressed.up) { c.idx = (c.idx + SHOP.length - 1) % SHOP.length; sfx.select(); }
      if (inp.pressed.down) { c.idx = (c.idx + 1) % SHOP.length; sfx.select(); }
      // a solo hero's shop has two columns: left/right hop between them
      if (ps.length === 1 && (inp.pressed.left || inp.pressed.right)) { c.idx = (c.idx + SHOP.length / 2) % SHOP.length; sfx.select(); }
      if (inp.pressed.attack) shopBuy(p, c);
      if (backPressed(p.source)) { c.done = true; sfx.join(); }
    } else if (backPressed(p.source)) c.done = false;
    allDone = allDone && c.done;
  }
  if (allDone && stateT > 0.5) { persist(); setState('play'); }
}

function shopBuy(p, c) {
  const item = SHOP[c.idx];
  if (item.id === 'done') { c.done = true; sfx.join(); }
  else if (buy(p, item)) { sfx.gold(); c.flash = 0.4; }
  else { sfx.hurt(); c.deny = 0.4; }
}

function updateGameOver() {
  if (stateT < 1.5) return;
  if (input.firstPressed('attack')) {
    // Continue: everyone revives and the level restarts.
    for (const p of game.allPlayers()) {
      p.alive = true; p.hp = p.def.hp; p.score = Math.floor(p.score / 2); p.keys = 0;
    }
    game.startLevel(game.levelNum);
    setState('play');
  } else if (anyBack()) {
    for (const p of game.allPlayers()) { p.alive = true; p.hp = p.def.hp; p.keys = 0; }
    openHub(game.levelNum ? realmOf(game.levelNum) : null);
  }
}

function updateEnding() {
  if (stateT > 3 && (input.firstPressed('attack') || input.anyStart())) { persist(); game = null; setState('title'); }
}

// Background music for whatever is on screen.
function currentTrack() {
  if (state === 'shop') return 'shop';
  if (game && game.level && game.level.hub) return 'castle';
  if (state === 'ending') return 'victory';
  if ((state === 'play' || state === 'paused' || state === 'levelclear' || state === 'gameover') && game && game.level) {
    if (game.level.treasure) return 'treasure';
    if (game.info.isBoss) return 'boss';
    return game.info.style;
  }
  return 'title';
}

function render() {
  ctx.textBaseline = 'alphabetic';
  // an online guest shows the host's quest
  const guest = net && net.role === 'guest';
  const progress = guest ? net.ui.prog || save.progress : save.progress;
  const heroes = guest ? net.ui.heroes || {} : save.heroes;
  if (state === 'loading') {
    drawLoading(ctx, loadProgress, loadError);
  } else if (state === 'title' || state === 'confirm') {
    r3d.renderShowcase(titleShowcase(stateT), stateT);
    drawTitle(ctx, stateT, hiscores, hasProgress(save) ? save.progress : null, !net && state === 'title');
    if (guest) drawOverlay(ctx, `ROOM ${showCode(net.code)}`, ['Connected! Waiting for the host to start...', `Press ${btn('attack')} to join the party`], '#8fe0ff');
    if (state === 'confirm') drawOverlay(ctx, 'NEW QUEST?', ['Your saved heroes and Rune Stones will be lost.', '', `${btn('attack')}: start over        ${btn('back')}: keep my quest`], '#ffb060');
  } else if (state === 'story') {
    r3d.renderShowcase(storyShowcase(stateT, game), stateT);
    drawStory(ctx, story, stateT);
  } else if (state === 'select') {
    r3d.renderShowcase(selectShowcase(slots, stateT), stateT);
    drawSelect(ctx, stateT, slots, countdown, heroes);
  } else if (state === 'shop') {
    r3d.render(game);
    drawShop(ctx, stateT, game, shop);
  } else if (state === 'realm') {
    r3d.render(game);
    drawGameOverlay(ctx, game, r3d, { runes: runeCount(progress), hubPrompt: false });
    drawRealmPick(ctx, stateT, progress, realmPick);
  } else if (state === 'ending') {
    r3d.renderShowcase(partyShowcase(game, stateT, true, true), stateT);
    drawEnding(ctx, stateT, game, progress);
  } else if (game) {
    r3d.render(game);
    drawGameOverlay(ctx, game, r3d, {
      minimap: showMinimap && !game.level.hub && !game.level.tutorial,
      runes: game.level.tutorial ? null : runeCount(progress) + game.runesFound.length,
      tutorial: !game.level.tutorial ? null
        : tutorial ? tutorial.view(btn, input.lastDevice)
          : guest && net.ui.tut ? tutorialView(net.ui.tut[0], !!net.ui.tut[1], btn, input.lastDevice) : null,
      controls: showControls && input.lastDevice !== 'touch' && state === 'play',
    });
    if (state === 'paused') {
      const resume = { touch: 'Tap II to resume', pad: 'Press Start to resume', keys: 'Press Esc to resume' }[input.lastDevice];
      const quit = input.lastDevice === 'keys' ? 'Q' : btn('magic');
      const lines = [resume];
      if (guest) lines.push('(only the host can quit)');
      else lines.push(game.level.tutorial ? `${quit}: skip the training` : `${quit}: save and quit to title`);
      if (game.level.hub && input.lastDevice === 'keys' && !guest) lines.push('T: replay the training');
      if (input.lastDevice === 'keys') lines.push('M: mute   N: music   V: announcer   TAB: map   X: pixel size');
      drawOverlay(ctx, 'PAUSED', [...lines, `${game.info.stageName} — ${game.theme.name}`]);
    } else if (state === 'levelclear') {
      const lines = clearInfo.wasBoss
        ? [`The guardian of the ${clearInfo.realm} has fallen!`, '']
        : [`${clearInfo.name} complete`, clearInfo.newRunes ? 'You recovered a hidden Rune Stone!' : clearInfo.hidden ? 'A hidden Rune Stone lies somewhere in this level...' : '', ''];
      for (const p of game.allPlayers()) lines.push(`${p.name}: level ${p.lvl} · ${p.gold} gold`);
      lines.push('', `Rune Stones: ${runeCount(progress)} / ${TOTAL_RUNES}`);
      for (const c of clearInfo.unlocked || []) lines.push(`SECRET HERO UNLOCKED: ${c.toUpperCase()}!`);
      if (stateT > 1) lines.push(clearInfo.wasBoss && clearInfo.level < 16 ? `Press ${btn('attack')} to enter the Treasure Room!` : `Press ${btn('attack')} to return to the hub`);
      drawOverlay(ctx, clearInfo.wasBoss ? 'GUARDIAN DEFEATED' : 'LEVEL COMPLETE', lines, '#8fe0ff');
    } else if (state === 'gameover') {
      const lines = game.allPlayers().map((p) => `${p.name}: level ${p.lvl} · ${p.score} pts`);
      lines.push('', `${btn('attack')}: continue (restart this level)`, `${btn('back')}: retreat to the hub`);
      drawOverlay(ctx, 'GAME OVER', lines, '#ff6050');
    }
  }
  if (toast) {
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, toast.t)})`;
    ctx.fillRect(VIEW_W / 2 - 200, VIEW_H - 172, 400, 30);
    ctx.fillStyle = `rgba(255,240,200,${Math.min(1, toast.t)})`;
    ctx.fillText(toast.text, VIEW_W / 2, VIEW_H - 152);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stateT += dt;
  input.poll();
  setDevice(input.lastDevice);

  if (input.key('KeyM')) { initAudio(); toast = { text: toggleMute() ? 'Sound OFF' : 'Sound ON', t: 1.5, local: true }; }
  if (input.key('Tab')) showMinimap = !showMinimap;
  if (input.key('KeyH')) {
    showControls = !showControls;
    toast = { text: showControls ? 'Controls shown' : 'Controls hidden (H to show)', t: 1.5, local: true };
    try { localStorage.setItem('gl-remake-controls', showControls ? 'on' : 'off'); } catch { /* storage unavailable */ }
  }
  if (input.key('KeyX')) {
    const level = (r3d.pixelLevel + 1) % 3;
    toast = { text: r3d.setPixelation(level), t: 1.5, local: true };
    try { localStorage.setItem('gl-remake-pixels', String(level)); } catch { /* storage unavailable */ }
  }
  if (input.key('KeyV')) { toast = { text: toggleVoice() ? 'Announcer ON' : 'Announcer OFF', t: 1.5, local: true }; }
  if (input.key('KeyN')) { initAudio(); toast = { text: toggleMusic() ? 'Music ON' : 'Music OFF', t: 1.5, local: true }; }
  playMusic(currentTrack());
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  lobby.update(state, net && (net.role === 'host'
    ? { role: 'host', code: net.code, players: net.link.count, guests: guestList(), locked: net.link.locked }
    : { role: 'guest', code: net.code, menu: performance.now() < (net.menuUntil || 0) }));
  if (net && net.role === 'guest') {
    guestFrame(dt);
    taps.length = 0;
    render();
    return;
  }

  switch (state) {
    case 'title': updateTitle(); break;
    case 'confirm': updateConfirm(); break;
    case 'story': updateStory(dt); break;
    case 'select': updateSelect(dt); break;
    case 'realm': updateRealmPick(); break;
    case 'shop': updateShop(); break;
    case 'ending': updateEnding(); break;
    case 'play': updatePlay(dt); break;
    case 'paused':
      if (input.key('Escape') || input.key('KeyP') || startPressed()) setState('play');
      // quit: Q on the keyboard (Esc resumes), B on a gamepad, MAGIC on the touch screen
      // (online guests can pause and resume, but only the host's own players can quit)
      else if (input.key('KeyQ') || partySources().some((src) => !isNet(src) && (!isKb(src) || input.lastDevice === 'touch') && input.get(src).pressed.magic)) {
        if (game.level.tutorial) finishTutorial(true);
        else { persist(); game = null; setState('title'); }
      } else if (input.key('KeyT') && game.level.hub) startTutorial();
      break;
    case 'levelclear': updateLevelClear(); break;
    case 'gameover': updateGameOver(); break;
  }
  if (net && net.role === 'host') hostSend(dt);
  taps.length = 0;
  render();
}

// Keep the loop alive even if a frame throws; report each distinct error once.
const reported = new Set();
function loop(now) {
  try { frame(now); } catch (err) {
    if (!reported.has(err.message)) { reported.add(err.message); console.error(err); }
  }
  requestAnimationFrame(loop);
}

// Debug/test hook (used by automated smoke tests).
window.__gl = { get net() { return net; }, get game() { return game; }, get state() { return state; }, get slots() { return slots; }, get tutorial() { return tutorial; }, get r3d() { return r3d; } };

// Scale canvas to fit window while keeping aspect ratio.
function fit() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  stage.style.width = `${Math.floor(VIEW_W * s)}px`;
  stage.style.height = `${Math.floor(VIEW_H * s)}px`;
}
window.addEventListener('resize', fit);
fit();
requestAnimationFrame(loop);
