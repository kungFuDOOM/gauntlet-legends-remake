// Builds the game's 3D assets from the free CC0 KayKit packs by Kay Lousberg (kaylousberg.com).
//
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0  <dir>/...
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0   <dir>/...
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0         <dir>/...
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0             <dir>/...
//   npm install && node tools/build-assets.mjs <dir>
//
// Characters are written without animations; every character shares one rig, so a single
// animation library (anims.glb) drives all of them. Unused weapon meshes are removed and
// everything is meshopt-compressed (decoded in the browser by three's MeshoptDecoder).

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-assets.mjs <dir-with-kaykit-clones>'); process.exit(1); }
const out = new URL('../assets/models/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const ADV = join(src, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures');
const SKL = join(src, 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons');
const DUN = join(src, 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf');
const HAL = join(src, 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function convert(file, name, { dropNodes = [], keepAnims = null } = {}) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) {
    if (keepAnims && keepAnims.includes(anim.getName())) continue;
    // samplers outlive their animation unless disposed explicitly
    anim.listChannels().forEach((c) => c.dispose());
    anim.listSamplers().forEach((s) => s.dispose());
    anim.dispose();
  }
  for (const node of root.listNodes()) {
    if (dropNodes.includes(node.getName()) || (keepAnims && node.getMesh())) node.dispose();
  }
  await doc.transform(prune(), dedup(), resample());
  await doc.transform(meshopt({
    encoder: MeshoptEncoder,
    level: 'medium',
    // one quantization volume per file keeps a single shared skin, so a character's parts can be merged
    quantizationVolume: root.listMeshes().length ? 'scene' : 'mesh',
  }));
  const path = join(out, `${name}.glb`);
  await io.write(path, doc);
  console.log(`${name}.glb`.padEnd(28), `${Math.round(statSync(path).size / 1024)} KB`);
}

// Heroes
await convert(join(ADV, 'Characters/gltf/Barbarian.glb'), 'warrior', { dropNodes: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'] });
await convert(join(ADV, 'Characters/gltf/Knight.glb'), 'valkyrie', { dropNodes: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'] });
await convert(join(ADV, 'Characters/gltf/Mage.glb'), 'wizard', { dropNodes: ['Spellbook', 'Spellbook_open', '1H_Wand'] });
await convert(join(ADV, 'Characters/gltf/Rogue_Hooded.glb'), 'archer', { dropNodes: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'] });

// Monsters
for (const s of ['Warrior', 'Minion', 'Rogue', 'Mage']) await convert(join(SKL, `Characters/gltf/Skeleton_${s}.glb`), `skeleton_${s.toLowerCase()}`);
for (const w of ['Axe', 'Blade', 'Staff', 'Crossbow']) await convert(join(SKL, `Assets/gltf/Skeleton_${w}.gltf`), `weapon_${w.toLowerCase()}`);
await convert(join(ADV, 'Assets/gltf/quiver.gltf'), 'quiver');

// Shared animation library
await convert(join(SKL, 'Characters/gltf/Skeleton_Minion.glb'), 'anims', {
  keepAnims: [
    'Idle', '2H_Melee_Idle', 'Idle_Combat', 'Running_A', 'Running_B', 'Running_C', 'Walking_A', 'Walking_D_Skeletons',
    '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Chop',
    '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spinning', 'Throw', 'Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise',
    '2H_Ranged_Shoot', '1H_Ranged_Shoot', 'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Death_C_Skeletons', 'Cheer',
    'Dodge_Forward', 'Spawn_Ground', 'Spawn_Air', 'Unarmed_Melee_Attack_Punch_A',
  ],
});

// Dungeon dressing and pickups
const props = {
  torch: 'torch_mounted.gltf.glb', barrel: 'barrel_small.gltf.glb', chest: 'chest.glb', chest_gold: 'chest_gold.glb',
  key: 'key.gltf.glb', coins: 'coin_stack_small.gltf.glb', coins_big: 'coin_stack_medium.gltf.glb',
  food: 'plate_food_A.gltf.glb', food_b: 'plate_food_B.gltf.glb', potion: 'bottle_A_labeled_green.gltf.glb',
  pillar: 'pillar.gltf.glb', column: 'column.gltf.glb', banner_red: 'banner_patternA_red.gltf.glb', banner_blue: 'banner_patternB_blue.gltf.glb',
  sword_shield: 'sword_shield.gltf.glb', rubble: 'rubble_half.gltf.glb',
  floor: 'floor_tile_small.gltf.glb', floor_broken_a: 'floor_tile_small_broken_A.gltf.glb', floor_broken_b: 'floor_tile_small_broken_B.gltf.glb',
  floor_decorated: 'floor_tile_small_decorated.gltf.glb', floor_weeds: 'floor_tile_small_weeds_A.gltf.glb', floor_grate: 'floor_tile_grate.gltf.glb',
  wall: 'wall.gltf.glb', wall_cracked: 'wall_cracked.gltf.glb', wall_gated: 'wall_gated.gltf.glb', barrel_stack: 'barrel_small_stack.gltf.glb',
  crates: 'crates_stacked.gltf.glb', keg: 'keg_decorated.gltf.glb',
  dirt_a: 'floor_dirt_small_A.gltf.glb', dirt_b: 'floor_dirt_small_B.gltf.glb', dirt_c: 'floor_dirt_small_C.gltf.glb',
  dirt_d: 'floor_dirt_small_D.gltf.glb', dirt_weeds: 'floor_dirt_small_weeds.gltf.glb', floor_wood: 'floor_wood_small.gltf.glb',
  pillar_decorated: 'pillar_decorated.gltf.glb',
};
for (const [name, f] of Object.entries(props)) await convert(join(DUN, f), name);
const spooky = {
  bones_a: 'bone_A.gltf', bones_b: 'bone_B.gltf', skull: 'skull.gltf', ribcage: 'ribcage.gltf', grave: 'grave_A.gltf',
  gravestone: 'gravestone.gltf', coffin: 'coffin_decorated.gltf', shrine: 'shrine_candles.gltf', candles: 'candle_triple.gltf',
  skull_candle: 'skull_candle.gltf', pumpkin: 'pumpkin_orange_jackolantern.gltf',
  tree_dead_small: 'tree_dead_small.gltf', tree_dead_medium: 'tree_dead_medium.gltf', fence: 'fence.gltf',
  lantern: 'lantern_standing.gltf', post_lantern: 'post_lantern.gltf',
};
for (const [name, f] of Object.entries(spooky)) await convert(join(HAL, f), name);
