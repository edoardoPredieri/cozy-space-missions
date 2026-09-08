# Tests

Nothing here runs in the browser as part of the site — these exist so the claims
in the main README can be checked rather than believed.

```bash
pip install playwright && playwright install chromium
python3 tests/test_csp.py     # the policy blocks nothing the pages need
python3 tests/test_sec.py     # hostile inputs leave the pages boring
node    tests/sgp4check.mjs   # the propagator agrees with the official vectors
```

Each Python test serves the repo on a local port and drives it with a real
browser; neither one needs the internet, because every outside call is stubbed.

**`test_csp.py`** loads both pages with a `securitypolicyviolation` listener
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
  word, elements dated in the far future.

**`sgp4check.mjs`** runs the two official Space-Track Report #3 test cases
through the vendored propagator. `spacetrack-report-3.json` is copied from
satellite.js (MIT) — see `../assets/vendor/PROVENANCE.md`. Current agreement:
2.9 cm in position, 1.1 cm/s in velocity.

One thing worth knowing if you write more of these: the pages'
Content-Security-Policy forbids `eval`, and Playwright's `wait_for_function`
compiles a bare string with `eval` inside the page. Pass a function instead —
`wait_for_function("() => …")` — or the test fails with a CSP error that looks
like a bug in the site.
