// Service worker: keeps the game up to date, and keeps it playable when the site can't be
// reached (an outage, or the site being flooded with traffic).
//
// - Code (scripts, pages, data files) is always checked with the server first, so a normal
//   refresh loads the newest version (GitHub Pages lets browsers reuse files for 10 minutes,
//   which could leave players, including online ones, on different versions). When it hasn't
//   changed that's a tiny "not modified" reply. If the server can't be reached, the last copy
//   is used.
// - Models, sounds and images are kept after the first download and served from here, so
//   returning players download almost nothing and can still play if the site goes down. The
//   announcer clips have content-hashed names and never change; models and images are
//   re-checked quietly in the background so an updated model still arrives.

const CODE_CACHE = 'gl-remake-code';
const ASSET_CACHE = 'gl-remake-assets';
const CODE = /\.(js|mjs|html|json|webmanifest|css)$/;
const ASSET = /\.(glb|png|mp3)$/;
const IMMUTABLE = /\/assets\/voice\/[0-9a-f]{10}\.mp3$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (ASSET.test(url.pathname)) e.respondWith(asset(e, url));
  else if (CODE.test(url.pathname) || url.pathname.endsWith('/')) e.respondWith(code(e, req));
});

async function code(e, req) {
  try {
    // (a navigation request can't be re-issued with options, so fetch by URL)
    const net = await fetch(req.url, { cache: 'no-cache' });
    if (!net.ok) return net;
    // Hand the page a copy marked "check again next time"; with the server's 10-minute
    // label the browser would keep it in memory and skip this worker on the next refresh.
    const headers = new Headers(net.headers);
    headers.set('Cache-Control', 'no-cache');
    const res = new Response(await net.arrayBuffer(), { status: net.status, statusText: net.statusText, headers });
    const copy = res.clone(); // before the page reads the body, or the copy fails
    e.waitUntil(caches.open(CODE_CACHE).then((c) => c.put(req.url, copy)));
    return res;
  } catch (err) {
    // offline or the site is down: the last copy (the page itself regardless of ?options)
    const cached = await caches.match(req.url, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    throw err;
  }
}

async function asset(e, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(key);
  const refresh = () => fetch(key, { cache: 'no-cache' }).then((res) => {
    if (res.ok) return cache.put(key, res.clone()).then(() => res);
    return res;
  });
  if (cached) {
    if (!IMMUTABLE.test(url.pathname)) e.waitUntil(refresh().catch(() => {})); // update for next time
    return cached;
  }
  return refresh();
}
