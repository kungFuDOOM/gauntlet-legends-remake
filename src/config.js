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
export const BASE_CLASSES = ['warrior', 'valkyrie', 'wizard', 'archer'];
export const CLASS_ORDER = [...BASE_CLASSES, 'minotaur', 'falconess', 'jackal', 'tigress'];

export const ENEMIES = {
  grunt:    { name: 'Grunt',    hp: 16, speed: 72,  dmg: 9,  r: 11, xp: 5,  score: 10, ai: 'melee',    color: '#8a5a34' },
  ghost:    { name: 'Ghost',    hp: 6,  speed: 92,  dmg: 30, r: 11, xp: 4,  score: 10, ai: 'kamikaze', color: '#d4dcec' },
  lobber:   { name: 'Lobber',   hp: 12, speed: 62,  dmg: 14, r: 10, xp: 8,  score: 20, ai: 'lobber',   color: '#6f8f3a', range: 280, cooldown: 2.2 },
  demon:    { name: 'Demon',    hp: 26, speed: 80,  dmg: 14, r: 13, xp: 10, score: 30, ai: 'shooter',  color: '#c0352a', range: 320, cooldown: 1.7 },
  sorcerer: { name: 'Sorcerer', hp: 16, speed: 86,  dmg: 12, r: 11, xp: 12, score: 40, ai: 'sorcerer', color: '#8a3ac9', range: 300, cooldown: 1.9 },
  death:    { name: 'Death',    hp: 1,  speed: 74,  dmg: 25, r: 13, xp: 60, score: 1000, ai: 'death',  color: '#1a1a22', immune: true },
};

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
};
export const POWERUP_ORDER = Object.keys(POWERUPS);

export const TURBO_COST = 35;
export const MAX_KEYS = 9;
export const MAX_POTIONS = 9;

// How tough a level is: monsters grow with the level number (1-16) and with party size,
// rewards grow with the realm. Tuned so the Mountain Kingdom eases you in and the
// Underworld is a real fight for a full party.
export function difficulty(n, players = 1) {
  const k = Math.max(0, n - 1);
  const extra = Math.max(0, Math.min(players, 4) - 1);
  const realm = Math.floor(k / 4);
  return {
    hp: (1 + 0.11 * k) * (1 + 0.3 * extra),
    dmg: 1 + 0.07 * k,
    spawn: (1 + 0.05 * k) * (1 + 0.22 * extra),
    localCap: 7 + 2 * extra,
    gold: 1 + 0.3 * realm,
    xp: 1 + 0.1 * k,
  };
}

export function xpForLevel(lvl) {
  return Math.round(80 * Math.pow(lvl, 1.35));
}
