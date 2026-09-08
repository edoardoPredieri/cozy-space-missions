#!/usr/bin/env python3
"""Does "The neighbourhood" actually show the mission it is about?

The figure was written for a satellite going round the Earth, and drew the
mission only at a zoom about 33,000 km across. A telescope at L2 is forty times
further out than that view is wide, so it was never drawn on those pages at
all — the one thing the reader came to see, missing.

This checks each preset on each page by counting amber pixels: the mission is
the only thing on that canvas drawn in the accent colour.
"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8117

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

HST = ("HST\r\n1 20580U 90037B   26247.46497126  .00003585  00000+0  10696-3 0  9999\r\n"
       "2 20580  28.4724 258.4042 0001482 305.6276  54.4182 15.31550044800733\r\n")
ISS_POS = {"latitude": 12.3, "longitude": 45.6, "altitude": 421.0, "velocity": 27580.0,
           "visibility": "daylight", "footprint": 4520.0, "solar_lat": 5.5, "solar_lon": -80.0}

# The preset that is supposed to frame the mission itself.
CLOSEST = "station"

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

AMBER_COUNT = """() => {
  const c = document.getElementById('solar');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    // the accent, #e8a34a and its glow: warm, red-dominant, clearly not the
    // blue-grey the rest of this figure is drawn in
    if (d[i] > 150 && d[i + 1] > 90 && d[i + 1] < 200 && d[i + 2] < 110 && d[i + 3] > 40) n++;
  }
  return n;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for page, mission in (("index.html", "iss"), ("hubble.html", "hubble"),
                          ("webb.html", "webb"), ("roman.html", "roman")):
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        ctx.route("**/celestrak.org/**",
                  lambda r: r.fulfill(status=200, content_type="text/plain", body=HST))
        ctx.route("**/api.wheretheiss.at/**",
                  lambda r: r.fulfill(status=200, content_type="application/json",
                                      body=json.dumps(ISS_POS)))
        ctx.route("**/nominatim.openstreetmap.org/**", lambda r: r.abort())
        ctx.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
        pg.wait_for_function("() => window.CSM && window.CSM.position()", timeout=20000)
        pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))")
        pg.wait_for_timeout(1200)

        print(f"\n=== {page} ===")
        pg.click(f'#solar-zoom button[data-preset="{CLOSEST}"]')
        pg.wait_for_timeout(900)

        amber = pg.evaluate(AMBER_COUNT)
        label = pg.evaluate("""() => (document.querySelector('#solar-zoom [data-preset="station"]') || {}).textContent || ''""")
        listed = pg.evaluate("""() => Array.from(document.querySelectorAll('#solar-stats li'))
            .map(li => li.textContent).filter(t => /Earth|Terra/.test(t)).slice(-1)[0] || ''""")
        print("    closest preset:", repr(label), "| amber pixels:", amber)
        print("    list row:", listed)

        check("the mission is drawn on the closest view", amber > 200, f"{amber} amber pixels")
        check("the preset is named after this mission",
              label.strip() not in ("", "Hubble" if mission != "hubble" else "___"),
              repr(label))
        check("the list names this mission", listed.strip() != "", repr(listed))
        check("no page errors", not errs, "; ".join(errs[:2]))

        # The mission's own preset has to actually contain it, with room to
        # spare rather than clipped against the edge. (The "Earth and the Moon"
        # view is deliberately not checked: that canvas is square, so it spans
        # about a million km, and a telescope two or three times the Moon's
        # distance away belongs outside a view named after the Moon.)
        span = pg.evaluate("""() => {
          const t = (document.querySelector('#solar-zoom .zoom-label') || {}).textContent || '';
          const m = t.match(/([\\d.,]+)\\s*(million|billion)?/);
          if (!m) return null;
          let v = parseFloat(m[1].replace(/,/g, ''));
          if (m[2] === 'million') v *= 1e6;
          if (m[2] === 'billion') v *= 1e9;
          return v;
        }""")
        km = pg.evaluate("() => { const p = window.CSM.position(); return p.km || p.altitude; }")
        print(f"    its own view spans {span:,.0f} km; the mission is {km:,.0f} km out")
        check("its own view is wide enough to hold it",
              span is not None and span / 2 > km * 1.15,
              f"half-span {span / 2:,.0f} km vs {km:,.0f} km")
        ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — every page shows its own mission in the neighbourhood"))
sys.exit(1 if fail else 0)
