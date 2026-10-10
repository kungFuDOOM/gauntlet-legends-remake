import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { request } from 'node:http';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the page has a strict Content Security Policy that matches its one inline script', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(csp, /localhost|127\.0\.0\.1/, 'the published page must not reach services on the player\'s computer');
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'no inline scripts allowed');
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/, 'no eval allowed');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1, 'the import map is the only inline script');
  assert.match(inline[0][1], /type="importmap"/);
  const hash = createHash('sha256').update(inline[0][2]).digest('base64');
  assert.ok(csp.includes(`'sha256-${hash}'`), `CSP must allow the import map: 'sha256-${hash}'`);
});

test('no outside data is ever written into the page as HTML', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /\beval\(|new Function\(|document\.write|insertAdjacentHTML|outerHTML/, f);
    for (const m of src.matchAll(/\.innerHTML\s*=\s*(`[^`]*`|'[^']*')/g)) {
      // only fixed markup: the one allowed interpolation is a number constant
      const dynamic = [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]);
      assert.ok(dynamic.every((d) => /^CODE_LENGTH( \+ \d+)?$/.test(d)), `${f}: innerHTML with dynamic content: ${dynamic}`);
    }
    assert.doesNotMatch(src.replace(/\.innerHTML\s*=\s*(`[^`]*`|'[^']*')/g, ''), /\.innerHTML\s*=/, `${f}: innerHTML from a variable`);
  }
});

test('the dev server only serves game files and survives hostile requests', async () => {
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const get = (path) => new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
    req.on('error', () => resolve({ statusCode: 'error' }));
    req.end();
  });
  try {
    assert.equal((await get('/')).statusCode, 200);
    assert.equal((await get('/src/main.js')).statusCode, 200);
    const ok = await get('/index.html');
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    for (const bad of ['/../package.json', '/%2e%2e/%2e%2e/etc/passwd', '/..%2fserver.js', '/server.js', '/package.json', '/.git/config', '/test/security.test.js', '/node_modules/', '/%E0%A4%A', '/src/../server.js']) {
      const res = await get(bad);
      assert.ok([400, 404].includes(res.statusCode), `${bad} -> ${res.statusCode}`);
    }
    assert.equal((await get('/')).statusCode, 200, 'still up after all that');
  } finally {
    server.close();
  }
});
