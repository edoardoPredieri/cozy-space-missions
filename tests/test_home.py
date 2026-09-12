#!/usr/bin/env python3
"""The front page: the way back to it, and whether its solar view is true.

Two things are checked here that nothing else covers.

The way back. Every page carries a Home link, and only the front page marks
itself as the current one. A site whose pages have no way home is a site people
leave.

The figure. It is the only view of that card — the ground map it used to share
the card with is gone — and it draws five objects around a magnified Earth at
their real directions, which is a claim that can be checked rather than
admired: the two
telescopes at L2 must sit opposite the Sun, because that is what L2 means, and
at new Moon the Moon must sit nearly in the Sun's direction, because that is
what new Moon means. If the coordinate conversion that puts a space station and
a telescope a million kilometres away in the same frame were wrong, those two
facts would be the first to break.
"""
import os, sys, json, math, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8120

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

ISS_TLE = ("ISS (ZARYA)\r\n"
           "1 25544U 98067A   26254.54791667  .00016717  00000+0  10270-3 0  9005\r\n"
           "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537\r\n")
HST_TLE = ("HST\r\n"
           "1 20580U 90037B   26254.46497126  .00003585  00000+0  10696-3 0  9992\r\n"
           "2 20580  28.4724 258.4042 0001482 305.6276  54.4182 15.31550044800733\r\n")

PAGES = ["index.html", "iss.html", "hubble.html", "webb.html", "roman.html"]

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

def route_tle(route, _req=None):
    route.fulfill(status=200, content_type="text/plain",
                  body=ISS_TLE if "25544" in route.request.url else HST_TLE)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    # ---------------------------------------------------- the way home
    print("\nThe way back to the front page")
    for page in PAGES:
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        for host in ("**/celestrak.org/**", "**/tle.ivanstanojevic.me/**",
                     "**/api.wheretheiss.at/**", "**/api.spaceflightnewsapi.net/**",
                     "**/nominatim.openstreetmap.org/**"):
            ctx.route(host, lambda r: r.abort())
        pg = ctx.new_page()
        pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
        pg.wait_for_timeout(900)
        nav = pg.evaluate("""() => Array.from(document.querySelectorAll('.missions a')).map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
          current: a.getAttribute('aria-current') === 'page'
        }))""")
        home = [a for a in nav if a["href"] == "./"]
        print("    %-12s %s" % (page, " | ".join(a["text"] + ("*" if a["current"] else "") for a in nav)))
        check(page + ": has a link home", len(home) == 1, str(nav))
        check(page + ": exactly one entry is the current page",
              sum(1 for a in nav if a["current"]) == 1, str(nav))
        check(page + ": home is current only on the front page",
              home[0]["current"] == (page == "index.html") if home else False)
        ctx.close()

    # ------------------------------------------------- the solar view
    print("\nThe solar view, at two very different moments")
    # 12 September 2026 is a day after new Moon; 26 September is full.
    for when, moon_near_sun in (("2026-09-12T02:00:00Z", True),
                                ("2026-09-26T17:00:00Z", False)):
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        ctx.clock.install(time=when)
        ctx.route("**/celestrak.org/**", route_tle)
        for host in ("**/tle.ivanstanojevic.me/**", "**/nominatim.openstreetmap.org/**"):
            ctx.route(host, lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/index.html", wait_until="load")
        pg.wait_for_timeout(3200)

        # the same numbers the figure is drawn from, read back out of the page
        geom = pg.evaluate("""() => {
          const A = window.ASTRO, now = new Date();
          const out = { sun: A.sunLongitude(now), moon: A.moon(now).lon, sats: {} };
          /* Only the far two are read here: they are the ones whose direction
             the L2 claim can be checked against. */
          (window.CSM_FLEET || []).forEach(sat => {
            if (sat.kind === 'deep') {
              const t = window.EPHEM[sat.ephem], s = t.samples, u = now.getTime() / 1000;
              if (u < s[0][0] || u > s[s.length - 1][0]) return;
              let i = 0;
              while (i < s.length - 2 && s[i + 1][0] < u) i++;
              const f = (u - s[i][0]) / (s[i + 1][0] - s[i][0]);
              const d = ((s[i + 1][2] - s[i][2] + 540) % 360) - 180;
              out.sats[sat.id] = { lon: s[i][2] + f * d, km: s[i][1] + f * (s[i + 1][1] - s[i][1]) };
            }
          });
          return out;
        }""")

        painted = pg.evaluate("""() => {
          const c = document.getElementById('world');
          const g = c.getContext('2d');
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
          return n;
        }""")

        def gap(a, b):
            return abs((a - b + 180) % 360 - 180)

        print("\n=== %s ===" % when[:10])
        print("    Sun at %.1f°, Moon at %.1f° (%.0f° apart)"
              % (geom["sun"], geom["moon"], gap(geom["moon"], geom["sun"])))
        for sid, s in geom["sats"].items():
            print("    %-6s at %.1f° — %.0f° from the Sun, %.0f thousand km out"
                  % (sid, s["lon"], gap(s["lon"], geom["sun"]), s["km"] / 1000))

        check("the figure is drawn", painted > 50000, "%d lit pixels" % painted)
        check("no page errors", not errs, "; ".join(errs[:2]))

        for sid, s in geom["sats"].items():
            check("%s sits opposite the Sun, as L2 requires" % sid,
                  gap(s["lon"], geom["sun"]) > 150,
                  "%.0f° from the Sun" % gap(s["lon"], geom["sun"]))

        d = gap(geom["moon"], geom["sun"])
        if moon_near_sun:
            check("a day after new Moon, the Moon is near the Sun's direction",
                  d < 25, "%.0f° away" % d)
        else:
            check("at full Moon, the Moon is opposite the Sun",
                  d > 155, "%.0f° from opposite" % d)

        # every name the figure promises
        names = pg.evaluate("""() => {
          const t = k => window.CSM.t(k);
          return ['iss.sat.short','hubble.sat.short','webb.sat.short','roman.sat.short',
                  'planet.moon','planet.sun','planet.earth'].map(t);
        }""")
        check("every object has a name to draw", all(n and '.' not in n for n in names), str(names))
        ctx.close()

    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — there is a way home, and the solar view is honest"))
sys.exit(1 if fail else 0)
