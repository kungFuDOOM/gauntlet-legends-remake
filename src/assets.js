// Loads the CC0 KayKit models (see assets/CREDITS.md) and provides animated character
// instances. Every character shares one rig, so one animation library drives them all.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHero } from './heroes.js';
import { buildMonster, BUILT_MONSTERS } from './monsters.js';

export const MODEL_SCALE = 16; // KayKit metres -> game units (one tile = 32 units = 2 m)

// Monster models; heroes are built in heroes.js on the rig taken from 'warrior.glb'.
const CHARACTERS = ['skeleton_warrior', 'skeleton_minion', 'skeleton_rogue', 'skeleton_mage'];
export const HERO_CLASSES = ['warrior', 'valkyrie', 'wizard', 'archer', 'dwarf', 'knight', 'jester', 'sorceress', 'minotaur', 'falconess', 'jackal', 'tigress', 'merchant'];
export const HERO_SCALE = 27; // adult heroes are ~1.75 m tall -> ~47 game units
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

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = [...CHARACTERS, ...PROPS, 'anims', 'warrior'];
  let done = 0;
  const load = async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
    if (name === 'warrior') { buildHeroes(gltf.scene); onProgress(++done / names.length); return; }
    if (name === 'anims') {
      // bone scale tracks are constant; dropping them lets us re-proportion the skeletons
      for (const c of gltf.animations) { c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale')); assets.clips[c.name] = c; }
    }
    else if (CHARACTERS.includes(name)) assets.chars[name] = prepareCharacter(gltf.scene);
    else assets.props[name] = prepareProp(gltf.scene);
    onProgress(++done / names.length);
  };
  await Promise.all(names.map(load));
  assets.ready = true;
}

// Strip the KayKit meshes off the rig and build every hero on a copy of the bare skeleton.
function buildHeroes(scene) {
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.forEach((m) => m.parent.remove(m));
  for (const cls of HERO_CLASSES) {
    const rig = SkeletonUtils.clone(scene);
    rig.userData.adult = buildHero(cls, rig);
    assets.chars[cls] = rig;
  }
  // the realms' humanoid monsters (monsters.js), built the same way
  for (const type of BUILT_MONSTERS) {
    const rig = SkeletonUtils.clone(scene);
    rig.userData.adult = buildMonster(type, rig);
    assets.chars[`m_${type}`] = rig;
  }
}

function prepareProp(scene) {
  scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
  });
  return scene;
}

// Merge the character's skinned body parts into one mesh to keep draw calls low.
function prepareCharacter(scene) {
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

// ---------- monster proportions ----------
// The CC0 skeletons are chibi (the head is nearly half their height), so each is
// re-proportioned at spawn by scaling bones along their length (bone-local Y), with hands
// and feet scaled back so weapons stay their normal size.
const BUILDS = {
  monster: { head: 0.55, spine: 1.2, chest: [1.08, 1.1, 1.05], leg: 1.75, legW: 1.08, arm: 1.4, armW: 1.05 },
};
const LEG_LEN = 0.376; // thigh + shin in the base rig, metres

function applyBuild(model, build) {
  const b = BUILDS[build];
  if (!b) return 0;
  const bone = (n) => model.getObjectByName(n);
  const set = (n, x, y, z) => { const o = bone(n); if (o) o.scale.set(x, y, z); };
  set('spine', 1, b.spine, 1);
  set('chest', ...b.chest);
  const [cx, cy, cz] = b.chest;
  set('head', b.head / cx, b.head / cy, b.head / cz);
  for (const side of ['l', 'r']) {
    set(`upperleg${side}`, b.legW, b.leg, b.legW);
    set(`foot${side}`, 1.05 / b.legW, 1.05 / b.leg, 1.05 / b.legW);
    set(`upperarm${side}`, b.armW, b.arm, b.armW);
    set(`hand${side}`, 1 / (b.armW * cx), 1 / b.arm, 1 / (b.armW * cz));
  }
  return LEG_LEN * (b.leg - 1); // how far the hips must rise to keep the feet on the ground
}

// ---------- animated actors ----------

const LOWER = /^(root|hips|upperleg|lowerleg|foot|toes|kneeIK|control|heelIK|IK)/;
const variantCache = new Map();
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function clipVariant(name, part, adult = 0) {
  const key = `${name}:${part}:${adult}`;
  if (variantCache.has(key)) return variantCache.get(key);
  let base = assets.clips[name];
  if (!base) return null;
  if (adult) {
    // built heroes have adult bone lengths: keep rotations, scale hip/root motion to match
    base = base.clone();
    base.tracks = base.tracks.filter((t) => !t.name.endsWith('.position') || /^(hips|root)\./.test(t.name)).map((t) => {
      if (!t.name.endsWith('.position')) return t;
      const c = t.clone();
      for (let i = 0; i < c.values.length; i++) c.values[i] *= adult;
      return c;
    });
  }
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
    this.adult = assets.chars[charName].userData.adult || 0;
    if (this.adult) {
      this.model.scale.setScalar(HERO_SCALE);
    } else {
      this.model.scale.setScalar(MODEL_SCALE * 0.84);
      const lift = applyBuild(this.model, 'monster');
      this.model.position.y = lift * this.model.scale.y;
    }
    this.root.add(this.model);
    this.mats = [];
    const matMap = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      let m = matMap.get(o.material);
      if (!m) {
        m = o.material.clone();
        if (tint) m.color.multiply(new THREE.Color(tint));
        if (ghost) { // a colour string picks the ghost's glow
          m.transparent = true; m.opacity = 0.55; m.depthWrite = false;
          m.emissive = new THREE.Color(typeof ghost === 'string' ? ghost : '#6080ff'); m.emissiveIntensity = 0.6;
          m.color.set(m.emissive).lerp(new THREE.Color('#ffffff'), 0.8);
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
    const clip = clipVariant(name, this.oneShot && this.oneShotUpper ? 'lower' : 'full', this.adult);
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
    const clip = clipVariant(this.baseName, mode, this.adult);
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
    const clip = clipVariant(name, upper ? 'upper' : 'full', this.adult);
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
    // Paused (no time passed): leave the pose alone. The mixer doesn't rewrite bones for a
    // zero step, so adultPose's relative arm turn would pile up every frame and spin the arms.
    if (!(dt > 0)) return;
    if (this.baseAction && !this.oneShot && this.baseAction.getEffectiveWeight() < 0.5) this.baseAction.setEffectiveWeight(1);
    this.mixer.update(dt);
    if (this.adult) this.adultPose();
  }

  // The shared animations hold the arms well out from a chibi's wide body; bring them in
  // toward an adult's sides (less so during attacks, which need the full swing).
  adultPose() {
    if (!this.arms) this.arms = ['l', 'r'].map((s) => [this.model.getObjectByName(`upperarm${s}`), s === 'l' ? 1 : -1]);
    const k = this.oneShot ? 0.2 : 0.55;
    for (const [b, s] of this.arms) if (b) b.rotateOnAxis(AXIS_Z, -s * k);
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
