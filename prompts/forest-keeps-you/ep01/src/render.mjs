// Frame capture with headless Chromium (Playwright) + ffmpeg.
//   node render.mjs still <t1> <t2> ... [--subs 0] [--out dir]
//   node render.mjs video --out out/video.mp4 [--subs 0] [--workers 3] [--from 0 --to 56]
//   node render.mjs events            -> out/events.json (DUR + EV for the mixer)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const mode = args.shift();
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const subs = opt('subs', '1');
const out = path.resolve(opt('out', path.join(HERE, 'out', mode === 'still' ? 'stills' : 'video.mp4')));
const workers = +opt('workers', '3');
const TL = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json')));
const [W, H] = TL.size, FPS = TL.fps;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(HERE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(HERE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const extraQ = opt('q', '');
const URL0 = `http://127.0.0.1:${server.address().port}/index.html?subs=${subs}${extraQ ? '&' + extraQ : ''}`;

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.READY || window.INIT_ERROR, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.INIT_ERROR);
  if (err) throw new Error(err);
  return page;
}
const shot = async (page, t) => { await page.evaluate((t) => window.render(t), t); return page.screenshot({ type: 'jpeg', quality: 92 }); };

const browser = await pw.chromium.launch({ args: ['--disable-gpu-vsync'] });
try {
  if (mode === 'events') {
    const page = await openPage(browser);
    const ev = await page.evaluate(() => ({ dur: window.DUR, events: window.EV }));
    fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
    fs.writeFileSync(path.join(HERE, 'out', 'events.json'), JSON.stringify(ev, null, 1));
    console.log('events', ev.events.length);
  } else if (mode === 'still') {
    fs.mkdirSync(out, { recursive: true });
    const page = await openPage(browser);
    for (const a of args) { const t = +a; fs.writeFileSync(path.join(out, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await shot(page, t)); }
    console.log('stills ->', out);
  } else if (mode === 'video') {
    const from = +opt('from', 0), to = +opt('to', TL.dur);
    const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const per = Math.ceil((n1 - n0) / workers), parts = [];
    const t0 = Date.now();
    await Promise.all([...Array(workers)].map(async (_, w) => {
      const a = n0 + w * per, b = Math.min(n1, a + per); if (a >= b) return;
      const part = `${out}.part${w}.mp4`; parts[w] = part;
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', part], { stdio: ['pipe', 'inherit', 'inherit'] });
      const page = await openPage(browser);
      for (let f = a; f < b; f++) {
        const buf = await shot(page, f / FPS);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (w === 0 && (f - a) % 60 === 0) console.log(`  frame ${f - a}/${b - a}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      ff.stdin.end();
      await new Promise((r, j) => ff.on('close', (c) => c ? j(new Error('ffmpeg ' + c)) : r()));
    }));
    const list = `${out}.txt`;
    fs.writeFileSync(list, parts.filter(Boolean).map((p) => `file '${p}'`).join('\n'));
    await new Promise((r, j) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
      .on('close', (c) => c ? j(new Error('concat ' + c)) : r()));
    for (const p of parts.filter(Boolean)) fs.unlinkSync(p); fs.unlinkSync(list);
    console.log('video ->', out, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally { await browser.close(); server.close(); }
