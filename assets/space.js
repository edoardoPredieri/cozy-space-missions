/* Cozy Space Missions — two pictures of where we are:
   a logarithmic ladder from the ground to the Moon, and the inner solar system today. */

(function () {
  'use strict';

  var CSM = window.CSM, A = window.ASTRO;
  var $ = function (id) { return document.getElementById(id); };

  /* ================================================================== */
  /*  How far up is up?                                                  */
  /* ================================================================== */

  var lad = $('ladder'), lctx = lad.getContext('2d');
  var LW = 0, LH = 0;

  /* On a wide canvas every rung fits; on a narrow one only the landmarks do. */
  var RUNGS_WIDE = [
    { km: 100,    key: 'ladder.karman', up: true },
    { km: 535,    key: 'ladder.hubble', up: false, dx: 24 },
    { km: 20200,  key: 'ladder.gps',    up: true },
    { km: 35786,  key: 'ladder.geo',    up: false },
    { km: 384400, key: 'ladder.moon',   up: true }
  ];
  var RUNGS_NARROW = [
    { km: 100,    key: 'ladder.karman', up: false },
    { km: 35786,  key: 'ladder.geo',    up: true },
    { km: 384400, key: 'ladder.moon',   up: false }
  ];
  var DECADES_WIDE = [10, 100, 1000, 10000, 100000];
  var DECADES_NARROW = [10, 1000, 100000];

  var LAD_MIN = 8, LAD_MAX = 1000000;

  function lx(km) {
    var a = Math.log10(Math.max(LAD_MIN, km)), lo = Math.log10(LAD_MIN), hi = Math.log10(LAD_MAX);
    return 54 + (a - lo) / (hi - lo) * (LW - 54 - 26);
  }

  function sizeLadder() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = lad.getBoundingClientRect();
    LW = Math.max(280, Math.round(rect.width));
    LH = Math.max(140, Math.round(rect.height));
    lad.width = Math.round(LW * dpr);
    lad.height = Math.round(LH * dpr);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintLadder();
  }

  function paintLadder() {
    if (!LW) return;
    var baseY = LH * 0.62;
    lctx.clearRect(0, 0, LW, LH);

    // the ground, fading upward into the dark
    var sky = lctx.createLinearGradient(0, 0, LW, 0);
    sky.addColorStop(0, 'rgba(96,128,196,.24)');
    sky.addColorStop(0.12, 'rgba(40,58,100,.14)');
    sky.addColorStop(0.35, 'rgba(12,20,38,0)');
    lctx.fillStyle = sky;
    lctx.fillRect(0, 0, LW, LH);

    lctx.fillStyle = 'rgba(120,150,205,.16)';
    lctx.beginPath();
    lctx.moveTo(0, baseY + 26);
    lctx.quadraticCurveTo(LW * 0.16, baseY - 4, LW * 0.34, baseY + 30);
    lctx.lineTo(0, baseY + 30);
    lctx.closePath();
    lctx.fill();

    var narrow = LW < 560;
    var rungs = narrow ? RUNGS_NARROW : RUNGS_WIDE;

    // decade grid
    lctx.strokeStyle = 'rgba(244,234,216,.06)';
    lctx.lineWidth = 1;
    lctx.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace';
    lctx.fillStyle = 'rgba(147,158,180,.7)';
    lctx.textAlign = 'center'; lctx.textBaseline = 'top';
    (narrow ? DECADES_NARROW : DECADES_WIDE).forEach(function (d) {
      var x = lx(d);
      lctx.beginPath(); lctx.moveTo(x, baseY - LH * 0.34); lctx.lineTo(x, baseY + 12); lctx.stroke();
      lctx.fillText(d >= 1000 ? (d / 1000) + ' 000 km' : d + ' km', x, baseY + 17);
    });

    // the line itself
    var line = lctx.createLinearGradient(lx(LAD_MIN), 0, lx(LAD_MAX), 0);
    line.addColorStop(0, 'rgba(232,163,74,.55)');
    line.addColorStop(1, 'rgba(232,163,74,.14)');
    lctx.strokeStyle = line;
    lctx.lineWidth = 1.5;
    lctx.beginPath(); lctx.moveTo(lx(LAD_MIN), baseY); lctx.lineTo(lx(LAD_MAX), baseY); lctx.stroke();

    // rungs
    lctx.textBaseline = 'alphabetic';
    rungs.forEach(function (r) {
      var x = lx(r.km);
      var y = r.up ? baseY - 16 : baseY + 36;

      lctx.strokeStyle = 'rgba(244,234,216,.22)';
      lctx.beginPath();
      lctx.moveTo(x, baseY);
      lctx.lineTo(x, r.up ? y + 6 : y - 16);
      lctx.stroke();

      lctx.fillStyle = 'rgba(244,234,216,.35)';
      lctx.beginPath(); lctx.arc(x, baseY, 2.6, 0, Math.PI * 2); lctx.fill();

      lctx.font = '500 ' + (narrow ? 10 : 11) + 'px "Inter", system-ui, sans-serif';
      lctx.fillStyle = 'rgba(211,200,181,.9)';
      var tx = x + (r.dx || 0);
      lctx.textAlign = tx > LW - 84 ? 'right' : (tx < 74 ? 'left' : 'center');
      lctx.fillText(CSM.t(r.key), Math.min(LW - 6, Math.max(6, tx)), y);
    });

    // the Station, live
    var pos = CSM.position();
    var alt = pos ? pos.altitude : 420;
    var x = lx(alt);

    var glow = lctx.createRadialGradient(x, baseY, 0, x, baseY, 30);
    glow.addColorStop(0, 'rgba(232,163,74,.5)');
    glow.addColorStop(1, 'rgba(232,163,74,0)');
    lctx.fillStyle = glow;
    lctx.beginPath(); lctx.arc(x, baseY, 30, 0, Math.PI * 2); lctx.fill();

    lctx.fillStyle = '#f6d9a8';
    lctx.beginPath(); lctx.arc(x, baseY, 4.5, 0, Math.PI * 2); lctx.fill();
    lctx.strokeStyle = 'rgba(255,240,214,.85)';
    lctx.lineWidth = 1.2;
    lctx.beginPath(); lctx.arc(x, baseY, 8.5, 0, Math.PI * 2); lctx.stroke();

    lctx.textAlign = 'center';
    lctx.font = '600 12px "Inter", system-ui, sans-serif';
    lctx.fillStyle = '#f6d9a8';
    lctx.fillText(CSM.t('ladder.iss'), x, baseY - 34);
    lctx.font = '400 10.5px "IBM Plex Mono", ui-monospace, monospace';
    lctx.fillStyle = 'rgba(244,234,216,.65)';
    lctx.fillText(CSM.fmt(alt, 0) + ' km', x, baseY - 20);
  }

  /* ================================================================== */
  /*  The neighbourhood                                                  */
  /* ================================================================== */

  var sol = $('solar'), sctx = sol.getContext('2d');
  var SW = 0, SH = 0;

  var PLANETS = [
    { key: 'mercury', label: 'planet.mercury', color: '#9aa3b4', r: 2.6 },
    { key: 'venus',   label: 'planet.venus',   color: '#e2c08a', r: 4.0 },
    { key: 'earth',   label: 'planet.earth',   color: '#7fb0e8', r: 4.4 },
    { key: 'mars',    label: 'planet.mars',    color: '#d98a6a', r: 3.4 }
  ];

  function sizeSolar() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = sol.getBoundingClientRect();
    SW = Math.max(240, Math.round(rect.width));
    SH = Math.max(240, Math.round(rect.height));
    sol.width = Math.round(SW * dpr);
    sol.height = Math.round(SH * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintSolar();
  }

  function paintSolar() {
    if (!SW) return;
    var now = new Date();
    var p = A.planets(now);
    var cx = SW / 2, cy = SH / 2;
    var scale = (Math.min(SW, SH) / 2 - 30) / 1.62;   // Mars' orbit just inside the edge

    sctx.clearRect(0, 0, SW, SH);

    // the Sun's light
    var glow = sctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(SW, SH) * 0.46);
    glow.addColorStop(0, 'rgba(255,206,138,.30)');
    glow.addColorStop(0.35, 'rgba(232,163,74,.09)');
    glow.addColorStop(1, 'rgba(232,163,74,0)');
    sctx.fillStyle = glow;
    sctx.fillRect(0, 0, SW, SH);

    // orbits
    PLANETS.forEach(function (pl) {
      var a = p[pl.key].a * scale;
      sctx.strokeStyle = pl.key === 'earth' ? 'rgba(127,176,232,.26)' : 'rgba(244,234,216,.10)';
      sctx.lineWidth = 1;
      sctx.beginPath(); sctx.arc(cx, cy, a, 0, Math.PI * 2); sctx.stroke();
    });

    // the Sun
    sctx.fillStyle = '#ffd79a';
    sctx.beginPath(); sctx.arc(cx, cy, 7, 0, Math.PI * 2); sctx.fill();

    // planets, where they actually are today
    sctx.font = '500 10.5px "Inter", system-ui, sans-serif';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';

    PLANETS.forEach(function (pl) {
      var v = p[pl.key];
      var x = cx + v.x * scale, y = cy - v.y * scale;

      if (pl.key === 'earth') {
        var ring = sctx.createRadialGradient(x, y, 0, x, y, 20);
        ring.addColorStop(0, 'rgba(127,176,232,.42)');
        ring.addColorStop(1, 'rgba(127,176,232,0)');
        sctx.fillStyle = ring;
        sctx.beginPath(); sctx.arc(x, y, 20, 0, Math.PI * 2); sctx.fill();
      }

      sctx.fillStyle = pl.color;
      sctx.beginPath(); sctx.arc(x, y, pl.r, 0, Math.PI * 2); sctx.fill();

      var below = y > cy;
      sctx.fillStyle = pl.key === 'earth' ? 'rgba(200,222,250,.95)' : 'rgba(211,200,181,.75)';
      sctx.fillText(CSM.t(pl.label), x, y + (below ? pl.r + 11 : -pl.r - 11));
    });

    // scale caption, drawn inside the frame
    sctx.textAlign = 'left';
    sctx.font = '400 9.5px "IBM Plex Mono", ui-monospace, monospace';
    sctx.fillStyle = 'rgba(160,171,192,.9)';
    sctx.fillText(CSM.t('solar.scale'), 12, SH - 14);

    paintSolarStats(p);
  }

  function paintSolarStats(p) {
    var ul = $('solar-stats');
    if (!ul) return;
    ul.innerHTML = '';

    var earth = p.earth;
    var rows = [
      { color: '#ffd79a', label: CSM.t('planet.sun'),
        value: Math.hypot(earth.x, earth.y, earth.z) },
      { color: '#9aa3b4', label: CSM.t('planet.mercury'), value: A.distanceAU(earth, p.mercury) },
      { color: '#e2c08a', label: CSM.t('planet.venus'),   value: A.distanceAU(earth, p.venus) },
      { color: '#d98a6a', label: CSM.t('planet.mars'),    value: A.distanceAU(earth, p.mars) }
    ];

    rows.forEach(function (r) {
      var li = document.createElement('li');
      var k = document.createElement('span');
      k.className = 's-key';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = r.color;
      k.appendChild(sw);
      k.appendChild(document.createTextNode(r.label));

      var v = document.createElement('span');
      v.className = 's-val';
      v.textContent = CSM.fmt(r.value * A.AU / 1e6, 1) + ' ' + CSM.t('unit.mkm');

      li.appendChild(k);
      li.appendChild(v);
      ul.appendChild(li);
    });

    // and the Station, for scale
    var pos = CSM.position();
    var alt = pos ? pos.altitude : 420;
    var li2 = document.createElement('li');
    var k2 = document.createElement('span');
    k2.className = 's-key';
    var sw2 = document.createElement('span');
    sw2.className = 'swatch';
    sw2.style.background = '#e8a34a';
    k2.appendChild(sw2);
    k2.appendChild(document.createTextNode(CSM.t('solar.iss')));
    var v2 = document.createElement('span');
    v2.className = 's-val';
    v2.textContent = CSM.fmt(alt, 0) + ' ' + CSM.t('unit.km');
    li2.appendChild(k2); li2.appendChild(v2);
    ul.appendChild(li2);
  }

  /* ================================================================== */

  CSM.onResize(function () { sizeLadder(); sizeSolar(); });
  CSM.on('lang', function () { paintLadder(); paintSolar(); });
  CSM.on('position', paintLadder);   // the ladder tracks the live altitude

  sizeLadder();
  sizeSolar();
  setInterval(paintSolar, 10 * 60 * 1000);   // the planets are in no hurry
})();
