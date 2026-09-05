# Cozy Space Missions

A quiet window on the sky: where the International Space Station is, when it comes over you,
and where Earth sits among its neighbours.

**Live:** https://edoardopredieri.github.io/cozy-space-missions/ ·
[Hubble](https://edoardopredieri.github.io/cozy-space-missions/hubble.html)

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

**How far up is up?** A logarithmic ladder of distances from Earth, from the edge of space out
past Neptune: the Station's live altitude, Hubble, GPS and geostationary satellites, the Moon,
the Sun and every planet, all on one line where each step is ten times the one before.

**The neighbourhood.** The solar system from above, with the Sun and all eight planets in their
real positions for today — Saturn with its rings, Jupiter with its bands, Mars with its polar
cap, all drawn procedurally. Keep zooming past Earth and the Moon's orbit appears, then Earth
itself as a lit disc with the Station's orbit hugging it.

Both figures zoom. Presets and buttons are the primary controls; a mouse can drag to pan,
⌘/Ctrl with the wheel (or a trackpad pinch) zooms, and with a figure focused the arrow keys pan
while `+`, `−` and `0` zoom and reset. Dragging is never the only way to do anything, as
WCAG 2.2 requires. A scale bar keeps the view honest across six orders of magnitude.

**Latest news.** Recent headlines about the Station, pulled from the
[Spaceflight News API](https://api.spaceflightnewsapi.net/) — NASA releases, NASASpaceflight and
the rest of the spaceflight press — each linking out to the publisher. The request only fires
once the section is scrolled into view, and every field that comes back is somebody else's text:
titles go in with `textContent`, never as markup, only `https` links are followed, duplicates are
dropped, and links carry `rel="noopener noreferrer"`.

## Two missions, one engine

There are two pages — the Space Station and Hubble — and they are the same page. Each declares
itself with `<body data-satellite="…">`; `assets/config.js` holds everything that differs, and
`t()` resolves `<mission>.<key>` before falling back to the shared string, so only the copy that
actually changes is written twice.

The difference that matters is where the position comes from. Nobody publishes a live feed for
Hubble, so its page fetches the orbital elements once and propagates them in the browser with
SGP4. After that first request there is no network at all: the ground track and twelve hours of
pass predictions are pure arithmetic, so they appear instantly instead of after a dozen throttled
requests. The elements are cached for six hours.

Because the orbit is in hand, the page can also say something the Station's page cannot. Hubble's
orbit is tilted only 28.5°, so from 45° north it never climbs more than about 6° above the
horizon — and the page says exactly that, with the number worked out for wherever you are,
instead of leaving you wondering why the pass list is empty.

## Structure

```
index.html          the Space Station
hubble.html         Hubble — same structure, different mission
assets/config.js    what differs between missions: source, orbit, news search
assets/style.css    "warm night / observatory": tokens, grain, cards
assets/i18n.js      every string, English and Italian
assets/astro.js     sun and moon position, look angles, track interpolation, planet ephemeris
assets/app.js       starfield, world map, live data, language switching, the shared bus
assets/observer.js  geocoding, sky dome, pass prediction
assets/space.js     the zoomable viewer, distance ladder, solar system
assets/news.js      latest headlines, fetched lazily and rendered as plain text
assets/tle.js       orbital elements, cached, propagated locally
assets/sgp4.js      module shim over the vendored satellite.js
assets/vendor/      satellite.js 5.0.0 (MIT), as native ES modules
assets/world.js     simplified borders, English + Italian names (~70 KB)
```

## How the passes are worked out

**The Station** keeps its original method, which needs no orbital mechanics: the page asks
*Where the ISS at?* for its position every six minutes over the next twelve hours (thirteen
batched calls, spaced out to respect the API), then interpolates that track locally with a
Catmull-Rom spline on the unit sphere down to twenty-second resolution. Interpolation error is
around 0.03°, a few kilometres on the ground and a handful of seconds on pass timing.

**Hubble** propagates its own orbit instead, which is both faster and more precise. satellite.js
is vendored under `assets/vendor/` as native ES modules — no bundler, no CDN, so the site stays
self-contained — and it reproduces the official Space-Track Report #3 verification vectors to
within 29 metres in position and 1.1 cm/s in velocity. As an end-to-end check, propagating the
Station's own elements and comparing against the position wheretheiss.at publishes for the same
instant agrees to 0.4 km on the ground and 0.1 km in altitude.

Look angles come from a spherical-Earth ENU transform. Sunlight is geometric: the Station at
altitude *h* stays lit until the Sun is `acos(R / (R + h))` below its local horizon — about 20°
at 420 km. A pass counts as visible when the Station is lit and the Sun is more than 6° below
the observer's horizon.

Planet positions use the JPL approximate Keplerian elements for all eight planets (valid
1800–2050), accurate to a fraction of a degree, and a low-precision lunar theory for the Moon —
plenty for a picture of the neighbourhood. Every position was checked against its known orbital
range before being trusted.

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

## Deploying

The asset URLs in `index.html` carry a `?v=N` suffix. **Increment it whenever you change a file
under `assets/`**, otherwise browsers that already have the page open keep serving the old CSS and
JS from cache and the deploy looks like it did nothing. GitHub Pages itself updates within a minute
or two of the push.

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
