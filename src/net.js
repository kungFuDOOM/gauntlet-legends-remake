// The online connection layer: WebRTC data channels through PeerJS, using its free public
// matchmaking server to find each other. This is the only file that knows about PeerJS;
// moving to your own server later means replacing Host and Guest here and nothing else.
//
// Everything that arrives from another player is untrusted: messages travel as plain text
// and are size-checked before they're parsed, each connection is rate-limited, floods get
// the sender disconnected, and room codes are long enough that strangers can't guess them.

// Bump when the snapshot format or level generation changes, so old and new versions of
// the game don't try to play together.
export const PROTOCOL = 2;
export const MAX_GUESTS = 3;
export const CODE_LENGTH = 6;
const PREFIX = 'glremake-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, which look like 1 and 0

// Your own PeerJS server, e.g. { host: 'peer.example.com', port: 443, path: '/', secure: true }.
// null uses the free public one.
const PEER_SERVER = null;

// limits (generous for real play, far below what would hurt a browser)
const MAX_INPUT_BYTES = 256;          // guest -> host input packets are ~60 bytes
const MAX_SNAPSHOT_BYTES = 400000;    // host -> guest snapshots are ~5-12 KB
const MAX_MSGS_PER_SEC = 120;         // guests send at most ~60/s, the host ~20/s
const MAX_BUFFERED = 1 << 20;         // stop queueing for a guest that isn't keeping up
const MAX_CONNECT_ATTEMPTS = 10;      // per 10 seconds, to shrug off connection spam

const isLocal = (h) => h === 'localhost' || h === '127.0.0.1';

function peerOptions() {
  if (PEER_SERVER) return { ...PEER_SERVER, debug: 0 };
  // ?peer=127.0.0.1:9000 points at a local PeerJS server, for development and the tests.
  // Only honoured on a local copy of the game, so a link can't send players to someone
  // else's matchmaking server.
  const q = new URLSearchParams(location.search).get('peer');
  if (q && isLocal(location.hostname)) {
    const [host, port] = q.split(':');
    if (isLocal(host)) return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
  }
  return { debug: 0 };
}

let loading = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = () => resolve(window.Peer);
      s.onerror = () => { loading = null; reject(new Error('Could not load the online module.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const ERRORS = {
  'peer-unavailable': 'No game with that code. Check it and try again.',
  network: "Can't reach the online server. Check your connection.",
  'server-error': 'The online server is having trouble. Try again soon.',
  'socket-error': "Can't reach the online server. Check your connection.",
  'browser-incompatible': "This browser can't play online.",
  'webrtc': 'The connection was blocked by this network.',
};
const explain = (err) => ERRORS[err && err.type] || 'The connection failed.';

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// Room codes as typed: letters only, upper case.
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);

// Parse one message from another player, or null if it's oversized or not a JSON object.
function parse(data, maxBytes) {
  if (typeof data !== 'string' || data.length > maxBytes) return null;
  try {
    const m = JSON.parse(data);
    return m && typeof m === 'object' && !Array.isArray(m) ? m : null;
  } catch {
    return null;
  }
}

// Counts messages per second; returns false once a sender goes over the limit.
function rateLimiter(perSec) {
  let windowStart = 0, count = 0, strikes = 0;
  return () => {
    const now = performance.now();
    if (now - windowStart > 1000) {
      if (count > perSec) strikes++; else strikes = Math.max(0, strikes - 1);
      windowStart = now;
      count = 0;
    }
    count++;
    return { ok: count <= perSec, flooding: strikes >= 3 };
  };
}

// The host: runs the game and accepts up to MAX_GUESTS guests.
//   handlers: onJoin(id), onLeave(id), onInput(id, msg), onError(text)
export class Host {
  constructor(handlers) {
    this.h = handlers;
    this.conns = new Map(); // guest id ('net1', 'net2', ...) -> connection
    this.nextId = 1;
    this.code = null;
    this.attempts = [];
  }

  // Resolves with the room code once the matchmaking server has registered it.
  async start() {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        await this.open(Peer, code);
        return code;
      } catch (err) {
        if (err.type !== 'unavailable-id') throw new Error(explain(err)); // that code is taken: try another
      }
    }
    throw new Error('Could not get a room code. Try again.');
  }

  open(Peer, code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => { opened = true; this.peer = peer; this.code = code; resolve(); });
      peer.on('error', (err) => {
        if (!opened) { peer.destroy(); reject(err); } else if (this.h.onError) this.h.onError(explain(err));
      });
      peer.on('connection', (conn) => this.accept(conn));
      // losing the matchmaking server only stops new guests; games in progress carry on
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    });
  }

  accept(conn) {
    // connection spam: past a handful of attempts in 10 seconds, drop new ones on the floor
    const now = performance.now();
    this.attempts = this.attempts.filter((t) => now - t < 10000);
    this.attempts.push(now);
    if (this.attempts.length > MAX_CONNECT_ATTEMPTS || conn.serialization !== 'raw') { conn.close(); return; }
    if (this.conns.size >= MAX_GUESTS) {
      conn.on('open', () => { conn.send(JSON.stringify({ t: 'full' })); setTimeout(() => conn.close(), 500); });
      return;
    }
    const id = `net${this.nextId++}`;
    const limit = rateLimiter(MAX_MSGS_PER_SEC);
    conn.on('open', () => {
      if (this.conns.size >= MAX_GUESTS) { conn.close(); return; }
      this.conns.set(id, conn);
      conn.send(JSON.stringify({ t: 'hello', you: id, v: PROTOCOL }));
      this.h.onJoin(id);
    });
    conn.on('data', (data) => {
      if (!this.conns.has(id)) return;
      const r = limit();
      if (r.flooding) { conn.close(); return; } // flooding: disconnect them
      if (!r.ok) return;
      const m = parse(data, MAX_INPUT_BYTES);
      if (m && m.t === 'i') this.h.onInput(id, m);
    });
    const gone = () => { if (this.conns.delete(id)) this.h.onLeave(id); };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  get count() { return this.conns.size; }

  send(msg) {
    const text = JSON.stringify(msg);
    for (const c of this.conns.values()) {
      if (!c.open) continue;
      // a guest that isn't reading (slow or hostile) doesn't get to fill up our memory
      if (c.dataChannel && c.dataChannel.bufferedAmount > MAX_BUFFERED) continue;
      c.send(text);
    }
  }

  close() {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    if (this.peer) this.peer.destroy();
    this.peer = null;
  }
}

// A guest: connects to a host by room code.
//   handlers: onMessage(msg), onClose(reason)
export class Guest {
  constructor(handlers) {
    this.h = handlers;
  }

  // Resolves with this guest's id on the host ('net1', ...).
  async join(code) {
    code = cleanCode(code);
    if (code.length !== CODE_LENGTH) throw new Error(`Room codes are ${CODE_LENGTH} letters.`);
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let settled = false, closed = false;
      const fail = (reason) => {
        if (!settled) { settled = closed = true; clearTimeout(timer); peer.destroy(); reject(new Error(reason)); return; }
        if (closed) return;
        closed = true;
        this.close();
        this.h.onClose(reason);
      };
      const timer = setTimeout(() => fail("Couldn't connect to that game. Check the code and try again."), 15000);
      peer.on('error', (err) => fail(explain(err)));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        this.conn = conn;
        const limit = rateLimiter(MAX_MSGS_PER_SEC);
        conn.on('data', (data) => {
          const r = limit();
          if (r.flooding) { fail('The host was sending too much data.'); return; }
          if (!r.ok) return;
          const m = parse(data, MAX_SNAPSHOT_BYTES);
          if (!m) return;
          if (!settled) {
            if (m.t === 'full') { fail('That game is full.'); return; }
            if (m.t !== 'hello' || typeof m.you !== 'string' || !/^net\d{1,4}$/.test(m.you)) return;
            if (m.v !== PROTOCOL) { fail('You and the host have different versions of the game. Both of you refresh the page.'); return; }
            settled = true;
            clearTimeout(timer);
            resolve(m.you);
            return;
          }
          this.h.onMessage(m);
        });
        conn.on('close', () => fail('The host left the game.'));
        conn.on('error', () => fail('The connection to the host was lost.'));
      });
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(JSON.stringify(msg));
  }

  close() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.conn = null;
    this.peer = null;
  }
}
