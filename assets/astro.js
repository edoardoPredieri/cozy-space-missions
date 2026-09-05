/* Cozy Space Missions — small astronomy helpers.
   Everything here is plain maths: no network, no dependencies.
   Precision is "good enough to look up at the right time", not ephemeris-grade. */

window.ASTRO = (function () {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var R_EARTH = 6371;          // km, spherical Earth is plenty here
  var AU = 149597870.7;        // km

  function julianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  function norm360(x) { return ((x % 360) + 360) % 360; }
  function norm180(x) { var v = norm360(x); return v > 180 ? v - 360 : v; }

  /* ---- Sun ---------------------------------------------------------- */

  /* Sub-solar point: the spot on Earth with the Sun straight overhead. */
  function subsolarPoint(date) {
    var jd = julianDay(date);
    var n = jd - 2451545.0;
    var L = norm360(280.460 + 0.9856474 * n);
    var g = norm360(357.528 + 0.9856003 * n) * D2R;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
    var eps = (23.439 - 0.0000004 * n) * D2R;

    var dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D;
    var gmst = norm360(280.46061837 + 360.98564736629 * n);

    return { lat: dec, lon: norm180(ra - gmst) };
  }

  /* Sun elevation above the horizon, in degrees, at a given place and time. */
  function sunElevation(lat, lon, date, sub) {
    var s = sub || subsolarPoint(date);
    var c = Math.sin(lat * D2R) * Math.sin(s.lat * D2R) +
            Math.cos(lat * D2R) * Math.cos(s.lat * D2R) *
            Math.cos((lon - s.lon) * D2R);
    return Math.asin(Math.max(-1, Math.min(1, c))) * R2D;
  }

  /* A satellite is in sunlight unless it is inside the Earth's shadow.
     At altitude h it still catches the Sun until the Sun is
     acos(R / (R + h)) below its local horizon. */
  function isSunlit(satLat, satLon, satAltKm, date, sub) {
    var limit = -Math.acos(R_EARTH / (R_EARTH + satAltKm)) * R2D;
    return sunElevation(satLat, satLon, date, sub) > limit;
  }

  /* ---- Geometry ------------------------------------------------------ */

  function toVec(lat, lon, altKm) {
    var r = R_EARTH + (altKm || 0);
    var la = lat * D2R, lo = lon * D2R;
    return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
  }

  /* Where to look: azimuth (0 = north, clockwise), elevation, slant range. */
  function lookAngles(obsLat, obsLon, satLat, satLon, satAltKm) {
    var o = toVec(obsLat, obsLon, 0), s = toVec(satLat, satLon, satAltKm);
    var dx = s[0] - o[0], dy = s[1] - o[1], dz = s[2] - o[2];
    var la = obsLat * D2R, lo = obsLon * D2R;

    var east  = -Math.sin(lo) * dx + Math.cos(lo) * dy;
    var north = -Math.sin(la) * Math.cos(lo) * dx - Math.sin(la) * Math.sin(lo) * dy + Math.cos(la) * dz;
    var up    =  Math.cos(la) * Math.cos(lo) * dx + Math.cos(la) * Math.sin(lo) * dy + Math.sin(la) * dz;

    var range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return {
      azimuth: norm360(Math.atan2(east, north) * R2D),
      elevation: Math.asin(Math.max(-1, Math.min(1, up / range))) * R2D,
      range: range
    };
  }

  /* Great-circle distance along the ground, km. */
  function groundDistance(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * D2R, p2 = lat2 * D2R;
    var dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* Catmull-Rom through four points on the unit sphere: lets us read the
     ground track at any instant from samples a few minutes apart. */
  function interpolateTrack(samples, time) {
    var n = samples.length;
    if (!n) return null;
    if (time <= samples[0].t) return samples[0];
    if (time >= samples[n - 1].t) return samples[n - 1];

    var i = 0;
    while (i < n - 2 && samples[i + 1].t < time) i++;
    var s0 = samples[Math.max(0, i - 1)], s1 = samples[i],
        s2 = samples[i + 1], s3 = samples[Math.min(n - 1, i + 2)];
    var u = (time - s1.t) / (s2.t - s1.t);

    function v(s) {
      var la = s.lat * D2R, lo = s.lon * D2R;
      return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    }
    var p0 = v(s0), p1 = v(s1), p2 = v(s2), p3 = v(s3);
    var u2 = u * u, u3 = u2 * u, out = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      out[k] = 0.5 * ((2 * p1[k]) +
        (-p0[k] + p2[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    }
    var len = Math.hypot(out[0], out[1], out[2]) || 1;
    out = [out[0] / len, out[1] / len, out[2] / len];

    return {
      t: time,
      lat: Math.asin(out[2]) * R2D,
      lon: Math.atan2(out[1], out[0]) * R2D,
      alt: s1.alt + (s2.alt - s1.alt) * u
    };
  }

  /* ---- Planets ------------------------------------------------------- */
  /* Keplerian elements and their per-century rates, valid 1800–2050.
     Source: JPL "Approximate Positions of the Major Planets".
     Good to a fraction of a degree — fine for a picture of the neighbourhood. */

  var ELEMENTS = {
    mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
              0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    venus:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
              0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
              0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    mars:    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
              0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
              -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    saturn:  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
              -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    uranus:  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
              -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
              0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]
  };

  function planetVector(key, T) {
    var e0 = ELEMENTS[key];
    var a = e0[0] + e0[6] * T;
    var e = e0[1] + e0[7] * T;
    var I = (e0[2] + e0[8] * T) * D2R;
    var L = e0[3] + e0[9] * T;
    var peri = e0[4] + e0[10] * T;
    var node = e0[5] + e0[11] * T;

    var w = (peri - node) * D2R;
    var M = norm180(L - peri) * D2R;

    var E = M + e * Math.sin(M);
    for (var i = 0; i < 8; i++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }

    var xp = a * (Math.cos(E) - e);
    var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

    var cw = Math.cos(w), sw = Math.sin(w);
    var cn = Math.cos(node * D2R), sn = Math.sin(node * D2R);
    var ci = Math.cos(I), si = Math.sin(I);

    return {
      x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
      a: a
    };
  }

  /* Heliocentric ecliptic positions, in AU, for the inner planets. */
  function planets(date) {
    var T = (julianDay(date) - 2451545.0) / 36525;
    var out = {};
    for (var k in ELEMENTS) {
      if (Object.prototype.hasOwnProperty.call(ELEMENTS, k)) out[k] = planetVector(k, T);
    }
    return out;
  }

  function distanceAU(p, q) {
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  }

  /* ---- The Moon ------------------------------------------------------ */
  /* Low-precision lunar position: geocentric ecliptic, good to a few tenths
     of a degree. Enough to put it on the right side of its orbit. */

  function moon(date) {
    var d = julianDay(date) - 2451545.0;
    var L = norm360(218.316 + 13.176396 * d);
    var M = norm360(134.963 + 13.064993 * d) * D2R;
    var F = norm360(93.272 + 13.229350 * d) * D2R;

    var lon = (L + 6.289 * Math.sin(M)) * D2R;
    var lat = (5.128 * Math.sin(F)) * D2R;
    var dist = 385001 - 20905 * Math.cos(M);          // km

    return {
      lon: lon * R2D, lat: lat * R2D, distance: dist,
      x: dist * Math.cos(lat) * Math.cos(lon),
      y: dist * Math.cos(lat) * Math.sin(lon),
      z: dist * Math.sin(lat)
    };
  }

  return {
    R_EARTH: R_EARTH,
    AU: AU,
    julianDay: julianDay,
    subsolarPoint: subsolarPoint,
    sunElevation: sunElevation,
    isSunlit: isSunlit,
    lookAngles: lookAngles,
    groundDistance: groundDistance,
    interpolateTrack: interpolateTrack,
    planets: planets,
    distanceAU: distanceAU,
    moon: moon
  };
})();
