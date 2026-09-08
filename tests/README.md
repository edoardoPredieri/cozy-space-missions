# Tests

Nothing here runs in the browser as part of the site — these exist so the claims
in the main README can be checked rather than believed.

```bash
pip install playwright && playwright install chromium
python3 tests/test_csp.py       # the policy blocks nothing the pages need
python3 tests/test_sec.py       # hostile inputs leave the pages boring
python3 tests/test_deep.py      # Webb and Roman agree with JPL
python3 tests/test_solar.py     # each page shows its own mission in the neighbourhood
python3 tests/test_missions.py  # each page speaks only for itself
node    tests/sgp4check.mjs     # the propagator agrees with the official vectors
```

Each Python test serves the repo on a local port and drives it with a real
browser; none of them need the internet, because every outside call is stubbed.

**`test_csp.py`** loads all four pages with a `securitypolicyviolation` listener
attached and asserts zero violations, then checks that the things the policy
could plausibly have broken still work: the vendored ES modules, the stylesheet,
the canvases, the right mission on the right page.

**`test_sec.py`** is the adversarial one. It serves each page a hostile answer
and asserts the page stays dull:

- orbital elements for the wrong satellite — both relabelled with Hubble's
  catalogue number and not — a truncated line, an HTML error page, a `<script>`
  tag where the name should be;
- a geocoder answering with markup in the place name, a 5000-character label and
  two hundred results;
- a `localStorage` written by somebody else: latitude 999, a longitude that is a
  word, elements dated in the far future;
- a corrupted L2 ephemeris — a distance out past the asteroid belt, a distance
  that is a word, time running backwards, the table gone — where the right
  answer is to fall back to the computed L2 point and relabel the source, never
  to draw a confident wrong distance.

**`test_deep.py`** is the end-to-end for Webb and Roman. It pins the browser
clock to a fixed instant and compares the distance the page shows against what
JPL says for that same instant — a comparison that is only meaningful with the
clock held still, since Roman is moving away fast enough to cover 36,000 km in
the time between midnight and teatime. It also checks that these pages carry no
map and no observer section, that Roman's journey panel is showing and Webb's is
not, and that Italian leaves no English behind.

**`test_solar.py`** counts amber pixels on the solar-system canvas, because
that colour belongs to the mission and nothing else on that figure. It exists
because the figure was written for a satellite going round the Earth and drew
the mission only at a zoom about 33,000 km across — so on the two L2 pages,
where the telescope is forty times further out than that view is wide, the one
thing the reader came for was silently missing. It also checks that the closest
preset is named after the mission and is wide enough to hold it. The
Earth-and-Moon view is deliberately not checked: that canvas is square, spans
about a million km, and something three times the Moon's distance away belongs
outside a view named after the Moon.

**`test_missions.py`** walks all four pages in both languages and reads what a
visitor would see, checking that no page announces a mission it is not about.
The risk it guards is structural: any shared string that a mission forgets to
override falls back to one written for the Space Station. Copy written *per
mission* may name whoever it likes — that Roman carries a mirror the same size
as Hubble's is the comparison NASA leads with — so the hero, the captions, the
navigation, the ladder and the roadmap are exempt by design.

**`sgp4check.mjs`** runs the two official Space-Track Report #3 test cases
through the vendored propagator. `spacetrack-report-3.json` is copied from
satellite.js (MIT) — see `../assets/vendor/PROVENANCE.md`. Current agreement:
29 metres in position, 1.1 cm/s in velocity.

One thing worth knowing if you write more of these: the pages'
Content-Security-Policy forbids `eval`, and Playwright's `wait_for_function`
compiles a bare string with `eval` inside the page. Pass a function instead —
`wait_for_function("() => …")` — or the test fails with a CSP error that looks
like a bug in the site.
