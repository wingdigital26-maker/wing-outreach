"""Build lib/st-data/ for the Storm Map concept from the app's pulled data mirror (read only).

Source: C:/Users/wjack/roof-work/data (scripts/workdir.py pull of the Supabase bucket app-data; same files
the app serves: regions.json, <region>/catalog.json + homes.bin, county_roofs/<region>/tiles.json + geom/*.json).
Never reads data/private or any owner field. Writes only under lib/st-data/.

Outputs
  catalog.json   regions (id, name, count, offset, box, tiles), storms (date, max_in, homes_1in, homes_075, per region), lsr hail reports per storm date
  homes.bin      Float32 lon,lat interleaved for every home in region order, then Uint8 type per home
  fp/<region>/<tr>_<tc>.bin  footprints: u32 n; per building u32 homeIndex(region-local) u16 sqft u8 nverts, nverts x (u16 dlon, u16 dlat) in 1e-6 deg from tile origin
"""
import json, os, struct, sys, time, gzip, glob
import numpy as np
SRC = r"C:/Users/wjack/roof-work/data"
RAW = r"C:/Users/wjack/roof-command-demo-ja/raw/enrich"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib", "st-data")
os.makedirs(OUT, exist_ok=True)
t0 = time.time()
regions = [r for r in json.load(open(os.path.join(SRC, "regions.json"))) if os.path.exists(os.path.join(SRC, r["path"].replace("data/", ""), "homes.bin"))]
lons, lats, types = [], [], []
cat = {"regions": [], "storms": [], "lsr": {}}
offset = 0
storms = {}
for r in regions:
    p = os.path.join(SRC, r["path"].replace("data/", ""))
    c = json.load(open(os.path.join(p, "catalog.json")))
    n = c["homes"]["count"]; b = c["box"]
    raw = open(os.path.join(p, "homes.bin"), "rb").read()
    lonq = np.frombuffer(raw, dtype=np.uint16, count=n, offset=0).astype(np.float64)
    latq = np.frombuffer(raw, dtype=np.uint16, count=n, offset=2 * n).astype(np.float64)
    typ = np.frombuffer(raw, dtype=np.uint8, count=n, offset=4 * n)
    lon = b["lon_min"] + lonq / 65535 * (b["lon_max"] - b["lon_min"])
    lat = b["lat_min"] + latq / 65535 * (b["lat_max"] - b["lat_min"])
    lons.append(lon.astype(np.float32)); lats.append(lat.astype(np.float32))
    tiles = []
    tp = os.path.join(SRC, "county_roofs", r["id"])
    # type byte: low 7 bits = app type (0 single family .. 4 residential, >4 non-residential); bit 7 = has a footprint on file
    typ = typ.copy()
    mb = os.path.join(tp, "measure.bin")
    if os.path.exists(mb):
        foot = np.frombuffer(open(mb, "rb").read(), dtype=np.uint16, count=n, offset=0)
        typ[foot > 0] |= 128
    types.append(typ)
    if os.path.exists(os.path.join(tp, "tiles.json")):
        od = os.path.join(OUT, "fp", r["id"]); os.makedirs(od, exist_ok=True)
        for tm in json.load(open(os.path.join(tp, "tiles.json"))):
            f = os.path.join(tp, "geom", tm["file"])
            if not os.path.exists(f): continue
            items = json.load(open(f))
            olon, olat = tm["tc"] * 0.05, tm["tr"] * 0.05
            parts = [struct.pack("<I", len(items))]
            kept = 0
            for e in items:
                ring = e["ring"]
                if len(ring) > 1 and ring[0] == ring[-1]: ring = ring[:-1]
                if len(ring) < 3 or len(ring) > 255: continue
                q = []
                ok = True
                for x, y in ring:
                    dx = int(round((x - olon) * 1e6)); dy = int(round((y - olat) * 1e6))
                    if not (0 <= dx <= 65535 and 0 <= dy <= 65535): ok = False; break
                    q += [dx, dy]
                if not ok: continue
                parts.append(struct.pack("<IHB", int(e["i"]), min(65535, int(e.get("sqft") or 0)), len(ring)))
                parts.append(struct.pack("<%dH" % len(q), *q))
                kept += 1
            parts[0] = struct.pack("<I", kept)
            name = "%d_%d.bin" % (tm["tr"], tm["tc"])
            open(os.path.join(od, name), "wb").write(b"".join(parts))
            tiles.append({"tr": tm["tr"], "tc": tm["tc"], "n": kept})
    cat["regions"].append({"id": r["id"], "name": r["name"], "count": n, "offset": offset, "box": b, "tiles": tiles,
                           "by_city": c["homes"].get("by_city_residential") or c["homes"].get("by_city")})
    for s in c["storms"]:
        d = storms.setdefault(s["date"], {"date": s["date"], "max_in": 0, "homes_1in": 0, "homes_075": 0, "homes_150": 0, "regions": {}})
        d["max_in"] = max(d["max_in"], s["max_in"]); d["homes_1in"] += s["homes_1in"]; d["homes_075"] += s["homes_075"]; d["homes_150"] += s.get("homes_150", 0)
        d["regions"][r["id"]] = {"homes_1in": s["homes_1in"], "homes_075": s["homes_075"], "max_in": s["max_in"]}
    offset += n
    print(r["id"], n, len(tiles), "tiles", round(time.time() - t0), "s", flush=True)
# combined storm list, newest first, only storms that put 1 inch hail on at least one home
cat["storms"] = sorted([s for s in storms.values() if s["homes_1in"] > 0], key=lambda s: s["date"], reverse=True)
# LSR hail reports: NWS local storm reports (public, no personal data). Key by MESH storm day (12Z to 12Z).
import datetime as dt
allbox = [min(r["box"]["lon_min"] for r in cat["regions"]), min(r["box"]["lat_min"] for r in cat["regions"]), max(r["box"]["lon_max"] for r in cat["regions"]), max(r["box"]["lat_max"] for r in cat["regions"])]
cat["box"] = allbox
days = {s["date"] for s in cat["storms"]}
seen = set()
for f in glob.glob(os.path.join(RAW, "lsr_*.json")):
    try: j = json.load(open(f))
    except Exception: continue
    feats = j.get("features") if isinstance(j, dict) else j
    for ft in feats or []:
        pr = ft.get("properties", {})
        if pr.get("type") != "H": continue
        try: mag = float(pr.get("magf") or pr.get("magnitude") or 0)
        except Exception: mag = 0
        if mag <= 0: continue
        lon, lat = pr.get("lon"), pr.get("lat")
        if lon is None or not (allbox[0] - 0.15 <= lon <= allbox[2] + 0.15 and allbox[1] - 0.15 <= lat <= allbox[3] + 0.15): continue
        v = dt.datetime.strptime(pr["valid"][:19], "%Y-%m-%dT%H:%M:%S")
        day = (v - dt.timedelta(hours=12)).strftime("%Y-%m-%d")
        if day not in days: continue
        k = (day, lon, lat, mag)
        if k in seen: continue
        seen.add(k)
        cat["lsr"].setdefault(day, []).append([round(lon, 3), round(lat, 3), mag])
cat["total"] = offset
cat["source"] = "roof-work/data mirror of Supabase bucket app-data (regions.json, catalog.json, homes.bin, county_roofs tiles)"
json.dump(cat, open(os.path.join(OUT, "catalog.json"), "w"), separators=(",", ":"))
xy = np.empty(offset * 2, dtype=np.float32); xy[0::2] = np.concatenate(lons); xy[1::2] = np.concatenate(lats)
with open(os.path.join(OUT, "homes.bin"), "wb") as fh:
    fh.write(xy.tobytes()); fh.write(np.concatenate(types).tobytes())
print("homes", offset, "storms", len(cat["storms"]), "lsr days", len(cat["lsr"]), "done", round(time.time() - t0), "s")
