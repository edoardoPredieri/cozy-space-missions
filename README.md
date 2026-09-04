# Cozy Space Missions

A quiet window on the sky: where the International Space Station is, right now.

**Live:** https://edoardopredieri.github.io/cozy-space-missions/

A static page — no framework, no build step. Open it, look up, it keeps itself current.
English by default, Italian one click away.

## What it does today

- Live ISS position on an equirectangular map drawn on canvas
- Ground track for the past hour and the next one
- Day/night terminator computed from the subsolar point
- Visible-horizon circle (footprint)
- Country or ocean below the Station, resolved locally — no reverse-geocoding call
- Altitude, speed, and whether the Station is in sunlight or in the Earth's shadow
- English / Italian switch, remembered between visits

## Structure

```
index.html          single page
assets/style.css    "warm night / observatory" styling
assets/app.js       starfield, map, live data, language switching
assets/i18n.js      all UI strings, English and Italian
assets/world.js     simplified borders, English + Italian names (~70 KB)
```

## Data

- Position and track: [Where the ISS at?](https://wheretheiss.at/w/developer) — public API,
  no key, roughly 1 request/second. The page refreshes the position every 5 seconds and
  the track every 3 minutes.
- Borders: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  [johan/world.geo.json](https://github.com/johan/world.geo.json), simplified with
  Douglas–Peucker.

No cookies, no analytics, no CDN dependency other than Google Fonts.

## Adding a language

Add a block to `window.I18N` in `assets/i18n.js` with the same keys as `en`, then add a
button to the `.lang` group in `index.html`. Country names live in `assets/world.js`
(`n` is English, `it` the Italian name where it differs).

## Local development

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Roadmap

- [x] Live ISS map
- [ ] More missions: Hubble, Tiangong, Roman, JWST
- [ ] Enter your city and get visible-pass predictions (SGP4 over TLEs)
- [ ] iOS app

## Licence

Code under the MIT licence (see `LICENSE`). Natural Earth data is public domain.
