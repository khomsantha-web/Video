// EP01 คำเตือนจากพราน — sets, camera, cast staging, subtitles. render(t) is a pure function of t.
'use strict';
(async function init() {
  const { mulberry, vnoise, clamp, lerp, ss, eo, eio, prog, track, rgba, hex, mk, drawS, wash, drawW, drawList, sprite, blob } = E;
  const TL = await (await fetch('timeline.json')).json();
  const C = TL.cues;
  const [W, H] = TL.size;
  const SUBS = new URLSearchParams(location.search).get('subs') !== '0';
  const cv = document.getElementById('c'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const P = {
    paper: hex('#e6e1cf'), ink: hex('#1b1a17'), sky: hex('#c3c7b7'), fog: hex('#b4baae'), fogDeep: hex('#5d675e'),
    dark: hex('#141a16'), forest: hex('#24302a'), mid: hex('#38473b'), moss: hex('#56664f'), far: hex('#73806f'),
    mud: hex('#64543f'), grass: hex('#4c5a40'), wood: hex('#4a3b2c'), red: hex('#94443a'), lamp: hex('#e08a2c'),
  };

  for (const [fam, url, range, weight] of [
    ['NotoSerifThai', 'fonts/NotoSerifThai-thai.woff2', 'U+0E01-0E5B, U+200C-200D, U+25CC', '500'],
    ['NotoSerifThai', 'fonts/NotoSerifThai-latin.woff2', 'U+0000-00FF, U+2000-206F', '500'],
    ['Charm', 'fonts/Charm-thai.woff2', 'U+0E01-0E5B, U+200C-200D, U+25CC', '700'],
    ['Charm', 'fonts/Charm-latin.woff2', 'U+0000-00FF, U+2000-206F', '700'],
  ]) { const f = new FontFace(fam, `url(${url})`, { unicodeRange: range, weight }); await f.load(); document.fonts.add(f); }

  // ---------- paper ----------
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
  }
  const paper = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, rng = mulberry(5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = noise2(x / 170, y / 170) * .5 + noise2(x / 45, y / 45 + 9) * .3 + noise2(x / 8, y / 8) * .2;
      const k = 1 + (n - .5) * .08 + (hash2(x, y) - .5) * .035, i = (y * W + x) * 4;
      d[i] = P.paper[0] * k; d[i + 1] = P.paper[1] * k; d[i + 2] = P.paper[2] * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 3200; i++) {
      const x = rng() * W, y = rng() * H, a = rng() * 6.3, l = 4 + rng() * 14;
      g.strokeStyle = rng() < .5 ? 'rgba(110,95,70,.07)' : 'rgba(255,252,240,.10)'; g.lineWidth = .6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  })();

  const R = mulberry(20261121);
  const rag = (x0, x1, y0, y1, amp, seed, st = 30) => {
    const pts = [];
    for (let x = x0; x <= x1; x += st) pts.push([x, y0 + (vnoise(seed + x * .013) - .5) * amp]);
    for (let x = x1; x >= x0; x -= st) pts.push([x, y1 + (vnoise(seed + 50 + x * .013) - .5) * amp]);
    return pts;
  };
  const cache = new Map();
  function drawEl(key, el, p, K, aMul = 1) {
    if (p <= 0) return;
    if (p >= 1) {
      let s = cache.get(key); if (!s) { s = sprite(el.items, el.bb, K); cache.set(key, s); }
      ctx.globalAlpha = aMul; ctx.drawImage(s, el.bb[0], el.bb[1], el.bb[2], el.bb[3]); ctx.globalAlpha = 1;
    } else drawList(ctx, el.items, p, aMul);
  }
  const mixc = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k)));
  function fogBand(t, x0, x1, yc, th, col, a, sp, seed) {
    ctx.fillStyle = rgba(col, a / 2);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      const tp = (x) => Math.sin(Math.PI * clamp((x - x0) / (x1 - x0))) ** .6;
      for (let x = x0; x <= x1; x += 20) ctx.lineTo(x, yc - th / 2 * tp(x) + (vnoise(seed + k * 7 + x * .005 + t * sp) - .5) * th * .9 * tp(x));
      for (let x = x1; x >= x0; x -= 20) ctx.lineTo(x, yc + th / 2 * tp(x) + (vnoise(seed + 20 + k * 7 + x * .005 + t * sp) - .5) * th * .9 * tp(x));
      ctx.closePath(); ctx.fill();
    }
  }
  const crown = (items, x, y, r, col, a) => {
    items.push(wash(R, blob(R, x, y, r, r * .78, 16, .22), col, a, r * .12));
    items.push(mk(R, [[x - r * .6, y - r * .1], [x, y - r * .45], [x + r * .5, y - r * .2]], { w: r * .35, prof: 'leaf', col: mixc(col, P.moss, .45), a: a * .5, nb: 5 }));
  };

  // ================= SET A: over the forest =================
  const A = { rows: [] };
  A.bg = [wash(R, rag(-200, 1200, -100, 640, 40, 1), P.sky, .9, 10), wash(R, rag(-200, 1200, 520, 700, 60, 2), P.far, .45, 12),
    wash(R, rag(-200, 1200, 600, 760, 50, 3), mixc(P.far, P.mid, .4), .5, 10), wash(R, rag(-200, 1200, 700, 2000, 50, 4), mixc(P.far, P.forest, .5), .85, 10),
    wash(R, rag(-200, 1200, 1100, 2000, 60, 5), P.forest, .8, 10)];
  for (let r = 0; r < 14; r++) {
    const y = 690 + r * (r + 6) * 6.5, rad = 24 + r * 8, items = [], k = r / 13;
    const col = mixc(mixc(P.far, P.forest, k), P.dark, k * .3);
    items.push(wash(R, rag(-200, 1200, y, y + rad * 2.2, rad * .4, 10 + r), col, .55 + k * .35, 6));
    for (let x = -180 + R() * rad; x < 1200; x += rad * (.7 + R() * .5)) crown(items, x, y + (R() - .5) * rad * .9, rad * (.8 + R() * .6), mixc(col, P.moss, R() * .25), .65 + k * .3);
    A.rows.push({ items, bb: [-220, y - rad * 2, 1440, rad * 4.6], t0: r < 5 ? -1 : (r - 5) * .16, d: .9 });
  }
  A.cam = track([[0, 430, 960, 1.0], [6, 600, 960, 1.05]]);
  function plane(x, y, s, a) {   // small twin-prop cargo plane, side view, no markings
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a;
    const g = hex('#cfd0c8'), d = hex('#5c6058');
    ctx.fillStyle = rgba(g, .95);
    ctx.beginPath(); ctx.moveTo(-60, -4); ctx.quadraticCurveTo(-52, -12, -30, -11); ctx.lineTo(48, -9); ctx.quadraticCurveTo(62, -6, 64, 0);
    ctx.quadraticCurveTo(60, 5, 46, 6); ctx.lineTo(-40, 6); ctx.quadraticCurveTo(-58, 4, -60, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-50, -9); ctx.lineTo(-64, -30); ctx.lineTo(-56, -30); ctx.lineTo(-38, -10); ctx.fill();   // tail fin
    ctx.fillStyle = rgba(d, .9); ctx.fillRect(-12, -14, 34, 4);                                                    // high wing
    ctx.fillStyle = rgba(d, .8); ctx.fillRect(2, -11, 9, 7);                                                       // engine
    ctx.fillStyle = rgba(d, .9); for (let i = 0; i < 5; i++) ctx.fillRect(28 + i * 5, -6, 3, 2.5);                 // windows
    ctx.strokeStyle = rgba(d, .35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(12, -7, 1.5, 9, 0, 0, 7); ctx.stroke();  // prop blur
    ctx.restore();
  }
  function drawA(t) {
    const [cx, cy, s] = A.cam(t);
    ctx.setTransform(s, 0, 0, s, W / 2 - cx * s, H / 2 - cy * s);
    for (const w of A.bg) drawW(ctx, w, 1);
    fogBand(t, -200, 1200, 640, 120, P.fog, .35, .06, 1);
    A.rows.forEach((row, i) => {
      drawEl('A' + i, row, prog(t, row.t0, row.d), 1);
      if (i % 4 === 1) fogBand(t, -200, 1200, 700 + i * (i + 6) * 6.5, 40 + i * 8, P.fog, .2, .05 + i * .01, 10 + i);
    });
    // the plane, then the fog bank it flies into
    const u = prog(t, C.planeIn, 5.4), px = lerp(-80, 1150, u), py = 560 - u * 30 + Math.sin(t * 1.3) * 3;
    plane(px, py, 2.4, 1 - ss((px - 760) / 260));
    ctx.fillStyle = rgba(P.fog, .0);
    for (let k = 0; k < 4; k++) fogBand(t, 700, 1250, 560 + k * 26, 150, P.fog, .32, .08, 30 + k);
  }

  // ================= SET B: the forest entrance =================
  const B = {};
  const wallTop = (x) => 420 + (vnoise(x * .012) - .5) * 120 + (vnoise(9 + x * .05) - .5) * 40;
  {
    const wall = []; for (let x = -200; x <= 1200; x += 20) wall.push([x, wallTop(x)]); wall.push([1200, 1270], [-200, 1270]);
    const items = [wash(R, rag(-200, 1200, -100, 900, 50, 4), P.sky, .85, 10), wash(R, wall, P.forest, 1, 8), wash(R, wall, P.forest, .7, 12)];
    for (let x = -180; x < 1200; x += 46 + R() * 30) crown(items, x, wallTop(x) + 10, 40 + R() * 40, P.forest, .85);
    for (let x = -170; x < 1200; x += 40 + R() * 50) {
      if (x > 400 && x < 600) continue;
      items.push(mk(R, [[x, 1268], [x + (R() - .5) * 20, 960], [x + (R() - .5) * 30, 640]], { w: 10 + R() * 22, prof: 'trunk', col: R() < .5 ? P.dark : P.mid, a: .75, nb: 5 }));
    }
    items.push(wash(R, blob(R, 500, 1150, 95, 140, 22, .22), hex('#0c100d'), 1, 10));   // the way in
    items.push(wash(R, blob(R, 502, 1170, 62, 100, 20, .2), hex('#060807'), .9, 8));
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i / 8 * .9); crown(items, 500 + Math.cos(a) * 120, 1110 + Math.sin(a) * 150, 34 + R() * 26, P.forest, .9); }
    for (let i = 0; i < 7; i++) { const x = 420 + R() * 160; items.push(mk(R, [[x, 990 + R() * 30], [x + (R() - .5) * 20, 1040 + R() * 50]], { w: 3, prof: 'tip', col: P.dark, a: .8, nb: 1 })); }
    B.wall = { items, bb: [-220, -120, 1440, 1420] };
    const g = [wash(R, rag(-200, 1200, 1230, 2300, 30, 6), P.grass, 1, 8),
      wash(R, [[452, 1238], [548, 1238], [790, 2300], [210, 2300]], P.mud, .95, 10)];
    for (let i = 0; i < 90; i++) {
      const y = 1240 + Math.pow(R(), 1.4) * 1000, x = -150 + R() * 1300, h = 10 + (y - 1240) * .06;
      if (Math.abs(x - 500) < 50 + (y - 1240) * .3) continue;
      g.push(mk(R, [[x, y], [x + (R() - .5) * h * .6, y - h]], { w: 2 + h * .12, prof: 'tip', col: R() < .5 ? P.moss : P.dark, a: .6, nb: 2 }));
    }
    for (let i = 0; i < 26; i++) { const y = 1260 + R() * 1000, sp = 50 + (y - 1240) * .27; g.push(mk(R, [[500 - sp + R() * sp * 2, y], [500 - sp + R() * sp * 2, y + 4]], { w: 6, prof: 'brush', col: hex('#3f3426'), a: .4, nb: 2 })); }
    B.ground = { items: g, bb: [-220, 1180, 1440, 1140] };
    // sign: ห้ามเข้า
    B.sign = { items: [mk(R, [[340, 1080], [343, 1262]], { w: 7, prof: 'even', col: P.wood, a: .95, nb: 3 }),
      wash(R, [[282, 1040], [398, 1036], [400, 1094], [284, 1098]], hex('#857559'), .95, 2),
      mk(R, [[286, 1092], [396, 1088]], { w: 3, prof: 'brush', col: hex('#3f3426'), a: .6, nb: 2 })], bb: [270, 1025, 140, 245] };
    // old shrine with faded red cloth (cloth strips are drawn per frame)
    B.shrine = { items: [mk(R, [[656, 1094], [657, 1262]], { w: 6, prof: 'even', col: P.wood, a: .95, nb: 3 }),
      wash(R, [[618, 1082], [696, 1084], [694, 1096], [620, 1094]], P.wood, 1, 1.5),
      wash(R, [[628, 1044], [684, 1047], [683, 1084], [629, 1083]], hex('#3a2f24'), 1, 1.5),
      wash(R, [[646, 1056], [664, 1057], [663, 1083], [647, 1083]], hex('#0e0c0a'), 1, 1),
      wash(R, [[612, 1050], [652, 1008], [700, 1052], [690, 1054], [652, 1022], [622, 1053]], hex('#2a2219'), 1, 2),
      mk(R, [[652, 1008], [654, 994]], { w: 2.5, prof: 'tip', col: hex('#2a2219'), a: 1, nb: 1 })], bb: [600, 985, 110, 285] };
  }
  B.cam = track([
    [5.9, 500, 1060, 1.0], [12.9, 500, 1100, 1.08], [15.5, 500, 1130, 1.65], [18.5, 520, 1120, 1.75],
    [21.5, 600, 1110, 2.25], [30.5, 610, 1105, 2.45], [33.5, 470, 1250, 1.3], [38, 500, 1170, 1.6], [44.5, 500, 1190, 1.4],
  ]);
  const sB = (y) => 3.3 * lerp(.48, 1, clamp((y - 1180) / 340, -.2, 1.2));
  const B0 = { niran: [300, 1520], kiet: [395, 1530], mali: [612, 1525], ton: [706, 1515], chai: [500, 1252] };
  // a walk from a to b between t0 and t1; phase from the distance walked (stride ≈ 26 world units at full scale)
  function walkSt(t, a, b, t0, t1) {
    const u = clamp((t - t0) / (t1 - t0)), e = u * u * (3 - 2 * u) * .3 + u * .7;
    const x = lerp(a[0], b[0], e), y = lerp(a[1], b[1], e);
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) * e;
    const walking = t > t0 && t < t1;
    return { x, y, walk: walking ? dist / 26 * Math.PI * (3.3 / sB(y)) * .5 : null, step: walking ? 1 : 0, u };
  }
  const ENTR = [502, 1186];
  function castB(t) {
    const out = [];
    const fadeIn = (k) => ss((t - 6.4 - k * .25) / .8);
    // Niran: map up in the group shot
    { const w = walkSt(t, B0.niran, [488, 1192], 38.8, 43.8);
      out.push(['niran', { ...w, s: sB(w.y), facing: 'back', map: t < 38.6 ? ss((t - 7.4) / .6) * (1 - ss((t - 12.5) / .6)) : 0, armL: 0, fade: fadeIn(0) * (1 - ss((1205 - w.y) / 18)), dark: clamp((1265 - w.y) / 75) }]); }
    // Kiet: laughs, touches his cap, raises his phone, walks in first
    { const w = walkSt(t, B0.kiet, ENTR, C.kietWalk, 38.7);
      const laugh = t > C.kietLaugh && t < C.kietLaugh + 1.5 ? 1 - ss((t - C.kietLaugh - 1.1) / .4) : 0;
      const cap = ss((t - 32.6) / .3) * (1 - ss((t - 33.4) / .3));
      const ph = ss((t - C.kietPhone) / .35) * (1 - ss((t - 37.6) / .4));
      out.push(['kiet', { ...w, s: sB(w.y), facing: 'back', shake: laugh, arm: Math.max(cap * .62, ph * .78), phone: ph, t, fade: fadeIn(1) * (1 - ss((1200 - w.y) / 16)), dark: clamp((1265 - w.y) / 75) }]); }
    { const w = walkSt(t, B0.mali, [514, 1194], 39.3, 44.1);
      out.push(['mali', { ...w, s: sB(w.y), facing: 'back', radio: true, armL: t < 38 ? ss((t - 8.4) / .5) * .8 * (1 - ss((t - 11.6) / .5)) : 0, fade: fadeIn(2) * (1 - ss((1208 - w.y) / 18)), dark: clamp((1265 - w.y) / 75) }]); }
    { const w = walkSt(t, B0.ton, [498, 1196], 39.7, 44.45);
      out.push(['ton', { ...w, s: sB(w.y), facing: 'back', look: t < 38 ? .5 * ss((t - 9) / 1) : 0, fade: fadeIn(3) * (1 - ss((1210 - w.y) / 18)), dark: clamp((1265 - w.y) / 75) }]); }
    // Chai: faces the group, raises his hand, points the way; then turns and leads the way in
    { const w = walkSt(t, B0.chai, [503, 1182], 38.4, 41.2);
      const hand = ss((t - C.chaiHand) / .5) * (1 - ss((t - 18.2) / .5));
      const point = ss((t - C.chaiPoint) / .5) * (1 - ss((t - 25.6) / .6)) * .55;
      out.push(['chai', { ...w, s: sB(w.y), facing: t < 38.25 ? 'front' : 'back', arm: Math.max(hand, point), lampOn: 1, fade: ss((t - 6.3) / .8) * (1 - ss((1195 - w.y) / 12)), dark: clamp((1262 - w.y) / 70) * .85 }]); }
    return out.sort((a, b) => a[1].y - b[1].y);
  }
  function drawB(t) {
    const [cx, cy, s] = B.cam(t);
    const p = prog(t, 5.9, 1.9);
    ctx.setTransform(s, 0, 0, s, W / 2 - cx * s, H / 2 - cy * s);
    drawEl('Bw', B.wall, p, 1.2);
    drawEl('Bg', B.ground, prog(t, 6.1, 1.7), 1.0);
    drawEl('Bsign', B.sign, prog(t, 6.9, .8), 3);
    drawEl('Bshrine', B.shrine, prog(t, 7.2, .8), 3);
    if (t > 7.6) {   // ห้ามเข้า + flapping cloth
      ctx.save(); ctx.translate(341, 1068); ctx.rotate(-.03); ctx.font = '500 27px NotoSerifThai'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(P.red, .8 * ss((t - 7.6) / .6)); ctx.fillText('ห้ามเข้า', 0, 0); ctx.fillStyle = rgba(P.red, .3); ctx.fillText('ห้ามเข้า', 1, 1.5); ctx.restore();
      const wind = t > 18.5 && t < 31 ? 1 : .4;
      for (let i = 0; i < 3; i++) {
        const x = 624 + i * 30, L = 34 - i * 5;
        const sw = wind * (Math.sin(t * (5 + i) + i) * 7 + (vnoise(t * 3 + i * 5) - .5) * 10);
        drawS(ctx, mk(mulberry(70 + i), [[x, 1049], [x + sw * .4 + 2, 1049 + L * .5], [x + sw, 1049 + L]], { w: 4.5, prof: 'tip', col: P.red, a: .8, nb: 2 }), ss((t - 7.6) / .6));
      }
    }
    for (let k = 0; k < 3; k++) fogBand(t, 200 - k * 80, 800 + k * 80, 1195 + k * 25, 90 + k * 30, P.fog, (.07 + .08 * ss((t - 13.5) / 2) * (1 - ss((t - 31) / 2))), .15 + k * .05, 3 + k);   // fog flowing out
    const lights = [];
    for (const [id, st] of castB(t)) lights.push(...drawFigure(ctx, id, st));
    fogBand(t, -200, 1200, 1150, 110, P.fog, .16, .05, 7);
    return { lights, s, cx, cy };
  }

  // ================= SET D: inside the forest =================
  const D = {};
  {
    const items = [wash(R, [[-200, -200], [1200, -200], [1200, 3400], [-200, 3400]], hex('#2b362e'), 1, 0)];
    items.push(wash(R, blob(R, 500, 230, 230, 300, 22, .2), P.paper, .9, 18));                          // the gap in the canopy
    items.push(wash(R, blob(R, 500, 250, 190, 260, 22, .2), hex('#d3d5ca'), .55, 14));
    for (let i = 0; i < 14; i++) { const x = -150 + R() * 1300, lean = (R() - .5) * 120; items.push(mk(R, [[x, 3300], [x + lean * .4 + (R() - .5) * 40, 1700], [x + lean, 300 + R() * 500]], { w: 6 + R() * 26, prof: 'trunk', col: R() < .5 ? P.far : mixc(P.far, P.mid, .5), a: .28 + R() * .2, nb: 4 })); }
    items.push(wash(R, rag(-200, 1200, 1500, 2300, 120, 8), P.fog, .22, 20));
    D.bg = { items, bb: [-220, -220, 1440, 3640] };
    const near = [];
    for (const [x, w] of [[-70, 150], [140, 64], [300, 26], [790, 44], [930, 110], [1080, 160]]) {
      near.push(mk(R, [[x, 3320], [x + (R() - .5) * 30, 1800], [x + (R() - .5) * 60, 200]], { w, prof: 'trunk', col: w > 60 ? P.dark : P.forest, a: .9, nb: 8 }));
      near.push(mk(R, [[x - w * .3, 3300], [x - w * .3 + (R() - .5) * 20, 600]], { w: w * .18, prof: 'even', col: P.moss, a: .25, nb: 3 }));
    }
    for (let i = 0; i < 12; i++) { const x = R() * 1000, y0 = 300 + R() * 600, L = 300 + R() * 700; near.push(mk(R, [[x, y0], [x + (R() - .5) * 60, y0 + L * .5], [x + (R() - .5) * 40, y0 + L]], { w: 3, prof: 'tip', col: P.dark, a: .6, nb: 1 })); }
    near.push(wash(R, rag(-200, 1200, 2780, 3400, 40, 9), hex('#211c16'), 1, 8));
    near.push(wash(R, [[440, 2790], [560, 2790], [700, 3400], [300, 3400]], hex('#3d3426'), .8, 8));
    D.near = { items: near, bb: [-220, 150, 1440, 3300] };
    D.canopy = [];
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, r0 = 1;
      let x = 500 + Math.cos(a) * (260 + R() * 600), y = 230 + Math.sin(a) * (330 + R() * 500);
      if (y > 1000) y = 1000 - R() * 300;
      const items = []; crown(items, x, y, 70 + R() * 90, R() < .5 ? P.forest : P.dark, .9);
      D.canopy.push({ items, bb: [x - 180, y - 170, 360, 340], ph: R() * 6, x, y });
    }
  }
  D.cam = track([[44.4, 500, 2380, 1.0], [48, 500, 2360, 1.0], [53, 500, 960, 1.04], [55, 500, 940, 1.05]]);
  const sD = (y) => 3.1 * lerp(.84, 1, clamp((y - 2800) / 110));
  const D0 = [['chai', 520, 2790], ['kiet', 640, 2815], ['niran', 380, 2850], ['mali', 590, 2885], ['ton', 445, 2905]];
  function castD(t) {
    const out = [];
    D0.forEach(([id, x, y], i) => {
      const u = clamp((t - 44.3) / (C.stop - 44.3 + i * .1)), yy = y + 46 * (1 - eo(u));
      const walking = u < 1;
      const look = ss((t - C.lookUp - i * .22) / .7);
      const st = { x: x + Math.sin(i * 2) * 3, y: yy, s: sD(y), facing: 'back', walk: walking ? (t - 44) * 6.2 + i : null, step: walking ? 1 - u : 0,
        look, lean: 0, radio: true, lampOn: 1, dark: .35, darkCol: hex('#101512') };
      if (id === 'chai') st.arm = ss((t - C.handUp) / .45) * (1 - ss((t - 49) / .8));
      out.push([id, st]);
    });
    return out.sort((a, b) => a[1].y - b[1].y);
  }
  function drawD(t) {
    const [cx, cy, s] = D.cam(t);
    ctx.setTransform(s, 0, 0, s, W / 2 - cx * s, H / 2 - cy * s);
    const p = prog(t, 44.3, 1.4);
    drawEl('Dbg', D.bg, 1, .5);
    const shakeAmp = .004 + .03 * ss((t - 47) / 1.2) * (1 - ss((t - 52.4) / 1.2));
    D.canopy.forEach((c, i) => {
      const sk = shakeAmp * (Math.sin(t * 7 + c.ph) + .5 * Math.sin(t * 13 + c.ph * 2));
      ctx.save(); ctx.translate(c.x, c.y); ctx.transform(1, 0, sk, 1, 0, 0); ctx.rotate(sk * .6); ctx.translate(-c.x, -c.y);
      drawEl('Dc' + i, c, 1, 1); ctx.restore();
    });
    fogBand(t, -200, 1200, 1900, 260, P.fog, .16, .04, 12);
    drawEl('Dn', D.near, p, .6);
    fogBand(t, -200, 1200, 2700, 160, P.fog, .14, .05, 14);
    const lights = [];
    for (const [id, st] of castD(t)) lights.push(...drawFigure(ctx, id, st));
    fogBand(t, -200, 1200, 2960, 120, P.fog, .12, .06, 16);
    return { lights, s, cx, cy };
  }

  // ---------- subtitles ----------
  const SPK = { chai: CAST.chai.dot, kiet: CAST.kiet.dot };
  function subtitle(t) {
    for (const s of TL.subs) {
      if (t < s.t0 - .01 || t > s.t1 + .01) continue;
      const a = Math.min(s.t0 < .05 ? 1 : ss((t - s.t0) / .25), ss((s.t1 - t) / .25));
      const txt = s.spk ? `“${s.text}”` : s.text, y = 1585;
      ctx.save(); ctx.font = '500 56px NotoSerifThai'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width, x = W / 2 + (s.spk ? 18 : 0);
      ctx.shadowColor = rgba(P.paper, .95 * a); ctx.shadowBlur = 34; ctx.strokeStyle = rgba(P.paper, .62 * a); ctx.lineWidth = 14; ctx.lineJoin = 'round';
      ctx.strokeText(txt, x, y); ctx.strokeText(txt, x, y); ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(P.ink, .92 * a); ctx.fillText(txt, x, y);
      if (s.spk) {   // speaker dot in the colour of the speaker's Continuity Lock
        const dx = x - w / 2 - 30;
        ctx.fillStyle = rgba(P.paper, .8 * a); ctx.beginPath(); ctx.arc(dx, y, 17, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(SPK[s.spk], a); ctx.beginPath(); ctx.arc(dx, y, 12, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  function glow(L, s, cx, cy, scaleK = 1) {
    const X = W / 2 + (L.x - cx) * s, Y = H / 2 + (L.y - cy) * s, r = L.r * s * scaleK;
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, rgba(L.c, .55 * L.k)); g.addColorStop(.3, rgba(L.c, .22 * L.k)); g.addColorStop(1, rgba(L.c, 0));
    ctx.fillStyle = g; ctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
  }

  function cover(t, tc, upTo, col) {   // fog that fills the frame and clears (scene change inside the medium)
    const k = ss((t - (tc - .7)) / .7) * (1 - ss((t - (tc + .25)) / .9));
    if (k <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(col, k * .92); ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rgba(mixc(col, P.paper, .3), k * .3);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, i * 420 + (vnoise(i * 9 + x * .004 + t * .4) - .5) * 300);
      for (let x = W; x >= 0; x -= 40) ctx.lineTo(x, i * 420 + 260 + (vnoise(i * 9 + 40 + x * .004 + t * .4) - .5) * 300);
      ctx.fill();
    }
  }

  // ---------- render ----------
  window.render = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(paper, 0, 0);
    let r = null;
    if (t < C.fogAB) drawA(t);
    else if (t < C.fogBD) r = drawB(t);
    else r = drawD(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // paper grain through the paint
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .5; ctx.drawImage(paper, 0, 0); ctx.restore();
    // light: the forest swallows the daylight as they walk in; inside it stays dim
    let dim = 0;
    if (t >= C.fogAB && t < C.fogBD) dim = .12 + .5 * ss((t - 40) / 4.5);
    if (t >= C.fogBD) dim = .38;
    if (dim > 0) {
      const g = ctx.createRadialGradient(W / 2, H * .55, 200, W / 2, H * .55, 1300);
      g.addColorStop(0, rgba([12, 18, 14], dim * .7)); g.addColorStop(1, rgba([8, 12, 10], Math.min(.95, dim * 1.35)));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (r) for (const L of r.lights) glow(L, r.s, r.cx, r.cy, L.r > 30 ? 2.2 : 3);
    cover(t, C.fogAB, 0, P.fog);
    cover(t, C.fogBD, 0, P.fogDeep);
    if (SUBS) subtitle(t);
    // the end: black, silent
    const bk = ss((t - (C.black - .4)) / .4);
    if (bk > 0) { ctx.fillStyle = `rgba(0,0,0,${bk})`; ctx.fillRect(0, 0, W, H); }
  };

  // ---------- events for the mixer ----------
  const EV = [{ t: 0, type: 'brush', d: 2, n: 5 }, { t: 5.9, type: 'brush', d: 2, n: 6 }, { t: 44.3, type: 'brush', d: 1.4, n: 3 },
    { t: 7.4, type: 'map' }, { t: 8.5, type: 'radio' }, { t: 20.5, type: 'creak' }, { t: 26.2, type: 'creak' }];
  // footsteps: every half-cycle of each walking figure
  for (const [castFn, t0, t1] of [[castB, 35, 44.5], [castD, 44.5, 45.6]]) {
    const last = {};
    for (let t = t0; t < t1; t += 1 / 60) {
      for (const [id, st] of castFn(t)) {
        if (st.walk == null || (st.fade ?? 1) < .2) { last[id] = null; continue; }
        const k = Math.floor(st.walk / Math.PI);
        if (last[id] != null && k !== last[id]) EV.push({ t: +t.toFixed(3), type: 'step', g: clamp(st.s / 3.3, .4, 1) * (castFn === castD ? .8 : 1), pan: clamp((st.x - 500) / 400, -.8, .8) });
        last[id] = k;
      }
    }
  }
  EV.sort((a, b) => a.t - b.t);
  window.EV = EV;
  window.TEXTS = (t) => SUBS ? TL.subs.filter((s) => t >= s.t0 && t <= s.t1).map((s) => ({ id: 'sub' + s.t0, text: s.text, x0: 80, x1: 1000, y0: 1545, y1: 1625 })) : [];
  window.DUR = TL.dur;
  window.READY = true;
})().catch((e) => { console.error('init failed', e); window.INIT_ERROR = String(e && e.stack || e); });
