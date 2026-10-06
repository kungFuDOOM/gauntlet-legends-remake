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
export const CLASS_ORDER = ['warrior', 'valkyrie', 'wizard', 'archer'];

export const ENEMIES = {
  grunt:    { name: 'Grunt',    hp: 16, speed: 72,  dmg: 9,  r: 11, xp: 5,  score: 10, ai: 'melee',    color: '#8a5a34' },
  ghost:    { name: 'Ghost',    hp: 6,  speed: 92,  dmg: 30, r: 11, xp: 4,  score: 10, ai: 'kamikaze', color: '#d4dcec' },
  lobber:   { name: 'Lobber',   hp: 12, speed: 62,  dmg: 14, r: 10, xp: 8,  score: 20, ai: 'lobber',   color: '#6f8f3a', range: 280, cooldown: 2.2 },
  demon:    { name: 'Demon',    hp: 26, speed: 80,  dmg: 14, r: 13, xp: 10, score: 30, ai: 'shooter',  color: '#c0352a', range: 320, cooldown: 1.7 },
  sorcerer: { name: 'Sorcerer', hp: 16, speed: 86,  dmg: 12, r: 11, xp: 12, score: 40, ai: 'sorcerer', color: '#8a3ac9', range: 300, cooldown: 1.9 },
  death:    { name: 'Death',    hp: 1,  speed: 74,  dmg: 25, r: 13, xp: 60, score: 1000, ai: 'death',  color: '#1a1a22', immune: true },
};

export const GENERATOR_HP = 45; // three tiers of 15
export const MAX_ENEMIES = 140;

export const POWERUPS = {
  speed:  { name: 'Speed Boots',      color: '#4ad9d9', dur: 20 },
  rapid:  { name: 'Rapid Fire',       color: '#ff9a3a', dur: 20 },
  shield: { name: 'Invulnerability',  color: '#ffffff', dur: 12 },
  triple: { name: 'Triple Shot',      color: '#d94ad9', dur: 20 },
};
export const POWERUP_ORDER = ['speed', 'rapid', 'shield', 'triple'];

export const TURBO_COST = 35;
export const MAX_KEYS = 9;
export const MAX_POTIONS = 9;

export function xpForLevel(lvl) {
  return Math.round(80 * Math.pow(lvl, 1.35));
}
