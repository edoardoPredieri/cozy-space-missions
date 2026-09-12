/* Cozy Space Missions — the front page.

   The other four pages each answer one mission's question well. This one
   answers the question you have before you pick a mission: what is up there
   right now, where is it, and is any of it worth going outside for tonight.

   Everything here is worked out in the browser. The only requests it makes are
   two sets of orbital elements — the Station's and Hubble's — and, if you ask
   it where you are, one to the geocoder. The two far telescopes need no
   request at all: their positions are shipped with the page. */

(function () {
  'use strict';

  var CSM = window.CSM, A = window.ASTRO, P = window.PLACE;
  var $ = function (id) { return document.getElementById(id); };

  if (CSM.sat.kind !== 'home') return;

  var FLEET = window.CSM_FLEET || [];
  var R_EARTH = A.R_EARTH;

  /* Where each mission is right now, filled in as its source arrives. Each
     entry is {sat, km, subLat, subLon, sample} — `sample(t)` answers "where
     were you at time t" for the ones that have a ground track, and is absent
     for the ones that do not. */
  var fixes = {};

  function set(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function clock(date) {
    return date.toLocaleTimeString(CSM.t('locale'), { hour: '2-digit', minute: '2-digit' });
  }

  function fmtKm(km) {
    if (km >= 1e6) return CSM.fmt(km / 1e6, 2) + ' ' + CSM.t('unit.mkm');
    return CSM.fmt(km, 0) + ' ' + CSM.t('unit.km');
  }

  function compass(az) {
    var names = CSM.t('compass').split(',');
    return names[Math.round(az / 22.5) % 16].trim();
  }

  /* ------------------------------------------------------------------ */
  /*  Where everything is                                                */
  /* ------------------------------------------------------------------ */

  /* A satellite in orbit reports a latitude and longitude directly. Something
     at L2 does not, but it still has a point on the ground it is standing
     over — the one place it sits at the zenith — and that is what puts all
     four on the same map. */
  function deepFix(sat) {
    var table = window.EPHEM && window.EPHEM[sat.ephem];
    if (!table || !table.samples || !table.samples.length) return null;
    var now = new Date();
    var t = now.getTime() / 1000;
    var s = table.samples;
    if (t < s[0][0] || t > s[s.length - 1][0]) return null;

    var i = 0;
    while (i < s.length - 2 && s[i + 1][0] < t) i++;
    var f = (t - s[i][0]) / (s[i + 1][0] - s[i][0]);
    var km = s[i][1] + f * (s[i + 1][1] - s[i][1]);
    var d = ((s[i + 1][2] - s[i][2] + 540) % 360) - 180;
    var lon = s[i][2] + f * d;
    var lat = s[i][3] + f * (s[i + 1][3] - s[i][3]);

    var eq = A.eclipticToEquatorial(lon, lat, now);
    var sub = A.subPoint(eq.ra, eq.dec, now);
    return { sat: sat, km: km, subLat: sub.lat, subLon: sub.lon };
  }

  function refreshFixes() {
    FLEET.forEach(function (sat) {
      if (sat.kind === 'deep') {
        var f = deepFix(sat);
        if (f) fixes[sat.id] = f;
        return;
      }
      var prop = props[sat.id];
      if (!prop) return;
      var p = prop.at(new Date());
      if (!p) return;
      fixes[sat.id] = {
        sat: sat,
        km: p.altitude,
        speed: p.velocity,
        subLat: p.latitude,
        subLon: p.longitude,
        sample: function (t) {
          var q = prop.at(new Date(t * 1000));
          return q ? { lat: q.latitude, lon: q.longitude, alt: q.altitude } : null;
        }
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /*  The figure                                                         */
  /* ------------------------------------------------------------------ */

  var cv = $('world'), ctx = cv ? cv.getContext('2d') : null;
  var W = 0, H = 0;

  function sizeMap() {
    if (!cv) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = cv.getBoundingClientRect();
    W = Math.max(300, Math.round(rect.width));
    H = Math.max(120, Math.round(rect.height));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap();
  }

  function drawMap() {
    if (!ctx || !W) return;
    drawSolarView();
  }

  /* ------------------------------------------------------------------ */
  /*  The same moment, from much further back                            */
  /* ------------------------------------------------------------------ */

  /* Every mission on this site is within about a million and a quarter
     kilometres of the Earth. On a diagram that reaches Neptune, that is a
     fifth of a pixel. Rather than quietly drop them, or quietly lie about the
     scale, the picture says both things at once: the solar system at true
     scale on the left, and the Earth's own surroundings magnified on the
     right, with distances on a ten-times scale so that four hundred
     kilometres and a million can share one frame.

     Both halves use the same directions — longitude around the plane the
     planets share — so the Sun is in the same direction in each, and you can
     see for yourself that Webb and Roman sit on the far side of us from it. */

  var NEPTUNE_AU = 30.1;
  var NEAR_MIN_KM = 200;              // below the lowest thing that stays up
  var NEAR_MAX_KM = 1.8e6;            // past L2

  function nearRadius(heightKm, R) {
    var lo = Math.log10(NEAR_MIN_KM), hi = Math.log10(NEAR_MAX_KM);
    var f = (Math.log10(Math.max(NEAR_MIN_KM, heightKm)) - lo) / (hi - lo);
    return 10 + f * (R - 10);
  }

  /* Everything near the Earth, in one list: how high and which way. */
  function neighbours(now) {
    var out = [];
    var m = A.moon(now);
    out.push({ key: 'planet.moon', lon: m.lon, km: m.distance - R_EARTH,
               color: '#cdd5e4', size: 2.6 });

    FLEET.forEach(function (sat) {
      var f = fixes[sat.id];
      if (!f) return;
      var lon;
      if (sat.kind === 'deep') {
        var d = deepDirection(sat, now);
        if (!d) return;
        lon = d.lon;
      } else {
        lon = A.directionOverGround(f.subLat, f.subLon, now).lon;
      }
      out.push({
        key: sat.id + '.sat.short', lon: lon,
        km: sat.kind === 'deep' ? f.km - R_EARTH : f.km,
        color: '#e8a34a', size: 3.2, hollow: sat.kind === 'deep', sat: sat
      });
    });
    return out;
  }

  /* The far missions are stored in the plane of the planets already, so their
     direction needs no conversion — just the same interpolation the map uses. */
  function deepDirection(sat, now) {
    var table = window.EPHEM && window.EPHEM[sat.ephem];
    if (!table || !table.samples || !table.samples.length) return null;
    var t = now.getTime() / 1000, s = table.samples;
    if (t < s[0][0] || t > s[s.length - 1][0]) return null;
    var i = 0;
    while (i < s.length - 2 && s[i + 1][0] < t) i++;
    var f = (t - s[i][0]) / (s[i + 1][0] - s[i][0]);
    var d = ((s[i + 1][2] - s[i][2] + 540) % 360) - 180;
    return { lon: s[i][2] + f * d };
  }

  function drawSolarView() {
    var c = ctx, now = new Date();
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1226');
    g.addColorStop(1, '#080e1d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    var p = A.planets(now);

    /* Two panels that do not touch: the system at true scale, and the Earth's
       own surroundings magnified. Side by side where there is width for it;
       one above the other on a phone, where side by side would put the Sun's
       label through the ring labels and push Webb off the edge.

       Room is left outside both circles on purpose: the things furthest out
       sit near the rim, and their names have to go somewhere. */
    var narrow = W < 660;
    var sx = narrow ? W * 0.5 : W * 0.25;
    var sy = narrow ? H * 0.235 : H * 0.5;
    var R = narrow ? Math.min(W * 0.30, H * 0.185) : Math.min(W * 0.205, H * 0.42);
    var scale = R / NEPTUNE_AU;

    var ix = narrow ? W * 0.5 : W * 0.72;
    var iy = narrow ? H * 0.70 : H * 0.5;
    var IR = narrow ? Math.min(W * 0.345, H * 0.245) : Math.min(W * 0.185, H * 0.37);

    c.textBaseline = 'middle';

    /* ---- the solar system ---- */

    A.PLANETS.forEach(function (b) {
      var e = p[b.key];
      c.strokeStyle = b.key === 'earth' ? 'rgba(127,176,232,.38)' : 'rgba(244,234,216,.10)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(sx, sy, e.a * scale, 0, Math.PI * 2); c.stroke();
    });

    var sun = c.createRadialGradient(sx, sy, 0, sx, sy, 13);
    sun.addColorStop(0, 'rgba(255,214,140,.9)');
    sun.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = sun;
    c.beginPath(); c.arc(sx, sy, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd68c';
    c.beginPath(); c.arc(sx, sy, 3, 0, Math.PI * 2); c.fill();

    var e = p.earth;
    var ex = sx + e.x * scale, ey = sy - e.y * scale;

    /* Only the outermost planets get named here: everything inside Jupiter is
       a couple of pixels from the Sun at this scale, and four labels on top of
       each other say less than none. The Earth is named because it is the one
       the rest of the picture is about. */
    var placeSolar = Labeller(16);
    c.font = '500 10px "Inter", system-ui, sans-serif';
    A.PLANETS.forEach(function (b) {
      var q = p[b.key];
      var x = sx + q.x * scale, y = sy - q.y * scale;
      c.fillStyle = b.color;
      c.beginPath(); c.arc(x, y, b.key === 'earth' ? 3.2 : 2.2, 0, Math.PI * 2); c.fill();
      if (b.key === 'earth' || b.key === 'jupiter' || b.key === 'saturn' ||
          b.key === 'uranus' || b.key === 'neptune') {
        var label = CSM.t('planet.' + b.key);
        var w = c.measureText(label).width;
        var lx = x < sx ? x - w / 2 - 7 : x + w / 2 + 7;
        if (lx + w / 2 > sx + R + 26) lx = x - w / 2 - 7;
        lx = Math.max(w / 2 + 3, Math.min(W - w / 2 - 3, lx));
        if (placeSolar(lx, y, w, 11)) {
          c.fillStyle = b.key === 'earth' ? '#cfe2fb' : 'rgba(211,200,181,.7)';
          c.textAlign = 'center';
          c.fillText(label, lx, y);
        }
      }
    });

    // a ring round the Earth, so the eye finds what the magnifier is about
    c.strokeStyle = 'rgba(127,176,232,.8)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(ex, ey, 7, 0, Math.PI * 2); c.stroke();

    /* ---- the magnified Earth ---- */

    var dx = ix - ex, dy = iy - ey;
    var d = Math.hypot(dx, dy) || 1;
    var nx = -dy / d, ny = dx / d;
    c.strokeStyle = 'rgba(244,234,216,.14)';
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    [1, -1].forEach(function (side) {
      c.beginPath();
      c.moveTo(ex + nx * side * 7, ey + ny * side * 7);
      c.lineTo(ix + nx * side * IR, iy + ny * side * IR);
      c.stroke();
    });
    c.setLineDash([]);

    c.fillStyle = 'rgba(9,16,34,.95)';
    c.beginPath(); c.arc(ix, iy, IR, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(244,234,216,.22)';
    c.beginPath(); c.arc(ix, iy, IR, 0, Math.PI * 2); c.stroke();

    /* Rings every ten times, labelled down the lower left where nothing of
       ours tends to sit. */
    c.font = '400 9px "IBM Plex Mono", ui-monospace, monospace';
    var labelAngle = Math.PI * 0.75;
    [1e3, 1e4, 1e5, 1e6].forEach(function (km) {
      var r = nearRadius(km, IR);
      if (r > IR - 3) return;
      c.strokeStyle = 'rgba(244,234,216,.09)';
      c.setLineDash([2, 5]);
      c.beginPath(); c.arc(ix, iy, r, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(147,158,180,.75)';
      c.textAlign = 'center';
      c.fillText(km >= 1e6 ? CSM.fmt(km / 1e6, 0) + ' ' + CSM.t('unit.mkm')
                           : CSM.fmt(km, 0) + ' ' + CSM.t('unit.km'),
                 ix + Math.cos(labelAngle) * r, iy - Math.sin(labelAngle) * r);
    });

    /* One labeller for everything inside this circle, so the Sun's name and a
       telescope's cannot both claim the same patch — which they will try to,
       because at new Moon the Moon really is in the Sun's direction. */
    var place = Labeller(15);

    // which way the Sun is, so the far two explain themselves
    var sunLon = A.sunLongitude(now) * Math.PI / 180;
    var ax = ix + Math.cos(sunLon) * (IR - 2), ay = iy - Math.sin(sunLon) * (IR - 2);
    c.strokeStyle = 'rgba(255,214,140,.45)';
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(ix, iy); c.lineTo(ax, ay); c.stroke();
    c.font = '500 9.5px "Inter", system-ui, sans-serif';
    var sunLabel = CSM.t('planet.sun');
    var sw = c.measureText(sunLabel).width;
    var slx = ix + Math.cos(sunLon) * (IR + 16);
    var sly = iy - Math.sin(sunLon) * (IR + 16);
    slx = Math.max(sw / 2 + 3, Math.min(W - sw / 2 - 3, slx));
    place(slx, sly, sw, 11);
    c.fillStyle = 'rgba(255,214,140,.9)';
    c.textAlign = 'center';
    c.fillText(sunLabel, slx, sly);

    c.fillStyle = '#6fa8e6';
    c.beginPath(); c.arc(ix, iy, 5, 0, Math.PI * 2); c.fill();

    // the Earth's own name, booked before anything can land on it
    c.font = '500 9.5px "Inter", system-ui, sans-serif';
    var earthLabel = CSM.t('planet.earth');
    place(ix, iy + 15, c.measureText(earthLabel).width, 11);
    c.fillStyle = 'rgba(207,226,251,.92)';
    c.textAlign = 'center';
    c.fillText(earthLabel, ix, iy + 15);

    /* Everyone else, furthest first, so when two labels want the same corner
       the one further out — the one the reader is least able to guess — keeps
       it. Labels sit radially outward from their dot, which spreads them the
       way the diagram already spreads the dots. */
    var list = neighbours(now).sort(function (a, b) { return b.km - a.km; });

    list.forEach(function (n) {
      var r = nearRadius(n.km, IR);
      var a = n.lon * Math.PI / 180;
      var x = ix + Math.cos(a) * r, y = iy - Math.sin(a) * r;

      var glow = c.createRadialGradient(x, y, 0, x, y, 9);
      glow.addColorStop(0, n.color === '#e8a34a' ? 'rgba(232,163,74,.42)' : 'rgba(205,213,228,.32)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();

      if (n.hollow) {
        c.strokeStyle = n.color; c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, n.size, 0, Math.PI * 2); c.stroke();
      } else {
        c.fillStyle = n.color;
        c.beginPath(); c.arc(x, y, n.size, 0, Math.PI * 2); c.fill();
      }

      c.font = '600 10px "Inter", system-ui, sans-serif';
      var label = CSM.t(n.key);
      var w = c.measureText(label).width;

      /* Outward from the centre, and far enough out that the label's own box
         clears the dot rather than sitting on it — which means allowing for
         half the text's width when the direction is mostly sideways. A short
         leader line is drawn when it had to go a long way. */
      var clear = n.size + 7 + Math.abs(Math.cos(a)) * w / 2;
      for (var push = 0; push <= 30; push += 8) {
        var lx = x + Math.cos(a) * (clear + push);
        var ly = y - Math.sin(a) * (clear + push);
        lx = Math.max(w / 2 + 3, Math.min(W - w / 2 - 3, lx));
        ly = Math.max(9, Math.min(H - 9, ly));
        if (!place(lx, ly, w, 11)) continue;
        if (push > 8) {
          c.strokeStyle = 'rgba(244,234,216,.20)';
          c.lineWidth = 0.8;
          c.beginPath();
          c.moveTo(x + Math.cos(a) * (n.size + 2), y - Math.sin(a) * (n.size + 2));
          c.lineTo(x + Math.cos(a) * (clear + push - 6), y - Math.sin(a) * (clear + push - 6));
          c.stroke();
        }
        c.fillStyle = n.color === '#e8a34a' ? '#f3c98f' : 'rgba(215,222,236,.92)';
        c.textAlign = 'center';
        c.fillText(label, lx, ly);
        break;
      }
    });
  }

  /* Keeps two labels off each other, first come first served. */
  function Labeller(pad) {
    var taken = [];
    return function (x, y, w, h) {
      for (var i = 0; i < taken.length; i++) {
        var t = taken[i];
        if (Math.abs(x - t.x) * 2 < (w + t.w + pad) &&
            Math.abs(y - t.y) * 2 < (h + t.h + pad)) return false;
      }
      taken.push({ x: x, y: y, w: w, h: h });
      return true;
    };
  }

  /* ------------------------------------------------------------------ */
  /*  The Moon tonight, and the Earth from there                         */
  /* ------------------------------------------------------------------ */

  /* Both discs are lit from the same side, because both are lit by the same
     Sun: the lit limb points at it whichever of the two you are standing on.
     What differs is how much — and the two fractions add to one, which is the
     whole point of drawing them together. */
  function drawPhase(canvas, lit, litOnRight, colours) {
    if (!canvas) return;
    var c = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var size = Math.max(80, Math.round(canvas.getBoundingClientRect().width));
    canvas.width = canvas.height = Math.round(size * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);

    var cx = size / 2, cy = size / 2, R = size / 2 - 4;

    // the unlit disc, faintly there so the shape is never a mystery
    c.fillStyle = colours.dark;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = colours.rim;
    c.lineWidth = 1;
    c.stroke();

    if (lit > 0.004) {
      /* The terminator is an ellipse seen edge-on. Its half-width is R(1-2k),
         which is signed: past half-lit it is negative, so the ellipse bulges
         away from the lit limb and the lit area is more than a semicircle;
         before half-lit it is positive, the ellipse bulges back across the
         disc, and what is left is a crescent.

         The sign is easy to write the wrong way round, and the wrong way round
         paints the exact complement — which looks perfectly plausible and is
         completely wrong. tests/test_phase.py measures the painted area and
         compares it with the fraction the page claims. */
      var half = R * (1 - 2 * lit);
      var pts = [];
      var n = 72;
      for (var i = 0; i <= n; i++) {
        var a = -Math.PI / 2 + (i / n) * Math.PI;      // top to bottom
        pts.push([R * Math.cos(a), R * Math.sin(a)]);  // the lit limb
      }
      for (var j = n; j >= 0; j--) {
        var b = -Math.PI / 2 + (j / n) * Math.PI;
        pts.push([half * Math.cos(b), R * Math.sin(b)]);  // back along the terminator
      }

      c.save();
      c.beginPath();
      pts.forEach(function (p, k) {
        var x = cx + (litOnRight ? p[0] : -p[0]);
        var y = cy + p[1];
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.closePath();
      c.clip();

      var g = c.createRadialGradient(
        cx + (litOnRight ? R * 0.3 : -R * 0.3), cy - R * 0.25, R * 0.1,
        cx, cy, R * 1.15);
      g.addColorStop(0, colours.bright);
      g.addColorStop(1, colours.lit);
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  function paintPhases() {
    var now = new Date();
    var ph = A.moonPhase(now);

    /* Waxing means the Moon is east of the Sun, which puts its lit limb on the
       side the Sun is on. The little sun mark beside the pair says which side
       that is, so the drawing needs no hemisphere to make sense of it. */
    var litOnRight = ph.waxing;
    var pair = $('phase-pair');
    if (pair) pair.setAttribute('data-sun', litOnRight ? 'right' : 'left');

    drawPhase($('moon-disc'), ph.illuminated, litOnRight,
      { dark: '#171d2c', rim: 'rgba(205,213,228,.28)', lit: '#c9cdd8', bright: '#f2f4f8' });
    drawPhase($('earth-disc'), ph.earthIlluminated, litOnRight,
      { dark: '#121a2b', rim: 'rgba(127,176,232,.30)', lit: '#4d7fbf', bright: '#9fd0f0' });

    set('moon-name', CSM.t('moon.' + ph.key));
    set('moon-lit', CSM.fmt(ph.illuminated * 100, ph.illuminated < 0.1 ? 1 : 0) + '%');
    set('moon-age', CSM.t('moon.age').replace('{n}', CSM.fmt(ph.ageDays, 1)));
    set('earth-lit', CSM.fmt(ph.earthIlluminated * 100, ph.earthIlluminated < 0.1 ? 1 : 0) + '%');
    set('earth-name', CSM.t('moon.earthNote'));

    var full = A.nextPhase(now, 180), knew = A.nextPhase(now, 0);
    var soon = (full && knew && full < knew) ? { d: full, k: 'full' } : { d: knew, k: 'new' };
    if (soon.d) {
      set('moon-next', CSM.t('moon.next.' + soon.k)
        .replace('{date}', soon.d.toLocaleDateString(CSM.t('locale'),
                 { weekday: 'long', day: 'numeric', month: 'long' })));
    }

    var alt = $('phase-pair');
    if (alt) {
      alt.setAttribute('aria-label', CSM.t('moon.alt')
        .replace('{phase}', CSM.t('moon.' + ph.key))
        .replace('{moon}', CSM.fmt(ph.illuminated * 100, 0))
        .replace('{earth}', CSM.fmt(ph.earthIlluminated * 100, 0)));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  The four, side by side                                             */
  /* ------------------------------------------------------------------ */

  var BAR_LO = Math.log10(300), BAR_HI = Math.log10(2e6);

  function paintCompare() {
    var list = $('compare-list');
    if (!list) return;
    list.innerHTML = '';
    var now = new Date();

    FLEET.forEach(function (sat) {
      var f = fixes[sat.id];
      var li = document.createElement('li');
      li.className = 'cmp';

      var link = document.createElement('a');
      link.className = 'cmp-name';
      link.href = sat.page;
      link.textContent = CSM.t(sat.id + '.sat.short') || sat.id;

      var what = document.createElement('span');
      what.className = 'cmp-what';
      what.textContent = CSM.t('cmp.' + sat.id);

      var dist = document.createElement('span');
      dist.className = 'cmp-dist';
      dist.textContent = f ? fmtKm(f.km) : '—';

      var age = document.createElement('span');
      age.className = 'cmp-age';
      if (sat.launched) {
        var years = (now - Date.parse(sat.launched)) / (365.2425 * 86400000);
        age.textContent = years < 1
          ? CSM.t('cmp.days').replace('{n}', CSM.fmt(years * 365.2425, 0))
          : CSM.t('cmp.years').replace('{n}', CSM.fmt(years, years < 10 ? 1 : 0));
      } else {
        age.textContent = '—';
      }

      /* One bar, log scale, so four numbers spanning four thousandfold still
         read as a picture rather than a list. */
      var track = document.createElement('span');
      track.className = 'cmp-bar';
      var fill = document.createElement('i');
      if (f) {
        var frac = (Math.log10(Math.max(300, f.km)) - BAR_LO) / (BAR_HI - BAR_LO);
        fill.style.width = Math.max(2, Math.min(100, frac * 100)).toFixed(1) + '%';
      }
      track.appendChild(fill);

      li.appendChild(link);
      li.appendChild(what);
      li.appendChild(track);
      li.appendChild(dist);
      li.appendChild(age);
      list.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  From where you are                                                 */
  /* ------------------------------------------------------------------ */

  function paintDaylight() {
    var place = P.get();
    if (!place) return;
    var now = new Date();
    var s = A.sunTimes(place.lat, place.lon, now);

    set('sun-rise', s.riseUp ? clock(s.riseUp) : CSM.t('sun.none'));
    set('sun-set', s.riseDown ? clock(s.riseDown) : CSM.t('sun.none'));
    set('sun-dark', s.astroDown ? clock(s.astroDown) : CSM.t('sun.none'));
    set('sun-light', s.astroUp ? clock(s.astroUp) : CSM.t('sun.none'));

    var h = s.darkHours;
    set('sun-hours', h >= 0.05
      ? CSM.t('sun.hours').replace('{h}', CSM.fmt(Math.floor(h), 0))
                          .replace('{m}', CSM.fmt(Math.round((h % 1) * 60), 0))
      : CSM.t('sun.noDark'));

    var note = $('sun-note');
    if (note) {
      note.textContent = h < 0.05
        ? CSM.t('sun.note.none')
        : (h > 9 ? CSM.t('sun.note.long') : CSM.t('sun.note.normal'));
    }
  }

  /* One honest line per mission. The two in orbit get a real pass time when
     there is one; the two at L2 get the truth, which is that they are up all
     night and still out of reach without a telescope. */
  function paintTonight() {
    var list = $('tonight-list');
    var place = P.get();
    if (!list || !place) return;
    list.innerHTML = '';

    var now = Math.floor(Date.now() / 1000);

    FLEET.forEach(function (sat) {
      var li = document.createElement('li');
      li.className = 'tn';

      var name = document.createElement('a');
      name.className = 'tn-name';
      name.href = sat.page;
      name.textContent = CSM.t(sat.id + '.sat.short') || sat.id;
      li.appendChild(name);

      var line = document.createElement('span');
      line.className = 'tn-line';

      if (sat.kind === 'deep') {
        /* Opposite the Sun is where L2 is, so these two are above the horizon
           for the whole of the night and highest around local midnight. That
           is a real and pleasing fact, and it is also not enough: at around
           sixteenth magnitude neither is anywhere near naked-eye. */
        line.textContent = CSM.t('tonight.deep')
          .replace('{mag}', CSM.fmt(sat.magnitude || 16.5, 1));
        li.classList.add('is-quiet');
      } else {
        var f = fixes[sat.id];
        if (!f || !f.sample) {
          line.textContent = CSM.t('tonight.waiting');
          li.classList.add('is-quiet');
        } else {
          var ceiling = A.orbitCeiling(place.lat,
            props[sat.id] ? props[sat.id].inclination : sat.inclination, f.km);
          var passes = A.findPasses(f.sample, now, now + 12 * 3600, place.lat, place.lon, {
            minElevation: sat.minElevation || 10,
            stepSec: 20,
            limit: 3
          });
          var visible = passes.filter(function (p) { return p.visible; });

          if (visible.length) {
            var v = visible[0];
            line.textContent = CSM.t('tonight.visible')
              .replace('{time}', clock(new Date(v.start * 1000)))
              .replace('{deg}', CSM.fmt(v.maxEl, 0))
              .replace('{dir}', compass(v.azStart));
            li.classList.add('is-good');
          } else if (passes.length) {
            /* It goes over, but you would not see it — and why not matters.
               A bright sky and the Earth's own shadow are different failures
               and deserve different sentences. */
            var p0 = passes[0];
            line.textContent = CSM.t(p0.darkSky ? 'tonight.inShadow' : 'tonight.tooBright')
              .replace('{time}', clock(new Date(p0.start * 1000)))
              .replace('{deg}', CSM.fmt(p0.maxEl, 0));
            li.classList.add('is-quiet');
          } else if (ceiling !== null && ceiling < 12) {
            line.textContent = CSM.t('tonight.tooLow').replace('{deg}', CSM.fmt(ceiling, 0));
            li.classList.add('is-quiet');
          } else {
            line.textContent = CSM.t('tonight.nothing');
            li.classList.add('is-quiet');
          }
        }
      }

      li.appendChild(line);
      list.appendChild(li);
    });
  }

  function paintPlace() {
    var place = P.get();
    var has = !!place;
    var ask = $('home-ask'), panel = $('home-sky');
    if (ask) ask.hidden = has;
    if (panel) panel.hidden = !has;
    if (!has) return;

    set('home-place', place.label || CSM.t('obs.you'));
    set('home-coords',
      CSM.fmt(Math.abs(place.lat), 3) + '° ' + CSM.t(place.lat >= 0 ? 'dir.n' : 'dir.s') + '  ' +
      CSM.fmt(Math.abs(place.lon), 3) + '° ' + CSM.t(place.lon >= 0 ? 'dir.e' : 'dir.w'));
    paintDaylight();
    paintTonight();
  }

  /* ------------------------------------------------------------------ */
  /*  Orbital elements for the two that have them                        */
  /* ------------------------------------------------------------------ */

  var props = {};

  function loadOrbits() {
    FLEET.filter(function (s) { return s.kind === 'orbit' && s.tle; }).forEach(function (sat) {
      window.TLE.load(sat)
        .then(function (prop) {
          props[sat.id] = prop;
          refreshFixes();
          repaint();
        })
        .catch(function () { /* the map simply shows one fewer mark */ });
    });
  }

  /* ------------------------------------------------------------------ */

  function repaint() {
    refreshFixes();
    drawMap();
    paintCompare();
    paintTonight();
  }

  P.on(paintPlace);
  CSM.on('lang', function () { paintPhases(); paintCompare(); paintPlace(); drawMap(); });
  CSM.onResize(function () { sizeMap(); paintPhases(); });

  set('home-date', new Date().toLocaleDateString(CSM.t('locale'),
      { weekday: 'long', day: 'numeric', month: 'long' }));

  P.wire({
    form: 'home-form', input: 'home-input', results: 'home-results',
    locate: 'home-locate', submit: 'home-submit', error: 'home-err'
  }, CSM.t, CSM.announce);

  var change = $('home-change');
  if (change) {
    change.addEventListener('click', function () {
      P.forget();
      var input = $('home-input');
      if (input) input.focus();
    });
  }

  sizeMap();
  paintPhases();
  refreshFixes();
  paintCompare();
  paintPlace();
  loadOrbits();

  /* The map moves; the phases do not, on any timescale a reader will sit
     through. Half a minute keeps the marks honest without spinning the CPU. */
  setInterval(repaint, 30000);
  setInterval(paintPhases, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) repaint();
  });
})();
