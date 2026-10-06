// Three.js renderer: builds 3D level geometry from the tile map and keeps a 3D model in
// sync with every simulated entity. The simulation stays 2D on the ground plane
// (sim x -> world X, sim y -> world Z), exactly like the arcade original's gameplay.

import * as THREE from 'three';
import { TILE, VIEW_W, VIEW_H, WORLD_VIEW_W, WORLD_VIEW_H, POWERUPS } from './config.js';
import { T } from './level.js';
import {
  floorTexture, wallTexture, capTexture, glowTexture, buildHero, buildEnemy, buildBoss, buildGenerator,
  buildItem, buildDoor, buildTorch, buildExit, buildProjectile, buildMarker, heroColor,
} from './models.js';

const WALL_H = 60;
const CAM_OFFSET = new THREE.Vector3(0, 400, 250);
const MAX_PARTICLES = 900;
const TORCH_LIGHTS = 6;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, VIEW_W / VIEW_H, 10, 4000);
    this.scene = new THREE.Scene();

    this.hemi = new THREE.HemisphereLight('#ffffff', '#202020', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -480; sc.right = 480; sc.top = 420; sc.bottom = -420; sc.near = 10; sc.far = 1600;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.torchLights = [];
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight('#ff9a50', 0, 240, 1);
      this.scene.add(l);
      this.torchLights.push(l);
    }
    this.playerLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 220, 1);
      this.scene.add(l);
      this.playerLights.push(l);
    }
    this.exitLight = new THREE.PointLight('#60c0ff', 0, 200, 1);
    this.scene.add(this.exitLight);

    // particles
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

    this.meshes = new Map();
    this.markers = new Map();
    this.levelGroup = null;
    this.level = null;
    this.tmpColor = new THREE.Color();
    this.showcase = null;
  }

  // ---------- level geometry ----------

  buildLevel(g) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => { if (o.geometry && o.userData.own) o.geometry.dispose(); });
    }
    for (const [, m] of this.meshes) this.scene.remove(m);
    this.meshes.clear();
    for (const [, m] of this.markers) this.scene.remove(m);
    this.markers.clear();

    const th = g.theme;
    const group = new THREE.Group();
    this.levelGroup = group;
    this.level = g.level;
    this.scene.add(group);
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, 500, 1100);
    this.hemi.color.set(th.light);
    this.hemi.groundColor.set(th.fog);
    this.hemi.intensity = th.ambient * 1.6;
    this.sun.color.set(th.light);
    this.sun.intensity = th.ambient * 1.4 + 0.3;

    const { w, h } = g;
    const walk = (tx, ty) => g.tile(tx, ty) !== T.WALL;

    const floor = { pos: [], nor: [], uv: [] };
    const sides = { pos: [], nor: [], uv: [] };
    const tops = { pos: [], nor: [], uv: [] };
    const quad = (buf, a, b, c, d, n, uvs) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = [a, b, c, d][i];
        buf.pos.push(p[0], p[1], p[2]);
        buf.nor.push(n[0], n[1], n[2]);
        buf.uv.push(uvs[i][0], uvs[i][1]);
      }
    };
    const U = 112;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const x0 = tx * TILE, z0 = ty * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
        if (walk(tx, ty)) {
          quad(floor, [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0],
            [[x0 / U, z1 / U], [x1 / U, z1 / U], [x1 / U, z0 / U], [x0 / U, z0 / U]]);
          continue;
        }
        let near = false;
        for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) if (walk(tx + ox, ty + oy)) { near = true; break; }
        if (!near) continue;
        const H = WALL_H;
        quad(tops, [x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        const vH = H / U;
        if (walk(tx, ty + 1)) quad(sides, [x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], [[x0 / U, 0], [x1 / U, 0], [x1 / U, vH], [x0 / U, vH]]);
        if (walk(tx, ty - 1)) quad(sides, [x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1], [[x1 / U, 0], [x0 / U, 0], [x0 / U, vH], [x1 / U, vH]]);
        if (walk(tx + 1, ty)) quad(sides, [x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0], [[z1 / U, 0], [z0 / U, 0], [z0 / U, vH], [z1 / U, vH]]);
        if (walk(tx - 1, ty)) quad(sides, [x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], [[z0 / U, 0], [z1 / U, 0], [z1 / U, vH], [z0 / U, vH]]);
      }
    const mesh = (buf, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      const m = new THREE.Mesh(geo, mat);
      m.userData.own = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    mesh(floor, new THREE.MeshStandardMaterial({ map: floorTexture(`#${new THREE.Color(th.floorB).offsetHSL(0, 0.02, 0.1).getHexString()}`), roughness: 0.92 }));
    mesh(sides, new THREE.MeshStandardMaterial({ map: wallTexture(th.wallSide), roughness: 0.9 })).castShadow = true;
    mesh(tops, new THREE.MeshStandardMaterial({ map: capTexture(th.wallTop), color: '#8a8a8a', roughness: 0.9 })).castShadow = true;

    // doors
    this.doors = new Map();
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (g.tile(tx, ty) !== T.DOOR) continue;
        // A door blocking an east-west corridor stands in a north-south column.
        const open = (x, y) => { const k = g.tile(x, y); return k === T.FLOOR || k === T.EXIT; };
        const vertical = open(tx - 1, ty) || open(tx + 1, ty);
        const d = buildDoor(vertical);
        d.position.set(tx * TILE + TILE / 2, 0, ty * TILE + TILE / 2);
        d.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(d);
        this.doors.set(ty * w + tx, d);
      }

    // torches on south-facing wall faces
    this.torches = [];
    const taken = [];
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (g.tile(tx, ty) !== T.WALL || !walk(tx, ty + 1) || g.tile(tx, ty + 1) === T.DOOR) continue;
        if (hash(tx, ty) > 0.16) continue;
        if (taken.some(([x, y]) => Math.abs(x - tx) + Math.abs(y - ty) < 5)) continue;
        taken.push([tx, ty]);
        const t = buildTorch();
        t.position.set(tx * TILE + TILE / 2, 36, ty * TILE + TILE);
        group.add(t);
        this.torches.push(t);
      }

    // exit
    const ex = g.level.exit;
    this.exitSealed = g.tile(ex.x, ex.y) === T.SEALED;
    this.exit = buildExit(this.exitSealed);
    this.exit.position.set(ex.x * TILE + TILE / 2, 0, ex.y * TILE + TILE / 2);
    group.add(this.exit);

    // scattered rubble & bones for atmosphere
    const debris = new THREE.MeshStandardMaterial({ color: th.wallSide, flatShading: true, roughness: 1 });
    const bone = new THREE.MeshStandardMaterial({ color: '#d8d0b8', flatShading: true });
    const rock = new THREE.DodecahedronGeometry(3, 0);
    const boneG = new THREE.CylinderGeometry(0.8, 0.8, 9, 5);
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (g.tile(tx, ty) !== T.FLOOR) continue;
        const r = hash(tx * 3 + 1, ty * 7 + 2);
        if (r > 0.05) continue;
        const nearWall = g.tile(tx - 1, ty) === T.WALL || g.tile(tx + 1, ty) === T.WALL || g.tile(tx, ty - 1) === T.WALL;
        const m = new THREE.Mesh(r < 0.02 ? boneG : rock, r < 0.02 ? bone : debris);
        m.position.set(tx * TILE + 6 + r * 300, r < 0.02 ? 1 : 2, ty * TILE + 6 + hash(tx, ty) * 20);
        m.rotation.set(r < 0.02 ? Math.PI / 2 : r * 40, r * 90, 0);
        if (!nearWall && r >= 0.02) m.scale.setScalar(0.7);
        m.receiveShadow = true;
        group.add(m);
      }
  }

  // ---------- per-frame sync ----------

  render(g) {
    if (this.level !== g.level) this.buildLevel(g);
    const t = g.time;

    // camera follows the party
    const tx = g.camX + WORLD_VIEW_W / 2, tz = g.camY + WORLD_VIEW_H / 2 + 10;
    const sx = (Math.random() - 0.5) * g.shake, sz = (Math.random() - 0.5) * g.shake;
    this.camera.position.set(tx + CAM_OFFSET.x + sx, CAM_OFFSET.y, tz + CAM_OFFSET.z + sz);
    this.camera.lookAt(tx + sx, 0, tz + sz - 10);
    this.sun.position.set(tx - 220, 600, tz + 260);
    this.sun.target.position.set(tx, 0, tz);

    this.syncLevel(g, t, tx, tz);

    const seen = new Set();
    for (const p of g.allPlayers()) this.sync(p, () => buildHero(p.cls), (m) => this.updateHero(m, p, t), seen);
    for (const e of g.enemies) {
      if (e.type === 'boss') this.sync(e, () => buildBoss(g.info.boss.model, g.info.boss.color, g.info.boss.horn), (m) => this.updateBoss(m, e, g, t), seen);
      else this.sync(e, () => buildEnemy(e.type), (m) => this.updateEnemy(m, e, g, t), seen);
    }
    for (const gen of g.gens) this.sync(gen, () => buildGenerator(gen.type), (m) => this.updateGen(m, gen, t), seen);
    for (const it of g.items) this.sync(it, () => buildItem(it.type, it.sub, it.sub && POWERUPS[it.sub].color), (m) => this.updateItem(m, it, t), seen);
    for (const pr of g.projs) this.sync(pr, () => buildProjectile(pr.kind), (m) => this.updateProj(m, pr, t), seen);
    for (const [obj, m] of this.meshes) {
      if (!seen.has(obj)) { this.scene.remove(m); this.meshes.delete(obj); }
    }
    // lob telegraphs
    const seenM = new Set();
    for (const pr of g.projs) {
      if (pr.kind !== 'lob') continue;
      seenM.add(pr);
      let mk = this.markers.get(pr);
      if (!mk) { mk = buildMarker(); this.markers.set(pr, mk); this.scene.add(mk); }
      mk.position.set(pr.tx, 0.6, pr.ty);
      mk.scale.setScalar(0.4 + 0.6 * (pr.t / pr.T));
    }
    for (const [pr, mk] of this.markers) if (!seenM.has(pr)) { this.scene.remove(mk); this.markers.delete(pr); }

    this.syncLights(g, t, tx, tz);
    this.syncParticles(g);
    this.renderer.render(this.scene, this.camera);
  }

  sync(obj, build, update, seen) {
    let m = this.meshes.get(obj);
    if (!m) {
      m = build();
      for (const mat of m.userData.mats) { mat.userData.e0 = mat.emissive.clone(); mat.userData.ei0 = mat.emissiveIntensity; mat.userData.o0 = mat.opacity; mat.userData.t0 = mat.transparent; }
      this.meshes.set(obj, m);
      this.scene.add(m);
    }
    seen.add(obj);
    update(m);
  }

  flash(m, amount, color = '#ffffff') {
    const on = amount > 0;
    if (!on && !m.userData.flashing) return;
    m.userData.flashing = on;
    for (const mat of m.userData.mats) {
      if (on) { mat.emissive.set(color); mat.emissiveIntensity = 0.9; }
      else { mat.emissive.copy(mat.userData.e0); mat.emissiveIntensity = mat.userData.ei0; }
    }
  }

  fade(m, opacity) {
    if (m.userData.opacity === opacity) return;
    m.userData.opacity = opacity;
    for (const mat of m.userData.mats) {
      mat.transparent = opacity < 1 || mat.userData.t0;
      mat.opacity = opacity < 1 ? opacity * mat.userData.o0 : mat.userData.o0;
      mat.needsUpdate = true;
    }
  }

  animateWalk(rig, walk, moving, amp = 0.75) {
    const s = moving ? Math.sin(walk) * amp : 0;
    if (rig.legL) { rig.legL.rotation.x = s; rig.legR.rotation.x = -s; }
    if (rig.armL) { rig.armL.rotation.x = -s * 0.8; rig.armR.rotation.x = s * 0.8; }
    if (rig.rig) rig.rig.position.y = moving ? Math.abs(Math.cos(walk)) * 1.5 : 0;
  }

  updateHero(m, p, t) {
    const rig = m.userData.rig;
    m.visible = p.alive && !(p.invuln > 0 && Math.floor(t * 18) % 2);
    if (!p.alive) return;
    m.position.set(p.x, 0, p.y);
    const target = Math.atan2(p.fx, p.fy);
    m.rotation.y = lerpAngle(m.rotation.y, target, 0.35);
    const moving = m.userData.lastWalk !== p.walk;
    m.userData.lastWalk = p.walk;
    this.animateWalk(rig, p.walk, moving);
    if (p.swing > 0) {
      const k = Math.sin((1 - p.swing / 0.18) * Math.PI);
      rig.armR.rotation.x = -1.2 - k * 1.6;
      rig.armR.rotation.z = k * 0.6;
      if (p.swing > 0.2) m.rotation.y += t * 30; // turbo spin
    } else if (p.throwT > 0) {
      rig.armR.rotation.x = -2.6 + (1 - p.throwT / 0.15) * 2;
      rig.armR.rotation.z = 0;
    } else rig.armR.rotation.z = 0;
    if (rig.bow && p.throwT > 0) rig.armL.rotation.x = -1.5;
    if (rig.orb) rig.orb.material.emissiveIntensity = 1.5 + Math.sin(t * 8) * 0.5;
    this.flash(m, p.hurtFlash, '#ff2020');
    // power-up aura
    let aura = m.userData.aura;
    const buff = Object.keys(p.buffs)[0];
    if (buff) {
      if (!aura) {
        aura = new THREE.Mesh(new THREE.SphereGeometry(20, 14, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
        aura.position.y = 18;
        m.add(aura);
        m.userData.aura = aura;
      }
      aura.visible = true;
      aura.material.color.set(POWERUPS[buff].color);
      aura.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
    } else if (aura) aura.visible = false;
    // dash streak
    if (p.dash) m.rotation.x = 0.25; else m.rotation.x = 0;
  }

  updateEnemy(m, e, g, t) {
    const rig = m.userData.rig;
    m.position.set(e.x, 0, e.y);
    const [p] = g.nearestPlayer(e);
    if (p) m.rotation.y = lerpAngle(m.rotation.y, Math.atan2(p.x - e.x, p.y - e.y), 0.2);
    const moving = m.userData.lastWalk !== e.walk;
    m.userData.lastWalk = e.walk;
    if (rig.float) {
      rig.rig.position.y = 4 + Math.sin(t * 4 + e.phase) * 3;
      rig.rig.rotation.z = Math.sin(t * 3 + e.phase) * 0.1;
    } else this.animateWalk(rig, e.walk, moving, 0.9);
    if (e.cd > 0 && e.cd < 0.2 && rig.armR) rig.armR.rotation.x = -2.2;
    if (rig.wings) rig.wings.forEach((w, i) => (w.rotation.y = Math.sin(t * 10 + e.phase) * 0.4 * (i ? -1 : 1)));
    if (rig.orb) rig.orb.scale.setScalar(1 + Math.sin(t * 10) * 0.3);
    this.fade(m, e.invisible ? 0.15 : 1);
    this.flash(m, e.hurt);
    const s = 1 + (e.hurt > 0 ? 0.12 : 0);
    m.scale.setScalar(s);
  }

  updateBoss(m, e, g, t) {
    const rig = m.userData.rig;
    m.position.set(e.x, 0, e.y);
    const [p] = g.nearestPlayer(e);
    if (p && !(e.charging > 0)) m.rotation.y = lerpAngle(m.rotation.y, Math.atan2(p.x - e.x, p.y - e.y), 0.08);
    else if (e.charging > 0) m.rotation.y = Math.atan2(e.cvx, e.cvy);
    const moving = m.userData.lastWalk !== e.walk;
    m.userData.lastWalk = e.walk;
    rig.wings.forEach((w, i) => (w.rotation.y = Math.sin(t * 5) * 0.5 * (i ? -1 : 1)));
    if (rig.legs) rig.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(e.walk * 0.8 + i * Math.PI / 2) * 0.5 : Math.sin(t * 2 + i) * 0.1));
    rig.heads.forEach((h, i) => {
      h.rotation.y = Math.sin(t * 1.5 + i * 2) * 0.3;
      if (h.userData.jaw) h.userData.jaw.rotation.x = e.cd2 < 0.4 ? 0.6 : Math.max(0, Math.sin(t * 3)) * 0.15;
    });
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 2) * 0.4;
    if (rig.humanoid) {
      this.animateWalk(rig.humanoid, e.walk * 0.6, moving, 0.6);
      if (e.cd < 0.3) rig.humanoid.armR.rotation.x = -2.4;
    }
    rig.rig.rotation.x = e.charging > 0 ? 0.25 : 0;
    m.scale.setScalar(e.hurt > 0 ? 1.04 : 1);
    this.flash(m, e.hurt, e.hp < e.maxHp * 0.4 ? '#ff4020' : '#ffffff');
  }

  updateGen(m, gen, t) {
    m.position.set(gen.x, 0, gen.y);
    const tier = Math.ceil(gen.hp / 15);
    m.scale.setScalar(0.62 + tier * 0.14);
    const { core, halo } = m.userData;
    const pulse = 0.5 + Math.sin(t * 5 + gen.x) * 0.5;
    core.material.emissiveIntensity = 1.2 + pulse * 2;
    halo.material.opacity = 0.3 + pulse * 0.35;
    this.flash(m, gen.hurt);
  }

  updateItem(m, it, t) {
    m.position.set(it.x, Math.sin(it.bob) * 1.5 + 1.5, it.y);
    if (m.userData.spins) m.userData.spin.rotation.y = t * 2 + it.bob;
  }

  updateProj(m, pr, t) {
    if (pr.kind === 'lob') {
      m.position.set(pr.x, 14 + pr.z, pr.y);
      m.userData.spin.rotation.set(t * 8, t * 6, 0);
      return;
    }
    m.position.set(pr.x, 16, pr.y);
    const ang = Math.atan2(pr.vx, pr.vy);
    if (pr.kind === 'axe' || pr.kind === 'sword') {
      m.rotation.y = ang;
      m.userData.spin.rotation.y = pr.spin;
    } else if (pr.kind === 'arrow') {
      m.rotation.y = ang;
    } else {
      m.userData.spin.rotation.set(t * 9, t * 7, 0);
    }
  }

  syncLevel(g, t, cx, cz) {
    // doors opened by keys sink into the floor
    for (const [idx, d] of this.doors) {
      if (g.tiles[idx] !== T.DOOR) {
        d.position.y -= 2.5;
        if (d.position.y < -45) { this.levelGroup.remove(d); this.doors.delete(idx); }
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
    for (const torch of this.torches) {
      const f = 1 + Math.sin(t * 17 + torch.position.x) * 0.12 + Math.sin(t * 29 + torch.position.z) * 0.08;
      torch.userData.flame.scale.set(f, f * 1.15, f);
      torch.userData.halo.scale.setScalar(30 * f);
    }
  }

  syncLights(g, t, cx, cz) {
    const sorted = this.torches
      .map((tch) => ({ tch, d: (tch.position.x - cx) ** 2 + (tch.position.z - cz) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.torchLights.forEach((l, i) => {
      const s = sorted[i];
      if (!s || s.d > 900 * 900) { l.intensity = 0; return; }
      l.position.set(s.tch.position.x, 46, s.tch.position.z + 16);
      l.intensity = 95 * (1 + Math.sin(t * 13 + i * 3) * 0.08);
    });
    const ps = g.allPlayers();
    this.playerLights.forEach((l, i) => {
      const p = ps[i];
      if (!p || !p.alive) { l.intensity = 0; return; }
      l.color.set(heroColor(p.cls)).lerp(this.tmpColor.set('#ffffff'), 0.6);
      l.position.set(p.x, 60, p.y + 10);
      l.intensity = 70;
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
      this.pPos[i * 3 + 1] = 10 + (1 - k) * 10;
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

  // World position -> overlay canvas coordinates.
  toScreen(x, y, h = 0) {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return { x: (v.x + 1) / 2 * VIEW_W, y: (1 - v.y) / 2 * VIEW_H, visible: v.z < 1 };
  }

  // ---------- menu showcase (title / hero select) ----------

  renderShowcase(entries, time) {
    if (!this.showcase) this.buildShowcase();
    const S = this.showcase;
    const seen = new Set();
    entries.forEach((en, i) => {
      const key = `${i}:${en.cls}`;
      seen.add(key);
      let hero = S.heroes.get(key);
      if (!hero) { hero = buildHero(en.cls); S.heroes.set(key, hero); S.scene.add(hero); }
      hero.visible = true;
      const ndc = new THREE.Vector3((en.sx / VIEW_W) * 2 - 1, -(en.sy / VIEW_H) * 2 + 1, 0.5).unproject(S.camera);
      const dir = ndc.sub(S.camera.position).normalize();
      const dist = -S.camera.position.z / dir.z;
      const pos = S.camera.position.clone().add(dir.multiplyScalar(dist));
      hero.position.copy(pos);
      hero.scale.setScalar(en.scale);
      hero.rotation.y = en.turn ?? Math.sin(time * 0.8 + i) * 0.5;
      const rig = hero.userData.rig;
      this.animateWalk(rig, time * 9, !!en.walk);
      if (rig.orb) rig.orb.material.emissiveIntensity = 1.5 + Math.sin(time * 8) * 0.5;
      if (en.cheer) rig.armR.rotation.x = -2.6 + Math.sin(time * 6) * 0.2;
      else if (!en.walk) rig.armR.rotation.x = 0;
    });
    for (const [k, h] of S.heroes) if (!seen.has(k)) h.visible = false;
    S.torches.forEach((tch, i) => {
      const f = 1 + Math.sin(time * 17 + i) * 0.12;
      tch.userData.flame.scale.set(f, f * 1.15, f);
      S.lights[i].intensity = 160 * (1 + Math.sin(time * 13 + i * 3) * 0.08);
    });
    this.renderer.render(S.scene, S.camera);
  }

  buildShowcase() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0806');
    scene.fog = new THREE.Fog('#0a0806', 300, 700);
    const camera = new THREE.PerspectiveCamera(32, VIEW_W / VIEW_H, 5, 2000);
    camera.position.set(0, 60, 380);
    camera.lookAt(0, 40, 0);
    scene.add(new THREE.HemisphereLight('#ffd0a0', '#201008', 0.9));
    const key = new THREE.DirectionalLight('#ffe0c0', 1.4);
    key.position.set(-120, 300, 300);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -300, right: 300, top: 200, bottom: -200 });
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), new THREE.MeshStandardMaterial({ map: floorTexture('#5a4a3a'), roughness: 0.9 }));
    floor.material.map.repeat.set(10, 5);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -40;
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), new THREE.MeshStandardMaterial({ map: wallTexture('#6a5a4a'), roughness: 0.9 }));
    wall.material.map.repeat.set(8, 3);
    wall.position.set(0, 160, -160);
    wall.receiveShadow = true;
    scene.add(wall);
    const torches = [], lights = [];
    for (const x of [-330, -110, 110, 330]) {
      const tch = buildTorch();
      tch.scale.setScalar(2.2);
      tch.position.set(x, 130, -160);
      scene.add(tch);
      torches.push(tch);
      const l = new THREE.PointLight('#ff9a50', 160, 500, 1);
      l.position.set(x, 160, -110);
      scene.add(l);
      lights.push(l);
    }
    this.showcase = { scene, camera, heroes: new Map(), torches, lights };
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
