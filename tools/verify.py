#!/usr/bin/env python3
"""An accessibility and layout pass over one page, in a real browser.

    python3 tools/verify.py            # the front page
    python3 tools/verify.py iss.html

What it reports, none of which the Playwright suites in tests/ cover:

  contrast      every piece of text, composited against whatever is actually
                behind it, checked at the WCAG AA ratio for its size
  targets       anything clickable smaller than 24px in either direction.
                Links inside a sentence are exempt in WCAG 2.2 and show up
                here anyway: read the list, do not clear it
  names         buttons, links, canvases and inputs with nothing a screen
                reader could announce. Anything inside an aria-hidden subtree
                is skipped, because it is not announced at all
  headings      the sequence of levels, so a skipped level is visible
  live regions  there should be exactly one polite one
  overflow      horizontal scrolling at 375, 768, 1024 and 1440
  motion        with prefers-reduced-motion, every revealed section must still
                be revealed

It lived outside the repository for a while and was lost when a sandbox was
recycled, which is why it is in here now.
"""
import json, time, math, threading, http.server, socketserver, os, sys, functools

PAGE = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8790

from playwright.sync_api import sync_playwright


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), h) as httpd:
        httpd.serve_forever()


threading.Thread(target=serve, daemon=True).start()
time.sleep(0.5)

now = int(time.time())


def iss_at(t):
    m = (t - now) / 60.0
    ang = (m / 92.0) * 2 * math.pi
    return {"latitude": 51.6 * math.sin(ang + 0.55),
            "longitude": ((12.5 + m * 1.05 + 180) % 360) - 180,
            "altitude": 420.0 + 3 * math.sin(ang), "velocity": 27580.0,
            "visibility": "daylight", "footprint": 4520.0, "timestamp": t,
            "solar_lat": 7.2, "solar_lon": -40.0}


ISS_TLE = ("ISS (ZARYA)\r\n"
           "1 25544U 98067A   26254.54791667  .00016717  00000+0  10270-3 0  9005\r\n"
           "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537\r\n")
HST_TLE = ("HST\r\n"
           "1 20580U 90037B   26254.46497126  .00003585  00000+0  10696-3 0  9992\r\n"
           "2 20580  28.4724 258.4042 0001482 305.6276  54.4182 15.31550044800733\r\n")


def route_iss(r):
    u = r.request.url
    if '/positions' in u:
        ts = [int(x) for x in u.split('timestamps=')[1].split('&')[0].split(',')]
        r.fulfill(status=200, content_type="application/json",
                  body=json.dumps([iss_at(t) for t in ts]))
    else:
        r.fulfill(status=200, content_type="application/json",
                  body=json.dumps(iss_at(int(time.time()))))


def route_tle(r):
    r.fulfill(status=200, content_type="text/plain",
              body=ISS_TLE if "25544" in r.request.url else HST_TLE)


def route_geo(r):
    r.fulfill(status=200, content_type="application/json", body=json.dumps([
        {"display_name": "Via Roma, 1, Bologna, Emilia-Romagna, 40121, Italia",
         "lat": "44.4949", "lon": "11.3426"}]))


AUDIT = r"""
() => {
  const px = c => { const m = c.match(/[\d.]+/g) || [0,0,0];
                    return {r:+m[0], g:+m[1], b:+m[2], a:m[3]!==undefined?+m[3]:1}; };
  const over = (fg,bg) => ({r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a),
                            b:fg.b*fg.a+bg.b*(1-fg.a), a:1});
  const lum = c => { const f=v=>{v/=255; return v<=0.03928? v/12.92
                                        : Math.pow((v+0.055)/1.055,2.4);};
                     return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b);
                           return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };

  /* The page is built of translucent panels over a painted background, so a
     text colour means nothing until it is composited down the whole chain. */
  const bgOf = el => {
    let acc = {r:8,g:13,b:26,a:1}, chain = [];
    for (let n=el; n; n=n.parentElement) chain.push(px(getComputedStyle(n).backgroundColor));
    for (let i=chain.length-1;i>=0;i--) if (chain[i].a>0) acc = over(chain[i], acc);
    return acc;
  };

  const hidden = el => { for (let n=el; n; n=n.parentElement)
                           if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
                         return false; };

  const out = { contrast: [], targets: [], names: [], headings: [], overflow: null };

  document.querySelectorAll('p,span,a,li,label,h1,h2,h3,h4,button,td,div').forEach(el => {
    if (!el.offsetParent && el.tagName !== 'BODY') return;
    const txt = Array.from(el.childNodes).filter(n=>n.nodeType===3)
                     .map(n=>n.textContent.trim()).join('');
    if (txt.length < 2) return;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight)||400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const own = px(cs.backgroundColor);
    const base = own.a >= 0.98 ? bgOf(el) : bgOf(el.parentElement||el);
    const c = ratio(over(px(cs.color), base), base);
    const need = large ? 3 : 4.5;
    if (c < need) out.contrast.push({ text: txt.slice(0,42), px: size.toFixed(1),
                                      ratio: +c.toFixed(2), need });
  });

  document.querySelectorAll('a[href],button,input,[tabindex]:not([tabindex="-1"])').forEach(el => {
    if (!el.offsetParent) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24)
      out.targets.push({ el: el.tagName+'.'+el.className,
                         text: (el.textContent||'').trim().slice(0,24),
                         w: Math.round(r.width), h: Math.round(r.height) });
  });

  document.querySelectorAll('button,a[href],canvas,input').forEach(el => {
    if (!el.offsetParent || hidden(el)) return;
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim()
      || (el.labels && el.labels.length ? el.labels[0].textContent.trim() : '');
    if (!name) out.names.push(el.tagName + '.' + el.className);
  });

  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => out.headings.push(+h.tagName[1]));
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.liveRegions = Array.from(document.querySelectorAll('[aria-live]'))
                         .map(e => e.id + ':' + e.getAttribute('aria-live'));
  return out;
}
"""

problems = 0

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 1000})
    ctx.route("**/api.wheretheiss.at/**", route_iss)
    ctx.route("**/celestrak.org/**", route_tle)
    ctx.route("**/nominatim.openstreetmap.org/**", route_geo)
    for host in ("**/tle.ivanstanojevic.me/**", "**/api.spaceflightnewsapi.net/**"):
        ctx.route(host, lambda r: r.abort())
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://localhost:{PORT}/{PAGE}", wait_until="load")
    pg.wait_for_timeout(2500)
    pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))")

    # Give the page a position, so the sections that only appear with one are audited too.
    if pg.query_selector("#home-input"):
        pg.fill("#home-input", "Via Roma 1 Bologna")
        pg.click("#home-submit")
        pg.wait_for_timeout(1500)
        if pg.query_selector(".place-results li"):
            pg.click(".place-results li button, .place-results li")
        pg.wait_for_timeout(1500)
    elif pg.query_selector("#place-input"):
        pg.fill("#place-input", "Via Roma 1 Bologna")
        pg.click("#place-submit")
        pg.wait_for_timeout(1500)
        if pg.query_selector(".place-results li"):
            pg.click(".place-results li button, .place-results li")
        pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))")
    pg.wait_for_timeout(600)

    a = pg.evaluate(AUDIT)

    print("\n=== %s ===" % PAGE)
    print("contrast below threshold:")
    if a["contrast"]:
        problems += len(a["contrast"])
        for c in a["contrast"]:
            print("   %5.2f (needs %.1f) at %spx — %s" % (c["ratio"], c["need"], c["px"], c["text"]))
    else:
        print("   none")

    print("targets under 24px:")
    if a["targets"]:
        for t in a["targets"]:
            print("   %dx%d  %s  %r" % (t["w"], t["h"], t["el"], t["text"]))
        print("   (links inside a sentence are exempt under WCAG 2.2)")
    else:
        print("   none")

    print("elements with no accessible name:")
    if a["names"]:
        problems += len(a["names"])
        for n in a["names"]:
            print("   " + n)
    else:
        print("   none")

    print("heading levels: %s" % a["headings"])
    for i in range(1, len(a["headings"])):
        if a["headings"][i] > a["headings"][i - 1] + 1:
            print("   skipped a level at position %d" % i)
            problems += 1
    print("live regions:  %s" % a["liveRegions"])
    polite = [r for r in a["liveRegions"] if r.endswith(":polite")]
    if len(polite) != 1:
        print("   expected exactly one polite region, found %d" % len(polite))
        problems += 1

    print("horizontal overflow:")
    for w in (375, 768, 1024, 1440):
        pg.set_viewport_size({"width": w, "height": 1000})
        pg.wait_for_timeout(500)
        o = pg.evaluate("() => document.documentElement.scrollWidth"
                        " - document.documentElement.clientWidth")
        print("   %4dpx  %s" % (w, "none" if o <= 0 else "%dpx off the side" % o))
        if o > 0:
            problems += 1
    ctx.close()

    # Reduced motion: the reveal animation must not be the only thing that
    # reveals anything.
    ctx = b.new_context(viewport={"width": 1280, "height": 1000},
                        reduced_motion="reduce")
    for host in ("**/api.wheretheiss.at/**", "**/celestrak.org/**",
                 "**/tle.ivanstanojevic.me/**", "**/nominatim.openstreetmap.org/**",
                 "**/api.spaceflightnewsapi.net/**"):
        ctx.route(host, lambda r: r.abort())
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{PORT}/{PAGE}", wait_until="load")
    pg.wait_for_timeout(1500)
    seen = pg.evaluate("""() => {
      const all = document.querySelectorAll('.reveal');
      let shown = 0;
      all.forEach(e => { if (getComputedStyle(e).opacity > 0.9) shown++; });
      return [shown, all.length];
    }""")
    print("reduced motion: %d of %d revealed sections visible" % tuple(seen))
    if seen[0] != seen[1]:
        problems += 1
    ctx.close()
    b.close()

print("page errors: %s" % (errs if errs else "none"))
if errs:
    problems += len(errs)
print("\n%s" % ("clean" if problems == 0 else "%d things to look at" % problems))
sys.exit(1 if problems else 0)
