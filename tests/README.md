# Tests

Nothing here runs in the browser as part of the site — these exist so the claims
in the main README can be checked rather than believed.

```bash
pip install playwright && playwright install chromium
python3 tests/test_csp.py       # the policy blocks nothing the pages need
python3 tests/test_sec.py       # hostile inputs leave the pages boring
python3 tests/test_deep.py      # Webb and Roman agree with JPL
python3 tests/test_solar.py     # each page shows its own mission in the neighbourhood
python3 tests/test_ladder.py    # nothing vanishes from the distance ladder
python3 tests/test_phase.py     # the Moon disc shows the fraction the page claims
python3 tests/test_missions.py  # each page speaks only for itself
python3 tests/test_home.py      # there is a way home, and the solar view is honest
python3 tests/test_future.py    # the pages age honestly once the table runs out
node    tests/sgp4check.mjs     # the propagator agrees with the official vectors
```

Each Python test serves the repo on a local port and drives it with a real
browser; none of them need the internet, because every outside call is stubbed.

**`test_csp.py`** loads all five pages with a `securitypolicyviolation` listener
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

**`test_phase.py`** counts the lit pixels of the Moon and Earth discs the
browser actually painted and compares them with the percentages printed beside
them, at eight points around one lunation. It exists because a phase drawing
has exactly one number in it and one easy way to get that number backwards —
the signed half-width of the terminator — and getting it backwards paints the
precise complement, which looks entirely plausible. It was backwards: the page
said 58% next to a disc that was 42% lit, and the Moon and the Earth were
showing each other's phase.

**`test_ladder.py`** works out where every planet, the Sun and the Moon belong
on the distance ladder — from the same astronomy the figure uses — and then
looks for a mark at each of those places, at three widths. It exists because
the label placer used to drop the dot along with a name that would not fit, so
whole planets left the axis and what remained read as Venus, the Sun, Jupiter.
That looks like the ordering is broken; it is not. The axis is distance from
Earth *today*, so it also asserts the Sun falls between Venus and Mercury,
which is exactly where it belongs while Venus is on our side of it and Mercury
is on the far side.

**`test_missions.py`** walks all four pages in both languages and reads what a
visitor would see, checking that no page announces a mission it is not about.
The risk it guards is structural: any shared string that a mission forgets to
override falls back to one written for the Space Station. Copy written *per
mission* may name whoever it likes — that Roman carries a mirror the same size
as Hubble's is the comparison NASA leads with — so the hero, the captions, the
navigation, the ladder and the roadmap are exempt by design.

**`test_home.py`** covers the two things only the front page can get wrong. The
first is navigation: every page must carry a link home and exactly one entry
marked as the current page, and home may be that entry only on the front page —
a site whose pages have no way back is a site people leave. The second is the
solar view, which draws five objects around a magnified Earth at their real
directions. That is a claim that can be checked rather than admired, so it is:
the two telescopes must sit more than 150° from the Sun, because that is what L2
means, and the Moon must sit within 25° of the Sun a day after new and more than
155° away at full. If the conversion that puts a space station and a telescope a
million kilometres away into one frame were wrong, those are the facts that would
break first.

**`test_future.py`** winds the clock past the end of the shipped JPL table and
checks that the L2 pages fall back to the computed L2 point, relabel the source
instead of still crediting Horizons, and leave blank the one number they can no
longer know — the rate of change — rather than guessing it.

**`sgp4check.mjs`** runs the two official Space-Track Report #3 test cases
through the vendored propagator. `spacetrack-report-3.json` is copied from
satellite.js (MIT) — see `../assets/vendor/PROVENANCE.md`. Current agreement:
29 metres in position, 1.1 cm/s in velocity.

One thing worth knowing if you write more of these: the pages'
Content-Security-Policy forbids `eval`, and Playwright's `wait_for_function`
compiles a bare string with `eval` inside the page. Pass a function instead —
`wait_for_function("() => …")` — or the test fails with a CSP error that looks
like a bug in the site.
