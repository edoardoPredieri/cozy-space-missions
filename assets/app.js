/* Cozy Space Missions — live ISS position
   Data: https://api.wheretheiss.at (no key, open CORS)
   No external dependencies. */

(function () {
  'use strict';

  var SAT = window.CSM_SAT;
  var API = 'https://api.wheretheiss.at/v1/satellites/' + SAT.norad;
  var REFRESH_MS = 5000;          // position
  var TRACK_MS = 3 * 60 * 1000;   // ground track, when it has to be fetched
  var STORE_KEY = 'csm.lang';
  var propagator = null;          // set once the orbital elements are in, for TLE missions
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ */
  /*  Tiny shared bus, so observer.js and space.js can follow along      */
  /* ------------------------------------------------------------------ */

  var listeners = { lang: [], position: [], place: [], propagator: [] };
  var resizeFns = [];
  var resizePending = false;

  function onResize(fn) { resizeFns.push(fn); }

  window.addEventListener('resize', function () {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(function () {
      resizePending = false;
      resizeFns.forEach(function (fn) {
        try { fn(); } catch (e) {}
      });
    });
  }, { passive: true });

  /* One polite live region for the whole page: ambient updates (the clock in the
     status pill) must not be announced, only things the reader needs to know. */
  function announce(text) {
    var el = document.getElementById('announcer');
    if (el) el.textContent = text;
  }
  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { /* one bad listener must not stop the rest */ }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Language                                                           */
  /* ------------------------------------------------------------------ */

  var lang = 'en';
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved && window.I18N[saved]) lang = saved;
  } catch (e) { /* private mode: keep the default */ }

  /* Most strings are shared; a mission can override any of them with a
     "<mission>." prefix, so only the copy that actually differs is duplicated. */
  function t(key) {
    var d = window.I18N[lang] || window.I18N.en;
    var en = window.I18N.en;
    var scoped = SAT.id + '.' + key;
    if (scoped in d) return d[scoped];
    if (scoped in en) return en[scoped];
    if (key in d) return d[key];
    return (key in en) ? en[key] : key;
  }

  function applyLang(code) {
    if (!window.I18N[code]) return;
    lang = code;
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}

    document.documentElement.lang = t('html.lang');
    document.title = t('doc.title');
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', t('doc.desc'));

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].innerHTML = t(nodes[i].getAttribute('data-i18n'));
    }
    ['aria-label', 'placeholder', 'title'].forEach(function (attr) {
      var list = document.querySelectorAll('[data-i18n-' + attr + ']');
      for (var j = 0; j < list.length; j++) {
        list[j].setAttribute(attr, t(list[j].getAttribute('data-i18n-' + attr)));
      }
    });

    var btns = $('lang').querySelectorAll('button');
    for (var k = 0; k < btns.length; k++) {
      var on = btns[k].getAttribute('data-lang') === code;
      btns[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[k].classList.toggle('is-on', on);
    }

    paintStatus();
    paintStats();
    emit('lang', code);
  }

  $('lang').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-lang]') : null;
    if (b) applyLang(b.getAttribute('data-lang'));
  });

  /* ------------------------------------------------------------------ */
  /*  Starfield                                                          */
  /* ------------------------------------------------------------------ */

  (function starfield() {
    var cv = $('stars');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var stars = [];
    var w = 0, h = 0, dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(260, (w * h) / 7000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.1 + 0.35,
          a: Math.random() * 0.5 + 0.2,
          sp: Math.random() * 0.0011 + 0.0004,
          ph: Math.random() * Math.PI * 2,
          warm: Math.random() < 0.22
        });
      }
      if (reduceMotion) draw(0);
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(time * s.sp + s.ph);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.warm ? '#f3c98f' : '#dfe7f5';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduceMotion) requestAnimationFrame(draw);
    }

    onResize(resize);
    resize();
    if (!reduceMotion) requestAnimationFrame(draw);
  })();

  /* ------------------------------------------------------------------ */
  /*  Map                                                                */
  /* ------------------------------------------------------------------ */

  var cv = $('map');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0;

  var state = {
    pos: null,    // {latitude, longitude, altitude, velocity, visibility, footprint, solar_lat, solar_lon}
    track: [],    // [{lat, lon, t}] as the API returns it, six minutes apart
    dense: [],    // the same path resampled every 30s on the sphere, for drawing
    place: null   // the observer, once they have told us where they are
  };

  /* The API hands back a point every few minutes. Drawing straight lines between
     those would put a visible kink at each one, so the path is resampled along
     the sphere first and only then drawn. */
  function densify(track, stepSec) {
    if (track.length < 2) return track.slice();
    var out = [];
    var t0 = track[0].t, t1 = track[track.length - 1].t;
    for (var t = t0; t <= t1; t += stepSec) {
      var s = window.ASTRO.interpolateTrack(track, t);
      if (s) out.push(s);
    }
    return out;
  }

  // Equirectangular projection: the width always covers 360°, the height decides
  // how much latitude stays visible (the ISS never passes 51.6°, so the poles are cropped).
  var LAT_MAX = 72;

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = cv.getBoundingClientRect();
    W = Math.max(300, Math.round(rect.width));
    H = Math.max(120, Math.round(rect.height));
    LAT_MAX = Math.min(90, 180 * H / W);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function px(lon) { return (lon + 180) / 360 * W; }
  function py(lat) { return (LAT_MAX - lat) / (LAT_MAX * 2) * H; }

  /* --- day/night terminator ----------------------------------------- */

  function terminatorLine(solarLat, solarLon) {
    var dec = solarLat;
    if (Math.abs(dec) < 0.6) dec = dec >= 0 ? 0.6 : -0.6;
    var tanDec = Math.tan(dec * Math.PI / 180);
    var pts = [];
    for (var lon = -180; lon <= 180; lon += 2) {
      var d = (lon - solarLon) * Math.PI / 180;
      var lat = Math.atan(-Math.cos(d) / tanDec) * 180 / Math.PI;
      pts.push([lon, Math.max(-90, Math.min(90, lat))]);
    }
    return pts;
  }

  function nightPath(solarLat, solarLon) {
    var pts = terminatorLine(solarLat, solarLon);
    // sun north of the equator → night lies south of the terminator, and vice versa
    var southIsNight = solarLat > 0;
    ctx.beginPath();
    ctx.moveTo(px(pts[0][0]), py(pts[0][1]));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i][0]), py(pts[i][1]));
    if (southIsNight) {
      ctx.lineTo(W, H); ctx.lineTo(0, H);
    } else {
      ctx.lineTo(W, 0); ctx.lineTo(0, 0);
    }
    ctx.closePath();
  }

  /* --- visibility circle -------------------------------------------- */

  function footprintRing(lat, lon, footprintKm) {
    var R = 6371;
    var rho = (footprintKm / 2) / R;          // angular radius, radians
    var la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
    var out = [];
    for (var b = 0; b <= 360; b += 6) {
      var br = b * Math.PI / 180;
      var la2 = Math.asin(Math.sin(la1) * Math.cos(rho) +
                          Math.cos(la1) * Math.sin(rho) * Math.cos(br));
      var lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(rho) * Math.cos(la1),
                                 Math.cos(rho) - Math.sin(la1) * Math.sin(la2));
      out.push([((lo2 * 180 / Math.PI + 540) % 360) - 180, la2 * 180 / Math.PI]);
    }
    return out;
  }

  /* Catmull-Rom through the points, emitted as cubic Béziers: the path keeps a
     continuous tangent at every sample, so no corner ever shows. */
  function smoothPath(c, pts) {
    var n = pts.length;
    if (n < 2) return;
    c.moveTo(pts[0][0], pts[0][1]);
    if (n === 2) { c.lineTo(pts[1][0], pts[1][1]); return; }
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[i > 0 ? i - 1 : 0];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2 < n ? i + 2 : n - 1];
      c.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]
      );
    }
  }

  /* Splits a lon/lat path where it crosses the antimeridian, then draws each
     run as one smooth curve. */
  function strokeWrapped(points) {
    var runs = [], run = [], prev = null;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (prev && Math.abs(p[0] - prev[0]) > 180) { runs.push(run); run = []; }
      run.push([px(p[0]), py(p[1])]);
      prev = p;
    }
    if (run.length) runs.push(run);

    ctx.beginPath();
    for (var r = 0; r < runs.length; r++) smoothPath(ctx, runs[r]);
    ctx.stroke();
  }

  /* --- drawing ------------------------------------------------------ */

  function render() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);

    // ocean
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c1830');
    g.addColorStop(0.55, '#0e1c34');
    g.addColorStop(1, '#0b1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // land
    var world = window.WORLD;
    if (world && world.c) {
      ctx.fillStyle = '#1b2a45';
      ctx.strokeStyle = 'rgba(140,170,215,.20)';
      ctx.lineWidth = 0.6;
      for (var c = 0; c < world.c.length; c++) {
        var polys = world.c[c].p;
        for (var q = 0; q < polys.length; q++) {
          var rings = polys[q];
          ctx.beginPath();
          for (var r = 0; r < rings.length; r++) {
            var ring = rings[r];
            for (var i = 0; i < ring.length; i++) {
              var x = px(ring[i][0]), y = py(ring[i][1]);
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
          }
          ctx.fill('evenodd');
          ctx.stroke();
        }
      }
    }

    // night: a fill, a boundary and a texture, so it never reads by colour alone
    if (state.pos && state.pos.solar_lat != null) {
      var sLat = state.pos.solar_lat, sLon = state.pos.solar_lon;

      ctx.save();
      nightPath(sLat, sLon);
      ctx.fillStyle = 'rgba(4,8,18,.46)';
      ctx.fill();

      // city lights, only where it is dark
      ctx.clip();
      var lights = world && world.l;
      if (lights) {
        for (var li = 0; li < lights.length; li++) {
          var L = lights[li];
          ctx.globalAlpha = 0.16 + L[2] * 0.42;
          ctx.fillStyle = '#ffcf8e';
          ctx.beginPath();
          ctx.arc(px(L[0]), py(L[1]), 0.55 + L[2] * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // the terminator itself: a warm twilight rim along the day/night line
      var line = terminatorLine(sLat, sLon);
      ctx.save();
      ctx.strokeStyle = 'rgba(243,201,143,.16)';
      ctx.lineWidth = 7;
      ctx.filter = 'blur(3px)';
      strokeWrapped(line);
      ctx.restore();

      ctx.strokeStyle = 'rgba(243,201,143,.40)';
      ctx.lineWidth = 1;
      strokeWrapped(line);
    }

    // graticule
    ctx.strokeStyle = 'rgba(242,232,213,.045)';
    ctx.lineWidth = 1;
    for (var lo = -150; lo <= 150; lo += 30) {
      ctx.beginPath(); ctx.moveTo(px(lo), 0); ctx.lineTo(px(lo), H); ctx.stroke();
    }
    for (var la = -60; la <= 60; la += 30) {
      ctx.beginPath(); ctx.moveTo(0, py(la)); ctx.lineTo(W, py(la)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(242,232,213,.10)';
    ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0)); ctx.stroke();

    // ground track
    if (state.dense.length > 1) {
      var now = Date.now() / 1000;
      var past = state.dense.filter(function (p) { return p.t <= now; });
      var next = state.dense.filter(function (p) { return p.t >= now; });

      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(232,163,74,.45)';
      strokeWrapped(past.map(function (p) { return [p.lon, p.lat]; }));

      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(232,163,74,.30)';
      strokeWrapped(next.map(function (p) { return [p.lon, p.lat]; }));
      ctx.setLineDash([]);
    }

    // where the reader is, once they have said
    if (state.place) {
      var ox = px(state.place.lon), oy = py(state.place.lat);

      var halo = ctx.createRadialGradient(ox, oy, 0, ox, oy, 15);
      halo.addColorStop(0, 'rgba(141,189,180,.42)');
      halo.addColorStop(1, 'rgba(141,189,180,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(ox, oy, 15, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = 'rgba(214,240,235,.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ox, oy, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(214,240,235,.95)';
      ctx.beginPath(); ctx.arc(ox, oy, 1.6, 0, Math.PI * 2); ctx.fill();

      ctx.font = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(214,240,235,.85)';
      ctx.textBaseline = 'middle';
      var olx = ox + 10;
      if (olx + 34 > W) { ctx.textAlign = 'right'; olx = ox - 10; } else ctx.textAlign = 'left';
      ctx.fillText(t('map.you'), olx, oy);
      ctx.textAlign = 'left';
    }

    // the Station
    if (state.pos) {
      var lat = state.pos.latitude, lon = state.pos.longitude;

      if (state.pos.footprint) {
        ctx.strokeStyle = 'rgba(243,201,143,.30)';
        ctx.lineWidth = 1;
        strokeWrapped(footprintRing(lat, lon, state.pos.footprint));
      }

      var x = px(lon), y = py(lat);
      var glow = ctx.createRadialGradient(x, y, 0, x, y, 26);
      glow.addColorStop(0, 'rgba(232,163,74,.55)');
      glow.addColorStop(1, 'rgba(232,163,74,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#f6d9a8';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,214,.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke();

      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,240,214,.85)';
      ctx.textBaseline = 'middle';
      var lx = x + 13;
      if (lx + 30 > W) { ctx.textAlign = 'right'; lx = x - 13; } else ctx.textAlign = 'left';
      ctx.fillText('ISS', lx, y);
      ctx.textAlign = 'left';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Where it is (offline point-in-polygon)                             */
  /* ------------------------------------------------------------------ */

  var OCEANS = [
    { k: 'ocean.pacific',  lon: [-180, -70], lat: [-60, 66] },
    { k: 'ocean.pacific',  lon: [120, 180],  lat: [-60, 66] },
    { k: 'ocean.atlantic', lon: [-70, 20],   lat: [-60, 68] },
    { k: 'ocean.indian',   lon: [20, 120],   lat: [-60, 30] },
    { k: 'ocean.southern', lon: [-180, 180], lat: [-90, -60] },
    { k: 'ocean.arctic',   lon: [-180, 180], lat: [66, 90] }
  ];

  function inRing(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function placeAt(lat, lon) {
    var world = window.WORLD;
    if (world && world.c) {
      for (var c = 0; c < world.c.length; c++) {
        var country = world.c[c], polys = country.p;
        for (var q = 0; q < polys.length; q++) {
          var rings = polys[q];
          if (inRing(lon, lat, rings[0])) {
            var hole = false;
            for (var r = 1; r < rings.length; r++) {
              if (inRing(lon, lat, rings[r])) { hole = true; break; }
            }
            if (!hole) return (lang === 'it' && country.it) ? country.it : country.n;
          }
        }
      }
    }
    for (var o = 0; o < OCEANS.length; o++) {
      var z = OCEANS[o];
      if (lon >= z.lon[0] && lon <= z.lon[1] && lat >= z.lat[0] && lat <= z.lat[1]) {
        return t(z.k);
      }
    }
    return t('ocean.open');
  }

  /* ------------------------------------------------------------------ */
  /*  Data                                                               */
  /* ------------------------------------------------------------------ */

  var status = { kind: 'listening', at: null };

  function paintStatus() {
    var text;
    if (status.kind === 'updated' && status.at) {
      text = t('status.updated').replace('{time}', status.at.toLocaleTimeString(t('locale')));
    } else if (status.kind === 'lost') {
      text = t('status.lost');
    } else if (status.kind === 'elements') {
      text = t('status.elements');
    } else if (status.kind === 'noElements') {
      text = t('status.noElements');
    } else {
      text = t('status.listening');
    }
    $('status-text').textContent = text;
    $('status').classList.toggle('is-error', status.kind === 'lost' || status.kind === 'noElements');
  }

  function fmt(n, d) {
    return Number(n).toLocaleString(t('locale'), {
      minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true
    });
  }

  function paintStats() {
    var p = state.pos;
    if (!p) return;
    $('v-lat').textContent = fmt(Math.abs(p.latitude), 2) + '° ' + t(p.latitude >= 0 ? 'dir.n' : 'dir.s');
    $('v-lon').textContent = fmt(Math.abs(p.longitude), 2) + '° ' + t(p.longitude >= 0 ? 'dir.e' : 'dir.w');
    $('v-alt').textContent = fmt(p.altitude, 0) + ' ' + t('unit.km');
    $('v-vel').textContent = fmt(p.velocity, 0) + ' ' + t('unit.kmh');
    $('v-vis').textContent = t(p.visibility === 'daylight' ? 'vis.day' : 'vis.night');
    $('v-foot').textContent = p.footprint ? fmt(p.footprint, 0) + ' ' + t('unit.across') : '—';
    $('overhead-place').textContent = placeAt(p.latitude, p.longitude);
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var failures = 0;

  function accept(d) {
    state.pos = d;
    failures = 0;
    status = { kind: 'updated', at: new Date() };
    paintStats();
    paintStatus();
    render();
    emit('position', d);
  }

  function lost() {
    failures++;
    if (failures === 2) {
      status.kind = 'lost';
      paintStatus();
      announce(t('status.lost'));
    }
  }

  function updatePosition() {
    if (SAT.source === 'tle') {
      if (!propagator) return Promise.resolve();
      var p = propagator.at(new Date());
      if (p) accept(p); else lost();
      return Promise.resolve();
    }
    return fetchJSON(API + '?units=kilometers').then(accept).catch(lost);
  }

  function updateTrack() {
    var now = Math.floor(Date.now() / 1000);

    /* With the elements in hand the whole track is arithmetic: no requests,
       no rate limit, and a point every thirty seconds instead of every six
       minutes. */
    if (SAT.source === 'tle') {
      if (!propagator) return Promise.resolve();
      var local = propagator.track(now - 55 * 60, now + 55 * 60, 30);
      if (local.length) { state.track = local; state.dense = local; render(); }
      return Promise.resolve();
    }

    var stamps = [];
    for (var m = -55; m <= 55; m += 6) stamps.push(now + m * 60);
    var groups = [stamps.slice(0, 10), stamps.slice(10)];

    var reqs = groups.filter(function (g) { return g.length; }).map(function (g) {
      return fetchJSON(API + '/positions?timestamps=' + g.join(',') + '&units=kilometers');
    });

    return Promise.all(reqs)
      .then(function (parts) {
        var all = [];
        parts.forEach(function (arr) {
          (arr || []).forEach(function (p) {
            all.push({ lat: p.latitude, lon: p.longitude, t: p.timestamp });
          });
        });
        all.sort(function (a, b) { return a.t - b.t; });
        if (all.length) {
          state.track = all;
          state.dense = densify(all, 30);
          render();
        }
      })
      .catch(function () { /* the track is a bonus: fail quietly */ });
  }

  /* ------------------------------------------------------------------ */

  window.CSM = {
    API: API,
    sat: SAT,
    propagator: function () { return propagator; },
    t: t,
    fmt: fmt,
    fetchJSON: fetchJSON,
    announce: announce,
    onResize: onResize,
    emit: emit,
    smoothPath: smoothPath,
    lang: function () { return lang; },
    position: function () { return state.pos; },
    on: function (name, fn) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(fn);
      if (name === 'position' && state.pos) fn(state.pos);
      if (name === 'propagator' && propagator) fn(propagator);
    }
  };

  listeners.place.push(function (p) {
    state.place = p;
    var chip = $('legend-you');
    if (chip) chip.hidden = !p;
    render();
  });

  onResize(sizeCanvas);
  applyLang(lang);
  sizeCanvas();

  function start() {
    updatePosition().then(updateTrack);
    setInterval(updatePosition, REFRESH_MS);
    setInterval(updateTrack, TRACK_MS);
  }

  if (SAT.source === 'tle') {
    status = { kind: 'elements', at: null };
    paintStatus();
    window.TLE.load(SAT)
      .then(function (p) {
        propagator = p;
        emit('propagator', p);
        start();
      })
      .catch(function () {
        status.kind = 'noElements';
        paintStatus();
        announce(t('status.noElements'));
      });
  } else {
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updatePosition();
  });

  /* Sections fade up as they come into view — 350ms, ease-out, opacity and
     transform only. Under reduced motion they are simply already there. */
  (function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('is-in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  })();
})();
