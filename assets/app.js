/* Cozy Space Missions — posizione live della ISS
   Dati: https://api.wheretheiss.at (nessuna chiave, CORS aperto)
   Nessuna dipendenza esterna. */

(function () {
  'use strict';

  var ISS_ID = 25544;
  var API = 'https://api.wheretheiss.at/v1/satellites/' + ISS_ID;
  var REFRESH_MS = 5000;          // posizione
  var TRACK_MS = 3 * 60 * 1000;   // traccia a terra
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ */
  /*  Cielo stellato                                                     */
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

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(t * s.sp + s.ph);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.warm ? '#f3c98f' : '#dfe7f5';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduceMotion) requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize, { passive: true });
    resize();
    if (!reduceMotion) requestAnimationFrame(draw);
  })();

  /* ------------------------------------------------------------------ */
  /*  Mappa                                                              */
  /* ------------------------------------------------------------------ */

  var cv = $('map');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0;

  var state = {
    pos: null,       // {latitude, longitude, altitude, velocity, visibility, footprint, solar_lat, solar_lon}
    track: [],       // [{lat, lon, t}]
    place: null
  };

  // proiezione equirettangolare: la larghezza copre 360°, l'altezza decide
  // quanta latitudine resta visibile (la ISS non supera i 51,6°, i poli si tagliano)
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

  /* --- terminatore giorno/notte ------------------------------------- */

  function nightPath(solarLat, solarLon) {
    var dec = solarLat;
    if (Math.abs(dec) < 0.6) dec = dec >= 0 ? 0.6 : -0.6;
    var tanDec = Math.tan(dec * Math.PI / 180);
    var pts = [];
    for (var lon = -180; lon <= 180; lon += 2) {
      var d = (lon - solarLon) * Math.PI / 180;
      var lat = Math.atan(-Math.cos(d) / tanDec) * 180 / Math.PI;
      pts.push([lon, Math.max(-90, Math.min(90, lat))]);
    }
    // se il sole è a nord, la notte è a sud del terminatore (e viceversa)
    var southIsNight = dec > 0;
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

  /* --- cerchio di visibilità ---------------------------------------- */

  function footprintRing(lat, lon, footprintKm) {
    var R = 6371;
    var rho = (footprintKm / 2) / R;          // raggio angolare in radianti
    var la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
    var out = [];
    for (var b = 0; b <= 360; b += 4) {
      var br = b * Math.PI / 180;
      var la2 = Math.asin(Math.sin(la1) * Math.cos(rho) +
                          Math.cos(la1) * Math.sin(rho) * Math.cos(br));
      var lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(rho) * Math.cos(la1),
                                 Math.cos(rho) - Math.sin(la1) * Math.sin(la2));
      out.push([((lo2 * 180 / Math.PI + 540) % 360) - 180, la2 * 180 / Math.PI]);
    }
    return out;
  }

  function strokeWrapped(points, close) {
    ctx.beginPath();
    var started = false, prev = null;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (prev && Math.abs(p[0] - prev[0]) > 180) { started = false; }
      if (!started) { ctx.moveTo(px(p[0]), py(p[1])); started = true; }
      else ctx.lineTo(px(p[0]), py(p[1]));
      prev = p;
    }
    ctx.stroke();
  }

  /* --- disegno ------------------------------------------------------ */

  function render() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);

    // oceano
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c1830');
    g.addColorStop(0.55, '#0e1c34');
    g.addColorStop(1, '#0b1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // terre emerse
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

    // notte
    if (state.pos && state.pos.solar_lat != null) {
      ctx.save();
      nightPath(state.pos.solar_lat, state.pos.solar_lon);
      ctx.fillStyle = 'rgba(4,8,18,.46)';
      ctx.fill();
      ctx.restore();
    }

    // griglia leggera
    ctx.strokeStyle = 'rgba(242,232,213,.045)';
    ctx.lineWidth = 1;
    for (var lo = -150; lo <= 150; lo += 30) {
      ctx.beginPath(); ctx.moveTo(px(lo), 0); ctx.lineTo(px(lo), H); ctx.stroke();
    }
    for (var la = -60; la <= 60; la += 30) {
      ctx.beginPath(); ctx.moveTo(0, py(la)); ctx.lineTo(W, py(la)); ctx.stroke();
    }
    // equatore
    ctx.strokeStyle = 'rgba(242,232,213,.10)';
    ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0)); ctx.stroke();

    // traccia a terra
    if (state.track.length > 1) {
      var now = Date.now() / 1000;
      var past = state.track.filter(function (p) { return p.t <= now; });
      var next = state.track.filter(function (p) { return p.t >= now; });

      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(232,163,74,.45)';
      strokeWrapped(past.map(function (p) { return [p.lon, p.lat]; }));

      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(232,163,74,.30)';
      strokeWrapped(next.map(function (p) { return [p.lon, p.lat]; }));
      ctx.setLineDash([]);
    }

    // ISS
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
      var label = 'ISS';
      var lx = x + 13;
      if (lx + 30 > W) { ctx.textAlign = 'right'; lx = x - 13; } else ctx.textAlign = 'left';
      ctx.fillText(label, lx, y);
      ctx.textAlign = 'left';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Dove si trova (point in polygon offline)                           */
  /* ------------------------------------------------------------------ */

  var OCEANS = [
    { n: 'Oceano Pacifico', lon: [-180, -70], lat: [-60, 66] },
    { n: 'Oceano Pacifico', lon: [120, 180], lat: [-60, 66] },
    { n: 'Oceano Atlantico', lon: [-70, 20], lat: [-60, 68] },
    { n: 'Oceano Indiano', lon: [20, 120], lat: [-60, 30] },
    { n: 'Oceano Antartico', lon: [-180, 180], lat: [-90, -60] },
    { n: 'Oceano Artico', lon: [-180, 180], lat: [66, 90] }
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
        var polys = world.c[c].p;
        for (var q = 0; q < polys.length; q++) {
          var rings = polys[q];
          if (inRing(lon, lat, rings[0])) {
            var hole = false;
            for (var r = 1; r < rings.length; r++) {
              if (inRing(lon, lat, rings[r])) { hole = true; break; }
            }
            if (!hole) return { name: world.c[c].n, land: true };
          }
        }
      }
    }
    for (var o = 0; o < OCEANS.length; o++) {
      var z = OCEANS[o];
      if (lon >= z.lon[0] && lon <= z.lon[1] && lat >= z.lat[0] && lat <= z.lat[1]) {
        return { name: z.n, land: false };
      }
    }
    return { name: 'mare aperto', land: false };
  }

  /* ------------------------------------------------------------------ */
  /*  Dati                                                               */
  /* ------------------------------------------------------------------ */

  function setStatus(text, isError) {
    $('status-text').textContent = text;
    $('status').classList.toggle('is-error', !!isError);
  }

  function fmt(n, d) {
    return Number(n).toLocaleString('it-IT', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }

  function paintStats() {
    var p = state.pos;
    if (!p) return;
    $('v-lat').textContent = fmt(Math.abs(p.latitude), 2) + '° ' + (p.latitude >= 0 ? 'N' : 'S');
    $('v-lon').textContent = fmt(Math.abs(p.longitude), 2) + '° ' + (p.longitude >= 0 ? 'E' : 'O');
    $('v-alt').textContent = fmt(p.altitude, 0) + ' km';
    $('v-vel').textContent = fmt(p.velocity, 0) + ' km/h';
    $('v-vis').textContent = p.visibility === 'daylight' ? 'alla luce del Sole' : 'nell’ombra della Terra';
    $('v-foot').textContent = p.footprint ? fmt(p.footprint, 0) + ' km di diametro' : '—';

    $('overhead-place').textContent = placeAt(p.latitude, p.longitude).name;
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var failures = 0;

  function updatePosition() {
    return fetchJSON(API + '?units=kilometers')
      .then(function (d) {
        state.pos = d;
        failures = 0;
        paintStats();
        render();
        setStatus('aggiornato alle ' + new Date().toLocaleTimeString('it-IT'));
      })
      .catch(function () {
        failures++;
        if (failures >= 2) setStatus('connessione persa, riprovo…', true);
      });
  }

  function updateTrack() {
    var now = Math.floor(Date.now() / 1000);
    var stamps = [];
    for (var m = -55; m <= 55; m += 6) stamps.push(now + m * 60);
    var a = stamps.slice(0, 10), b = stamps.slice(10);

    var reqs = [a, b].filter(function (g) { return g.length; }).map(function (g) {
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
        all.sort(function (x, y) { return x.t - y.t; });
        if (all.length) { state.track = all; render(); }
      })
      .catch(function () { /* la traccia è un extra: silenzio */ });
  }

  /* ------------------------------------------------------------------ */

  window.addEventListener('resize', sizeCanvas, { passive: true });
  sizeCanvas();
  setStatus('in ascolto…');

  updatePosition().then(updateTrack);
  setInterval(updatePosition, REFRESH_MS);
  setInterval(updateTrack, TRACK_MS);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updatePosition();
  });
})();
