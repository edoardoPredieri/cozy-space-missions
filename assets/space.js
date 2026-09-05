/* Cozy Space Missions — two zoomable pictures of where we are:
   a logarithmic ladder of distances from Earth, and the solar system from above.

   Both figures share one small viewer: buttons and presets are the primary
   controls, drag pans with a mouse, ctrl/⌘ + wheel (or a trackpad pinch) zooms,
   and the canvas is focusable so arrows pan and + / − / 0 work from the keyboard.
   Dragging is never the only way to do anything. */

(function () {
  'use strict';

  var CSM = window.CSM, A = window.ASTRO;
  var $ = function (id) { return document.getElementById(id); };
  var AU = A.AU;                       // km in one astronomical unit
  var R_EARTH = A.R_EARTH;

  /* ================================================================== */
  /*  A tiny viewer: sizing, pointer handling, controls                  */
  /* ================================================================== */

  function makeViewer(canvasId, controlsId, opts) {
    var cv = $(canvasId), ctx = cv.getContext('2d');
    var box = $(controlsId);
    var W = 0, H = 0;
    var dragging = null;
    var pointers = {};
    var pinchStart = null;

    var view = {
      canvas: cv, ctx: ctx,
      get W() { return W; }, get H() { return H; },
      preset: null
    };

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = cv.getBoundingClientRect();
      W = Math.max(260, Math.round(rect.width));
      H = Math.max(160, Math.round(rect.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      opts.draw(view);
    }

    function redraw() { opts.draw(view); }

    function applyPreset(name) {
      var p = opts.presets[name];
      if (!p) return;
      view.preset = name;
      opts.setPreset(view, p);
      syncButtons();
      redraw();
    }

    function markCustom() {
      if (view.preset !== null) { view.preset = null; syncButtons(); }
    }

    function syncButtons() {
      var btns = box.querySelectorAll('[data-preset]');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-preset') === view.preset;
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        btns[i].classList.toggle('is-on', on);
      }
      var label = box.querySelector('.zoom-label');
      if (label) label.textContent = opts.readout(view);
    }

    /* --- controls --- */

    box.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-preset')) { applyPreset(b.getAttribute('data-preset')); return; }
      var z = b.getAttribute('data-zoom');
      if (z === 'in' || z === 'out') {
        opts.zoomBy(view, z === 'in' ? 1 / 1.6 : 1.6, W / 2, H / 2);
        markCustom(); syncButtons(); redraw();
      }
    });

    /* --- pointer: drag to pan (mouse and pen), pinch to zoom (touch) --- */

    cv.addEventListener('pointerdown', function (ev) {
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY, type: ev.pointerType };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        dragging = null;
        return;
      }
      if (ev.pointerType === 'touch') return;   // one finger keeps scrolling the page
      dragging = { x: ev.clientX, y: ev.clientY };
      cv.setPointerCapture(ev.pointerId);
      cv.classList.add('is-grabbing');
    });

    cv.addEventListener('pointermove', function (ev) {
      if (!pointers[ev.pointerId]) return;
      pointers[ev.pointerId].x = ev.clientX;
      pointers[ev.pointerId].y = ev.clientY;

      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinchStart) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        var f = pinchStart / d;
        if (Math.abs(Math.log(f)) > 0.02) {
          var r = cv.getBoundingClientRect();
          opts.zoomBy(view, f, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
          pinchStart = d;
          markCustom(); syncButtons(); redraw();
        }
        ev.preventDefault();
        return;
      }

      if (!dragging) return;
      opts.panBy(view, ev.clientX - dragging.x, ev.clientY - dragging.y);
      dragging.x = ev.clientX; dragging.y = ev.clientY;
      markCustom(); syncButtons(); redraw();
    });

    function endPointer(ev) {
      delete pointers[ev.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      dragging = null;
      cv.classList.remove('is-grabbing');
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('pointerleave', endPointer);

    /* Plain wheel keeps scrolling the page; ctrl/⌘ + wheel zooms, which is also
       what a trackpad pinch sends. */
    cv.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      var r = cv.getBoundingClientRect();
      opts.zoomBy(view, Math.exp(ev.deltaY * 0.002), ev.clientX - r.left, ev.clientY - r.top);
      markCustom(); syncButtons(); redraw();
    }, { passive: false });

    /* --- keyboard --- */

    cv.addEventListener('keydown', function (ev) {
      var step = 40, handled = true;
      switch (ev.key) {
        case 'ArrowLeft':  opts.panBy(view, step, 0); break;
        case 'ArrowRight': opts.panBy(view, -step, 0); break;
        case 'ArrowUp':    opts.panBy(view, 0, step); break;
        case 'ArrowDown':  opts.panBy(view, 0, -step); break;
        case '+': case '=': opts.zoomBy(view, 1 / 1.6, W / 2, H / 2); break;
        case '-': case '_': opts.zoomBy(view, 1.6, W / 2, H / 2); break;
        case '0': applyPreset(opts.defaultPreset); return;
        default: handled = false;
      }
      if (handled) { ev.preventDefault(); markCustom(); syncButtons(); redraw(); }
    });

    CSM.onResize(size);
    view.size = size;
    view.redraw = redraw;
    view.applyPreset = applyPreset;
    view.sync = syncButtons;
    return view;
  }

  /* ================================================================== */
  /*  Shared drawing bits                                                */
  /* ================================================================== */

  /* Axis ticks and the scale bar stay in kilometres all the way out: a decade
     tick reading "0.67 AU" helps nobody. */
  function fmtAxis(km) {
    if (km >= 1e9) return CSM.fmt(km / 1e9, km / 1e9 < 10 ? 1 : 0) + ' ' + CSM.t('unit.bkm');
    if (km >= 1e6) return CSM.fmt(km / 1e6, km / 1e6 < 10 ? 1 : 0) + ' ' + CSM.t('unit.mkm');
    return CSM.fmt(km, 0) + ' ' + CSM.t('unit.km');
  }

  /* The readouts speak in astronomical units once that is the natural size. */
  function fmtList(km) {
    var au = km / AU;
    if (au >= 0.02) return CSM.fmt(au, au < 10 ? 2 : 1) + ' ' + CSM.t('unit.au');
    if (km >= 1e6) return CSM.fmt(km / 1e6, 1) + ' ' + CSM.t('unit.mkm');
    return CSM.fmt(km, 0) + ' ' + CSM.t('unit.km');
  }

  /* Bodies, with the look each one gets on the canvas. */
  var BODIES = [
    { key: 'mercury', label: 'planet.mercury', color: '#9aa3b4', radiusKm: 2440,  icon: 'rock' },
    { key: 'venus',   label: 'planet.venus',   color: '#e6c894', radiusKm: 6052,  icon: 'smooth' },
    { key: 'earth',   label: 'planet.earth',   color: '#6fa8e6', radiusKm: 6371,  icon: 'earth' },
    { key: 'mars',    label: 'planet.mars',    color: '#d2795a', radiusKm: 3390,  icon: 'mars' },
    { key: 'jupiter', label: 'planet.jupiter', color: '#d9b28c', radiusKm: 69911, icon: 'banded' },
    { key: 'saturn',  label: 'planet.saturn',  color: '#e3cf9e', radiusKm: 58232, icon: 'ringed' },
    { key: 'uranus',  label: 'planet.uranus',  color: '#9fd8dd', radiusKm: 25362, icon: 'ice' },
    { key: 'neptune', label: 'planet.neptune', color: '#6f8ede', radiusKm: 24622, icon: 'ice' }
  ];
  var BODY_BY_KEY = {};
  BODIES.forEach(function (b) { BODY_BY_KEY[b.key] = b; });

  /* Each planet drawn as itself: bands on Jupiter, rings on Saturn, a polar cap
     on Mars, oceans and ice on Earth. All procedural, no image assets. */
  function drawBody(c, x, y, r, body, sunAngle) {
    c.save();

    if (body.icon === 'ringed') {
      c.save();
      c.translate(x, y);
      c.rotate(-0.42);
      c.strokeStyle = 'rgba(226,205,158,.55)';
      c.lineWidth = Math.max(0.8, r * 0.20);
      c.beginPath(); c.ellipse(0, 0, r * 2.05, r * 0.62, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(226,205,158,.28)';
      c.lineWidth = Math.max(0.6, r * 0.12);
      c.beginPath(); c.ellipse(0, 0, r * 2.45, r * 0.75, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    }

    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = body.color;
    c.fill();

    if (r > 3) {
      c.save();
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();

      if (body.icon === 'banded') {
        c.fillStyle = 'rgba(168,124,96,.45)';
        c.fillRect(x - r, y - r * 0.62, r * 2, r * 0.24);
        c.fillRect(x - r, y + r * 0.10, r * 2, r * 0.30);
        c.fillStyle = 'rgba(240,220,196,.35)';
        c.fillRect(x - r, y - r * 0.18, r * 2, r * 0.20);
        if (r > 7) {
          c.fillStyle = 'rgba(196,104,78,.75)';
          c.beginPath(); c.ellipse(x + r * 0.34, y + r * 0.26, r * 0.24, r * 0.14, 0, 0, Math.PI * 2); c.fill();
        }
      } else if (body.icon === 'earth') {
        c.fillStyle = 'rgba(122,168,120,.75)';
        c.beginPath(); c.ellipse(x - r * 0.30, y - r * 0.12, r * 0.34, r * 0.42, 0.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x + r * 0.34, y + r * 0.24, r * 0.30, r * 0.24, -0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(236,246,255,.72)';
        c.beginPath(); c.ellipse(x, y - r * 0.92, r * 0.62, r * 0.24, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x, y + r * 0.94, r * 0.54, r * 0.20, 0, 0, Math.PI * 2); c.fill();
      } else if (body.icon === 'mars') {
        c.fillStyle = 'rgba(150,70,52,.5)';
        c.beginPath(); c.ellipse(x + r * 0.18, y + r * 0.16, r * 0.46, r * 0.32, 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(242,238,232,.8)';
        c.beginPath(); c.ellipse(x, y - r * 0.90, r * 0.48, r * 0.22, 0, 0, Math.PI * 2); c.fill();
      } else if (body.icon === 'rock') {
        c.fillStyle = 'rgba(90,98,112,.55)';
        c.beginPath(); c.arc(x - r * 0.28, y - r * 0.20, r * 0.24, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + r * 0.30, y + r * 0.26, r * 0.18, 0, Math.PI * 2); c.fill();
      } else if (body.icon === 'ice') {
        c.strokeStyle = 'rgba(255,255,255,.22)';
        c.lineWidth = Math.max(0.6, r * 0.10);
        c.beginPath(); c.moveTo(x - r, y - r * 0.20); c.lineTo(x + r, y - r * 0.20); c.stroke();
      }

      /* the night side, away from the Sun */
      if (typeof sunAngle === 'number' && r > 4) {
        var g = c.createLinearGradient(
          x + Math.cos(sunAngle) * r, y + Math.sin(sunAngle) * r,
          x - Math.cos(sunAngle) * r, y - Math.sin(sunAngle) * r);
        g.addColorStop(0, 'rgba(6,10,20,0)');
        g.addColorStop(0.42, 'rgba(6,10,20,.06)');
        g.addColorStop(0.62, 'rgba(6,10,20,.38)');
        g.addColorStop(1, 'rgba(5,8,16,.88)');
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }

    c.restore();
  }

  function drawSun(c, x, y, r) {
    var glow = c.createRadialGradient(x, y, 0, x, y, r * 7);
    glow.addColorStop(0, 'rgba(255,206,138,.30)');
    glow.addColorStop(0.3, 'rgba(232,163,74,.10)');
    glow.addColorStop(1, 'rgba(232,163,74,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(x, y, r * 7, 0, Math.PI * 2); c.fill();

    c.fillStyle = '#ffd79a';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,244,214,.9)';
    c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
  }

  /* Keeps labels from stacking on top of each other. */
  function Labeller(pad) {
    var taken = [];
    return function place(x, y, w, h) {
      for (var i = 0; i < taken.length; i++) {
        var t = taken[i];
        if (Math.abs(x - t.x) * 2 < (w + t.w + pad) && Math.abs(y - t.y) * 2 < (h + t.h + pad)) return false;
      }
      taken.push({ x: x, y: y, w: w, h: h });
      return true;
    };
  }

  /* ================================================================== */
  /*  1. How far up is up? — a logarithmic ladder of distances           */
  /* ================================================================== */

  var LAD_FLOOR = 6, LAD_CEIL = 8e9;         // km, the widest the axis ever goes
  var ladder = { lo: Math.log10(8), hi: Math.log10(6e9) };

  var LADDER_PRESETS = {
    all:   { lo: 8,   hi: 6e9 },
    moon:  { lo: 8,   hi: 1.2e6 },
    orbit: { lo: 60,  hi: 6000 }
  };

  function ladderX(km, W) {
    var a = Math.log10(Math.max(1e-6, km));
    return 54 + (a - ladder.lo) / (ladder.hi - ladder.lo) * (W - 54 - 26);
  }
  function ladderKm(x, W) {
    var f = (x - 54) / (W - 54 - 26);
    return Math.pow(10, ladder.lo + f * (ladder.hi - ladder.lo));
  }

  function ladderRungs() {
    var now = new Date();
    var p = A.planets(now);
    var pos = CSM.position();
    var out = [
      { km: 100, key: 'ladder.karman', rank: 7 },
      { km: pos ? pos.altitude : CSM.sat.altKm, key: 'ladder.iss', rank: 10, hero: true },
      { km: 20200, key: 'ladder.gps', rank: 4 },
      /* the sister mission gets a rung, so each page places the other */
      (CSM.sat.id === 'hubble'
        ? { km: 420, key: 'ladder.station', rank: 5.8 }
        : { km: 476, key: 'ladder.hubble', rank: 4 }),
      { km: 35786, key: 'ladder.geo', rank: 6 },
      { km: A.moon(now).distance, key: 'ladder.moon', rank: 9 },
      { km: Math.hypot(p.earth.x, p.earth.y, p.earth.z) * AU, key: 'planet.sun', rank: 8 }
    ];
    var PLANET_RANK = { mars: 5.6, venus: 5.4, jupiter: 5.2, neptune: 5.0,
                        saturn: 4.6, mercury: 4.4, uranus: 4.2 };
    BODIES.forEach(function (b) {
      if (b.key === 'earth') return;
      out.push({ km: A.distanceAU(p.earth, p[b.key]) * AU, key: b.label,
                 rank: PLANET_RANK[b.key] || 4.5, color: b.color });
    });
    out.sort(function (a, b) { return a.km - b.km; });
    return out;
  }

  function drawLadder(view) {
    var c = view.ctx, W = view.W, H = view.H;
    if (!W) return;
    var baseY = H * 0.58;
    c.clearRect(0, 0, W, H);

    // the ground, only when the near end of the axis is in view
    if (ladder.lo < 3.2) {
      var sky = c.createLinearGradient(0, 0, W, 0);
      sky.addColorStop(0, 'rgba(96,128,196,.22)');
      sky.addColorStop(Math.min(0.6, (3.2 - ladder.lo) / (ladder.hi - ladder.lo) * 1.2), 'rgba(12,20,38,0)');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);

      var gx = ladderX(30, W);
      c.fillStyle = 'rgba(120,150,205,.16)';
      c.beginPath();
      c.moveTo(0, baseY + 26);
      c.quadraticCurveTo(gx * 0.5, baseY - 6, gx, baseY + 30);
      c.lineTo(0, baseY + 30);
      c.closePath(); c.fill();
    }

    // decade grid
    c.strokeStyle = 'rgba(244,234,216,.06)';
    c.lineWidth = 1;
    c.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace';
    c.fillStyle = 'rgba(160,171,192,.85)';
    c.textAlign = 'center'; c.textBaseline = 'top';
    /* How many decades we can label depends on how wide the figure actually is:
       on a phone that is two, on a desktop it may be nine. */
    var pxPerDecade = (W - 80) / (ladder.hi - ladder.lo);
    var step = Math.max(1, Math.ceil(96 / pxPerDecade));
    var d0 = Math.ceil(ladder.lo), d1 = Math.floor(ladder.hi);
    var first = Math.ceil(d0 / step) * step;
    for (var d = first; d <= d1; d += step) {
      var km = Math.pow(10, d), x = ladderX(km, W);
      if (x < 40 || x > W - 30) continue;
      c.beginPath(); c.moveTo(x, baseY - H * 0.30); c.lineTo(x, baseY + 12); c.stroke();
      c.fillText(fmtAxis(km), x, baseY + 17);
    }

    // the axis
    var line = c.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(232,163,74,.55)');
    line.addColorStop(1, 'rgba(232,163,74,.14)');
    c.strokeStyle = line;
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, baseY); c.lineTo(W, baseY); c.stroke();

    // rungs, most important first so the crowded ones drop their labels
    var rungs = ladderRungs().filter(function (r) {
      var x = ladderX(r.km, W);
      return x > 30 && x < W - 6;
    });
    var byRank = rungs.slice().sort(function (a, b) { return b.rank - a.rank; });
    var place = Labeller(24);

    /* Tiers alternate along the axis, anchored so the Station keeps the upper
       one — that way its closest neighbours drop to the lower tier instead of
       being culled, which matters most at the "low orbit" end. */
    var issIdx = 0;
    rungs.forEach(function (r, i) { if (r.hero) issIdx = i; });
    var up = {};
    rungs.forEach(function (r, i) { up[r.key] = (i % 2) === (issIdx % 2); });

    /* The Station's label is booked before anything else, so nothing lands on it. */
    var iss = rungs.filter(function (r) { return r.hero; })[0];
    if (iss) {
      c.font = '600 12px "Inter", system-ui, sans-serif';
      var iw = Math.max(c.measureText(CSM.t('ladder.iss')).width, 54);
      place(ladderX(iss.km, W), baseY - 34, iw, 12);
      place(ladderX(iss.km, W), baseY - 20, iw, 12);
    }

    c.textBaseline = 'alphabetic';
    byRank.forEach(function (r) {
      if (r.hero) return;
      var x = ladderX(r.km, W);
      c.font = '500 11px "Inter", system-ui, sans-serif';
      var label = CSM.t(r.key);
      var w = c.measureText(label).width;
      var goUp = up[r.key];
      var y = goUp ? baseY - 16 : baseY + 36;

      /* Work out the alignment first: a right-aligned label occupies a
         different box from a centred one, and the collision test has to know. */
      var align = x > W - 84 ? 'right' : (x < 74 ? 'left' : 'center');
      var anchor = Math.min(W - 6, Math.max(6, x));
      var cx = align === 'right' ? anchor - w / 2 : (align === 'left' ? anchor + w / 2 : anchor);
      if (!place(cx, y, w, 12)) return;

      c.strokeStyle = 'rgba(244,234,216,.22)';
      c.beginPath(); c.moveTo(x, baseY); c.lineTo(x, goUp ? y + 6 : y - 16); c.stroke();
      c.fillStyle = r.color || 'rgba(244,234,216,.4)';
      c.beginPath(); c.arc(x, baseY, 2.8, 0, Math.PI * 2); c.fill();

      c.textAlign = align;
      c.fillStyle = 'rgba(211,200,181,.9)';
      c.fillText(label, anchor, y);
    });

    // the Station, always drawn and always labelled
    if (iss) {
      var ix = ladderX(iss.km, W);
      var glow = c.createRadialGradient(ix, baseY, 0, ix, baseY, 30);
      glow.addColorStop(0, 'rgba(232,163,74,.5)');
      glow.addColorStop(1, 'rgba(232,163,74,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(ix, baseY, 30, 0, Math.PI * 2); c.fill();

      c.fillStyle = '#f6d9a8';
      c.beginPath(); c.arc(ix, baseY, 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,240,214,.85)';
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(ix, baseY, 8.5, 0, Math.PI * 2); c.stroke();

      c.textAlign = ix > W - 60 ? 'right' : (ix < 60 ? 'left' : 'center');
      c.font = '600 12px "Inter", system-ui, sans-serif';
      c.fillStyle = '#f6d9a8';
      c.fillText(CSM.t('ladder.iss'), ix, baseY - 34);
      c.font = '400 10.5px "IBM Plex Mono", ui-monospace, monospace';
      c.fillStyle = 'rgba(244,234,216,.7)';
      c.fillText(CSM.fmt(iss.km, 0) + ' km', ix, baseY - 20);
    }
    c.textAlign = 'left';
  }

  var ladderView = makeViewer('ladder', 'ladder-zoom', {
    defaultPreset: 'all',
    presets: LADDER_PRESETS,
    draw: drawLadder,
    setPreset: function (v, p) { ladder.lo = Math.log10(p.lo); ladder.hi = Math.log10(p.hi); },
    zoomBy: function (v, f, cxPx) {
      var anchor = Math.log10(ladderKm(cxPx, v.W));
      var span = (ladder.hi - ladder.lo) * f;
      span = Math.max(1.2, Math.min(Math.log10(LAD_CEIL) - Math.log10(LAD_FLOOR), span));
      var frac = (anchor - ladder.lo) / (ladder.hi - ladder.lo);
      ladder.lo = anchor - frac * span;
      ladder.hi = ladder.lo + span;
      clampLadder();
    },
    panBy: function (v, dx) {
      var span = ladder.hi - ladder.lo;
      var shift = -dx / (v.W - 80) * span;
      ladder.lo += shift; ladder.hi += shift;
      clampLadder();
    },
    readout: function () {
      return fmtAxis(Math.pow(10, ladder.lo)) + ' – ' + fmtAxis(Math.pow(10, ladder.hi));
    }
  });

  function clampLadder() {
    var span = ladder.hi - ladder.lo;
    var lo = Math.log10(LAD_FLOOR), hi = Math.log10(LAD_CEIL);
    if (ladder.lo < lo) { ladder.lo = lo; ladder.hi = lo + span; }
    if (ladder.hi > hi) { ladder.hi = hi; ladder.lo = hi - span; }
  }

  /* ================================================================== */
  /*  2. The neighbourhood — the solar system from above                 */
  /* ================================================================== */

  var solar = { cx: 0, cy: 0, radius: 31 };     // centre and half-height, in AU

  var SOLAR_PRESETS = {
    all:     { radius: 31,      centre: 'sun' },
    inner:   { radius: 1.75,    centre: 'sun' },
    moon:    { radius: 0.0035,  centre: 'earth' },
    station: { radius: 0.00022, centre: 'earth' }
  };

  function planetsNow() { return A.planets(new Date()); }

  function drawSolar(view) {
    var c = view.ctx, W = view.W, H = view.H;
    if (!W) return;
    var now = new Date();
    var p = planetsNow();
    var scale = (Math.min(W, H) / 2 - 16) / solar.radius;   // px per AU
    var ox = W / 2 - solar.cx * scale;
    var oy = H / 2 + solar.cy * scale;
    var X = function (au) { return ox + au * scale; };
    var Y = function (au) { return oy - au * scale; };

    c.clearRect(0, 0, W, H);

    var deep = solar.radius < 0.02;             // close enough for the Moon
    var veryDeep = solar.radius < 0.0016;       // close enough for the Station

    // orbits
    if (!veryDeep) {
      BODIES.forEach(function (b) {
        var r = p[b.key].a * scale;
        if (r < 6 || r > Math.max(W, H) * 14) return;
        c.strokeStyle = b.key === 'earth' ? 'rgba(127,176,232,.28)' : 'rgba(244,234,216,.10)';
        c.lineWidth = 1;
        c.beginPath(); c.arc(X(0), Y(0), r, 0, Math.PI * 2); c.stroke();
      });
    }

    // the Sun
    var sunR = Math.max(2.5, (696340 / AU) * scale);
    var sx = X(0), sy = Y(0);
    if (sx > -W && sx < W * 2 && sy > -H && sy < H * 2) drawSun(c, sx, sy, sunR);

    var place = Labeller(12);
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // discs first, labels afterwards, so nothing is drawn over a planet
    var drawn = [];
    BODIES.forEach(function (b) {
      var v = p[b.key];
      var x = X(v.x), y = Y(v.y);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) return;

      var trueR = (b.radiusKm / AU) * scale;
      var r = Math.max(b.key === 'earth' ? 3.2 : 2.6, Math.min(trueR, Math.min(W, H) * 0.42));
      if (trueR < 2 && veryDeep) return;

      var sunAngle = Math.atan2(-(Y(0) - y), X(0) - x);
      if (b.key === 'earth') {
        if (r > 12) {                       // an atmosphere, once Earth is a disc
          var air = c.createRadialGradient(x, y, r * 0.94, x, y, r * 1.18);
          air.addColorStop(0, 'rgba(150,200,255,.45)');
          air.addColorStop(1, 'rgba(150,200,255,0)');
          c.fillStyle = air;
          c.beginPath(); c.arc(x, y, r * 1.18, 0, Math.PI * 2); c.fill();
        } else {
          var halo = c.createRadialGradient(x, y, 0, x, y, 16);
          halo.addColorStop(0, 'rgba(127,176,232,.40)');
          halo.addColorStop(1, 'rgba(127,176,232,0)');
          c.fillStyle = halo;
          c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill();
        }
      }
      drawBody(c, x, y, r, b, trueR > 4 ? sunAngle : undefined);
      drawn.push({ b: b, x: x, y: y, r: r, au: p[b.key].a });
    });

    /* Earth is booked first — it is the one everybody is looking for. Then the
       outer planets, which have room, and only then whatever still fits. */
    if (!veryDeep) {
      c.font = '500 10.5px "Inter", system-ui, sans-serif';
      var order = drawn.slice().sort(function (a, b) {
        if (a.b.key === 'earth') return -1;
        if (b.b.key === 'earth') return 1;
        return b.au - a.au;
      });
      order.forEach(function (d) {
        var label = CSM.t(d.b.label);
        var lw = c.measureText(label).width;
        var ly = d.y + (d.y > H / 2 ? -(d.r + 12) : (d.r + 12));
        if (d.x < 16 || d.x > W - 16 || ly < 10 || ly > H - 10) return;
        if (!place(d.x, ly, lw, 12)) return;
        c.fillStyle = d.b.key === 'earth' ? 'rgba(200,222,250,.95)' : 'rgba(211,200,181,.78)';
        c.fillText(label, d.x, ly);
      });

      var sunLabel = CSM.t('planet.sun');
      if (sx > 20 && sx < W - 20 && sy > 14 && sy < H - 26 &&
          place(sx, sy + sunR + 13, c.measureText(sunLabel).width, 12)) {
        c.fillStyle = 'rgba(255,220,170,.9)';
        c.fillText(sunLabel, sx, sy + sunR + 13);
      }
    } else {
      // at this depth only Earth is left in frame
      var e0 = drawn.filter(function (d) { return d.b.key === 'earth'; })[0];
      if (e0) {
        c.font = '500 11px "Inter", system-ui, sans-serif';
        c.fillStyle = 'rgba(200,222,250,.95)';
        c.fillText(CSM.t('planet.earth'), e0.x, e0.y + e0.r + 16);
        place(e0.x, e0.y + e0.r + 16, 60, 12);
      }
    }

    // the Moon, once its orbit is worth drawing
    if (deep) {
      var e = p.earth;
      var m = A.moon(now);
      var mx = X(e.x + m.x / AU), my = Y(e.y + m.y / AU);
      var orbitR = (m.distance / AU) * scale;

      if (orbitR > 8 && orbitR < Math.max(W, H) * 6) {
        c.strokeStyle = 'rgba(244,234,216,.16)';
        c.lineWidth = 1;
        c.setLineDash([3, 4]);
        c.beginPath(); c.arc(X(e.x), Y(e.y), orbitR, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
      if (mx > -20 && mx < W + 20 && my > -20 && my < H + 20) {
        var mr = Math.max(2.2, (1737 / AU) * scale);
        c.fillStyle = '#cfd3dc';
        c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
        c.font = '500 10px "Inter", system-ui, sans-serif';
        var ml = CSM.t('planet.moon');
        if (place(mx, my + mr + 11, c.measureText(ml).width, 11)) {
          c.fillStyle = 'rgba(211,200,181,.8)';
          c.fillText(ml, mx, my + mr + 11);
        }
      }
    }

    // the Station's orbit, once Earth is big enough to hold it
    if (veryDeep) {
      var ep = p.earth;
      var ex = X(ep.x), ey = Y(ep.y);
      var pos = CSM.position();
      var altKm = pos ? pos.altitude : CSM.sat.altKm;
      var issR = ((R_EARTH + altKm) / AU) * scale;

      c.strokeStyle = 'rgba(232,163,74,.34)';
      c.lineWidth = 1.1;
      c.setLineDash([4, 5]);
      c.beginPath(); c.arc(ex, ey, issR, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);

      // put it on the correct side of the day/night line
      var sub = A.subsolarPoint(now);
      var sunDir = Math.atan2(-(Y(0) - ey), X(0) - ex);
      var ang = sunDir - ((pos ? pos.longitude : 0) - sub.lon) * Math.PI / 180;
      var ix = ex + Math.cos(ang) * issR, iy = ey - Math.sin(ang) * issR;

      var g = c.createRadialGradient(ix, iy, 0, ix, iy, 22);
      g.addColorStop(0, 'rgba(232,163,74,.55)');
      g.addColorStop(1, 'rgba(232,163,74,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(ix, iy, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f6d9a8';
      c.beginPath(); c.arc(ix, iy, 3.4, 0, Math.PI * 2); c.fill();

      // the labels sit further out along the same radius, clear of the Earth
      var lx = ex + Math.cos(ang) * (issR + 34);
      var ly2 = ey - Math.sin(ang) * (issR + 34);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 11px "Inter", system-ui, sans-serif';
      c.fillStyle = '#f6d9a8';
      c.fillText(CSM.t('ladder.iss'), lx, ly2 - 7);
      c.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
      c.fillStyle = 'rgba(244,234,216,.65)';
      c.fillText(CSM.fmt(altKm, 0) + ' km', lx, ly2 + 7);
    }

    drawScaleBar(c, W, H, scale);
    paintSolarStats(p, now);
  }

  /* A bar that says how much of the picture is how far — the only honest way to
     read a view that spans six orders of magnitude. */
  function drawScaleBar(c, W, H, scale) {
    var target = W * 0.22;                       // aim for about a fifth of the width
    var au = target / scale;
    var km = au * AU;
    var pow = Math.pow(10, Math.floor(Math.log10(km)));
    var nice = [1, 2, 5, 10].map(function (m) { return m * pow; })
      .reduce(function (best, v) {
        return Math.abs(v * scale / AU - target) < Math.abs(best * scale / AU - target) ? v : best;
      });
    var w = nice / AU * scale;
    if (!isFinite(w) || w < 20 || w > W - 40) return;

    var x = 14, y = H - 16;
    c.strokeStyle = 'rgba(244,234,216,.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y - 4); c.lineTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y - 4);
    c.stroke();
    c.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace';
    c.fillStyle = 'rgba(160,171,192,.9)';
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(fmtAxis(nice), x, y - 6);
    c.textBaseline = 'middle';
  }

  function paintSolarStats(p, now) {
    var ul = $('solar-stats');
    if (!ul) return;
    ul.innerHTML = '';

    var earth = p.earth;
    var rows = [{ color: '#ffd79a', label: CSM.t('planet.sun'),
                  km: Math.hypot(earth.x, earth.y, earth.z) * AU }];
    BODIES.forEach(function (b) {
      if (b.key === 'earth') return;
      rows.push({ color: b.color, label: CSM.t(b.label), km: A.distanceAU(earth, p[b.key]) * AU });
    });
    rows.push({ color: '#cfd3dc', label: CSM.t('planet.moon'), km: A.moon(now).distance });
    var pos = CSM.position();
    rows.push({ color: '#e8a34a', label: CSM.t('solar.iss'), km: pos ? pos.altitude : CSM.sat.altKm });

    rows.forEach(function (r) {
      var li = document.createElement('li');
      var k = document.createElement('span');
      k.className = 's-key';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = r.color;
      k.appendChild(sw);
      k.appendChild(document.createTextNode(r.label));
      var v = document.createElement('span');
      v.className = 's-val';
      v.textContent = fmtList(r.km);
      li.appendChild(k); li.appendChild(v);
      ul.appendChild(li);
    });
  }

  var solarView = makeViewer('solar', 'solar-zoom', {
    defaultPreset: 'all',
    presets: SOLAR_PRESETS,
    draw: drawSolar,
    setPreset: function (v, pr) {
      solar.radius = pr.radius;
      if (pr.centre === 'earth') {
        var e = planetsNow().earth;
        solar.cx = e.x; solar.cy = e.y;
      } else { solar.cx = 0; solar.cy = 0; }
    },
    zoomBy: function (v, f, px, py) {
      var scale = (Math.min(v.W, v.H) / 2 - 16) / solar.radius;
      var wx = solar.cx + (px - v.W / 2) / scale;
      var wy = solar.cy - (py - v.H / 2) / scale;
      var next = Math.max(0.00006, Math.min(60, solar.radius * f));
      var k = next / solar.radius;
      solar.cx = wx + (solar.cx - wx) * k;
      solar.cy = wy + (solar.cy - wy) * k;
      solar.radius = next;
    },
    panBy: function (v, dx, dy) {
      var scale = (Math.min(v.W, v.H) / 2 - 16) / solar.radius;
      solar.cx -= dx / scale;
      solar.cy += dy / scale;
    },
    readout: function () {
      return CSM.t('zoom.across').replace('{d}', fmtAxis(solar.radius * 2 * AU));
    }
  });

  /* ================================================================== */

  CSM.on('lang', function () {
    ladderView.sync(); ladderView.redraw();
    solarView.sync(); solarView.redraw();
  });
  CSM.on('position', function () { ladderView.redraw(); solarView.redraw(); });

  ladderView.applyPreset('all');
  solarView.applyPreset('all');
  ladderView.size();
  solarView.size();

  setInterval(function () { solarView.redraw(); }, 10 * 60 * 1000);
})();
