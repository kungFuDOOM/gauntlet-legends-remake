// Game-wide constants and data tables.

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 640;
export const HUD_H = 0; // HUD panels sit in the corners over the 3D view
// Size of the world area (in sim units) the 3D camera shows; used for the party leash,
// potion range and camera clamping.
export const WORLD_VIEW_W = 680;
export const WORLD_VIEW_H = 470;
export const MAX_PLAYERS = 4;

// Health drains by this much per second, just like the arcade original.
export const HEALTH_DRAIN = 1;
export const FOOD_HEAL = 100;

export const CLASSES = {
  warrior: {
    name: 'Warrior', color: '#d8432f', dark: '#7a1e14', accent: '#f2c14e',
    hp: 900, speed: 120, strength: 26, armor: 0.15, magic: 1.0,
    shotDmg: 11, shotSpeed: 340, shotCooldown: 0.4, shot: 'axe', turbo: 'spin',
    blurb: 'Mighty melee. Turbo: whirlwind spin.',
  },
  valkyrie: {
    name: 'Valkyrie', color: '#3a78d8', dark: '#173a73', accent: '#e8e8f0',
    hp: 850, speed: 135, strength: 20, armor: 0.3, magic: 1.2,
    shotDmg: 9, shotSpeed: 400, shotCooldown: 0.32, shot: 'sword', turbo: 'dash',
    blurb: 'Heavy armor. Turbo: shield dash.',
  },
  wizard: {
    name: 'Wizard', color: '#e2c534', dark: '#7a6614', accent: '#7a3ad9',
    hp: 700, speed: 128, strength: 10, armor: 0.05, magic: 2.0,
    shotDmg: 13, shotSpeed: 370, shotCooldown: 0.36, shot: 'fireball', turbo: 'nova',
    blurb: 'Potent magic. Turbo: fire nova.',
  },
  archer: {
    name: 'Archer', color: '#38b058', dark: '#165a28', accent: '#c98a3a',
    hp: 750, speed: 155, strength: 12, armor: 0.1, magic: 1.1,
    shotDmg: 7, shotSpeed: 540, shotCooldown: 0.2, shot: 'arrow', turbo: 'volley',
    blurb: 'Fast and rapid-fire. Turbo: arrow volley.',
  },
};
// Secret heroes, unlocked during the quest (see campaign.js).
Object.assign(CLASSES, {
  minotaur: {
    name: 'Minotaur', color: '#c07838', dark: '#5a3418', accent: '#f0e0c0', secret: true,
    hp: 1000, speed: 112, strength: 30, armor: 0.22, magic: 0.8,
    shotDmg: 12, shotSpeed: 320, shotCooldown: 0.45, shot: 'axe', turbo: 'spin',
    blurb: 'Raw strength. Turbo: goring spin.',
  },
  falconess: {
    name: 'Falconess', color: '#d870c8', dark: '#6a2a60', accent: '#ffffff', secret: true,
    hp: 760, speed: 162, strength: 13, armor: 0.1, magic: 1.3,
    shotDmg: 8, shotSpeed: 560, shotCooldown: 0.19, shot: 'arrow', turbo: 'volley',
    blurb: 'Swift as the wind. Turbo: feather storm.',
  },
  jackal: {
    name: 'Jackal', color: '#d0a848', dark: '#4a3a18', accent: '#202020', secret: true,
    hp: 830, speed: 145, strength: 22, armor: 0.26, magic: 1.2,
    shotDmg: 10, shotSpeed: 420, shotCooldown: 0.3, shot: 'sword', turbo: 'dash',
    blurb: 'Guardian of tombs. Turbo: spirit dash.',
  },
  tigress: {
    name: 'Tigress', color: '#ff8a20', dark: '#7a3a08', accent: '#202020', secret: true,
    hp: 800, speed: 166, strength: 21, armor: 0.12, magic: 1.0,
    shotDmg: 9, shotSpeed: 470, shotCooldown: 0.24, shot: 'sword', turbo: 'spin',
    blurb: 'Fierce and fast. Turbo: claw cyclone.',
  },
});
// Dark Legacy's four extra classes, available from the start.
Object.assign(CLASSES, {
  dwarf: {
    name: 'Dwarf', color: '#c86a20', dark: '#5a2e0c', accent: '#b8bcc8',
    hp: 950, speed: 112, strength: 25, armor: 0.25, magic: 0.9,
    shotDmg: 11, shotSpeed: 330, shotCooldown: 0.42, shot: 'axe', turbo: 'spin',
    blurb: 'Tough as stone. Turbo: hammer whirl.',
  },
  knight: {
    name: 'Knight', color: '#b8bcd0', dark: '#4a4e60', accent: '#b01818',
    hp: 900, speed: 122, strength: 22, armor: 0.32, magic: 1.0,
    shotDmg: 10, shotSpeed: 380, shotCooldown: 0.34, shot: 'sword', turbo: 'dash',
    blurb: 'Clad in plate. Turbo: shield charge.',
  },
  jester: {
    name: 'Jester', color: '#9a3ad8', dark: '#3a1060', accent: '#f2c020',
    hp: 720, speed: 158, strength: 12, armor: 0.08, magic: 1.4,
    shotDmg: 7, shotSpeed: 500, shotCooldown: 0.18, shot: 'dagger', turbo: 'volley',
    blurb: 'Quick and tricky. Turbo: dagger fan.',
  },
  sorceress: {
    name: 'Sorceress', color: '#c040e0', dark: '#4a106a', accent: '#e8c040',
    hp: 700, speed: 130, strength: 10, armor: 0.06, magic: 2.1,
    shotDmg: 13, shotSpeed: 380, shotCooldown: 0.34, shot: 'spark', turbo: 'nova',
    blurb: 'Mistress of magic. Turbo: arcane nova.',
  },
});
export const BASE_CLASSES = ['warrior', 'valkyrie', 'wizard', 'archer', 'dwarf', 'knight', 'jester', 'sorceress'];
export const CLASS_ORDER = [...BASE_CLASSES, 'minotaur', 'falconess', 'jackal', 'tigress'];

// Each realm has its own monsters (see ROSTERS in level.js). ai: melee (knock: shove the hero
// back, atkCd: time between blows), kamikaze (explodes on contact; fly: ignores hazards, zig:
// weaves side to side), lobber (lob: what it throws), shooter / sorcerer (shot: what it fires;
// sorcerers blink invisible), charger (crouches, then lunges), death.
export const ENEMIES = {
  // Mountain Kingdom: goblins, bats and orcs
  goblin:   { name: 'Goblin',        hp: 15, speed: 86,  dmg: 9,  r: 10, xp: 5,  score: 10, ai: 'melee',    color: '#6aa040' },
  bat:      { name: 'Cave Bat',      hp: 6,  speed: 118, dmg: 20, r: 9,  xp: 4,  score: 10, ai: 'kamikaze', color: '#5a3a5a', fly: true, zig: 1 },
  bomber:   { name: 'Goblin Bomber', hp: 13, speed: 64,  dmg: 14, r: 10, xp: 8,  score: 20, ai: 'lobber',   color: '#c08a30', range: 280, cooldown: 2.3, lob: 'bomb' },
  orc:      { name: 'Orc Brute',     hp: 42, speed: 56,  dmg: 18, r: 14, xp: 16, score: 50, ai: 'melee',    color: '#4a7a3a', atkCd: 1.1, knock: 18 },
  shaman:   { name: 'Goblin Shaman', hp: 18, speed: 80,  dmg: 12, r: 10, xp: 12, score: 40, ai: 'sorcerer', color: '#80ff60', range: 300, cooldown: 2.0, shot: 'gbolt' },
  // Castle Stronghold: the undead garrison
  grunt:    { name: 'Skeleton',      hp: 18, speed: 74,  dmg: 10, r: 11, xp: 6,  score: 15, ai: 'melee',    color: '#d8d0b8' },
  ghost:    { name: 'Ghost',         hp: 6,  speed: 92,  dmg: 30, r: 11, xp: 4,  score: 10, ai: 'kamikaze', color: '#d4dcec', fly: true },
  archer:   { name: 'Skeleton Archer', hp: 14, speed: 70, dmg: 11, r: 11, xp: 9, score: 25, ai: 'shooter',  color: '#c8b890', range: 360, cooldown: 2.0, shot: 'arrow', shotSpeed: 300 },
  lobber:   { name: 'Bone Thrower',  hp: 12, speed: 62,  dmg: 14, r: 10, xp: 8,  score: 20, ai: 'lobber',   color: '#6f8f3a', range: 280, cooldown: 2.2, lob: 'lob' },
  knight:   { name: 'Dark Knight',   hp: 60, speed: 54,  dmg: 20, r: 14, xp: 18, score: 60, ai: 'melee',    color: '#4a5068', atkCd: 1.2, knock: 20 },
  sorcerer: { name: 'Necromancer',   hp: 18, speed: 86,  dmg: 12, r: 11, xp: 12, score: 40, ai: 'sorcerer', color: '#8a3ac9', range: 300, cooldown: 1.9, shot: 'bolt' },
  // Sky Dominion: plague and haunting
  zombie:   { name: 'Zombie',        hp: 30, speed: 48,  dmg: 13, r: 12, xp: 8,  score: 20, ai: 'melee',    color: '#7a9a6a', atkCd: 0.9 },
  wraith:   { name: 'Wraith',        hp: 8,  speed: 100, dmg: 32, r: 11, xp: 5,  score: 15, ai: 'kamikaze', color: '#80ffb0', fly: true },
  spider:   { name: 'Giant Spider',  hp: 22, speed: 92,  dmg: 14, r: 13, xp: 12, score: 35, ai: 'charger',  color: '#3a2a3a' },
  plaguer:  { name: 'Plague Doctor', hp: 16, speed: 62,  dmg: 16, r: 11, xp: 10, score: 30, ai: 'lobber',   color: '#a0d040', range: 290, cooldown: 2.2, lob: 'flask' },
  witch:    { name: 'Witch',         hp: 22, speed: 84,  dmg: 15, r: 11, xp: 14, score: 45, ai: 'sorcerer', color: '#60ff80', range: 320, cooldown: 1.8, shot: 'gbolt' },
  // Underworld: demons
  imp:      { name: 'Imp',           hp: 20, speed: 98,  dmg: 11, r: 10, xp: 9,  score: 20, ai: 'melee',    color: '#d0402a', atkCd: 0.55 },
  skull:    { name: 'Flaming Skull', hp: 10, speed: 106, dmg: 36, r: 10, xp: 6,  score: 20, ai: 'kamikaze', color: '#ff8a30', fly: true, zig: 0.5 },
  hound:    { name: 'Hellhound',     hp: 32, speed: 100, dmg: 18, r: 13, xp: 15, score: 45, ai: 'charger',  color: '#5a1a10' },
  demon:    { name: 'Demon',         hp: 38, speed: 78,  dmg: 16, r: 14, xp: 16, score: 50, ai: 'shooter',  color: '#c0352a', range: 330, cooldown: 1.6, shot: 'efire' },
  warlock:  { name: 'Warlock',       hp: 28, speed: 84,  dmg: 18, r: 11, xp: 18, score: 60, ai: 'sorcerer', color: '#ff4060', range: 330, cooldown: 1.7, shot: 'hbolt' },
  // anywhere
  death:    { name: 'Death',         hp: 1,  speed: 74,  dmg: 25, r: 13, xp: 60, score: 1000, ai: 'death',  color: '#1a1a22', immune: true },
};

export const LOBBED = new Set(['lob', 'bomb', 'flask']); // enemy projectiles thrown in an arc

export const GENERATOR_HP = 45; // three tiers of 15
export const MAX_ENEMIES = 110;

export const POWERUPS = {
  speed:     { name: 'Speed Boots',     color: '#4ad9d9', dur: 20 },
  rapid:     { name: 'Rapid Fire',      color: '#ff9a3a', dur: 20 },
  shield:    { name: 'Invulnerability', color: '#ffffff', dur: 12 },
  triple:    { name: 'Three-Way Shot',  color: '#d94ad9', dur: 20 },
  reflect:   { name: 'Reflect Shot',    color: '#8ad0ff', dur: 20 },  // shots bounce off walls
  super:     { name: 'Super Shot',      color: '#ffe040', dur: 15 },  // huge piercing shots
  fire:      { name: 'Fire Breath',     color: '#ff5a20', dur: 15 },  // every attack breathes fire
  invisible: { name: 'Invisibility',    color: '#b0b8c8', dur: 15 },  // monsters lose track of you
  levitate:  { name: 'Levitation',      color: '#a0ffb0', dur: 20 },  // float over lava and the void
  xray:      { name: 'X-Ray Glasses',   color: '#40ff80', dur: 30 },  // reveals secret walls
  phoenix:   { name: 'Phoenix',         color: '#ff7020', dur: 25 },  // a fiery familiar fights beside you
  lightning: { name: 'Lightning Breath', color: '#a0e0ff', dur: 15 }, // attacks arc to nearby foes
  grow:      { name: 'Grow Potion',     color: '#80ff40', dur: 20 },  // giant-sized: hit harder, take less
  antideath: { name: 'Anti-Death Halo', color: '#fff080', dur: 30 },  // Death is destroyed by your touch
};
export const POWERUP_ORDER = Object.keys(POWERUPS);

export const TURBO_COST = 35;
export const MAX_KEYS = 9;
export const MAX_POTIONS = 9;

// How tough a level is. Monsters grow with the stage (1-16) and the party's size; rewards
// grow with the realm. Every stage is a step harder than the last, from a first stage that
// already asks for some care.
//
// Heroes level up as they go, so each stage expects heroes of about a certain level
// (expectedLevel). A party ahead of that, say from replaying stages, meets monsters that
// make up 40% of the difference: if the extra levels make the heroes hit 30% harder, the
// monsters get 12% more health (and likewise their damage against the heroes' extra health
// and armour). Leveling up still makes a stage easier, just not trivial. A party behind the
// usual level gets some relief the same way.
export function difficulty(n, players = 1, partyLevel = null) {
  const k = Math.max(0, n - 1);
  const extra = Math.max(0, Math.min(players, 4) - 1);
  const realm = Math.floor(k / 4);
  const gap = partyLevel == null ? 0 : partyLevel - expectedLevel(n);
  const usual = expectedLevel(n), lvl = usual + Math.max(-4, Math.min(gap, 15));
  // how much harder heroes hit (strength) and how much more they can take (health, armour)
  const power = (L) => 1 + 0.115 * (L - 1), toughness = (L) => 1 + 0.06 * (L - 1);
  const lead = 1 + 0.4 * (power(lvl) / power(usual) - 1);
  return {
    hp: (1.12 + 0.075 * k) * (1 + 0.3 * extra) * lead,
    dmg: (1.05 + 0.05 * k) * (1 + 0.4 * (toughness(lvl) / toughness(usual) - 1)),
    spawn: (1.08 + 0.055 * k) * (1 + 0.22 * extra),
    localCap: 8 + Math.floor(k / 3) + 2 * extra,
    gold: 1 + 0.3 * realm,
    xp: 1 + 0.1 * k,
    gap,
    lead, // the part of the health from the party's level (guardians use it)
  };
}

// The hero level a party usually has on reaching stage n, from the experience the stages
// before it give (an estimate: about 600 xp from the first stage, rising with each one).
export function expectedLevel(n) {
  let xp = 0;
  for (let i = 1; i < n; i++) xp += (450 + 120 * i) * (1 + 0.1 * (i - 1));
  let lvl = 1;
  while (xp >= xpForLevel(lvl)) { xp -= xpForLevel(lvl); lvl++; }
  return lvl;
}

export function xpForLevel(lvl) {
  return Math.round(80 * Math.pow(lvl, 1.35));
}
