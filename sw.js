// Service worker: makes a normal refresh load the newest version of the game.
//
// GitHub Pages lets browsers reuse files for 10 minutes, so after an update a refresh could
// still run the old code (and online players could end up on different versions). Here the
// game's code (scripts, pages, data files) is always checked with the server first; when it
// hasn't changed that's a tiny "not modified" reply. Offline, the last copy is used. Models,
// sounds and images keep the browser's normal caching.

const CACHE = 'gl-remake-code';
const CODE = /\.(js|mjs|html|json|webmanifest|css)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!CODE.test(url.pathname) && !url.pathname.endsWith('/')) return;
  e.respondWith((async () => {
    try {
      // (a navigation request can't be re-issued with options, so fetch by URL)
      const net = await fetch(req.url, { cache: 'no-cache' });
      if (!net.ok) return net;
      // Hand the page a copy marked "check again next time"; with the server's 10-minute
      // label the browser would keep it in memory and skip this worker on the next refresh.
      const headers = new Headers(net.headers);
      headers.set('Cache-Control', 'no-cache');
      const res = new Response(await net.arrayBuffer(), { status: net.status, statusText: net.statusText, headers });
      e.waitUntil(caches.open(CACHE).then((c) => c.put(req.url, res.clone())));
      return res;
    } catch (err) {
      const cached = await caches.match(req.url);
      if (cached) return cached;
      throw err;
    }
  })());
});
