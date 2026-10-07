// Loads the CC0 KayKit models (see assets/CREDITS.md) and provides animated character
// instances. Every character shares one rig, so one animation library drives them all.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODEL_SCALE = 16; // KayKit metres -> game units (one tile = 32 units = 2 m)

const CHARACTERS = ['warrior', 'valkyrie', 'wizard', 'archer', 'minotaur', 'falconess', 'jackal', 'tigress', 'skeleton_warrior', 'skeleton_minion', 'skeleton_rogue', 'skeleton_mage'];
// secret heroes are restyled from these base models
const CHAR_SOURCE = { minotaur: 'warrior', falconess: 'rogue', jackal: 'valkyrie', tigress: 'rogue' };
const PROPS = [
  'weapon_axe', 'weapon_blade', 'weapon_staff', 'weapon_crossbow',
  'torch', 'barrel', 'chest', 'chest_gold', 'key', 'coins', 'coins_big', 'food', 'food_b', 'potion', 'pillar', 'column',
  'banner_red', 'banner_blue', 'sword_shield', 'rubble', 'floor', 'floor_broken_a', 'floor_broken_b', 'floor_decorated',
  'floor_weeds', 'floor_grate', 'wall', 'wall_cracked', 'wall_gated', 'barrel_stack', 'crates', 'keg',
  'bones_a', 'bones_b', 'skull', 'ribcage', 'grave', 'gravestone', 'coffin', 'shrine', 'candles', 'skull_candle', 'pumpkin',
  'dirt_a', 'dirt_b', 'dirt_c', 'dirt_d', 'dirt_weeds', 'floor_wood', 'pillar_decorated',
  'tree_dead_small', 'tree_dead_medium', 'fence', 'lantern', 'post_lantern', 'quiver',
];

export const assets = { chars: {}, props: {}, clips: {}, ready: false };

// ---------- hero styling ----------
// The arcade heroes are colour-coded (red Warrior, blue Valkyrie, yellow Wizard, green
// Archer) and wear distinctive headgear. The CC0 base models are restyled at load time:
// cloth hues in each palette texture are shifted to the class colour, capes are repainted,
// and the stock hats are swapped for new headgear built here.
const HERO_STYLE = {
  warrior: {
    hue: [[190, 235, 3]],             // blue cloth -> red
    cape: '#b82414', hide: ['Barbarian_Hat'], scale: [1.08, 1.04, 1.08],
  },
  valkyrie: {
    hue: [[340, 360, 218], [0, 15, 218]], // red tunic and shield -> blue
    cape: '#1d58c8', hide: ['Knight_Helmet'], scale: [0.96, 1.02, 0.96],
  },
  wizard: {
    hue: [[225, 290, 46, 0.25], [300, 345, 272]], // purple robe -> gold, magenta trim -> purple
    cape: '#d8a818', hide: ['Mage_Hat'], scale: [1, 1, 1],
  },
  archer: {
    hue: [],
    cape: '#1a7a32', hide: [], scale: [0.97, 1, 0.97],
  },
  // secret heroes
  minotaur: {
    hue: [[190, 235, 20, 0, 0.7], [0, 40, 22, 0, 0.55], [345, 360, 22, 0, 0.55]], // blue cloth, red hair, skin -> dark hide
    cape: '#5a3016', hide: ['Barbarian_Hat'], scale: [1.16, 1.08, 1.16],
  },
  falconess: {
    hue: [[70, 175, 308, 0.1]],                     // green leathers -> orchid
    cape: '#f0e8f8', hide: ['Knife', 'Knife_Offhand'], scale: [0.95, 1, 0.95],
  },
  jackal: {
    hue: [[340, 360, 44, 0.15], [0, 15, 44, 0.15]],  // red -> gold
    cape: '#1a1a1e', hide: ['Knight_Helmet'], scale: [1, 1.03, 1],
  },
  tigress: {
    hue: [[70, 175, 26, 0.2]],                       // green -> tiger orange
    cape: '#ff8a20', hide: ['2H_Crossbow'], scale: [0.96, 1, 0.96],
  },
};

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// Re-hue the saturated swatches of a palette texture; returns a new texture.
function hueShiftTexture(tex, rules) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data, col = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    const [h, sat, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    if (sat < 0.22) continue;
    for (const [from, to, target, boost = 0, lightMul = 1] of rules) {
      if (h < from || h > to) continue;
      col.setHSL(target / 360, Math.min(1, sat + boost), (boost ? Math.min(0.62, l + 0.08) : l) * lightMul);
      d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255;
      break;
    }
  }
  ctx.putImageData(id, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.magFilter = THREE.NearestFilter;
  out.minFilter = THREE.NearestMipmapNearestFilter;
  return out;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, flatShading: true, ...opts });
}
const STEEL = () => mat('#c4c8d4', { metalness: 0.7, roughness: 0.35, flatShading: false });

// Headgear and accessories, in the head/chest bone's local space (KayKit metres).
function dressHero(name, scene) {
  const head = scene.getObjectByName('head');
  const chest = scene.getObjectByName('chest');
  const add = (parent, geo, material, p, r = [0, 0, 0], sc = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...p); m.rotation.set(...r); m.scale.set(...sc);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  };
  if (!head) return;
  if (name === 'warrior') {
    // horned steel helm with a nose guard
    const steel = STEEL();
    add(head, new THREE.SphereGeometry(0.66, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), steel, [0, 0.72, 0.02], [0, 0, 0], [1.04, 0.95, 1.04]);
    add(head, new THREE.TorusGeometry(0.62, 0.07, 6, 18), mat('#7a5a2a', { metalness: 0.4 }), [0, 0.6, 0.02], [Math.PI / 2, 0, 0]);
    add(head, new THREE.BoxGeometry(0.1, 0.42, 0.08), steel, [0, 0.42, 0.66]);
    const horn = mat('#efe6c8', { roughness: 0.5 });
    for (const s of [-1, 1]) {
      const h1 = add(head, new THREE.ConeGeometry(0.13, 0.55, 8), horn, [s * 0.66, 0.92, 0], [0, 0, -s * 1.15]);
      add(h1, new THREE.ConeGeometry(0.08, 0.4, 8), horn, [0, 0.38, 0], [0, 0, s * 0.7]);
    }
  } else if (name === 'valkyrie') {
    // open winged helm and long golden braids
    const steel = STEEL();
    add(head, new THREE.SphereGeometry(0.64, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), steel, [0, 0.74, -0.02], [0, 0, 0], [1.03, 0.9, 1.05]);
    add(head, new THREE.TorusGeometry(0.62, 0.06, 6, 18), mat('#e8c040', { metalness: 0.7, roughness: 0.3 }), [0, 0.7, -0.02], [Math.PI / 2, 0, 0]);
    const wing = mat('#ffffff', { side: THREE.DoubleSide, roughness: 0.7 });
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.quadraticCurveTo(0.25, 0.75, 0.15, 1.0); wingShape.lineTo(0.0, 0.62); wingShape.lineTo(-0.12, 0.85); wingShape.lineTo(-0.15, 0.4); wingShape.lineTo(-0.3, 0.55); wingShape.lineTo(-0.2, 0.05);
    const wingGeo = new THREE.ShapeGeometry(wingShape);
    for (const s of [-1, 1]) add(head, wingGeo, wing, [s * 0.6, 0.8, -0.1], [0, s * (Math.PI / 2 - 0.75), s * -0.3], [s * 1, 1, 1]);
    // blue tabard over the armour, trimmed in gold
    if (chest) {
      add(chest, new THREE.BoxGeometry(0.5, 0.42, 0.05), mat('#1d58c8', { roughness: 0.8 }), [0, -0.12, 0.36]);
      add(chest, new THREE.BoxGeometry(0.54, 0.05, 0.06), mat('#e8c040', { metalness: 0.6 }), [0, 0.08, 0.37]);
    }
    const hair = mat('#f2c84a', { roughness: 0.8 });
    add(head, new THREE.SphereGeometry(0.6, 12, 8), hair, [0, 0.55, -0.16], [0, 0, 0], [1.05, 0.8, 0.95]);
    for (const s of [-1, 1]) {
      const braid = add(head, new THREE.CylinderGeometry(0.1, 0.07, 1.0, 8), hair, [s * 0.5, -0.05, -0.15], [0.15, 0, s * 0.12]);
      add(braid, new THREE.SphereGeometry(0.1, 8, 6), mat('#c02020'), [0, -0.52, 0]);
    }
  } else if (name === 'wizard') {
    // tall pointed hat, long white beard
    const hatMat = mat('#5a2aa8', { roughness: 0.75 });
    add(head, new THREE.CylinderGeometry(0.82, 0.86, 0.08, 18), hatMat, [0, 0.86, 0]);
    const cone = add(head, new THREE.ConeGeometry(0.56, 1.6, 14), hatMat, [0, 1.62, -0.1], [-0.18, 0, 0]);
    add(cone, new THREE.ConeGeometry(0.2, 0.5, 10), hatMat, [0, 0.9, -0.12], [-0.55, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.6, 0.62, 0.14, 18), mat('#e8c040', { metalness: 0.6, roughness: 0.3 }), [0, 0.96, -0.02]);
    const star = mat('#ffe060', { emissive: '#ffcc30', emissiveIntensity: 0.9 });
    add(cone, new THREE.OctahedronGeometry(0.1), star, [0.2, -0.2, 0.42]);
    add(cone, new THREE.OctahedronGeometry(0.07), star, [-0.18, 0.2, 0.3]);
    const beard = mat('#f4f4f0', { roughness: 0.9 });
    add(head, new THREE.ConeGeometry(0.24, 0.75, 10), beard, [0, -0.08, 0.5], [Math.PI + 0.35, 0, 0]);
    add(head, new THREE.SphereGeometry(0.22, 10, 8), beard, [0, 0.2, 0.56], [0, 0, 0], [1.5, 0.55, 0.6]);
  } else if (name === 'archer') {
    // quiver on the back, a feather in the hood
    if (chest) {
      const q = assets.props.quiver ? assets.props.quiver.clone(true) : null;
      if (q) { q.position.set(0.25, 0.3, -0.45); q.rotation.set(0.25, 0, -0.35); chest.add(q); }
    }
    add(head, new THREE.ConeGeometry(0.06, 0.7, 6), mat('#d83a28'), [0.42, 1.1, -0.2], [0.3, 0, -0.5]);
  } else if (name === 'minotaur') {
    // bull's head: shaggy crown, broad snout with a ring, great curved horns
    const hide = mat('#5a3420', { roughness: 0.9, flatShading: false });
    add(head, new THREE.SphereGeometry(0.66, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), hide, [0, 0.66, -0.02], [0, 0, 0], [1.05, 0.95, 1.05]);
    add(head, new THREE.SphereGeometry(0.34, 12, 9), mat('#8a5a3a', { flatShading: false }), [0, 0.22, 0.56], [0, 0, 0], [1.1, 0.75, 0.75]);
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.06, 8, 6), mat('#1a1010'), [s * 0.12, 0.26, 0.82]);
    add(head, new THREE.TorusGeometry(0.12, 0.03, 6, 12), mat('#e8c040', { metalness: 0.8, roughness: 0.3 }), [0, 0.1, 0.8]);
    const horn = mat('#f0e6c8', { roughness: 0.45 });
    for (const s of [-1, 1]) {
      const base = add(head, new THREE.ConeGeometry(0.17, 0.75, 8), horn, [s * 0.72, 0.85, 0.05], [0, 0, -s * 1.45]);
      add(base, new THREE.ConeGeometry(0.1, 0.55, 8), horn, [0, 0.5, 0], [s * 0.3, 0, s * 0.9]);
      add(head, new THREE.ConeGeometry(0.1, 0.28, 6), hide, [s * 0.62, 0.55, -0.05], [0, 0, -s * 1.9]);
    }
  } else if (name === 'falconess') {
    // golden beak, feather crest, folded wings
    add(head, new THREE.ConeGeometry(0.13, 0.42, 8), mat('#f0b020', { metalness: 0.3 }), [0, 0.35, 0.68], [Math.PI / 2 + 0.3, 0, 0]);
    const plume = [mat('#ffffff'), mat('#b048a8'), mat('#ffffff')];
    plume.forEach((m, i) => add(head, new THREE.ConeGeometry(0.08, 0.8, 6), m, [(i - 1) * 0.16, 1.15, -0.25], [-0.6, 0, (i - 1) * 0.25]));
    if (chest) {
      const wing = mat('#f4f0fa', { side: THREE.DoubleSide, roughness: 0.8 });
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(1.1, 0.1); shape.lineTo(0.95, -0.25); shape.lineTo(0.75, -0.1); shape.lineTo(0.6, -0.45); shape.lineTo(0.4, -0.2); shape.lineTo(0.2, -0.5); shape.lineTo(0, -0.15);
      const geo = new THREE.ShapeGeometry(shape);
      for (const s of [-1, 1]) add(chest, geo, wing, [s * 0.18, 0.25, -0.42], [0.2, s * 0.5, 0], [s, 1, 1]);
    }
  } else if (name === 'jackal') {
    // black jackal mask with tall ears, striped royal headdress
    const black = mat('#18181c', { roughness: 0.5, flatShading: false });
    const gold = mat('#e0b040', { metalness: 0.7, roughness: 0.3 });
    add(head, new THREE.SphereGeometry(0.62, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.6), black, [0, 0.62, 0], [0, 0, 0], [1, 1, 1.05]);
    add(head, new THREE.BoxGeometry(0.3, 0.26, 0.55), black, [0, 0.38, 0.62], [0.12, 0, 0]);
    add(head, new THREE.BoxGeometry(0.12, 0.08, 0.06), mat('#ffcc30', { emissive: '#ffaa00', emissiveIntensity: 1 }), [-0.17, 0.62, 0.55]);
    add(head, new THREE.BoxGeometry(0.12, 0.08, 0.06), mat('#ffcc30', { emissive: '#ffaa00', emissiveIntensity: 1 }), [0.17, 0.62, 0.55]);
    for (const s of [-1, 1]) add(head, new THREE.ConeGeometry(0.14, 0.7, 4), black, [s * 0.32, 1.3, -0.05], [0, 0, -s * 0.15]);
    for (let i = 0; i < 4; i++) add(head, new THREE.BoxGeometry(0.9 + i * 0.06, 0.09, 0.12), i % 2 ? mat('#2050c0') : gold, [0, 0.35 - i * 0.16, -0.55]);
    add(head, new THREE.TorusGeometry(0.62, 0.05, 6, 18), gold, [0, 0.66, 0], [Math.PI / 2, 0, 0]);
  } else if (name === 'tigress') {
    // striped cat ears and a long tail
    const fur = mat('#ff8a20', { roughness: 0.8 });
    const stripe = mat('#201410');
    for (const s of [-1, 1]) {
      const ear = add(head, new THREE.ConeGeometry(0.18, 0.4, 4), fur, [s * 0.42, 1.12, -0.05], [0, 0, -s * 0.3]);
      add(ear, new THREE.ConeGeometry(0.08, 0.16, 4), stripe, [0, 0.14, 0.02]);
    }
    const hips = scene.getObjectByName('hips');
    if (hips) {
      let seg = hips;
      for (let i = 0; i < 6; i++) {
        seg = add(seg, new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), i % 2 ? stripe : fur, i === 0 ? [0, 0.1, -0.35] : [0, 0.28, 0], [i === 0 ? -1.1 : -0.25, 0, 0]);
      }
    }
  }
}

function styleHero(name, scene) {
  const st = HERO_STYLE[name];
  if (!st) return;
  const restyled = new Map();
  const victims = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (st.hide.includes(o.name)) { victims.push(o); return; }
    if (/Cape/.test(o.name)) { o.material = mat(st.cape, { flatShading: false, roughness: 0.85 }); o.userData.recolored = true; return; }
    const m = o.material;
    if (st.hue.length && m && m.map) {
      if (!restyled.has(m)) { const nm = m.clone(); nm.map = hueShiftTexture(m.map, st.hue); restyled.set(m, nm); }
      o.material = restyled.get(m);
    }
  });
  victims.forEach((o) => o.parent.remove(o));
  dressHero(name, scene);
  scene.userData.heroScale = st.scale;
}

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = [...CHARACTERS, ...PROPS, 'anims'];
  let done = 0;
  // props first: hero styling borrows some of them (e.g. the archer's quiver)
  const load = async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${CHAR_SOURCE[name] || name}.glb`);
    if (name === 'anims') for (const c of gltf.animations) assets.clips[c.name] = c;
    else if (CHARACTERS.includes(name)) assets.chars[name] = prepareCharacter(gltf.scene, name);
    else assets.props[name] = prepareProp(gltf.scene);
    onProgress(++done / names.length);
  };
  await Promise.all(names.filter((n) => !CHARACTERS.includes(n)).map(load));
  await Promise.all(CHARACTERS.map(load));
  assets.ready = true;
}

function prepareProp(scene) {
  scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
  });
  return scene;
}

// Merge the character's skinned body parts into one mesh to keep draw calls low.
function prepareCharacter(scene, name) {
  styleHero(name, scene);
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  // keep eyes separate so monsters' eyes can glow
  const mergeable = skinned.filter((m) => !/Eyes/i.test(m.name) && !m.userData.recolored);
  if (mergeable.length > 1) {
    try {
      const skinned = mergeable;
      const first = skinned[0];
      const sameMat = skinned.every((m) => m.material === first.material);
      const geos = skinned.map((m) => {
        const g = m.geometry.clone();
        // KayKit parts sit at identity under the armature; bake any local offset just in case
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
        return g;
      });
      const merged = sameMat ? mergeGeometries(geos, false) : null;
      if (merged) {
        const mesh = new THREE.SkinnedMesh(merged, first.material);
        mesh.name = 'Body';
        first.parent.add(mesh);
        mesh.bind(first.skeleton, first.bindMatrix);
        skinned.forEach((m) => m.parent.remove(m));
      }
    } catch { /* keep separate meshes */ }
  }
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.frustumCulled = false;
    // crisp texels to go with the pixelated rendering
    const map = o.material && o.material.map;
    if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; map.needsUpdate = true; }
  });
  return scene;
}

export function cloneProp(name) {
  return assets.props[name].clone(true);
}

// ---------- animated actors ----------

const LOWER = /^(root|hips|upperleg|lowerleg|foot|toes|kneeIK|control|heelIK|IK)/;
const variantCache = new Map();

function clipVariant(name, part) {
  const key = `${name}:${part}`;
  if (variantCache.has(key)) return variantCache.get(key);
  const base = assets.clips[name];
  if (!base) return null;
  let clip = base;
  if (part !== 'full') {
    clip = base.clone();
    clip.name = key;
    clip.tracks = clip.tracks.filter((t) => {
      const bone = t.name.split('.')[0];
      return part === 'lower' ? LOWER.test(bone) : !LOWER.test(bone);
    });
  }
  variantCache.set(key, clip);
  return clip;
}

// A character instance: a full-body base loop (idle / run) plus one-shot actions that
// either take over the whole body or just the upper body (so heroes can attack on the run).
export class Actor {
  constructor(charName, { tint = null, ghost = false, emissiveEyes = null } = {}) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(assets.chars[charName]);
    this.model.scale.setScalar(MODEL_SCALE);
    const hs = assets.chars[charName].userData.heroScale;
    if (hs) this.model.scale.set(MODEL_SCALE * hs[0], MODEL_SCALE * hs[1], MODEL_SCALE * hs[2]);
    this.root.add(this.model);
    this.mats = [];
    const matMap = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      let m = matMap.get(o.material);
      if (!m) {
        m = o.material.clone();
        if (tint) m.color.multiply(new THREE.Color(tint));
        if (ghost) {
          m.transparent = true; m.opacity = 0.55; m.depthWrite = false;
          m.emissive = new THREE.Color('#6080ff'); m.emissiveIntensity = 0.6;
          m.color.set('#d8e4ff');
        }
        m.userData.e0 = m.emissive.clone();
        m.userData.ei0 = m.emissiveIntensity;
        m.userData.o0 = m.opacity;
        m.userData.t0 = m.transparent;
        matMap.set(o.material, m);
        this.mats.push(m);
      }
      o.material = m;
      if (emissiveEyes && /Eyes/i.test(o.name)) { m.emissive.set(emissiveEyes); m.emissiveIntensity = 2; m.userData.e0 = m.emissive.clone(); m.userData.ei0 = 2; }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.baseName = null;
    this.baseAction = null;
    this.baseMode = 'full';
    this.oneShot = null;
    this.oneShotUpper = false;
    this.locked = false; // dead: stop responding
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot && e.action === this.oneShot) {
        if (this.locked) return;
        this.oneShot.fadeOut(0.12);
        this.oneShot = null;
        this.setBaseMode('full');
      }
    });
  }

  bone(name) {
    return this.model.getObjectByName(name.replace(/[.]/g, ''));
  }

  attach(propName, boneName, { scale = 1, rotation = null, position = null } = {}) {
    const b = this.bone(boneName);
    if (!b) return null;
    const p = cloneProp(propName);
    p.scale.setScalar(scale);
    if (rotation) p.rotation.set(...rotation);
    if (position) p.position.set(...position);
    b.add(p);
    p.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); this.mats.push(o.material); o.material.userData.e0 = o.material.emissive.clone(); o.material.userData.ei0 = o.material.emissiveIntensity; o.material.userData.o0 = o.material.opacity; o.material.userData.t0 = o.material.transparent; }
    });
    return p;
  }

  // Loop a base animation (idle/run/walk).
  base(name, timeScale = 1) {
    if (this.locked) return;
    if (this.baseName === name) { if (this.baseAction) this.baseAction.timeScale = timeScale; return; }
    const clip = clipVariant(name, this.oneShot && this.oneShotUpper ? 'lower' : 'full');
    if (!clip) return;
    const prev = this.baseAction;
    const a = this.mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.15).play();
    a.timeScale = timeScale;
    if (prev) prev.fadeOut(0.15);
    this.baseName = name;
    this.baseAction = a;
    this.baseMode = this.oneShot && this.oneShotUpper ? 'lower' : 'full';
  }

  setBaseMode(mode) {
    if (!this.baseName || this.baseMode === mode) return;
    const clip = clipVariant(this.baseName, mode);
    const a = this.mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.08).play();
    a.time = this.baseAction ? this.baseAction.time : 0;
    a.timeScale = this.baseAction ? this.baseAction.timeScale : 1;
    if (this.baseAction) this.baseAction.fadeOut(0.08);
    this.baseAction = a;
    this.baseMode = mode;
  }

  // Play a one-shot. upper=true keeps the legs on the base loop.
  play(name, { upper = false, timeScale = 1, clamp = false, fade = 0.08 } = {}) {
    if (this.locked) return;
    const clip = clipVariant(name, upper ? 'upper' : 'full');
    if (!clip) return;
    if (this.oneShot) this.oneShot.fadeOut(fade);
    const a = this.mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(fade).play();
    a.clampWhenFinished = clamp;
    a.timeScale = timeScale;
    this.oneShot = a;
    this.oneShotUpper = upper;
    this.setBaseMode(upper ? 'lower' : 'full');
    if (!upper && this.baseAction) this.baseAction.setEffectiveWeight(0.0001);
  }

  die(name = 'Death_A') {
    this.play(name, { clamp: true, fade: 0.1 });
    this.locked = true;
  }

  get busy() { return !!this.oneShot; }

  update(dt) {
    if (this.baseAction && !this.oneShot && this.baseAction.getEffectiveWeight() < 0.5) this.baseAction.setEffectiveWeight(1);
    this.mixer.update(dt);
  }

  flash(amount, color = '#ffffff') {
    const on = amount > 0;
    if (!on && !this.flashing) return;
    this.flashing = on;
    for (const m of this.mats) {
      if (on) { m.emissive.set(color); m.emissiveIntensity = 0.8; }
      else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; }
    }
  }

  fade(opacity) {
    if (this.opacity === opacity) return;
    this.opacity = opacity;
    for (const m of this.mats) {
      m.transparent = opacity < 1 || m.userData.t0;
      m.opacity = opacity < 1 ? opacity * m.userData.o0 : m.userData.o0;
      m.depthWrite = !m.transparent || m.userData.t0 === false && opacity >= 1;
      m.needsUpdate = true;
    }
  }
}
