# Cozy Space Missions

A quiet window on the sky: where the International Space Station is, when it comes over you,
and where Earth sits among its neighbours.

**Live:** https://edoardopredieri.github.io/cozy-space-missions/

A static page — no framework, no build step. English by default, Italian one click away.

## What it does

**Live position.** The ISS on an equirectangular map drawn on canvas, with its ground track for
the past hour and the next, the day/night terminator computed from the subsolar point, the
visible-horizon circle, and the country or ocean below it (resolved locally, no reverse-geocoding call).

**From where you are.** Search a street, town or postcode through OpenStreetMap, or let the browser
share your position. The page then shows the slant distance to the Station, which way to turn, how
high above your horizon it is, and a sky dome with the Station plotted by azimuth and elevation.
Below that, the next passes over the following twelve hours — duration, maximum elevation, the
direction it comes from and goes to, and whether it will actually be visible to the naked eye
(the Station still in sunlight while your sky is already dark).

**How far up is up?** A logarithmic ladder from the ground to the Moon, with the Station's live
altitude marked among the edge of space, Hubble, GPS and geostationary satellites.

**The neighbourhood.** A top-down view of the inner solar system with Mercury, Venus, Earth and
Mars in their real positions for today, plus current distances from Earth — and the Station's
420 km on the same list, for scale.

## Structure

```
index.html          single page, SVG icon sprite, text marked with data-i18n
assets/style.css    "warm night / observatory": tokens, grain, cards
assets/i18n.js      every string, English and Italian
assets/astro.js     sun position, look angles, track interpolation, planet ephemeris
assets/app.js       starfield, world map, live data, language switching
assets/observer.js  geocoding, sky dome, pass prediction
assets/space.js     altitude ladder, inner solar system
assets/world.js     simplified borders, English + Italian names (~70 KB)
```

## How the passes are worked out

There is no TLE and no SGP4 here, on purpose — one fewer dependency and one fewer thing to break.
The page asks *Where the ISS at?* for the Station's position every six minutes over the next twelve
hours (thirteen batched calls, spaced out to respect the API), then interpolates that track locally
with a Catmull-Rom spline on the unit sphere down to twenty-second resolution. Interpolation error
is around 0.03°, which is a few kilometres on the ground and a handful of seconds on pass timing.

Look angles come from a spherical-Earth ENU transform. Sunlight is geometric: the Station at
altitude *h* stays lit until the Sun is `acos(R / (R + h))` below its local horizon — about 20°
at 420 km. A pass counts as visible when the Station is lit and the Sun is more than 6° below
the observer's horizon.

Planet positions use the JPL approximate Keplerian elements (valid 1800–2050), accurate to a
fraction of a degree — plenty for a picture of the neighbourhood.

## Visual notes

The palette was cross-checked against the UI/UX Pro Max colour database, whose closest match
(*Time amber + night indigo on dark*) lands within a few points of the hand-picked tokens.
Depth follows its glassmorphism spec: 14 px backdrop blur, a 1 px warm border, and a light
reflection across the top-left of each card.

Two decorative aurora layers drift on `transform` alone (44 s and 58 s, alternating), and a
faint Earth limb curves along the bottom of the viewport. Both are off under
`prefers-reduced-motion`, and the composited background luminance behind body copy was measured
from rendered screenshots — not from the token values — to confirm text still clears 4.5:1 over
the warm haze.

On the map, the night side is drawn three ways so it never reads by colour alone: a fill, a
twilight rim along the terminator, and scattered warm city lights on the land that happens to be
in darkness.

## Accessibility

Audited against the UI/UX Pro Max rule set. Every text/background pair meets 4.5:1 (verified by
compositing the real translucent surfaces, not the token values); pointer targets are 24 CSS px or
larger, 44 px on coarse pointers; headings run h1→h4 without skipping; icons are SVG with
`aria-hidden` beside visible text; the canvases carry `role="img"` and translated labels.

The page has exactly one polite live region. The status pill updates every five seconds, so it is
deliberately *not* live — announcing a clock every five seconds is worse than announcing nothing.
Real events (position set, passes found, connection lost, form errors) go through the single
announcer instead. Motion is opacity and transform only, 350 ms, and disabled entirely under
`prefers-reduced-motion`.

## Data and privacy

- Position and track: [Where the ISS at?](https://wheretheiss.at/w/developer) — public API, no key,
  about one request per second.
- Address search: [Nominatim / OpenStreetMap](https://openstreetmap.org/copyright), only when you
  press Search. Coordinates from the browser's geolocation are never sent anywhere; the chosen
  position is kept in `localStorage` and used only for local maths.
- Borders: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  [johan/world.geo.json](https://github.com/johan/world.geo.json), simplified with Douglas–Peucker.

No cookies, no analytics, no CDN dependency other than Google Fonts.

## Adding a language

Add a block to `window.I18N` in `assets/i18n.js` with the same keys as `en`, then a button in the
`.lang` group in `index.html`. Country names live in `assets/world.js` (`n` is English, `it` the
Italian name where it differs).

## Local development

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Roadmap

- [x] Live ISS map
- [x] Your position, and when to look up
- [ ] More missions: Hubble, Tiangong, Roman, JWST
- [ ] iOS app

## Licence

Code under the MIT licence (see `LICENSE`). Natural Earth data is public domain.
