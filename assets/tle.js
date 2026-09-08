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
  var FETCH_TIMEOUT_MS = 12000;             // a host that goes quiet must not hang the page

  function ready() {
    return new Promise(function (resolve) {
      if (window.SGP4) { resolve(); return; }
      window.addEventListener('sgp4ready', function () { resolve(); }, { once: true });
    });
  }

  var MAX_BYTES = 64 * 1024;   // a TLE is ~140 bytes; anything huge is not one

  /* A TLE has a rigid shape, and checking it here means SGP4 is never handed
     something that only looks like a set of elements. Line 1 and line 2 each
     start with their own number, run 69 characters, and carry the same NORAD
     id — which has to be the id we asked for, so a redirected or swapped feed
     cannot quietly put a different object on the page. */
  function validLine(line, which, norad) {
    if (typeof line !== 'string') return false;
    var l = line.replace(/\s+$/, '');
    if (l.length !== 69) return false;
    if (l.charAt(0) !== String(which) || l.charAt(1) !== ' ') return false;
    if (!/^[\d .+\-A-Za-z]+$/.test(l)) return false;
    return parseInt(l.slice(2, 7), 10) === Number(norad);
  }

  function accept(l1, l2, name, norad) {
    if (!validLine(l1, 1, norad) || !validLine(l2, 2, norad)) return null;
    return {
      l1: l1.replace(/\s+$/, ''),
      l2: l2.replace(/\s+$/, ''),
      name: typeof name === 'string' ? name.slice(0, 64) : ''
    };
  }

  /* Celestrak answers with two (or three) plain lines; the fallback answers
     with JSON. Both end up as the same pair of strings. */
  function parse(text, norad) {
    var trimmed = String(text).slice(0, MAX_BYTES).trim();
    if (trimmed.charAt(0) === '{') {
      var j = JSON.parse(trimmed);
      if (!j) return null;
      return accept(j.line1, j.line2, j.name, norad);
    }
    var lines = trimmed.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
    var l1 = null, l2 = null, name = '';
    lines.forEach(function (l) {
      if (l.indexOf('1 ') === 0 && l.length > 60) l1 = l;
      else if (l.indexOf('2 ') === 0 && l.length > 60) l2 = l;
      else if (!name) name = l;
    });
    return accept(l1, l2, name, norad);
  }

  /* Storage is shared with every other page on this origin, so what comes back
     out of it goes through exactly the same check as what comes off the wire. */
  function cached(sat) {
    try {
      var raw = localStorage.getItem(STORE + sat.norad);
      if (!raw) return null;
      var v = JSON.parse(raw);
      /* Bounded at both ends. Without the upper bound, an entry stamped with a
         date in the far future is permanently "fresh", and since a cache hit
         short-circuits the fetch it would never be replaced. */
      if (!v || !isFinite(v.saved)) return null;
      var age = Date.now() - v.saved;
      if (age < 0 || age > MAX_AGE_MS) return null;
      return accept(v.l1, v.l2, v.name, sat.norad);
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
      /* Without the abort, a host that accepts the connection and then says
         nothing never rejects — the fallback URL is never tried and the page
         waits for its elements forever. */
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : 0;
      return fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          var tle = parse(text, sat.norad);
          if (!tle) throw new Error('unparsable');
          return tle;
        })
        .catch(function () { clearTimeout(timer); return next(); });
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

  /* Elements can be well-formed and still be nonsense — a decayed object, a
     truncated download, a stale cache, or somebody else's satellite.

     Worth being clear about what the catalogue number in a TLE is worth: it is
     five characters of the same string the server sent, so it is a label the
     sender chose, not a signature. Checking it catches an honest mix-up — the
     wrong endpoint, a swapped file — and nothing more. What a relabelled TLE
     cannot fake is the orbit itself, because the orbit is what gets drawn: so
     the propagated inclination has to match the inclination this mission is
     known to have. Hand this page the Station's elements under Hubble's number
     and it sees 51.6° where it expects 28.5°, and draws nothing.

     INCLINATION_SLOP is generous enough for the drift of a real orbit and far
     tighter than the gap between any two missions the site shows. */
  var INCLINATION_SLOP = 3;      // degrees

  function plausible(prop, sat) {
    var p = prop.at(new Date());
    if (!p) return false;
    if (!isFinite(p.latitude) || !isFinite(p.longitude) || !isFinite(p.altitude)) return false;
    if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return false;
    if (p.altitude < 80 || p.altitude > 100000) return false;
    if (!isFinite(prop.periodMin) || prop.periodMin < 60 || prop.periodMin > 1500) return false;
    if (!isFinite(prop.inclination) || prop.inclination < 0 || prop.inclination > 180) return false;
    if (isFinite(sat.inclination) &&
        Math.abs(prop.inclination - sat.inclination) > INCLINATION_SLOP) return false;
    return true;
  }

  function build(tle, sat) {
    var rec = window.SGP4.twoline2satrec(tle.l1, tle.l2);
    if (!rec || rec.error) throw new Error('bad elements');
    var prop = new Propagator(rec);
    if (!plausible(prop, sat)) throw new Error('not this satellite');
    return prop;
  }

  function load(sat) {
    return ready().then(function () {
      var saved = cached(sat);
      if (saved) {
        try { return build(saved, sat); }
        catch (e) {
          /* The cached copy does not hold up — throw it away and go and ask. */
          try { localStorage.removeItem(STORE + sat.norad); } catch (e2) {}
        }
      }
      return fetchTle(sat).then(function (tle) {
        var prop = build(tle, sat);  // only remember elements that actually worked
        remember(sat, tle);
        return prop;
      });
    });
  }

  return { load: load };
})();
