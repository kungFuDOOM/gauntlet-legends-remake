// The quest: realm/stage unlocking, Rune Stones, the shop, saved heroes and the story text.
// Pure data + functions (localStorage access is wrapped), so it can be unit tested.

export const REALMS = 4;
export const STAGES = 4; // three levels and a guardian per realm
export const TOTAL_RUNES = REALMS * STAGES; // a hidden stone in every level + one per guardian

const SAVE_KEY = 'gl-remake-save';

export const levelNumber = (realm, stage) => realm * STAGES + stage; // stage is 1-based
export const realmOf = (n) => Math.floor((n - 1) / STAGES);
export const stageOf = (n) => ((n - 1) % STAGES) + 1;

export function newSave() {
  return { progress: { completed: {}, runes: {}, seenIntro: false, seenRealm: {}, won: false }, heroes: {} };
}

export function loadSave(storage = globalThis.localStorage) {
  try {
    const d = JSON.parse(storage.getItem(SAVE_KEY));
    if (d && d.progress && d.heroes) return { ...newSave(), ...d, progress: { ...newSave().progress, ...d.progress } };
  } catch { /* missing or corrupt */ }
  return newSave();
}

export function writeSave(save, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function hasProgress(save) {
  return Object.keys(save.progress.completed).length > 0 || Object.keys(save.heroes).length > 0;
}

export function guardiansDefeated(progress) {
  return [0, 1, 2].filter((r) => progress.completed[levelNumber(r, STAGES)]).length;
}

// The Underworld opens once the three guardians' Rune Stones are recovered.
export function isUnlocked(progress, realm, stage) {
  if (realm === 3 && guardiansDefeated(progress) < 3) return false;
  return stage === 1 || !!progress.completed[levelNumber(realm, stage - 1)];
}

export function runeCount(progress) {
  return Object.keys(progress.runes).length;
}

// Record a finished level and the Rune Stones found in it.
export function completeLevel(progress, n, runesFound) {
  progress.completed[n] = true;
  for (const kind of runesFound) progress.runes[`${kind === 'guardian' ? 'g' : 'h'}${n}`] = true;
  if (n === levelNumber(3, STAGES)) progress.won = true;
}

// The first unfinished stage that's open, for placing the map cursor.
export function nextStage(progress) {
  for (let r = 0; r < REALMS; r++)
    for (let s = 1; s <= STAGES; s++) if (isUnlocked(progress, r, s) && !progress.completed[levelNumber(r, s)]) return { realm: r, stage: s };
  return { realm: 0, stage: 1 };
}

// ---------- secret heroes ----------

export const SECRET_HEROES = [
  { cls: 'minotaur', how: 'Defeat the Dragon', test: (p) => !!p.completed[4] },
  { cls: 'falconess', how: 'Defeat the Chimera', test: (p) => !!p.completed[8] },
  { cls: 'jackal', how: 'Defeat the Plague Fiend', test: (p) => !!p.completed[12] },
  { cls: 'tigress', how: 'Recover 12 Rune Stones', test: (p) => runeCount(p) >= 12 },
];
const BASE = ['warrior', 'valkyrie', 'wizard', 'archer', 'dwarf', 'knight', 'jester', 'sorceress'];

export function unlockedClasses(progress) {
  return [...BASE, ...SECRET_HEROES.filter((h) => h.test(progress)).map((h) => h.cls)];
}

// ---------- shop ----------

export const SHOP = [
  { id: 'food', name: 'Roast Feast', desc: '+250 health', price: 100 },
  { id: 'potion', name: 'Magic Potion', desc: 'Blasts every foe on screen', price: 250 },
  { id: 'key', name: 'Key', desc: 'Opens one gate', price: 150 },
  { id: 'strength', name: 'Strength', desc: 'Hit harder', price: 500, stat: true },
  { id: 'armor', name: 'Armor', desc: 'Take less damage', price: 500, stat: true },
  { id: 'speed', name: 'Speed', desc: 'Run faster', price: 400, stat: true },
  { id: 'magic', name: 'Magic', desc: 'Stronger potions', price: 400, stat: true },
  { id: 'done', name: 'Done', desc: 'Back to the hub', price: 0 },
];

// Stat upgrades get pricier each time you buy the same one.
export function priceOf(p, item) {
  if (!item.stat) return item.price;
  const n = (p.upgrades && p.upgrades[item.id]) || 0;
  return Math.round(item.price * (1 + n * 0.5));
}

export function buy(p, item) {
  if (item.id === 'done') return false;
  const cost = priceOf(p, item);
  if (p.gold < cost) return false;
  if (item.id === 'potion' && p.potions >= 9) return false;
  if (item.id === 'key' && p.keys >= 9) return false;
  p.gold -= cost;
  switch (item.id) {
    case 'food': p.hp += 250; break;
    case 'potion': p.potions++; break;
    case 'key': p.keys++; break;
    case 'strength': p.strength += 4; p.shotDmg += 1.5; break;
    case 'armor': p.armor = Math.min(0.65, p.armor + 0.04); break;
    case 'speed': p.speed += 10; break;
    case 'magic': p.magic += 0.25; break;
  }
  if (item.stat) { p.upgrades = p.upgrades || {}; p.upgrades[item.id] = (p.upgrades[item.id] || 0) + 1; }
  return true;
}

// ---------- story ----------
// Original text written for this remake, following the arcade game's premise.

export const STORY = {
  intro: [
    'Long ago, the demon lord Skorne was bound beneath the world, sealed away by the power of the Rune Stones.',
    'But the seal has been broken. Skorne walks free, and the Rune Stones lie scattered across the realms, held by his most fearsome servants.',
    'Four heroes answer the call: a Warrior, a Valkyrie, a Wizard and an Archer.',
    'Recover the Rune Stones from the Mountain Kingdom, the Castle Stronghold and the Sky Dominion. Then descend into the Underworld, and end Skorne\'s reign forever.',
  ],
  realms: [
    ['Rivers of fire carve through the valleys of the Mountain Kingdom.', 'High in its peaks, a Dragon guards the first of the guardian stones.'],
    ['The Castle Stronghold has fallen to darkness, its courtyards overrun.', 'In the depths of the keep, the Chimera awaits.'],
    ['Far above the clouds drift the islands of the Sky Dominion.', 'There the Plague Fiend spreads its poison on the wind.'],
    ['The guardians have fallen, and the way to the Underworld lies open.', 'Beyond its burning halls, Skorne awaits.'],
  ],
  ending: [
    'Skorne falls, and his final roar shakes the roots of the world.',
    'The Rune Stones blaze with light, and the ancient seal is forged anew.',
    'The realms are free at last, and the names of the heroes who saved them pass into legend.',
  ],
};
