// Procedural models for things the CC0 KayKit packs don't cover: the Dragon, Chimera and
// Plague Fiend bosses, magic pickups (gems, amulets, rune stones), projectiles, the exit
// portal, plus shared glow/swirl textures.

import * as THREE from 'three';

// ---------- shared helpers ----------

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const G = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  sphere: (r, s = 8) => geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(4, s - 2))),
  cyl: (rt, rb, h, s = 8) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  cone: (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  torus: (r, t, arc = Math.PI * 2) => geo(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 6, 14, arc)),
  oct: (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r)),
  ico: (r) => geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)),
  dodec: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  wing: () => geo('wing', () => {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, 0, 1, 0.4, -0.3, 0.9, -0.5, -0.1, 0, 0, 0, 0.9, -0.5, -0.1, 0.5, -0.6, 0.1]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }),
};

// Every model gets its own materials so hit-flashes and fades are per entity.
function makeMats(flat = true) {
  const list = [];
  const m = (color, opts = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.75, metalness: 0.05, ...opts });
    list.push(mat);
    return mat;
  };
  return { m, list };
}

function part(parent, geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function finish(root, mats, extra = {}) {
  root.userData.mats = mats.list;
  Object.assign(root.userData, extra);
  return root;
}

// ---------- procedural textures ----------

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

function noise(ctx, size, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * alpha;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function capTexture(base) {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    noise(ctx, s, 22);
  });
}

// Stone block with obvious cracks: the tell for a breakable wall hiding a secret.
export function crackedTexture(base) {
  return canvasTex(128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) ctx.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
    ctx.strokeStyle = 'rgba(10,6,2,0.85)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      let x = 20 + Math.random() * 88, y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += (Math.random() - 0.5) * 30; y += 10 + Math.random() * 14; ctx.lineTo(x, y); if (Math.random() < 0.3) { ctx.moveTo(x, y); } }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,240,200,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    noise(ctx, s, 26);
  });
}

let grassTex = null;
export function grassTexture() {
  if (grassTex) return grassTex;
  grassTex = canvasTex(64, (ctx, s) => {
    ctx.fillStyle = '#4a7a30';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = ['#5a8a38', '#3e6a28', '#6a9a40', '#4f7f2c'][i % 4];
      const x = Math.random() * s, y = Math.random() * s;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 5; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#e8d870' : '#d8e0f0'; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  });
  grassTex.magFilter = THREE.NearestFilter;
  return grassTex;
}

let lavaTex = null;
export function lavaTexture() {
  if (lavaTex) return lavaTex;
  lavaTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#c02808';
    ctx.fillRect(0, 0, s, s);
    // bright molten veins between darker cooling crust
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 16;
      for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, i % 3 ? 'rgba(255,220,80,0.9)' : 'rgba(90,20,6,0.8)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    noise(ctx, s, 20);
  });
  return lavaTex;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, false);
  return glowTex;
}

let swirlTex = null;
export function swirlTexture() {
  if (swirlTex) return swirlTex;
  swirlTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    ctx.translate(s / 2, s / 2);
    for (let arm = 0; arm < 4; arm++) {
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const a = arm * Math.PI / 2 + t * Math.PI * 2.2;
        const r = t * s * 0.48;
        ctx.fillStyle = `rgba(${120 + t * 135},${200 + t * 55},255,${1 - t * 0.7})`;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + t * 6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, false);
  return swirlTex;
}

export function glowSprite(color, size, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------- bosses ----------

export function buildBoss(model, color, hornColor) {
  const mats = makeMats(false);
  const { m } = mats;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const skin = m(color);
  const belly = m(shade(color, 0.15));
  const horn = m(hornColor);
  const eyeM = m('#ffe040', { emissive: '#ffcc00', emissiveIntensity: 2 });
  const r = { root, rig, boss: true, wings: [], heads: [] };
  const wingM = m(shade(color, -0.12), { side: THREE.DoubleSide });
  const addWings = (y, span, z = -6) => {
    for (const s of [-1, 1]) {
      const wg = new THREE.Mesh(G.wing(), wingM);
      wg.scale.set(s * span, span * 0.8, span * 0.6);
      wg.position.set(s * 10, y, z);
      wg.castShadow = true;
      rig.add(wg);
      r.wings.push(wg);
    }
  };
  const legs = (y, spread, len, thick) => {
    r.legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const lg = pivot(rig, sx * spread, y, sz * spread * 1.1);
      part(lg, G.box(thick, len, thick), skin, 0, -len / 2, 0);
      part(lg, G.box(thick * 1.2, 3, thick * 1.5), horn, 0, -len + 1, 2);
      r.legs.push(lg);
    }
  };
  const head = (parent, x, y, z, s, kind) => {
    const h = pivot(parent, x, y, z);
    h.scale.setScalar(s);
    if (kind === 'snake') {
      part(h, G.box(7, 6, 12), m('#4a7a2a'), 0, 0, 3);
      part(h, G.box(1.5, 1.5, 1), eyeM, -2.5, 2, 8.5, false);
      part(h, G.box(1.5, 1.5, 1), eyeM, 2.5, 2, 8.5, false);
    } else if (kind === 'goat') {
      part(h, G.box(8, 9, 11), m('#c8c0b0'), 0, 0, 2);
      for (const sx of [-1, 1]) part(h, G.torus(4, 1.3, Math.PI), horn, sx * 4, 5, -1).rotation.y = Math.PI / 2;
      part(h, G.box(1.6, 1.6, 1), eyeM, -2.5, 1.5, 7.5, false);
      part(h, G.box(1.6, 1.6, 1), eyeM, 2.5, 1.5, 7.5, false);
    } else {
      part(h, G.box(12, 10, 14), skin, 0, 0, 2);
      const jaw = pivot(h, 0, -4, 0);
      part(jaw, G.box(10, 3, 13), belly, 0, -1.5, 3);
      for (let i = -1; i <= 1; i++) part(h, G.cone(0.9, 3, 4), m('#f0f0e0'), i * 3, -5, 8.5).rotation.x = Math.PI;
      part(h, G.box(2.4, 2, 1), eyeM, -3.5, 2.5, 9, false);
      part(h, G.box(2.4, 2, 1), eyeM, 3.5, 2.5, 9, false);
      for (const sx of [-1, 1]) part(h, G.cone(2, 11, 5), horn, sx * 4, 7, -4).rotation.x = -0.9;
      if (kind === 'lion') part(h, G.cyl(10, 10, 6, 10), m('#7a4a1a'), 0, 0, -4).rotation.x = Math.PI / 2;
      h.userData.jaw = jaw;
    }
    r.heads.push(h);
    return h;
  };

  if (model === 'dragon') {
    part(rig, G.sphere(16, 10), skin, 0, 30, 0).scale.set(1.1, 0.9, 1.6);
    part(rig, G.sphere(13, 8), belly, 0, 26, 6).scale.set(0.9, 0.7, 1.2);
    legs(24, 12, 22, 8);
    const neck = pivot(rig, 0, 36, 18);
    for (let i = 0; i < 4; i++) part(neck, G.cyl(5 - i * 0.3, 6 - i * 0.3, 8, 8), skin, 0, i * 6, i * 4).rotation.x = 0.8;
    head(neck, 0, 26, 20, 1.3, 'dragon');
    r.neck = neck;
    addWings(42, 48);
    const tail = pivot(rig, 0, 28, -22);
    for (let i = 0; i < 5; i++) part(tail, G.cyl(5 - i, 6 - i, 9, 6), skin, 0, -i * 1.5, -i * 8).rotation.x = Math.PI / 2;
    part(tail, G.cone(3, 8, 4), horn, 0, -8, -44).rotation.x = -Math.PI / 2;
    r.tail = tail;
    for (let i = 0; i < 4; i++) part(rig, G.cone(2.5, 7, 4), horn, 0, 45 - i * 2, 10 - i * 8);
  } else if (model === 'chimera') {
    part(rig, G.sphere(16, 10), skin, 0, 30, 0).scale.set(1.1, 0.85, 1.6);
    legs(24, 12, 22, 9);
    head(rig, 0, 38, 24, 1.4, 'lion');
    head(rig, -14, 46, 14, 1.1, 'goat');
    const snakeNeck = pivot(rig, 0, 34, -22);
    for (let i = 0; i < 5; i++) part(snakeNeck, G.cyl(3, 3.5, 8, 6), m('#4a7a2a'), 0, i * 6, -i * 2);
    head(snakeNeck, 0, 32, -6, 1.2, 'snake');
    r.tail = snakeNeck;
    addWings(42, 36);
  } else if (model === 'fiend') {
    part(rig, G.sphere(22, 10), skin, 0, 32, 0).scale.set(1, 1.05, 0.95);
    part(rig, G.sphere(16, 8), m('#8aaa4a'), 0, 28, 8).scale.set(1, 0.9, 0.7);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const t = pivot(rig, Math.cos(a) * 16, 14, Math.sin(a) * 16);
      t.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      for (let k = 0; k < 3; k++) part(t, G.cyl(3 - k * 0.7, 3.6 - k * 0.7, 8, 6), skin, 0, -k * 7, 0);
      (r.legs ||= []).push(t);
    }
    head(rig, 0, 56, 6, 1.3, 'dragon');
    for (let i = 0; i < 6; i++) part(rig, G.sphere(3.5, 6), m('#c8e070', { emissive: '#90c020', emissiveIntensity: 0.6 }), Math.cos(i) * 18, 30 + Math.sin(i * 2) * 10, Math.sin(i) * 18);
    addWings(48, 30);
  }
  root.userData.rig = r;
  return finish(root, mats, { kind: 'boss', model });
}

// ---------- items ----------

export function buildItem(type, sub, powerColor) {
  const mats = makeMats();
  const { m } = mats;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  let glow = null;
  switch (type) {
    case 'food': {
      part(spin, G.cyl(9, 7, 1.5, 12), m('#e8e8e8'), 0, 1, 0);
      part(spin, G.sphere(5.5, 8), m('#a0501e'), -1, 6, 0).scale.set(1.3, 0.9, 1);
      const bone = part(spin, G.cyl(1, 1, 7, 5), m('#f4ecd8'), 5, 7, 0);
      bone.rotation.z = Math.PI / 2.4;
      part(spin, G.sphere(1.8, 5), m('#f4ecd8'), 8, 8.5, 0);
      break;
    }
    case 'gold':
      part(spin, G.sphere(6, 6), m('#7a5a2a'), 0, 5, 0).scale.set(1, 0.9, 1);
      part(spin, G.cyl(2.5, 4, 3, 6), m('#7a5a2a'), 0, 10, 0);
      for (let i = 0; i < 5; i++) part(spin, G.cyl(2.2, 2.2, 0.8, 8), m('#ffd040', { metalness: 0.9, roughness: 0.25, emissive: '#806000', emissiveIntensity: 0.4 }), Math.cos(i * 1.3) * 7, 1 + i * 0.5, Math.sin(i * 1.3) * 7);
      break;
    case 'gem':
      part(spin, G.oct(6), m('#50d0ff', { emissive: '#2080ff', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.1 }), 0, 9, 0).scale.set(1, 1.4, 1);
      glow = '#50d0ff';
      break;
    case 'key': {
      const gold = m('#ffd040', { metalness: 0.9, roughness: 0.2, emissive: '#806000', emissiveIntensity: 0.5 });
      part(spin, G.torus(3.5, 1.2), gold, -5, 9, 0);
      part(spin, G.box(11, 2, 2), gold, 2.5, 9, 0);
      part(spin, G.box(2, 4, 2), gold, 6, 6.5, 0);
      part(spin, G.box(2, 3, 2), gold, 3, 7, 0);
      glow = '#ffd040';
      break;
    }
    case 'potion': {
      const glass = m('#4a6aff', { transparent: true, opacity: 0.85, emissive: '#2040ff', emissiveIntensity: 0.7, roughness: 0.1 });
      part(spin, G.sphere(6, 10), glass, 0, 7, 0);
      part(spin, G.cyl(2, 2.5, 6, 8), glass, 0, 14, 0);
      part(spin, G.cyl(2.4, 2.4, 2.5, 8), m('#a07040'), 0, 18, 0);
      glow = '#4a6aff';
      break;
    }
    case 'amulet': {
      const c = powerColor || '#ffffff';
      part(spin, G.torus(5, 0.8), m('#ffd040', { metalness: 0.9, roughness: 0.2 }), 0, 13, 0);
      part(spin, G.oct(4.5), m(c, { emissive: c, emissiveIntensity: 1.5 }), 0, 7, 0);
      glow = c;
      break;
    }
    case 'rune': {
      part(spin, G.box(14, 22, 5), m('#5a5a6a'), 0, 11, 0);
      part(spin, G.box(8, 12, 1), m('#ff80ff', { emissive: '#ff40ff', emissiveIntensity: 2 }), 0, 12, 2.8, false);
      glow = '#ff80ff';
      break;
    }
  }
  if (glow) {
    const s = glowSprite(glow, 26, 0.45);
    s.position.y = 9;
    root.add(s);
  }
  spin.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return finish(root, mats, { kind: 'item', spin, spins: !['food', 'chest', 'barrel', 'gold'].includes(type) });
}

// ---------- level dressing ----------

export function buildExit(sealed) {
  const root = new THREE.Group();
  const mats = makeMats();
  part(root, G.cyl(17, 18, 3, 16), mats.m('#4a4a54'), 0, 1.5, 0).receiveShadow = true;
  const ring = part(root, G.torus(15, 2, Math.PI * 2), mats.m('#c8a040', { metalness: 0.8, roughness: 0.3 }), 0, 3.2, 0, false);
  ring.rotation.x = Math.PI / 2;
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(14, 24),
    new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, opacity: sealed ? 0 : 1, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 3.4;
  root.add(disk);
  const halo = glowSprite('#80d0ff', 70, sealed ? 0 : 0.6);
  halo.position.y = 10;
  root.add(halo);
  const bars = new THREE.Group();
  const iron = mats.m('#3a3a40', { metalness: 0.7 });
  for (let i = -2; i <= 2; i++) part(bars, G.box(2, 2.5, 28), iron, i * 5.5, 4.5, 0, false);
  part(bars, G.box(28, 2.5, 2), iron, 0, 5, 0, false);
  bars.visible = sealed;
  root.add(bars);
  return finish(root, mats, { kind: 'exit', disk, halo, bars });
}

export function buildProjectile(kind) {
  const mats = makeMats();
  const { m } = mats;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  let glow = null, size = 24;
  switch (kind) {
    case 'axe':
      part(spin, G.cyl(0.8, 0.8, 14, 5), m('#6a4424'), 0, 0, 0, false).rotation.z = Math.PI / 2;
      part(spin, G.box(6, 8, 1.4), m('#e0e0ea', { metalness: 0.8, roughness: 0.2 }), 6, 0, 0, false);
      break;
    case 'sword':
      part(spin, G.box(16, 2.4, 1), m('#e8e8f8', { metalness: 0.8, roughness: 0.2, emissive: '#4060a0', emissiveIntensity: 0.5 }), 2, 0, 0, false);
      part(spin, G.box(1.6, 7, 1.6), m('#d8b040'), -6, 0, 0, false);
      glow = '#a0c0ff'; size = 22;
      break;
    case 'arrow':
      part(spin, G.cyl(0.5, 0.5, 18, 4), m('#c8a070'), 0, 0, 0, false).rotation.x = Math.PI / 2;
      part(spin, G.cone(1.5, 4, 4), m('#d0d0d8', { metalness: 0.8 }), 0, 0, 10, false).rotation.x = Math.PI / 2;
      part(spin, G.box(0.3, 3, 4), m('#e04030'), 0, 0, -8, false);
      break;
    case 'fireball':
      part(spin, G.ico(5), m('#ffd060', { emissive: '#ff9020', emissiveIntensity: 3 }), 0, 0, 0, false);
      glow = '#ff8a20'; size = 46;
      break;
    case 'efire':
      part(spin, G.ico(4.5), m('#ff6030', { emissive: '#ff3010', emissiveIntensity: 3 }), 0, 0, 0, false);
      glow = '#ff3010'; size = 40;
      break;
    case 'dagger':
      part(spin, G.box(10, 2, 1), m('#e8e8f0', { metalness: 0.8, roughness: 0.2 }), 2, 0, 0, false);
      part(spin, G.box(1.4, 5, 1.4), m('#d8b040'), -4, 0, 0, false);
      break;
    case 'spark':
      part(spin, G.oct(4), m('#f0a0ff', { emissive: '#d040ff', emissiveIntensity: 3 }), 0, 0, 0, false);
      glow = '#d040ff'; size = 40;
      break;
    case 'bolt':
      part(spin, G.oct(4), m('#ff80ff', { emissive: '#e040ff', emissiveIntensity: 3 }), 0, 0, 0, false);
      glow = '#d040ff'; size = 36;
      break;
    case 'lob':
      part(spin, G.dodec(4.5), m('#7a6a5a'), 0, 0, 0, true);
      break;
  }
  if (glow) root.add(glowSprite(glow, size, 0.85));
  return finish(root, mats, { kind: 'proj', spin });
}

// Ring telegraph for lobbed rocks.
export function buildMarker() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(18, 22, 20),
    new THREE.MeshBasicMaterial({ color: '#ff4030', transparent: true, opacity: 0.6, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function heroColor(cls) {
  return {
    warrior: '#ff5030', valkyrie: '#5090ff', wizard: '#ffd040', archer: '#50e070',
    dwarf: '#e08030', knight: '#d0d4e8', jester: '#b050f0', sorceress: '#e060ff',
    minotaur: '#d08040', falconess: '#e080e0', jackal: '#e0c060', tigress: '#ff9a30',
  }[cls] || '#ffffff';
}
