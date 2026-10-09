// The online connection layer: WebRTC data channels through PeerJS, using its free public
// matchmaking server to find each other. This is the only file that knows about PeerJS;
// moving to your own server later means replacing Host and Guest here and nothing else.
//
// Add ?peer=host:port to the page address to use your own PeerJS server instead of the
// public one (the automated tests do this).

// Bump when the snapshot format or level generation changes, so old and new versions of
// the game don't try to play together.
export const PROTOCOL = 1;
export const MAX_GUESTS = 3;
const PREFIX = 'glremake-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, which look like 1 and 0

function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
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
const explain = (err) => ERRORS[err && err.type] || (err && err.message) || 'The connection failed.';
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// The host: runs the game and accepts up to MAX_GUESTS guests.
//   handlers: onJoin(id), onLeave(id), onInput(id, msg), onError(text)
export class Host {
  constructor(handlers) {
    this.h = handlers;
    this.conns = new Map(); // guest id ('net1', 'net2', ...) -> connection
    this.nextId = 1;
    this.code = null;
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
    if (this.conns.size >= MAX_GUESTS) {
      conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); });
      return;
    }
    const id = `net${this.nextId++}`;
    conn.on('open', () => {
      this.conns.set(id, conn);
      conn.send({ t: 'hello', you: id, v: PROTOCOL });
      this.h.onJoin(id);
    });
    conn.on('data', (m) => { if (m && m.t === 'i' && this.conns.has(id)) this.h.onInput(id, m); });
    const gone = () => { if (this.conns.delete(id)) this.h.onLeave(id); };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  get count() { return this.conns.size; }

  send(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
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
    const Peer = await loadPeer();
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let settled = false, closed = false;
      const fail = (reason) => {
        if (!settled) { settled = closed = true; clearTimeout(timer); peer.destroy(); reject(new Error(reason)); return; }
        if (closed) return;
        closed = true;
        this.h.onClose(reason);
      };
      const timer = setTimeout(() => fail("Couldn't connect to that game. Check the code and try again."), 15000);
      peer.on('error', (err) => fail(explain(err)));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('data', (m) => {
          if (!settled) {
            if (m.t === 'full') { fail('That game is full.'); return; }
            if (m.t !== 'hello') return;
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
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.conn = null;
    this.peer = null;
  }
}
