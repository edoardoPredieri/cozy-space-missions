/* Cozy Space Missions — the bits of map-drawing that two pages both need.

   The mission pages and the front page draw different pictures of the same
   world: one adds a ground track, city lights and a blurred twilight rim, the
   other marks four missions at once and keeps the night plain. Those are
   choices about the picture. What is not a choice — where the coastlines are,
   where the day/night line falls, and how to draw a line that runs off one
   edge of the map and back on the other — lives here, once. */

window.GLOBE = (function () {
  'use strict';

  /* Where the Sun sits exactly on the horizon, longitude by longitude.
     Pure geometry: no canvas, no page. */
  function terminator(solarLat, solarLon) {
    var dec = solarLat;
    /* Within a whisker of an equinox the line runs through both poles and the
       tangent blows up, so the declination is nudged off zero. The error is a
       fraction of a degree on a line that is two pixels wide. */
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

  /* The night is whichever side of that line the Sun is not on: when the Sun
     is north of the equator, the long night is in the south. */
  function nightIsSouth(solarLat) { return solarLat > 0; }

  /* Traces the night as a closed shape, ready to fill or clip with. */
  function nightPath(ctx, px, py, W, H, solarLat, solarLon) {
    var pts = terminator(solarLat, solarLon);
    ctx.beginPath();
    ctx.moveTo(px(pts[0][0]), py(pts[0][1]));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i][0]), py(pts[i][1]));
    if (nightIsSouth(solarLat)) { ctx.lineTo(W, H); ctx.lineTo(0, H); }
    else { ctx.lineTo(W, 0); ctx.lineTo(0, 0); }
    ctx.closePath();
  }

  /* Coastlines. The data nests a country's polygons, each polygon's rings, and
     each ring's points — holes included, which is why it fills even-odd. */
  function paintLand(ctx, px, py, fill, stroke) {
    var world = window.WORLD;
    if (!world || !world.c) return;
    ctx.fillStyle = fill || '#1b2a45';
    ctx.strokeStyle = stroke || 'rgba(140,170,215,.20)';
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

  /* City lights, only where it is dark: the caller has already clipped to the
     night, so this just scatters them. */
  function paintCityLights(ctx, px, py) {
    var lights = window.WORLD && window.WORLD.l;
    if (!lights) return;
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      ctx.globalAlpha = 0.16 + L[2] * 0.42;
      ctx.fillStyle = '#ffcf8e';
      ctx.beginPath();
      ctx.arc(px(L[0]), py(L[1]), 0.55 + L[2] * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return {
    terminator: terminator,
    nightIsSouth: nightIsSouth,
    nightPath: nightPath,
    paintLand: paintLand,
    paintCityLights: paintCityLights
  };
})();
