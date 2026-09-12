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
  /*  The map                                                            */
  /* ------------------------------------------------------------------ */

  var cv = $('world'), ctx = cv ? cv.getContext('2d') : null;
  var W = 0, H = 0, LAT_MAX = 90;

  function px(lon) { return (lon + 180) / 360 * W; }
  function py(lat) { return (1 - (lat + LAT_MAX) / (2 * LAT_MAX)) * H; }

  function sizeMap() {
    if (!cv) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = cv.getBoundingClientRect();
    W = Math.max(300, Math.round(rect.width));
    H = Math.max(120, Math.round(rect.height));
    LAT_MAX = Math.min(90, 180 * H / W);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap();
  }

  function drawMap() {
    if (!ctx || !W) return;
    var now = new Date();
    ctx.clearRect(0, 0, W, H);

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c1830');
    g.addColorStop(0.55, '#0e1c34');
    g.addColorStop(1, '#0b1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    window.GLOBE.paintLand(ctx, px, py);
    drawNight(now);

    // the four, each on its own point on the ground
    FLEET.forEach(function (sat) {
      var f = fixes[sat.id];
      if (!f) return;
      var x = px(f.subLon), y = py(f.subLat);
      var deep = sat.kind === 'deep';

      var glow = ctx.createRadialGradient(x, y, 0, x, y, deep ? 13 : 17);
      glow.addColorStop(0, 'rgba(232,163,74,.42)');
      glow.addColorStop(1, 'rgba(232,163,74,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, deep ? 13 : 17, 0, Math.PI * 2); ctx.fill();

      /* Hollow for the far two, solid for the near two: the same mark would
         say the two kinds are the same kind of thing, and they are not. */
      if (deep) {
        ctx.strokeStyle = '#e8a34a';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#e8a34a';
        ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fill();
      }

      ctx.font = '600 10.5px "Inter", system-ui, sans-serif';
      ctx.textAlign = x > W - 70 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f3c98f';
      ctx.fillText(CSM.t(sat.id + '.sat.short') || sat.id,
                   x > W - 70 ? x - 9 : x + 9, y - 9);
    });

    // and the reader, if they have said where they are
    var place = P.get();
    if (place) {
      var ux = px(place.lon), uy = py(place.lat);
      ctx.strokeStyle = 'rgba(159,216,221,.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ux, uy, 4.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(159,216,221,.35)';
      ctx.beginPath(); ctx.arc(ux, uy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* Night, drawn three ways so it never reads by colour alone: a fill, the
     city lights inside it, and the shape of the terminator itself. */
  function drawNight(now) {
    var sub = A.subsolarPoint(now);
    var G = window.GLOBE;

    ctx.save();
    G.nightPath(ctx, px, py, W, H, sub.lat, sub.lon);
    ctx.fillStyle = 'rgba(4,8,18,.46)';
    ctx.fill();
    ctx.clip();
    G.paintCityLights(ctx, px, py);
    ctx.restore();

    var line = G.terminator(sub.lat, sub.lon);
    ctx.strokeStyle = 'rgba(243,201,143,.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < line.length; i++) {
      var x = px(line[i][0]), y = py(line[i][1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
    var chip = $('legend-you');
    if (chip) chip.hidden = !has;
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

  P.on(function () { paintPlace(); drawMap(); });
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
