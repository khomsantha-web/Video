// ep01 ตะเกียงริมคลอง — scene, camera, subtitles. render(t) is a pure function of t.
'use strict';
(async function init() {
  const { mulberry, vnoise, hash, clamp, lerp, ss, eo, eio, prog, track, rgba, hex, mk, drawS, wash, drawW, drawList, sprite, blob } = E;
  const TL = await (await fetch('timeline.json')).json();
  const C = TL.cues;
  const [W, H] = TL.size;
  const q = new URLSearchParams(location.search);
  const SUBS = q.get('subs') !== '0';

  const cv = document.getElementById('c');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // ---------- palette ----------
  const P = {
    paper: hex('#efe4cc'), ink: hex('#1d1a17'), ink2: hex('#5a4636'),
    night: hex('#1f2838'), night2: hex('#141a27'), slate: hex('#4d5d72'), moss: hex('#2f3a36'),
    moss2: hex('#46534e'), fog: hex('#8a9aa8'), amber: hex('#d68a2e'), wood: hex('#3a3330'),
    roof: hex('#22242c'), wet: hex('#3f5f80'), table: hex('#2a2019'),
  };

  // ---------- fonts ----------
  const faces = [
    ['NotoSerifThai', 'fonts/NotoSerifThai-thai.woff2', 'U+0E01-0E5B, U+200C-200D, U+25CC', '500'],
    ['NotoSerifThai', 'fonts/NotoSerifThai-latin.woff2', 'U+0000-00FF, U+2000-206F', '500'],
    ['Charm', 'fonts/Charm-thai.woff2', 'U+0E01-0E5B, U+200C-200D, U+25CC', '700'],
    ['Charm', 'fonts/Charm-latin.woff2', 'U+0000-00FF, U+2000-206F', '700'],
  ];
  for (const [fam, url, range, weight] of faces) {
    const f = new FontFace(fam, `url(${url})`, { unicodeRange: range, weight });
    await f.load(); document.fonts.add(f);
  }

  // ---------- paper textures ----------
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function makePaper(w, h, seed, vignette) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const img = g.createImageData(w, h); const d = img.data;
    const rng = mulberry(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = noise2(x / 180 + seed, y / 180) * .5 + noise2(x / 50, y / 50 + seed) * .3 + noise2(x / 9, y / 9) * .2;
      let k = 1 + (n - .5) * .07 + (hash2(x, y) - .5) * .03;
      if (vignette) { const dx = x / w - .5, dy = y / h - .5; k *= 1 - (dx * dx + dy * dy) * .22; }
      const i = (y * w + x) * 4;
      d[i] = P.paper[0] * k; d[i + 1] = P.paper[1] * k; d[i + 2] = P.paper[2] * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < w * h / 700; i++) {
      const x = rng() * w, y = rng() * h, a = rng() * Math.PI * 2, l = 4 + rng() * 14;
      g.strokeStyle = rng() < .5 ? 'rgba(120,95,60,.06)' : 'rgba(255,250,235,.10)'; g.lineWidth = .6;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + .6) * l * .6, y + Math.sin(a + .6) * l * .6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  }
  const PAGE = [0, 0, 1000, 1700];
  const pagePaper = makePaper(1000, 1700, 3, false);
  const screenPaper = makePaper(W, H, 7, true);

  // ---------- scene build (seeded) ----------
  const R = mulberry(20261121);
  const region = [];   // ragged painting rectangle on the journal page
  { const x0 = 30, y0 = 40, x1 = 970, y1 = 1300, st = 24;
    for (let x = x0; x < x1; x += st) region.push([x, y0 + (vnoise(x * .05) - .5) * 14]);
    for (let y = y0; y < y1; y += st) region.push([x1 + (vnoise(50 + y * .05) - .5) * 14, y]);
    for (let x = x1; x > x0; x -= st) region.push([x, y1 + (vnoise(90 + x * .05) - .5) * 18]);
    for (let y = y1; y > y0; y -= st) region.push([x0 + (vnoise(130 + y * .05) - .5) * 14, y]); }
  const ragBand = (y0, y1, amp, seed, x0 = 20, x1 = 980) => {
    const pts = [];
    for (let x = x0; x <= x1; x += 25) pts.push([x, y0 + (vnoise(seed + x * .012) - .5) * amp]);
    for (let x = x1; x >= x0; x -= 25) pts.push([x, y1 + (vnoise(seed + 40 + x * .012) - .5) * amp]);
    return pts;
  };
  const bg = [
    wash(R, region, P.night, 1.0, 5),
    wash(R, region, P.night, .7, 7),
    wash(R, ragBand(30, 500, 80, 3), P.night2, .75, 10),
    wash(R, ragBand(520, 780, 70, 7), P.paper, .13, 14),
    wash(R, (() => { const pts = []; for (let x = 20; x <= 980; x += 20) pts.push([x, 690 - vnoise(x * .03) * 60 - vnoise(x * .11) * 25]); pts.push([980, 910], [20, 910]); return pts; })(), P.moss2, .55, 6),
    wash(R, ragBand(905, 1320, 20, 11), hex('#151c2a'), .7, 6),
  ];

  for (let i = 0; i < 22; i++) {
    const y = 60 + i * 24 + R() * 14, x = 30 + R() * 300, L = 400 + R() * 500;
    bg.push(mk(R, [[x, y], [x + L * .5, y + (R() - .5) * 10], [x + L, y + (R() - .5) * 14]], { w: 14 + R() * 18, prof: 'brush', col: R() < .6 ? P.night2 : P.slate, a: .22, nb: 7 }));
  }
  // palms and bananas
  function palm(x, by, h, lean, col, a, w) {
    const items = [];
    const top = [x + lean, by - h];
    items.push(mk(R, [[x, by], [x + lean * .3, by - h * .4], [x + lean * .75, by - h * .8], top], { w, prof: 'trunk', col, a, nb: 4 }));
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI + i / 8 * Math.PI + (R() - .5) * .3, L = h * (.28 + R() * .12);
      const mid = [top[0] + Math.cos(ang) * L * .55, top[1] + Math.sin(ang) * L * .35 - L * .12];
      const end = [top[0] + Math.cos(ang) * L, top[1] + Math.sin(ang) * L * .25 + L * .35];
      items.push(mk(R, [top, mid, end], { w: w * 2.2, prof: 'leaf', col, a: a * .95, nb: 5 }));
    }
    return items;
  }
  function banana(x, by, s, col, a) {
    const items = [];
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * .38 + (R() - .5) * .2, L = s * (.7 + R() * .4);
      items.push(mk(R, [[x, by], [x + Math.cos(ang) * L * .5, by + Math.sin(ang) * L * .6], [x + Math.cos(ang) * L, by + Math.sin(ang) * L * .8 + L * .2]], { w: s * .22, prof: 'leaf', col, a, nb: 5 }));
    }
    return items;
  }
  const trees = [
    { items: palm(170, 905, 400, 30, P.moss, .8, 9), t0: 5.6, d: 2.4, bx: 170, by: 905, ph: 0 },
    { items: palm(270, 905, 310, -24, P.moss2, .7, 7), t0: 6.2, d: 2.2, bx: 270, by: 905, ph: 1.3 },
    { items: palm(770, 905, 430, -36, P.moss, .8, 10), t0: 6.0, d: 2.4, bx: 770, by: 905, ph: 2.1 },
    { items: palm(880, 905, 320, 22, P.moss2, .7, 7), t0: 6.6, d: 2.2, bx: 880, by: 905, ph: 3.4 },
    { items: banana(690, 905, 110, P.moss, .75), t0: 7.2, d: 1.6, bx: 690, by: 905, ph: .7 },
    { items: banana(305, 905, 90, P.moss, .75), t0: 7.6, d: 1.6, bx: 305, by: 905, ph: 2.6 },
  ];
  for (const tr of trees) tr.bb = [tr.bx - 330, tr.by - 520, 660, 560];

  // house on stilts
  const LX = 432, LY = 744;  // lantern
  const houseItems = [];
  for (const x of [392, 440, 492, 548, 600, 646]) houseItems.push(mk(R, [[x, 800], [x + (R() - .5) * 4, 925]], { w: 7, prof: 'even', col: P.wood, a: .9, nb: 3 }));
  houseItems.push(mk(R, [[365, 803], [665, 800]], { w: 9, prof: 'even', col: hex('#2b2726'), a: .9, nb: 4 }));
  houseItems.push(wash(R, [[452, 700], [640, 698], [642, 800], [450, 802]], hex('#3b3a3d'), .95, 3));
  for (let x = 462; x < 640; x += 16) houseItems.push(mk(R, [[x, 704], [x + 1, 798]], { w: 3, prof: 'even', col: hex('#2a292c'), a: .6, nb: 2 }));
  houseItems.push(wash(R, [[525, 728], [565, 728], [566, 800], [524, 800]], hex('#0d1018'), .95, 2));   // dark doorway
  houseItems.push(wash(R, [[595, 725], [625, 725], [625, 755], [595, 755]], hex('#10141d'), .9, 2));   // window
  houseItems.push(wash(R, [[372, 712], [546, 556], [672, 708], [640, 716], [546, 600], [404, 720]], P.roof, 1, 4));
  houseItems.push(wash(R, [[404, 720], [546, 600], [640, 716], [452, 716]], hex('#2c2d33'), .9, 3));
  houseItems.push(mk(R, [[368, 714], [546, 554], [676, 710]], { w: 6, prof: 'brush', col: hex('#121318'), a: .9, nb: 4 }));
  houseItems.push(mk(R, [[546, 556], [544, 528], [552, 516]], { w: 4, prof: 'tip', col: hex('#121318'), a: .9, nb: 2 }));   // gable finial
  houseItems.push(mk(R, [[368, 802], [372, 768], [372, 768]], { w: 4, prof: 'even', col: P.wood, a: .9, nb: 2 }));
  houseItems.push(mk(R, [[370, 772], [452, 772]], { w: 3.5, prof: 'even', col: P.wood, a: .85, nb: 2 }));
  for (const x of [386, 404, 422]) houseItems.push(mk(R, [[x, 772], [x, 801]], { w: 2.5, prof: 'even', col: P.wood, a: .8, nb: 1 }));
  houseItems.push(mk(R, [[LX, 718], [LX, 735]], { w: 2, prof: 'even', col: P.ink, a: .9, nb: 1 }));
  const house = { items: houseItems, t0: 5.8, d: 4.6, bb: [340, 500, 360, 440] };

  const stepItems = [];
  stepItems.push(mk(R, [[395, 804], [335, 912]], { w: 5, prof: 'even', col: P.wood, a: .9, nb: 3 }));
  stepItems.push(mk(R, [[417, 804], [357, 912]], { w: 5, prof: 'even', col: P.wood, a: .9, nb: 3 }));
  for (let i = 0; i < 6; i++) { const u = (i + .5) / 6; const y = 804 + 108 * u, x = 395 - 60 * u; stepItems.push(mk(R, [[x - 4, y], [x + 26, y]], { w: 4, prof: 'even', col: hex('#4a4240'), a: .85, nb: 2 })); }
  const steps = { items: stepItems, t0: 10.0, d: 2.0, bb: [320, 790, 110, 130] };

  // water ripples + reflection
  const waterItems = [];
  waterItems.push(wash(R, [[372, 912], [672, 912], [690, 1040], [360, 1050]], hex('#0e131d'), .5, 12));
  for (let i = 0; i < 26; i++) {
    const y = 925 + i * 14 + R() * 8, x = 60 + R() * 780, L = 80 + R() * 160;
    waterItems.push(mk(R, [[x, y], [x + L * .5, y + (R() - .5) * 3], [x + L, y + (R() - .5) * 3]], { w: 3 + R() * 4, prof: 'brush', col: R() < .7 ? P.slate : P.fog, a: .32, nb: 3 }));
  }
  const water = { items: waterItems, t0: 8.0, d: 3.0, bb: [30, 900, 940, 420] };

  // reeds on the near bank
  const reedItems = [];
  for (let i = 0; i < 34; i++) {
    const x = 40 + i * 27 + R() * 12, by = 1310, h = 90 + R() * 130, b = (R() - .5) * 50;
    reedItems.push(mk(R, [[x, by], [x + b * .4, by - h * .6], [x + b, by - h]], { w: 4 + R() * 3, prof: 'tip', col: hex('#121822'), a: .85, nb: 2 }));
  }
  const reeds = { items: reedItems, t0: 9.0, d: 2.4, bb: [20, 1060, 960, 260] };

  // lantern body
  const lanternItems = [
    wash(R, [[LX - 8, LY - 9], [LX + 8, LY - 9], [LX + 10, LY + 10], [LX - 10, LY + 10]], P.amber, .9, 1.2),
    mk(R, [[LX - 9, LY - 10], [LX + 9, LY - 10]], { w: 2.4, prof: 'even', col: P.ink, a: .9, nb: 1 }),
    mk(R, [[LX - 11, LY + 11], [LX + 11, LY + 11]], { w: 2.6, prof: 'even', col: P.ink, a: .9, nb: 1 }),
    mk(R, [[LX - 9, LY - 10], [LX - 11, LY + 11]], { w: 1.4, prof: 'even', col: P.ink, a: .8, nb: 0 }),
    mk(R, [[LX + 9, LY - 10], [LX + 11, LY + 11]], { w: 1.4, prof: 'even', col: P.ink, a: .8, nb: 0 }),
  ];
  const lantern = { items: lanternItems, t0: C.lanternOn - .2, d: .6, bb: [LX - 20, LY - 22, 40, 44] };

  // slippers on the porch
  const slipItems = [];
  for (const [x, y, r] of [[458, 797, -.15], [476, 799, .1]]) {
    slipItems.push(wash(R, blob(R, x, y, 7.5, 3, 14, .1, r), hex('#5a6b7e'), .95, .6));
    slipItems.push(mk(R, [[x - 3, y - 1.5], [x - 1, y - 3.5], [x + 1.5, y - 1.5]], { w: 2, prof: 'even', col: hex('#7a3e30'), a: .9, nb: 0 }));
    slipItems.push(mk(R, [[x - 6, y + 2.8], [x + 6, y + 2.6]], { w: 1.2, prof: 'brush', col: P.fog, a: .5, nb: 0 }));
  }
  const slippers = { items: slipItems, t0: C.slippers, d: 1.4, bb: [440, 785, 50, 25] };

  // footprints (bare feet). local shape, heel at origin pointing -y
  function footPoly(rng, s, mirror) {
    const pts = [];
    const sole = [[0, 0], [3.2, -1], [4.2, -5], [3.8, -9], [4.6, -13], [3.8, -16.4], [0.8, -17.2], [-2.6, -16], [-3.4, -12], [-2.4, -8], [-3, -4], [-2.6, -1]];
    for (const [x, y] of sole) pts.push([(mirror ? -x : x) * s, y * s]);
    const toes = [];
    const tp = [[-2.4, -19.4, 1.5], [0, -20.3, 1.2], [2, -19.8, 1.05], [3.6, -18.6, .9], [4.8, -17, .8]];
    for (const [x, y, r] of tp) toes.push(blob(rng, (mirror ? -x : x) * s, y * s, r * s, r * 1.15 * s, 10, .12));
    return { sole: pts, toes };
  }
  function mkPrint(x, y, ang, s, mirror, col, a) {
    const f = footPoly(R, s, mirror);
    const tr = (pts) => pts.map(([px, py]) => [x + px * Math.cos(ang) - py * Math.sin(ang), y + px * Math.sin(ang) + py * Math.cos(ang)]);
    return { x, y, items: [wash(R, tr(f.sole), col, a, s * .35), ...f.toes.map((tp) => wash(R, tr(tp), col, a, s * .2))],
      rim: wash(R, tr(f.sole), col, a * .5, s * .7) };
  }
  // up the steps from the water to the slippers
  const porchPrints = C.prints.map((t, i) => {
    const u = i / (C.prints.length - 1);
    const x = lerp(342, 448, u) + (i % 2 ? 3 : -3), y = lerp(915, 806, Math.pow(u, .9));
    return { t, ...mkPrint(x, y, .75, .55, i % 2 === 1, hex('#0a0e16'), .85) };
  });
  // out of the painting, down the journal page, toward the painter
  const paperPrints = C.paperPrints.map((t, i) => {
    const x = 500 + (i % 2 ? 44 : -44) + i * 5, y = 1395 + i * 62;
    return { t, ...mkPrint(x, y, Math.PI + (i % 2 ? -.06 : .06), 3.0 + i * .3, i % 2 === 0, P.wet, .55) };
  });
  const lastPrint = { t: C.lastPrint, ...mkPrint(0, 0, Math.PI + .05, 6.5, false, P.wet, .55) };

  // the empty boat
  const boatItems = [
    wash(R, [[-70, -6], [70, -8], [56, 8], [0, 13], [-54, 8]], hex('#1a1e27'), 1, 2),
    mk(R, [[-72, -7], [0, -3], [72, -9]], { w: 3.5, prof: 'brush', col: hex('#5a5552'), a: .7, nb: 2 }),
    mk(R, [[20, -6], [58, 22], [74, 40]], { w: 3, prof: 'even', col: hex('#2a2422'), a: .9, nb: 2 }),
    mk(R, [[-60, 16], [60, 18]], { w: 4, prof: 'brush', col: P.fog, a: .18, nb: 2 }),
  ];
  const boat = { items: boatItems, t0: C.boat, d: 1.2, bb: [-80, -20, 165, 70] };

  // table + brush (outside the page)
  const tableItems = [wash(R, [[-900, -900], [1900, -900], [1900, 2900], [-900, 2900]], P.table, 1, 0)];
  for (let x = -800; x < 1800; x += 60 + R() * 40) tableItems.push(mk(R, [[x, -900], [x + (R() - .5) * 60, 1000], [x + (R() - .5) * 80, 2900]], { w: 14 + R() * 30, prof: 'even', col: hex('#3a2c21'), a: .35, nb: 6 }));
  const tableSprite = sprite(tableItems, [-900, -900, 2800, 3800], .35);
  const brushItems = [
    mk(R, [[1040, 1060], [1052, 1250], [1062, 1420]], { w: 10, prof: 'trunk', col: hex('#6a4528'), a: .95, nb: 3 }),
    mk(R, [[1062, 1420], [1065, 1470]], { w: 12, prof: 'even', col: hex('#8a8a86'), a: .9, nb: 2 }),
    mk(R, [[1065, 1470], [1068, 1530]], { w: 12, prof: 'tip', col: hex('#1e2a3c'), a: .95, nb: 4 }),
  ];
  const brushSprite = sprite(brushItems, [1020, 1050, 70, 500], 2);

  // shadow silhouette (normalized; head slightly tilted)
  const shadowShape = (() => {
    const pts = [[-.58, 1.08], [-.52, .64], [-.34, .5], [-.12, .43], [-.09, .35]];
    const tilt = .14;
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (.62 + i / 20 * 1.76);
      let x = Math.cos(a) * .165, y = Math.sin(a) * .2;
      [x, y] = [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
      pts.push([x + .01, y + .17]);
    }
    pts.push([.09, .35], [.12, .43], [.34, .5], [.52, .64], [.58, 1.08]);
    return [0, 1, 2].map((k) => pts.map(([x, y], i) => [x + (vnoise(k * 30 + i * .8) - .5) * .018, y + (vnoise(k * 30 + 70 + i * .8) - .5) * .014]));
  })();

  // ---------- sprite cache ----------
  const cache = new Map();
  function drawEl(key, el, p, K, aMul = 1) {
    if (p <= 0) return;
    if (p >= 1) {
      let s = cache.get(key);
      if (!s) { s = sprite(el.items, el.bb, K); cache.set(key, s); }
      if (aMul < 1) { ctx.globalAlpha = aMul; }
      ctx.drawImage(s, el.bb[0], el.bb[1], el.bb[2], el.bb[3]);
      ctx.globalAlpha = 1;
    } else drawList(ctx, el.items, p, aMul);
  }

  // ---------- camera ----------
  const cam = track([
    [0, 432, 742, 3.2], [4.8, 432, 745, 3.35], [9, 500, 620, 1.9], [15, 500, 760, 1.9],
    [20, 425, 815, 2.6], [26.5, 410, 830, 2.8], [31, 560, 790, 2.0], [36, 500, 870, .9],
    [40, 500, 880, .88], [45.4, 500, 960, .98], [49.6, 500, 1000, 1.04], [56, 500, 1010, 1.07],
  ]);

  // lantern glow (painting) and the light behind the painter
  const glowP = (t) => {
    if (t < C.lanternOn) return 0;
    let g = eo((t - C.lanternOn) / .5) * (1 + .08 * (vnoise(t * 7) - .5) + .05 * (vnoise(t * 19 + 3) - .5));
    if (t > C.lanternOff) { const u = (t - C.lanternOff) / 1.1; g *= u >= 1 ? 0 : (1 - eio(u)) * (.6 + .4 * (vnoise(t * 25) > .45 ? 1 : 0)); }
    return Math.max(0, g);
  };
  const lightB = (t) => {
    if (t < C.hit - .2) return 0;
    const u = (t - (C.hit - .2)) / .9;
    let L = eo(u) * (1 + .07 * (vnoise(t * 6 + 11) - .5) + .04 * (vnoise(t * 17) - .5));
    if (t < C.hit) L *= .25 * (vnoise(t * 40) > .5 ? 1 : .3);   // the wick sputters first (J-cut with the sound)
    return L;
  };

  function fogBand(t, yc, th, a, sp, seed) {
    ctx.fillStyle = rgba(P.paper, a / 2);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let x = 0; x <= 1000; x += 25) ctx.lineTo(x, yc - th / 2 + (vnoise(seed + k * 7 + x * .006 + t * sp) - .5) * th * .8);
      for (let x = 1000; x >= 0; x -= 25) ctx.lineTo(x, yc + th / 2 + (vnoise(seed + 20 + k * 7 + x * .006 + t * sp) - .5) * th * .8);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawPrint(pr, t, dur = .35) {
    const u = (t - pr.t) / dur; if (u <= 0) return;
    const e = eo(u);
    ctx.save(); ctx.translate(pr.x, pr.y); ctx.scale(.7 + .3 * e, .7 + .3 * e); ctx.translate(-pr.x, -pr.y);
    for (const it of pr.items) drawW(ctx, it, 1, e);
    drawW(ctx, pr.rim, 1, e * .8);
    ctx.restore();
  }

  function handText(str, x, y, size, col, a, p, align = 'left', halo = null) {
    if (p <= 0) return;
    ctx.save();
    ctx.font = `700 ${size}px Charm`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(str).width, x0 = align === 'center' ? x - w / 2 : x;
    ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.6, (w + size * 2) * clamp(p) + (p >= 1 ? size * 4 : 0) - size * .2 + size * .2, size * 2.6); ctx.clip();
    if (halo) { ctx.shadowColor = halo; ctx.shadowBlur = size * .6; ctx.strokeStyle = halo; ctx.lineWidth = size * .12; ctx.strokeText(str, x, y); ctx.shadowBlur = 0; }
    ctx.fillStyle = rgba(col, a); ctx.fillText(str, x, y);
    ctx.fillStyle = rgba(col, a * .35); ctx.fillText(str, x + size * .02, y + size * .015);   // written twice
    ctx.restore();
  }

  function subtitle(t) {
    for (const s of TL.subs) {
      if (t < s.t0 - .01 || t > s.t1 + .01) continue;
      const a = Math.min(ss((t - s.t0) / .25), ss((s.t1 - t) / .25));
      const lines = s.text.split('/');
      const fs = 54, lh = 76, yc = s.pos === 'high' ? 1210 : 1490;
      ctx.save();
      ctx.font = `500 ${fs}px NotoSerifThai`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((ln, i) => {
        const y = yc + (i - (lines.length - 1) / 2) * lh;
        ctx.shadowColor = rgba(P.paper, .95 * a); ctx.shadowBlur = 34;
        ctx.strokeStyle = rgba(P.paper, .6 * a); ctx.lineWidth = 14; ctx.lineJoin = 'round';
        ctx.strokeText(ln, W / 2, y); ctx.strokeText(ln, W / 2, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgba(P.ink, .9 * a); ctx.fillText(ln, W / 2, y);
      });
      ctx.restore();
    }
  }

  // ---------- render ----------
  window.render = (t) => {
    let [cx, cy, s] = cam(t);
    let shx = 0, shy = 0;
    if (t > C.hit && t < C.hit + 1.6) { const k = 16 * Math.exp(-(t - C.hit) * 3.2); shx = k * Math.sin(t * 61); shy = k * .6 * Math.sin(t * 47 + 1); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(P.table, 1); ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, W / 2 - cx * s + shx, H / 2 - cy * s + shy);

    // table, page
    if (s < 1.5) {
      ctx.drawImage(tableSprite, -900, -900, 2800, 3800);
      ctx.drawImage(brushSprite, 1020, 1050, 70, 500);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
      ctx.fillStyle = rgba(P.paper, 1); ctx.fillRect(0, 0, 1000, 1700); ctx.restore();
    }
    ctx.drawImage(pagePaper, 0, 0, 1000, 1700);

    // ---- the painting ----
    for (const w of bg) E.drawItem(ctx, w, 1, 1);
    ctx.save();
    ctx.beginPath(); region.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();

    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i], p = prog(t, tr.t0, tr.d);
      if (p <= 0) continue;
      const sk = p >= 1 ? .006 * (Math.sin(1.15 * t + tr.ph) + .4 * Math.sin(2.7 * t + 2 * tr.ph)) : 0;
      ctx.save(); ctx.transform(1, 0, sk, 1, -sk * tr.by, 0);
      drawEl('tree' + i, tr, p, 2);
      ctx.restore();
    }
    fogBand(t, 735, 110, .16, .05, 1);
    drawEl('water', water, prog(t, water.t0, water.d), 1.4);
    drawEl('house', house, prog(t, house.t0, house.d), 3.2);
    drawEl('steps', steps, prog(t, steps.t0, steps.d), 3.2);
    drawEl('slip', slippers, prog(t, slippers.t0, slippers.d), 5);
    for (const pr of porchPrints) drawPrint(pr, t);

    // lantern + its light (light = paper lifted through the night washes)
    const g = glowP(t);
    if (g > 0) {
      const rg = ctx.createRadialGradient(LX, LY, 2, LX, LY, 120);
      rg.addColorStop(0, rgba(P.paper, .55 * g)); rg.addColorStop(.35, rgba(P.paper, .2 * g)); rg.addColorStop(1, rgba(P.paper, 0));
      ctx.fillStyle = rg; ctx.fillRect(LX - 130, LY - 130, 260, 260);
      const ag = ctx.createRadialGradient(LX, LY, 1, LX, LY, 46);
      ag.addColorStop(0, rgba(P.amber, .5 * g)); ag.addColorStop(1, rgba(P.amber, 0));
      ctx.fillStyle = ag; ctx.fillRect(LX - 50, LY - 50, 100, 100);
      // reflection in the canal
      for (let i = 0; i < 9; i++) {
        const y = 922 + i * 13, w = 16 - i * 1.2 + (vnoise(t * 2 + i * 3) - .5) * 8;
        ctx.fillStyle = rgba(P.amber, (.42 - i * .04) * g);
        ctx.fillRect(LX - w / 2 + (vnoise(t * 1.3 + i) - .5) * 6, y, w, 3.2);
      }
    }
    drawEl('lantern', lantern, prog(t, lantern.t0, lantern.d), 6, g > 0 ? 1 : .55);
    if (g > 0) { ctx.fillStyle = rgba([255, 236, 190], .7 * g); ctx.beginPath(); ctx.ellipse(LX, LY + 1, 3, 5, 0, 0, 7); ctx.fill(); }
    if (t > C.lanternOff) { const u = prog(t, C.lanternOff + .6, .8); drawW(ctx, lanternOffWash, u, 1); }

    // the boat
    if (t > boat.t0 - .1 && t < 33) {
      const bx = 250 + (t - boat.t0) * 58, by = 1035 + Math.sin(t * 1.4) * 2;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(.03 * Math.sin(t * 1.1));
      drawEl('boat', boat, prog(t, boat.t0, boat.d), 3);
      ctx.restore();
    }
    drawEl('reeds', reeds, prog(t, reeds.t0, reeds.d), 1.6);
    fogBand(t, 925, 70, .14, .07, 5);
    fogBand(t, 1040, 160, .12 + .1 * ss((t - 26.5) / 1.5) * (1 - ss((t - 31) / 2)), .09, 9);

    // hand note on the painting: "still wet"
    if (t > C.wetNote) {
      const p = prog(t, C.wetNote, 1.0), lp = prog(t, C.wetNote + .5, .8);
      const fade = 1 - ss((t - 30) / 1.5);
      if (fade > 0) {
        handText('ยังเปียกอยู่', 500, 760, 21, P.amber, .95 * fade, p, 'left', `rgba(20,26,40,${.8 * fade})`);
        if (lp > 0) { drawS(ctx, wetLeader, lp, fade); }
      }
    }
    ctx.restore();   // end painting clip

    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .55;
    ctx.drawImage(pagePaper, 0, 0, 1000, 1700); ctx.restore();
    // ---- the journal page below the painting ----
    handText('คืนที่ ๓ · ตี ๓', 70, 1390, 44, P.ink2, .9, prog(t, C.pageNote, 1.4));
    handText('ตะเกียงจุดเองอีกแล้ว', 70, 1452, 36, P.ink2, .8, prog(t, C.pageNote + 1.5, 1.4));
    handText('ห้ามหันหลัง', 70, 1640, 30, P.ink2, .45, prog(t, C.pageNote + 3.2, 1.0));
    for (const pr of paperPrints) drawPrint(pr, t, .5);

    // ---- night over the whole sheet, and the light behind the painter ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const D = .5 * ss((t - 31) / 4);
    const L = lightB(t);
    if (D > 0) {
      const gx = W / 2, gy = H + 260;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 1900);
      rg.addColorStop(0, rgba([10, 14, 26], D * (1 - .92 * L)));
      rg.addColorStop(.55, rgba([10, 14, 26], D * (1 - .55 * L)));
      rg.addColorStop(1, rgba([10, 14, 26], D * (1 - .1 * L)));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    if (L > 0) {
      const ag = ctx.createRadialGradient(W / 2, H + 200, 0, W / 2, H + 200, 1500);
      ag.addColorStop(0, rgba(P.amber, .30 * L)); ag.addColorStop(1, rgba(P.amber, 0));
      ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
      // the shadow rises across the page
      const u = eo((t - C.hit) / 3.2);
      const top = lerp(H + 80, 600, u), base = H + 140, hgt = base - top, wid = 860 * (1 + .012 * (vnoise(t * 6) - .5));
      ctx.fillStyle = rgba([12, 14, 24], .42 * Math.min(1, L) / 3 * 1.6);
      for (const poly of shadowShape) {
        ctx.beginPath();
        poly.forEach(([x, y], i) => { const X = W / 2 + 20 + x * wid, Y = top + y * hgt; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.closePath(); ctx.fill();
      }
    }

    // ---- opening note ----
    if (t < 5.4) handText('คืนที่ ๓', W / 2, 400, 104, P.amber, .95 * (1 - ss((t - 4.4) / .9)), prog(t, .3, 1.1), 'center', 'rgba(15,20,32,.9)');

    // ---- mist erase back to paper ----
    if (t > C.mist) {
      const pat = ctx.createPattern(screenPaper, 'no-repeat');
      const layer = (t0, d, a, seed, off) => {
        const u = eo(prog(t, t0, d)); if (u <= 0) return;
        const Y = H + 240 + off - (H + 700 + off) * u;
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = pat;
        ctx.beginPath(); ctx.moveTo(0, H + 400);
        for (let x = 0; x <= W; x += 30) ctx.lineTo(x, Y + (vnoise(seed + x * .005 + t * .4) - .5) * 160 + Math.sin(x * .01 + t) * 30);
        ctx.lineTo(W, H + 400); ctx.closePath(); ctx.fill(); ctx.restore();
      };
      layer(C.mist, 2.6, .6, 3, 0);
      layer(C.mist + .45, 2.5, 1, 8, 120);
      handText('คืนที่สี่', W / 2, 900, 124, P.ink, .85, prog(t, C.endNote, 1.5), 'center');
      if (t > lastPrint.t) {
        ctx.save(); ctx.translate(560, 1330);
        drawPrint({ ...lastPrint, x: 0, y: 0 }, t, .9);
        ctx.restore();
      }
    }

    if (SUBS) subtitle(t);
  };

  // built after helpers that need region/scene
  var lanternOffWash = wash(R, blob(R, LX, LY, 60, 60, 16, .25), P.night, .8, 6);
  var wetLeader = mk(R, [[498, 752], [486, 772], [472, 792]], { w: 1.8, prof: 'even', col: P.amber, a: .85, nb: 0 });

  // ---------- events for the mixer ----------
  const EV = [];
  const brush = (el, n) => EV.push({ t: el.t0, type: 'brush', d: el.d, n });
  trees.forEach((tr) => brush(tr, 3)); brush(house, 6); brush(steps, 3); brush(water, 4); brush(reeds, 3); brush(slippers, 2); brush(boat, 2);
  EV.push({ t: .3, type: 'pencil', d: 1.1 }, { t: C.wetNote, type: 'pencil', d: 1.0 }, { t: C.pageNote, type: 'pencil', d: 1.4 },
    { t: C.pageNote + 1.5, type: 'pencil', d: 1.4 }, { t: C.pageNote + 3.2, type: 'pencil', d: 1.0 }, { t: C.endNote, type: 'pencil', d: 1.5 });
  EV.push({ t: C.lanternOn, type: 'ignite' }, { t: C.lanternOff, type: 'snuff' }, { t: C.hit - .2, type: 'flare' }, { t: C.hit, type: 'hit' },
    { t: C.hit + 1.0, type: 'creak' }, { t: C.mist, type: 'mist' }, { t: C.boat, type: 'boat', d: 4.4 });
  C.prints.forEach((t) => EV.push({ t, type: 'drip', g: .7 }));
  C.paperPrints.forEach((t, i) => EV.push({ t, type: 'drip', g: .8 + i * .05 }));
  EV.push({ t: C.lastPrint, type: 'drip', g: 1 });
  EV.sort((a, b) => a.t - b.t);
  window.EV = EV;
  // every readable text on screen at t (for core/render/readcheck.mjs)
  window.TEXTS = (t) => {
    const out = [];
    if (SUBS) for (const s of TL.subs) if (t >= s.t0 && t <= s.t1) {
      const n = s.text.split('/').length, yc = s.pos === 'high' ? 1210 : 1490;
      out.push({ id: 'sub' + s.t0, text: s.text.replace('/', ' '), x0: 90, x1: 990, y0: yc - n * 40, y1: yc + n * 40 });
    }
    if (t >= .3 && t < 5.2) out.push({ id: 'night3', text: 'คืนที่ ๓', x0: 340, x1: 740, y0: 300, y1: 430 });
    if (t >= C.endNote && t <= TL.dur) out.push({ id: 'night4', text: 'คืนที่สี่', x0: 300, x1: 780, y0: 780, y1: 940 });
    return out;
  };
  window.DUR = TL.dur;
  window.READY = true;
})().catch((e) => { console.error('init failed', e); window.INIT_ERROR = String(e && e.stack || e); });
