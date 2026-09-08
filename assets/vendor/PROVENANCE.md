# Where this code came from

Third-party code is vendored here rather than pulled from a CDN at run time. A
CDN script is a permanent invitation: whoever controls that host can, on any
future page load, replace the file with something else and it will run with the
full authority of this origin. Copying the code in fixes what runs, lets the
Content-Security-Policy say `script-src 'self'` with no exceptions, and makes
this file the record of exactly what was copied.

## satellite.js 5.0.0

| | |
|---|---|
| Upstream | https://github.com/shashwatak/satellite-js |
| Version | 5.0.0 |
| Commit | `8a6aada761d41b2dafd3c627fbe265a031d45579` ("Version 5.0.0", 2023-01-06) |
| Taken from | `src/` in that commit — the original ES modules, not a build artefact |
| Licence | MIT — `satellite/LICENSE.md`, copied verbatim |
| Used for | SGP4 propagation of orbital elements, on `hubble.html` |

### What was changed

One thing, mechanically: every relative import gained a `.js` suffix, because a
browser loading native ES modules will not guess the extension the way a
bundler does.

```
-import { pi, twoPi } from './constants';
+import { pi, twoPi } from './constants.js';
```

Nothing else was touched. All 16 files are byte-identical to upstream once
those suffixes are stripped, which is a one-line check:

```bash
diff <(sed "s/\.js'/'/g" assets/vendor/satellite/<file>) <upstream>/src/<file>
```

Fingerprint of the tree as vendored, so a later change is visible:

```bash
find assets/vendor/satellite -name '*.js' | sort | xargs sha256sum | sha256sum
# 6b08951a93278055702a5c2779429cd3e2c350c588c4cf6ba17ce6a0979318a7
```

### Why this version is trusted

It was checked before it was believed, not after. `tests/sgp4check.mjs` runs the
official Space-Track Report #3 verification vectors through it — the vectors
themselves are in `tests/spacetrack-report-3.json`, copied from the same
upstream repo — and position agrees to 29 metres, velocity to 1.1 cm/s. End to
end, propagating the Space Station's own elements and comparing against the
position wheretheiss.at publishes for the same instant agrees to 0.4 km on the
ground and 0.1 km in altitude.

### Updating it

1. Clone upstream, check out the tag, and copy `src/` over `satellite/`.
2. Re-add the `.js` import suffixes.
3. Re-run `tests/sgp4check.mjs` — a propagator that quietly goes wrong is worse
   than one that fails loudly.
4. Update the commit, the tree hash and the licence file here.

## Data, as opposed to code

Country borders in `assets/world.js` are Natural Earth (public domain), taken
via [johan/world.geo.json](https://github.com/johan/world.geo.json) and
simplified with Douglas–Peucker. They are data the page draws, never code it
runs.
