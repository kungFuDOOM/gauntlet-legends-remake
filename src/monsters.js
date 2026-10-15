// Each realm's monsters. The humanoid ones are built like the heroes (heroes.js): shaped parts
// on the shared rig, so every KayKit animation drives them. Their parts are then merged into
// a few skinned meshes, one per material, so a crowd of them costs a handful of draw calls
// each. Beasts and flyers (bats, spiders, flaming skulls, hellhounds) are procedural models
// animated in code.

import * as THREE from 'three';
import { kit } from './heroes.js';
import { glowSprite } from './models.js';

const {
  RIGS, BODIES, applyRig, hipsHeight, BASE_HIPS, mat, metal, add, lathe, sphere, box, cap, CAP_TILT, cylinder, cone, torus,
  shapeGeo, body, hairLong, bracer, flap, belt, boots, horns, sword, shield, staff, stripes,
} = kit;

const MRIGS = {
  ...RIGS,
  // small and wiry: goblins and imps
  small: { leg: 0.24, shin: 0.22, spine: 0.09, chest: 0.18, neck: 0.2, shoulder: 0.13, shoulderY: 0.15, arm: 0.22, fore: 0.2, hipW: 0.075 },
};
const MBODIES = {
  ...BODIES,
  scrawny: { chest: 0.12, chestD: 0.72, waist: 0.095, hip: 0.105, arm: 0.034, fore: 0.031, thigh: 0.052, calf: 0.038, neck: 0.036, delt: 0.042, head: 1.3 },
  imp: { chest: 0.14, chestD: 0.7, waist: 0.1, hip: 0.11, arm: 0.04, fore: 0.036, thigh: 0.06, calf: 0.045, neck: 0.04, delt: 0.05, head: 1.2 },
  gaunt: { chest: 0.15, chestD: 0.62, waist: 0.11, hip: 0.12, arm: 0.04, fore: 0.035, thigh: 0.07, calf: 0.048, neck: 0.042, delt: 0.048, head: 1 },
};

const glow = (color, k = 2) => mat(color, { emissive: color, emissiveIntensity: k });

// Two glowing eyes on a head (bone-local; the face looks along +Z).
function eyes(head, color, hs = 1, { y = 0.16, z = 0.1, spread = 0.032, size = 0.014 } = {}) {
  const m = glow(color, 2.4);
  for (const s of [-1, 1]) add(head, sphere(8), m, [s * spread * hs, y * hs, z * hs], [0, 0, 0], [size * hs, size * 0.75 * hs, size * 0.6 * hs]);
}

function ears(head, skin, hs, len = 0.13) {
  for (const s of [-1, 1]) add(head, cone(6), skin, [s * 0.1 * hs, 0.17 * hs, -0.01], [0, 0, -s * 1.3], [0.03 * hs, len * hs, 0.014 * hs]);
}

function batWings(chest, R, B, material, size = 1) {
  const geo = shapeGeo('batwing', [[0, 0], [0.12, 0.1], [0.28, 0.14], [0.34, 0.02], [0.26, -0.02], [0.22, -0.1], [0.14, -0.04], [0.08, -0.12]], 0.006, 0);
  for (const s of [-1, 1]) {
    const w = add(chest, geo, material, [s * 0.05, R.shoulderY - 0.02, -B.chest * B.chestD - 0.01], [0.3, s > 0 ? -0.5 : Math.PI + 0.5, 0.25], [size, size, size]);
    w.userData.wing = s;
  }
}

function tail(hips, material, segs = 6, r = 0.02, tip = null) {
  let seg = hips;
  for (let i = 0; i < segs; i++) {
    seg = add(seg, cylinder(0.8, 1), material, i === 0 ? [0, 0, -0.09] : [0, 0.08, 0], [i === 0 ? -2.0 : 0.22, 0, 0], i === 0 ? [r, 0.08, r] : [0.9, 1, 0.9]);
  }
  if (tip) add(seg, cone(4), tip, [0, 0.9, 0], [0, 0, 0], [2.4, 1.2, 0.6]);
}

function club(hand) {
  const g = new THREE.Group();
  const wood = mat('#6a4a2a');
  add(g, cylinder(1, 0.55, 8), wood, [0, 0.36, 0], [0, 0, 0], [0.06, 0.66, 0.06]);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, y = 0.48 + (i % 3) * 0.1;
    add(g, cone(4), metal('#b0b0b8'), [Math.cos(a) * 0.05, y, Math.sin(a) * 0.05], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4], [0.015, 0.06, 0.015]);
  }
  hand.add(g);
}

function trident(hand, material) {
  const g = new THREE.Group();
  add(g, cylinder(0.012, 0.014), mat('#2a1a14'), [0, 0.4, 0], [0, 0, 0], [1, 1.1, 1]);
  add(g, box(), material, [0, 0.95, 0], [0, 0, 0], [0.14, 0.02, 0.02]);
  for (const x of [-0.065, 0, 0.065]) add(g, cone(4), material, [x, 1.02, 0], [0, 0, 0], [0.014, 0.12, 0.014]);
  hand.add(g);
}

function robe(spine, R, B, material, flare = 1.6, len = 0.82) {
  add(spine, lathe([[B.hip * 1.08, -R.spine + 0.02], [B.hip * 1.3, -R.spine - len * 0.36], [B.hip * flare, -R.spine - len]], 14), material, [0, 0, 0], [0, Math.PI, 0], [1, 1, 0.85]);
}

function pointyHat(head, material, hs, tall = 0.34) {
  add(head, cylinder(1, 1, 16), material, [0, 0.24 * hs, 0], [-0.12, 0, 0], [0.2 * hs, 0.012, 0.2 * hs]);
  const c = add(head, cone(10), material, [0, 0.24 * hs + tall * 0.35, -0.01], [-0.25, 0, 0], [0.095 * hs, tall * 0.7, 0.095 * hs]);
  add(c, cone(8), material, [0, 0.62, -0.08], [-0.7, 0, 0], [0.55, 0.5, 0.55]);
}

// ---------- the monsters ----------

function goblinBody(rig, skin, extra = {}) {
  const R = MRIGS.small, B = MBODIES.scrawny, hs = B.head;
  const b = body(rig, B, { rig: R, skin, feet: mat('#3a2a1a'), face: { eyes: '#ffcc20', brows: '#2a4010', angry: true, fangs: true }, ...extra });
  ears(b.head, b.skin, hs);
  add(b.head, cone(6), b.skin, [0, 0.13 * hs, 0.12 * hs], [Math.PI / 2 + 0.35, 0, 0], [0.02 * hs, 0.06 * hs, 0.02 * hs]); // long nose
  eyes(b.head, '#ffd020', hs, { y: 0.165, z: 0.098 });
  return { b, R, B, hs };
}

const MONSTERS = {
  goblin(rig) {
    const leather = mat('#6a4a2a');
    const { b, R, B } = goblinBody(rig, '#6aa040');
    belt(b.spine, R, B, leather, mat('#e8dcc0'));
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.11, 0.16, leather, -0.1);
    flap(b.spine, [0, -R.spine + 0.01, -B.hip * 0.7], 0.13, 0.15, leather, 0.1);
    add(b.chest, box(), leather, [0, 0.1, 0], [0, 0, 0.6], [0.03, 0.32, B.chest * 1.6]); // shoulder strap
    sword(b.bone('handslotr'), 0.32, '#a8a090');
  },
  bomber(rig) {
    const leather = mat('#5a3a20'), red = mat('#b02818');
    const { b, R, B, hs } = goblinBody(rig, '#7aa838');
    add(b.head, cap(), red, [0, 0.17 * hs, 0.02], [CAP_TILT, 0, 0], [0.1 * hs, 0.11 * hs, 0.12 * hs]); // bandana
    belt(b.spine, R, B, leather);
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.12, 0.15, leather, -0.1);
    const bomb = metal('#24222a');
    add(b.chest, box(), leather, [0, 0.1, 0], [0, 0, -0.6], [0.03, 0.32, B.chest * 1.6]);
    for (const [x, y] of [[-0.05, 0.16], [0.02, 0.09], [0.07, 0.03]]) add(b.chest, sphere(10), bomb, [x, y, B.chest * B.chestD + 0.02], [0, 0, 0], [0.03, 0.03, 0.03]);
    const hand = b.bone('handslotr');
    add(hand, sphere(12), bomb, [0, 0.07, 0], [0, 0, 0], [0.065, 0.065, 0.065]);
    add(hand, cylinder(1, 1), mat('#c8a060'), [0, 0.15, 0], [0, 0, 0], [0.008, 0.04, 0.008]);
    add(hand, sphere(6), glow('#ffb030', 3), [0, 0.18, 0], [0, 0, 0], [0.014, 0.014, 0.014]);
  },
  shaman(rig) {
    const boneMat = mat('#e8dcc0'), robeMat = mat('#3a5a2a', { map: stripes(['#3a5a2a', '#5a3a20'], 6) });
    const { b, R, B, hs } = goblinBody(rig, '#5a9050', { chest: robeMat, abs: robeMat });
    robe(b.spine, R, B, robeMat, 1.5, 0.3);
    add(b.head, sphere(12), boneMat, [0, 0.15 * hs, 0.06 * hs], [0, 0, 0], [0.085 * hs, 0.09 * hs, 0.07 * hs]); // bone mask
    eyes(b.head, '#60ff40', hs, { y: 0.165, z: 0.13 });
    const feathers = ['#e03020', '#f0c020', '#30a0e0', '#e03020', '#f0c020'];
    feathers.forEach((c, i) => add(b.head, cone(4), mat(c), [(i - 2) * 0.03 * hs, 0.27 * hs, -0.02], [-0.25, 0, (i - 2) * 0.25], [0.014, 0.12 * hs, 0.006]));
    staff(b.bone('handslotr'), boneMat, 0.9, '#60ff40');
  },
  orc(rig) {
    const R = RIGS.big, B = BODIES.huge, hs = B.head;
    const leather = mat('#4a3020'), iron = metal('#7a7a82'), fur = mat('#6a5a48', { roughness: 0.95 });
    const b = body(rig, B, { rig: R, skin: '#5a8a40', bare: true, feet: leather, face: { eyes: '#ff3010', brows: '#203010', angry: true, fangs: true } });
    eyes(b.head, '#ff4020', hs, { y: 0.17, z: 0.1 });
    const ivory = mat('#f0e8d0');
    for (const s of [-1, 1]) add(b.head, cone(6), ivory, [s * 0.045 * hs, 0.08 * hs, 0.1 * hs], [-0.35, 0, s * 0.25], [0.016, 0.07, 0.016]); // tusks
    add(b.head, sphere(10), mat('#1a1410'), [0, 0.27 * hs, -0.03], [0, 0, 0], [0.035, 0.05, 0.035]); // topknot
    ears(b.head, b.skin, hs, 0.07);
    add(b.bone('upperarml'), sphere(12), iron, [0, 0.03, 0], [0, 0, 0], [0.11, 0.09, 0.11]); // pauldron
    for (const a of [-0.5, 0, 0.5]) add(b.bone('upperarml'), cone(5), iron, [Math.sin(a) * 0.06, 0.1, Math.cos(a) * 0.02], [0, 0, a], [0.02, 0.07, 0.02]);
    belt(b.spine, R, B, leather, iron);
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.62], 0.2, 0.26, fur, -0.08);
    flap(b.spine, [0, -R.spine + 0.01, -B.hip * 0.62], 0.22, 0.28, fur, 0.08);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, leather, 0.35);
    boots(rig, R, B, leather, fur, 0.3);
    club(b.bone('handslotr'));
  },
  knight(rig) {
    const R = RIGS.big, B = BODIES.muscular;
    const armor = metal('#3a3e50', { roughness: 0.45 }), trim = metal('#9a2a1a'), red = mat('#8a1a14');
    const b = body(rig, B, { rig: R, skin: '#3a3e50', chest: armor, abs: armor, upperArm: armor, foreArm: armor, hands: armor, thigh: armor, calf: armor, feet: armor, delt: armor, neckMat: armor, face: false });
    add(b.head, sphere(16), armor, [0, 0.15, 0.01], [0, 0, 0], [0.1, 0.125, 0.115]); // great helm
    add(b.head, box(), glow('#ff2010', 2.5), [0, 0.16, 0.112], [0, 0, 0], [0.12, 0.014, 0.01]); // eye slit
    add(b.head, box(), red, [0, 0.29, -0.01], [0, 0, 0], [0.02, 0.06, 0.18]); // crest
    for (const s of ['l', 'r']) {
      add(b.bone(`upperarm${s}`), sphere(12), armor, [0, 0.03, 0], [0, 0, 0], [0.1, 0.085, 0.1]);
      add(b.bone(`upperarm${s}`), cone(5), trim, [0, 0.11, 0], [0, 0, 0], [0.025, 0.07, 0.025]);
    }
    belt(b.spine, R, B, trim);
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.18, 0.32, red, -0.06);
    flap(b.chest, [0, R.shoulderY + 0.02, -B.chest * B.chestD - 0.03], 0.3, 0.78, red, 0.18); // cape
    sword(b.bone('handslotr'), 0.78, '#8a94a8');
    shield(b.bone('lowerarml'), mat('#22252e', { metalness: 0.5, roughness: 0.4 }), trim, R.fore);
  },
  zombie(rig) {
    const R = RIGS.male, B = MBODIES.gaunt, hs = B.head;
    const shirt = mat('#5a5a72'), pants = mat('#4a3a2a');
    const b = body(rig, B, { rig: R, skin: '#8aa070', chest: shirt, abs: shirt, upperArm: shirt, thigh: pants, face: { eyes: '#e8e8a0', brows: '#3a4a2a', scars: true } });
    eyes(b.head, '#e0ff80', hs, { y: 0.16, z: 0.1, size: 0.011 });
    for (let i = 0; i < 4; i++) flap(b.spine, [(i - 1.5) * 0.06, -R.spine + 0.02, B.hip * 0.8], 0.05, 0.08 + (i % 2) * 0.06, shirt, -0.15); // rags
    for (let i = 0; i < 3; i++) add(b.head, sphere(8), mat('#2a2018'), [(i - 1) * 0.05, 0.25, -0.03 - (i % 2) * 0.04], [0, 0, 0], [0.04, 0.025, 0.04]); // what hair is left
  },
  plaguer(rig) {
    const R = RIGS.male, B = BODIES.athletic;
    const coat = mat('#2a2620'), leather = mat('#3a2a1a'), maskMat = mat('#e8dcc0'), glove = mat('#141210');
    const b = body(rig, B, { rig: R, skin: '#e8dcc0', chest: coat, abs: coat, upperArm: coat, foreArm: coat, hands: glove, thigh: coat, calf: coat, feet: leather, neckMat: coat, face: false });
    add(b.head, sphere(14), maskMat, [0, 0.15, 0.01], [0, 0, 0], [0.09, 0.11, 0.1]);
    add(b.head, cone(8), maskMat, [0, 0.12, 0.17], [Math.PI / 2 + 0.25, 0, 0], [0.035, 0.16, 0.035]); // beak
    eyes(b.head, '#80ff40', 1, { y: 0.17, z: 0.09, spread: 0.038, size: 0.02 }); // lenses
    add(b.head, cylinder(1, 1, 16), coat, [0, 0.24, 0], [-0.1, 0, 0], [0.19, 0.012, 0.19]); // hat brim
    add(b.head, cylinder(0.85, 1, 14), coat, [0, 0.3, -0.01], [-0.1, 0, 0], [0.09, 0.11, 0.09]);
    robe(b.spine, R, B, coat, 1.5, 0.7);
    belt(b.spine, R, B, leather, metal('#a08040'));
    add(b.bone('handslotr'), sphere(10), glow('#70ff40', 1.5), [0, 0.06, 0], [0, 0, 0], [0.05, 0.06, 0.05]); // flask
  },
  witch(rig) {
    const R = RIGS.female, B = BODIES.female, hs = B.head;
    const robeMat = mat('#3a1a4a'), hatMat = mat('#1a1420');
    const b = body(rig, B, { rig: R, skin: '#9ac078', chest: robeMat, abs: robeMat, upperArm: robeMat, foreArm: robeMat, thigh: robeMat, feet: hatMat, face: { female: true, eyes: '#ffcc00', lips: '#3a2a3a', brows: '#101010', angry: true } });
    hairLong(b.head, '#181418', hs, 0.4);
    add(b.head, cone(6), b.skin, [0, 0.13 * hs, 0.12 * hs], [Math.PI / 2 + 0.6, 0, 0], [0.018, 0.06, 0.02]); // hooked nose
    pointyHat(b.head, hatMat, hs);
    robe(b.spine, R, B, robeMat, 1.7, 0.84);
    belt(b.spine, R, B, mat('#5a2a6a'), metal('#80ff60'));
    staff(b.bone('handslotr'), mat('#3a2a1a'), 1.1, '#60ff60');
  },
  imp(rig) {
    const R = MRIGS.small, B = MBODIES.imp, hs = B.head;
    const b = body(rig, B, { rig: R, skin: '#c8402a', bare: true, feet: mat('#2a0a08'), face: { eyes: '#ffd000', brows: '#401010', angry: true, fangs: true } });
    eyes(b.head, '#ffd000', hs, { y: 0.165, z: 0.098 });
    horns(b.head, mat('#2a1a14'), hs, 0.8);
    ears(b.head, b.skin, hs, 0.08);
    batWings(b.chest, R, B, mat('#6a1a10', { side: THREE.DoubleSide }), 0.7);
    tail(b.hips, b.skin, 6, 0.015, mat('#2a0a08'));
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.1, 0.12, mat('#1a0a08'), -0.1);
    trident(b.bone('handslotr'), metal('#c8b060'));
  },
  demon(rig) {
    const R = RIGS.big, B = BODIES.huge, hs = B.head;
    const hoof = mat('#1a0a08');
    const b = body(rig, B, { rig: R, skin: '#a8281a', bare: true, feet: hoof, face: { eyes: '#ffb000', brows: '#200808', angry: true, fangs: true } });
    eyes(b.head, '#ffb000', hs, { y: 0.17, z: 0.1 });
    horns(b.head, mat('#e8dcb8'), hs, 1.7);
    batWings(b.chest, R, B, mat('#4a0e08', { side: THREE.DoubleSide }), 1.6);
    tail(b.hips, b.skin, 7, 0.022, hoof);
    belt(b.spine, R, B, mat('#1a0a08'), metal('#e8b040'));
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.62], 0.2, 0.3, mat('#1a0a08'), -0.08);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, metal('#e8b040'), 0.35);
    add(b.bone('handslotr'), sphere(10), glow('#ff6020', 3), [0, 0.05, 0], [0, 0, 0], [0.05, 0.05, 0.05]); // hellfire in hand
  },
  warlock(rig) {
    const R = RIGS.male, B = BODIES.athletic;
    const robeMat = mat('#3a0a14'), dark = mat('#060304'), gold = metal('#d8a840');
    const b = body(rig, B, { rig: R, skin: '#2a1a1a', chest: robeMat, abs: robeMat, upperArm: robeMat, foreArm: robeMat, hands: dark, thigh: robeMat, calf: robeMat, feet: dark, neckMat: robeMat, face: false });
    add(b.head, sphere(12), dark, [0, 0.15, 0.01], [0, 0, 0], [0.085, 0.105, 0.095]);
    add(b.head, cap(), robeMat, [0, 0.15, -0.005], [-0.2, 0, 0], [0.115, 0.17, 0.13]); // hood
    eyes(b.head, '#ff2020', 1, { y: 0.16, z: 0.088, spread: 0.03, size: 0.016 });
    robe(b.spine, R, B, robeMat, 1.6, 0.84);
    belt(b.spine, R, B, gold, gold);
    for (const s of ['l', 'r']) add(b.bone(`upperarm${s}`), cone(5), gold, [0, 0.08, 0], [0, 0, 0], [0.03, 0.08, 0.03]);
    staff(b.bone('handslotr'), gold, 1.25, '#ff2040');
  },
};

export const MONSTER_RIG = { goblin: 'small', bomber: 'small', shaman: 'small', orc: 'big', knight: 'big', zombie: 'male', plaguer: 'male', witch: 'female', imp: 'small', demon: 'big', warlock: 'male' };
export const BUILT_MONSTERS = Object.keys(MONSTERS);

// Turn a bare rig into the given monster; returns its size relative to the base rig.
export function buildMonster(type, rig) {
  const R = MRIGS[MONSTER_RIG[type]];
  applyRig(rig, R);
  rig.updateMatrixWorld(true);
  MONSTERS[type](rig);
  mergeParts(rig);
  return hipsHeight(R) / BASE_HIPS;
}

// Every part hangs rigidly off one bone: bake them into one skinned mesh per material, each
// vertex weighted fully to its part's bone.
function mergeParts(rig) {
  rig.updateMatrixWorld(true);
  const bones = [];
  rig.traverse((o) => { if (o.isBone) bones.push(o); });
  const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert();
  const groups = new Map(); // material -> geometries
  // Parts share one material per kind of surface (cloth/skin, metal, each painted texture,
  // each glow): a part's colour is baked into its vertex colours (which already carry the
  // shading), so differently coloured cloth can be drawn together.
  const looks = new Map();
  const same = (m) => {
    const glows = m.emissiveIntensity > 0 && m.emissive.getHex() !== 0;
    const key = [m.map ? m.map.uuid : '', glows ? m.emissive.getHex() + ':' + m.emissiveIntensity + ':' + m.color.getHex() : '', m.metalness > 0.3 ? 'metal' : 'matte', m.side, m.transparent, m.opacity].join('|');
    if (!looks.has(key)) {
      const look = m.clone();
      if (!glows) look.color.set('#ffffff');
      look.vertexColors = true;
      looks.set(key, look);
    }
    return { look: looks.get(key), bake: !glows };
  };
  const parts = [];
  rig.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) parts.push(o); });
  for (const m of parts) {
    let b = m.parent;
    while (b && !b.isBone) b = b.parent;
    const bi = Math.max(0, bones.indexOf(b));
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRig, m.matrixWorld));
    // flipped parts (negative scale) would turn inside out
    if (m.matrixWorld.determinant() < 0) {
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i += 3) for (const a of [p, n, g.attributes.uv, g.attributes.color]) {
        if (!a) continue;
        for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
      }
    }
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const { look, bake } = same(m.material);
    if (bake) { // the part's own colour, into its vertex colours
      const c = g.attributes.color, col = m.material.color;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * col.r, c.getY(i) * col.g, c.getZ(i) * col.b);
    }
    if (!groups.has(look)) groups.set(look, []);
    groups.get(look).push(g);
    m.parent.remove(m);
  }
  const skeleton = new THREE.Skeleton(bones);
  for (const [material, geos] of groups) {
    const merged = mergeAll(geos);
    const mesh = new THREE.SkinnedMesh(merged, material);
    mesh.frustumCulled = false;
    rig.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
  }
}

function mergeAll(geos) {
  const out = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3], ['skinIndex', 4], ['skinWeight', 4]]) {
    const total = geos.reduce((s, g) => s + g.attributes[k].count, 0);
    const arr = k === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// ---------- beasts and flyers (procedural, animated in code) ----------

const pm = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...opts });
const pglow = (color, k = 2.5) => pm(color, { emissive: color, emissiveIntensity: k });
const G = {
  sph: (s = 10) => new THREE.SphereGeometry(1, s, Math.round(s * 0.7)),
  cyl: (a, b, s = 6) => new THREE.CylinderGeometry(a, b, 1, s).translate(0, 0.5, 0), // grows up from 0
  cone: (s = 5) => new THREE.ConeGeometry(1, 1, s),
  box: () => new THREE.BoxGeometry(1, 1, 1),
};
function piece(parent, geo, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  parent.add(m);
  return m;
}
const pivot = (parent, pos = [0, 0, 0]) => { const p = new THREE.Group(); p.position.set(...pos); parent.add(p); return p; };

// Returns a Group whose userData.anim(time, moving, enemy) poses it each frame and
// userData.mats lists its materials (for hit flashes). Models face +Z.
export function buildCreature(type, skullProp = null) {
  const root = new THREE.Group();
  const body = pivot(root);
  const mats = new Set();
  const M = (m) => { mats.add(m); return m; };
  let anim = () => {};

  if (type === 'bat') {
    const fur = M(pm('#5a3a50')), wingM = M(pm('#8a4a6a', { side: THREE.DoubleSide })), eye = M(pglow('#ff3020', 3));
    piece(body, G.sph(), fur, [0, 0, 0], [5, 4.5, 6]);
    piece(body, G.sph(), fur, [0, 2, 5], [3.4, 3.2, 3.4]);
    for (const s of [-1, 1]) {
      piece(body, G.cone(), fur, [s * 2, 5.5, 5], [1.1, 3, 1.1], [0, 0, -s * 0.3]);
      piece(body, G.sph(6), eye, [s * 1.3, 2.6, 7.8], [0.7, 0.7, 0.5]);
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(8, 3); shape.lineTo(17, 2); shape.lineTo(14, -2); shape.lineTo(10, -1); shape.lineTo(7, -4); shape.lineTo(3, -2);
    const wg = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const wings = [-1, 1].map((s) => { const p = pivot(body, [s * 3, 1, 0]); piece(p, wg, wingM, [0, 0, 0], [s, 1, 1]); return p; });
    anim = (t) => {
      const f = Math.sin(t * 26);
      wings[0].rotation.z = -f * 0.9; wings[1].rotation.z = f * 0.9;
      body.position.y = 14 + f * 1.5;
    };
  } else if (type === 'skull') {
    const head = pivot(body, [0, 14, 0]);
    if (skullProp) { skullProp.scale.setScalar(12); head.add(skullProp); skullProp.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color('#ffd8b0')); mats.add(o.material); } }); }
    else piece(head, G.sph(), M(pm('#e8dcc0')), [0, 4, 0], [6, 6, 6]);
    const eye = M(pglow('#ff3010', 3));
    for (const s of [-1, 1]) piece(head, G.sph(6), eye, [s * 2.4, 5, 5.2], [1.3, 1.3, 0.8]);
    const flames = [['#ff3a10', 7, 13], ['#ff8a20', 5, 16], ['#ffd040', 3, 12]].map(([c, r, h], i) => piece(head, G.cone(6), M(pglow(c, 3)), [0, 8 + i, -2 - i], [r, h, r], [-0.5, 0, 0]));
    for (const f of flames) { f.material.transparent = true; f.material.opacity = 0.85; f.material.depthWrite = false; }
    const halo = glowSprite('#ff7020', 46, 0.7);
    halo.position.y = 8;
    head.add(halo);
    anim = (t) => {
      flames.forEach((f, i) => { const k = 1 + Math.sin(t * (17 + i * 5)) * 0.18; f.scale.y = [13, 16, 12][i] * k; });
      head.rotation.z = Math.sin(t * 3) * 0.15;
    };
  } else if (type === 'spider') {
    const shell = M(pm('#3e2c48')), mark = M(pglow('#ff3020', 1.4)), eye = M(pglow('#ff2020', 3)), leg = M(pm('#5a4060'));
    const hull = pivot(body, [0, 10, 0]);
    piece(hull, G.sph(12), shell, [0, 2, -10], [11, 9, 13]);
    piece(hull, G.sph(8), mark, [0, 9.5, -11], [3.2, 1.2, 4.5]); // the red hourglass on its back
    for (const s of [-1, 1]) piece(hull, G.sph(6), mark, [s * 6, 7, -8], [1.6, 1, 2]);
    piece(hull, G.sph(10), shell, [0, 0, 3], [6.5, 5, 7]);
    piece(hull, G.sph(8), shell, [0, 0.5, 9], [4, 3.5, 3.5]);
    for (const [x, y] of [[-1.6, 2.2], [1.6, 2.2], [-2.8, 1.4], [2.8, 1.4], [-0.8, 3], [0.8, 3]]) piece(hull, G.sph(5), eye, [x, y, 11.5], [0.8, 0.8, 0.6]);
    for (const s of [-1, 1]) piece(hull, G.cone(4), shell, [s * 1.6, -2, 12], [0.9, 4, 0.9], [Math.PI, 0, 0]); // fangs
    const legs = [];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const hip = pivot(hull, [s * 4.5, 0, 6 - i * 3.6]);
      hip.rotation.y = s * (0.5 - i * 0.35) + (s > 0 ? 0 : Math.PI);
      const upper = pivot(hip);
      upper.rotation.z = 0.9;
      piece(upper, G.cyl(0.9, 1.1), leg, [0, 0, 0], [1, 13, 1], [0, 0, -Math.PI / 2]);
      const knee = pivot(upper, [13, 0, 0]);
      knee.rotation.z = -2.0;
      piece(knee, G.cyl(0.4, 0.9), leg, [0, 0, 0], [1, 15, 1], [0, 0, -Math.PI / 2]);
      legs.push({ upper, i, s });
    }
    anim = (t, moving, e) => {
      const crouch = e && e.cd2 > 0 ? 4 : 0;
      hull.position.y = 10 - crouch + (moving ? Math.abs(Math.sin(t * 16)) * 1.2 : 0);
      for (const l of legs) {
        const ph = t * 16 + l.i * 1.6 + (l.s > 0 ? Math.PI : 0);
        l.upper.rotation.y = moving ? Math.sin(ph) * 0.35 : 0;
        l.upper.rotation.z = 0.9 + (moving ? Math.max(0, Math.cos(ph)) * 0.3 : 0) + crouch * 0.05;
      }
    };
  } else if (type === 'hound') {
    const hide = M(pm('#6a2a1a')), ember = M(pglow('#ff6a10', 2.4)), eye = M(pglow('#ffe040', 3.5)), dark = M(pm('#24120c'));
    const torso = pivot(body, [0, 17, 0]);
    piece(torso, G.sph(10), hide, [0, 0, 2], [9, 9, 13]);
    piece(torso, G.sph(10), hide, [0, 1, 10], [8, 9, 8]);
    for (let i = 0; i < 6; i++) piece(torso, G.cone(4), ember, [0, 8.5 - i * 0.5, 11 - i * 4], [2, 7, 2], [-0.5, 0, 0]); // smouldering spines
    for (const s of [-1, 1]) piece(torso, G.box(), ember, [s * 7.6, 2, 2], [1, 2, 14]); // glowing cracks along its flanks
    const halo = glowSprite('#ff5010', 60, 0.45);
    halo.position.set(0, 4, 4);
    torso.add(halo);
    const head = pivot(torso, [0, 5, 17]);
    piece(head, G.sph(10), hide, [0, 0, 0], [6, 6, 7]);
    piece(head, G.box(), hide, [0, -1.5, 6], [6, 4, 8]);
    piece(head, G.box(), ember, [0, -3.3, 6.5], [5, 0.8, 7]); // glowing jaw
    for (const s of [-1, 1]) {
      piece(head, G.cone(4), dark, [s * 3.5, 6, -1], [1.6, 5, 1.6], [-0.3, 0, -s * 0.3]);
      piece(head, G.sph(6), eye, [s * 2.4, 1.6, 6], [1.4, 1.1, 0.8]);
    }
    const legs = [];
    for (const [z, front] of [[10, 1], [-6, 0]]) for (const s of [-1, 1]) {
      const hip = pivot(torso, [s * 5, -3, z]);
      piece(hip, G.cyl(1.4, 2.4), hide, [0, 0, 0], [1, 10, 1], [Math.PI, 0, 0]);
      const knee = pivot(hip, [0, -10, 0]);
      piece(knee, G.cyl(1, 1.4), dark, [0, 0, 0], [1, 9, 1], [Math.PI, 0, 0]);
      legs.push({ hip, knee, front, s });
    }
    const tailP = pivot(torso, [0, 3, -11]);
    piece(tailP, G.cyl(0.6, 1.4), hide, [0, 0, 0], [1, 12, 1], [-2.2, 0, 0]);
    anim = (t, moving, e) => {
      const crouch = e && e.cd2 > 0;
      const dash = e && e.charging > 0;
      const sp = dash ? 30 : 18;
      torso.position.y = (crouch ? 13 : 17) + (moving ? Math.sin(t * sp) * 1.4 : 0);
      torso.rotation.x = crouch ? 0.2 : 0;
      for (const l of legs) {
        const ph = t * sp + (l.front ? 0 : Math.PI * 0.6) + (l.s > 0 ? 0.4 : 0);
        l.hip.rotation.x = moving ? Math.sin(ph) * 0.7 : 0;
        l.knee.rotation.x = moving ? Math.max(0, -Math.sin(ph)) * 0.8 : crouch ? 0.6 : 0;
      }
      tailP.rotation.y = Math.sin(t * 8) * 0.4;
      head.rotation.x = Math.sin(t * 4) * 0.05;
    };
  }
  root.userData.mats = [...mats];
  for (const m of root.userData.mats) { m.userData.e0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; }
  root.userData.anim = anim;
  return root;
}

export const CREATURES = ['bat', 'skull', 'spider', 'hound'];
