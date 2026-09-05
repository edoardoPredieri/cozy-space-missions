/* Cozy Space Missions — one page per mission, one engine underneath.

   Each page declares which mission it is with <body data-satellite="…">, and
   everything else — the live source, the copy, the news search — comes from
   here. Adding a mission means adding an entry and a thin HTML page. */

window.CSM_SATS = {

  iss: {
    id: 'iss',
    norad: 25544,
    page: 'index.html',

    /* wheretheiss.at publishes the Station's position directly, including the
       sub-solar point. It has been reliable, so it stays. */
    source: 'wheretheiss',

    inclination: 51.6,       // degrees — decides how high it can ever get for you
    altKm: 420,              // fallback until the first reading arrives
    minElevation: 10,        // a pass lower than this is not worth going outside for

    news: 'International Space Station',
    accent: '#e8a34a'
  },

  hubble: {
    id: 'hubble',
    norad: 20580,
    page: 'hubble.html',

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

    news: 'Hubble',
    accent: '#e8a34a'
  }

};

window.CSM_SAT = window.CSM_SATS[document.body.getAttribute('data-satellite') || 'iss'] ||
                 window.CSM_SATS.iss;
