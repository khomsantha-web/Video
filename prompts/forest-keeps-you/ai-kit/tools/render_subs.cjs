// อ่านไฟล์ .srt แล้วสร้างภาพซับไทยโปร่งใส (PNG 1080x1920) ทีละบรรทัด -> <outdir>/sub_001.png ...
// ใช้ Chromium จริงจึงจัดสระ/วรรณยุกต์ไทยถูกต้อง   usage: node render_subs.cjs file.srt outdir fontsdir
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [srt, out, fonts] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const blocks = fs.readFileSync(srt, 'utf8').replace(/\r/g, '').trim().split(/\n\n+/).map((b) => b.split('\n'));
const tc = (s) => { const m = s.match(/(\d+):(\d+):(\d+),(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const f64 = (f) => fs.readFileSync(path.join(fonts, f)).toString('base64');
  const css = `@font-face{font-family:T;src:url(data:font/woff2;base64,${f64('NotoSerifThai-thai.woff2')});unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC;font-weight:700}
  @font-face{font-family:T;src:url(data:font/woff2;base64,${f64('NotoSerifThai-latin.woff2')});unicode-range:U+0000-00FF,U+2000-206F;font-weight:700}`;
  const list = [];
  for (const [i, bl] of blocks.entries()) {
    const [a, z] = bl[1].split(' --> '), text = bl.slice(2).join('<br>');
    await p.setContent(`<style>${css}html,body{margin:0;background:transparent}
    #s{position:absolute;left:60px;right:60px;bottom:200px;text-align:center;font:700 66px/1.35 T;color:#fff;padding:22px 30px;background:rgba(10,10,16,.72);border-radius:26px}</style><div id=s>${text}</div>`);
    await p.evaluate(() => document.fonts.ready);
    const file = `sub_${String(i + 1).padStart(3, '0')}.png`;
    await p.screenshot({ path: path.join(out, file), omitBackground: true });
    list.push({ file, start: tc(a), end: tc(z) });
  }
  fs.writeFileSync(path.join(out, 'subs.json'), JSON.stringify(list, null, 1)); await b.close();
})();
