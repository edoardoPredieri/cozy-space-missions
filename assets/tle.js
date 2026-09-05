/* Cozy Space Missions — working a satellite's position out from its orbit.

   For missions nobody publishes a live feed for, the page fetches the orbital
   elements once (a TLE, two lines of numbers), then propagates them in the
   browser with SGP4. After that first fetch there is no network at all: the
   ground track and every pass prediction are pure arithmetic, which is why
   they appear instantly instead of after a dozen throttled requests. */

window.TLE = (function () {
  'use strict';

  var A = window.ASTRO;
  var STORE = 'csm.tle.';
  var MAX_AGE_MS = 6 * 60 * 60 * 1000;      // refetch a TLE older than six hours

  function ready() {
    return new Promise(function (resolve) {
      if (window.SGP4) { resolve(); return; }
      window.addEventListener('sgp4ready', function () { resolve(); }, { once: true });
    });
  }

  /* Celestrak answers with two (or three) plain lines; the fallback answers
     with JSON. Both end up as the same pair of strings. */
  function parse(text) {
    var trimmed = String(text).trim();
    if (trimmed.charAt(0) === '{') {
      var j = JSON.parse(trimmed);
      if (j && j.line1 && j.line2) return { l1: j.line1, l2: j.line2, name: j.name || '' };
      return null;
    }
    var lines = trimmed.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
    var l1 = null, l2 = null, name = '';
    lines.forEach(function (l) {
      if (l.indexOf('1 ') === 0 && l.length > 60) l1 = l;
      else if (l.indexOf('2 ') === 0 && l.length > 60) l2 = l;
      else if (!name) name = l;
    });
    return (l1 && l2) ? { l1: l1, l2: l2, name: name } : null;
  }

  function cached(sat) {
    try {
      var raw = localStorage.getItem(STORE + sat.norad);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.l1 || !v.l2) return null;
      if (Date.now() - v.saved > MAX_AGE_MS) return null;
      return v;
    } catch (e) { return null; }
  }

  function remember(sat, tle) {
    try {
      localStorage.setItem(STORE + sat.norad,
        JSON.stringify({ l1: tle.l1, l2: tle.l2, name: tle.name, saved: Date.now() }));
    } catch (e) {}
  }

  function fetchTle(sat) {
    var urls = sat.tle.slice();
    function next() {
      if (!urls.length) return Promise.reject(new Error('no tle'));
      var url = urls.shift();
      return fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          var tle = parse(text);
          if (!tle) throw new Error('unparsable');
          return tle;
        })
        .catch(function () { return next(); });
    }
    return next();
  }

  /* ------------------------------------------------------------------ */

  function Propagator(satrec) {
    this.rec = satrec;
    /* Inclination and mean motion come straight out of the elements, so the
       page can say something true about this orbit without a lookup table. */
    this.inclination = satrec.inclo * 180 / Math.PI;
    this.periodMin = (2 * Math.PI) / satrec.no;
  }

  /* Returns the same shape wheretheiss.at hands back, so nothing downstream
     needs to know which kind of mission it is looking at. */
  Propagator.prototype.at = function (date) {
    var S = window.SGP4;
    var pv = S.propagate(this.rec, date);
    if (!pv || !pv.position) return null;

    var gmst = S.gstime(date);
    var geo = S.eciToGeodetic(pv.position, gmst);
    var lat = S.degreesLat(geo.latitude);
    var lon = S.degreesLong(geo.longitude);
    var alt = geo.height;                                  // km above the ellipsoid
    var speed = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) * 3600;

    var sub = A.subsolarPoint(date);
    var R = A.R_EARTH;
    var rho = Math.acos(R / (R + Math.max(1, alt)));       // half-angle of the footprint

    return {
      latitude: lat,
      longitude: lon,
      altitude: alt,
      velocity: speed,
      visibility: A.isSunlit(lat, lon, alt, date, sub) ? 'daylight' : 'eclipsed',
      footprint: 2 * rho * R,
      timestamp: Math.floor(date.getTime() / 1000),
      solar_lat: sub.lat,
      solar_lon: sub.lon
    };
  };

  /* A stretch of ground track, sampled straight from the orbit. */
  Propagator.prototype.track = function (fromSec, toSec, stepSec) {
    var out = [];
    for (var t = fromSec; t <= toSec; t += stepSec) {
      var p = this.at(new Date(t * 1000));
      if (p) out.push({ t: t, lat: p.latitude, lon: p.longitude, alt: p.altitude });
    }
    return out;
  };

  function load(sat) {
    var saved = cached(sat);
    return ready()
      .then(function () {
        if (saved) return saved;
        return fetchTle(sat).then(function (tle) { remember(sat, tle); return tle; });
      })
      .then(function (tle) {
        var rec = window.SGP4.twoline2satrec(tle.l1, tle.l2);
        if (!rec || rec.error) throw new Error('bad elements');
        return new Propagator(rec);
      });
  }

  return { load: load };
})();
