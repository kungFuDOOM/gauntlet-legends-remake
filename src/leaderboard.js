// Global leaderboard client (Supabase REST, public key only). Every call fails soft: the game
// never depends on the network. The local leaderboard (stats.js) works the same offline.
import { LB_URL, LB_KEY } from './lbconfig.js';

const NAME_KEY = 'gl-remake-lb-name', TOKEN_KEY = 'gl-remake-lb-token', MINE_KEY = 'gl-remake-lb-mine';
let memToken = null;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// Light profanity / personal-info filter: lower-case, de-leet, drop non-letters, look for unambiguous stems.
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'pussy', 'nazi', 'hitler', 'retard', 'rapist', 'kkk'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', $: 's', '@': 'a' };
export function cleanName(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 12) return { ok: false, err: 'NAME: 3-12 CHARACTERS' };
  if (!/^[A-Za-z0-9 _.-]+$/.test(s)) return { ok: false, err: 'LETTERS, NUMBERS, _ . - ONLY' };
  if (/\d{5,}/.test(s.replace(/[ .-]/g, '')) || /\.(com|net|org|io)\b/i.test(s)) return { ok: false, err: 'NO PERSONAL INFO IN NAME' };
  const flat = s.toLowerCase().replace(/[013457$@]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
  if (BAD.some((b) => flat.includes(b))) return { ok: false, err: 'PICK A DIFFERENT NAME' };
  return { ok: true, name: s };
}

export const getName = () => ls.get(NAME_KEY) || '';
export const setName = (n) => ls.set(NAME_KEY, n);

// A random per-browser token; the server stores only its hash, for rate limiting.
export function getToken() {
  let t = ls.get(TOKEN_KEY) || memToken;
  if (!t) {
    const a = new Uint8Array(16);
    if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else a.forEach((_, i) => { a[i] = Math.random() * 256; });
    t = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    memToken = t;
    ls.set(TOKEN_KEY, t);
  }
  return t;
}

// ids of scores this browser submitted (so the board can highlight them)
export function getMine() { try { const a = JSON.parse(ls.get(MINE_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'number') : []; } catch { return []; } }
function addMine(id) { if (typeof id === 'number') ls.set(MINE_KEY, JSON.stringify([...getMine(), id].slice(-20))); }

async function rpc(fn, body, ms = 7000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = ctl && setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${LB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: LB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl && ctl.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.message) || `http ${r.status}`); e.server = true; throw e; }
    return j;
  } finally { if (to) clearTimeout(to); }
}

export function friendlyError(e) {
  const m = String((e && e.message) || '');
  if (/slow down/.test(m)) return 'SLOW DOWN - TRY AGAIN IN A MOMENT';
  if (/rate limit/.test(m)) return 'TOO MANY SUBMISSIONS - TRY LATER';
  if (/busy/.test(m)) return 'SERVER BUSY - TRY AGAIN LATER';
  if (e && e.server) return 'SCORE REJECTED';
  return 'OFFLINE - SCORE NOT SAVED';
}

// Keeps only well-formed rows from the server (it's public data, but never trust it blindly).
export function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 50).map((r) => r && typeof r === 'object' && typeof r.name === 'string' && Number.isFinite(r.score) ? {
    id: typeof r.id === 'number' ? r.id : 0, name: r.name.slice(0, 12), score: Math.max(0, Math.min(1e7, Math.floor(r.score))),
    cls: typeof r.cls === 'string' ? r.cls.slice(0, 16) : '', level: Math.max(0, Math.min(16, Math.floor(Number(r.level) || 0))),
    won: r.won === true, date: Date.parse(r.created_at) || 0,
  } : null).filter(Boolean);
}

export async function submitScore({ name, score, cls, level, won }) {
  const r = await rpc('submit_gauntlet_score', {
    p_name: name, p_score: Math.max(0, Math.min(1e7, Math.round(score))), p_cls: cls,
    p_level: Math.max(0, Math.min(16, Math.floor(level))), p_won: !!won, p_token: getToken(),
  });
  addMine(r && r.id);
  return { id: r && r.id, rank: r && r.rank };
}

export async function fetchTop(n = 10) { return cleanRows(await rpc('top_gauntlet_scores', { p_limit: n })); }
