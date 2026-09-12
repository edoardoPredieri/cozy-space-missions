#!/usr/bin/env python3
"""Load both pages and assert the meta CSP blocks nothing the page needs."""
import os, sys, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the repo root
PORT = 8111

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()

threading.Thread(target=serve, daemon=True).start()
time.sleep(0.6)

HOOK = """
window.__csp = [];
document.addEventListener('securitypolicyviolation', function (e) {
  window.__csp.push({
    directive: e.violatedDirective,
    blocked: e.blockedURI,
    line: e.lineNumber,
    src: e.sourceFile
  });
});
"""

pages = [("index.html", "home"), ("iss.html", "iss"), ("hubble.html", "hubble"),
         ("webb.html", "webb"), ("roman.html", "roman")]
fail = False

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for name, mission in pages:
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        ctx.add_init_script(HOOK)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        console = []
        pg.on("console", lambda m: console.append((m.type, m.text)))
        pg.goto(f"http://localhost:{PORT}/{name}", wait_until="load")
        pg.wait_for_timeout(4000)
        # scroll to bottom so lazy sections (news, space figures) initialise
        pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        pg.wait_for_timeout(3000)

        v = pg.evaluate("window.__csp")
        # what actually loaded
        state = pg.evaluate("""() => ({
          csm: typeof window.CSM,
          sat: window.CSM && window.CSM.sat ? window.CSM.sat.id : null,
          sgp4: typeof window.SGP4,
          styleApplied: getComputedStyle(document.body).fontFamily,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          canvases: document.querySelectorAll('canvas').length,
          fonts: Array.from(document.fonts).map(f => f.family + ':' + f.status).slice(0, 8),
          deepOk: !!(window.CSM && window.CSM.sat.kind === 'deep' && window.CSM.position()),
          homeOk: !!(document.getElementById('moon-name') &&
                     document.getElementById('moon-name').textContent.length > 2),
          starPainted: (function(){
            var c = document.getElementById('stars');
            if (!c) return 'no canvas';
            try {
              var g = c.getContext('2d');
              var d = g.getImageData(0, 0, c.width, c.height).data;
              for (var i = 3; i < d.length; i += 4) if (d[i] > 0) return 'painted';
              return 'blank';
            } catch (e) { return 'err:' + e.message }
          })()
        })""")

        print(f"\n=== {name} ({mission}) ===")
        print("CSP violations:", len(v))
        for x in v:
            print("   !", x["directive"], "->", x["blocked"], f'({x["src"]}:{x["line"]})')
        print("state:", json.dumps(state, indent=2)[:1200])
        if errs:
            print("page errors:")
            for e in errs[:10]:
                print("   !", e[:200])
        neterr = [c for c in console if c[0] == "error"]
        if neterr:
            print("console errors:")
            for t, m in neterr[:10]:
                print("   -", m[:200])

        # A violation of anything other than connect-src is a real break.
        # connect-src violations cannot happen here (sandbox blocks the hosts at
        # the network layer, which is not a CSP event), so treat any violation as fail.
        if v:
            fail = True
        if state["csm"] != "object":
            print("FAIL: CSM bus missing")
            fail = True
        if mission == "home" and not state["homeOk"]:
            print("FAIL: the front page drew nothing")
            fail = True
        if mission in ("webb", "roman") and not state["deepOk"]:
            print("FAIL: the L2 table did not load")
            fail = True
        if mission == "hubble" and state["sgp4"] != "object":
            print("FAIL: SGP4 module did not load")
            fail = True
        if state["starPainted"] != "painted":
            print("FAIL: starfield canvas not painted ->", state["starPainted"])
            fail = True
        if state["sat"] != mission:
            print("FAIL: wrong mission", state["sat"])
            fail = True
        ctx.close()
    b.close()

print("\n" + ("FAIL" if fail else "PASS — CSP breaks nothing"))
sys.exit(1 if fail else 0)
