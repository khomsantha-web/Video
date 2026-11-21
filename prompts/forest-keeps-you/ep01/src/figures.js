// Character rig for "ป่าที่ไม่ยอมให้ใครกลับ": watercolor figures, no faces.
// Each character is told apart only by the Continuity Lock (jacket colour, hat, bag, light, prop).
// Local units: feet at (0,0), head top at y = -100. Drawn with a fixed seed per character, so strokes don't boil.
'use strict';
(function () {
  const { mulberry, mk, drawS, wash, drawW, hex, rgba, lerp, clamp, vnoise } = E;

  const C = {
    skin: hex('#3b2d25'), hair: hex('#1e1915'), pants: hex('#2c2a28'), boots: hex('#1a1714'),
    paper: hex('#e6e1cf'), lamp: hex('#e08a2c'),
  };
  // Continuity Lock
  const CAST = {
    niran: { seed: 11, jacket: hex('#2f4a36'), pack: hex('#6b4a2e'), packSize: 1, light: [235, 235, 225], dot: hex('#3f6a4a') },
    kiet:  { seed: 23, jacket: hex('#8a3b32'), cap: hex('#3a3431'), bag: hex('#4a3b2f'), light: [240, 205, 90], dot: hex('#a8463b') },
    mali:  { seed: 37, jacket: hex('#b8963c'), scarf: true, smallBag: hex('#5a4a38'), radio: true, dot: hex('#c9a640') },
    ton:   { seed: 41, jacket: hex('#5d7a94'), pack: hex('#3e4a52'), packSize: .7, headlamp: true, dot: hex('#6f90ad') },
    chai:  { seed: 53, jacket: hex('#4a3626'), sash: hex('#7a5a3a'), oldHat: hex('#3b3026'), gun: true, lantern: true, coat: true, dot: hex('#e08a2c') },
  };

  const LOOK2 = ['2', '3'].includes(new URLSearchParams(location.search).get('look'));
  const mix = (c, d, k) => [Math.round(lerp(c[0], d[0], k)), Math.round(lerp(c[1], d[1], k)), Math.round(lerp(c[2], d[2], k))];

  // st: {x, y, s (world units per local unit), facing:'back'|'front', walk (phase, radians) or null, step (0..1 amplitude),
  //      arm (right arm raise 0..1), armL (left arm forward 0..1), look (0..1 look up), shake (0..1), dark (0..1), fade (alpha), lampOn (0..1)}
  function drawFigure(ctx, id, st) {
    const f = CAST[id];
    const R = mulberry(f.seed);
    const dk = st.dark || 0, DARK = st.darkCol || hex('#141a16');
    const boost = (c) => { const g = (c[0] + c[1] + c[2]) / 3; return c.map((v) => Math.max(0, Math.min(255, Math.round((g + (v - g) * 1.5) * 1.18)))); };
    const col = (c) => LOOK2 ? boost(mix(c, DARK, dk)) : mix(c, DARK, dk);
    const a = st.fade ?? 1;
    if (a <= 0) return [];
    const front = st.facing === 'front';
    ctx.save();
    ctx.translate(st.x, st.y); ctx.scale(st.s, st.s);
    ctx.globalAlpha = a;

    const wp = st.walk, amp = st.walk == null ? 0 : (st.step ?? 1);
    const sw = st.walk == null ? 0 : Math.sin(wp);
    const bob = -Math.abs(sw) * 1.4 * amp;
    const shake = (st.shake || 0) * Math.sin((st.t || 0) * 38) * 1.2;
    const lookUp = st.look || 0;
    ctx.translate(0, bob);

    // legs (back/front view: the walking leg rises and shortens)
    const hipY = -46;
    for (const side of [-1, 1]) {
      const ph = side * sw * amp;
      const fx = side * 7.5 + ph * 1.5, fy = -Math.max(0, ph) * 4.5;
      drawS(ctx, mk(R, [[side * 6, hipY], [side * 6.8 + ph * .6, hipY + 22 + fy * .4], [fx, fy - 1]], { w: 7.2, prof: 'even', col: col(C.pants), a: .95, nb: 2, rough: .08 }), 1);
      drawW(ctx, wash(R, [[fx - 4, fy - 3], [fx + 4.5, fy - 3], [fx + 5, fy + .8], [fx - 4.5, fy + .8]], col(C.boots), 1, .5), 1);
    }
    // long coat (Chai) reaches below the hips
    const torsoBottom = f.coat ? -30 : -45;
    const sx = shake;
    // opaque under-layer so a figure never reads as a ghost against dark ground
    ctx.fillStyle = rgba(col(f.jacket), .75);
    ctx.beginPath(); ctx.moveTo(-14 + sx, -78.5); ctx.lineTo(14 + sx, -78.5); ctx.lineTo(f.coat ? 13.5 : 11, torsoBottom); ctx.lineTo(f.coat ? -13.5 : -11, torsoBottom); ctx.closePath(); ctx.fill();
    if (LOOK2) { ctx.strokeStyle = rgba(hex('#0b0d0a'), .9); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); }
    drawW(ctx, wash(R, [[-14.5 + sx, -79], [14.5 + sx, -79], [f.coat ? 14 : 11.5, torsoBottom], [f.coat ? -14 : -11.5, torsoBottom]], col(f.jacket), 1, .9), 1);
    drawS(ctx, mk(R, [[-12 + sx, -78], [-10, -60], [-11, torsoBottom + 2]], { w: 3, prof: 'brush', col: col(mix(f.jacket, C.hair, .5)), a: .5, nb: 2 }), 1);
    if (f.sash) drawS(ctx, mk(R, [[-12, -50], [0, -49], [12, -50]], { w: 3.5, prof: 'even', col: col(f.sash), a: .9, nb: 2 }), 1);

    // back items (drawn over the torso when seen from behind)
    if (!front) {
      if (f.pack) { const k = f.packSize; drawW(ctx, wash(R, [[-10 * k + sx, -77], [10 * k + sx, -77], [10.5 * k, -77 + 26 * k], [-10.5 * k, -77 + 26 * k]], col(f.pack), 1, .6), 1); }
      if (f.smallBag) drawW(ctx, wash(R, [[-6 + sx, -70], [6 + sx, -70], [6, -58], [-6, -58]], col(f.smallBag), .95, .4), 1);
      if (f.gun) drawS(ctx, mk(R, [[-13 + sx, -86], [0, -62], [12, -36]], { w: 2.4, prof: 'even', col: col(hex('#241d17')), a: 1, nb: 1 }), 1);
    }
    if (f.bag) {   // shoulder bag: strap across, bag at the left hip
      drawS(ctx, mk(R, [[11 + sx, -78], [0, -62], [-11, -50]], { w: 2, prof: 'even', col: col(f.bag), a: .9, nb: 1 }), 1);
      const bx = -13 + sw * amp * 1.5;
      drawW(ctx, wash(R, [[bx - 6, -54], [bx + 5, -54], [bx + 5, -42], [bx - 6, -42]], col(f.bag), 1, .5), 1);
    }

    // arms
    const arm = (side, raise, fwd, reach = 0) => {
      const sxp = side * 14 + sx, sy = -76;
      let hx = side * 16 - side * sw * amp * 1.2, hy = -47;
      if (raise > 0) { hx = lerp(hx, side * 21, raise); hy = lerp(hy, -103, raise); }
      if (fwd > 0) { hx = lerp(hx, side * 7, fwd); hy = lerp(hy, -62, fwd); }
      if (reach) { hx = lerp(hx, side * 46 * Math.sign(reach), Math.abs(reach)); hy = lerp(hy, -66, Math.abs(reach)); }
      const ex = lerp(side * 18, side * 23, raise) - fwd * side * 4, ey = lerp(-61, -88, raise) + fwd * 2;
      drawS(ctx, mk(R, [[sxp, sy], [ex, ey], [hx, hy]], { w: 5.6, prof: 'even', col: col(f.jacket), a: .95, nb: 2, rough: .08 }), 1);
      drawW(ctx, wash(R, [[hx - 2.4, hy - 2.4], [hx + 2.4, hy - 2.4], [hx + 2.4, hy + 2.6], [hx - 2.4, hy + 2.6]], col(C.skin), .95, .3), 1);
      return [hx, hy];
    };
    const handL = arm(-1, 0, st.armL || 0);
    const handR = arm(1, st.arm || 0, 0, st.reach || 0);

    // neck, head (no face: hair from behind; from the front the face sits in the hat's shadow)
    const hy = -88 - lookUp * 1.5, hx = sx + (st.lean || 0);
    drawW(ctx, wash(R, [[-3 + hx, -82], [3 + hx, -82], [3 + hx, -77], [-3 + hx, -77]], col(C.skin), 1, .3), 1);
    drawW(ctx, wash(R, E.blob(R, hx, hy, 7, 8.6 * (1 - lookUp * .12), 14, .06), col(front ? C.skin : C.hair), 1, .4), 1);
    if (front) drawW(ctx, wash(R, E.blob(R, hx, hy - 3, 7.2, 5.5, 12, .06), col(C.hair), .9, .3), 1);
    if (LOOK2) { ctx.strokeStyle = rgba(hex('#0b0d0a'), .85); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(hx, hy, 7, 8.6, 0, 0, 7); ctx.stroke(); }
    if (f.scarf) drawS(ctx, mk(R, [[-6 + hx, -79], [0 + hx, -77.5], [6 + hx, -79]], { w: 4.2, prof: 'even', col: col(C.paper), a: .95, nb: 1 }), 1);
    if (f.cap) {
      drawW(ctx, wash(R, E.blob(R, hx, hy - 4.5, 7.6, 4.6, 12, .05), col(f.cap), 1, .3), 1);
      if (front) drawS(ctx, mk(R, [[hx - 7, hy - 1], [hx + 9, hy - 1]], { w: 2.4, prof: 'even', col: col(f.cap), a: 1, nb: 0 }), 1);
    }
    if (f.oldHat) {
      drawS(ctx, mk(R, [[hx - 14, hy - 3], [hx, hy - 4.5], [hx + 14, hy - 3]], { w: 2.6, prof: 'brush', col: col(f.oldHat), a: 1, nb: 2 }), 1);
      drawW(ctx, wash(R, [[hx - 7, hy - 4], [hx + 7, hy - 4], [hx + 6, hy - 11], [hx - 6, hy - 11]], col(f.oldHat), 1, .4), 1);
      if (front) drawW(ctx, wash(R, [[hx - 7, hy - 3], [hx + 7, hy - 3], [hx + 6.5, hy + 4], [hx - 6.5, hy + 4]], col(C.hair), .55, .5), 1);
    }
    if (f.headlamp) {
      drawS(ctx, mk(R, [[hx - 7, hy - 2], [hx, hy - 1.2], [hx + 7, hy - 2]], { w: 1.6, prof: 'even', col: col(hex('#222')), a: .9, nb: 0 }), 1);
    }

    // hand props (drawn last, so the stroke seeds above never shift)
    const lightCtx = [];
    if (f.lantern) {   // Chai's orange lantern, left hand
      const [lx, ly] = handL, ly2 = ly + 7;
      drawS(ctx, mk(R, [[lx, ly], [lx, ly2 - 4]], { w: .9, prof: 'even', col: col(C.hair), a: 1, nb: 0 }), 1);
      drawW(ctx, wash(R, [[lx - 3.4, ly2 - 4], [lx + 3.4, ly2 - 4], [lx + 4, ly2 + 4], [lx - 4, ly2 + 4]], st.lampOn ? C.lamp : col(hex('#5a4630')), 1, .3), 1);
      lightCtx.push({ x: lx, y: ly2, c: C.lamp, r: 46, k: st.lampOn ?? 1 });
    }
    if (f.radio && st.radio) {
      const [rx, ry] = handL;
      drawW(ctx, wash(R, [[rx - 2.2, ry - 6], [rx + 2.2, ry - 6], [rx + 2.2, ry + 2], [rx - 2.2, ry + 2]], col(hex('#1d1d1f')), 1, .2), 1);
      drawS(ctx, mk(R, [[rx + 1.2, ry - 6], [rx + 1.6, ry - 13]], { w: .8, prof: 'even', col: col(hex('#1d1d1f')), a: 1, nb: 0 }), 1);
    }
    if (id === 'niran' && st.map) {   // open map held in front: the edges show past the body
      drawW(ctx, wash(R, [[-21, -70], [21, -70], [22, -54], [-22, -54]], col(hex('#d8cfb0')), .95 * st.map, .6), 1);
    }
    if (id === 'niran' && st.torch) {   // white flashlight in the right hand
      const [tx, ty] = handR;
      drawW(ctx, wash(R, [[tx - 1.6, ty - 6], [tx + 1.6, ty - 6], [tx + 1.6, ty + 2], [tx - 1.6, ty + 2]], col(hex('#2a2a2c')), 1, .2), 1);
      lightCtx.push({ x: tx, y: ty - 6, c: [235, 235, 225], r: 14, k: st.torch });
    }
    if (id === 'kiet' && st.phone) {   // phone raised in the right hand, screen glow
      const [px, py] = handR;
      drawW(ctx, wash(R, [[px - 2.6, py - 7], [px + 2.6, py - 7], [px + 2.6, py + 1], [px - 2.6, py + 1]], col(hex('#18181a')), 1, .2), 1);
      lightCtx.push({ x: px, y: py - 3, c: [200, 220, 235], r: 16, k: st.phone });
    }
    if (f.headlamp) st.headOut = { x: st.x + hx * st.s, y: st.y + (hy - 2 + bob) * st.s };
    if (f.headlamp && front && st.lampOn) lightCtx.push({ x: hx, y: hy - 2, c: [235, 235, 220], r: 14, k: st.lampOn });
    ctx.restore();
    // lights in world space (returned so the caller can add glow after the darkness layers)
    return lightCtx.map((L) => ({ x: st.x + L.x * st.s, y: st.y + (L.y + bob) * st.s, r: L.r * st.s, c: L.c, k: L.k * a }));
  }

  window.CAST = CAST;
  window.drawFigure = drawFigure;
})();
