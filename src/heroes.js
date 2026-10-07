// Hero models in the style of the 1998-2000 arcade era: adult proportions, smooth low-poly
// limbs and bold costume colours. Each hero is assembled from shaped parts attached to the
// bones of a shared rig (from the CC0 KayKit pack) so every KayKit animation drives it.
// The rig's bones are re-positioned to adult lengths; bone-local Y always runs along a bone.

import * as THREE from 'three';

// ---------- rig proportions (metres) ----------

const ANKLE = 0.08;
const UPLEG_Y = 0.03;
export const BASE_HIPS = 0.406; // hips height of the original rig

export const RIGS = {
  male:   { leg: 0.44, shin: 0.42, spine: 0.11, chest: 0.24, neck: 0.25, shoulder: 0.175, shoulderY: 0.19, arm: 0.29, fore: 0.25, hipW: 0.095 },
  big:    { leg: 0.46, shin: 0.43, spine: 0.12, chest: 0.26, neck: 0.26, shoulder: 0.2, shoulderY: 0.2, arm: 0.31, fore: 0.27, hipW: 0.105 },
  female: { leg: 0.44, shin: 0.41, spine: 0.11, chest: 0.22, neck: 0.23, shoulder: 0.15, shoulderY: 0.175, arm: 0.27, fore: 0.23, hipW: 0.092 },
  dwarf:  { leg: 0.27, shin: 0.25, spine: 0.1, chest: 0.25, neck: 0.22, shoulder: 0.2, shoulderY: 0.19, arm: 0.25, fore: 0.22, hipW: 0.105 },
};

export const hipsHeight = (rig) => ANKLE + rig.leg + rig.shin - UPLEG_Y;

export function applyRig(root, rig) {
  const set = (name, x, y, z) => {
    const b = root.getObjectByName(name);
    if (b) { b.position.set(x, y, z); b.scale.set(1, 1, 1); }
  };
  const hips = root.getObjectByName('hips');
  if (hips) hips.position.y = hipsHeight(rig);
  set('spine', 0, rig.spine, 0);
  set('chest', 0, rig.chest, 0);
  set('head', 0, rig.neck, 0);
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    set(`upperleg${side}`, sx * rig.hipW, UPLEG_Y, 0);
    set(`lowerleg${side}`, 0, rig.leg, 0);
    set(`foot${side}`, 0, rig.shin, 0);
    set(`toes${side}`, 0, 0.14, 0);
    set(`upperarm${side}`, sx * rig.shoulder, rig.shoulderY, 0);
    set(`lowerarm${side}`, 0, rig.arm, 0);
    set(`wrist${side}`, 0, rig.fore, 0);
    set(`hand${side}`, 0, 0.05, 0);
    set(`handslot${side}`, 0, 0.08, -0.03);
  }
}

// ---------- body shapes ----------

const BODIES = {
  muscular: { chest: 0.19, chestD: 0.66, waist: 0.135, hip: 0.14, arm: 0.066, fore: 0.054, thigh: 0.094, calf: 0.064, neck: 0.062, delt: 0.078, head: 1 },
  athletic: { chest: 0.165, chestD: 0.66, waist: 0.122, hip: 0.132, arm: 0.052, fore: 0.044, thigh: 0.084, calf: 0.057, neck: 0.05, delt: 0.06, head: 1 },
  female:   { chest: 0.142, chestD: 0.7, waist: 0.1, hip: 0.138, arm: 0.04, fore: 0.034, thigh: 0.078, calf: 0.05, neck: 0.04, delt: 0.046, head: 0.93, bust: true },
  stocky:   { chest: 0.205, chestD: 0.78, waist: 0.18, hip: 0.165, arm: 0.066, fore: 0.06, thigh: 0.092, calf: 0.072, neck: 0.066, delt: 0.072, head: 1.06 },
  huge:     { chest: 0.22, chestD: 0.7, waist: 0.16, hip: 0.155, arm: 0.078, fore: 0.064, thigh: 0.105, calf: 0.074, neck: 0.08, delt: 0.09, head: 1.1 },
};

// ---------- materials and textures ----------

const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  texCache.set(key, t);
  return t;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });
}
const metal = (color, opts = {}) => mat(color, { metalness: 0.75, roughness: 0.32, ...opts });

function shade(hex, l) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

// Vertical stripes (robes, headdresses, tiger fur).
function stripes(colors, count, wavy = false) {
  return canvasTex(`stripes:${colors}:${count}:${wavy}`, 128, 128, (ctx, w, h) => {
    const sw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[i % colors.length];
      if (!wavy) { ctx.fillRect(i * sw, 0, sw + 1, h); continue; }
      ctx.beginPath();
      ctx.moveTo(i * sw, 0);
      for (let y = 0; y <= h; y += 8) ctx.lineTo(i * sw + Math.sin(y * 0.15 + i) * sw * 0.25, y);
      ctx.lineTo((i + 1) * sw, h);
      ctx.lineTo((i + 1) * sw, 0);
      ctx.fill();
    }
  });
}

// Muscle definition painted onto a bare torso (front faces u = 0.5).
function torsoTex(skin) {
  return canvasTex(`torso:${skin}`, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, w, h);
    const dark = shade(skin, -0.12), light = shade(skin, 0.06);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    // abs: two columns of three blocks, low on the abdomen texture
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(w / 2 + s * 11, h * (0.78 - r * 0.2), 9, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(w / 2, h * 0.25); ctx.lineTo(w / 2, h); ctx.stroke();
  });
}

function chestTex(skin) {
  return canvasTex(`chest:${skin}`, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, w, h);
    const dark = shade(skin, -0.13), light = shade(skin, 0.07);
    for (const s of [-1, 1]) {
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.ellipse(w / 2 + s * 20, h * 0.62, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(w / 2 + s * 20, h * 0.66, 20, 15, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }
  });
}

// Face painted around u = 0.25 of a sphere (its +Z side).
function faceTex(f) {
  const key = `face:${JSON.stringify(f)}`;
  return canvasTex(key, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = f.skin;
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.25;
    const dark = shade(f.skin, -0.2);
    // cheek and eye-socket shading
    ctx.fillStyle = shade(f.skin, -0.06);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 30, 114, 21, 13, 0, 0, Math.PI * 2); ctx.fill(); }
    // eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * 29;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, 116, 14, f.female ? 8.5 : 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = f.eyes || '#3a5a8a';
      ctx.beginPath(); ctx.arc(ex + s * -1, 116, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101010';
      ctx.beginPath(); ctx.arc(ex + s * -1, 116, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1010'; ctx.lineWidth = f.female ? 3.5 : 2.5;
      ctx.beginPath(); ctx.ellipse(ex, 116, 14, f.female ? 8.5 : 7, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      if (f.makeup) { ctx.fillStyle = f.makeup; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(ex, 108, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      // brows
      ctx.strokeStyle = f.brows || '#3a2416';
      ctx.lineWidth = f.female ? 3.5 : 6;
      ctx.beginPath(); ctx.moveTo(ex - s * 16, f.angry ? 97 : 101); ctx.quadraticCurveTo(ex, 94, ex + s * 16, f.angry ? 104 : 100); ctx.stroke();
    }
    // nose and mouth
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 2, 120); ctx.lineTo(cx - 5, 140); ctx.lineTo(cx + 3, 142); ctx.stroke();
    ctx.strokeStyle = f.lips || shade(f.skin, -0.3); ctx.lineWidth = f.lips ? 7 : 4;
    ctx.beginPath(); ctx.moveTo(cx - 15, 158); ctx.quadraticCurveTo(cx, f.female ? 163 : 161, cx + 15, 158); ctx.stroke();
    if (f.beard) {
      ctx.fillStyle = f.beard;
      ctx.beginPath();
      ctx.moveTo(cx - 40, 128); ctx.quadraticCurveTo(cx - 36, 200, cx, 214); ctx.quadraticCurveTo(cx + 36, 200, cx + 40, 128);
      ctx.lineTo(cx + 22, 132); ctx.quadraticCurveTo(cx, 146, cx - 22, 132);
      ctx.fill();
      ctx.fillStyle = f.skin;
      ctx.beginPath(); ctx.ellipse(cx, 160, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(f.skin, -0.3); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - 10, 160); ctx.lineTo(cx + 10, 160); ctx.stroke();
    } else if (f.stubble) {
      ctx.fillStyle = f.stubble; ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.ellipse(cx, 172, 34, 30, 0, 0, Math.PI); ctx.fill(); ctx.globalAlpha = 1;
    }
  });
}

// ---------- geometry helpers (all in bone-local space) ----------

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

function add(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.frustumCulled = false;
  parent.add(m);
  return m;
}

// Lathed segment along +Y. profile: [[radius, y], ...] bottom to top.
function lathe(profile, seg = 14) {
  const key = `lathe:${profile.map((p) => p.map((v) => v.toFixed(4)).join(',')).join(';')}:${seg}`;
  return cached(key, () => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
    g.computeVertexNormals();
    return g;
  });
}

// A limb from 0 to len with a muscle bulge.
function limb(len, r0, rMid, r1, bulgeAt = 0.35) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const base = t < bulgeAt ? r0 + (rMid - r0) * Math.sin((t / bulgeAt) * Math.PI / 2) : rMid + (r1 - rMid) * ((t - bulgeAt) / (1 - bulgeAt)) ** 1.4;
    pts.push([base, t * len]);
  }
  pts[0][0] *= 0.85;
  pts[8][0] *= 0.85;
  return lathe(pts);
}

const sphere = (seg = 18) => cached(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)));
const box = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
// Top half of a sphere; tilted back it makes hair, helmets and hats that clear the eyes.
const cap = (seg = 18) => cached(`cap${seg}`, () => new THREE.SphereGeometry(1, seg, 10, 0, Math.PI * 2, 0, Math.PI * 0.55));
const CAP_TILT = -0.42;
const cylinder = (rt, rb, seg = 12) => cached(`cyl${rt},${rb},${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
const cone = (seg = 10) => cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
const torus = (r, t, arc = Math.PI * 2) => cached(`tor${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 8, 20, arc));

function shapeGeo(key, pts, depth, bevel = 0.004) {
  return cached(key, () => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
}

// ---------- the body ----------

// Builds a full figure; `o` chooses a material for each zone so costumes are mostly a matter
// of which zones get skin and which get cloth/armour, with extras added on top.
function body(rig, B, o) {
  const bone = (n) => rig.getObjectByName(n);
  const skin = mat(o.skin, { roughness: 0.55 });
  const z = (k, fallback) => o[k] || fallback;
  const hips = bone('hips'), spine = bone('spine'), chest = bone('chest'), head = bone('head');
  const R = o.rig;

  // pelvis and abdomen (spine bone, local Y up, front +Z)
  const abs = z('abs', o.bare ? mat('#ffffff', { map: torsoTex(o.skin), roughness: 0.55 }) : skin);
  add(spine, lathe([[B.hip * 0.7, -R.spine - 0.06], [B.hip, -R.spine + 0.01], [B.hip * 0.98, -0.04], [B.waist, 0.04], [B.waist * 1.04, R.chest * 0.6], [B.chest * 0.92, R.chest + 0.01]]), abs, [0, 0, 0], [0, Math.PI, 0], [1, 1, B.chestD + 0.06]);
  // chest
  const chestMat = z('chest', o.bare ? mat('#ffffff', { map: chestTex(o.skin), roughness: 0.55 }) : skin);
  add(chest, lathe([[B.chest * 0.92, -0.02], [B.chest, 0.07], [B.chest * 1.02, 0.15], [B.chest * 0.82, R.shoulderY + 0.02], [B.neck * 1.3, R.neck * 0.92], [B.neck, R.neck + 0.01]]), chestMat, [0, 0, 0], [0, Math.PI, 0], [1, 1, B.chestD]);
  if (B.bust) for (const s of [-1, 1]) add(chest, sphere(), chestMat, [s * 0.052, 0.1, B.chest * B.chestD * 0.78], [0, 0, 0], [0.058, 0.055, 0.05]);
  // shoulders
  for (const side of ['l', 'r']) {
    const ua = bone(`upperarm${side}`);
    add(ua, sphere(), z('delt', z('upperArm', skin)), [0, 0.02, 0], [0, 0, 0], [B.delt, B.delt * 1.05, B.delt]);
  }
  // neck and head
  add(head, cylinder(1, 1.15), z('neckMat', skin), [0, 0.04, 0.005], [0, 0, 0], [B.neck, 0.1, B.neck]);
  if (o.face !== false) {
    const hs = B.head;
    const faceMat = mat('#ffffff', { map: faceTex({ skin: o.skin, ...o.face }), roughness: 0.6 });
    const hd = add(head, sphere(24), faceMat, [0, 0.15 * hs, 0.012], [0, 0, 0], [0.092 * hs, 0.118 * hs, 0.104 * hs]);
    hd.userData.isHead = true;
    if (o.face && o.face.beard) add(head, sphere(), mat(o.face.beard, { roughness: 0.9 }), [0, 0.075 * hs, 0.045], [0, 0, 0], [0.07 * hs, 0.055 * hs, 0.07 * hs]); // beard bulk
    add(head, cone(6), skin, [0, 0.14 * hs, 0.112 * hs], [Math.PI / 2 - 0.3, 0, 0], [0.016 * hs, 0.04 * hs, 0.02 * hs]); // nose
    for (const s of [-1, 1]) add(head, sphere(), skin, [s * 0.09 * hs, 0.145 * hs, 0.0], [0, 0, 0], [0.016, 0.03, 0.022]); // ears
  }
  // arms
  for (const side of ['l', 'r']) {
    add(bone(`upperarm${side}`), limb(R.arm, B.arm * 0.95, B.arm * 1.12, B.arm * 0.8, 0.45), z('upperArm', skin));
    add(bone(`lowerarm${side}`), limb(R.fore, B.fore * 1.05, B.fore * 1.1, B.fore * 0.72, 0.25), z('foreArm', skin));
    const hand = z('hands', skin);
    add(bone(`hand${side}`), sphere(), hand, [0, 0.035, 0], [0, 0, 0], [0.032 * B.head, 0.048 * B.head, 0.026 * B.head]);
    add(bone(`hand${side}`), sphere(), hand, [side === 'l' ? -0.022 : 0.022, 0.02, 0.012], [0, 0, 0], [0.012, 0.028, 0.012]); // thumb
  }
  // legs
  for (const side of ['l', 'r']) {
    add(bone(`upperleg${side}`), limb(R.leg, B.thigh * 1.08, B.thigh * 1.06, B.calf * 0.92, 0.2), z('thigh', skin));
    add(bone(`lowerleg${side}`), limb(R.shin, B.calf * 0.85, B.calf * 1.08, B.calf * 0.62, 0.3), z('calf', skin));
    // foot: an elongated wedge pointing along the foot bone toward the toes
    add(bone(`foot${side}`), sphere(), z('feet', skin), [0, 0.06, -0.01], [0.15, 0, 0], [0.05 * B.head, 0.12, 0.045]);
  }
  return { bone, skin, hips, spine, chest, head };
}

// ---------- costume pieces ----------

function hairLong(head, color, hs = 1, length = 0.3) {
  const m = mat(color, { roughness: 0.8 });
  add(head, cap(), m, [0, 0.15 * hs, -0.01], [CAP_TILT, 0, 0], [0.1 * hs, 0.135 * hs, 0.113 * hs]); // crown
  add(head, cached('capsule', () => new THREE.CapsuleGeometry(1, 1, 6, 12)), m, [0, 0.11 * hs - length * 0.35, -0.075 * hs], [0.12, 0, 0], [0.098 * hs, length * 0.55, 0.055 * hs]);
  for (const s of [-1, 1]) add(head, sphere(), m, [s * 0.075 * hs, 0.1 * hs, -0.02], [0, 0, 0], [0.035 * hs, 0.09 * hs, 0.06 * hs]); // sides
  return m;
}

function bracer(parent, len, r, material, at = 0.45) {
  add(parent, cylinder(1, 1.06), material, [0, len * (at + 0.27), 0], [0, 0, 0], [r, len * 0.55, r]);
}

function flap(parent, pos, w, h, material, rotX = 0, thick = 0.012) {
  return add(parent, box(), material, [pos[0], pos[1] - h / 2, pos[2]], [rotX, 0, 0], [w, h, thick]);
}

function belt(spine, R, B, material, buckle) {
  add(spine, torus(1, 0.09), material, [0, -R.spine + 0.02, 0], [Math.PI / 2, 0, 0], [B.hip * 1.04, B.hip * (B.chestD + 0.1), 0.35]);
  if (buckle) add(spine, box(), buckle, [0, -R.spine + 0.02, B.hip * (B.chestD + 0.06) + 0.012], [0, 0, 0], [0.05, 0.04, 0.012]);
}

function boots(rig, R, B, material, cuff, height = 0.6) {
  for (const side of ['l', 'r']) {
    const ll = rig.getObjectByName(`lowerleg${side}`);
    add(ll, limb(R.shin * height, B.calf * 1.18, B.calf * 1.15, B.calf * 1.05, 0.5), material, [0, R.shin * (1 - height), 0]);
    if (cuff) add(ll, cylinder(1, 1.1), cuff, [0, R.shin * (1 - height) + 0.02, 0], [0, 0, 0], [B.calf * 1.35, 0.06, B.calf * 1.35]);
    add(rig.getObjectByName(`foot${side}`), sphere(), material, [0, 0.06, -0.012], [0.15, 0, 0], [0.056, 0.13, 0.05]);
  }
}

function horns(head, material, hs = 1, size = 1) {
  for (const s of [-1, 1]) {
    const h1 = add(head, cone(8), material, [s * 0.1 * hs, 0.24 * hs, 0], [0, 0, -s * 1.2], [0.022 * size, 0.09 * size, 0.022 * size]);
    add(h1, cone(8), material, [0, 0.6, 0], [0, 0, s * 0.7], [0.65, 1, 0.65]);
  }
}

// ---------- weapons (along the hand slot's +Y) ----------

function greatAxe(hand) {
  const g = new THREE.Group();
  add(g, cylinder(0.014, 0.016), mat('#5a3418'), [0, 0.32, 0], [0, 0, 0], [1, 1.05, 1]);
  const blade = metal('#d8dce4');
  const bladeGeo = shapeGeo('axeblade', [[0, -0.02], [0.17, -0.12], [0.22, 0.0], [0.17, 0.13], [0, 0.03]], 0.012);
  for (const s of [-1, 1]) add(g, bladeGeo, blade, [s * 0.012, 0.74, 0], [0, s > 0 ? 0 : Math.PI, 0]);
  add(g, sphere(), metal('#e8c040'), [0, 0.74, 0], [0, 0, 0], [0.026, 0.05, 0.026]);
  hand.add(g);
  return g;
}

function sword(hand, len = 0.62, color = '#e0e4ee') {
  const g = new THREE.Group();
  add(g, shapeGeo(`blade${len}`, [[-0.022, 0], [0.022, 0], [0.018, len - 0.08], [0, len], [-0.018, len - 0.08]], 0.008, 0.002), metal(color), [0, 0.07, 0]);
  add(g, box(), metal('#d8b040'), [0, 0.065, 0], [0, 0, 0], [0.13, 0.022, 0.03]);
  add(g, cylinder(1, 1), mat('#4a2a14'), [0, 0.01, 0], [0, 0, 0], [0.014, 0.1, 0.014]);
  add(g, sphere(), metal('#d8b040'), [0, -0.045, 0], [0, 0, 0], [0.02, 0.02, 0.02]);
  hand.add(g);
  return g;
}

function shield(arm, face, rim, len) {
  const g = new THREE.Group();
  const outline = [[0, 0.24], [0.15, 0.2], [0.17, 0.02], [0.1, -0.16], [0, -0.24], [-0.1, -0.16], [-0.17, 0.02], [-0.15, 0.2]];
  add(g, shapeGeo('shieldRim', outline, 0.02), rim);
  add(g, shapeGeo('shieldFace', outline.map(([x, y]) => [x * 0.85, y * 0.85]), 0.03), face);
  add(g, sphere(), rim, [0, 0.03, 0.02], [0, 0, 0], [0.04, 0.04, 0.03]);
  g.position.set(0, len * 0.55, 0.06);
  g.rotation.set(-Math.PI / 2, 0, Math.PI);
  arm.add(g);
  return g;
}

function bow(hand) {
  const g = new THREE.Group();
  add(g, torus(0.38, 0.012, Math.PI * 0.7), mat('#7a4a20'), [0.3, 0, 0], [0, 0, Math.PI - Math.PI * 0.35]);
  add(g, box(), mat('#f0f0f0'), [-0.006, 0, 0], [0, 0, 0], [0.003, 0.6, 0.003]);
  g.rotation.set(0, Math.PI / 2, 0);
  g.position.y = 0.02;
  hand.add(g);
  return g;
}

function staff(hand, topMat, len = 1.2, crystal = '#80e0ff') {
  const g = new THREE.Group();
  add(g, cylinder(0.012, 0.015), mat('#6a4420'), [0, len * 0.35, 0], [0, 0, 0], [1, len, 1]);
  add(g, torus(0.06, 0.012), topMat, [0, len * 0.85 + 0.06, 0]);
  const orb = add(g, cached('ico', () => new THREE.IcosahedronGeometry(1, 0)), mat(crystal, { emissive: crystal, emissiveIntensity: 1.4 }), [0, len * 0.85 + 0.06, 0], [0, 0, 0], [0.04, 0.04, 0.04]);
  orb.userData.glow = true;
  hand.add(g);
  return g;
}

function hammer(hand) {
  const g = new THREE.Group();
  add(g, cylinder(0.015, 0.018), mat('#5a3418'), [0, 0.28, 0], [0, 0, 0], [1, 0.7, 1]);
  add(g, box(), metal('#a8acb8'), [0, 0.62, 0], [0, 0, 0], [0.26, 0.13, 0.13]);
  add(g, box(), metal('#d8b040'), [0, 0.62, 0], [0, 0, 0], [0.08, 0.15, 0.15]);
  hand.add(g);
  return g;
}

function dagger(hand) { return sword(hand, 0.28, '#e8e8f0'); }

// ---------- the heroes ----------

const HEROES = {
  warrior(rig) {
    const R = RIGS.big, B = BODIES.muscular;
    const red = mat('#c41e18'), fur = mat('#f2ece0', { roughness: 0.95 });
    const b = body(rig, B, { rig: R, skin: '#d9a07a', bare: true, face: { brows: '#a07020', eyes: '#3a6aa0', angry: true, stubble: '#a07a3a' }, feet: mat('#6a4020') });
    hairLong(b.head, '#f2d06a', B.head, 0.38);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.35, red, 0.35);
    belt(b.spine, R, B, mat('#3a2614'), metal('#d8b040'));
    flap(b.spine, [0, -R.spine + 0.0, B.hip * 0.62], 0.16, 0.28, red, -0.08);
    flap(b.spine, [0, -R.spine + 0.0, B.hip * 0.66], 0.17, 0.08, fur, -0.08, 0.03);
    flap(b.spine, [0, -R.spine + 0.0, -B.hip * 0.62], 0.2, 0.3, red, 0.08);
    for (const s of [-1, 1]) add(b.spine, sphere(), fur, [s * B.hip * 0.95, -R.spine - 0.02, 0], [0, 0, 0], [0.05, 0.09, 0.1]);
    boots(rig, R, B, mat('#6a4020'), fur, 0.42);
    greatAxe(b.bone('handslotr'));
  },
  valkyrie(rig) {
    const R = RIGS.female, B = BODIES.female;
    const blue = mat('#1f4fc8', { roughness: 0.4, metalness: 0.3 }), gold = metal('#e8c040'), silver = metal('#d0d4e0');
    const b = body(rig, B, {
      rig: R, skin: '#f2caa8', chest: blue, abs: mat('#1f4fc8'), upperArm: blue, foreArm: mat('#2a5ad8'), hands: silver, thigh: mat('#1a3a9a'),
      face: { female: true, lips: '#c02a3a', eyes: '#3a7ab0', brows: '#8a2a10', makeup: '#e8c040' },
    });
    hairLong(b.head, '#c4461c', B.head, 0.42);
    // winged helm
    add(b.head, cap(), gold, [0, 0.155, -0.005], [CAP_TILT, 0, 0], [0.104, 0.13, 0.118]);
    const wing = mat('#f6eccc', { side: THREE.DoubleSide, roughness: 0.6 });
    const wingGeo = shapeGeo('valkwing', [[0, 0], [0.05, 0.12], [0.03, 0.22], [0.0, 0.14], [-0.02, 0.18], [-0.03, 0.08]], 0.008, 0);
    for (const s of [-1, 1]) add(b.head, wingGeo, wing, [s * 0.098, 0.17, -0.02], [0, s * 1.3, -s * 0.35]);
    for (const s of ['l', 'r']) add(b.bone(`upperarm${s}`), sphere(), silver, [0, 0.02, 0], [0, 0, 0], [0.07, 0.065, 0.07]);
    belt(b.spine, R, B, gold);
    // long tabard with a gold border
    const tabard = mat('#2a5ad8'), trim = mat('#f0d060');
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.72], 0.17, 0.5, tabard, -0.06);
    flap(b.spine, [0, -R.spine - 0.22, B.hip * 0.72 + 0.01], 0.17, 0.06, trim, -0.06);
    flap(b.spine, [0, -R.spine + 0.01, -B.hip * 0.72], 0.2, 0.46, tabard, 0.06);
    boots(rig, R, B, silver, gold, 0.62);
    sword(b.bone('handslotr'), 0.7);
    shield(b.bone('lowerarml'), mat('#1f4fc8', { roughness: 0.35, metalness: 0.4 }), gold, R.fore);
  },
  wizard(rig) {
    const R = RIGS.male, B = BODIES.athletic;
    const gold = metal('#e8c040'), robe = mat('#f4f0e0', { map: stripes(['#f4f0e0', '#f0c830'], 8) });
    const b = body(rig, B, { rig: R, skin: '#8a5636', chest: robe, abs: robe, upperArm: mat('#f0c830'), face: { beard: '#141010', brows: '#141010', eyes: '#2a1a0a', angry: true } });
    // striped royal headdress
    const nemes = mat('#ffffff', { map: stripes(['#f8d838', '#f8f4e8'], 10) });
    add(b.head, cap(), nemes, [0, 0.155, -0.01], [CAP_TILT, 0, 0], [0.108, 0.14, 0.118]);
    for (const s of [-1, 1]) add(b.head, box(), nemes, [s * 0.09, 0.07, 0.02], [0.05, 0, s * 0.12], [0.03, 0.2, 0.09]);
    add(b.head, box(), nemes, [0, 0.06, -0.09], [0.15, 0, 0], [0.16, 0.24, 0.03]);
    add(b.head, torus(0.1, 0.01), gold, [0, 0.2, 0.005], [Math.PI / 2, 0, 0], [1, 1.12, 1]);
    // broad collar and a long robe
    add(b.chest, cylinder(1, 1.25, 18), gold, [0, R.shoulderY + 0.02, 0], [0, 0, 0], [B.chest * 0.95, 0.06, B.chest * 0.8]);
    add(b.spine, lathe([[B.hip * 1.08, -R.spine + 0.02], [B.hip * 1.3, -R.spine - 0.3], [B.hip * 1.6, -R.spine - 0.82]], 16), robe, [0, 0, 0], [0, Math.PI, 0], [1, 1, 0.85]);
    belt(b.spine, R, B, gold);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.25, gold, 0.4);
    staff(b.bone('handslotr'), gold, 1.3, '#ffb040');
  },
  archer(rig) {
    const R = RIGS.female, B = BODIES.female;
    const green = mat('#1f9a4a'), dark = mat('#14662e'), gold = metal('#d8b040'), brown = mat('#6a3a1a');
    const b = body(rig, B, {
      rig: R, skin: '#f2caa8', chest: green, thigh: mat('#f2caa8'), calf: mat('#ffffff', { map: stripes(['#1f9a4a', '#d8b040'], 6) }),
      face: { female: true, lips: '#c03a3a', eyes: '#2a8a4a', brows: '#6a2a10' },
    });
    hairLong(b.head, '#8a3418', B.head, 0.34);
    add(b.head, cap(), green, [0, 0.16, -0.01], [CAP_TILT, 0, 0], [0.104, 0.125, 0.116]); // bandana
    add(b.head, cone(6), green, [0, 0.16, -0.12], [-2.0, 0, 0], [0.03, 0.12, 0.012]);
    for (const s of [-1, 1]) {
      add(b.head, cone(6), mat('#f2caa8'), [s * 0.1, 0.17, -0.01], [0, 0, -s * 1.1], [0.014, 0.06, 0.012]); // pointed ears
      add(b.head, torus(0.012, 0.003), gold, [s * 0.098, 0.115, 0.0], [0, Math.PI / 2, 0]);
    }
    for (const s of ['l', 'r']) add(b.bone(`upperarm${s}`), sphere(), mat('#2ab058'), [0, 0.03, 0], [0, 0, 0], [0.075, 0.06, 0.075]);
    belt(b.spine, R, B, brown, gold);
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.15, 0.2, dark, -0.1);
    flap(b.spine, [0, -R.spine + 0.01, -B.hip * 0.7], 0.2, 0.22, dark, 0.1);
    for (const s of [-1, 1]) flap(b.spine, [s * B.hip * 0.8, -R.spine + 0.01, 0], 0.012, 0.2, dark, 0, 0.12);
    boots(rig, R, B, brown, null, 0.32);
    // quiver
    const q = add(b.chest, cylinder(1, 0.85), brown, [0.06, 0.06, -B.chest * B.chestD - 0.03], [0.3, 0, -0.4], [0.035, 0.32, 0.035]);
    for (let i = 0; i < 3; i++) add(q, cylinder(1, 1), mat('#e04030'), [(i - 1) * 0.3, 0.55, 0], [0, 0, 0], [0.25, 0.12, 0.25]);
    bow(b.bone('handslotl'));
  },
  dwarf(rig) {
    const R = RIGS.dwarf, B = BODIES.stocky;
    const mail = mat('#9a9eaa', { metalness: 0.6, roughness: 0.45 }), steel = metal('#b8bcc8'), brown = mat('#6a4428');
    const b = body(rig, B, { rig: R, skin: '#e4a882', chest: mail, abs: mail, upperArm: mail, thigh: mat('#5a3a20'), face: { beard: '#c8641c', brows: '#a04a14', eyes: '#3a5a7a', angry: true } });
    // huge braided beard
    const beard = mat('#c8641c', { roughness: 0.9 });
    add(b.head, cone(10), beard, [0, -0.02, 0.07], [Math.PI + 0.25, 0, 0], [0.085, 0.24, 0.05]);
    // horned helm
    add(b.head, cap(), steel, [0, 0.16, 0], [CAP_TILT * 0.6, 0, 0], [0.112, 0.13, 0.12]);
    add(b.head, torus(0.106, 0.012), metal('#d8b040'), [0, 0.15, 0], [Math.PI / 2, 0, 0], [1, 1.08, 1]);
    horns(b.head, mat('#f0e6c8', { roughness: 0.5 }), 1, 1.1);
    for (const s of ['l', 'r']) { add(b.bone(`upperarm${s}`), sphere(), steel, [0, 0.02, 0], [0, 0, 0], [0.08, 0.07, 0.08]); bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, brown, 0.4); }
    belt(b.spine, R, B, brown, metal('#d8b040'));
    boots(rig, R, B, brown, mat('#4a2e18'), 0.7);
    hammer(b.bone('handslotr'));
  },
  knight(rig) {
    const R = RIGS.big, B = BODIES.athletic;
    const plate = metal('#c8ccd8'), dark = metal('#8a8e9c'), red = mat('#b01818');
    const b = body(rig, B, { rig: R, skin: '#e4b08a', chest: plate, abs: dark, upperArm: plate, foreArm: plate, hands: dark, thigh: plate, calf: plate, feet: dark, face: { brows: '#3a2a1a', eyes: '#4a6a8a', stubble: '#5a4030' } });
    // great helm with a visor slit and plume
    add(b.head, cylinder(1, 1, 16), plate, [0, 0.15, 0.01], [0, 0, 0], [0.112, 0.26, 0.122]);
    add(b.head, sphere(16), plate, [0, 0.28, 0.01], [0, 0, 0], [0.112, 0.05, 0.122]);
    add(b.head, box(), mat('#101014'), [0, 0.17, 0.124], [0, 0, 0], [0.15, 0.018, 0.01]);
    add(b.head, cone(8), red, [0, 0.34, -0.03], [-0.5, 0, 0], [0.035, 0.22, 0.03]);
    for (const s of ['l', 'r']) add(b.bone(`upperarm${s}`), sphere(), plate, [0, 0.03, 0], [0, 0, 0], [0.095, 0.08, 0.095]);
    // tabard
    flap(b.chest, [0, 0.2, B.chest * B.chestD + 0.012], 0.2, 0.3, red, 0);
    flap(b.spine, [0, 0.06, B.hip * 0.8], 0.19, 0.42, red, -0.05);
    add(b.chest, box(), mat('#f0d060'), [0, 0.07, B.chest * B.chestD + 0.02], [0, 0, 0], [0.04, 0.13, 0.008]);
    add(b.chest, box(), mat('#f0d060'), [0, 0.1, B.chest * B.chestD + 0.02], [0, 0, 0], [0.1, 0.035, 0.008]);
    belt(b.spine, R, B, mat('#3a2614'), metal('#d8b040'));
    sword(b.bone('handslotr'), 0.78);
    shield(b.bone('lowerarml'), mat('#b01818', { roughness: 0.4 }), plate, R.fore);
  },
  jester(rig) {
    const R = RIGS.male, B = BODIES.athletic;
    const purple = mat('#7a24b8'), yellow = mat('#f2c020');
    const b = body(rig, B, {
      rig: R, skin: '#f4dccc', chest: mat('#ffffff', { map: stripes(['#7a24b8', '#f2c020'], 2) }), abs: purple, upperArm: yellow, foreArm: purple, hands: mat('#f8f8f8'),
      thigh: purple, calf: yellow, feet: purple, face: { eyes: '#2a1a4a', brows: '#2a1a2a', lips: '#b02040' },
    });
    // three-pointed hat with bells
    add(b.head, cap(), purple, [0, 0.16, 0], [CAP_TILT, 0, 0], [0.104, 0.12, 0.114]);
    [[-1, yellow], [0, purple], [1, yellow]].forEach(([s, m]) => {
      const tip = add(b.head, cone(8), m, [s * 0.08, 0.27, -0.02 - (s === 0 ? 0.04 : 0)], [s === 0 ? -0.9 : 0, 0, -s * 1.1], [0.04, 0.2, 0.04]);
      add(tip, sphere(), metal('#f0d040'), [0, 0.55, 0], [0, 0, 0], [0.7, 0.18, 0.7]);
    });
    add(b.chest, torus(0.1, 0.03), yellow, [0, R.shoulderY + 0.02, 0], [Math.PI / 2, 0, 0], [1.2, 1, 1]); // ruff
    for (const s of ['l', 'r']) {
      const f = rig.getObjectByName(`foot${s}`);
      add(f, cone(8), purple, [0, 0.2, 0.0], [0, 0, 0], [0.03, 0.12, 0.03]); // curled shoes
    }
    dagger(b.bone('handslotr'));
    dagger(b.bone('handslotl'));
  },
  sorceress(rig) {
    const R = RIGS.female, B = BODIES.female;
    const robe = mat('#5a1a8a', { roughness: 0.5 }), gold = metal('#e8c040');
    const b = body(rig, B, { rig: R, skin: '#f0d0b8', chest: robe, abs: robe, thigh: robe, face: { female: true, lips: '#8a1a4a', eyes: '#6a2aa0', brows: '#101018', makeup: '#8a40c0' } });
    hairLong(b.head, '#14101a', B.head, 0.5);
    add(b.head, torus(0.098, 0.008), gold, [0, 0.19, 0.0], [Math.PI / 2 - 0.15, 0, 0], [1, 1.1, 1]);
    add(b.head, cached('oct', () => new THREE.OctahedronGeometry(1)), mat('#e040ff', { emissive: '#c020ff', emissiveIntensity: 1 }), [0, 0.2, 0.12], [0, 0, 0], [0.016, 0.022, 0.01]);
    add(b.spine, lathe([[B.hip * 1.05, -R.spine + 0.02], [B.hip * 1.25, -R.spine - 0.35], [B.hip * 1.55, -R.spine - 0.84]], 16), robe, [0, 0, 0], [0, Math.PI, 0], [1, 1, 0.85]);
    belt(b.spine, R, B, gold);
    add(b.chest, torus(0.12, 0.012), gold, [0, R.shoulderY - 0.02, 0], [Math.PI / 2, 0, 0], [1.1, 0.8, 1]);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, gold, 0.5);
    staff(b.bone('handslotr'), gold, 1.25, '#e060ff');
  },
  // ---- secret heroes ----
  minotaur(rig) {
    const R = RIGS.big, B = BODIES.huge;
    const fur = '#6a3a1e', horn = mat('#f0e6c8', { roughness: 0.45 });
    const b = body(rig, B, { rig: R, skin: fur, bare: true, face: false, feet: mat('#2a1a10') });
    const furM = mat(fur, { roughness: 0.85 });
    // bull's head
    add(b.head, sphere(18), furM, [0, 0.16, 0.0], [0, 0, 0], [0.12, 0.13, 0.13]);
    add(b.head, sphere(16), mat('#4a2814'), [0, 0.11, 0.11], [0, 0, 0], [0.085, 0.07, 0.08]);
    for (const s of [-1, 1]) {
      add(b.head, sphere(), mat('#100808'), [s * 0.03, 0.12, 0.185], [0, 0, 0], [0.012, 0.012, 0.008]);
      add(b.head, sphere(), mat('#ff3010', { emissive: '#ff2000', emissiveIntensity: 1.2 }), [s * 0.055, 0.2, 0.105], [0, 0, 0], [0.014, 0.01, 0.008]);
      const h = add(b.head, cone(8), horn, [s * 0.13, 0.25, 0.0], [0, 0, -s * 1.35], [0.03, 0.16, 0.03]);
      add(h, cone(8), horn, [0, 0.6, 0], [s * 0.5, 0, s * 1.0], [0.6, 0.8, 0.6]);
      add(b.head, cone(6), furM, [s * 0.11, 0.18, -0.03], [0, 0, -s * 1.8], [0.02, 0.05, 0.015]);
    }
    add(b.head, torus(0.025, 0.006), metal('#e8c040'), [0, 0.07, 0.17], [0, 0, 0]);
    belt(b.spine, R, B, mat('#2a1a10'), metal('#d8b040'));
    flap(b.spine, [0, -R.spine, B.hip * 0.62], 0.18, 0.3, mat('#3a2a1a'), -0.08);
    flap(b.spine, [0, -R.spine, -B.hip * 0.62], 0.2, 0.3, mat('#3a2a1a'), 0.08);
    for (const s of ['l', 'r']) bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, metal('#8a8e9c'), 0.4);
    greatAxe(b.bone('handslotr'));
  },
  falconess(rig) {
    const R = RIGS.female, B = BODIES.female;
    const white = mat('#f4f0fa', { roughness: 0.85 }), orchid = mat('#b048a8'), gold = metal('#e8c040');
    const b = body(rig, B, { rig: R, skin: '#f0d4c0', chest: orchid, abs: white, upperArm: white, thigh: orchid, face: false });
    add(b.head, sphere(18), white, [0, 0.15, 0], [0, 0, 0], [0.1, 0.12, 0.11]);
    add(b.head, cone(8), gold, [0, 0.13, 0.13], [Math.PI / 2 + 0.35, 0, 0], [0.032, 0.09, 0.03]);
    for (const s of [-1, 1]) add(b.head, sphere(), mat('#101010'), [s * 0.05, 0.17, 0.09], [0, 0, 0], [0.016, 0.016, 0.01]);
    [orchid, white, orchid].forEach((m, i) => add(b.head, cone(6), m, [(i - 1) * 0.03, 0.26, -0.05], [-0.7, 0, (i - 1) * 0.3], [0.018, 0.12, 0.012]));
    const wing = mat('#f4f0fa', { side: THREE.DoubleSide, roughness: 0.8 });
    const wingGeo = shapeGeo('falconwing', [[0, 0], [0.45, 0.22], [0.55, 0.05], [0.48, -0.12], [0.36, -0.05], [0.3, -0.24], [0.18, -0.1], [0.08, -0.22], [0, -0.08]], 0.01, 0);
    for (const s of [-1, 1]) add(b.chest, wingGeo, wing, [s * 0.06, 0.16, -0.1], [0.15, s * 0.6, 0], [s, 1, 1]);
    belt(b.spine, R, B, gold);
    boots(rig, R, B, mat('#d8b040'), null, 0.4);
    bow(b.bone('handslotl'));
  },
  jackal(rig) {
    const R = RIGS.male, B = BODIES.athletic;
    const black = mat('#18181c', { roughness: 0.5 }), gold = metal('#e0b040'), white = mat('#f4f0e4');
    const b = body(rig, B, { rig: R, skin: '#9a6a44', bare: true, face: false, abs: mat('#ffffff', { map: torsoTex('#9a6a44') }) });
    add(b.head, sphere(18), black, [0, 0.15, 0], [0, 0, 0], [0.09, 0.11, 0.1]);
    add(b.head, box(), black, [0, 0.12, 0.11], [0.15, 0, 0], [0.06, 0.05, 0.13]);
    for (const s of [-1, 1]) {
      add(b.head, cone(4), black, [s * 0.05, 0.29, -0.01], [0, 0, -s * 0.15], [0.03, 0.13, 0.02]);
      add(b.head, box(), mat('#ffcc30', { emissive: '#ffaa00', emissiveIntensity: 1.2 }), [s * 0.035, 0.18, 0.09], [0, 0, 0], [0.025, 0.012, 0.01]);
    }
    const nemes = mat('#ffffff', { map: stripes(['#e0b040', '#2050c0'], 10) });
    add(b.head, box(), nemes, [0, 0.08, -0.08], [0.1, 0, 0], [0.17, 0.22, 0.03]);
    add(b.chest, cylinder(1, 1.25, 18), gold, [0, R.shoulderY + 0.01, 0], [0, 0, 0], [B.chest, 0.07, B.chest * 0.8]);
    add(b.spine, lathe([[B.hip * 1.04, -R.spine + 0.02], [B.hip * 1.2, -R.spine - 0.3]], 16), white, [0, 0, 0], [0, Math.PI, 0], [1, 1, 0.85]);
    belt(b.spine, R, B, gold);
    for (const s of ['l', 'r']) { bracer(b.bone(`lowerarm${s}`), R.fore, B.fore * 1.3, gold, 0.4); bracer(b.bone(`upperarm${s}`), R.arm, B.arm * 1.15, gold, 0.2); }
    staff(b.bone('handslotr'), gold, 1.25, '#40c0ff');
  },
  tigress(rig) {
    const R = RIGS.female, B = BODIES.female;
    const stripe = stripes(['#ff8a20', '#ff8a20', '#1a1008'], 12, true);
    const fur = mat('#ffffff', { map: stripe, roughness: 0.75 });
    const leather = mat('#5a2a14');
    const b = body(rig, B, { rig: R, skin: '#ff8a20', chest: leather, abs: fur, upperArm: fur, foreArm: fur, thigh: fur, calf: fur, face: false });
    add(b.head, sphere(18), fur, [0, 0.15, 0], [0, 0, 0], [0.098, 0.115, 0.105]);
    add(b.head, sphere(16), mat('#f8ecd8'), [0, 0.11, 0.08], [0, 0, 0], [0.06, 0.045, 0.045]);
    add(b.head, sphere(), mat('#1a0808'), [0, 0.13, 0.12], [0, 0, 0], [0.016, 0.012, 0.01]);
    for (const s of [-1, 1]) {
      add(b.head, sphere(), mat('#40ff60', { emissive: '#20c040', emissiveIntensity: 0.8 }), [s * 0.04, 0.18, 0.09], [0, 0, 0], [0.018, 0.01, 0.008]);
      add(b.head, cone(4), mat('#ff8a20'), [s * 0.07, 0.26, -0.01], [0, 0, -s * 0.35], [0.035, 0.07, 0.02]);
    }
    hairLong(b.head, '#e8e0d0', B.head, 0.26);
    flap(b.spine, [0, -R.spine + 0.01, B.hip * 0.7], 0.15, 0.16, leather, -0.1);
    flap(b.spine, [0, -R.spine + 0.01, -B.hip * 0.7], 0.18, 0.16, leather, 0.1);
    let seg = b.hips;
    for (let i = 0; i < 6; i++) seg = add(seg, cylinder(0.85, 1), i % 2 ? mat('#1a1008') : mat('#ff8a20'), i === 0 ? [0, 0.0, -0.1] : [0, 0.09, 0], [i === 0 ? -2.2 : -0.18, 0, 0], [i === 0 ? 0.022 : 1, i === 0 ? 0.1 : 1, i === 0 ? 0.022 : 1]);
    dagger(b.bone('handslotr'));
    dagger(b.bone('handslotl'));
  },
};

export const HERO_RIG = {
  warrior: 'big', valkyrie: 'female', wizard: 'male', archer: 'female', dwarf: 'dwarf', knight: 'big', jester: 'male', sorceress: 'female',
  minotaur: 'big', falconess: 'female', jackal: 'male', tigress: 'female',
};

export const isBuiltHero = (cls) => !!HEROES[cls];

// Turn a bare rig (KayKit meshes removed) into the given hero.
export function buildHero(cls, rig) {
  applyRig(rig, RIGS[HERO_RIG[cls]]);
  rig.updateMatrixWorld(true);
  HEROES[cls](rig);
  return hipsHeight(RIGS[HERO_RIG[cls]]) / BASE_HIPS;
}
