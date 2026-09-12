#!/usr/bin/env python3
"""Nothing on the distance ladder may vanish just because its name did not fit.

The label placer culls names that would overlap, which is right. But it used to
`return` before drawing the dot as well, so on a narrow figure whole planets
left the axis — and what remained read as Venus, then the Sun, then Jupiter,
which looks like the order is broken. It is not: the axis is distance from the
Earth *today*, and today Venus is on our side of the Sun while Mercury is on
the far side of it.

So this checks the thing that matters: for every object the ladder knows about,
there is a mark on the axis where it belongs. Labels may come and go with the
width; dots may not.
"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8118

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

ISS_POS = {"latitude": 12.3, "longitude": 45.6, "altitude": 421.0, "velocity": 27580.0,
           "visibility": "daylight", "footprint": 4520.0, "solar_lat": 5.5, "solar_lon": -80.0}

# Where each thing should be, worked out in the page from the same astronomy the
# figure uses, then looked for in the pixels.
PROBE = """() => {
  const A = window.ASTRO, AU = A.AU, now = new Date();
  const p = A.planets(now);
  const want = [
    ['the Sun', Math.hypot(p.earth.x, p.earth.y, p.earth.z) * AU],
    ['the Moon', A.moon(now).distance]
  ];
  ['mercury','venus','mars','jupiter','saturn','uranus','neptune'].forEach(k => {
    want.push([k, A.distanceAU(p.earth, p[k]) * AU]);
  });

  // the same mapping the figure uses for the default "everything" view
  const cv = document.getElementById('ladder');
  const rect = cv.getBoundingClientRect();
  const W = Math.round(rect.width);
  const dpr = cv.width / W;
  const lo = Math.log10(8), hi = Math.log10(6e9);
  const xOf = km => 54 + (Math.log10(km) - lo) / (hi - lo) * (W - 54 - 26);

  const g = cv.getContext('2d');
  const img = g.getImageData(0, 0, cv.width, cv.height).data;
  const H = cv.height;

  // find the axis: the row with the most non-background pixels
  let axis = 0, best = -1;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < cv.width; x += 4) {
      const i = (y * cv.width + x) * 4;
      if (img[i + 3] > 30 && (img[i] > 90 || img[i + 1] > 90)) n++;
    }
    if (n > best) { best = n; axis = y; }
  }

  // is there a mark brighter than the axis line itself, near this x?
  function markAt(xCss) {
    const cx = Math.round(xCss * dpr);
    for (let dx = -Math.ceil(3 * dpr); dx <= Math.ceil(3 * dpr); dx++) {
      for (let dy = -Math.ceil(3 * dpr); dy <= Math.ceil(3 * dpr); dy++) {
        const x = cx + dx, y = axis + dy;
        if (x < 0 || x >= cv.width || y < 0 || y >= H) continue;
        const i = (y * cv.width + x) * 4;
        if (img[i + 3] > 120 && (img[i] > 120 || img[i + 1] > 120 || img[i + 2] > 120)) return true;
      }
    }
    return false;
  }

  return want.map(([name, km]) => {
    const x = xOf(km);
    const inView = x > 30 && x < W - 6;
    return { name, km, x: Math.round(x), inView, drawn: inView ? markAt(x) : null };
  });
}"""

fail = []
def check(name, cond, detail=""):
    print(("    ok   " if cond else "    FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for width in (1440, 900, 420):
        for page in ("iss.html", "webb.html"):
            ctx = b.new_context(viewport={"width": width, "height": 1000})
            ctx.route("**/api.wheretheiss.at/**",
                      lambda r: r.fulfill(status=200, content_type="application/json",
                                          body=json.dumps(ISS_POS)))
            for host in ("**/api.spaceflightnewsapi.net/**", "**/nominatim.openstreetmap.org/**"):
                ctx.route(host, lambda r: r.abort())
            pg = ctx.new_page()
            pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
            pg.wait_for_function("() => window.CSM && window.CSM.position()", timeout=20000)
            pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))")
            pg.wait_for_timeout(1200)

            rows = pg.evaluate(PROBE)
            missing = [r["name"] for r in rows if r["inView"] and not r["drawn"]]
            shown = [r["name"] for r in rows if r["inView"]]
            print(f"\n=== {page} at {width}px ===")
            print("    on the axis:", ", ".join(shown))
            check("every object in range has a mark on the axis",
                  not missing, "missing " + ", ".join(missing))

            # The ordering itself, which is what looked wrong: by distance today.
            order = [r["name"] for r in sorted(rows, key=lambda r: r["km"])]
            sun_at = order.index("the Sun")
            check("the Sun sits between Venus and Mercury, as it does today",
                  order[sun_at - 1] == "venus" and order[sun_at + 1] == "mercury",
                  " → ".join(order))
            ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(sorted(set(fail))) if fail else
              "PASS — nothing vanishes from the ladder"))
sys.exit(1 if fail else 0)
