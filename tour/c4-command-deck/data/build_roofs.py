"""Real roofs for the Daily 50 OKC stops (reddirt route).

For every stop in route-okc.json find the Microsoft building footprint (county_roofs/okcounty geom
tiles, read only) that CONTAINS the stop point, else the nearest one within 25 m, else none.
Route stops sit on the street (OSRM snapped), so most matches are "nearest within 25 m".
Measured pitch comes from the USGS LiDAR pitch tiles when the home has one, else 6/12 assumed.

Also does the Edmond route (prairie). Writes roofs-okc.json, roofs-edmond.json and roofs.js
(window.ROOFS = {reddirt: <okc>, prairie: <edmond>}, so the deck loads it with a plain script tag).
Shape of each route file:
  {"stop1": {"ring_ft": [[x, y], ...], "sqft": n, "source": "Microsoft building footprint",
             "pitch": {"rise": 6, "measured": false}, "match": "contains" | "nearest", "dist_m": d},
   "stop2": null, ..., "default": "stop1"}
ring_ft is local feet, x east, y north, origin at the footprint's area centroid.
Never reads data/private and never writes owner names.
"""
import json, math, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:/Users/wjack/roof-work/data/county_roofs/okcounty"
CLEVE_PITCH = r"C:/Users/wjack/roof-work/data/county_roofs/cleveland/pitch/index.json"
FT = 3.28084
MAX_M = 25.0
MIN_SQFT = 600  # skip sheds and carports when picking the nearest outline


def local(lon, lat, lon0, lat0):
    kx = 111320.0 * math.cos(math.radians(lat0))
    return ((lon - lon0) * kx, (lat - lat0) * 110574.0)


def ring_area_centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        c = x1 * y2 - x2 * y1
        a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    a /= 2
    return abs(a), (cx / (6 * a), cy / (6 * a))


def inside(p, r):
    x, y = p; c = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy or 1e-12
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def clean(ring):
    """drop the closing vertex, duplicate points and near-collinear vertices (< 0.4 ft off the chord)"""
    r = [tuple(p) for p in ring]
    if len(r) > 1 and r[0] == r[-1]: r = r[:-1]
    changed = True
    while changed and len(r) > 3:
        changed = False
        for i in range(len(r)):
            a, b, c = r[i - 1], r[i], r[(i + 1) % len(r)]
            if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3 or seg_dist(b, a, c) < 0.4:
                r.pop(i); changed = True; break
    return [list(p) for p in r]


def load_pitch():
    h = {}
    for f in glob.glob(os.path.join(SRC, "pitch", "tile_*.json")):
        try: h.update(json.load(open(f)).get("h", {}))
        except Exception: pass
    return h


ROUTES = [("reddirt", "okc"), ("prairie", "edmond")]   # roofer key in routes.js -> route-<name>.json


def main():
    allr = {}
    for key, name in ROUTES:
        print("--", key, name)
        allr[key] = build(name)
    open(os.path.join(HERE, "roofs.js"), "w").write("window.ROOFS=" + json.dumps(allr) + ";\n")


def build(name):
    route = json.load(open(os.path.join(HERE, f"route-{name}.json")))
    tiles = {(t["tr"], t["tc"]): t["file"] for t in json.load(open(os.path.join(SRC, "tiles.json")))}
    pitch = load_pitch()
    cache = {}

    def items_near(lon, lat):
        tr, tc = math.floor(lat / 0.05), math.floor(lon / 0.05)
        out = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                k = (tr + dr, tc + dc)
                if k not in tiles: continue
                if k not in cache:
                    f = os.path.join(SRC, "geom", tiles[k])
                    cache[k] = json.load(open(f)) if os.path.exists(f) else []
                out += cache[k]
        return out

    res = {}
    for n, s in enumerate(route["stops"], 1):
        lon, lat = s["loc"]
        best = None
        if "fp" in s:   # route built on real homes (build_okc_homes.py): the stop names its own footprint
            e = next((e for e in items_near(lon, lat) if e["i"] == s["fp"]), None)
            if e: best = (0.0, "own footprint", e)
        for e in ([] if best else items_near(lon, lat)):
            ring = e["ring"]
            if abs(ring[0][0] - lon) > 0.002 or abs(ring[0][1] - lat) > 0.002: continue
            m = [local(x, y, lon, lat) for x, y in ring]
            if inside((0, 0), m): d, how = 0.0, "contains"
            else:
                if (e.get("sqft") or 0) < MIN_SQFT: continue
                d, how = min(seg_dist((0, 0), m[i], m[(i + 1) % len(m)]) for i in range(len(m))), "nearest"
            if d <= MAX_M and (best is None or d < best[0]): best = (d, how, e)
        if not best:
            res[f"stop{n}"] = None
            print(n, s["name"], "no outline within", MAX_M, "m")
            continue
        d, how, e = best
        ring = e["ring"]
        lon0 = sum(p[0] for p in ring) / len(ring); lat0 = sum(p[1] for p in ring) / len(ring)
        ft = [[x * FT, y * FT] for x, y in (local(p[0], p[1], lon0, lat0) for p in ring)]
        ft = clean(ft)
        area, (cx, cy) = ring_area_centroid(ft)
        ft = [[round(x - cx, 2), round(y - cy, 2)] for x, y in ft]
        pe = pitch.get(str(e["i"]))
        if pe and pe[0] >= 2 and pe[1] >= 40: pt = {"rise": int(pe[0]), "measured": True, "conf": int(pe[1])}
        else: pt = {"rise": 6, "measured": False}
        res[f"stop{n}"] = {"ring_ft": ft, "sqft": round(area), "source": "Microsoft building footprint",
                           "pitch": pt, "match": how, "dist_m": round(d, 1)}
        print(n, s["name"], how, round(d, 1), "m", round(area), "sqft", len(ft), "verts", pt)
    res["default"] = "stop1" if res.get("stop1") else next(k for k, v in res.items() if v)
    json.dump(res, open(os.path.join(HERE, f"roofs-{name}.json"), "w"), indent=0)
    return res


if __name__ == "__main__":
    main()
