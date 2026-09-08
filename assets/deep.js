/* Cozy Space Missions — the two telescopes that live a long way out.

   Webb and Roman sit near L2, roughly 1.5 million km from here, directly away
   from the Sun. Nothing out there has a ground track and nothing out there
   passes over your house, so this file answers the question those pages can
   actually answer: how far away is it, and what does that distance look like
   next to something you already know — the Moon.

   The picture is drawn in a frame that turns with the year: the Sun is always
   off to the left and the telescope always out to the right, because that is
   the arrangement that makes L2 make sense. Everything in it is at true
   relative scale. */

(function () {
  'use strict';

  var CSM = window.CSM, A = window.ASTRO, SPACE = window.SPACE;
  var $ = function (id) { return document.getElementById(id); };

  if (CSM.sat.kind !== 'deep' || !$('deep')) return;

  var R_EARTH = A.R_EARTH;
  var EARTH_BODY = { key: 'earth', color: '#6fa8e6', radiusKm: 6371, icon: 'earth' };

  /* ------------------------------------------------------------------ */
  /*  The numbers                                                        */
  /* ------------------------------------------------------------------ */

  function fmtKm(km) {
    if (km >= 1e6) return CSM.fmt(km / 1e6, 2) + ' ' + CSM.t('unit.mkm');
    return CSM.fmt(km, 0) + ' ' + CSM.t('unit.km');
  }

  function set(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function paintStats(p) {
    if (!p) return;
    var now = new Date();
    var moonKm = A.moon(now).distance;

    set('v-dist', fmtKm(p.km));
    set('v-moons', CSM.fmt(p.km / moonKm, 1) + '×');
    set('v-rate', p.exact
      ? CSM.fmt(Math.abs(p.kms), 3) + ' ' + CSM.t('unit.kms') + ' ' +
        CSM.t(p.kms >= 0 ? 'deep.outward' : 'deep.inward')
      : '—');
    set('v-sun', CSM.fmt(p.sunKm / A.AU, 3) + ' ' + CSM.t('unit.au'));
    set('v-where', CSM.t(p.exact ? 'deep.measured' : 'deep.computed'));
  }

  /* ------------------------------------------------------------------ */
  /*  Roman's journey                                                    */
  /* ------------------------------------------------------------------ */

  /* Roman left on 30 August 2026 and is still on its way as this is written.
     Rather than freezing that into the copy, the page works out where the
     mission is in its own timeline from the date, so the journey section
     retires itself when the journey ends and nobody has to remember. */
  function paintJourney(p) {
    var box = $('journey');
    if (!box || !CSM.sat.launched) return;

    var launched = Date.parse(CSM.sat.launched);
    if (!isFinite(launched)) { box.hidden = true; return; }

    var days = (Date.now() - launched) / 86400000;
    var cruise = CSM.sat.cruiseDays || 0;
    var commissioning = CSM.sat.commissioningDays || 0;

    if (!cruise || days > cruise + commissioning) { box.hidden = true; return; }
    box.hidden = false;

    /* Measured against where L2 actually is today rather than the round
       number everyone quotes: it moves by ±1.7% over the year, and the page
       already knows the real figure. */
    var target = l2Distance(new Date());
    var arriving = days < cruise;
    var fraction = arriving
      ? Math.max(0, Math.min(1, (p ? p.km : 0) / target))
      : Math.max(0, Math.min(1, (days - cruise) / commissioning));

    set('j-phase', CSM.t(arriving ? 'deep.phase.cruise' : 'deep.phase.commissioning'));
    set('j-day', CSM.t('deep.phase.day').replace('{n}', CSM.fmt(Math.floor(days), 0)));
    set('j-note', arriving
      ? CSM.t('deep.phase.cruiseNote')
          .replace('{pct}', CSM.fmt(fraction * 100, 0))
          .replace('{left}', fmtKm(Math.max(0, target - (p ? p.km : 0))))
      : CSM.t('deep.phase.commissioningNote')
          .replace('{n}', CSM.fmt(Math.max(0, Math.ceil(cruise + commissioning - days)), 0)));

    var bar = $('j-bar');
    if (bar) {
      bar.style.width = (fraction * 100).toFixed(1) + '%';
      var meter = $('j-meter');
      if (meter) {
        meter.setAttribute('aria-valuenow', Math.round(fraction * 100));
        meter.setAttribute('aria-valuetext', CSM.fmt(fraction * 100, 0) + '%');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  The picture                                                        */
  /* ------------------------------------------------------------------ */

  /* half is half the height of the view, in kilometres; cx and cy move the
     centre away from the Earth, which sits at the origin. */
  var view = { cx: 0, cy: 0, half: 9e5 };

  var PRESETS = {
    all:   { fit: true },
    moon:  { half: 4.6e5 },
    earth: { half: 6e4 }
  };

  var MIN_HALF = 8e3, MAX_HALF = 4e6;

  function current() {
    return CSM.position();
  }

  /* The direction L2 lies in, which is the direction away from the Sun. The
     drawing turns with it so the arrangement always reads the same way. */
  function frameAngle(date) {
    var e = A.planets(date).earth;
    return Math.atan2(e.y, e.x);
  }

  function place(km, lonDeg, latDeg, angle) {
    var lon = lonDeg * Math.PI / 180 - angle;
    var lat = (latDeg || 0) * Math.PI / 180;
    var flat = km * Math.cos(lat);
    return { x: flat * Math.cos(lon), y: flat * Math.sin(lon) };
  }

  function draw(v) {
    var c = v.ctx, W = v.W, H = v.H;
    var p = current();
    var now = new Date();

    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1226');
    g.addColorStop(1, '#080e1d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    var scale = (H / 2) / view.half;                       // pixels per km
    function X(kx) { return W / 2 + (kx - view.cx) * scale; }
    function Y(ky) { return H / 2 - (ky - view.cy) * scale; }

    var angle = frameAngle(now);
    var moon = A.moon(now);
    var moonPt = place(moon.distance, moon.lon, moon.lat, angle);
    var sat = p ? place(p.km, p.lon, p.lat, angle) : null;
    var l2Km = l2Distance(now);

    /* Sunlight comes from the left, always. */
    var sunGrad = c.createLinearGradient(0, 0, W * 0.5, 0);
    sunGrad.addColorStop(0, 'rgba(232,163,74,.13)');
    sunGrad.addColorStop(1, 'rgba(232,163,74,0)');
    c.fillStyle = sunGrad;
    c.fillRect(0, 0, W * 0.5, H);

    c.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(232,163,74,.75)';
    c.textAlign = 'left';
    c.fillText('← ' + CSM.t('planet.sun'), 12, 18);

    /* The Moon's orbit: a circle at this scale, which is true to about 5%. */
    var moonR = moon.distance * scale;
    if (moonR > 6 && moonR < Math.max(W, H) * 6) {
      c.strokeStyle = 'rgba(180,196,224,.24)';
      c.lineWidth = 1;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.arc(X(0), Y(0), moonR, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }

    /* Earth to telescope, the distance the page is about. */
    if (sat) {
      c.strokeStyle = 'rgba(232,163,74,.34)';
      c.lineWidth = 1.1;
      c.setLineDash([2, 5]);
      c.beginPath();
      c.moveTo(X(0), Y(0));
      c.lineTo(X(sat.x), Y(sat.y));
      c.stroke();
      c.setLineDash([]);
    }

    /* L2 itself, so the loop the telescope makes around it is visible rather
       than asserted: the mark is the point, the dot is where it really is. */
    var l2x = X(l2Km), l2y = Y(0);
    if (l2x > -60 && l2x < W + 60) {
      c.strokeStyle = 'rgba(160,171,192,.55)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(l2x - 4, l2y); c.lineTo(l2x + 4, l2y);
      c.moveTo(l2x, l2y - 4); c.lineTo(l2x, l2y + 4);
      c.stroke();
      c.fillStyle = 'rgba(160,171,192,.8)';
      c.textAlign = 'center';
      c.fillText('L2', l2x, l2y + 15);
    }

    /* The Earth, drawn as itself where there is room for it. */
    var er = Math.max(2.2, R_EARTH * scale);
    if (er > 5) {
      SPACE.drawBody(c, X(0), Y(0), er, EARTH_BODY, Math.PI);
    } else {
      c.fillStyle = '#6fa8e6';
      c.beginPath();
      c.arc(X(0), Y(0), er, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(223,231,245,.9)';
    c.textAlign = 'right';
    c.fillText(CSM.t('planet.earth'), X(0) - er - 6, Y(0));

    /* The Moon. */
    var mx = X(moonPt.x), my = Y(moonPt.y);
    if (mx > -40 && mx < W + 40 && my > -40 && my < H + 40) {
      c.fillStyle = '#cdd5e4';
      c.beginPath();
      c.arc(mx, my, Math.max(1.8, 1737 * scale), 0, Math.PI * 2);
      c.fill();
      if (moonR > 26) {
        c.fillStyle = 'rgba(205,213,228,.85)';
        c.textAlign = 'center';
        c.fillText(CSM.t('ladder.moon'), mx, my - 11);
      }
    }

    /* The telescope. */
    if (sat) {
      var sx = X(sat.x), sy = Y(sat.y);
      c.fillStyle = 'rgba(232,163,74,.22)';
      c.beginPath(); c.arc(sx, sy, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8a34a';
      c.beginPath(); c.arc(sx, sy, 3.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f3c98f';
      c.textAlign = sx > W - 90 ? 'right' : 'left';
      var lx = sx > W - 90 ? sx - 10 : sx + 10;
      c.fillText(CSM.t('sat.short'), lx, sy - 12);
      c.fillStyle = 'rgba(244,234,216,.75)';
      c.fillText(fmtKm(p.km), lx, sy + 2);
    }

    SPACE.drawScaleBar(c, W, H, scale * A.AU);
  }

  /* ------------------------------------------------------------------ */

  /* The distance to L2 today, which is where the Earth's own distance from the
     Sun puts it. */
  function l2Distance(date) {
    var e = A.planets(date).earth;
    return Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z) * A.AU * window.L2.L2_FRACTION;
  }

  /* The default view holds the whole story: the Earth at one end, and at the
     other whichever is further away — the telescope, or the L2 point it is
     still on its way to. A spacecraft in transit with its destination cropped
     off the edge would be a picture of nothing in particular. */
  function fit() {
    var p = current();
    var now = new Date();
    var far = Math.max(p ? p.km : 0, l2Distance(now), 4.2e5) * 1.08;
    view.half = far * 0.62;
    view.cx = far * 0.46;
    view.cy = 0;
  }

  var deepView = SPACE.makeViewer('deep', 'deep-zoom', {
    defaultPreset: 'all',
    presets: PRESETS,
    draw: draw,
    setPreset: function (v, preset) {
      if (preset.fit) { fit(); return; }
      view.half = preset.half;
      view.cx = 0;
      view.cy = 0;
    },
    zoomBy: function (v, f) {
      view.half = Math.max(MIN_HALF, Math.min(MAX_HALF, view.half * f));
    },
    panBy: function (v, dx, dy) {
      var perPx = view.half / (v.H / 2);
      view.cx -= dx * perPx;
      view.cy += (dy || 0) * perPx;
    },
    readout: function (v) {
      /* Called once before the canvas has been measured, when the aspect ratio
         is still nought over nought. */
      if (!v.H || !v.W) return '';
      return SPACE.fmtAxis(view.half * 2 * (v.W / v.H));
    }
  });

  /* ------------------------------------------------------------------ */

  function refresh() {
    var p = current();
    paintStats(p);
    paintJourney(p);
    deepView.redraw();
    deepView.sync();
  }

  CSM.on('position', refresh);
  CSM.on('lang', function () { deepView.sync(); refresh(); });

  deepView.applyPreset('all');
  deepView.size();
  deepView.sync();      // the readout needs a canvas that has been measured
  refresh();
})();
