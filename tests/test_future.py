#!/usr/bin/env python3
"""What the L2 pages say on days that have not happened yet.

Two things go stale on their own here: the shipped ephemeris runs out (Roman's
ends 2 October 2026, because JPL has not published its trajectory past arrival),
and Roman's journey ends. Both are supposed to degrade honestly without anyone
editing anything, so this walks the browser clock forward and reads the page on
each date.
"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8116

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

# date, page, what should be true on that day
DAYS = [
    ("2026-09-25T12:00:00Z", "roman.html", "still cruising, table still covers it"),
    ("2026-10-05T12:00:00Z", "roman.html", "past the end of the table, arrived"),
    ("2026-12-01T12:00:00Z", "roman.html", "commissioning"),
    ("2027-02-01T12:00:00Z", "roman.html", "journey over, section retired"),
    ("2027-09-01T12:00:00Z", "webb.html",  "near the end of Webb's table"),
    ("2028-06-01T12:00:00Z", "webb.html",  "long past the end of Webb's table"),
]

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for when, page, note in DAYS:
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        ctx.clock.install(time=when)
        ctx.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
        pg.wait_for_function("() => window.CSM && window.CSM.position()", timeout=15000)
        pg.wait_for_timeout(900)

        d = pg.evaluate("""() => {
          const p = window.CSM.position();
          const j = document.getElementById('journey');
          return {
            km: p.km, exact: p.exact,
            dist: (document.getElementById('v-dist') || {}).textContent || '',
            moons: (document.getElementById('v-moons') || {}).textContent || '',
            rate: (document.getElementById('v-rate') || {}).textContent || '',
            sun: (document.getElementById('v-sun') || {}).textContent || '',
            where: (document.getElementById('v-where') || {}).textContent || '',
            journeyShown: j ? !j.hidden : None_,
            phase: j && !j.hidden ? document.getElementById('j-phase').textContent : null,
            note: j && !j.hidden ? document.getElementById('j-note').textContent : null,
            bar: j && !j.hidden ? document.getElementById('j-bar').style.width : null
          };
        }""".replace("None_", "null"))

        print(f"\n=== {when[:10]}  {page} — {note} ===")
        print("    distance:", d["dist"], "| moons:", d["moons"], "| rate:", d["rate"],
              "| sun:", d["sun"], "| from:", d["where"])
        if d["journeyShown"]:
            print("    journey:", d["phase"], "|", d["bar"], "|", (d["note"] or "")[:90])

        # Whatever the date, the page must never show nonsense.
        check("a plausible distance", 1e5 < d["km"] < 3e6, f'{d["km"]:.0f} km')
        for label, v in (("distance", d["dist"]), ("moons", d["moons"]),
                         ("rate", d["rate"]), ("sun", d["sun"])):
            check(f"{label} is a real value",
                  v.strip() not in ("", "—") or (label == "rate" and not d["exact"]),
                  repr(v))
            check(f"{label} has no NaN or undefined",
                  "NaN" not in v and "undefined" not in v and "Infinity" not in v, repr(v))
        check("no page errors", not errs, "; ".join(errs[:2]))

        # Derived from the shipped table rather than hard-coded, so this test
        # keeps telling the truth after the ephemeris is regenerated.
        past_table = pg.evaluate("""(m) => {
          const tbl = window.EPHEM && window.EPHEM[m];
          if (!tbl || !tbl.samples || !tbl.samples.length) return true;
          return Date.now() / 1000 > tbl.to;
        }""", "roman" if page == "roman.html" else "jwst")
        if past_table:
            check("falls back to the computed L2 point", d["exact"] is False)
            check("and says so rather than still crediting JPL",
                  "Horizons" not in d["where"], d["where"])
            check("a rate it cannot know is left blank, not guessed",
                  d["rate"].strip() == "—", repr(d["rate"]))
        else:
            check("still using the shipped JPL table", d["exact"] is True)
            check("credits JPL", "Horizons" in d["where"], d["where"])

        if page == "roman.html":
            expect_journey = when[:10] != "2027-02-01"
            check("journey section shown only while there is a journey",
                  bool(d["journeyShown"]) == expect_journey,
                  f'shown={d["journeyShown"]}, expected {expect_journey}')
            if d["journeyShown"]:
                pct = float(d["bar"].rstrip("%"))
                check("progress between 0 and 100", 0 <= pct <= 100, d["bar"])
                if when[:10] == "2026-09-25":
                    check("described as cruising", "ruis" in d["phase"], d["phase"])
                if when[:10] in ("2026-10-05", "2026-12-01"):
                    check("described as commissioning",
                          "ommission" in d["phase"] or "issioning" in d["phase"], d["phase"])
                    check("no negative days left", "-" not in (d["note"] or ""), d["note"])
        ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — the pages age honestly"))
sys.exit(1 if fail else 0)
