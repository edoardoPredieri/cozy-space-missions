#!/usr/bin/env python3
"""Turn JPL Horizons observer tables into assets/ephem.js.

Why a table and not a live API call: the pages are static files on GitHub Pages
and their Content-Security-Policy lists, per page, exactly the hosts each one
calls. Adding a live ephemeris service would mean a new host, a new CORS
dependency, and a third-party text format parsed at run time on every visit —
for a trajectory that is smooth, published in advance, and changes by a few
tenths of a percent a day. Shipping the numbers as source turns them from
untrusted network input into code that travels with the page, which is the same
reason satellite.js is vendored rather than pulled from a CDN.

The cost is that the table expires. That is made explicit: every table carries
the span it covers, and the page falls back to the computed L2 point — saying
so plainly — once it runs past the end.

Regenerating (needs network access to ssd.jpl.nasa.gov):

    python3 tools/make-ephem.py --fetch

Rebuilding from the captured Horizons output, with no network:

    python3 tools/make-ephem.py

The raw responses live in tools/horizons-raw/ so the build is reproducible and
auditable: anyone can diff them against a fresh Horizons query.
"""

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(HERE, "horizons-raw")
OUT = os.path.join(ROOT, "assets", "ephem.js")

AU_KM = 149597870.7
OBLIQUITY = math.radians(23.439291)     # mean obliquity of the ecliptic, J2000

# Horizons targets. The span is what we ask for; what we get may be shorter,
# which is the interesting case for a spacecraft still under way.
TARGETS = {
    "jwst":  {"command": "-170", "start": "2026-09-01", "stop": "2027-09-06", "step": "10 d"},
    "roman": {"command": "-211", "start": "2026-08-31", "stop": "2026-10-02", "step": "1 d"},
}

MONTHS = {m: i + 1 for i, m in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}

ROW = re.compile(
    r"^\s*(\d{4})-([A-Z][a-z]{2})-(\d{2})\s+(\d{2}):(\d{2})\s+"      # date, UT
    r"(\d{2})\s+(\d{2})\s+([\d.]+)\s+"                                # RA h m s
    r"([+-]\d{2})\s+(\d{2})\s+([\d.]+)\s+"                            # Dec d m s
    r"([\d.]+)\s+"                                                    # delta, AU
    r"(-?[\d.]+)\s*$"                                                 # deldot, km/s
)


def fetch(name, spec):
    """Ask Horizons directly. Only used with --fetch."""
    q = {
        "format": "text", "COMMAND": "'%s'" % spec["command"],
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
        "START_TIME": "'%s'" % spec["start"], "STOP_TIME": "'%s'" % spec["stop"],
        "STEP_SIZE": "'%s'" % spec["step"], "QUANTITIES": "'1,20'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read().decode("utf-8", "replace")
    if "$$SOE" not in body:
        raise SystemExit("%s: Horizons returned no ephemeris:\n%s" % (name, body[:800]))
    rows = body.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip("\n")
    path = os.path.join(RAW, name + ".txt")
    with open(path, "w") as f:
        f.write(rows + "\n")
    print("  fetched %s -> %s" % (name, os.path.relpath(path, ROOT)))
    return rows


def parse(name, text):
    """Every line must match the Horizons row shape exactly. A line that does
    not is an error, never something to skip quietly: a half-read table would
    still draw, and would draw something wrong."""
    samples = []
    for lineno, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("$$"):
            continue
        m = ROW.match(line)
        if not m:
            raise SystemExit("%s line %d is not a Horizons row:\n  %s" % (name, lineno, line))
        (y, mon, d, hh, mm, rh, rm, rs, dd, dm, ds, delta, deldot) = m.groups()

        when = dt.datetime(int(y), MONTHS[mon], int(d), int(hh), int(mm), tzinfo=dt.timezone.utc)
        ra = (int(rh) + int(rm) / 60 + float(rs) / 3600) * 15.0          # degrees
        sign = -1.0 if dd.startswith("-") else 1.0
        dec = sign * (abs(int(dd)) + int(dm) / 60 + float(ds) / 3600)    # degrees
        km = float(delta) * AU_KM

        # Equatorial to ecliptic: the drawing looks down on the plane the
        # planets share, so that is the frame the page wants.
        a, e = math.radians(ra), math.radians(dec)
        x = math.cos(e) * math.cos(a)
        y_ = math.cos(e) * math.sin(a)
        z = math.sin(e)
        ye = y_ * math.cos(OBLIQUITY) + z * math.sin(OBLIQUITY)
        ze = -y_ * math.sin(OBLIQUITY) + z * math.cos(OBLIQUITY)
        lon = math.degrees(math.atan2(ye, x)) % 360.0
        lat = math.degrees(math.asin(max(-1.0, min(1.0, ze))))

        samples.append({
            "t": int(when.timestamp()),
            "km": km,
            "lon": lon,
            "lat": lat,
            "kms": float(deldot),
        })
    if len(samples) < 4:
        raise SystemExit("%s: only %d samples; interpolation needs at least 4" % (name, len(samples)))
    return samples


def check(name, s):
    """Numbers that were transcribed by hand or by a summarising model have to
    earn trust. A real trajectory is smooth, so a bad digit shows up as a kink:
    compare each interior point against the straight line through its
    neighbours and complain about anything that stands out from the run."""
    problems = []

    for i in range(1, len(s)):
        if s[i]["t"] <= s[i - 1]["t"]:
            problems.append("sample %d goes backwards in time" % i)

    for p in s:
        if not (1000 < p["km"] < 3e6):
            problems.append("%s: distance %.0f km is not where this mission goes"
                            % (iso(p["t"]), p["km"]))
        if not (-90 <= p["lat"] <= 90) or not (0 <= p["lon"] < 360):
            problems.append("%s: direction out of range" % iso(p["t"]))
        if abs(p["kms"]) > 15:
            problems.append("%s: %.3f km/s away from Earth is implausible" % (iso(p["t"]), p["kms"]))

    # Against a straight line this test cries wolf: a real trajectory bends,
    # and right after a launch it bends hard. So predict each point with a
    # cubic through its four neighbours — which follows genuine curvature —
    # and look at what is left. A curve bends; a wrong digit jumps.
    resid = []
    for i in range(2, len(s) - 2):
        others = [s[j] for j in (i - 2, i - 1, i + 1, i + 2)]
        pred = 0.0
        for a in range(4):
            term = others[a]["km"]
            for b in range(4):
                if a != b:
                    term *= (s[i]["t"] - others[b]["t"]) / (others[a]["t"] - others[b]["t"])
            pred += term
        resid.append((abs(s[i]["km"] - pred), i))

    if resid:
        values = sorted(r[0] for r in resid)
        median = values[len(values) // 2]
        limit = max(median * 25, 1000.0)
        for r, i in resid:
            if r > limit:
                problems.append(
                    "%s: distance is %.0f km off what its four neighbours predict "
                    "(typical %.0f km) — check this row against Horizons"
                    % (iso(s[i]["t"]), r, median))

    if problems:
        for p in problems:
            print("  ! " + p, file=sys.stderr)
        raise SystemExit("%s: table rejected." % name)

    print("  %s: %d samples, %s to %s, %.0f–%.0f thousand km, smooth"
          % (name, len(s), iso(s[0]["t"]), iso(s[-1]["t"]),
             min(p["km"] for p in s) / 1000, max(p["km"] for p in s) / 1000))


def iso(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true",
                    help="ask JPL Horizons instead of using tools/horizons-raw/")
    args = ap.parse_args()

    tables = {}
    for name, spec in TARGETS.items():
        if args.fetch:
            text = fetch(name, spec)
        else:
            with open(os.path.join(RAW, name + ".txt")) as f:
                text = f.read()
        s = parse(name, text)
        check(name, s)
        tables[name] = s

    generated = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    out = ['/* Cozy Space Missions — where the L2 missions actually are.',
           '',
           '   Generated by tools/make-ephem.py from JPL Horizons observer tables',
           '   (geocentric, ICRF). Do not edit by hand: edit the raw responses in',
           '   tools/horizons-raw/ and regenerate, so the numbers keep a source.',
           '',
           '   Generated %s. Each table says the span it covers; past the end' % generated,
           '   of it, the page falls back to the computed L2 point and says so.',
           '',
           '   t   seconds since the epoch, UTC',
           '   km  distance from the centre of the Earth',
           '   lon geocentric ecliptic longitude, degrees',
           '   lat geocentric ecliptic latitude, degrees',
           '   kms rate of change of distance, km/s (positive = moving away)  */',
           '',
           'window.EPHEM = {']

    for name in ("jwst", "roman"):
        s = tables[name]
        out.append('  %s: {' % name)
        out.append('    source: "JPL Horizons (%s), fetched %s",'
                   % (TARGETS[name]["command"], generated))
        out.append('    from: %d, to: %d,' % (s[0]["t"], s[-1]["t"]))
        out.append('    samples: [')
        for p in s:
            out.append('      [%d, %.1f, %.4f, %.4f, %.5f],'
                       % (p["t"], p["km"], p["lon"], p["lat"], p["kms"]))
        out.append('    ]')
        out.append('  },' if name == "jwst" else '  }')

    out.append('};')
    out.append('')

    with open(OUT, "w") as f:
        f.write("\n".join(out))
    print("wrote %s (%.1f KB)" % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
