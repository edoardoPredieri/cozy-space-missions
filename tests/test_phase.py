#!/usr/bin/env python3
"""Does the drawn Moon show the fraction the page says it does?

A phase drawing has one number in it and one easy way to get that number
exactly backwards: the signed half-width of the terminator. Flip it and the
picture is the precise complement of the truth — a gibbous Moon drawn as a
crescent — which looks entirely plausible and is entirely wrong. It was wrong
here, and the page said 58% beside a disc that was 42% lit.

So this counts the lit pixels of the disc the browser actually painted and
compares them with the fraction the page claims, at phases walked through a
whole lunation. Both discs, because the Earth's is the complement and swapping
the two is the same mistake wearing a hat.
"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8119

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

# Across one lunation from the new Moon of 11 September 2026, so every shape
# gets drawn: thin crescent, quarter, gibbous, full, and back.
DAYS = ["2026-09-12T12:00:00Z", "2026-09-15T12:00:00Z", "2026-09-18T21:00:00Z",
        "2026-09-22T12:00:00Z", "2026-09-26T17:00:00Z", "2026-09-30T12:00:00Z",
        "2026-10-03T13:00:00Z", "2026-10-07T12:00:00Z"]

# Counts the disc's lit area as a fraction of the whole disc. "Lit" is simply
# "much brighter than the unlit side", which both palettes satisfy by a mile.
MEASURE = """(id) => {
  const cv = document.getElementById(id);
  const g = cv.getContext('2d');
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 4 * (W / cv.getBoundingClientRect().width);
  let inside = 0, lit = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > (R * 0.93) * (R * 0.93)) continue;   // stay off the rim
      const i = (y * W + x) * 4;
      inside++;
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (lum > 90) lit++;
    }
  }
  return inside ? lit / inside : null;
}"""

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for when in DAYS:
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        ctx.clock.install(time=when)
        for host in ("**/celestrak.org/**", "**/tle.ivanstanojevic.me/**",
                     "**/nominatim.openstreetmap.org/**"):
            ctx.route(host, lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/index.html", wait_until="load")
        pg.wait_for_timeout(1600)

        said = pg.evaluate("""() => {
          const n = s => parseFloat((document.getElementById(s).textContent || '').replace('%', ''));
          return {
            moon: n('moon-lit') / 100,
            earth: n('earth-lit') / 100,
            name: document.getElementById('moon-name').textContent,
            sun: document.getElementById('phase-pair').getAttribute('data-sun')
          };
        }""")
        drawnMoon = pg.evaluate(MEASURE, "moon-disc")
        drawnEarth = pg.evaluate(MEASURE, "earth-disc")

        print("\n=== %s — %s ===" % (when[:10], said["name"]))
        print("    says Moon %.0f%% / Earth %.0f%%; draws %.0f%% / %.0f%%; Sun to the %s"
              % (said["moon"] * 100, said["earth"] * 100,
                 drawnMoon * 100, drawnEarth * 100, said["sun"]))

        # A disc drawn as its own complement is the bug this exists for, and it
        # shows up as an error of |1-2k| — huge everywhere except at half.
        check("the Moon disc is drawn at the fraction claimed",
              abs(drawnMoon - said["moon"]) < 0.06,
              "claims %.2f, draws %.2f" % (said["moon"], drawnMoon))
        check("the Earth disc is drawn at the fraction claimed",
              abs(drawnEarth - said["earth"]) < 0.06,
              "claims %.2f, draws %.2f" % (said["earth"], drawnEarth))
        check("the two fractions add up to one",
              abs(said["moon"] + said["earth"] - 1) < 0.02,
              "%.2f + %.2f" % (said["moon"], said["earth"]))
        check("the two discs are not each other",
              abs(drawnMoon - drawnEarth) > 0.05 or abs(said["moon"] - 0.5) < 0.05,
              "both drawn at %.2f" % drawnMoon)
        check("no page errors", not errs, "; ".join(errs[:2]))
        ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — the discs show what the page claims"))
sys.exit(1 if fail else 0)
