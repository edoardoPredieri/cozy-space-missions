/* Cozy Space Missions — one page per mission, one engine underneath.

   Each page declares which mission it is with <body data-satellite="…">, and
   everything else — the live source, the copy, the news search — comes from
   here. Adding a mission means adding an entry and a thin HTML page. */

window.CSM_SATS = {

  /* The front page is not a mission: it is the one place that talks about all
     of them at once. It still declares itself here so it gets the same engine,
     the same language switch and the same status pill as everything else. */
  home: {
    id: 'home',
    page: 'index.html',
    kind: 'home',
    source: 'none',           // it has no single position to report
    accent: '#e8a34a'
  },

  iss: {
    id: 'iss',
    norad: 25544,
    page: 'iss.html',
    kind: 'orbit',            // goes round the Earth: it has a ground track and passes

    /* wheretheiss.at publishes the Station's position directly, including the
       sub-solar point. It has been reliable, so it stays. */
    source: 'wheretheiss',

    inclination: 51.6,       // degrees — decides how high it can ever get for you
    altKm: 420,              // fallback until the first reading arrives
    minElevation: 10,        // a pass lower than this is not worth going outside for
    launched: '1998-11-20T06:40:00Z',   // Zarya, the first module up

    /* The Station's own page uses the live feed above. The front page wants
       twelve hours of passes for four missions at once, which is arithmetic
       from the elements rather than a hundred and thirty requests. */
    tle: [
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle',
      'https://tle.ivanstanojevic.me/api/tle/25544'
    ],

    news: 'International Space Station',
    accent: '#e8a34a'
  },

  hubble: {
    id: 'hubble',
    norad: 20580,
    page: 'hubble.html',
    kind: 'orbit',

    /* Nobody publishes Hubble's position as a feed, so the page takes the
       orbital elements and works the position out itself, in the browser. */
    source: 'tle',
    tle: [
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=20580&FORMAT=tle',
      'https://tle.ivanstanojevic.me/api/tle/20580'
    ],

    inclination: 28.5,
    altKm: 476,              // it has been decaying since launch; the elements have the truth
    minElevation: 5,         // tilted low, so it never climbs far up north
    launched: '1990-04-24T12:33:51Z',

    news: 'Hubble',
    accent: '#e8a34a'
  },

  /* The two far ones. Nothing at L2 has a ground track or passes overhead, so
     these pages answer a different question — how far, in which direction, and
     how fast that is changing — and their positions come from a table of real
     JPL positions shipped with the page rather than from a live feed. */

  webb: {
    id: 'webb',
    page: 'webb.html',
    kind: 'deep',             // out at L2: no ground track, no passes
    source: 'ephem',
    ephem: 'jwst',

    nominalKm: 1.5e6,         // the L2 point; the real distance is in the table
    launched: '2021-12-25T12:20:00Z',
    magnitude: 16.5,          // far too faint for the naked eye, and the page says so
    arrived: '2022-01-24T19:05:00Z',

    news: 'James Webb Space Telescope',
    accent: '#e8a34a'
  },

  roman: {
    id: 'roman',
    page: 'roman.html',
    kind: 'deep',
    source: 'ephem',
    ephem: 'roman',

    nominalKm: 1.5e6,
    launched: '2026-08-30T11:26:04Z',

    /* Still on its way as this was written. The page works the phase out from
       the date, so it stops talking about the journey once the journey is
       over, without anyone having to remember to edit it. */
    cruiseDays: 30,           // roughly a month out to L2
    commissioningDays: 90,    // NASA's stated commissioning period before science
    magnitude: 16.5,

    news: 'Roman Space Telescope',
    accent: '#e8a34a'
  }

};

window.CSM_SAT = window.CSM_SATS[document.body.getAttribute('data-satellite') || 'home'] ||
                 window.CSM_SATS.home;

/* What the front page draws: every mission that has a page, with the orbital
   facts it needs to place them, in the order they sit above our heads. */
window.CSM_FLEET = ['iss', 'hubble', 'webb', 'roman'].map(function (id) {
  return window.CSM_SATS[id];
});
