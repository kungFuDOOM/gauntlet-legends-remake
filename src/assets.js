// Loads the CC0 KayKit models (see assets/CREDITS.md) and provides animated character
// instances. Every character shares one rig, so one animation library drives them all.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODEL_SCALE = 16; // KayKit metres -> game units (one tile = 32 units = 2 m)

const CHARACTERS = ['warrior', 'valkyrie', 'wizard', 'archer', 'skeleton_warrior', 'skeleton_minion', 'skeleton_rogue', 'skeleton_mage'];
const PROPS = [
  'weapon_axe', 'weapon_blade', 'weapon_staff', 'weapon_crossbow',
  'torch', 'barrel', 'chest', 'chest_gold', 'key', 'coins', 'coins_big', 'food', 'food_b', 'potion', 'pillar', 'column',
  'banner_red', 'banner_blue', 'sword_shield', 'rubble', 'floor', 'floor_broken_a', 'floor_broken_b', 'floor_decorated',
  'floor_weeds', 'floor_grate', 'wall', 'wall_cracked', 'wall_gated', 'barrel_stack', 'crates', 'keg',
  'bones_a', 'bones_b', 'skull', 'ribcage', 'grave', 'gravestone', 'coffin', 'shrine', 'candles', 'skull_candle', 'pumpkin',
  'dirt_a', 'dirt_b', 'dirt_c', 'dirt_d', 'dirt_weeds', 'floor_wood', 'pillar_decorated',
  'tree_dead_small', 'tree_dead_medium', 'fence', 'lantern', 'post_lantern',
];

export const assets = { chars: {}, props: {}, clips: {}, ready: false };

// Class colours from the arcade: repaint each hero's cape (and the wizard's robe trim).
const RECOLOR = {
  warrior: { Cape: '#c82818' },
  valkyrie: { Cape: '#1e5ad0' },
  wizard: { Cape: '#e8c020' },
  archer: { Cape: '#1e8a38' },
};

// Capes get a solid class-coloured cloth material (the source palettes lack these hues).
function recolor(mesh, hex) {
  mesh.material = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0 });
  mesh.userData.recolored = true;
}

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = [...CHARACTERS, ...PROPS, 'anims'];
  let done = 0;
  await Promise.all(names.map(async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
    if (name === 'anims') for (const c of gltf.animations) assets.clips[c.name] = c;
    else if (CHARACTERS.includes(name)) assets.chars[name] = prepareCharacter(gltf.scene, RECOLOR[name]);
    else assets.props[name] = prepareProp(gltf.scene);
    onProgress(++done / names.length);
  }));
  assets.ready = true;
}

function prepareProp(scene) {
  scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
  });
  return scene;
}

// Merge the character's skinned body parts into one mesh to keep draw calls low.
function prepareCharacter(scene, colors) {
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (colors) {
    scene.traverse((m) => {
      if (!m.isMesh) return;
      for (const [part, hex] of Object.entries(colors)) if (m.name.includes(part)) recolor(m, hex);
    });
  }
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
