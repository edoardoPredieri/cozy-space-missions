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
  var MIN_ELEVATION = CSM.sat.minElevation || 10;   // below this, not worth going outside
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

  /* Anything read back out of storage is treated as if a stranger wrote it:
     the numbers must be real angles on Earth, the names must be strings, and
     a name that runs away with itself gets cut. */
  function sane(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = Number(p.lat), lon = Number(p.lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {
      lat: lat,
      lon: lon,
      label: typeof p.label === 'string' ? p.label.slice(0, 120) : '',
      sub: typeof p.sub === 'string' ? p.sub.slice(0, 160) : ''
    };
  }

  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) place = sane(JSON.parse(raw));
  } catch (e) { /* private mode, or nothing saved yet */ }

  /* What gets written down is deliberately blunter than what the page knows.
     Every project on a github.io account shares one origin, so anything else
     published under this account can read this key; three decimals is about a
     hundred metres, which changes no pass by a second but is not an address.
     The precise position the browser gave stays in memory for this visit only. */
  var SAVED_PRECISION = 1000;

  function savePlace() {
    try {
      if (!place) { localStorage.removeItem(STORE_KEY); return; }
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lat: Math.round(place.lat * SAVED_PRECISION) / SAVED_PRECISION,
        lon: Math.round(place.lon * SAVED_PRECISION) / SAVED_PRECISION,
        label: place.label,
        sub: place.sub
      }));
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
    CSM.announce(el.textContent);
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

  var MAX_RESULTS = 5;          // what we asked for; what we will draw regardless

  function renderResults(all) {
    var ul = $('place-results');
    ul.innerHTML = '';
    var list = (Array.isArray(all) ? all : []).slice(0, MAX_RESULTS);
    list.forEach(function (r) {
      var parts = String(r && r.display_name || '').slice(0, 300).split(',');
      var head = parts.shift().trim().slice(0, 120);
      var sub = parts.join(',').trim().slice(0, 160);

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
    CSM.announce(CSM.t('obs.results').replace('{n}', list.length));
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

  function findPasses(sampleAt, t0, t1, lat, lon) {
    var out = [], current = null;

    for (var t = t0; t <= t1; t += PASS_FINE_SEC) {
      var s = sampleAt(t);
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

    /* With the orbit in hand there is nothing to wait for: twelve hours of
       passes are a couple of thousand SGP4 evaluations, done in a blink. */
    var prop = CSM.propagator && CSM.propagator();
    if (prop) {
      var now = Math.floor(Date.now() / 1000);
      passes = findPasses(function (t) {
        var p = prop.at(new Date(t * 1000));
        return p ? { lat: p.latitude, lon: p.longitude, alt: p.altitude } : null;
      }, now, now + PASS_HOURS * 3600, place.lat, place.lon);
      passesAt = Date.now();
      $('pass-progress').hidden = true;
      paintPasses();
      paintDome();
      CSM.announce(passes.length
        ? CSM.t('pass.found').replace('{n}', passes.length)
        : CSM.t('pass.none'));
      return;
    }

    passesBusy = true;
    passes = null;
    $('pass-list').innerHTML = '';
    var here = place;

    var bar = $('pass-progress');
    bar.hidden = false;
    bar.setAttribute('aria-valuenow', '0');
    bar.firstElementChild.style.width = '0%';
    $('pass-status').textContent = CSM.t('pass.loading');

    fetchTrack(function (done, total) {
      var pct = Math.round(done / total * 100);
      bar.setAttribute('aria-valuenow', String(pct));
      bar.firstElementChild.style.width = pct + '%';
    })
      .then(function (samples) {
        passesBusy = false;
        $('pass-progress').hidden = true;
        if (place !== here) return;             // the user moved on
        passes = findPasses(function (t) { return A.interpolateTrack(samples, t); },
                            samples[0].t, samples[samples.length - 1].t,
                            here.lat, here.lon);
        passesAt = Date.now();
        paintPasses();
        paintDome();
        CSM.announce(passes.length
          ? CSM.t('pass.found').replace('{n}', passes.length)
          : CSM.t('pass.none'));
      })
      .catch(function () {
        passesBusy = false;
        $('pass-progress').hidden = true;
        $('pass-status').textContent = CSM.t('pass.error');
        CSM.announce(CSM.t('pass.error'));
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

      /* Built node by node rather than as a string: the separators are the only
         markup here, so nothing that came out of a translation table — or, one
         day, out of a feed — is ever parsed as HTML. */
      var detail = document.createElement('span');
      detail.className = 'pass-detail';
      [
        CSM.t('pass.duration').replace('{min}', mins),
        CSM.t('pass.height').replace('{deg}', Math.round(p.maxEl)),
        CSM.t('pass.from').replace('{a}', compass(p.azStart)).replace('{b}', compass(p.azEnd))
      ].forEach(function (text, i) {
        if (i) {
          var sep = document.createElement('span');
          sep.className = 'sep';
          sep.textContent = '·';
          detail.appendChild(sep);
        }
        detail.appendChild(document.createTextNode(text));
      });

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

    // the bowl: darkest overhead, warming towards the horizon like a real sky
    var g = dctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(16,25,46,.92)');
    g.addColorStop(0.72, 'rgba(20,31,54,.88)');
    g.addColorStop(1, 'rgba(38,40,56,.88)');
    dctx.fillStyle = g;
    dctx.beginPath(); dctx.arc(cx, cy, R, 0, Math.PI * 2); dctx.fill();

    // an amber wash all around the rim, where the sky meets the ground
    var h = dctx.createRadialGradient(cx, cy, R * 0.68, cx, cy, R);
    h.addColorStop(0, 'rgba(232,163,74,0)');
    h.addColorStop(1, 'rgba(232,163,74,.10)');
    dctx.fillStyle = h;
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
    if (next && next.samples && next.samples.length > 1) {
      dctx.strokeStyle = 'rgba(232,163,74,.28)';
      dctx.lineWidth = 1.4;
      dctx.setLineDash([3, 4]);
      dctx.beginPath();
      CSM.smoothPath(dctx, next.samples.map(function (s) {
        return domePoint(s.az, s.el, R, cx, cy);
      }));
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

  /* A satellite whose orbit is tilted 28.5° can never climb far above the
     horizon from 45° north. That is worth saying out loud rather than leaving
     the reader to wonder why every pass is so low. */
  function ceilingFrom(lat) {
    var prop = CSM.propagator && CSM.propagator();
    var inc = prop ? prop.inclination : CSM.sat.inclination;
    if (!inc) return null;
    var alt = (CSM.position() || {}).altitude || CSM.sat.altKm;
    var gap = Math.abs(lat) - inc;
    if (gap <= 0) return 90;
    var g = gap * Math.PI / 180;
    var R = A.R_EARTH;
    var el = Math.atan2(Math.cos(g) - R / (R + alt), Math.sin(g)) * 180 / Math.PI;
    return Math.max(0, el);
  }

  function paintCeiling() {
    var el = $('pass-ceiling');
    if (!el || !place) return;
    var max = ceilingFrom(place.lat);
    if (max === null || max >= 25) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = max < 1
      ? CSM.t('pass.never')
      : CSM.t('pass.ceiling').replace('{deg}', CSM.fmt(max, 0));
  }

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

    paintCeiling();
    paintDome();
  }

  function setPlace(input) {
    /* Same gate whether this came from the geocoder, the browser or storage. */
    var p = sane(input);
    if (!p) { showError('obs.err.none'); return; }
    place = p;
    savePlace();
    CSM.emit('place', p);
    clearError();
    paintPanel();
    sizeDome();
    CSM.announce(CSM.t('obs.set').replace('{place}', p.label || CSM.t('obs.you')));
    var panel = $('obs-panel');
    if (panel.setAttribute) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
    passes = null;
    $('pass-list').innerHTML = '';
    loadPasses(true);
  }

  function forget() {
    place = null;
    passes = null;
    savePlace();
    CSM.emit('place', null);
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

  /* The elements arrive after the page does, so the passes wait for them. */
  CSM.on('propagator', function () {
    paintCeiling();
    if (place) loadPasses(true);
  });

  CSM.onResize(sizeDome);

  paintPanel();
  sizeDome();
  if (place) { CSM.emit('place', place); loadPasses(false); }
})();
