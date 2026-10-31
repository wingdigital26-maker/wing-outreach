"""Ask Nimbus: the hardest-hit streets of the showcase storm, from the app's own per-home radar hail.

Reads (all read-only copies under lib/st-data): catalog.json + homes.bin (positions, home type),
meta/hail/<region>/<date>.bin (radar hail per home, 1/100 in), meta/<region>/homes_meta.bin + streets.json +
cities.json (county address). Ranks streets by residential homes at 1 inch or larger. No owner names.
Writes c2-nimbus/streets-real.json (Oklahoma, default) or, with args, another roofer's data:
  python build_streets_real.py dfw   -> lib/st-data-dfw, its catalog.default_storm (Jun 2, 2026), streets-real-dfw.json
  {date, homes, max, bbox, hits: [[lon, lat, hail], ...],
   streets: [{name, city, county, homes, max, mid: [lon, lat], list: [{i, addr, lon, lat, hail}, ...]}, ...]}
"""
import json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
import sys
VARIANT = sys.argv[1] if len(sys.argv) > 1 else ""
D = os.path.join(HERE, "..", "lib", "st-data-" + VARIANT if VARIANT else "st-data")
DATE = json.load(open(os.path.join(D, "catalog.json")))["default_storm"]["date"] if VARIANT else "2026-09-12"
OUT = "streets-real-%s.json" % VARIANT if VARIANT else "streets-real.json"
ABBR = {"Avenue": "Ave", "Street": "St", "Drive": "Dr", "Lane": "Ln", "Boulevard": "Blvd", "Court": "Ct", "Parkway": "Pkwy", "Terrace": "Ter", "Road": "Rd", "Place": "Pl", "Circle": "Cir"}


def street_name(raw, city):
    s = raw.strip()
    if city and s.endswith(" " + city): s = s[: -len(city) - 1]
    s = re.sub(r"\b(\d+)(St|Nd|Rd|Th)\b", lambda m: m.group(1) + m.group(2).lower(), s)
    s = re.sub(r"\b(Nw|Ne|Sw|Se)\b", lambda m: m.group(1).upper(), s)
    return re.sub(r"\b(" + "|".join(ABBR) + r")\b", lambda m: ABBR[m.group(1)], s)


def main():
    cat = json.load(open(os.path.join(D, "catalog.json"))); N = cat["total"]
    raw = open(os.path.join(D, "homes.bin"), "rb").read()
    xy = np.frombuffer(raw, np.float32, N * 2, 0).reshape(-1, 2); typ = np.frombuffer(raw, np.uint8, N, N * 8)
    storm = next(s for s in cat["storms"] if s["date"] == DATE)
    hits, groups = [], {}
    for r in cat["regions"]:
        if r["id"] not in storm["regions"]: continue
        if not os.path.exists(os.path.join(D, "meta", "hail", r["id"], DATE + ".bin")): continue
        n, off = r["count"], r["offset"]
        h = np.frombuffer(open(os.path.join(D, "meta", "hail", r["id"], DATE + ".bin"), "rb").read(), np.uint8)
        b = open(os.path.join(D, "meta", r["id"], "homes_meta.bin"), "rb").read()
        no = np.frombuffer(b, np.uint16, n, 6 * n); sid = np.frombuffer(b, np.uint16, n, 8 * n); cid = np.frombuffer(b, np.uint16, n, 14 * n)
        streets = json.load(open(os.path.join(D, "meta", r["id"], "streets.json"))); cities = json.load(open(os.path.join(D, "meta", r["id"], "cities.json")))
        for j in np.nonzero((h >= 100) & ((typ[off:off + n] & 127) <= 4))[0]:
            i = off + int(j); lon, lat = float(xy[i, 0]), float(xy[i, 1]); hv = int(h[j]) / 100
            hits.append([round(lon, 6), round(lat, 6), hv])
            city = cities[cid[j]] if cid[j] < len(cities) else ""
            nm = street_name(streets[sid[j]], city) if sid[j] < len(streets) else ""
            if not nm: continue
            g = groups.setdefault((r["id"], nm, city), {"name": nm, "city": city, "county": r["name"], "list": []})
            g["list"].append({"i": i, "addr": f"{int(no[j])} {nm}" if no[j] else nm, "lon": round(lon, 6), "lat": round(lat, 6), "hail": hv})
    top = sorted(groups.values(), key=lambda g: (-len(g["list"]), -max(x["hail"] for x in g["list"])))[:5]
    for g in top:
        g["homes"] = len(g["list"]); g["max"] = max(x["hail"] for x in g["list"])
        g["mid"] = [round(sum(x["lon"] for x in g["list"]) / g["homes"], 6), round(sum(x["lat"] for x in g["list"]) / g["homes"], 6)]
        g["list"].sort(key=lambda x: -x["hail"])
    a = np.array([[p[0], p[1]] for p in hits])
    lo, hi = np.percentile(a, 3, axis=0), np.percentile(a, 97, axis=0)
    out = {"date": DATE, "homes": len(hits), "max": max(p[2] for p in hits), "bbox": [round(float(lo[0]), 5), round(float(lo[1]), 5), round(float(hi[0]), 5), round(float(hi[1]), 5)], "hits": hits, "streets": top}
    json.dump(out, open(os.path.join(HERE, OUT), "w"), separators=(",", ":"))
    print(out["homes"], "hit homes; top streets:", [(g["name"], g["city"], g["homes"], g["max"]) for g in top])


if __name__ == "__main__":
    main()
