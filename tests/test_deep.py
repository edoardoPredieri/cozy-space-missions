#!/usr/bin/env python3
"""End-to-end for the two L2 pages: do they say true things, in both languages?"""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the repo root
PORT = 8113

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

AU = 149597870.7

# The page is asked what it thinks at one pinned instant, and the answer is
# compared with what JPL says for that same instant. Both of these were fetched
# from Horizons separately and are deliberately NOT on the shipped table's own
# sampling grid — Webb's table steps every ten days, so 8 September is a point
# it has to interpolate.
FROZEN = "2026-09-08T00:00:00Z"
TRUTH = {"webb": 0.00824516378106 * AU, "roman": 0.00539796342326 * AU}

fail = []
def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + (("  — " + detail) if detail else ""))
    if not cond: fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for page, mission in (("webb.html", "webb"), ("roman.html", "roman")):
        ctx = b.new_context(viewport={"width": 1280, "height": 1000})
        ctx.clock.install(time=FROZEN)
        ctx.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
        pg = ctx.new_page()
        errs, viol = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.add_init_script("""
          window.__csp=[];
          document.addEventListener('securitypolicyviolation',
            e => window.__csp.push(e.violatedDirective + ' -> ' + e.blockedURI));
        """)
        # Pin the clock so the assertions are about today's real geometry.
        pg.goto(f"http://localhost:{PORT}/{page}", wait_until="load")
        pg.wait_for_function("() => window.CSM && window.CSM.position()", timeout=15000)
        pg.wait_for_timeout(1200)

        d = pg.evaluate("""() => {
          const p = window.CSM.position();
          const painted = (function(){
            const c = document.getElementById('deep');
            const g = c.getContext('2d');
            const px = g.getImageData(0, 0, c.width, c.height).data;
            let lit = 0;
            for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
            return lit;
          })();
          return {
            mission: window.CSM.sat.id,
            km: p.km, lon: p.lon, lat: p.lat, kms: p.kms, exact: p.exact,
            title: document.title,
            h1: document.querySelector('h1').textContent.trim(),
            stats: Array.from(document.querySelectorAll('.stat-v')).map(e => e.textContent),
            statKeys: Array.from(document.querySelectorAll('.stat-k')).map(e => e.textContent),
            painted: painted,
            hasMap: !!document.getElementById('map'),
            hasObserver: !!document.getElementById('observer'),
            journeyShown: (function(){ const j = document.getElementById('journey'); return j ? !j.hidden : null; })(),
            journey: (function(){
              const j = document.getElementById('journey');
              if (!j || j.hidden) return null;
              return { phase: document.getElementById('j-phase').textContent,
                       day: document.getElementById('j-day').textContent,
                       note: document.getElementById('j-note').textContent,
                       bar: document.getElementById('j-bar').style.width,
                       aria: document.getElementById('j-meter').getAttribute('aria-valuenow') };
            })(),
            ladder: Array.from(document.querySelectorAll('#ladder-zoom [data-preset]')).map(e => e.textContent),
            csp: window.__csp,
            navCurrent: Array.from(document.querySelectorAll('.missions a')).map(a => a.textContent + (a.getAttribute('aria-current') ? '*' : '')),
            foot: document.querySelector('.site-foot p').textContent.slice(0, 80)
          };
        }""")

        print(f"\n=== {page} ===")
        print("  title:", d["title"])
        print("  h1:", d["h1"])
        print("  nav:", d["navCurrent"])
        print("  stats:", list(zip(d["statKeys"], d["stats"])))
        print("  position: %.0f km  lon %.2f  lat %.2f  exact=%s" % (d["km"], d["lon"], d["lat"], d["exact"]))
        if d["journey"]: print("  journey:", d["journey"])
        print("  ladder presets:", d["ladder"])
        print("  foot:", d["foot"])

        check("right mission", d["mission"] == mission, d["mission"])
        check("no CSP violation", not d["csp"], str(d["csp"]))
        check("no page errors", not errs, "; ".join(errs[:3]))
        check("no world map on this page", not d["hasMap"])
        check("no observer section", not d["hasObserver"])
        check("figure actually drawn", d["painted"] > 5000, f'{d["painted"]} lit pixels')
        check("position from the JPL table", d["exact"] is True)
        check("distance agrees with JPL to 0.5% at the pinned instant",
              abs(d["km"] - TRUTH[mission]) / TRUTH[mission] < 0.005,
              "page %.0f km vs JPL %.0f km (%.2f%%)" % (d["km"], TRUTH[mission],
                                                        100 * abs(d["km"] - TRUTH[mission]) / TRUTH[mission]))
        check("no mission name leaks from the other pages",
              "ISS" not in " ".join(d["stats"] + [d["h1"], d["title"]]) and
              "Hubble" not in d["h1"] + d["title"],
              d["h1"])
        check("this page is the current one in the nav",
              sum(1 for a in d["navCurrent"] if a.endswith("*")) == 1, str(d["navCurrent"]))
        check("footer credits the ephemeris, not a feed it never calls",
              "Horizons" in d["foot"], d["foot"])
        check("stats are filled in", all(v.strip() not in ("", "—") for v in d["stats"]), str(d["stats"]))

        if mission == "roman":
            check("journey section is showing while it is still cruising", d["journeyShown"] is True)
            check("journey has a real percentage",
                  d["journey"] and d["journey"]["bar"] not in ("", "0.0%"), str(d["journey"]))
            check("progress is announced to a screen reader",
                  d["journey"] and d["journey"]["aria"] not in (None, "0"), str(d["journey"]))
        else:
            check("no journey section on a telescope that arrived in 2022", d["journeyShown"] is None)

        # Italian
        pg.click('button[data-lang="it"]')
        pg.wait_for_timeout(700)
        it = pg.evaluate("""() => ({
          title: document.title,
          h1: document.querySelector('h1').textContent.trim(),
          statKeys: Array.from(document.querySelectorAll('.stat-k')).map(e => e.textContent),
          stats: Array.from(document.querySelectorAll('.stat-v')).map(e => e.textContent),
          journeyNote: (function(){ const n = document.getElementById('j-note'); return n ? n.textContent.slice(0,70) : null; })(),
          lang: document.documentElement.lang
        })""")
        print("  IT:", it["title"])
        print("  IT stats:", list(zip(it["statKeys"], it["stats"])))
        if it["journeyNote"]: print("  IT journey:", it["journeyNote"])
        check("Italian switches the page", it["lang"] == "it" and it["h1"] != d["h1"], it["h1"])
        check("Italian leaves no English labels behind",
              not any(k in ("Distance from Earth", "Changing by", "Position from") for k in it["statKeys"]),
              str(it["statKeys"]))

        ctx.close()
    b.close()

print("\n" + ("FAILED: " + ", ".join(fail) if fail else "PASS"))
sys.exit(1 if fail else 0)
