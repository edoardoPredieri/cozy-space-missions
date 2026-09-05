/* Bridges the vendored satellite.js (native ES modules, no bundler) into the
   plain scripts that make up the rest of the page.

   Loaded as <script type="module">, so it runs after the classic scripts. The
   TLE source waits for the ready event before propagating anything. */

import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong }
  from './vendor/satellite/index.js';

window.SGP4 = {
  twoline2satrec: twoline2satrec,
  propagate: propagate,
  gstime: gstime,
  eciToGeodetic: eciToGeodetic,
  degreesLat: degreesLat,
  degreesLong: degreesLong
};

window.dispatchEvent(new Event('sgp4ready'));
