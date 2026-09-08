/* Cozy Space Missions — where a telescope at L2 actually is.

   L2 is a point about 1.5 million km beyond the Earth, directly away from the
   Sun, where a spacecraft can keep station with very little fuel. Nothing
   there has a ground track and nothing there passes overhead, so these
   missions need their own kind of answer: how far away, in which direction,
   and how fast that is changing.

   Two sources, in order of preference:

   1. A table of real positions from JPL Horizons, shipped with the page (see
      assets/ephem.js and tools/make-ephem.py) and interpolated with a cubic
      through the four surrounding samples. Checked against JPL dates that are
      deliberately NOT in the table, this is within about 0.2%.

   2. Past the end of that table, the L2 point itself, worked out from where
      the Earth is today. This is honest but coarser — a telescope loops around
      L2 rather than sitting on it, by as much as 800,000 km — so anything
      answered this way is marked `exact: false` and the page says so out loud
      rather than quietly showing a number it cannot stand behind. */

window.L2 = (function () {
  'use strict';

  var A = window.ASTRO;

  /* The distance from the Earth to L2, as a fraction of the Earth's distance
     from the Sun: the cube root of (Earth+Moon mass) / (3 x Sun mass). At the
     Earth's average distance this comes to about 1.50 million km, which is
     where the familiar figure comes from. It breathes by ±1.7% over the year
     as the Earth's own distance from the Sun changes. */
  var L2_FRACTION = 0.0100447;

  var MIN_KM = 1e5;         // nothing this side of the Moon belongs on these pages
  var MAX_KM = 3e6;         // and nothing beyond twice L2 does either

  /* ------------------------------------------------------------------ */
  /*  The shipped table                                                  */
  /* ------------------------------------------------------------------ */

  /* Same rule as the orbital elements: data is not trusted because of where it
     came from, but because of what it looks like. This table is source code
     rather than network input, so a failure here is a build mistake, not an
     attack — but a build mistake that drew a confident wrong distance would be
     just as bad, and a page on a shared origin should never assume that what
     it loaded is what was shipped. */
  function validate(table) {
    if (!table || typeof table !== 'object') return null;
    var s = table.samples;
    if (!Array.isArray(s) || s.length < 4) return null;

    var clean = [];
    for (var i = 0; i < s.length; i++) {
      var r = s[i];
      if (!Array.isArray(r) || r.length < 5) return null;
      var t = Number(r[0]), km = Number(r[1]), lon = Number(r[2]),
          lat = Number(r[3]), kms = Number(r[4]);
      if (!isFinite(t) || !isFinite(km) || !isFinite(lon) || !isFinite(lat) || !isFinite(kms)) return null;
      if (km < 1000 || km > MAX_KM) return null;                 // includes the climb out
      if (lon < 0 || lon >= 360 || lat < -90 || lat > 90) return null;
      if (Math.abs(kms) > 15) return null;
      if (clean.length && t <= clean[clean.length - 1].t) return null;   // must run forwards
      clean.push({ t: t, km: km, lon: lon, lat: lat, kms: kms });
    }
    return {
      samples: clean,
      from: clean[0].t,
      to: clean[clean.length - 1].t,
      source: typeof table.source === 'string' ? table.source.slice(0, 120) : ''
    };
  }

  /* A cubic through the four samples around the wanted time. Longitude is
     interpolated on the shortest way round, so a table that crosses 360°
     does not swing the telescope the long way about. */
  function interpolate(table, t) {
    var s = table.samples, n = s.length;
    var i = 1;
    while (i < n - 3 && s[i + 1].t < t) i++;
    var p = [s[i - 1], s[i], s[i + 1], s[i + 2]];

    var w = [1, 1, 1, 1];
    for (var a = 0; a < 4; a++) {
      for (var b = 0; b < 4; b++) {
        if (a !== b) w[a] *= (t - p[b].t) / (p[a].t - p[b].t);
      }
    }

    function blend(pick) {
      var v = 0;
      for (var k = 0; k < 4; k++) v += w[k] * pick(p[k]);
      return v;
    }

    var base = p[1].lon;
    var lon = base + blend(function (q) {
      var d = (q.lon - base + 540) % 360 - 180;
      return d;
    });

    return {
      km: blend(function (q) { return q.km; }),
      lon: (lon % 360 + 360) % 360,
      lat: blend(function (q) { return q.lat; }),
      kms: blend(function (q) { return q.kms; }),
      exact: true
    };
  }

  /* ------------------------------------------------------------------ */
  /*  The fallback: the L2 point itself                                  */
  /* ------------------------------------------------------------------ */

  /* L2 sits on the line from the Sun through the Earth and out the far side,
     so its direction seen from here is simply the direction away from the Sun
     — which is the direction the Earth itself is heading away from the Sun,
     in heliocentric terms. */
  function l2Point(date) {
    var e = A.planets(date).earth;
    var rAu = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    var lon = Math.atan2(e.y, e.x) * 180 / Math.PI;
    var lat = Math.asin(e.z / rAu) * 180 / Math.PI;
    return {
      km: rAu * A.AU * L2_FRACTION,
      lon: (lon % 360 + 360) % 360,
      lat: lat,
      kms: 0,
      exact: false
    };
  }

  /* ------------------------------------------------------------------ */

  function Position(table) {
    this.table = table;
    this.source = table ? table.source : '';
    this.from = table ? table.from : 0;
    this.to = table ? table.to : 0;
  }

  Position.prototype.at = function (date) {
    var t = date.getTime() / 1000;
    var p = (this.table && t >= this.table.from && t <= this.table.to)
      ? interpolate(this.table, t)
      : l2Point(date);

    if (!isFinite(p.km) || p.km < MIN_KM || p.km > MAX_KM) return null;

    /* Distance from the Sun. It is tempting to add the Earth's distance and
       the telescope's and be done, since the telescope is nearly on the far
       side of the Earth from the Sun — but "nearly" is doing real work there.
       A halo orbit swings up to 20° off the anti-solar line, and the shortcut
       is then wrong by as much as 216,000 km, which is larger than the third
       decimal of an AU this page prints. So it is done as vectors. */
    var e = A.planets(date).earth;
    var lonR = p.lon * Math.PI / 180, latR = p.lat * Math.PI / 180;
    var cosLat = Math.cos(latR);
    var sunKm = Math.hypot(
      p.km * cosLat * Math.cos(lonR) + e.x * A.AU,
      p.km * cosLat * Math.sin(lonR) + e.y * A.AU,
      p.km * Math.sin(latR) + e.z * A.AU
    );

    return {
      km: p.km,
      lon: p.lon,
      lat: p.lat,
      kms: p.kms,
      sunKm: sunKm,
      exact: p.exact,
      timestamp: Math.floor(t)
    };
  };

  /* How far past the Moon it is, which is the comparison that actually lands. */
  Position.prototype.moonRatio = function (date, km) {
    var m = A.moon(date).distance;
    return m > 0 ? km / m : 0;
  };

  function load(sat) {
    return new Promise(function (resolve, reject) {
      var raw = window.EPHEM && sat.ephem ? window.EPHEM[sat.ephem] : null;
      var table = validate(raw);

      /* No usable table is not a dead end here, unlike a missing TLE: the L2
         point can still be worked out from the Earth's own position. The page
         will say that is what it is showing. */
      var pos = new Position(table);
      if (!pos.at(new Date())) { reject(new Error('no position')); return; }
      resolve(pos);
    });
  }

  return { load: load, L2_FRACTION: L2_FRACTION };
})();
