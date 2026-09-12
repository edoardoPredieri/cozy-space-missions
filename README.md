# Cozy Space Missions

A quiet window on the sky: where four telescopes and one space station are right now, when they
come over you, and where Earth sits among its neighbours.

**Live:** [the front page](https://edoardopredieri.github.io/cozy-space-missions/) ·
[Space Station](https://edoardopredieri.github.io/cozy-space-missions/iss.html) ·
[Hubble](https://edoardopredieri.github.io/cozy-space-missions/hubble.html) ·
[Webb](https://edoardopredieri.github.io/cozy-space-missions/webb.html) ·
[Roman](https://edoardopredieri.github.io/cozy-space-missions/roman.html)

A static page — no framework, no build step. English by default, Italian one click away.

## The front page

The four mission pages each answer one mission's question well. The front page answers the question
you have before you pick one: what is up there, and is any of it worth going outside for.

**All of them, at once.** One world map, four marks — each the point on the ground that mission is
directly above, the one place it sits at the zenith. That works for something four hundred
kilometres up and for something a million and a quarter kilometres out, which is what lets all four
share a map. The two in orbit cross it in an hour and a half; the two at L2 just turn with the
Earth, once a day, and are always on the midnight side, because that is where the anti-Sun
direction points.

**Or the same moment from outside.** A second view of the same card swaps the map for the solar
system seen from above — the Sun, the eight planets in today's real positions, and the Earth among
them — with a magnified inset beside it holding everything that orbits close: the Moon, the Station,
Hubble, Webb and Roman, each at its true direction from the Earth and on a ten-times radial scale,
because otherwise the Station would be a pixel from the centre while Webb sat off the page. A line
points at the Sun, which is the one thing that makes the picture readable: the Moon's phase, the two
telescopes sitting opposite, and the Station crossing the day side all become the same fact seen
from a different angle. Both views are drawn from the same live positions the map uses, and the
figure is redrawn as they update.

**The Moon tonight, and the Earth from there.** Both discs are drawn at their real phase, lit from
the same side, because the same Sun lights both and the lit limb points at it whichever one you are
standing on. What differs is how much: the two fractions always add to one. When the Moon is full
for us it is a new Earth for anyone up there, and the picture says so without a caption.

**The four, side by side.** Distance, how long each has been up there, and what each is for, on one
ten-times scale — the only way four numbers spanning four thousandfold fit on a page.

**From where you are.** Optional, and the page is useful without it. Give it a place and it works
out sunrise, sunset, when the sky goes properly dark and for how long, then says one honest line
per mission: the Station passes at 21:14 and you will see it; Hubble never climbs past six degrees
from here; Webb and Roman are up all night and still need a serious telescope.

The front page makes two requests — the Station's orbital elements and Hubble's — and one more only
if you use the address search. Everything else, the Sun and Moon included, is worked out in the
browser.

## What the mission pages do

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

## Four missions, one engine

There are four pages and they are the same page. Each declares itself with
`<body data-satellite="…">`; `assets/config.js` holds everything that differs, and `t()` resolves
`<mission>.<key>` before falling back to the shared string, so only the copy that actually changes
is written more than once. The front page is a fifth entry in the same table (`kind: 'home'`,
`source: 'none'`), which is what lets it iterate the other four rather than restate them.

Every page carries the same group of five links — Home first, then the four missions — and marks
its own with `aria-current="page"`. On a phone the group takes a second row instead of pushing the
page sideways. Wherever you land, one tap goes back to the front page.

What differs is not the styling but the question each mission can honestly answer, and that comes
down to where it is.

**The Space Station** has a live feed. Its position is fetched every few seconds, and its passes
come from thirteen batched requests interpolated locally.

**Hubble** has no feed — nobody publishes one — so its page fetches the orbital elements once and
propagates them in the browser with SGP4. After that first request there is no network at all: the
ground track and twelve hours of pass predictions are pure arithmetic, so they appear instantly
instead of after a dozen throttled requests. The elements are cached for six hours.

Because the orbit is in hand, that page can say something the Station's cannot: Hubble's orbit is
tilted only 28.5°, so from 45° north it never climbs more than about 6° above the horizon. The
page says exactly that, with the number worked out for wherever you are, instead of leaving you
wondering why the pass list is empty.

**Webb and Roman** are somewhere else entirely — out near L2, about 1.5 million km away, directly
away from the Sun. Nothing out there has a ground track and nothing out there passes over your
house, so those pages do not pretend otherwise: there is no map and no "from where you are". What
they show instead is the distance, drawn to scale against the one distance everybody already has a
feel for — the Moon's. Webb is a little over three times further out than the Moon.

Their positions come from a table of real JPL Horizons positions shipped with the page and
interpolated in the browser with a cubic through the four surrounding samples. Checked against JPL
dates deliberately left out of the table, that is accurate to about 0.2%. Past the end of the
table the page falls back to the computed L2 point — which is coarser, because a telescope loops
around L2 by as much as 800,000 km rather than sitting on it — and says so in the "position from"
box rather than quietly carrying on.

**Roman is still on its way.** It launched on 30 August 2026 and reaches L2 around the end of
September, after which it has about ninety days of commissioning before the surveys start. Its
page works out where the mission is in that timeline from today's date, shows how far it has got,
and retires the whole section by itself once the journey is over.

## Structure

```
index.html          the front page: all four at once, the Moon, your sky
iss.html            the Space Station
hubble.html         Hubble — same structure, different mission
webb.html           Webb, out at L2
roman.html          Roman, on its way out to L2
assets/config.js    what differs between missions: kind, source, orbit, news search
assets/globe.js     coastlines and the day/night line, shared by every map
assets/place.js     where the reader is: storage, geocoding, the rules about both
assets/home.js      the front page — the shared map, the phases, tonight
assets/style.css    "warm night / observatory": tokens, grain, cards
assets/i18n.js      every string, English and Italian
assets/astro.js     sun and moon position, look angles, track interpolation, planet ephemeris
assets/app.js       starfield, world map, live data, language switching, the shared bus
assets/observer.js  geocoding, sky dome, pass prediction
assets/space.js     the zoomable viewer, distance ladder, solar system
assets/news.js      latest headlines, fetched lazily and rendered as plain text
assets/tle.js       orbital elements, cached, propagated locally
assets/sgp4.js      module shim over the vendored satellite.js
assets/l2.js        the L2 missions: the shipped table, interpolation, the fallback
assets/deep.js      the Earth–Moon–L2 picture, its numbers, and Roman's journey
assets/ephem.js     real JPL positions for Webb and Roman (generated — see tools/)
assets/vendor/      satellite.js 5.0.0 (MIT), as native ES modules
assets/vendor/PROVENANCE.md  where it came from, what was changed, how to update it
assets/world.js     simplified borders, English + Italian names (~70 KB)
tools/make-ephem.py rebuilds assets/ephem.js from JPL Horizons
tools/horizons-raw/ the raw Horizons responses, so the build can be checked
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
  position is used only for local maths.
- Borders: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  [johan/world.geo.json](https://github.com/johan/world.geo.json), simplified with Douglas–Peucker.

No cookies, no analytics, no CDN dependency other than Google Fonts.

**What gets written down is blunter than what the page knows.** Every project published under a
`github.io` account shares one origin, so anything else on that account can read this site's
`localStorage`. The remembered position is therefore rounded to three decimal places — about a
hundred metres, which changes no pass prediction by a second but is a neighbourhood rather than an
address. The precise position the browser hands over stays in memory for the visit and is never
persisted. Nothing else about you is stored: a language choice, and Hubble's orbital elements.

## Security

The page's whole attack surface is other people's data — three or four public APIs, plus whatever
is sitting in `localStorage` — so the rules are about where that data is allowed to go.

**Nothing fetched is ever markup.** Feed titles, place names and country names go in through
`textContent` or built nodes. `innerHTML` appears seven times and six of them assign the empty
string to clear a list; the one line that writes actual HTML, in `app.js`, writes translations,
and `i18n.js` is source code shipped with the page — nothing fetched, typed or stored is ever
allowed into it. The comment at that line says so, so that the invariant survives the next person
to touch it.

**Nothing third-party executes.** satellite.js is vendored rather than pulled from a CDN, because a
CDN script is a standing invitation to replace it later; `assets/vendor/PROVENANCE.md` records the
exact commit and the one mechanical change made to it. That is what lets the
Content-Security-Policy on both pages read `default-src 'none'` with `script-src 'self'` and no
exceptions — no inline scripts, no `unsafe-inline`, no `unsafe-eval`. `connect-src` lists only the
handful of hosts each page actually calls, and the two pages list different ones: Hubble's page
never touches the Station's feed, so that host is not reachable from it at all.

**Elements are checked before they become physics, and so is the orbit they produce.** A TLE is
validated for shape and length and for its NORAD id before SGP4 sees it — but it is worth being
plain about what that id is worth: it is five characters of the same string the server sent, a
label the sender chose rather than a signature. Checking it catches an honest mix-up and nothing
more. What a relabelled TLE cannot fake is the orbit itself, because the orbit is what gets drawn,
so the propagated inclination has to match the inclination the mission is known to have. Hand the
page the Station's elements under Hubble's catalogue number and it sees 51.6° where it expects
28.5°, and draws nothing rather than a confident lie. Altitude and period are bounded too, and the
same gate runs on the cached copy — including its date, since a timestamp in the far future would
otherwise make a poisoned entry permanently fresh.

**The far pages ask nobody where they are.** Webb's and Roman's positions are shipped with the
page, so their `connect-src` allows exactly one host — the news feed — and nothing else. That is the
strongest version of the argument for vendoring: a table of numbers in the repository cannot be
swapped out from under the page, cannot fail to load, and cannot be a CORS problem. It goes stale
instead, which is a failure you can see coming and schedule around, and `tools/make-ephem.py`
rebuilds it in one command. The table is still validated on load like everything else — sample
shape, plausible distances, time running forwards — and a table that fails falls back to the
computed L2 point and says so.

**A feed that answers is not the same as a feed that is right.** The Station's position is checked
for real angles and a real altitude before it is drawn; nulls or a maintenance page parsed as JSON
now read as a lost connection rather than as `NaN° N` under a green light. Everything read back
from `localStorage` — position, language, elements — goes through the same kind of gate, because
that storage is shared with every other page on the origin.

`tests/` holds the evidence: `test_csp.py` asserts the policy blocks nothing any of the four pages
need, `test_sec.py` feeds them hostile elements, a hostile geocoder, a lying feed, a corrupted
ephemeris and poisoned storage and asserts they stay boring, `test_missions.py` checks that no
page announces a mission it is not about, and `sgp4check.mjs` checks the propagator against the
official vectors. See `tests/README.md`.

### What cannot be fixed here

GitHub Pages serves static files and sends no headers of its own, and a `<meta>` policy cannot
carry every directive. So three protections are simply unavailable:

- **`frame-ancestors`** — meta policies ignore it, so the pages can be framed by anyone. There is
  nothing to clickjack (no login, no button that changes anything for anyone else), which is the
  only reason this is acceptable rather than a bug.
- **`X-Content-Type-Options: nosniff`** and **`Permissions-Policy`** — headers only. Geolocation is
  therefore not locked down at the platform level; it is only ever requested when you press the
  button.

Moving to any host that can send headers (Cloudflare Pages, Netlify) would close all three without
a single change to the code.

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
- [x] Four missions on one engine: the Station, Hubble, Webb and Roman
- [ ] Tiangong
- [ ] A way to show where an L2 telescope sits in tonight's sky — it is always opposite the Sun,
      so it is up all night and highest at local midnight, though at magnitude 16 or so you would
      need a serious telescope to see it
- [ ] Refresh `assets/ephem.js` once JPL publishes Roman's trajectory past L2 arrival
- [ ] iOS app

## Licence

Code under the MIT licence (see `LICENSE`). Natural Earth data is public domain.
