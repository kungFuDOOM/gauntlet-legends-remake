// Renders every track to a WAV file with the game's own engine, in headless Chrome
// (OfflineAudioContext), and reports peak level, loudness and silence for each.
//   node tools/render-music.mjs [outDir] [seconds]
// Needs Playwright's Chromium (pip/npm playwright) or CHROME_PATH.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/workspace/gauntlet-music-preview';
const secs = Number(process.argv[3] || 30);
const { TRACKS } = await import(join(root, 'src/music-data.js'));
await mkdir(out, { recursive: true });

const types = { '.js': 'text/javascript', '.html': 'text/html' };
const server = createServer(async (req, res) => {
  const p = req.url === '/' ? '/__render.html' : req.url.split('?')[0];
  if (p === '/__render.html') { res.setHeader('content-type', 'text/html'); return res.end('<script type="module">import {createMusic} from "/src/music.js";window.createMusic=createMusic;window.ready=true</script>'); }
  try { const b = await readFile(join(root, p)); res.setHeader('content-type', types[extname(p)] || 'application/octet-stream'); res.end(b); } catch { res.statusCode = 404; res.end(); }
}).listen(0);
const port = server.address().port;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(() => { throw new Error('install playwright (npm i -D playwright) or set PLAYWRIGHT_MODULE'); });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction('window.ready');

const report = [];
for (const id of Object.keys(TRACKS)) {
  const intensities = TRACKS[id].boss ? [0, 2] : [0];
  for (const level of intensities) {
    const r = await page.evaluate(async ({ id, secs, level }) => {
      const sr = 44100;
      const ctx = new OfflineAudioContext(2, sr * secs, sr);
      const dest = ctx.createGain(); dest.gain.value = 0.55 * 0.3; // the in-game music volume
      dest.connect(ctx.destination);
      const m = window.createMusic(ctx, dest);
      m.play(id, { fadeIn: 0.01, at: 0 });
      m.setIntensity(level);
      m.pump(secs);
      const buf = await ctx.startRendering();
      const l = buf.getChannelData(0);
      let peak = 0, sum = 0, silent = 0;
      for (let i = 0; i < l.length; i++) { const a = Math.abs(l[i]); if (a > peak) peak = a; sum += l[i] * l[i]; }
      const win = sr / 2;
      for (let i = 0; i + win <= l.length; i += win) { let s = 0; for (let j = 0; j < win; j++) s += l[i + j] * l[i + j]; if (Math.sqrt(s / win) < 1e-4) silent++; }
      // normalise to -1 dBFS for the preview file (the game plays it quieter); report game-level peak
      const gain = 0.89 / peak;
      const pcm = new Int16Array(l.length * 2);
      for (let i = 0; i < l.length; i++) { const v = Math.max(-1, Math.min(1, l[i] * gain)); pcm[i * 2] = pcm[i * 2 + 1] = v * 32767; }
      let bin = ''; const u8 = new Uint8Array(pcm.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { peak, rms: Math.sqrt(sum / l.length), silentHalfSeconds: silent, pcm: btoa(bin), sr };
    }, { id, secs, level });
    const name = `${id}${level ? '_furious' : ''}`;
    const pcm = Buffer.from(r.pcm, 'base64');
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
    hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(r.sr, 24); hdr.writeUInt32LE(r.sr * 4, 28);
    hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    await writeFile(join(out, `${name}.wav`), Buffer.concat([hdr, pcm]));
    report.push({ name, peak: +r.peak.toFixed(3), rmsDb: +(20 * Math.log10(r.rms)).toFixed(1), silent: r.silentHalfSeconds });
    console.log(name.padEnd(18), 'peak', r.peak.toFixed(3), 'rms dB', (20 * Math.log10(r.rms)).toFixed(1), 'silent half-secs', r.silentHalfSeconds);
  }
}
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close(); server.close();
