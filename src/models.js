// Low-poly 3D models and procedural textures, built from primitives in the spirit of
// late-90s arcade 3D (flat shading, chunky silhouettes, saturated class colours).

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
function makeMats() {
  const list = [];
  const m = (color, opts = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...opts });
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

// Seamless irregular cobblestones (wrap-around Voronoi cells with dark grout).
export function floorTexture(base) {
  return canvasTex(256, (ctx, s) => {
    const pts = [];
    const n = 26;
    for (let i = 0; i < n; i++) pts.push({ x: Math.random() * s, y: Math.random() * s, c: new THREE.Color(base).offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.09) });
    const img = ctx.createImageData(s, s);
    const grout = new THREE.Color(base).offsetHSL(0, -0.1, -0.2);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        let d1 = 1e9, d2 = 1e9, best = 0;
        for (let i = 0; i < n; i++) {
          let dx = Math.abs(x - pts[i].x), dy = Math.abs(y - pts[i].y);
          if (dx > s / 2) dx = s - dx;
          if (dy > s / 2) dy = s - dy;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const k = (y * s + x) * 4;
        let r, g, b;
        if (edge < 2.2) { r = grout.r; g = grout.g; b = grout.b; }
        else {
          const c = pts[best].c;
          const bevel = edge < 5 ? 0.82 : 1; // darker rim gives a rounded look
          const lit = 1 + Math.min(0.12, (edge - 5) * 0.01);
          r = c.r * bevel * lit; g = c.g * bevel * lit; b = c.b * bevel * lit;
        }
        const nz = (Math.random() - 0.5) * 0.08;
        img.data[k] = Math.max(0, Math.min(255, (r + nz) * 255));
        img.data[k + 1] = Math.max(0, Math.min(255, (g + nz) * 255));
        img.data[k + 2] = Math.max(0, Math.min(255, (b + nz) * 255));
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (Math.random() - 0.5) * 18; y += (Math.random() - 0.5) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}

export function wallTexture(base) {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = shade(base, -0.2);
    ctx.fillRect(0, 0, s, s);
    const rows = 6, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const bw = s / 3;
      const off = (r % 2) * bw * 0.5;
      for (let i = -1; i < 4; i++) {
        const x = i * bw + off, y = r * bh;
        ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.1);
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 2, y + 2, bw - 4, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + 2, y + bh - 5, bw - 4, 3);
      }
    }
    noise(ctx, s, 30);
  });
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

let woodTex = null;
export function woodTexture() {
  if (woodTex) return woodTex;
  woodTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#6a4420';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = shade('#7a5028', (Math.random() - 0.5) * 0.08);
      ctx.fillRect(i * 32 + 1, 0, 30, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        const x = i * 32 + 4 + Math.random() * 22;
        ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 4, s * 0.3, x - 4, s * 0.6, x + 2, s); ctx.stroke();
      }
    }
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(0, 18, s, 10); ctx.fillRect(0, s - 28, s, 10);
    ctx.fillStyle = '#9a9aa0';
    for (const y of [23, s - 23]) for (let x = 8; x < s; x += 24) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
    noise(ctx, s, 18);
  });
  return woodTex;
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

// ---------- humanoid rig ----------

// Returns a rig with animatable pivots. Forward is +Z, feet at y=0.
function humanoid(mats, { body, legs, skin = '#e8b48a', boots = '#3a2a1a', scale = 1, robe = false, bulk = 1 }) {
  const { m } = mats;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(scale);
  root.add(rig);
  const r = { root, rig };
  const bodyMat = m(body), legMat = m(legs), skinMat = m(skin), bootMat = m(boots);
  r.bodyMat = bodyMat;
  if (robe) {
    part(rig, G.cyl(6.5 * bulk, 10.5 * bulk, 22, 8), bodyMat, 0, 11, 0);
    r.legL = pivot(rig, -3, 12, 0); r.legR = pivot(rig, 3, 12, 0);
  } else {
    r.legL = pivot(rig, -3.6 * bulk, 13, 0);
    r.legR = pivot(rig, 3.6 * bulk, 13, 0);
    for (const leg of [r.legL, r.legR]) {
      part(leg, G.box(5 * bulk, 11, 5.5), legMat, 0, -5, 0);
      part(leg, G.box(5.6 * bulk, 4, 7.5), bootMat, 0, -11, 1);
    }
    part(rig, G.box(14 * bulk, 4, 9), m('#3a2614'), 0, 14.5, 0); // belt
  }
  r.torso = part(rig, G.box(14 * bulk, 11, 9), bodyMat, 0, 21.5, 0);
  r.armL = pivot(rig, -9.3 * bulk, 26, 0);
  r.armR = pivot(rig, 9.3 * bulk, 26, 0);
  for (const arm of [r.armL, r.armR]) {
    part(arm, G.box(4.6 * bulk, 7, 4.6), bodyMat, 0, -3, 0);
    part(arm, G.box(4 * bulk, 6, 4), skinMat, 0, -9, 0);
  }
  r.hand = pivot(r.armR, 0, -12, 1.5);
  r.handL = pivot(r.armL, 0, -12, 1.5);
  r.head = pivot(rig, 0, 32.5, 0);
  part(r.head, G.sphere(5.6, 8), skinMat, 0, 0, 0);
  // eyes
  const eye = m('#1a1010');
  part(r.head, G.box(1.4, 1.6, 1), eye, -2, 0.6, 5.1, false);
  part(r.head, G.box(1.4, 1.6, 1), eye, 2, 0.6, 5.1, false);
  return r;
}

// ---------- heroes ----------

export function buildHero(cls) {
  const mats = makeMats();
  const { m } = mats;
  let r;
  switch (cls) {
    case 'warrior': {
      r = humanoid(mats, { body: '#c8301e', legs: '#5a3a24', skin: '#e0a070', bulk: 1.18 });
      // bare muscular arms: recolour upper arm
      r.armL.children[0].material = r.armR.children[0].material = m('#e0a070');
      part(r.rig, G.box(17, 3, 10), m('#8a8a94', { metalness: 0.6, roughness: 0.4 }), 0, 26.5, 0); // shoulder strap
      const helm = m('#8a8a96', { metalness: 0.7, roughness: 0.35 });
      part(r.head, G.sphere(6.2, 8), helm, 0, 1.6, -0.4).scale.set(1, 0.75, 1);
      const horn = m('#efe6c8');
      for (const s of [-1, 1]) {
        const h = part(r.head, G.cone(1.8, 9, 6), horn, s * 6.5, 5, 0);
        h.rotation.z = -s * 0.9;
      }
      part(r.head, G.box(9, 3, 3), m('#5a2a10'), 0, -4, 4.5); // beard
      // great axe
      const w = new THREE.Group();
      part(w, G.cyl(0.9, 0.9, 30, 6), m('#6a4424'), 0, 0, 0).rotation.x = 0;
      const blade = m('#d0d0dc', { metalness: 0.8, roughness: 0.25 });
      part(w, G.box(1.4, 10, 9), blade, 0, 11, 4.5);
      part(w, G.box(1.4, 6, 5), blade, 0, 11, -3.5);
      w.rotation.x = Math.PI / 2;
      w.position.set(0, 0, 6);
      r.hand.add(w);
      break;
    }
    case 'valkyrie': {
      r = humanoid(mats, { body: '#2f6fd0', legs: '#c8c8d8', skin: '#f0c8a0', boots: '#6a6a7a' });
      const steel = m('#d8dae8', { metalness: 0.7, roughness: 0.3 });
      part(r.rig, G.box(15, 5, 10), steel, 0, 24, 0); // breastplate
      part(r.head, G.sphere(6.1, 8), steel, 0, 1.8, -0.3).scale.set(1, 0.7, 1);
      const wingM = m('#ffffff', { side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const wg = new THREE.Mesh(G.wing(), wingM);
        wg.scale.set(s * 9, 9, 9);
        wg.position.set(s * 5, 3, -1);
        r.head.add(wg);
      }
      const hair = m('#f2cc5a');
      part(r.head, G.box(11, 8, 3), hair, 0, -2, -4.5);
      part(r.rig, G.box(3, 14, 3), hair, -4, 22, -5);
      part(r.rig, G.box(3, 14, 3), hair, 4, 22, -5);
      // sword
      const sw = new THREE.Group();
      part(sw, G.box(1.2, 22, 3), steel, 0, 12, 0);
      part(sw, G.box(1.6, 2, 9), m('#d8b040', { metalness: 0.6 }), 0, 1, 0);
      part(sw, G.box(1.5, 5, 2), m('#5a3a1a'), 0, -2, 0);
      sw.rotation.x = Math.PI / 2;
      sw.position.set(0, 0, 3);
      r.hand.add(sw);
      // round shield on left arm
      const sh = part(r.handL, G.cyl(8, 8, 2, 10), m('#2a58b0', { metalness: 0.3 }), -2.5, 5, 2);
      sh.rotation.z = Math.PI / 2;
      part(sh, G.cyl(2.5, 2.5, 3, 8), m('#e0c050', { metalness: 0.7 }), 0, 0, 0);
      break;
    }
    case 'wizard': {
      r = humanoid(mats, { body: '#e0be28', legs: '#e0be28', skin: '#f0c8a0', robe: true });
      const hat = m('#6a2ac0');
      part(r.head, G.cyl(9, 9, 1.4, 10), hat, 0, 3.5, 0);
      const cone = part(r.head, G.cone(5.5, 15, 8), hat, 0, 11, -1);
      cone.rotation.x = -0.25;
      part(r.head, G.oct(1.5), m('#ffe060', { emissive: '#ffd040', emissiveIntensity: 0.8 }), 0, 8, 4);
      const beard = part(r.head, G.cone(4.2, 12, 6), m('#f0f0f0'), 0, -6.5, 3.5);
      beard.rotation.x = Math.PI;
      part(r.rig, G.box(15, 3, 10), m('#6a2ac0'), 0, 17, 0); // sash
      // staff with glowing orb
      const st = new THREE.Group();
      part(st, G.cyl(0.9, 1.1, 34, 6), m('#5a3a1a'), 0, 4, 0);
      r.orb = part(st, G.ico(2.8), m('#ff9a30', { emissive: '#ff7a10', emissiveIntensity: 1.5 }), 0, 22, 0, false);
      st.position.set(0, 0, 2);
      r.hand.add(st);
      r.staff = st;
      break;
    }
    case 'archer': {
      r = humanoid(mats, { body: '#2f9a48', legs: '#5a4a2a', skin: '#f0c8a0', boots: '#4a3018' });
      const hood = m('#226e34');
      part(r.head, G.sphere(6.2, 8), hood, 0, 1.5, -1).scale.set(1, 0.9, 1);
      const tip = part(r.head, G.cone(3.5, 7, 6), hood, 0, 2, -6.5);
      tip.rotation.x = -1.9;
      part(r.head, G.box(8, 2, 1), m('#d04030'), 0, 4.5, 4); // band
      part(r.rig, G.box(4, 16, 4), m('#7a5028'), 3, 24, -6).rotation.z = 0.4; // quiver
      // bow in left hand
      const bow = new THREE.Group();
      const arc = part(bow, G.torus(11, 0.9, Math.PI * 0.9), m('#8a5a24'), 0, 0, 0);
      arc.rotation.z = Math.PI / 2 - Math.PI * 0.45;
      part(bow, G.box(0.4, 21, 0.4), m('#e8e8e8'), -1.5, 0, 0, false);
      bow.rotation.y = Math.PI / 2;
      bow.position.set(-1, 0, 3);
      r.handL.add(bow);
      r.bow = bow;
      break;
    }
  }
  r.root.userData.rig = r;
  return finish(r.root, mats, { kind: 'hero', cls });
}

// ---------- monsters ----------

export function buildEnemy(type) {
  const mats = makeMats();
  const { m } = mats;
  let r;
  switch (type) {
    case 'grunt': {
      r = humanoid(mats, { body: '#7a4a2a', legs: '#4a3020', skin: '#8a9a4a', bulk: 1.15, scale: 0.95 });
      part(r.head, G.box(9, 3, 3), m('#d8d0b0'), 0, -3, 4.8); // tusks/jaw
      const eye = m('#ff2a10', { emissive: '#ff2a10', emissiveIntensity: 1 });
      part(r.head, G.box(1.8, 1.8, 1), eye, -2.2, 1, 5.2, false);
      part(r.head, G.box(1.8, 1.8, 1), eye, 2.2, 1, 5.2, false);
      part(r.head, G.sphere(6, 6), m('#5a5a60', { metalness: 0.5 }), 0, 2.5, -0.5).scale.set(1, 0.6, 1);
      const club = new THREE.Group();
      part(club, G.cyl(1.2, 2.8, 18, 6), m('#5a3a1a'), 0, 8, 0);
      part(club, G.box(5, 5, 5), m('#6a4a2a'), 0, 16, 0).rotation.y = 0.6;
      club.rotation.x = Math.PI / 2.4;
      r.hand.add(club);
      break;
    }
    case 'ghost': {
      const root = new THREE.Group();
      const rig = new THREE.Group();
      root.add(rig);
      const sheet = m('#e8eeff', { transparent: true, opacity: 0.75, emissive: '#8090c0', emissiveIntensity: 0.4 });
      part(rig, G.sphere(8, 8), sheet, 0, 22, 0);
      part(rig, G.cone(9, 18, 8), sheet, 0, 12, 0).rotation.x = Math.PI;
      const eye = m('#101020');
      part(rig, G.sphere(1.8, 6), eye, -3, 23, 7, false);
      part(rig, G.sphere(1.8, 6), eye, 3, 23, 7, false);
      part(rig, G.sphere(2, 6), eye, 0, 18.5, 7.2, false).scale.set(1, 1.5, 0.6);
      for (const s of [-1, 1]) part(rig, G.cone(2.5, 9, 5), sheet, s * 9, 18, 1).rotation.z = s * 1.2;
      r = { root, rig, float: true };
      break;
    }
    case 'lobber': {
      r = humanoid(mats, { body: '#5a6a2a', legs: '#4a3a20', skin: '#9aba50', scale: 0.75, bulk: 1.1 });
      for (const s of [-1, 1]) part(r.head, G.cone(1.6, 6, 4), m('#9aba50'), s * 6, 2, 0).rotation.z = -s * 1.3; // ears
      const eye = m('#ffff40', { emissive: '#ffff00', emissiveIntensity: 0.8 });
      part(r.head, G.box(1.6, 1.6, 1), eye, -2, 1, 5.2, false);
      part(r.head, G.box(1.6, 1.6, 1), eye, 2, 1, 5.2, false);
      part(r.rig, G.box(10, 8, 6), m('#6a5a3a'), 0, 24, -6); // sack
      part(r.hand, G.dodec(3.5), m('#7a6a5a'), 0, -2, 2);
      break;
    }
    case 'demon': {
      r = humanoid(mats, { body: '#b02a20', legs: '#7a1a14', skin: '#c83a28', bulk: 1.2, scale: 1.05 });
      const horn = m('#e8dcb8');
      for (const s of [-1, 1]) part(r.head, G.cone(1.8, 9, 5), horn, s * 4, 6, -1).rotation.z = -s * 0.5;
      const eye = m('#ffe030', { emissive: '#ffcc00', emissiveIntensity: 1.2 });
      part(r.head, G.box(2.2, 1.6, 1), eye, -2.2, 1, 5.1, false);
      part(r.head, G.box(2.2, 1.6, 1), eye, 2.2, 1, 5.1, false);
      const wingM = m('#6a1410', { side: THREE.DoubleSide });
      r.wings = [];
      for (const s of [-1, 1]) {
        const wg = new THREE.Mesh(G.wing(), wingM);
        wg.scale.set(s * 20, 18, 14);
        wg.position.set(s * 4, 26, -5);
        wg.castShadow = true;
        r.rig.add(wg);
        r.wings.push(wg);
      }
      part(r.rig, G.cone(1.5, 14, 4), m('#7a1a14'), 0, 12, -7).rotation.x = -2.2; // tail
      break;
    }
    case 'sorcerer': {
      r = humanoid(mats, { body: '#6a2aa0', legs: '#6a2aa0', skin: '#3a2a4a', robe: true });
      const hood = m('#4a1a7a');
      part(r.head, G.sphere(6.6, 8), hood, 0, 1, -1);
      const tip = part(r.head, G.cone(4.5, 10, 6), hood, 0, 6, -3);
      tip.rotation.x = -0.6;
      const eye = m('#ff60ff', { emissive: '#ff40ff', emissiveIntensity: 1.5 });
      part(r.head, G.box(1.6, 1.2, 1), eye, -2, 0, 5.3, false);
      part(r.head, G.box(1.6, 1.2, 1), eye, 2, 0, 5.3, false);
      r.orb = part(r.hand, G.ico(2.5), m('#d080ff', { emissive: '#c040ff', emissiveIntensity: 2 }), 0, -1, 2, false);
      break;
    }
    case 'death': {
      r = humanoid(mats, { body: '#121216', legs: '#121216', skin: '#e8e2d0', robe: true, scale: 1.15 });
      r.armL.children.forEach((c) => (c.material = r.bodyMat));
      const hood = m('#0a0a0e');
      part(r.head, G.sphere(6.8, 8), hood, 0, 1, -1.5);
      const eye = m('#ff2020', { emissive: '#ff0000', emissiveIntensity: 2 });
      part(r.head, G.box(1.8, 1.8, 1), eye, -2, 0.5, 5.3, false);
      part(r.head, G.box(1.8, 1.8, 1), eye, 2, 0.5, 5.3, false);
      const sc = new THREE.Group();
      part(sc, G.cyl(0.8, 0.8, 40, 6), m('#3a3030'), 0, 10, 0);
      const blade = part(sc, G.torus(10, 1.2, Math.PI * 0.55), m('#c0c0c8', { metalness: 0.8, roughness: 0.25 }), 0, 28, 8);
      blade.rotation.set(0, Math.PI / 2, Math.PI * 0.7);
      sc.position.set(0, 0, 2);
      r.hand.add(sc);
      break;
    }
  }
  r.root.userData.rig = r;
  return finish(r.root, mats, { kind: 'enemy', type });
}

// ---------- bosses ----------

export function buildBoss(model, color, hornColor) {
  const mats = makeMats();
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
  } else {
    // Skorne: a towering horned warlord
    const h = humanoid(mats, { body: color, legs: '#2a1a30', skin: '#6a5a6a', boots: '#1a101a', bulk: 1.3, scale: 2.4 });
    rig.add(h.root);
    Object.assign(r, { armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR, humanoid: h });
    for (const s of [-1, 1]) part(h.head, G.cone(2, 12, 5), horn, s * 5, 6, 0).rotation.z = -s * 0.7;
    part(h.head, G.box(2.4, 1.6, 1), eyeM, -2.2, 0.6, 5.3, false);
    part(h.head, G.box(2.4, 1.6, 1), eyeM, 2.2, 0.6, 5.3, false);
    for (const s of [-1, 1]) part(h.rig, G.box(8, 5, 11), m('#2a2a30', { metalness: 0.6 }), s * 10, 28, 0);
    const cape = part(h.rig, G.box(18, 24, 1.5), m('#6a0a10'), 0, 18, -6);
    cape.rotation.x = 0.15;
    const sw = new THREE.Group();
    part(sw, G.box(2, 20, 4), m('#a0a0b0', { metalness: 0.8, roughness: 0.3, emissive: '#400060', emissiveIntensity: 0.5 }), 0, 16, 0);
    part(sw, G.box(2.5, 2, 9), m('#3a3a40'), 0, 1, 0);
    sw.rotation.x = Math.PI / 2;
    sw.position.z = 3;
    h.hand.add(sw);
  }
  root.userData.rig = r;
  return finish(root, mats, { kind: 'boss', model });
}

// ---------- generators ----------

export function buildGenerator(type) {
  const mats = makeMats();
  const { m } = mats;
  const root = new THREE.Group();
  const colors = { grunt: '#ff8a30', ghost: '#a0c0ff', lobber: '#b0ff40', demon: '#ff3020', sorcerer: '#e040ff', death: '#ffffff' };
  const glow = colors[type] || '#ffffff';
  const tiers = [];
  if (type === 'ghost') {
    // a heap of bones
    const bone = m('#e8e0c8');
    for (let i = 0; i < 14; i++) {
      const b = part(root, G.cyl(1, 1, 12, 5), bone, (Math.random() - 0.5) * 18, 3 + Math.random() * 6, (Math.random() - 0.5) * 18);
      b.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      tiers.push(b);
    }
    for (let i = 0; i < 3; i++) tiers.push(part(root, G.sphere(3.5, 6), bone, (i - 1) * 7, 10 + (i % 2) * 3, 2));
  } else {
    // stone hut / shrine with a glowing doorway
    const stone = m('#6a625a');
    tiers.push(part(root, G.cyl(13, 15, 6, 8), stone, 0, 3, 0));
    tiers.push(part(root, G.cyl(10, 12, 10, 8), m('#7a7266'), 0, 11, 0));
    tiers.push(part(root, G.cone(12, 10, 8), m('#5a3a2a'), 0, 21, 0));
    part(root, G.sphere(3.6, 6), m('#e8e0c8'), 0, 27, 3);
  }
  const core = part(root, G.box(7, 9, 2), m(glow, { emissive: glow, emissiveIntensity: 2 }), 0, 8, 11.5, false);
  const halo = glowSprite(glow, 34, 0.55);
  halo.position.set(0, 10, 12);
  root.add(halo);
  return finish(root, mats, { kind: 'gen', core, halo, tiers });
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
    case 'chest': {
      const wood = m('#ffffff', { map: woodTexture() });
      const band = m('#d8b040', { metalness: 0.7, roughness: 0.3 });
      part(spin, G.box(20, 11, 13), wood, 0, 5.5, 0);
      const lid = part(spin, G.cyl(6.5, 6.5, 20, 8, 1), wood, 0, 11, 0);
      lid.rotation.z = Math.PI / 2;
      lid.scale.set(1, 1, 1);
      part(spin, G.box(21, 2, 14), band, 0, 11, 0);
      part(spin, G.box(3, 4, 1.5), band, 0, 9, 7);
      break;
    }
    case 'barrel': {
      const wood = m('#8a5a2a');
      part(spin, G.cyl(7, 7, 18, 10), wood, 0, 9, 0);
      part(spin, G.cyl(8, 8, 3, 10), wood, 0, 9, 0);
      const ring = m('#4a4a50', { metalness: 0.6 });
      part(spin, G.cyl(7.3, 7.3, 1.5, 10), ring, 0, 2.5, 0);
      part(spin, G.cyl(7.3, 7.3, 1.5, 10), ring, 0, 15.5, 0);
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

export function buildDoor(vertical) {
  const mats = makeMats();
  const root = new THREE.Group();
  const wood = mats.m('#ffffff', { map: woodTexture() });
  const d = part(root, G.box(32, 40, 10), wood, 0, 20, 0);
  d.receiveShadow = true;
  part(root, G.box(6, 6, 12), mats.m('#d8b040', { metalness: 0.8, roughness: 0.3, emissive: '#604000', emissiveIntensity: 0.4 }), 0, 22, 0);
  if (vertical) root.rotation.y = Math.PI / 2;
  return finish(root, mats, { kind: 'door' });
}

export function buildTorch() {
  const root = new THREE.Group();
  const mats = makeMats();
  part(root, G.box(3, 3, 7), mats.m('#2a2a2e', { metalness: 0.6 }), 0, 0, 3.5, false);
  part(root, G.cyl(1.4, 1, 8, 6), mats.m('#5a3a1a'), 0, 3, 6.5, false);
  const flame = part(root, G.cone(2.6, 8, 6), mats.m('#ffb040', { emissive: '#ff8020', emissiveIntensity: 3 }), 0, 10, 6.5, false);
  const halo = glowSprite('#ff9a40', 34, 0.7);
  halo.position.set(0, 10, 7);
  root.add(halo);
  return finish(root, mats, { kind: 'torch', flame, halo });
}

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
  return { warrior: '#ff5030', valkyrie: '#5090ff', wizard: '#ffd040', archer: '#50e070' }[cls];
}
