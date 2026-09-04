/* Cozy Space Missions — "from where you are"
   Geocoding through OpenStreetMap / Nominatim, or the browser's own position.
   Look angles and pass predictions are worked out locally in assets/astro.js. */

(function () {
  'use strict';

  var CSM = window.CSM, A = window.ASTRO;
  var $ = function (id) { return document.getElementById(id); };

  var STORE_KEY = 'csm.place';
  var GEOCODE = 'https://nominatim.openstreetmap.org/search';

  var PASS_HOURS = 12;
  var PASS_STEP_MIN = 6;      // sampling step asked of the API
  var PASS_FINE_SEC = 20;     // resolution we interpolate to, locally
  var MIN_ELEVATION = 10;     // degrees: below this a pass is not worth the walk outside
  var TWILIGHT = -6;          // sun elevation under which your sky is dark enough
  var REQUEST_GAP_MS = 1300;  // the API asks for about one call a second
  var PASS_TTL_MS = 20 * 60 * 1000;

  var place = null;           // {lat, lon, label, sub}
  var passes = null;          // [{start, max, end, maxEl, azStart, azMax, azEnd, visible}]
  var passesAt = 0;
  var passesBusy = false;

  /* ------------------------------------------------------------------ */
  /*  Storage                                                            */
  /* ------------------------------------------------------------------ */

  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      if (p && isFinite(p.lat) && isFinite(p.lon)) place = p;
    }
  } catch (e) { /* private mode, or nothing saved yet */ }

  function savePlace() {
    try {
      if (place) localStorage.setItem(STORE_KEY, JSON.stringify(place));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function compass(az) {
    var names = CSM.t('compass').split(',');
    return names[Math.round(az / 22.5) % 16].trim();
  }

  function clock(date) {
    return date.toLocaleTimeString(CSM.t('locale'), { hour: '2-digit', minute: '2-digit' });
  }

  function dayLabel(date) {
    var today = new Date();
    var tomorrow = new Date(today.getTime() + 86400000);
    if (date.toDateString() === today.toDateString()) return '';
    if (date.toDateString() === tomorrow.toDateString()) return CSM.t('pass.tomorrow') + ' ';
    return date.toLocaleDateString(CSM.t('locale'), { weekday: 'short' }) + ' ';
  }

  function showError(key, detail) {
    var el = $('place-err');
    el.textContent = detail ? CSM.t(key) + ' ' + detail : CSM.t(key);
    el.hidden = false;
  }
  function clearError() { $('place-err').hidden = true; }

  /* ------------------------------------------------------------------ */
  /*  Geocoding                                                          */
  /* ------------------------------------------------------------------ */

  function search(query) {
    var btn = $('place-submit');
    btn.disabled = true;
    clearError();
    $('place-results').hidden = true;

    var url = GEOCODE + '?format=jsonv2&limit=5&accept-language=' +
      encodeURIComponent(CSM.lang()) + '&q=' + encodeURIComponent(query);

    return CSM.fetchJSON(url)
      .then(function (list) {
        btn.disabled = false;
        if (!list || !list.length) { showError('obs.err.none'); return; }
        renderResults(list);
      })
      .catch(function () {
        btn.disabled = false;
        showError('obs.err.net');
      });
  }

  function renderResults(list) {
    var ul = $('place-results');
    ul.innerHTML = '';
    list.forEach(function (r) {
      var parts = String(r.display_name || '').split(',');
      var head = parts.shift().trim();
      var sub = parts.join(',').trim();

      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.appendChild(document.createTextNode(head));
      if (sub) {
        var s = document.createElement('span');
        s.className = 'r-sub';
        s.textContent = sub;
        b.appendChild(s);
      }
      b.addEventListener('click', function () {
        setPlace({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), label: head, sub: sub });
        ul.hidden = true;
        $('place-input').value = '';
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  function locate() {
    var btn = $('locate-btn');
    if (!navigator.geolocation) { showError('obs.err.geo'); return; }
    clearError();
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        btn.disabled = false;
        setPlace({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: null,          // resolved to "your position" at paint time
          sub: null
        });
      },
      function () { btn.disabled = false; showError('obs.err.denied'); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Passes                                                             */
  /* ------------------------------------------------------------------ */

  function fetchTrack(onProgress) {
    var now = Math.floor(Date.now() / 1000);
    var total = Math.round(PASS_HOURS * 60 / PASS_STEP_MIN) + 1;
    var stamps = [];
    for (var i = 0; i < total; i++) stamps.push(now + i * PASS_STEP_MIN * 60);

    var groups = [];
    for (var g = 0; g < stamps.length; g += 10) groups.push(stamps.slice(g, g + 10));

    var samples = [];
    var chain = Promise.resolve();

    groups.forEach(function (group, idx) {
      chain = chain.then(function () {
        return CSM.fetchJSON(CSM.API + '/positions?timestamps=' + group.join(',') + '&units=kilometers')
          .then(function (arr) {
            (arr || []).forEach(function (p) {
              samples.push({ t: p.timestamp, lat: p.latitude, lon: p.longitude, alt: p.altitude });
            });
            onProgress(idx + 1, groups.length);
            if (idx < groups.length - 1) {
              return new Promise(function (r) { setTimeout(r, REQUEST_GAP_MS); });
            }
          });
      });
    });

    return chain.then(function () {
      samples.sort(function (a, b) { return a.t - b.t; });
      return samples;
    });
  }

  function findPasses(samples, lat, lon) {
    if (samples.length < 4) return [];
    var t0 = samples[0].t, t1 = samples[samples.length - 1].t;
    var out = [], current = null;

    for (var t = t0; t <= t1; t += PASS_FINE_SEC) {
      var s = A.interpolateTrack(samples, t);
      if (!s) continue;
      var look = A.lookAngles(lat, lon, s.lat, s.lon, s.alt);

      if (look.elevation >= MIN_ELEVATION) {
        if (!current) current = { start: t, maxEl: -90, azStart: look.azimuth, samples: [] };
        if (current.samples.length < 120) {
          current.samples.push({ az: look.azimuth, el: look.elevation });
        }
        if (look.elevation > current.maxEl) {
          current.maxEl = look.elevation;
          current.max = t;
          current.azMax = look.azimuth;
          current.satLat = s.lat; current.satLon = s.lon; current.satAlt = s.alt;
        }
        current.end = t;
        current.azEnd = look.azimuth;
      } else if (current) {
        out.push(current);
        current = null;
        if (out.length >= 6) break;
      }
    }
    if (current) out.push(current);

    return out.map(function (p) {
      var when = new Date(p.max * 1000);
      var sub = A.subsolarPoint(when);
      p.visible = A.isSunlit(p.satLat, p.satLon, p.satAlt, when, sub) &&
                  A.sunElevation(lat, lon, when, sub) < TWILIGHT;
      return p;
    }).slice(0, 4);
  }

  function loadPasses(force) {
    if (!place || passesBusy) return;
    if (!force && passes && Date.now() - passesAt < PASS_TTL_MS) { paintPasses(); return; }

    passesBusy = true;
    passes = null;
    $('pass-list').innerHTML = '';
    var here = place;

    fetchTrack(function (done, total) {
      $('pass-status').textContent = CSM.t('pass.loading')
        .replace('{done}', done).replace('{total}', total);
    })
      .then(function (samples) {
        passesBusy = false;
        if (place !== here) return;             // the user moved on
        passes = findPasses(samples, here.lat, here.lon);
        passesAt = Date.now();
        paintPasses();
        paintDome();
      })
      .catch(function () {
        passesBusy = false;
        $('pass-status').textContent = CSM.t('pass.error');
      });
  }

  function paintPasses() {
    var list = $('pass-list');
    list.innerHTML = '';

    if (!passes) return;
    $('pass-status').textContent = '';

    if (!passes.length) {
      var li = document.createElement('li');
      li.className = 'pass-empty';
      var span = document.createElement('span');
      span.className = 'pass-detail';
      span.textContent = CSM.t('pass.none');
      li.appendChild(span);
      list.appendChild(li);
      return;
    }

    passes.forEach(function (p) {
      var start = new Date(p.start * 1000);
      var mins = Math.max(1, Math.round((p.end - p.start) / 60));

      var li = document.createElement('li');

      var when = document.createElement('span');
      when.className = 'pass-when';
      when.textContent = dayLabel(start) + clock(start);

      var tag = document.createElement('span');
      tag.className = 'pass-tag' + (p.visible ? ' is-visible' : '');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ico');
      svg.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', p.visible ? '#i-eye' : '#i-moon');
      svg.appendChild(use);
      tag.appendChild(svg);
      tag.appendChild(document.createTextNode(CSM.t(p.visible ? 'pass.visible' : 'pass.daylight')));

      var detail = document.createElement('span');
      detail.className = 'pass-detail';
      detail.innerHTML =
        CSM.t('pass.duration').replace('{min}', mins) +
        '<span class="sep">·</span>' +
        CSM.t('pass.height').replace('{deg}', Math.round(p.maxEl)) +
        '<span class="sep">·</span>' +
        CSM.t('pass.from').replace('{a}', compass(p.azStart)).replace('{b}', compass(p.azEnd));

      li.appendChild(when);
      li.appendChild(detail);
      li.appendChild(tag);
      list.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Sky dome                                                           */
  /* ------------------------------------------------------------------ */

  var dome = $('dome'), dctx = dome.getContext('2d');
  var DW = 0, DH = 0;

  function sizeDome() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = dome.getBoundingClientRect();
    DW = Math.max(180, Math.round(rect.width));
    DH = DW;
    dome.width = Math.round(DW * dpr);
    dome.height = Math.round(DH * dpr);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintDome();
  }

  function domePoint(az, el, R, cx, cy) {
    var r = (1 - Math.max(0, Math.min(90, el)) / 90) * R;
    var a = az * Math.PI / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }

  function paintDome() {
    if (!DW || !place) return;
    var cx = DW / 2, cy = DH / 2, R = DW / 2 - 22;
    dctx.clearRect(0, 0, DW, DH);

    // the bowl
    var g = dctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(24,36,62,.85)');
    g.addColorStop(1, 'rgba(12,19,35,.85)');
    dctx.fillStyle = g;
    dctx.beginPath(); dctx.arc(cx, cy, R, 0, Math.PI * 2); dctx.fill();

    // elevation rings at 30° and 60°
    dctx.strokeStyle = 'rgba(244,234,216,.10)';
    dctx.lineWidth = 1;
    [30, 60].forEach(function (el) {
      var r = (1 - el / 90) * R;
      dctx.beginPath(); dctx.arc(cx, cy, r, 0, Math.PI * 2); dctx.stroke();
    });
    dctx.strokeStyle = 'rgba(244,234,216,.20)';
    dctx.beginPath(); dctx.arc(cx, cy, R, 0, Math.PI * 2); dctx.stroke();

    // cardinal cross
    dctx.strokeStyle = 'rgba(244,234,216,.07)';
    dctx.beginPath();
    dctx.moveTo(cx - R, cy); dctx.lineTo(cx + R, cy);
    dctx.moveTo(cx, cy - R); dctx.lineTo(cx, cy + R);
    dctx.stroke();

    // cardinal labels
    var names = CSM.t('compass').split(',');
    dctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    dctx.fillStyle = 'rgba(147,158,180,.9)';
    dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
    [[0, names[0]], [90, names[4]], [180, names[8]], [270, names[12]]].forEach(function (c) {
      var p = domePoint(c[0], 0, R + 12, cx, cy);
      dctx.fillText(c[1].trim(), p[0], p[1]);
    });

    // the next pass, traced across the bowl
    var next = passes && passes.length ? passes[0] : null;
    if (next && next.samples) {
      dctx.strokeStyle = 'rgba(232,163,74,.28)';
      dctx.lineWidth = 1.4;
      dctx.setLineDash([3, 4]);
      dctx.beginPath();
      next.samples.forEach(function (s, i) {
        var p = domePoint(s.az, s.el, R, cx, cy);
        if (i === 0) dctx.moveTo(p[0], p[1]); else dctx.lineTo(p[0], p[1]);
      });
      dctx.stroke();
      dctx.setLineDash([]);
    }

    // where the Station is right now
    var pos = CSM.position();
    var cap = $('dome-cap');
    if (!pos) { cap.textContent = ''; return; }

    var look = A.lookAngles(place.lat, place.lon, pos.latitude, pos.longitude, pos.altitude);
    var above = look.elevation > 0;
    var p = domePoint(look.azimuth, Math.max(0, look.elevation), R, cx, cy);

    if (above) {
      var glow = dctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 22);
      glow.addColorStop(0, 'rgba(232,163,74,.5)');
      glow.addColorStop(1, 'rgba(232,163,74,0)');
      dctx.fillStyle = glow;
      dctx.beginPath(); dctx.arc(p[0], p[1], 22, 0, Math.PI * 2); dctx.fill();
      dctx.fillStyle = '#f6d9a8';
      dctx.beginPath(); dctx.arc(p[0], p[1], 4, 0, Math.PI * 2); dctx.fill();
      cap.textContent = CSM.t('obs.dome.above');
    } else {
      dctx.fillStyle = 'rgba(147,158,180,.55)';
      dctx.beginPath(); dctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); dctx.fill();
      dctx.strokeStyle = 'rgba(147,158,180,.35)';
      dctx.setLineDash([2, 3]);
      dctx.beginPath(); dctx.moveTo(cx, cy); dctx.lineTo(p[0], p[1]); dctx.stroke();
      dctx.setLineDash([]);
      cap.textContent = CSM.t('obs.dome.below');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Panel                                                              */
  /* ------------------------------------------------------------------ */

  function coordLabel(lat, lon) {
    return CSM.fmt(Math.abs(lat), 3) + '° ' + CSM.t(lat >= 0 ? 'dir.n' : 'dir.s') + '  ' +
           CSM.fmt(Math.abs(lon), 3) + '° ' + CSM.t(lon >= 0 ? 'dir.e' : 'dir.w');
  }

  function paintPanel() {
    var hasPlace = !!place;
    $('obs-panel').hidden = !hasPlace;
    document.querySelector('.place-card').hidden = hasPlace;
    if (!hasPlace) return;

    $('obs-place').textContent = place.label || CSM.t('obs.you');
    var sub = place.sub ? place.sub.slice(0, 64) + ' · ' : '';
    $('obs-coords').textContent = sub + coordLabel(place.lat, place.lon);

    var pos = CSM.position();
    if (!pos) return;

    var look = A.lookAngles(place.lat, place.lon, pos.latitude, pos.longitude, pos.altitude);
    var ground = A.groundDistance(place.lat, place.lon, pos.latitude, pos.longitude);

    $('o-dist').textContent = CSM.fmt(look.range, 0) + ' ' + CSM.t('unit.km');
    $('o-dir').textContent = compass(look.azimuth) + ' · ' + CSM.fmt(look.azimuth, 0) + '°';
    $('o-elev').textContent = look.elevation > 0
      ? CSM.fmt(look.elevation, 0) + '° ' + CSM.t('obs.up')
      : CSM.t('obs.under');
    $('o-ground').textContent = CSM.fmt(ground, 0) + ' ' + CSM.t('unit.km');

    paintDome();
  }

  function setPlace(p) {
    place = p;
    savePlace();
    clearError();
    paintPanel();
    sizeDome();
    passes = null;
    $('pass-list').innerHTML = '';
    loadPasses(true);
  }

  function forget() {
    place = null;
    passes = null;
    savePlace();
    paintPanel();
    $('place-input').focus();
  }

  /* ------------------------------------------------------------------ */
  /*  Wiring                                                             */
  /* ------------------------------------------------------------------ */

  $('place-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = $('place-input').value.trim();
    if (q.length < 2) { showError('obs.err.short'); return; }
    search(q);
  });

  $('locate-btn').addEventListener('click', locate);
  $('obs-change').addEventListener('click', forget);

  CSM.on('position', paintPanel);
  CSM.on('lang', function () {
    if (place && !place.label) $('obs-place').textContent = CSM.t('obs.you');
    paintPanel();
    paintPasses();
  });

  window.addEventListener('resize', sizeDome, { passive: true });

  paintPanel();
  sizeDome();
  if (place) loadPasses(false);
})();
