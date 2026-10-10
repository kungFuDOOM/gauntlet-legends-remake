// Three.js renderer. Builds the dungeon from the tile map out of modular KayKit pieces and
// keeps an animated 3D model in sync with every simulated entity. The simulation stays 2D
// on the ground plane (sim x -> world X, sim y -> world Z), as in the arcade original.

import * as THREE from 'three';
import { TILE, VIEW_W, VIEW_H, WORLD_VIEW_W, WORLD_VIEW_H, POWERUPS, LOBBED, ENEMIES } from './config.js';
import { T } from './level.js';
import { assets, Actor, cloneProp, MODEL_SCALE, HERO_SCALE } from './assets.js';
import { buildCreature } from './monsters.js';
import { capTexture, crackedTexture, grassTexture, lavaTexture, glowTexture, glowSprite, webTexture, buildBoss, buildExit, buildProjectile, buildMarker, buildItem, heroColor } from './models.js';

const WALL_H = 52;
const CAM_OFFSET = new THREE.Vector3(0, 380, 240);
const MAX_PARTICLES = 900;
// Phones get fewer dynamic lights; each one costs on every pixel.
const LOW_POWER = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const TORCH_LIGHTS = LOW_POWER ? 4 : 8;
const S = MODEL_SCALE;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// How each class is animated.
const HERO_STYLE = {
  warrior: { idle: '2H_Melee_Idle', melee: '2H_Melee_Attack_Chop', shoot: 'Throw', turbo: '2H_Melee_Attack_Spinning', meleeSpeed: 2.2, shootSpeed: 2.4 },
  valkyrie: { idle: 'Idle', melee: '1H_Melee_Attack_Slice_Diagonal', shoot: 'Throw', turbo: 'Dodge_Forward', meleeSpeed: 2.2, shootSpeed: 2.6 },
  wizard: { idle: 'Idle', melee: '1H_Melee_Attack_Stab', shoot: 'Spellcast_Shoot', turbo: 'Spellcast_Long', meleeSpeed: 2.2, shootSpeed: 2.6 },
  archer: { idle: 'Idle', melee: '1H_Melee_Attack_Stab', shoot: '2H_Ranged_Shoot', turbo: '2H_Ranged_Shoot', meleeSpeed: 2.4, shootSpeed: 3.2 },
  dwarf: { idle: '2H_Melee_Idle', melee: '2H_Melee_Attack_Chop', shoot: 'Throw', turbo: '2H_Melee_Attack_Spinning', meleeSpeed: 2.1, shootSpeed: 2.3 },
  knight: { idle: 'Idle', melee: '1H_Melee_Attack_Slice_Diagonal', shoot: 'Throw', turbo: 'Dodge_Forward', meleeSpeed: 2.2, shootSpeed: 2.5 },
  jester: { idle: 'Idle', melee: '1H_Melee_Attack_Stab', shoot: 'Throw', turbo: 'Throw', meleeSpeed: 2.6, shootSpeed: 3.2 },
  sorceress: { idle: 'Idle', melee: '1H_Melee_Attack_Stab', shoot: 'Spellcast_Shoot', turbo: 'Spellcast_Long', meleeSpeed: 2.2, shootSpeed: 2.6 },
  minotaur: { idle: '2H_Melee_Idle', melee: '2H_Melee_Attack_Chop', shoot: 'Throw', turbo: '2H_Melee_Attack_Spinning', meleeSpeed: 2, shootSpeed: 2.2 },
  falconess: { idle: 'Idle', melee: '1H_Melee_Attack_Stab', shoot: '2H_Ranged_Shoot', turbo: '2H_Ranged_Shoot', meleeSpeed: 2.4, shootSpeed: 3.3 },
  jackal: { idle: 'Idle', melee: '1H_Melee_Attack_Slice_Diagonal', shoot: 'Throw', turbo: 'Dodge_Forward', meleeSpeed: 2.3, shootSpeed: 2.6 },
  tigress: { idle: 'Idle', melee: '1H_Melee_Attack_Slice_Diagonal', shoot: 'Throw', turbo: '2H_Melee_Attack_Spinning', meleeSpeed: 2.6, shootSpeed: 2.8 },
};

// How each monster looks: a KayKit skeleton (model), a built monster ('m_' + type, see
// monsters.js) or a procedural creature (proc), plus its walk cycle and size.
const ENEMY_STYLE = {
  goblin: { model: 'm_goblin', walk: 'Running_A', walkSpeed: 1.7, scale: 1 },
  bat: { proc: 'bat', float: true, scale: 1.5 },
  bomber: { model: 'm_bomber', walk: 'Running_A', walkSpeed: 1.5, scale: 1 },
  orc: { model: 'm_orc', walk: 'Walking_A', walkSpeed: 1.25, scale: 1.12 },
  shaman: { model: 'm_shaman', walk: 'Walking_A', walkSpeed: 1.6, scale: 1 },
  grunt: { model: 'skeleton_minion', weapon: 'weapon_blade', walk: 'Walking_D_Skeletons', walkSpeed: 1.6, scale: 1 },
  ghost: { model: 'skeleton_minion', ghost: true, walk: 'Running_C', walkSpeed: 1.2, scale: 0.95, float: true },
  archer: { model: 'skeleton_rogue', weapon: 'weapon_crossbow', walk: 'Running_C', walkSpeed: 1.3, scale: 0.92, shoot: '1H_Ranged_Shoot' },
  lobber: { model: 'skeleton_rogue', walk: 'Running_C', walkSpeed: 1.3, scale: 0.85 },
  knight: { model: 'm_knight', walk: 'Walking_A', walkSpeed: 1.15, scale: 1.08, melee: '1H_Melee_Attack_Slice_Diagonal' },
  sorcerer: { model: 'skeleton_mage', weapon: 'weapon_staff', tint: '#d8a0ff', eyes: '#ff40ff', walk: 'Walking_A', walkSpeed: 1.4, scale: 1 },
  zombie: { model: 'm_zombie', walk: 'Walking_D_Skeletons', walkSpeed: 1.05, scale: 1, melee: 'Unarmed_Melee_Attack_Punch_A' },
  wraith: { model: 'skeleton_mage', ghost: '#30ff90', walk: 'Running_C', walkSpeed: 1.2, scale: 1, float: true },
  spider: { proc: 'spider', scale: 1 },
  plaguer: { model: 'm_plaguer', walk: 'Walking_A', walkSpeed: 1.5, scale: 1 },
  witch: { model: 'm_witch', walk: 'Walking_A', walkSpeed: 1.5, scale: 1 },
  imp: { model: 'm_imp', walk: 'Running_A', walkSpeed: 1.8, scale: 1, melee: '1H_Melee_Attack_Stab' },
  skull: { proc: 'skull', float: true, scale: 1.5 },
  hound: { proc: 'hound', scale: 1.15 },
  demon: { model: 'm_demon', walk: 'Walking_A', walkSpeed: 1.2, scale: 1.15 },
  warlock: { model: 'm_warlock', walk: 'Walking_A', walkSpeed: 1.4, scale: 1 },
  death: { model: 'skeleton_mage', weapon: 'weapon_staff', tint: '#3a3440', eyes: '#ff1010', walk: 'Walking_A', walkSpeed: 1.2, scale: 1.25 },
};

export class Renderer3D {
  constructor(canvas) {
    // Rendered at a reduced resolution and scaled up with hard pixel edges for a chunky,
    // retro look (see setPixelation); antialiasing would only smear the pixels.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.canvas = canvas;
    this.setPixelation(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, VIEW_W / VIEW_H, 10, 3000);
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight('#ffffff', '#202020', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 1);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.torchLights = [];
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight('#ff9a50', 0, 260, 1);
      this.scene.add(l);
      this.torchLights.push(l);
    }
    this.playerLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 200, 1);
      this.scene.add(l);
      this.playerLights.push(l);
    }
    this.exitLight = new THREE.PointLight('#60c0ff', 0, 220, 1);
    this.scene.add(this.exitLight);

    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 9, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // soft blob shadow shared by every character and pickup (N64-era style, and cheap)
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sctx = sc.getContext('2d');
    const grd = sctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grd;
    sctx.fillRect(0, 0, 64, 64);
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false });

    this.views = new Map();
    this.corpses = [];
    this.markers = new Map();
    this.levelGroup = null;
    this.level = null;
    this.tmpColor = new THREE.Color();
    this.tmpV = new THREE.Vector3();
    this.lastTime = 0;
  }

  // 0 = off (full resolution), 1 = retro (default), 2 = chunky.
  setPixelation(level) {
    this.pixelLevel = level;
    const ratio = [Math.min(window.devicePixelRatio || 1, 2), 0.6, 0.4][level];
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.canvas.style.imageRendering = level ? 'pixelated' : 'auto';
    return ['Pixels: OFF', 'Pixels: RETRO', 'Pixels: CHUNKY'][level];
  }

  blob(parent, size) {
    const m = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    m.scale.set(size, 1, size);
    m.position.y = 1;
    m.renderOrder = 1;
    parent.add(m);
    return m;
  }

  // ---------- level construction ----------

  // Instanced copies of a prop at many transforms ({x, y, z, ry, sx, sy, sz}).
  instanced(group, name, list, tint = null) {
    if (!list.length) return;
    const tpl = assets.props[name];
    tpl.updateMatrixWorld(true);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    tpl.traverse((mesh) => {
      if (!mesh.isMesh) return;
      let mat = mesh.material;
      if (tint) { mat = mat.clone(); mat.color.multiply(new THREE.Color(tint)); }
      const inst = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.ry || 0);
        sc.set(t.sx ?? S, t.sy ?? S, t.sz ?? S);
        pos.set(t.x, t.y || 0, t.z);
        m4.compose(pos, q, sc).multiply(mesh.matrixWorld);
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    });
  }

  // Instanced primitive (rocks, slabs, lava tiles) with optional per-instance colour.
  instancedPrim(group, geometry, material, list) {
    if (!list.length) return null;
    const inst = new THREE.InstancedMesh(geometry, material, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((t, i) => {
      e.set(t.rx || 0, t.ry || 0, t.rz || 0);
      q.setFromEuler(e);
      sc.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      pos.set(t.x, t.y || 0, t.z);
      inst.setMatrixAt(i, m4.compose(pos, q, sc));
      if (t.color) inst.setColorAt(i, col.set(t.color));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
    return inst;
  }

  buildLevel(g) {
    if (this.levelGroup) this.scene.remove(this.levelGroup);
    for (const [, v] of this.views) this.scene.remove(v.root);
    this.views.clear();
    for (const c of this.corpses) this.scene.remove(c.root);
    this.corpses = [];
    for (const [, m] of this.markers) this.scene.remove(m);
    this.markers.clear();

    const th = g.theme;
    const style = g.info.style;
    const group = new THREE.Group();
    this.levelGroup = group;
    this.level = g.level;
    this.scene.add(group);
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = style === 'sky' ? new THREE.Fog(th.fog, 500, 1300) : new THREE.Fog(th.fog, 450, 1000);
    this.hemi.color.set(th.light);
    this.hemi.groundColor.set(style === 'sky' ? '#8090a0' : th.fog);
    this.hemi.intensity = th.ambient * 1.5;
    this.sun.color.set(th.light);
    this.sun.intensity = th.ambient * 1.2 + 0.2;

    const { w, h } = g;
    const ground = g.level.ground;
    const tileAt = (x, y) => g.tile(x, y);
    const isWall = (x, y) => tileAt(x, y) === T.WALL;
    const isVoid = (x, y) => tileAt(x, y) === T.VOID;
    const open = (x, y) => { const t = tileAt(x, y); return t !== T.WALL && t !== T.VOID; };
    const rnd = (x, y, k = 0) => hash(x * 13 + k * 101, y * 7 + k * 31);
    this.torches = [];
    this.clouds = [];
    this.lavaMats = [];

    // ---- ground ----
    const floorKinds = style === 'canyon' || style === 'inferno'
      ? [['dirt_a', 0.3], ['dirt_b', 0.25], ['dirt_c', 0.2], ['dirt_d', 0.15], ['dirt_weeds', style === 'canyon' ? 0.1 : 0.0001]]
      : [['floor', 0.76], ['floor_broken_a', 0.1], ['floor_broken_b', 0.09], ['floor_weeds', style === 'sky' ? 0.0001 : 0.03], ['floor_decorated', 0.02]];
    const floorTint = th.floorTint || (style === 'inferno' ? '#c88870' : style === 'sky' ? '#e8eef4' : null);
    const floors = Object.fromEntries(floorKinds.map(([k]) => [k, []]));
    const grass = [], bridges = [], lava = [], slabs = [];
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const t = tileAt(tx, ty);
        if (t === T.VOID || (t === T.WALL && style !== 'sky' && !this.isPillar(g, tx, ty))) continue;
        const x = tx * TILE + 16, z = ty * TILE + 16, ry = Math.floor(rnd(ty, tx) * 4) * Math.PI / 2;
        if (style === 'sky') slabs.push({ x, y: -21, z, sx: 32.5, sy: 42, sz: 32.5, color: rnd(tx, ty, 5) < 0.5 ? th.rock : '#7c868e' });
        if (t === T.LAVA) { lava.push({ x, y: -2, z, rx: -Math.PI / 2 }); continue; }
        if (t === T.BRIDGE) { bridges.push({ x, z, ry: (open(tx - 1, ty) && tileAt(tx - 1, ty) !== T.LAVA) || tileAt(tx + 1, ty) === T.BRIDGE ? 0 : Math.PI / 2 }); continue; }
        if (ground && ground[ty * w + tx] === 1) { grass.push({ x, y: 0.4, z, rx: -Math.PI / 2, rz: ry }); continue; }
        let r = rnd(tx, ty), kind = floorKinds[0][0];
        for (const [k, p] of floorKinds) { if ((r -= p) < 0) { kind = k; break; } }
        floors[kind].push({ x, z, ry });
      }
    for (const [k, list] of Object.entries(floors)) this.instanced(group, k, list, floorTint);
    this.instanced(group, 'floor_wood', bridges);
    if (grass.length) this.instancedPrim(group, new THREE.PlaneGeometry(32, 32), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }), grass);
    if (lava.length) {
      const souls = th.hazard === 'souls';
      const lm = new THREE.MeshBasicMaterial({ map: lavaTexture(souls ? 'souls' : 'lava'), color: style === 'inferno' || souls ? '#ffffff' : '#ffe0c0' });
      this.lavaMats.push(lm);
      this.instancedPrim(group, new THREE.PlaneGeometry(32, 32), lm, lava);
      // rocky lips around the lava so it reads as a sunken channel
      const lips = [];
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          if (tileAt(tx, ty) !== T.LAVA) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = tileAt(tx + dx, ty + dy);
            if (n === T.LAVA || n === T.BRIDGE || n === T.WALL) continue;
            lips.push({ x: tx * TILE + 16 + dx * 15, y: 0, z: ty * TILE + 16 + dy * 15, sx: dx ? 4 : 17, sy: 3, sz: dy ? 4 : 17, ry: rnd(tx, ty, dx + 2 * dy) * 0.6, color: th.rock });
          }
          if (rnd(tx, ty, 9) < 0.06) this.torches.push({ x: tx * TILE + 16, z: ty * TILE + 16, y: 18, color: souls ? '#5070ff' : '#ff5a10', power: 70 });
        }
      this.instancedPrim(group, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }), lips);
    }

    // ---- walls ----
    const wallFaces = [];
    const SY = WALL_H / 4;
    if (style === 'castle') {
      const walls = { wall: [], wall_cracked: [] };
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          if (!open(tx, ty)) continue;
          for (const [dx, dy, x, z, ry] of [
            [0, -1, tx * TILE + 16, ty * TILE - 4, 0], [0, 1, tx * TILE + 16, ty * TILE + TILE + 4, Math.PI],
            [-1, 0, tx * TILE - 4, ty * TILE + 16, Math.PI / 2], [1, 0, tx * TILE + TILE + 4, ty * TILE + 16, -Math.PI / 2],
          ]) {
            if (!isWall(tx + dx, ty + dy)) continue;
            // single wall tiles inside rooms are free-standing pillars, not wall faces
            if (this.isPillar(g, tx + dx, ty + dy)) continue;
            walls[rnd(tx * 7 + dx, ty * 13 + dy) < 0.12 ? 'wall_cracked' : 'wall'].push({ x, z, ry, sx: S * 0.54, sy: SY, sz: S * 0.5 });
            wallFaces.push({ tx, ty, dx, dy, x, z });
          }
        }
      for (const [k, list] of Object.entries(walls)) this.instanced(group, k, list, th.wallTint || null);
      this.addCaps(group, g, WALL_H + 0.3, th.wallTop, '#5a5550', (x, y) => !this.isPillar(g, x, y));
      const pillars = [];
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (isWall(tx, ty) && this.isPillar(g, tx, ty)) pillars.push({ x: tx * TILE + 16, z: ty * TILE + 16, sx: S * 0.42, sy: S * 0.42 * 1.1, sz: S * 0.42 });
      this.instanced(group, 'pillar_decorated', pillars);
    } else if (style === 'canyon' || style === 'inferno') {
      // jagged rock cliffs: clusters of boulders along every edge, a rocky plateau behind
      const rocks = [];
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          if (!isWall(tx, ty)) continue;
          let edge = false, orth = false;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && open(tx + ox, ty + oy)) { edge = true; if (!ox || !oy) orth = true; }
          if (!edge) continue;
          const n = orth ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const r1 = rnd(tx, ty, k), r2 = rnd(tx, ty, k + 7), r3 = rnd(tx, ty, k + 13);
            const hgt = 26 + r3 * 34;
            const shade = new THREE.Color(th.rock).offsetHSL(0, 0, (r1 - 0.5) * 0.12);
            rocks.push({ x: tx * TILE + 16 + (r1 - 0.5) * 18, y: hgt * 0.42, z: ty * TILE + 16 + (r2 - 0.5) * 18, sx: 12 + r2 * 9, sy: hgt * 0.6, sz: 12 + r1 * 9, rx: r3 * 0.4, ry: r1 * 6.28, rz: r2 * 0.4, color: `#${shade.getHexString()}` });
          }
          if (orth) wallFaces.push({ tx, ty: ty + (open(tx, ty + 1) ? 1 : 0), dx: 0, dy: open(tx, ty + 1) ? -1 : 0, x: tx * TILE + 16, z: ty * TILE + 16 });
        }
      this.instancedPrim(group, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }), rocks);
      this.addCaps(group, g, 34, th.cap || th.rock, th.cap ? '#c8d0e0' : style === 'inferno' ? '#3a1a14' : '#5a4632');
    } else {
      // sky: islands are thick slabs of rock hanging in the clouds; WALL tiles are ruined columns
      this.instancedPrim(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), slabs);
      const drips = [], cols = [];
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          const t = tileAt(tx, ty);
          if (t === T.VOID) continue;
          if (t === T.WALL) cols.push({ x: tx * TILE + 16, z: ty * TILE + 16, sx: S * 0.9, sy: S * 1.2, sz: S * 0.9 });
          const edgeV = isVoid(tx - 1, ty) || isVoid(tx + 1, ty) || isVoid(tx, ty - 1) || isVoid(tx, ty + 1);
          if (edgeV && rnd(tx, ty, 3) < 0.5) drips.push({ x: tx * TILE + 16, y: -42 - rnd(tx, ty, 4) * 10, z: ty * TILE + 16, sx: 12 + rnd(tx, ty, 6) * 8, sy: 30 + rnd(tx, ty, 7) * 50, sz: 12 + rnd(tx, ty, 8) * 8, rx: Math.PI, ry: rnd(tx, ty, 9) * 6, color: th.rock });
        }
      this.instancedPrim(group, new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }), drips);
      this.instanced(group, 'column', cols);
      // drifting clouds far below
      for (let k = 0; k < 40; k++) {
        const c = glowSprite('#ffffff', 260 + hash(k, 3) * 260, 0.5);
        c.material.blending = THREE.NormalBlending;
        c.position.set(hash(k, 1) * w * TILE, -220 - hash(k, 2) * 160, hash(k, 4) * h * TILE);
        group.add(c);
        this.clouds.push({ s: c, speed: 6 + hash(k, 5) * 10 });
      }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE * 3, h * TILE * 3), new THREE.MeshBasicMaterial({ color: th.fog }));
      fl.rotation.x = -Math.PI / 2;
      fl.position.set(w * TILE / 2, -420, h * TILE / 2);
      group.add(fl);
    }

    // ---- cracked walls (secret rooms) and spike traps ----
    this.cracked = new Map();
    const crackH = style === 'castle' ? WALL_H : style === 'sky' ? 30 : 40;
    const crackColor = style === 'castle' ? th.wallSide : th.rock;
    const crackMat = new THREE.MeshStandardMaterial({ map: crackedTexture(crackColor), roughness: 1 });
    this.crackMat = crackMat;
    this.spikes = [];
    const spikeGeo = new THREE.ConeGeometry(2.2, 12, 5);
    const spikeMat = new THREE.MeshStandardMaterial({ color: '#c8ccd4', metalness: 0.8, roughness: 0.3, flatShading: true });
    const plateMat = new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.5, roughness: 0.6 });
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const t = tileAt(tx, ty);
        if (t === T.CRACKED) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(32, crackH, 32), crackMat);
          m.position.set(tx * TILE + 16, crackH / 2, ty * TILE + 16);
          group.add(m);
          this.cracked.set(ty * w + tx, m);
        } else if (t === T.SPIKES) {
          const grp = new THREE.Group();
          grp.position.set(tx * TILE + 16, 0, ty * TILE + 16);
          const plate = new THREE.Mesh(new THREE.BoxGeometry(28, 1.6, 28), plateMat);
          plate.position.y = 0.9;
          grp.add(plate);
          const pins = new THREE.Group();
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const c = new THREE.Mesh(spikeGeo, spikeMat);
            c.position.set((i - 1) * 8, 6, (j - 1) * 8);
            pins.add(c);
          }
          pins.position.y = -12;
          grp.add(pins);
          group.add(grp);
          this.spikes.push(pins);
        }
      }

    // ---- gates on door tiles; they sink into the floor when unlocked ----
    this.doors = new Map();
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (tileAt(tx, ty) !== T.DOOR) continue;
        const d = cloneProp('wall_gated');
        d.scale.set(S * 0.5, SY, S * 0.6);
        d.position.set(tx * TILE + 16, 0, ty * TILE + 16);
        const passable = (x, y) => { const k = tileAt(x, y); return k === T.FLOOR || k === T.EXIT || k === T.BRIDGE; };
        if (passable(tx - 1, ty) || passable(tx + 1, ty)) d.rotation.y = Math.PI / 2;
        group.add(d);
        this.doors.set(ty * w + tx, d);
      }

    // ---- light sources and dressing ----
    const torchSpots = [];
    if (style === 'castle') {
      for (const f of wallFaces) {
        if (f.dy !== -1) continue;
        const r = rnd(f.tx * 3 + 11, f.ty * 5 + 7);
        if (r < 0.2 && !torchSpots.some((p) => Math.abs(p.tx - f.tx) + Math.abs(p.ty - f.ty) < 5)) torchSpots.push(f);
        else if (r > 1 - (th.banners ?? 0.07)) {
          const b = cloneProp(th.bannerColor === 'red' || rnd(f.tx, f.ty) < 0.5 ? 'banner_red' : 'banner_blue');
          b.scale.set(S * 0.5, S * 0.42, S * 0.5);
          b.position.set(f.x, 0, f.ty * TILE - 8);
          group.add(b);
        }
      }
      for (const f of torchSpots) {
        const t = cloneProp('torch');
        t.scale.setScalar(S);
        t.position.set(f.x, 30, f.ty * TILE);
        const halo = glowSprite(th.lantern || '#ffa040', 46, 0.75);
        halo.position.set(f.x, 42, f.ty * TILE + 8);
        group.add(t, halo);
        this.torches.push({ x: f.x, z: f.ty * TILE + 10, y: 46, halo, color: th.lantern || '#ff9a50', power: 110 });
      }
    } else {
      // standing lanterns along the paths
      const spots = [];
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          if (tileAt(tx, ty) !== T.FLOOR) continue;
          const nearEdge = style === 'sky'
            ? (isVoid(tx, ty - 1) || isVoid(tx - 1, ty) || isVoid(tx + 1, ty))
            : (isWall(tx, ty - 1) || isWall(tx - 1, ty) || isWall(tx + 1, ty));
          if (!nearEdge || rnd(tx, ty, 21) > 0.08) continue;
          if (spots.some(([x, y]) => Math.abs(x - tx) + Math.abs(y - ty) < 7)) continue;
          spots.push([tx, ty]);
        }
      for (const [tx, ty] of spots) {
        const tall = style === 'sky';
        const l = cloneProp(tall ? 'post_lantern' : 'lantern');
        l.scale.setScalar(S * (tall ? 0.55 : 0.75));
        l.position.set(tx * TILE + 16, 0, ty * TILE + 16);
        l.rotation.y = rnd(tx, ty, 2) * 6.28;
        const hy = tall ? 30 : 12;
        const lc = th.lantern || (style === 'inferno' ? '#ff6a30' : '#ffb060');
        const halo = glowSprite(lc, 40, 0.7);
        halo.position.set(tx * TILE + 16, hy, ty * TILE + 16);
        group.add(l, halo);
        this.torches.push({ x: tx * TILE + 16, z: ty * TILE + 16, y: hy + 14, halo, color: lc, power: 95 });
      }
    }

    // clutter: realm-specific props scattered in corners and along edges
    const deco = th.deco || {
      castle: { corner: ['barrel_stack', 'crates', 'keg'], scatter: ['bones_a', 'skull'] },
      canyon: { corner: ['tree_dead_small', 'tree_dead_medium', 'rubble'], scatter: ['bones_a', 'bones_b', 'skull'] },
      inferno: { corner: ['tree_dead_medium', 'skull_candle', 'ribcage'], scatter: ['bones_a', 'bones_b', 'skull', 'ribcage'] },
      sky: { corner: ['gravestone', 'grave', 'fence'], scatter: ['bones_a', 'skull', 'candles'] },
    }[style];
    const SCALE = { barrel_stack: 0.5, crates: 0.5, keg: 0.5, tree_dead_small: 0.9, tree_dead_medium: 0.8, rubble: 0.22, skull_candle: 0.55, ribcage: 0.45, gravestone: 0.7, grave: 0.6, fence: 0.5, bones_a: 0.45, bones_b: 0.45, skull: 0.3, candles: 0.6, coffin: 0.55, sword_shield: 0.6, pumpkin: 0.6, column: 0.5 };
    const wallish = style === 'sky' ? isVoid : isWall;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (tileAt(tx, ty) !== T.FLOOR) continue;
        const r = rnd(tx * 17 + 3, ty * 31 + 5);
        const wN = wallish(tx, ty - 1), wW = wallish(tx - 1, ty), wE = wallish(tx + 1, ty);
        let k = null;
        if (wN && (wW || wE) && r < 0.4) k = deco.corner[Math.floor(rnd(ty, tx * 3) * deco.corner.length)];
        else if (r < 0.025) k = deco.scatter[Math.floor(rnd(tx * 5, ty) * deco.scatter.length)];
        if (!k) continue;
        const p = cloneProp(k);
        p.scale.setScalar(S * SCALE[k]);
        p.position.set(tx * TILE + 16 + (wW ? -6 : wE ? 6 : (r - 0.5) * 10), k === 'ribcage' ? 4 : 0, ty * TILE + 16 + (wN ? -6 : 0));
        p.rotation.y = rnd(tx, ty * 9) * Math.PI * 2;
        if (style === 'inferno' && k.startsWith('tree')) p.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color('#5a3a30')); } });
        group.add(p);
      }

    this.addFeatures(group, g, th, wallish, rnd);
    this.setAmbient(th.particles);

    // ---- exit portal flanked by candles (the hub has a portal per realm instead) ----
    this.exit = null;
    this.hubPortals = [];
    const portalAt = (x, y, sealed) => {
      const e = buildExit(sealed);
      e.position.set(x * TILE + 16, 0.5, y * TILE + 16);
      group.add(e);
      for (const ox of [-22, 22]) {
        const c = cloneProp('candles');
        c.scale.setScalar(S * 0.6);
        c.position.set(x * TILE + 16 + ox, 0, y * TILE);
        group.add(c);
      }
      return e;
    };
    const ex = g.level.exit;
    if (ex) {
      this.exitSealed = tileAt(ex.x, ex.y) === T.SEALED;
      this.exit = portalAt(ex.x, ex.y, this.exitSealed);
    }
    if (g.level.hub) {
      const colors = ['#ffb24a', '#a8c0ff', '#e0f4ff', '#ff6a3a'];
      for (const pt of g.level.portals) {
        const sealed = pt.realm === 3 && g.underworldSealed;
        const e = portalAt(pt.x, pt.y, sealed);
        e.userData.halo.material.color.set(colors[pt.realm]);
        const pillar = cloneProp('pillar_decorated');
        for (const ox of [-1.5, 1.5]) {
          const pc = pillar.clone(true);
          pc.scale.setScalar(S * 0.3);
          pc.position.set((pt.x + 0.5 + ox) * TILE, 0, (pt.y + 0.5) * TILE - 10);
          group.add(pc);
        }
        this.hubPortals.push(e);
        this.torches.push({ x: (pt.x + 0.5) * TILE, z: (pt.y + 0.5) * TILE, y: 30, color: colors[pt.realm], power: 120 });
      }
      // the merchant's stall
      const sx = (g.level.shop.x + 0.5) * TILE, sz = (g.level.shop.y + 0.5) * TILE;
      for (const [k, ox, oz, sc] of [['keg', -40, 0, 0.5], ['crates', 42, -4, 0.5], ['barrel_stack', 70, -6, 0.5], ['banner_red', -70, -20, 0.5]]) {
        const p = cloneProp(k);
        p.scale.setScalar(S * sc);
        p.position.set(sx + ox, 0, sz + oz);
        group.add(p);
      }
      const coins = cloneProp('coins_big');
      coins.scale.setScalar(S * 0.6);
      coins.position.set(sx - 40, 30, sz);
      group.add(coins);
      this.merchant = new Actor('merchant');
      this.merchant.base('Idle');
      this.merchant.root.position.set(sx, 0, sz);
      this.blob(this.merchant.root, 34);
      group.add(this.merchant.root);
    } else this.merchant = null;
  }

  // Each stage's own dressing (STAGE_LOOKS features in level.js), scattered along the walls.
  addFeatures(group, g, th, wallish, rnd) {
    if (!th.features) return;
    const spots = [];
    for (let ty = 1; ty < g.h - 1; ty++)
      for (let tx = 1; tx < g.w - 1; tx++) {
        if (g.tile(tx, ty) !== T.FLOOR) continue;
        const wN = wallish(tx, ty - 1), wW = wallish(tx - 1, ty), wE = wallish(tx + 1, ty), wS = wallish(tx, ty + 1);
        if (wN || wW || wE || wS) spots.push({ tx, ty, wN, wW, wE, wS });
      }
    const pick = (f, k) => spots.filter((s) => rnd(s.tx * 29 + k, s.ty * 43 + k * 7) < f.rate);
    th.features.forEach((f, k) => {
      const at = pick(f, k + 1);
      const px = (s, j = 0) => s.tx * TILE + 16 + (s.wW ? -9 : s.wE ? 9 : (rnd(s.tx, s.ty, j + 40) - 0.5) * 14);
      const pz = (s, j = 0) => s.ty * TILE + 16 + (s.wN ? -9 : s.wS ? 9 : (rnd(s.tx, s.ty, j + 41) - 0.5) * 14);
      if (f.kind === 'crystal') {
        const list = [];
        for (const s of at) for (let j = 0; j < 3; j++) {
          const h = 10 + rnd(s.tx, s.ty, j + 50) * 18;
          list.push({ x: px(s, j) + (j - 1) * 4, y: h / 2, z: pz(s, j) + ((j * 5) % 3 - 1) * 4, sx: 3 + j, sy: h, sz: 3 + j, rx: (j - 1) * 0.35, rz: (rnd(s.tx, s.ty, j) - 0.5) * 0.6 });
        }
        this.instancedPrim(group, new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88 }), list);
        at.filter((_, i) => i % 3 === 0).forEach((s) => this.torches.push({ x: px(s), z: pz(s), y: 14, color: f.color, power: 45 }));
      } else if (f.kind === 'mushroom') {
        const stems = [], caps = [];
        for (const s of at) for (let j = 0; j < 2; j++) {
          const h = 8 + rnd(s.tx, s.ty, j + 60) * 16, r = 6 + rnd(s.tx, s.ty, j + 61) * 8;
          const x = px(s, j) + j * 7, z = pz(s, j) - j * 5;
          stems.push({ x, y: h / 2, z, sx: 2, sy: h, sz: 2 });
          caps.push({ x, y: h, z, sx: r, sy: r * 0.55, sz: r });
        }
        this.instancedPrim(group, new THREE.CylinderGeometry(1, 1.3, 1, 6), new THREE.MeshStandardMaterial({ color: '#e8e0c8', roughness: 0.9, flatShading: true }), stems);
        this.instancedPrim(group, new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 0.35, roughness: 0.6, flatShading: true }), caps);
      } else if (f.kind === 'brazier') {
        const bowls = [];
        for (const s of at) {
          bowls.push({ x: px(s), y: 9, z: pz(s), sx: 7, sy: 6, sz: 7 });
          const halo = glowSprite('#ff8a30', 50, 0.8);
          halo.position.set(px(s), 22, pz(s));
          group.add(halo);
          this.torches.push({ x: px(s), z: pz(s), y: 26, halo, color: '#ff8a40', power: 100 });
        }
        this.instancedPrim(group, new THREE.CylinderGeometry(1, 0.55, 1, 8), new THREE.MeshStandardMaterial({ color: '#3a3438', metalness: 0.6, roughness: 0.5 }), bowls);
        this.instancedPrim(group, new THREE.CylinderGeometry(0.25, 0.4, 1, 6), new THREE.MeshStandardMaterial({ color: '#2a2428', metalness: 0.6, roughness: 0.5 }), bowls.map((b) => ({ ...b, y: 3, sx: 3, sy: 6, sz: 3 })));
      } else if (f.kind === 'chains') {
        const links = [];
        for (const s of at) {
          if (!s.wN) continue;
          for (let j = 0; j < 7; j++) links.push({ x: s.tx * TILE + 10 + (j % 2) * 0.1, y: 44 - j * 4.2, z: s.ty * TILE - 2, sx: 1.6, sy: 2.4, sz: 1.6, ry: j % 2 ? Math.PI / 2 : 0 });
        }
        this.instancedPrim(group, new THREE.TorusGeometry(1, 0.35, 4, 8), new THREE.MeshStandardMaterial({ color: '#6a6a72', metalness: 0.8, roughness: 0.4 }), links);
      } else if (f.kind === 'web') {
        const webs = [];
        for (const s of at) {
          if (!(s.wN && (s.wW || s.wE))) continue;
          webs.push({ x: s.tx * TILE + 16 + (s.wW ? -10 : 10), y: 34, z: s.ty * TILE + 2, sx: 18, sy: 18, sz: 1, ry: s.wW ? 0.6 : -0.6 });
        }
        this.instancedPrim(group, new THREE.CircleGeometry(1, 8), new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), webs);
      }
    });
  }

  // Drifting particles that fill the air around the camera (embers, snow, ash, spores...).
  setAmbient(spec) {
    if (this.ambient) { this.scene.remove(this.ambient.points); this.ambient = null; }
    if (!spec) return;
    const n = Math.round(spec.count * (LOW_POWER ? 0.6 : 1));
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1000; pos[i * 3 + 1] = Math.random() * 220; pos[i * 3 + 2] = (Math.random() - 0.5) * 800;
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const additive = !['snow', 'ash'].includes(spec.type);
    const size = { snow: 13, ash: 11, embers: 15, sparks: 10, motes: 12, spores: 14, wisps: 34, souls: 30, drips: 8 }[spec.type] || 12;
    const mat = new THREE.PointsMaterial({ size, map: glowTexture(), color: spec.color, transparent: true, depthWrite: false, opacity: additive ? 0.9 : 0.75, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.ambient = { points, pos, seed, n, type: spec.type };
  }

  updateAmbient(dt, t) {
    const A = this.ambient;
    if (!A) return;
    const { pos, seed, n, type } = A;
    // fall / rise speed and sideways sway per kind
    const [vy, sway, swayF] = { snow: [-40, 18, 1], ash: [-14, 22, 0.6], embers: [36, 14, 2], sparks: [70, 24, 4], motes: [5, 10, 0.5], spores: [8, 16, 0.8], wisps: [6, 30, 0.4], souls: [24, 8, 1.2], drips: [-120, 0, 0] }[type] || [0, 10, 1];
    const cx = this.camX, cz = this.camZ;
    for (let i = 0; i < n; i++) {
      const k = i * 3, s = seed[i * 4], s2 = seed[i * 4 + 1];
      pos[k + 1] += vy * (0.6 + s * 0.8) * dt;
      pos[k] += Math.sin(t * swayF + s * 40) * sway * dt + (type === 'snow' || type === 'ash' ? 10 * dt : 0);
      pos[k + 2] += Math.cos(t * swayF * 0.7 + s2 * 40) * sway * 0.5 * dt;
      // wrap round a box that follows the camera
      if (pos[k + 1] < 0) pos[k + 1] += 220; else if (pos[k + 1] > 220) pos[k + 1] -= 220;
      let dx = pos[k] - cx; if (dx < -500) pos[k] += 1000; else if (dx > 500) pos[k] -= 1000;
      let dz = pos[k + 2] - cz; if (dz < -400) pos[k + 2] += 800; else if (dz > 400) pos[k + 2] -= 800;
    }
    A.points.geometry.attributes.position.needsUpdate = true;
    A.points.material.opacity = type === 'wisps' || type === 'souls' ? 0.6 + Math.sin(t * 2) * 0.25 : A.points.material.opacity;
  }

  // A lone wall tile with open floor on all four sides (courtyard pillars, island ruins).
  isPillar(g, tx, ty) {
    const o = (x, y) => { const t = g.tile(x, y); return t !== T.WALL && t !== T.VOID; };
    return g.tile(tx, ty) === T.WALL && o(tx - 1, ty) && o(tx + 1, ty) && o(tx, ty - 1) && o(tx, ty + 1);
  }

  // Flat caps over solid ground near the play area hide the void behind walls.
  addCaps(group, g, y, texColor, tint, include = () => true) {
    const pos = [], uv = [];
    for (let ty = 0; ty < g.h; ty++)
      for (let tx = 0; tx < g.w; tx++) {
        if (g.tile(tx, ty) !== T.WALL || !include(tx, ty)) continue;
        let near = false;
        for (let oy = -2; oy <= 2 && !near; oy++) for (let ox = -2; ox <= 2; ox++) { const t = g.tile(tx + ox, ty + oy); if (t !== T.WALL && t !== T.VOID) { near = true; break; } }
        if (!near) continue;
        const x0 = tx * TILE, z0 = ty * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
        pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: capTexture(texColor), color: tint, roughness: 1 })));
  }

  // ---------- views for entities ----------

  makeHero(p) {
    const a = new Actor(p.cls);
    const root = a.root;
    // player-coloured ring at the feet, like the arcade's player markers
    const ring = new THREE.Mesh(new THREE.RingGeometry(11, 14, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: heroColor(p.cls), transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 1.2;
    root.add(ring);
    this.blob(root, 34);
    a.base(HERO_STYLE[p.cls].idle);
    return { kind: 'hero', root, actor: a, ring };
  }

  makeEnemy(e) {
    const st = ENEMY_STYLE[e.type] || ENEMY_STYLE.grunt;
    if (st.proc) {
      const root = new THREE.Group();
      const model = buildCreature(st.proc, st.proc === 'skull' ? cloneProp('skull') : null);
      model.scale.setScalar(st.scale);
      root.add(model);
      if (!st.float) this.blob(root, st.proc === 'spider' ? 46 : 36);
      return { kind: 'enemy', root, proc: model, style: st };
    }
    const a = new Actor(st.model, { tint: st.tint, ghost: st.ghost, emissiveEyes: st.eyes });
    a.model.scale.setScalar((a.adult ? HERO_SCALE : S) * st.scale);
    if (st.weapon) a.attach(st.weapon, 'handslot.r');
    if (st.horns) addHorns(a, st.horns, 0.12, 0.6, 0.35);
    if (!st.float) this.blob(a.root, 30 * st.scale);
    a.base('Idle');
    if (e.fromGen && !st.float) a.play('Spawn_Ground', { timeScale: 2.2 });
    return { kind: 'enemy', root: a.root, actor: a, style: st };
  }

  makeBoss(e, g) {
    const b = g.info.boss;
    if (b.model === 'skorne') {
      const a = new Actor('skeleton_warrior', { tint: '#b080ff', emissiveEyes: '#ff2020' });
      a.model.scale.setScalar(S * 2.6);
      a.attach('weapon_axe', 'handslot.r', { scale: 1.3 });
      addHorns(a, b.horn, 0.16, 0.9, 0.4);
      this.blob(a.root, 90);
      a.base('Idle');
      return { kind: 'boss', root: a.root, actor: a };
    }
    const root = buildBoss(b.model, b.color, b.horn);
    root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.blob(root, 110);
    for (const mat of root.userData.mats) { mat.userData.e0 = mat.emissive.clone(); mat.userData.ei0 = mat.emissiveIntensity; }
    return { kind: 'boss', root, proc: true };
  }

  makeGenerator(gen) {
    const root = new THREE.Group();
    const add = (name, s, x = 0, y = 0, z = 0, ry = 0) => { const p = cloneProp(name); p.scale.setScalar(S * s); p.position.set(x, y, z); p.rotation.y = ry; root.add(p); return p; };
    const tint = (o, c) => { o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(c)); } }); return o; };
    const bonePile = () => { add('ribcage', 0.55, 0, 6, 0); add('bones_a', 0.6, -8, 2, 6, 0.6); add('bones_b', 0.6, 7, 2, -6, 2.1); add('bones_a', 0.6, 4, 2, 8, 1.2); add('skull', 0.45, 0, 10, 2); };
    // each monster comes out of something that suits it: a goblin camp, a grave, a nest...
    switch (gen.type) {
      case 'goblin': add('crates', 0.5); add('banner_red', 0.35, -12, 0, -6); add('skull', 0.3, 10, 0, 10); break;
      case 'bat': add('rubble', 0.32); add('bones_b', 0.5, 8, 2, 8, 1); break;
      case 'bomber': add('barrel_stack', 0.45); add('keg', 0.4, 14, 0, 8); break;
      case 'orc': add('tree_dead_medium', 0.6); add('skull', 0.4, 0, 22, 4); add('bones_a', 0.6, 8, 2, 8); break;
      case 'shaman': tint(add('shrine', 0.8), '#90ff80'); add('skull_candle', 0.45, 10, 0, 8); break;
      case 'ghost': add('grave', 0.75, 0, 0, -2); add('skull', 0.3, 9, 0, 9); break;
      case 'archer': add('sword_shield', 0.6); add('bones_a', 0.6, 8, 2, 8); break;
      case 'lobber': add('crates', 0.55); add('skull', 0.3, 10, 0, 10); break;
      case 'knight': add('sword_shield', 0.7); add('banner_blue', 0.35, -12, 0, -6); break;
      case 'sorcerer': add('shrine', 0.8); add('skull_candle', 0.45, 10, 0, 8); break;
      case 'zombie': add('grave', 0.8, 0, 0, -2); add('gravestone', 0.6, -12, 0, -10); add('bones_b', 0.5, 8, 2, 8); break;
      case 'wraith': add('gravestone', 0.75); add('candles', 0.6, 10, 0, 8); break;
      case 'spider': { // a nest of eggs in old bones
        add('ribcage', 0.5, 0, 4, 0);
        const egg = new THREE.MeshStandardMaterial({ color: '#e8e4d0', roughness: 0.6, flatShading: true });
        for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), egg); m.scale.set(5, 6, 5); m.position.set(Math.cos(i * 2.4) * (4 + i), 4, Math.sin(i * 2.4) * (4 + i)); root.add(m); }
        break;
      }
      case 'plaguer': add('coffin', 0.6, 0, 0, 0, Math.PI / 2); add('skull_candle', 0.5, 0, 9, 0); break;
      case 'witch': { // a bubbling cauldron
        const pot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshStandardMaterial({ color: '#202024', metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
        pot.scale.setScalar(13); pot.position.y = 11; root.add(pot);
        const brew = new THREE.Mesh(new THREE.CircleGeometry(10.5, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#60ff40', emissive: '#40ff20', emissiveIntensity: 1.5 }));
        brew.position.y = 16; root.add(brew);
        add('candles', 0.5, 16, 0, 8);
        break;
      }
      case 'imp': add('skull_candle', 0.6); add('ribcage', 0.45, 10, 4, 6); break;
      case 'skull': add('skull', 0.45, 0, 0, 0); add('skull', 0.4, 8, 0, 6, 1); add('skull', 0.4, -7, 0, 5, 2); add('skull', 0.38, 0, 7, 3); add('candles', 0.5, 12, 0, -8); break;
      case 'hound': bonePile(); add('rubble', 0.2, -10, 0, -10); break;
      case 'demon': tint(add('shrine', 0.85), '#ff7060'); add('skull_candle', 0.5, 12, 0, 8); add('skull_candle', 0.5, -12, 0, 8); break;
      case 'warlock': tint(add('shrine', 0.8), '#6a4060'); add('candles', 0.6, 10, 0, 8); break;
      default: bonePile(); // skeletons
    }
    const halo = glowSprite(ENEMIES[gen.type] ? ENEMIES[gen.type].color : '#fff', 54, 0.5);
    halo.position.y = 14;
    root.add(halo);
    const mats = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.userData.e0 = o.material.emissive.clone();
      mats.push(o.material);
    });
    this.blob(root, 44);
    return { kind: 'gen', root, halo, mats };
  }

  makeItem(it) {
    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.add(spin);
    let glow = null, spins = false;
    const add = (name, s, y = 0) => { const p = cloneProp(name); p.scale.setScalar(S * s); p.position.y = y; spin.add(p); return p; };
    switch (it.type) {
      case 'food': add(hash(it.x, it.y) < 0.5 ? 'food' : 'food_b', 0.7); break;
      case 'poison': {
        // looks like a meal, but sickly green and fuming
        const f = add('food_b', 0.7);
        f.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color('#90ff60')); } });
        glow = '#50ff30';
        break;
      }
      case 'gold': add('coins', 0.65); glow = '#ffd040'; break;
      case 'key': { const k = add('key', 0.9, 10); k.rotation.z = Math.PI / 2; k.position.x = -3; glow = '#ffd040'; spins = true; break; }
      case 'potion': {
        const b = add('potion', 0.9);
        b.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.color.multiply(new THREE.Color('#6a8aff'));
          o.material.emissive = new THREE.Color('#2040ff');
          o.material.emissiveIntensity = 0.5;
        });
        glow = '#4a6aff'; spins = true; break;
      }
      case 'chest': add('chest', 0.6); break;
      case 'barrel': add('barrel', 0.75); break;
      default: {
        // gems, amulets and rune stones keep their bespoke glowing models
        const m = buildItem(it.type, it.sub, POWERUPS[it.sub] && POWERUPS[it.sub].color);
        m.scale.setScalar(1.2);
        root.add(m);
        this.blob(root, 22);
        return { kind: 'item', root, spin: m.userData.spin, spins: m.userData.spins };
      }
    }
    if (glow) { const s = glowSprite(glow, 30, 0.45); s.position.y = 10; root.add(s); }
    this.blob(root, it.type === 'chest' ? 34 : 24);
    return { kind: 'item', root, spin, spins };
  }

  makeProjectile(pr) {
    if (pr.kind === 'axe') {
      const root = new THREE.Group();
      const spin = new THREE.Group();
      const ax = cloneProp('weapon_axe');
      ax.scale.setScalar(S * 0.7);
      ax.rotation.z = Math.PI / 2;
      ax.position.x = -4;
      spin.add(ax);
      root.add(spin);
      return { kind: 'proj', root, spin };
    }
    const root = buildProjectile(pr.kind);
    return { kind: 'proj', root, spin: root.userData.spin };
  }

  // ---------- per-frame sync ----------

  render(g) {
    if (this.level !== g.level) this.buildLevel(g);
    const t = g.time;
    const dt = Math.min(0.05, Math.max(0, t - this.lastTime));
    this.lastTime = t;

    const tx = g.camX + WORLD_VIEW_W / 2, tz = g.camY + WORLD_VIEW_H / 2 + 10;
    const sx = (Math.random() - 0.5) * g.shake, sz = (Math.random() - 0.5) * g.shake;
    this.camera.position.set(tx + CAM_OFFSET.x + sx, CAM_OFFSET.y, tz + CAM_OFFSET.z + sz);
    this.camera.lookAt(tx + sx, 0, tz + sz - 10);
    this.sun.position.set(tx - 200, 500, tz + 300);
    this.sun.target.position.set(tx, 0, tz);
    this.camX = tx; this.camZ = tz;

    this.syncLevel(g, t);

    const seen = new Set();
    for (const p of g.allPlayers()) this.sync(p, () => this.makeHero(p), (v) => this.updateHero(v, p, g, dt), seen);
    for (const e of g.enemies) {
      if (e.type === 'boss') this.sync(e, () => this.makeBoss(e, g), (v) => this.updateBoss(v, e, g, dt), seen);
      else this.sync(e, () => this.makeEnemy(e), (v) => this.updateEnemy(v, e, g, dt), seen);
    }
    for (const gen of g.gens) this.sync(gen, () => this.makeGenerator(gen), (v) => this.updateGen(v, gen, t), seen);
    for (const it of g.items) this.sync(it, () => this.makeItem(it), (v) => this.updateItem(v, it, t), seen);
    for (const pr of g.projs) this.sync(pr, () => this.makeProjectile(pr), (v) => this.updateProj(v, pr, t), seen);
    for (const [obj, v] of this.views) {
      if (seen.has(obj)) continue;
      this.views.delete(obj);
      // slain monsters collapse and sink instead of popping out of existence
      if (v.proc && !obj.vanish && v.root.visible) {
        this.corpses.push({ ...v, t: 0 }); // beasts keel over
        if (this.corpses.length > 40) this.scene.remove(this.corpses.shift().root);
      } else if ((v.kind === 'enemy' || v.kind === 'boss') && v.actor && !obj.vanish && v.root.visible) {
        v.actor.flash(0);
        v.actor.die(v.kind === 'boss' ? 'Death_B' : 'Death_A');
        this.corpses.push({ ...v, t: 0 });
        if (this.corpses.length > 40) this.scene.remove(this.corpses.shift().root); // bounded, whatever happens
      } else this.scene.remove(v.root);
    }
    this.corpses = this.corpses.filter((c) => {
      c.t += dt;
      if (c.proc) c.proc.rotation.z = Math.min(Math.PI / 2, c.t * 6) * (c.root.id % 2 ? 1 : -1);
      else c.actor.update(dt);
      if (c.t > 1.3) c.root.position.y -= dt * 25;
      if (c.t > 2.4) { this.scene.remove(c.root); return false; }
      return true;
    });

    const seenM = new Set();
    for (const pr of g.projs) {
      if (!LOBBED.has(pr.kind)) continue;
      seenM.add(pr);
      let mk = this.markers.get(pr);
      if (!mk) { mk = buildMarker(); this.markers.set(pr, mk); this.scene.add(mk); }
      mk.position.set(pr.tx, 1.5, pr.ty);
      mk.scale.setScalar(0.4 + 0.6 * (pr.t / pr.T));
    }
    for (const [pr, mk] of this.markers) if (!seenM.has(pr)) { this.scene.remove(mk); this.markers.delete(pr); }

    this.syncLights(g, t, tx, tz);
    this.syncParticles(g);
    this.updateAmbient(dt, t);
    this.renderer.render(this.scene, this.camera);
  }

  sync(obj, make, update, seen) {
    let v = this.views.get(obj);
    if (!v) {
      v = make();
      this.views.set(obj, v);
      this.scene.add(v.root);
    }
    seen.add(obj);
    update(v);
  }

  near(x, z, pad = 520) {
    return Math.abs(x - this.camX) < pad && Math.abs(z - this.camZ) < pad;
  }

  updateHero(v, p, g, dt) {
    const st = HERO_STYLE[p.cls];
    if (!p.alive) {
      if (!v.dead) { v.dead = true; v.actor.die('Death_A'); v.ring.visible = false; }
      v.actor.update(dt);
      return;
    }
    if (v.dead) {
      // continued: fresh actor so the animation state resets
      this.scene.remove(v.root);
      Object.assign(v, this.makeHero(p), { dead: false });
      this.scene.add(v.root);
    }
    const a = v.actor;
    v.root.visible = !(p.invuln > 0 && Math.floor(g.time * 16) % 2);
    const moved = v.px !== undefined ? Math.hypot(p.x - v.px, p.y - v.py) : 0;
    v.px = p.x; v.py = p.y;
    const moving = moved > 0.2 || !!p.dash;
    v.root.position.set(p.x, 0, p.y);
    v.root.rotation.y = lerpAngle(v.root.rotation.y, Math.atan2(p.fx, p.fy), 0.3);
    a.base(moving ? 'Running_A' : st.idle, moving ? Math.max(0.8, (moved / Math.max(dt, 0.001)) / 150) : 1);
    if (p.act && p.act !== v.lastAct) {
      v.lastAct = p.act;
      if (p.act.type === 'melee') a.play(st.melee, { upper: moving, timeScale: st.meleeSpeed });
      else if (p.act.type === 'shoot') a.play(st.shoot, { upper: true, timeScale: st.shootSpeed });
      else a.play(st.turbo, { timeScale: 1.6 });
    }
    if (p.hurtFlash > 0 && !v.wasHurt && !a.busy) a.play('Hit_A', { upper: true, timeScale: 2 });
    v.wasHurt = p.hurtFlash > 0;
    a.flash(p.hurtFlash, '#ff2020');
    a.fade(p.buffs.invisible ? 0.3 : 1);
    v.root.position.y = p.buffs.levitate ? 6 + Math.sin(g.time * 4) * 2 : 0;
    const big = p.buffs.grow ? 1.4 : 1;
    v.root.scale.setScalar(v.root.scale.x + (big - v.root.scale.x) * 0.15);
    if (p.buffs.phoenix && p.famX !== undefined) {
      if (!v.familiar) { v.familiar = makePhoenix(); this.levelGroup.add(v.familiar); }
      v.familiar.visible = true;
      v.familiar.position.set(p.famX, 34 + Math.sin(g.time * 6) * 3, p.famY);
      v.familiar.rotation.y = g.time * 3 + Math.PI / 2;
      v.familiar.userData.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.4 + Math.sin(g.time * 18) * 0.5)));
    } else if (v.familiar) v.familiar.visible = false;
    a.update(dt);
    v.ring.material.opacity = 0.55 + Math.sin(g.time * 5) * 0.25;

    const buff = Object.keys(p.buffs)[0];
    if (buff) {
      if (!v.aura) {
        v.aura = new THREE.Mesh(new THREE.SphereGeometry(24, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
        v.aura.position.y = 20;
        v.root.add(v.aura);
      }
      v.aura.visible = true;
      v.aura.material.color.set(POWERUPS[buff].color);
      v.aura.scale.setScalar(1 + Math.sin(g.time * 6) * 0.05);
    } else if (v.aura) v.aura.visible = false;
  }

  updateEnemy(v, e, g, dt) {
    const a = v.actor;
    const st = v.style;
    v.root.position.set(e.x, st.float ? 6 + Math.sin(g.time * 4 + e.phase) * 3 : 0, e.y);
    const visible = this.near(e.x, e.y);
    v.root.visible = visible;
    if (!visible) return;
    const [p] = g.nearestPlayer(e);
    // a charging beast faces where it's going, not the hero
    const face = e.charging > 0 && v.proc ? Math.atan2(e.cvx || 0, e.cvy || 0) : p ? Math.atan2(p.x - e.x, p.y - e.y) : null;
    if (face !== null) v.root.rotation.y = lerpAngle(v.root.rotation.y, face, 0.18);
    const moved = v.px !== undefined ? Math.hypot(e.x - v.px, e.y - v.py) : 0;
    v.px = e.x; v.py = e.y;
    const moving = moved > 0.15;
    if (v.proc) {
      v.proc.userData.anim(g.time + e.phase, moving, e);
      const hurt = e.hurt > 0;
      if (hurt || v.flashing) {
        v.flashing = hurt;
        for (const m of v.proc.userData.mats) {
          if (hurt) { m.emissive.set('#ffffff'); m.emissiveIntensity = 0.8; } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; }
        }
      }
      return;
    }
    a.base(moving ? st.walk : 'Idle', moving ? st.walkSpeed : 1);
    if (e.act && e.act !== v.lastAct) {
      v.lastAct = e.act;
      const clip = e.act.type === 'throw' ? 'Throw' : e.act.type === 'cast' ? st.shoot || 'Spellcast_Shoot' : st.melee || '1H_Melee_Attack_Chop';
      a.play(clip, { upper: moving, timeScale: 2 });
    }
    if (e.hurt > 0 && !v.wasHurt && !a.busy) a.play('Hit_B', { upper: true, timeScale: 2.2 });
    v.wasHurt = e.hurt > 0;
    a.fade(e.invisible ? 0.15 : 1);
    a.flash(e.hurt);
    a.update(dt);
  }

  updateBoss(v, e, g, dt) {
    const t = g.time;
    v.root.position.set(e.x, 0, e.y);
    const [p] = g.nearestPlayer(e);
    if (e.charging > 0) v.root.rotation.y = Math.atan2(e.cvx, e.cvy);
    else if (p) v.root.rotation.y = lerpAngle(v.root.rotation.y, Math.atan2(p.x - e.x, p.y - e.y), 0.08);
    const moved = v.px !== undefined ? Math.hypot(e.x - v.px, e.y - v.py) : 0;
    v.px = e.x; v.py = e.y;
    const moving = moved > 0.15;
    const hurtColor = e.hp < e.maxHp * 0.4 ? '#ff4020' : '#ffffff';
    if (v.actor) {
      const a = v.actor;
      a.base(e.charging > 0 ? 'Running_A' : moving ? 'Walking_A' : 'Idle', e.charging > 0 ? 1.6 : 1);
      if (e.act && e.act !== v.lastAct) {
        v.lastAct = e.act;
        a.play(e.act.type === 'cast' ? 'Spellcast_Long' : '2H_Melee_Attack_Chop', { upper: moving, timeScale: 1.6 });
      }
      a.flash(e.hurt, hurtColor);
      a.update(dt);
      return;
    }
    const rig = v.root.userData.rig;
    rig.wings.forEach((w, i) => (w.rotation.y = Math.sin(t * 5) * 0.5 * (i ? -1 : 1)));
    if (rig.legs) rig.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(t * 8 + i * Math.PI / 2) * 0.5 : Math.sin(t * 2 + i) * 0.1));
    rig.heads.forEach((h, i) => {
      h.rotation.y = Math.sin(t * 1.5 + i * 2) * 0.3;
      if (h.userData.jaw) h.userData.jaw.rotation.x = e.cd2 < 0.4 ? 0.6 : Math.max(0, Math.sin(t * 3)) * 0.15;
    });
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 2) * 0.4;
    rig.rig.rotation.x = e.charging > 0 ? 0.25 : 0;
    const on = e.hurt > 0;
    for (const m of v.root.userData.mats) {
      if (on) { m.emissive.set(hurtColor); m.emissiveIntensity = 0.8; } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; }
    }
  }

  updateGen(v, gen, t) {
    v.root.position.set(gen.x, 0, gen.y);
    const tier = Math.ceil(gen.hp / 15);
    v.root.scale.setScalar(0.6 + tier * 0.15);
    const pulse = 0.5 + Math.sin(t * 5 + gen.x) * 0.5;
    v.halo.material.opacity = 0.25 + pulse * 0.4;
    const on = gen.hurt > 0;
    for (const m of v.mats) {
      if (on) { m.emissive.set('#ffffff'); m.emissiveIntensity = 0.7; } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = 0; }
    }
  }

  updateItem(v, it, t) {
    v.root.position.set(it.x, 0, it.y);
    if (v.spin) {
      v.spin.position.y = Math.sin(it.bob) * 1.5 + 1.5;
      if (v.spins) v.spin.rotation.y = t * 2 + it.bob;
    }
  }

  updateProj(v, pr, t) {
    if (LOBBED.has(pr.kind)) {
      v.root.position.set(pr.x, 14 + pr.z, pr.y);
      v.spin.rotation.set(t * 8, t * 6, 0);
      return;
    }
    v.root.position.set(pr.x, 18, pr.y);
    if (pr.super) v.root.scale.setScalar(2);
    const ang = Math.atan2(pr.vx, pr.vy);
    if (pr.kind === 'axe' || pr.kind === 'sword' || pr.kind === 'dagger') { v.root.rotation.y = ang; v.spin.rotation.y = pr.spin; }
    else if (pr.kind === 'arrow') v.root.rotation.y = ang;
    else v.spin.rotation.set(t * 9, t * 7, 0);
  }

  syncLevel(g, t) {
    for (const [idx, d] of this.doors) {
      if (g.tiles[idx] !== T.DOOR) {
        d.position.y -= 2.5;
        if (d.position.y < -WALL_H) { this.levelGroup.remove(d); this.doors.delete(idx); }
      }
    }
    const ex = g.level.exit;
    if (ex) {
      const sealed = g.tile(ex.x, ex.y) === T.SEALED;
      if (this.exitSealed && !sealed) {
        this.exitSealed = false;
        this.exit.userData.bars.visible = false;
        this.exit.userData.disk.material.opacity = 1;
        this.exit.userData.halo.material.opacity = 0.6;
      }
      this.exit.userData.disk.rotation.z = -t * 2.5;
    }
    for (const e of this.hubPortals) e.userData.disk.rotation.z = -t * 2.5;
    if (this.merchant) {
      this.merchant.update(Math.min(0.05, Math.max(0, t - (this.merchantT ?? t))));
      this.merchantT = t;
      const ps = g.livePlayers();
      if (ps.length) { const p = ps[0]; this.merchant.root.rotation.y = Math.atan2(p.x - this.merchant.root.position.x, p.y - this.merchant.root.position.z); }
    }
    for (const tc of this.torches) if (tc.halo) tc.halo.scale.setScalar(44 * (1 + Math.sin(t * 17 + tc.x) * 0.1 + Math.sin(t * 29 + tc.z) * 0.06));
    for (const [idx, m] of this.cracked) if (g.tiles[idx] !== T.CRACKED) { this.levelGroup.remove(m); this.cracked.delete(idx); }
    // X-ray glasses make secret walls glow
    if (this.crackMat) { const on = g.anyBuff('xray'); this.crackMat.emissive.set(on ? '#40ff80' : '#000000'); this.crackMat.emissiveIntensity = on ? 0.4 + Math.sin(t * 6) * 0.3 : 0; }
    const spikeY = g.spikesUp() ? 0 : -12;
    for (const pins of this.spikes) pins.position.y += (spikeY - pins.position.y) * (spikeY > pins.position.y ? 0.6 : 0.15);
    for (const m of this.lavaMats) { m.map.offset.set(Math.sin(t * 0.3) * 0.08, t * 0.05); }
    for (const c of this.clouds) c.s.position.x = ((c.s.position.x + c.speed * 0.016) % (g.w * TILE + 400));
  }

  syncLights(g, t, cx, cz) {
    const sorted = this.torches
      .map((tc) => ({ tc, d: (tc.x - cx) ** 2 + (tc.z - cz) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.torchLights.forEach((l, i) => {
      const s = sorted[i];
      if (!s || s.d > 800 * 800) { l.intensity = 0; return; }
      l.position.set(s.tc.x, s.tc.y ?? 46, s.tc.z + 10);
      l.color.set(s.tc.color || '#ff9a50');
      l.intensity = (s.tc.power || 110) * (1 + Math.sin(t * 13 + i * 3) * 0.08);
    });
    const ps = g.allPlayers();
    this.playerLights.forEach((l, i) => {
      const p = ps[i];
      if (!p || !p.alive) { l.intensity = 0; return; }
      l.color.set(heroColor(p.cls)).lerp(this.tmpColor.set('#ffffff'), 0.65);
      l.position.set(p.x, 60, p.y + 10);
      l.intensity = 60;
    });
    const ex = g.level.exit;
    if (ex) this.exitLight.position.set(ex.x * TILE + 16, 30, ex.y * TILE + 16);
    this.exitLight.intensity = !ex || this.exitSealed ? 0 : 90 + Math.sin(t * 4) * 20;
  }

  syncParticles(g) {
    const n = Math.min(g.particles.length, MAX_PARTICLES);
    for (let i = 0; i < n; i++) {
      const p = g.particles[i];
      const k = Math.max(0, p.life / p.max);
      this.pPos[i * 3] = p.x;
      this.pPos[i * 3 + 1] = 12 + (1 - k) * 12;
      this.pPos[i * 3 + 2] = p.y;
      this.tmpColor.set(p.color);
      this.pCol[i * 3] = this.tmpColor.r * k * 1.4;
      this.pCol[i * 3 + 1] = this.tmpColor.g * k * 1.4;
      this.pCol[i * 3 + 2] = this.tmpColor.b * k * 1.4;
    }
    const geo = this.particles.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  toScreen(x, y, h = 0) {
    const v = this.tmpV.set(x, h, y).project(this.camera);
    return { x: (v.x + 1) / 2 * VIEW_W, y: (1 - v.y) / 2 * VIEW_H, visible: v.z < 1 };
  }

  // ---------- menu showcase (title / hero select) ----------

  renderShowcase(entries, time) {
    if (!this.showcase) this.buildShowcase();
    const SC = this.showcase;
    const dt = Math.min(0.05, Math.max(0, time - (SC.last ?? time)));
    SC.last = time;
    const seen = new Set();
    entries.forEach((en, i) => {
      const key = `${i}:${en.cls}`;
      seen.add(key);
      let h = SC.heroes.get(key);
      if (!h) {
        h = new Actor(en.cls);
        h.base(HERO_STYLE[en.cls].idle);
        SC.heroes.set(key, h);
        SC.scene.add(h.root);
      }
      h.root.visible = true;
      const ndc = new THREE.Vector3((en.sx / VIEW_W) * 2 - 1, -(en.sy / VIEW_H) * 2 + 1, 0.5).unproject(SC.camera);
      const dir = ndc.sub(SC.camera.position).normalize();
      const dist = -SC.camera.position.z / dir.z;
      h.root.position.copy(SC.camera.position).add(dir.multiplyScalar(dist));
      h.root.scale.setScalar(en.scale);
      h.root.rotation.y = en.turn ?? 0;
      if (en.cheer && !h.cheered) { h.cheered = true; h.base('Cheer'); }
      else if (!en.cheer && h.cheered) { h.cheered = false; h.base(HERO_STYLE[en.cls].idle); }
      h.update(dt);
    });
    for (const [k, h] of SC.heroes) if (!seen.has(k)) h.root.visible = false;
    SC.halos.forEach((hl, i) => hl.scale.setScalar(120 * (1 + Math.sin(time * 17 + i) * 0.1)));
    SC.lights.forEach((l, i) => (l.intensity = 170 * (1 + Math.sin(time * 13 + i * 3) * 0.08)));
    this.renderer.render(SC.scene, SC.camera);
  }

  buildShowcase() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0806');
    scene.fog = new THREE.Fog('#0a0806', 400, 900);
    const camera = new THREE.PerspectiveCamera(32, VIEW_W / VIEW_H, 5, 2000);
    camera.position.set(0, 70, 420);
    camera.lookAt(0, 50, 0);
    scene.add(new THREE.HemisphereLight('#ffd8b0', '#201008', 1.2));
    const key = new THREE.DirectionalLight('#ffe0c0', 1.6);
    key.position.set(-150, 300, 400);
    scene.add(key);
    const floorTiles = [], wallList = [];
    for (let x = -12; x <= 12; x++) for (let z = -6; z <= 6; z++) floorTiles.push({ x: x * 64, z: z * 64, ry: ((x * 7 + z * 3) & 3) * Math.PI / 2, sx: S * 2, sy: S * 2, sz: S * 2 });
    for (let x = -8; x <= 8; x++) wallList.push({ x: x * 128, z: -170, sx: S * 2, sy: S * 2, sz: S * 2 });
    const g = new THREE.Group();
    this.instanced(g, 'floor', floorTiles);
    this.instanced(g, 'wall', wallList);
    g.position.y = -2;
    scene.add(g);
    const lights = [], halos = [];
    for (const x of [-330, -110, 110, 330]) {
      const tch = cloneProp('torch');
      tch.scale.setScalar(S * 2.2);
      tch.position.set(x, 120, -154);
      scene.add(tch);
      const halo = glowSprite('#ffa040', 120, 0.8);
      halo.position.set(x, 150, -130);
      scene.add(halo);
      halos.push(halo);
      const l = new THREE.PointLight('#ff9a50', 170, 520, 1);
      l.position.set(x, 160, -100);
      scene.add(l);
      lights.push(l);
    }
    for (const [x, k] of [[-470, 'barrel_stack'], [470, 'crates'], [-560, 'keg'], [560, 'barrel_stack']]) {
      const p = cloneProp(k);
      p.scale.setScalar(S * 1.6);
      p.position.set(x, 0, -110);
      scene.add(p);
    }
    this.showcase = { scene, camera, heroes: new Map(), lights, halos };
  }
}

function makePhoenix() {
  const g = new THREE.Group();
  const fire = new THREE.MeshStandardMaterial({ color: '#ffa030', emissive: '#ff5010', emissiveIntensity: 1.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), fire);
  body.scale.set(1, 0.8, 1.6);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), fire);
  head.position.set(0, 2, 6);
  g.add(head);
  const wings = [];
  const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -3), new THREE.Vector3(14, 2, -2), new THREE.Vector3(10, 0, 4)]);
  wingGeo.computeVertexNormals();
  const wingMat = new THREE.MeshStandardMaterial({ color: '#ffd040', emissive: '#ff7010', emissiveIntensity: 1.4, side: THREE.DoubleSide });
  for (const s of [1, -1]) { const w = new THREE.Mesh(wingGeo, wingMat); w.scale.x = s; g.add(w); wings.push(w); }
  g.add(glowSprite('#ff7020', 40, 0.8));
  g.userData.wings = wings;
  return g;
}

function addHorns(actor, color, r, len, spread) {
  const head = actor.bone('head');
  if (!head) return;
  const hm = new THREE.MeshStandardMaterial({ color, flatShading: true });
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(r, len, 6), hm);
    horn.position.set(s * spread, 0.95, 0);
    horn.rotation.z = -s * 0.6;
    head.add(horn);
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
