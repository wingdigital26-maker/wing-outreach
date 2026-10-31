"""Daily 50 knock route for Jackson Roofing (DFW): 12 real homes hit by the default DFW storm, by their own
per-home radar hail (lib/st-data-dfw/meta/hail/<region>/<date>.bin, NOAA MRMS MESH), each with its Collin/Denton CAD
address, year built, subdivision and its own Overture building outline (county_roofs geom tiles via
scripts/dfw/build_dfw.py), measured LiDAR pitch where USGS 3DEP 2018 has one, Roof/Re-Roof permit when Collin CAD has one.

Picks, in Jackson's home city (HOME_CITY = Plano), the 400 m block of 1 inch+ single-family homes with an outline that took
the hardest hail, among blocks with 12+ measured-LiDAR-pitch candidates when any exist (else any block with 12+), then the
12 highest-hail homes there at least 45 m apart, measured pitch first.
(Block score = sum of its 12 highest radar hail values, so the hardest-hit block wins over a merely dense one.) OSRM public router orders the stops and draws the road route.
Writes route-dfw.json, roofs-dfw.json and routes-dfw.js / roofs-dfw.js, which ADD a "jackson" entry to
window.ROUTES / window.ROOFS (include them after routes.js / roofs.js). No owner names are read or written.
usage: python tour/c4-command-deck/data/build_dfw_route.py
"""
import json, math, os, sys, urllib.request
from collections import Counter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOUR = os.path.normpath(os.path.join(HERE, "..", ".."))
REPO = os.path.dirname(TOUR)
sys.path.insert(0, os.path.join(REPO, "scripts", "dfw")); sys.path.insert(0, HERE)
import build_dfw as B
from build_roofs import local, ring_area_centroid, clean
UA = {"User-Agent": "WingDigital-RoofCommand-concept/1.0 (wingdigital26@gmail.com)"}
FT = 3.28084
KEY = "jackson"
HOME_CITY = "Plano"   # Jackson Roofing's home base (2026-10-07): the Daily 50 knocks Plano homes only


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return json.loads(r.read().decode())


def main():
    D = os.path.join(TOUR, "lib", "st-data-dfw")
    cat = json.load(open(os.path.join(D, "catalog.json")))
    storm = cat["default_storm"]["date"]
    cand = []
    for reg in cat["regions"]:
        rid, n, off = reg["id"], reg["count"], reg["offset"]
        hp = os.path.join(D, "meta", "hail", rid, storm + ".bin")
        if not os.path.exists(hp): continue
        hail = np.frombuffer(open(hp, "rb").read(), np.uint8)
        typ = np.frombuffer(open(os.path.join(D, "homes.bin"), "rb").read(), np.uint8, cat["total"], cat["total"] * 8)[off:off + n]
        b = open(os.path.join(D, "meta", rid, "homes_meta.bin"), "rb").read()
        year = np.frombuffer(b, "<u2", n, 0); house = np.frombuffer(b, "<u2", n, 6 * n); sid = np.frombuffer(b, "<u2", n, 8 * n)
        zips = np.frombuffer(b, "<u4", n, 10 * n); cid = np.frombuffer(b, "<u2", n, 14 * n)
        ext = open(os.path.join(D, "meta", rid, "homes_ext.bin"), "rb").read()
        sub = np.frombuffer(ext, "<u2", n, 0); liv = np.frombuffer(ext, "<u2", n, 2 * n)
        streets = json.load(open(os.path.join(D, "meta", rid, "streets.json"))); cities = json.load(open(os.path.join(D, "meta", rid, "cities.json")))
        subs = json.load(open(os.path.join(D, "meta", rid, "subdivs.json")))
        permits = json.load(open(os.path.join(D, "meta", "permits.json")))
        pitch = {}
        for f in os.listdir(os.path.join(B.roofdir(rid), "pitch")) if os.path.isdir(os.path.join(B.roofdir(rid), "pitch")) else []:
            if f.startswith("tile_"): pitch.update(json.load(open(os.path.join(B.roofdir(rid), "pitch", f))).get("h", {})) if f.endswith(".json") and f != "index.json" else None
        for t in json.load(open(os.path.join(B.roofdir(rid), "tiles.json"))):
            for e in json.load(open(os.path.join(B.roofdir(rid), "geom", t["file"]))):
                i = e["i"]
                if hail[i] < 100 or typ[i] & 127 != 0 or not house[i] or not (1200 <= e["sqft"] <= 5000): continue
                if cities[cid[i]] != HOME_CITY: continue
                p = pitch.get(str(i)); measured = bool(p and p[0] >= 2 and p[1] >= 40 and year[i] and year[i] <= 2018)
                r = e["ring"]; x = sum(q[0] for q in r) / len(r); y = sum(q[1] for q in r) / len(r)
                cand.append(dict(e=e, rid=rid, gi=off + i, i=i, x=x, y=y, mx=x * 111320 * math.cos(math.radians(33.1)), my=y * 110574,
                                 hail=int(hail[i]), measured=measured, p=p, nv=len(r),
                                 rec=dict(name=streets[sid[i]], num=str(int(house[i])), city=cities[cid[i]], zip=str(int(zips[i])).zfill(5) if zips[i] else "",
                                          subdivision=subs[sub[i]] or None, living_sqft=int(liv[i]) or None, year=int(year[i]) or None,
                                          permit=permits.get(f"{rid}:{i}"))))
    print(HOME_CITY, "1in+ single-family homes with an outline on", storm, len(cand), "measured pitch", sum(c["measured"] for c in cand))
    blocks, meas = {}, {}
    for c in cand:
        k = (int(c["mx"] // 400), int(c["my"] // 400)); blocks.setdefault(k, []).append(c["hail"]); meas[k] = meas.get(k, 0) + c["measured"]
    # hardest-hit walkable block: highest sum of its 12 biggest radar hail values (needs 12+ candidate homes),
    # restricted to blocks where 12+ homes already have a measured LiDAR pitch when there are any such blocks
    ok = [k for k, v in blocks.items() if len(v) >= 12 and meas[k] >= 12] or [k for k, v in blocks.items() if len(v) >= 12]
    best = max(ok, key=lambda k: sum(sorted(blocks[k], reverse=True)[:12]))
    print("blocks with 12+ candidates", sum(1 for v in blocks.values() if len(v) >= 12), "with 12+ measured", sum(1 for k, v in blocks.items() if len(v) >= 12 and meas[k] >= 12))
    cx, cy = (best[0] + .5) * 400, (best[1] + .5) * 400
    pool = sorted([c for c in cand if abs(c["mx"] - cx) < 450 and abs(c["my"] - cy) < 450], key=lambda c: (-c["measured"], -c["hail"]))[:80]
    # homes whose LiDAR tile is not built yet: fit their pitch now, same method (scripts/dfw/pitch_dfw.py)
    miss = [c for c in pool if c["p"] is None]
    if miss:
        import pitch_dfw as P
        res = P.process(P.bp.Ept(), [c["e"] for c in miss], 6)
        for c in miss:
            r = res.get(c["i"])
            if r:
                c["p"] = [r["pitch"], r["conf"], r["planes"]]
                y = c["rec"]["year"]; c["measured"] = bool(r["pitch"] >= 2 and r["conf"] >= 40 and y and y <= 2018)
        print("fitted pitch now for", len(miss), "pool homes,", sum(1 for c in miss if c["p"]), "with a fit")
    pool.sort(key=lambda c: (-c["measured"], -c["hail"]))
    picked = []
    for c in pool:
        if len(picked) == 12: break
        if any(math.hypot(c["mx"] - p["mx"], c["my"] - p["my"]) < 45 for p in picked): continue
        picked.append(c)
    stops = []
    for c in picked:
        s = dict(c["rec"]); s.update(hail=round(c["hail"] / 100, 2), loc=[round(c["x"], 6), round(c["y"], 6)], fp=int(c["i"]), gi=int(c["gi"]),
                                     region=c["rid"], county=B.REGIONS[c["rid"]]["county"], state="TX", addr_src="county")
        stops.append(s); print(s["num"], s["name"], s["city"], s["zip"], s["subdivision"], s["hail"], "in", "built", s["year"], "permit", s["permit"])
    coords = ";".join(f"{s['loc'][0]},{s['loc'][1]}" for s in stops)
    r = get(f"https://router.project-osrm.org/trip/v1/driving/{coords}?overview=full&geometries=geojson&source=first&roundtrip=false&destination=any")
    order = sorted(range(len(stops)), key=lambda k: r["waypoints"][k]["waypoint_index"])
    picked = [picked[k] for k in order]; stops = [stops[k] for k in order]
    route = {"storm": storm, "route": r["trips"][0]["geometry"], "stops": stops}
    json.dump(route, open(os.path.join(HERE, "route-dfw.json"), "w"), indent=0)
    open(os.path.join(HERE, "routes-dfw.js"), "w").write("window.ROUTES=Object.assign(window.ROUTES||{}," + json.dumps({KEY: route}) + ");\n")
    roofs = {}
    for n, c in enumerate(picked, 1):
        ring = c["e"]["ring"]
        lon0 = sum(p[0] for p in ring) / len(ring); lat0 = sum(p[1] for p in ring) / len(ring)
        ft = clean([[x * FT, y * FT] for x, y in (local(p[0], p[1], lon0, lat0) for p in ring)])
        area, (ox, oy) = ring_area_centroid(ft)
        ft = [[round(x - ox, 2), round(y - oy, 2)] for x, y in ft]
        p = c["p"]
        pt = {"rise": int(p[0]), "measured": True, "conf": int(p[1])} if c["measured"] else {"rise": 6, "measured": False}
        roofs[f"stop{n}"] = {"ring_ft": ft, "sqft": round(area), "source": "Overture building outline (" + c["e"].get("src", "").replace("overture:", "") + ")",
                             "pitch": pt, "match": "own footprint", "dist_m": 0.0}
        print(n, stops[n - 1]["num"], stops[n - 1]["name"], round(area), "sqft", len(ft), "verts", pt)
    roofs["default"] = "stop1"
    json.dump(roofs, open(os.path.join(HERE, "roofs-dfw.json"), "w"), indent=0)
    open(os.path.join(HERE, "roofs-dfw.js"), "w").write("window.ROOFS=Object.assign(window.ROOFS||{}," + json.dumps({KEY: roofs}) + ");\n")
    print("stops", len(stops), "dist m", round(r["trips"][0]["distance"]))


if __name__ == "__main__":
    main()
