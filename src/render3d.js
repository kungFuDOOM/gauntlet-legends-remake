// Three.js renderer. Builds the dungeon from the tile map out of modular KayKit pieces and
// keeps an animated 3D model in sync with every simulated entity. The simulation stays 2D
// on the ground plane (sim x -> world X, sim y -> world Z), as in the arcade original.

import * as THREE from 'three';
import { TILE, VIEW_W, VIEW_H, WORLD_VIEW_W, WORLD_VIEW_H, POWERUPS } from './config.js';
import { T } from './level.js';
import { assets, Actor, cloneProp, MODEL_SCALE } from './assets.js';
import { capTexture, glowTexture, glowSprite, buildBoss, buildExit, buildProjectile, buildMarker, buildItem, heroColor } from './models.js';

const WALL_H = 52;
const CAM_OFFSET = new THREE.Vector3(0, 380, 240);
const MAX_PARTICLES = 900;
const TORCH_LIGHTS = 8;
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
};

const ENEMY_STYLE = {
  grunt: { model: 'skeleton_minion', weapon: 'weapon_blade', walk: 'Walking_D_Skeletons', walkSpeed: 1.6, scale: 1 },
  ghost: { model: 'skeleton_minion', ghost: true, walk: 'Running_C', walkSpeed: 1.2, scale: 0.95, float: true },
  lobber: { model: 'skeleton_rogue', walk: 'Running_C', walkSpeed: 1.3, scale: 0.85 },
  demon: { model: 'skeleton_warrior', weapon: 'weapon_axe', tint: '#ff7a60', eyes: '#ffcc00', walk: 'Running_A', walkSpeed: 1.3, scale: 1.08, horns: '#e8dcb8' },
  sorcerer: { model: 'skeleton_mage', weapon: 'weapon_staff', tint: '#d8a0ff', eyes: '#ff40ff', walk: 'Walking_A', walkSpeed: 1.4, scale: 1 },
  death: { model: 'skeleton_mage', weapon: 'weapon_staff', tint: '#3a3440', eyes: '#ff1010', walk: 'Walking_A', walkSpeed: 1.2, scale: 1.25 },
};

export class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
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
  instanced(group, name, list) {
    if (!list.length) return;
    const tpl = assets.props[name];
    tpl.updateMatrixWorld(true);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    tpl.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
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

  buildLevel(g) {
    if (this.levelGroup) this.scene.remove(this.levelGroup);
    for (const [, v] of this.views) this.scene.remove(v.root);
    this.views.clear();
    for (const c of this.corpses) this.scene.remove(c.root);
    this.corpses = [];
    for (const [, m] of this.markers) this.scene.remove(m);
    this.markers.clear();

    const th = g.theme;
    const group = new THREE.Group();
    this.levelGroup = group;
    this.level = g.level;
    this.scene.add(group);
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, 450, 1000);
    this.hemi.color.set(th.light);
    this.hemi.groundColor.set(th.fog);
    this.hemi.intensity = th.ambient * 1.5;
    this.sun.color.set(th.light);
    this.sun.intensity = th.ambient * 1.2 + 0.2;

    const { w, h } = g;
    const walk = (tx, ty) => g.tile(tx, ty) !== T.WALL;
    const isWall = (tx, ty) => g.tile(tx, ty) === T.WALL;

    // floor tiles, varied like a real dungeon floor
    const floors = { floor: [], floor_broken_a: [], floor_broken_b: [], floor_weeds: [], floor_decorated: [] };
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (!walk(tx, ty)) continue;
        const r = hash(tx, ty);
        const kind = r < 0.76 ? 'floor' : r < 0.86 ? 'floor_broken_a' : r < 0.95 ? 'floor_broken_b' : r < 0.975 ? 'floor_weeds' : 'floor_decorated';
        floors[kind].push({ x: tx * TILE + 16, z: ty * TILE + 16, ry: Math.floor(hash(ty, tx) * 4) * Math.PI / 2 });
      }
    for (const [k, list] of Object.entries(floors)) this.instanced(group, k, list);

    // walls stand on every floor/wall boundary; caps close off the solid rock above
    const walls = { wall: [], wall_cracked: [] };
    const wallFaces = [];
    const SX = S * 0.54, SY = WALL_H / 4, SZ = S * 0.5;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (!walk(tx, ty)) continue;
        const sides = [
          [0, -1, tx * TILE + 16, ty * TILE - 4, 0],
          [0, 1, tx * TILE + 16, ty * TILE + TILE + 4, Math.PI],
          [-1, 0, tx * TILE - 4, ty * TILE + 16, Math.PI / 2],
          [1, 0, tx * TILE + TILE + 4, ty * TILE + 16, -Math.PI / 2],
        ];
        for (const [dx, dy, x, z, ry] of sides) {
          if (!isWall(tx + dx, ty + dy)) continue;
          const kind = hash(tx * 7 + dx, ty * 13 + dy) < 0.12 ? 'wall_cracked' : 'wall';
          walls[kind].push({ x, z, ry, sx: SX, sy: SY, sz: SZ });
          wallFaces.push({ tx, ty, dx, dy, x, z, ry });
        }
      }
    for (const [k, list] of Object.entries(walls)) this.instanced(group, k, list);

    const cap = { pos: [], uv: [] };
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (!isWall(tx, ty)) continue;
        let near = false;
        for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) if (walk(tx + ox, ty + oy)) { near = true; break; }
        if (!near) continue;
        const x0 = tx * TILE, z0 = ty * TILE, x1 = x0 + TILE, z1 = z0 + TILE, y = WALL_H + 0.3;
        cap.pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0);
        cap.uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cap.pos, 3));
    capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cap.uv, 2));
    capGeo.computeVertexNormals();
    group.add(new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ map: capTexture(th.wallTop), color: '#5a5550', roughness: 1 })));

    // gates on door tiles; they sink into the floor when unlocked
    this.doors = new Map();
    const open = (x, y) => { const k = g.tile(x, y); return k === T.FLOOR || k === T.EXIT; };
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (g.tile(tx, ty) !== T.DOOR) continue;
        const d = cloneProp('wall_gated');
        d.scale.set(S * 0.5, SY, S * 0.6);
        d.position.set(tx * TILE + 16, 0, ty * TILE + 16);
        if (open(tx - 1, ty) || open(tx + 1, ty)) d.rotation.y = Math.PI / 2;
        group.add(d);
        this.doors.set(ty * w + tx, d);
      }

    // torches and banners on walls that face the camera, crates and bones for clutter
    this.torches = [];
    const torchSpots = [];
    const decoSpots = [];
    for (const f of wallFaces) {
      const facesCam = f.dy === -1; // wall to the north: its face looks south toward the camera
      const r = hash(f.tx * 3 + 11, f.ty * 5 + 7);
      if (facesCam && r < 0.2 && !torchSpots.some((p) => Math.abs(p.tx - f.tx) + Math.abs(p.ty - f.ty) < 5)) torchSpots.push(f);
      else if (facesCam && r > 0.93) decoSpots.push(f);
    }
    for (const f of torchSpots) {
      const t = cloneProp('torch');
      t.scale.setScalar(S);
      t.position.set(f.x, 30, f.ty * TILE);
      const halo = glowSprite('#ffa040', 46, 0.75);
      halo.position.set(f.x, 42, f.ty * TILE + 8);
      group.add(t, halo);
      this.torches.push({ x: f.x, z: f.ty * TILE + 10, halo });
    }
    for (const f of decoSpots) {
      const b = cloneProp(hash(f.tx, f.ty) < 0.5 ? 'banner_red' : 'banner_blue');
      b.scale.set(S * 0.5, S * 0.42, S * 0.5);
      b.position.set(f.x, 0, f.ty * TILE - 8);
      group.add(b);
    }
    const clutter = [];
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (g.tile(tx, ty) !== T.FLOOR) continue;
        const r = hash(tx * 17 + 3, ty * 31 + 5);
        const wallN = isWall(tx, ty - 1), wallW = isWall(tx - 1, ty), wallE = isWall(tx + 1, ty);
        if (wallN && (wallW || wallE) && r < 0.35) {
          const kinds = ['barrel_stack', 'crates', 'keg'];
          const p = cloneProp(kinds[Math.floor(hash(ty, tx * 3) * kinds.length)]);
          p.scale.setScalar(S * 0.5);
          p.position.set(tx * TILE + (wallW ? 10 : 22), 0, ty * TILE + 10);
          p.rotation.y = hash(tx, ty * 9) * Math.PI;
          group.add(p);
        } else if (r < 0.025) clutter.push({ tx, ty, r });
      }
    for (const c of clutter) {
      const kinds = ['bones_a', 'bones_b', 'skull', 'ribcage'];
      const k = kinds[Math.floor(hash(c.tx * 5, c.ty) * kinds.length)];
      const p = cloneProp(k);
      p.scale.setScalar(S * (k === 'skull' || k === 'ribcage' ? 0.3 : 0.45));
      p.position.set(c.tx * TILE + 8 + hash(c.ty, c.tx) * 16, k === 'ribcage' ? 4 : 2, c.ty * TILE + 8 + c.r * 400);
      p.rotation.y = c.r * 300;
      group.add(p);
    }

    // exit portal flanked by candles
    const ex = g.level.exit;
    this.exitSealed = g.tile(ex.x, ex.y) === T.SEALED;
    this.exit = buildExit(this.exitSealed);
    this.exit.position.set(ex.x * TILE + 16, 0.5, ex.y * TILE + 16);
    group.add(this.exit);
    for (const ox of [-22, 22]) {
      const c = cloneProp('candles');
      c.scale.setScalar(S * 0.6);
      c.position.set(ex.x * TILE + 16 + ox, 0, ex.y * TILE);
      group.add(c);
    }
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
    const st = ENEMY_STYLE[e.type];
    const a = new Actor(st.model, { tint: st.tint, ghost: st.ghost, emissiveEyes: st.eyes });
    a.model.scale.setScalar(S * st.scale);
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
    const colors = { grunt: '#ff8a30', ghost: '#a0c0ff', lobber: '#b0ff40', demon: '#ff3020', sorcerer: '#e040ff', death: '#ffffff' };
    switch (gen.type) {
      case 'ghost': add('grave', 0.75, 0, 0, -2); add('skull', 0.3, 9, 0, 9); break;
      case 'sorcerer': add('shrine', 0.8); add('skull_candle', 0.45, 10, 0, 8); break;
      case 'demon': add('coffin', 0.6, 0, 0, 0, Math.PI / 2); add('skull_candle', 0.5, 0, 9, 0); break;
      case 'lobber': add('crates', 0.55); add('skull', 0.3, 10, 0, 10); break;
      default: // grunt: a heap of bones with a skull on top
        add('ribcage', 0.55, 0, 6, 0); add('bones_a', 0.6, -8, 2, 6, 0.6); add('bones_b', 0.6, 7, 2, -6, 2.1);
        add('bones_a', 0.6, 4, 2, 8, 1.2); add('skull', 0.45, 0, 10, 2);
    }
    const halo = glowSprite(colors[gen.type] || '#fff', 54, 0.5);
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
        const m = buildItem(it.type, it.sub, it.sub && POWERUPS[it.sub].color);
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
      if ((v.kind === 'enemy' || v.kind === 'boss') && v.actor && !obj.vanish && v.root.visible) {
        v.actor.flash(0);
        v.actor.die(v.kind === 'boss' ? 'Death_B' : 'Death_A');
        this.corpses.push({ ...v, t: 0 });
      } else this.scene.remove(v.root);
    }
    this.corpses = this.corpses.filter((c) => {
      c.t += dt;
      c.actor.update(dt);
      if (c.t > 1.3) c.root.position.y -= dt * 25;
      if (c.t > 2.4) { this.scene.remove(c.root); return false; }
      return true;
    });

    const seenM = new Set();
    for (const pr of g.projs) {
      if (pr.kind !== 'lob') continue;
      seenM.add(pr);
      let mk = this.markers.get(pr);
      if (!mk) { mk = buildMarker(); this.markers.set(pr, mk); this.scene.add(mk); }
      mk.position.set(pr.tx, 1.5, pr.ty);
      mk.scale.setScalar(0.4 + 0.6 * (pr.t / pr.T));
    }
    for (const [pr, mk] of this.markers) if (!seenM.has(pr)) { this.scene.remove(mk); this.markers.delete(pr); }

    this.syncLights(g, t, tx, tz);
    this.syncParticles(g);
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
    if (p) v.root.rotation.y = lerpAngle(v.root.rotation.y, Math.atan2(p.x - e.x, p.y - e.y), 0.18);
    const moved = v.px !== undefined ? Math.hypot(e.x - v.px, e.y - v.py) : 0;
    v.px = e.x; v.py = e.y;
    const moving = moved > 0.15;
    a.base(moving ? st.walk : 'Idle', moving ? st.walkSpeed : 1);
    if (e.act && e.act !== v.lastAct) {
      v.lastAct = e.act;
      const clip = e.act.type === 'throw' ? 'Throw' : e.act.type === 'cast' ? 'Spellcast_Shoot' : '1H_Melee_Attack_Chop';
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
    if (pr.kind === 'lob') {
      v.root.position.set(pr.x, 14 + pr.z, pr.y);
      v.spin.rotation.set(t * 8, t * 6, 0);
      return;
    }
    v.root.position.set(pr.x, 18, pr.y);
    const ang = Math.atan2(pr.vx, pr.vy);
    if (pr.kind === 'axe' || pr.kind === 'sword') { v.root.rotation.y = ang; v.spin.rotation.y = pr.spin; }
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
    const sealed = g.tile(ex.x, ex.y) === T.SEALED;
    if (this.exitSealed && !sealed) {
      this.exitSealed = false;
      this.exit.userData.bars.visible = false;
      this.exit.userData.disk.material.opacity = 1;
      this.exit.userData.halo.material.opacity = 0.6;
    }
    this.exit.userData.disk.rotation.z = -t * 2.5;
    for (const tc of this.torches) tc.halo.scale.setScalar(44 * (1 + Math.sin(t * 17 + tc.x) * 0.1 + Math.sin(t * 29 + tc.z) * 0.06));
  }

  syncLights(g, t, cx, cz) {
    const sorted = this.torches
      .map((tc) => ({ tc, d: (tc.x - cx) ** 2 + (tc.z - cz) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.torchLights.forEach((l, i) => {
      const s = sorted[i];
      if (!s || s.d > 800 * 800) { l.intensity = 0; return; }
      l.position.set(s.tc.x, 46, s.tc.z + 10);
      l.intensity = 110 * (1 + Math.sin(t * 13 + i * 3) * 0.08);
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
    this.exitLight.position.set(ex.x * TILE + 16, 30, ex.y * TILE + 16);
    this.exitLight.intensity = this.exitSealed ? 0 : 90 + Math.sin(t * 4) * 20;
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
