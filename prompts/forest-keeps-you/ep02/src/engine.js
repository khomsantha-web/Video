// Watercolor brush engine (original code for this film).
// Strokes = variable-width translucent ribbons + dashed bristle tracks (dry-brush "flying white").
// Washes = one polygon painted in 3 jittered passes (pooled edges). Everything is deterministic.
'use strict';

const E = {};

E.mulberry = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
E.hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
E.vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return E.hash(i) * (1 - u) + E.hash(i + 1) * u; };
E.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
E.lerp = (a, b, u) => a + (b - a) * u;
E.ss = (x) => { x = E.clamp(x); return x * x * (3 - 2 * x); };
E.eio = (x) => { x = E.clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
E.eo = (x) => 1 - Math.pow(1 - E.clamp(x), 3);
E.ei = (x) => Math.pow(E.clamp(x), 3);
E.prog = (t, t0, d) => E.clamp((t - t0) / d);

// keyframe track: [[t, v...], ...] with smooth (eio) easing between keys
E.track = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) { const u = E.eio((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => E.lerp(v, b[j + 1], u)); }
  }
  return keys[keys.length - 1].slice(1);
};

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
E.rgba = rgba;
E.hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Catmull-Rom resample to points ~step apart
function resample(pts, step) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) {
      const u = k / 12, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => .5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const out = [dense[0]]; let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    acc += d;
    if (acc >= step) { out.push(dense[i]); acc = 0; }
  }
  if (out.length < 2 || out[out.length - 1] !== dense[dense.length - 1]) out.push(dense[dense.length - 1]);
  return out;
}

const PROF = {
  brush: (u) => Math.pow(Math.sin(Math.PI * E.clamp(u * .92 + .04)), .55),
  tip: (u) => (1 - u * .85) * Math.pow(Math.min(1, u * 8), .5),
  leaf: (u) => Math.sin(Math.PI * u),
  even: (u) => Math.min(1, u * 10, (1 - u) * 10) * .9 + .1,
  trunk: (u) => 1 - u * .55,
};

// o: {w, prof, col:[r,g,b], a, nb, rough, step}
E.mk = (rng, pts, o) => {
  const w = o.w || 8, prof = PROF[o.prof || 'brush'], a = o.a ?? .6, nb = o.nb ?? 4, rough = o.rough ?? .22;
  const P = resample(pts, o.step || Math.max(1.5, w * .35));
  const n = P.length, L = [], R = [], N = [];
  const seed = rng() * 100;
  for (let i = 0; i < n; i++) {
    const a0 = P[Math.max(0, i - 1)], a1 = P[Math.min(n - 1, i + 1)];
    let tx = a1[0] - a0[0], ty = a1[1] - a0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = -ty, ny = tx; N.push([nx, ny]);
    const u = i / (n - 1);
    const wi = w * prof(u) * (1 + rough * (E.vnoise(seed + u * 7) * 2 - 1)) / 2;
    L.push([P[i][0] + nx * wi, P[i][1] + ny * wi]);
    R.push([P[i][0] - nx * wi, P[i][1] - ny * wi]);
  }
  const br = [];
  for (let b = 0; b < nb; b++) {
    const off = (rng() - .5) * .9 * w, end = .55 + rng() * .45;
    const pts2 = P.map((p, i) => [p[0] + N[i][0] * off * prof(i / (n - 1)), p[1] + N[i][1] * off * prof(i / (n - 1))]);
    br.push({ pts: pts2, end, lw: Math.max(.4, w * (.05 + rng() * .08)), al: a * (.3 + rng() * .55),
      dash: [w * (.6 + rng() * 3), w * (.15 + rng() * .8)], dof: rng() * 20 });
  }
  return { k: 's', P, L, R, br, col: o.col, a: nb ? a * .58 : a, n };
};

E.drawS = (ctx, S, p = 1, aMul = 1) => {
  if (p <= 0) return;
  const k = Math.max(1, Math.floor(E.clamp(p) * (S.n - 1)));
  ctx.fillStyle = rgba(S.col, S.a * aMul);
  ctx.beginPath();
  ctx.moveTo(S.L[0][0], S.L[0][1]);
  for (let i = 1; i <= k; i++) ctx.lineTo(S.L[i][0], S.L[i][1]);
  for (let i = k; i >= 0; i--) ctx.lineTo(S.R[i][0], S.R[i][1]);
  ctx.closePath(); ctx.fill();
  ctx.lineCap = 'round';
  for (const b of S.br) {
    const kb = Math.min(k, Math.floor(b.end * (S.n - 1)));
    if (kb < 1) continue;
    ctx.strokeStyle = rgba(S.col, b.al * aMul); ctx.lineWidth = b.lw;
    ctx.setLineDash(b.dash); ctx.lineDashOffset = b.dof;
    ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let i = 1; i <= kb; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
};

// wash: polygon -> 3 jittered passes
E.wash = (rng, poly, col, a, jit = 6) => {
  const passes = [];
  for (let k = 0; k < 3; k++) {
    const s = rng() * 50;
    passes.push(poly.map((p, i) => [p[0] + (E.vnoise(s + i * .7) - .5) * 2 * jit + (E.hash(s + i * 1.3) - .5) * jit * .6, p[1] + (E.vnoise(s + 9 + i * .7) - .5) * 2 * jit + (E.hash(s + 5 + i * 1.7) - .5) * jit * .6]));
  }
  let x0 = 1e9, x1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  return { k: 'w', passes, col, a, x0, x1, seed: rng() * 100 };
};

// p < 1: revealed by a wavy left-to-right brush edge
E.drawW = (ctx, W, p = 1, aMul = 1) => {
  if (p <= 0) return;
  if (p < 1) {
    ctx.save();
    const X = W.x0 - 40 + (W.x1 - W.x0 + 80) * p;
    ctx.beginPath(); ctx.moveTo(-5000, -5000); ctx.lineTo(X, -5000);
    for (let y = -2000; y <= 4000; y += 40) ctx.lineTo(X + (E.vnoise(W.seed + y * .02) - .5) * 60, y);
    ctx.lineTo(X, 5000); ctx.lineTo(-5000, 5000); ctx.closePath(); ctx.clip();
  }
  ctx.fillStyle = rgba(W.col, W.a / 3 * aMul);
  for (const poly of W.passes) {
    ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath(); ctx.fill();
  }
  if (p < 1) ctx.restore();
};

E.drawItem = (ctx, it, p, aMul) => it.k === 's' ? E.drawS(ctx, it, p, aMul) : E.drawW(ctx, it, p, aMul);

// list: each item takes a slice of progress, in order (structure before detail)
E.drawList = (ctx, items, p, aMul = 1) => {
  const N = items.length; if (!N || p <= 0) return;
  const sl = E.clamp(4 / N, .12, .5);
  for (let i = 0; i < N; i++) {
    const st = N === 1 ? 0 : i / (N - 1) * (1 - sl);
    const ip = E.clamp((p - st) / sl);
    if (ip > 0) E.drawItem(ctx, items[i], ip, aMul);
  }
};

// cache a finished list as a sprite (bbox in world units, K px per unit)
E.sprite = (items, bb, K) => {
  const c = document.createElement('canvas');
  c.width = Math.ceil(bb[2] * K); c.height = Math.ceil(bb[3] * K);
  const g = c.getContext('2d');
  g.setTransform(K, 0, 0, K, -bb[0] * K, -bb[1] * K);
  for (const it of items) E.drawItem(g, it, 1, 1);
  return c;
};

// circle-ish blob polygon
E.blob = (rng, cx, cy, rx, ry, n = 18, rough = .18, rot = 0) => {
  const s = rng() * 50, out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = 1 + (E.vnoise(s + i * .9) - .5) * 2 * rough;
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
};

window.E = E;
