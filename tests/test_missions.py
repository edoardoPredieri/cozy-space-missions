#!/usr/bin/env python3
"""Four pages, one engine: does each one say only its own name?

The shared strings are the risk. A key that is not overridden per mission falls
back to the shared one, and the shared one was written for the Space Station —
so a Webb page can quietly announce the ISS. This walks every page in both
languages and reads what a visitor would actually see.
"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8115

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

# What must never appear on a page that is not about that mission. Each entry is
# (mission id, the words that would give it away in either language).
NAMES = {
    "iss":    ["ISS", "Space Station", "Stazione Spaziale"],
    "hubble": ["Hubble"],
    "webb":   ["Webb"],
    "roman":  ["Roman"],
}

# Places where naming another mission is correct rather than a leak.
#
# The distinction that matters is not where the text sits but where it comes
# from. A leak is a SHARED string — one written for the Station and reused
# unchanged — surfacing on a page it does not describe. Copy written per
# mission may name whoever it likes: that Roman carries a mirror the same size
# as Hubble's is the comparison NASA itself leads with, and dropping it to
# satisfy a regular expression would make the page worse.
#
# So the exempt places are the ones that are either per-mission copy (the hero
# lede, the figure captions) or deliberately about all four (the navigation,
# the ladder, the neighbourhood, the roadmap, the credits).
ALLOWED_IN = (".missions, #ladder-zoom, #solar-zoom, .solar-stats, .roadmap, "
              ".fig-cap, .site-foot, .lede, .sec-sub")

fail = []
def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for page, mission in (("index.html", "iss"), ("hubble.html", "hubble"),
                          ("webb.html", "webb"), ("roman.html", "roman")):
        for lang in ("en", "it"):
            ctx = b.new_context(viewport={"width": 1280, "height": 1000})
            ctx.route("**/celestrak.org/**",
                      lambda r: r.fulfill(status=200, content_type="text/plain", body=HST))
            ctx.route("**/api.wheretheiss.at/**",
                      lambda r: r.fulfill(status=200, content_type="application/json",
                                          body=json.dumps(ISS_POS)))
            ctx.route("**/nominatim.openstreetmap.org/**", lambda r: r.abort())
            ctx.route("**/api.spaceflightnewsapi.net/**",
                      lambda r: r.fulfill(status=200, content_type="application/json",
                                          body=json.dumps({"results": []})))
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
            pg.wait_for_function("() => window.CSM && window.CSM.position()", timeout=20000)
            if lang == "it":
                pg.click('.lang button[data-lang="it"]')
            pg.wait_for_timeout(800)
            pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))")
            pg.wait_for_timeout(400)

            seen = pg.evaluate("""(allowed) => {
              const skip = Array.from(document.querySelectorAll(allowed));
              const inSkip = el => skip.some(s => s.contains(el));
              const out = [];
              const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = walk.nextNode())) {
                const el = n.parentElement;
                if (!el || el.closest('script, style')) continue;
                if (inSkip(el)) continue;
                const s = n.textContent.trim();
                if (s) out.push(s);
              }
              // Names read aloud to a screen reader count too.
              document.querySelectorAll('[aria-label]').forEach(el => {
                if (!inSkip(el)) out.push(el.getAttribute('aria-label'));
              });
              return out.join(' | ');
            }""", ALLOWED_IN)

            others = [w for m, words in NAMES.items() if m != mission for w in words]
            hits = sorted(set(w for w in others if w in seen))
            print(f"\n=== {page} [{lang}] ===")
            print("  title:", pg.title())
            check("no other mission named outside the places that place them",
                  not hits, "found " + ", ".join(hits))
            check("its own name is on the page",
                  any(w in seen for w in NAMES[mission]), "none of " + str(NAMES[mission]))
            check("no page errors", not errs, "; ".join(errs[:2]))
            ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(fail) if fail else "PASS — every page speaks only for itself"))
sys.exit(1 if fail else 0)
