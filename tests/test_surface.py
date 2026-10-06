#!/usr/bin/env python3
"""The two discs have surfaces now. Are they the right surfaces, in the right place?

A sphere with markings painted on it is easy to get subtly wrong and still have
it look fine: mirror the longitude and the Moon's seas sit on the far side,
which nobody would notice from the picture alone. So this does not look at the
picture. It works out, independently of the page, where a handful of known
places should land on each disc, then reads the pixel there.

On the Earth: the Moon is overhead of exactly one point at any moment, and that
point is the middle of the face the Moon can see. Land is painted green over
blue ocean, so a continent and an ocean are told apart by green minus blue,
which is strongly positive on one and strongly negative on the other.

On the Moon: the seas are darker than the highlands, which is the whole reason
anyone can see them. Mare Tranquillitatis must be darker than the highlands
south of it, and at full Moon both are lit, so both can be read at once.
"""
import os, sys, math, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8121

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

# Four moments around the new Moon of 10 October 2026, eight hours apart, so the
# Earth has turned a different face toward the Moon each time and no single
# lucky alignment carries the test. New Moon is when the Earth is close to
# fully lit as the Moon sees it, which is the only time most of the disc can be
# read: at full Moon the Earth is new, and there is nothing to sample.
WHEN = ["2026-10-10T03:00:00Z", "2026-10-10T11:00:00Z",
        "2026-10-10T19:00:00Z", "2026-10-12T09:00:00Z"]

# Well inland and well offshore, so a coastline simplified to about a degree
# cannot put the wrong thing under the sample.
LAND = [("the Sahara", 21, 12), ("central Asia", 46, 88), ("the Amazon", -6, -61),
        ("central Australia", -24, 133), ("central Africa", 2, 22)]
SEA = [("the mid Pacific", 0, -150), ("the south Pacific", -30, -125),
       ("the mid Atlantic", 2, -28), ("the Indian Ocean", -25, 78)]

# Selenographic, east positive: a sea, and highlands with no sea anywhere near.
MOON_DARK = [("Mare Tranquillitatis", 10, 28), ("Mare Serenitatis", 28, 17),
             ("Mare Imbrium", 34, -17)]
MOON_BRIGHT = [("the southern highlands", -28, 14), ("the eastern highlands", -5, 75),
               ("the Descartes highlands", -12, 16)]

D = math.pi / 180

def ortho(lat, lon, lat0, lon0):
    """Where a point lands on a disc centred on (lat0, lon0), in disc radii.
       z < 0 is round the back."""
    dl = (lon - lon0) * D
    la, la0 = lat * D, lat0 * D
    x = math.cos(la) * math.sin(dl)
    y = math.cos(la0) * math.sin(la) - math.sin(la0) * math.cos(la) * math.cos(dl)
    z = math.sin(la0) * math.sin(la) + math.cos(la0) * math.cos(la) * math.cos(dl)
    return x, y, z

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

READ = """([id, x, y]) => {
  const cv = document.getElementById(id);
  const g = cv.getContext('2d');
  const dpr = cv.width / cv.getBoundingClientRect().width;
  const px = Math.round(x * dpr), py = Math.round(y * dpr);
  if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return null;
  const d = g.getImageData(px, py, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
}"""

GEOM = """(id) => {
  const cv = document.getElementById(id);
  const r = cv.getBoundingClientRect();
  return { size: Math.round(r.width), R: Math.round(r.width) / 2 - 4 };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    for when in WHEN:
        ctx = b.new_context(viewport={"width": 1280, "height": 1100}, device_scale_factor=2)
        ctx.clock.install(time=when)
        for host in ("**/celestrak.org/**", "**/tle.ivanstanojevic.me/**",
                     "**/nominatim.openstreetmap.org/**"):
            ctx.route(host, lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/index.html", wait_until="load")
        pg.wait_for_timeout(1800)

        # The page's own idea of where the Moon is, and of how much of the Earth
        # it can see lit. Both are read back rather than recomputed here: what
        # is being tested is the drawing, not the astronomy, which test_phase
        # and test_home already cover.
        state = pg.evaluate("""() => {
          const A = window.ASTRO, now = new Date();
          const m = A.moon(now);
          const eq = A.eclipticToEquatorial(m.lon, m.lat, now);
          const sub = A.subPoint(eq.ra, eq.dec, now);
          const ph = A.moonPhase(now);
          return { lat: sub.lat, lon: sub.lon, earthLit: ph.earthIlluminated,
                   moonLit: ph.illuminated, litOnRight: ph.waxing };
        }""")
        geom = pg.evaluate(GEOM, "earth-disc")
        cx = cy = geom["size"] / 2
        R = geom["R"]

        print("\n=== %s ===" % when[:16].replace("T", " "))
        print("    the Moon stands over %.1f° %s, %.1f° %s; it sees the Earth %.0f%% lit"
              % (abs(state["lat"]), "N" if state["lat"] >= 0 else "S",
                 abs(state["lon"]), "E" if state["lon"] >= 0 else "W",
                 state["earthLit"] * 100))

        def lit_side(x):
            """Is this x, in disc radii, on the lit half? Only the clearly lit
               part is sampled: right at the terminator the answer is a matter
               of one pixel either way."""
            edge = 1 - 2 * state["earthLit"]
            return (x > edge + 0.18) if state["litOnRight"] else (x < -edge - 0.18)

        def sample(disc, x, y):
            return pg.evaluate(READ, [disc, cx + R * x, cy - R * y])

        seen = 0
        for name, lat, lon in LAND:
            x, y, z = ortho(lat, lon, state["lat"], state["lon"])
            if z < 0.4 or not lit_side(x):
                continue
            seen += 1
            px = sample("earth-disc", x, y)
            gb = px["g"] - px["b"]
            check("%s is drawn as land" % name, gb > 10,
                  "green − blue = %+d (rgb %d,%d,%d)" % (gb, px["r"], px["g"], px["b"]))

        for name, lat, lon in SEA:
            x, y, z = ortho(lat, lon, state["lat"], state["lon"])
            if z < 0.4 or not lit_side(x):
                continue
            seen += 1
            px = sample("earth-disc", x, y)
            gb = px["g"] - px["b"]
            check("%s is drawn as water" % name, gb < -15,
                  "green − blue = %+d (rgb %d,%d,%d)" % (gb, px["r"], px["g"], px["b"]))

        check("some of the Earth was facing the Moon and lit", seen >= 2,
              "%d of %d sample points were both visible and lit" % (seen, len(LAND) + len(SEA)))
        check("no page errors", not errs, "; ".join(errs[:2]))
        ctx.close()

    # ---------------------------------------------------- the Moon, at full
    print("\nThe Moon at full, when the whole near side is lit")
    ctx = b.new_context(viewport={"width": 1280, "height": 1100}, device_scale_factor=2)
    ctx.clock.install(time="2026-10-26T06:00:00Z")
    for host in ("**/celestrak.org/**", "**/tle.ivanstanojevic.me/**",
                 "**/nominatim.openstreetmap.org/**"):
        ctx.route(host, lambda r: r.abort())
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{PORT}/index.html", wait_until="load")
    pg.wait_for_timeout(1800)
    lit = pg.evaluate("() => window.ASTRO.moonPhase(new Date()).illuminated")
    geom = pg.evaluate(GEOM, "moon-disc")
    cx = cy = geom["size"] / 2
    R = geom["R"]
    check("the test moment really is a full Moon", lit > 0.97, "%.0f%% lit" % (lit * 100))

    def lum(px):
        return 0.2126 * px["r"] + 0.7152 * px["g"] + 0.0722 * px["b"]

    def moon_at(lat, lon):
        x, y, z = ortho(lat, lon, 0, 0)
        return pg.evaluate(READ, ["moon-disc", cx + R * x, cy - R * y])

    darks = [(n, lum(moon_at(la, lo))) for n, la, lo in MOON_DARK]
    brights = [(n, lum(moon_at(la, lo))) for n, la, lo in MOON_BRIGHT]
    for n, v in darks + brights:
        print("    %-28s brightness %.0f" % (n, v))

    worst_dark = max(v for _, v in darks)
    best_bright = min(v for _, v in brights)
    check("every sea is darker than every highland", worst_dark < best_bright - 8,
          "darkest highland %.0f vs brightest sea %.0f" % (best_bright, worst_dark))

    # The seas are on the near side at the places they actually are, which is
    # what a mirrored longitude would break: Crisium is east, Imbrium is west.
    crisium = lum(moon_at(17, 59))
    mirrored = lum(moon_at(17, -59))
    check("Mare Crisium is on the east side, not the west",
          crisium < mirrored - 8, "east %.0f vs west %.0f" % (crisium, mirrored))
    ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — the surfaces are the right way round"))
sys.exit(1 if fail else 0)
