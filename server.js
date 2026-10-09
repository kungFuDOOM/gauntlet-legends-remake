// Tiny zero-dependency static file server for playing and developing locally:
// `npm start`, then open http://localhost:8080
//
// It only listens on this computer by default. To try the game from a phone on the same
// Wi-Fi, run `HOST=0.0.0.0 npm start` and open http://<this computer's address>:8080.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
// only the game's files are served (not the source of tools, tests, node_modules or git)
const SERVED = /^(index\.html|sw\.js|manifest\.webmanifest|icon-\d+\.png|src\/[\w.-]+\.js|vendor\/[\w./-]+\.js|assets\/[\w./-]+\.(glb|png|mp3|json))$/;
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY).end(); return; }
  let rel;
  try {
    rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
  } catch {
    res.writeHead(400, SECURITY).end('Bad request');
    return;
  }
  if (rel === '' || rel === '.') rel = 'index.html';
  const file = join(root, rel);
  if (!file.startsWith(root) || rel.split(/[/\\]/).includes('..') || !SERVED.test(rel.split(sep).join('/'))) {
    res.writeHead(404, SECURITY).end('Not found');
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.writeHead(200, { ...SECURITY, 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, SECURITY).end('Not found');
  }
});
server.on('clientError', (err, socket) => socket.destroy());

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(port, host, () => console.log(`Gauntlet Legends Remake running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
