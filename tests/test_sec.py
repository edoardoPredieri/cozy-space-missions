#!/usr/bin/env python3
"""Security regressions: hostile TLE, hostile geocoder, coordinate precision."""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the repo root
PORT = 8112

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

GOOD1 = "1 20580U 90037B   26247.51782528  .00003431  00000+0  17127-3 0  9995"
GOOD2 = "2 20580  28.4696 288.8102 0002481 267.4657  92.5919 15.11539688703004"
# Same shape, different object: NORAD 25544 (the Station) served where Hubble was asked for.
EVIL1 = "1 25544U 98067A   26247.51782528  .00016717  00000+0  10270-3 0  9007"
EVIL2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537"

fail = []

def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + (("  — " + detail) if detail and not cond else ""))
    if not cond:
        fail.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    # ---------------------------------------------------------------- TLE
    print("\nTLE handling (hubble.html)")
    # The catalogue number is five characters of the same string the server sent,
    # so a hostile feed can simply relabel someone else's orbit with Hubble's id.
    # What it cannot fake is the inclination, which is what gets drawn.
    RELABEL1 = "1 20580U 98067A   26247.51782528  .00016717  00000+0  10270-3 0  9007"
    RELABEL2 = "2 20580  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537"

    cases = [
        ("valid elements accepted",            f"{GOOD1}\n{GOOD2}", True),
        ("wrong satellite rejected",           f"{EVIL1}\n{EVIL2}", False),
        ("relabelled orbit rejected",          f"{RELABEL1}\n{RELABEL2}", False),
        ("truncated line rejected",            f"{GOOD1[:50]}\n{GOOD2}", False),
        ("script smuggled in name rejected",   "<script>window.__pwned=1</script>\n" + GOOD1[:40], False),
        ("html body rejected",                 "<!doctype html><h1>hello</h1>", False),
        ("json shape honoured",                json.dumps({"name": "HST", "line1": GOOD1, "line2": GOOD2}), True),
        ("json with wrong norad rejected",     json.dumps({"name": "x", "line1": EVIL1, "line2": EVIL2}), False),
    ]
    for label, body, should_load in cases:
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        def serve_tle(route, _req=None, body=body):
            route.fulfill(status=200, body=body, content_type="text/plain")
        ctx.route("**/celestrak.org/**", serve_tle)
        ctx.route("**/tle.ivanstanojevic.me/**", lambda r: r.abort())
        ctx.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
        pg = ctx.new_page()
        pg.goto(f"http://localhost:{PORT}/hubble.html", wait_until="load")
        pg.wait_for_timeout(2500)
        got = pg.evaluate("""() => ({
          prop: !!(window.CSM && window.CSM.propagator && window.CSM.propagator()),
          pwned: !!window.__pwned,
          lat: (window.CSM && window.CSM.position && window.CSM.position()) ? window.CSM.position().latitude : null,
          cached: !!localStorage.getItem('csm.tle.20580')
        })""")
        loaded = got["prop"]
        check(label, loaded == should_load, f"propagator loaded={loaded}, expected {should_load}")
        check(label + " — nothing executed", not got["pwned"])
        if should_load:
            check(label + " — Hubble's own inclination",
                  got["lat"] is not None and abs(got["lat"]) <= 29,
                  f"lat={got['lat']} (Hubble never passes 28.5°)")
        else:
            check(label + " — bad elements not cached", not got["cached"])
        ctx.close()

    # ------------------------------------------------------------ geocoder
    print("\nHostile geocoder response (iss.html)")
    HOSTILE = json.dumps([
        {"display_name": "<img src=x onerror=window.__pwned=1>, " + "A" * 5000,
         "lat": "44.4949", "lon": "11.3426"},
    ] + [{"display_name": f"filler {i}", "lat": "1", "lon": "1"} for i in range(200)])

    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    def serve_geo(route, _req=None):
        route.fulfill(status=200, body=HOSTILE, content_type="application/json")
    ctx.route("**/nominatim.openstreetmap.org/**", serve_geo)
    ctx.route("**/api.wheretheiss.at/**", lambda r: r.abort())
    ctx.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{PORT}/iss.html", wait_until="load")
    pg.wait_for_timeout(1500)
    pg.fill("#place-input", "bologna")
    pg.click("#place-submit")
    pg.wait_for_timeout(1200)

    r = pg.evaluate("""() => ({
      pwned: !!window.__pwned,
      imgs: document.querySelectorAll('#place-results img').length,
      items: document.querySelectorAll('#place-results li').length,
      firstText: (document.querySelector('#place-results button') || {}).textContent || '',
      maxLen: Math.max.apply(null, Array.from(document.querySelectorAll('#place-results button')).map(b => b.textContent.length).concat([0]))
    })""")
    check("no script ran", not r["pwned"])
    check("markup not parsed — zero <img> injected", r["imgs"] == 0, f"{r['imgs']} images")
    check("markup shown as text", "<img" in r["firstText"], r["firstText"][:60])
    check("result count capped at 5", r["items"] == 5, f"{r['items']} results")
    check("label length capped", r["maxLen"] <= 300, f"{r['maxLen']} chars")

    # pick the first result, then look at what got written down
    pg.click("#place-results button")
    pg.wait_for_timeout(800)
    stored = pg.evaluate("() => JSON.parse(localStorage.getItem('csm.place') || 'null')")
    print("\nStored position:", json.dumps(stored)[:200])
    check("coordinates rounded to 3 decimals",
          stored and len(str(stored["lat"]).split(".")[-1]) <= 3 and len(str(stored["lon"]).split(".")[-1]) <= 3,
          str(stored))
    check("stored label capped", stored and len(stored["label"]) <= 120, str(len(stored["label"]) if stored else -1))

    # ------------------------------------------------- poisoned storage
    print("\nPoisoned localStorage (iss.html)")
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900})
    ctx2.route("**/api.wheretheiss.at/**", lambda r: r.abort())
    ctx2.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
    ctx2.add_init_script("""
      try {
        localStorage.setItem('csm.place', JSON.stringify({
          lat: 999, lon: 'nonsense', label: {toString: 1}, sub: '<img src=x onerror=window.__pwned=1>'
        }));
        localStorage.setItem('csm.tle.20580', JSON.stringify({l1: '<script>x</script>', l2: 'nope', saved: Date.now()}));
      } catch (e) {}
    """)
    pg2 = ctx2.new_page()
    errs = []
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    pg2.goto(f"http://localhost:{PORT}/iss.html", wait_until="load")
    pg2.wait_for_timeout(2000)
    s = pg2.evaluate("""() => ({
      pwned: !!window.__pwned,
      panelShown: !document.getElementById('obs-panel').hidden,
      bus: typeof window.CSM
    })""")
    check("page still runs", s["bus"] == "object")
    check("no script ran", not s["pwned"])
    check("impossible coordinates discarded", not s["panelShown"], "observer panel showed a place at lat 999")
    check("no uncaught errors", not errs, "; ".join(errs[:3]))
    ctx2.close()

    # --------------------------------------------- feed answering nonsense
    print("\nLive feed answering nonsense (iss.html)")
    JUNK = json.dumps({"latitude": "n/a", "longitude": None, "altitude": None,
                       "velocity": "fast", "visibility": "daylight"})
    ctx3 = b.new_context(viewport={"width": 1280, "height": 900})
    def serve_junk(route, _req=None):
        route.fulfill(status=200, body=JUNK, content_type="application/json")
    ctx3.route("**/api.wheretheiss.at/**", serve_junk)
    ctx3.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
    pg3 = ctx3.new_page()
    errs3 = []
    pg3.on("pageerror", lambda e: errs3.append(str(e)))
    pg3.goto(f"http://localhost:{PORT}/iss.html", wait_until="load")
    pg3.wait_for_timeout(9000)      # long enough for a second failure to register
    st = pg3.evaluate("""() => ({
      stats: Array.from(document.querySelectorAll('.stat-v')).map(e => e.textContent),
      status: (document.getElementById('status-text') || {}).textContent || '',
      pos: window.CSM.position()
    })""")
    print("  stats:", st["stats"], "| status:", st["status"])
    check("no NaN shown to the reader", not any("NaN" in s for s in st["stats"]), str(st["stats"]))
    check("nonsense not accepted as a position", st["pos"] is None, str(st["pos"]))
    check("no uncaught errors", not errs3, "; ".join(errs3[:3]))
    ctx3.close()

    # ------------------------------------------ far-future cache timestamp
    print("\nCache stamped in the far future (hubble.html)")
    ctx4 = b.new_context(viewport={"width": 1280, "height": 900})
    ctx4.add_init_script("""
      try {
        localStorage.setItem('csm.tle.20580', JSON.stringify({
          l1: '""" + RELABEL1 + """', l2: '""" + RELABEL2 + """', name: 'x', saved: 9e15
        }));
      } catch (e) {}
    """)
    def serve_good(route, _req=None):
        route.fulfill(status=200, body=f"{GOOD1}\n{GOOD2}", content_type="text/plain")
    ctx4.route("**/celestrak.org/**", serve_good)
    ctx4.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
    pg4 = ctx4.new_page()
    pg4.goto(f"http://localhost:{PORT}/hubble.html", wait_until="load")
    pg4.wait_for_timeout(3000)
    c = pg4.evaluate("""() => {
      var p = window.CSM.propagator();
      return { inc: p ? p.inclination : null };
    }""")
    print("  inclination drawn:", c["inc"])
    check("future-dated cache not trusted forever",
          c["inc"] is not None and abs(c["inc"] - 28.5) < 3,
          f"inclination {c['inc']} — the poisoned cache was used")
    ctx4.close()

    # ------------------------------------------------ language key poisoning
    print("\nPoisoned language key (iss.html)")
    ctx5 = b.new_context(viewport={"width": 1280, "height": 900})
    ctx5.add_init_script("try { localStorage.setItem('csm.lang', 'constructor'); } catch (e) {}")
    ctx5.route("**/api.wheretheiss.at/**", lambda r: r.abort())
    ctx5.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
    pg5 = ctx5.new_page()
    pg5.goto(f"http://localhost:{PORT}/iss.html", wait_until="load")
    pg5.wait_for_timeout(1500)
    lg = pg5.evaluate("""() => ({
      lang: window.CSM.lang(),
      stored: localStorage.getItem('csm.lang'),
      heading: document.querySelector('h1').textContent.trim().slice(0, 40)
    })""")
    print("  lang:", lg["lang"], "| stored:", lg["stored"], "|", lg["heading"])
    check("prototype key not accepted as a language", lg["lang"] in ("en", "it"), str(lg["lang"]))
    check("junk not written back to storage", lg["stored"] in (None, "en", "it"), str(lg["stored"]))
    ctx5.close()

    # ------------------------------------------- poisoned ephemeris table
    # The L2 table is source code, not network input, so this is a build
    # mistake rather than an attack — but a page on a shared origin should
    # still refuse to draw a distance it cannot stand behind.
    print("\nCorrupted L2 table (webb.html)")
    BAD = [
        ("distance out past the asteroid belt", "window.EPHEM.jwst.samples[3][1] = 5e8;"),
        ("a distance that is not a number",     "window.EPHEM.jwst.samples[3][1] = 'soon';"),
        ("time running backwards",              "window.EPHEM.jwst.samples[5][0] = 0;"),
        ("longitude off the compass",           "window.EPHEM.jwst.samples[2][2] = 999;"),
        ("the whole table replaced by junk",    "window.EPHEM.jwst = {samples: 'nope'};"),
        ("the table missing entirely",          "delete window.EPHEM.jwst;"),
    ]
    for label, sabotage in BAD:
        ctx6 = b.new_context(viewport={"width": 1280, "height": 900})
        ctx6.route("**/api.spaceflightnewsapi.net/**", lambda r: r.abort())
        # Runs after ephem.js has defined the table and before l2.js reads it.
        ctx6.add_init_script("""
          Object.defineProperty(window, 'EPHEM', {
            configurable: true,
            set: function (v) {
              delete window.EPHEM;
              window.EPHEM = v;
              try { %s } catch (e) {}
            },
            get: function () { return undefined; }
          });
        """ % sabotage)
        pg6 = ctx6.new_page()
        e6 = []
        pg6.on("pageerror", lambda e: e6.append(str(e)))
        pg6.goto(f"http://localhost:{PORT}/webb.html", wait_until="load")
        pg6.wait_for_timeout(2500)
        r6 = pg6.evaluate("""() => {
          const p = window.CSM.position();
          return {
            km: p ? p.km : null,
            exact: p ? p.exact : null,
            shown: (document.getElementById('v-dist') || {}).textContent || '',
            where: (document.getElementById('v-where') || {}).textContent || '',
            alive: typeof window.CSM
          };
        }""")
        ok = (r6["alive"] == "object"
              and (r6["km"] is None or (1e5 < r6["km"] < 3e6))
              and "NaN" not in r6["shown"]
              and "undefined" not in r6["shown"])
        check(label, ok, str(r6))
        # A rejected table must fall back and say so, never quietly keep the label.
        if r6["km"] is not None and r6["exact"] is False:
            check(label + " — falls back to the L2 point and says so",
                  "Horizons" not in r6["where"], r6["where"])
        check(label + " — page still runs", not e6, "; ".join(e6[:2]))
        ctx6.close()

    b.close()

print("\n" + ("FAILED: " + ", ".join(fail) if fail else "PASS — all security regressions held"))
sys.exit(1 if fail else 0)
