"""Print every lead-card figure for a few homes straight from its source file, to check the app against (lead card QA 10-22).
  python -E tour/audit/leadcard/verify.py 92039 89018 ...      (collin-tx rows; the app opens them as #/crm/home/m<row>)
Sources: CAD year built / living sq ft (meta/collin-tx/homes_meta.bin + homes_ext.bin), the LiDAR roof record
(meta/roof/collin-tx/tile_*.json: squares, pitch, pitch2, lidar year), the McKinney/Allen re-roof table (the research CSV and
meta/reroof-ma.json), the 3D gate (lib/roof-blocks/<region>/<row>.json gate.rules)."""
import csv, glob, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__)); LIB = os.path.join(HERE, "..", "..", "lib"); D = os.path.join(LIB, "st-data-dfw")
CSV = "C:/Users/wjack/deep-research/roof-3d-reconstruction/permits/roof_dates_mckinney_allen.csv"
cat = json.load(open(os.path.join(D, "catalog.json"))); n = cat["regions"][0]["count"]
meta = open(os.path.join(D, "meta/collin-tx/homes_meta.bin"), "rb").read(); ext = open(os.path.join(D, "meta/collin-tx/homes_ext.bin"), "rb").read()
cities = json.load(open(os.path.join(D, "meta/collin-tx/cities.json"))); streets = json.load(open(os.path.join(D, "meta/collin-tx/streets.json")))
yr = struct.unpack_from(f"<{n}H", meta, 0); no = struct.unpack_from(f"<{n}H", meta, n * 6); sid = struct.unpack_from(f"<{n}H", meta, n * 8)
cid = struct.unpack_from(f"<{n}H", meta, n * 14); sqft = struct.unpack_from(f"<{n}H", ext, n * 2); cad = struct.unpack_from(f"<{n}I", ext, n * 4)
rows = [int(x) for x in sys.argv[1:]]; want = set(rows)
roof = {}
for f in glob.glob(os.path.join(D, "meta/roof/collin-tx/*.json")):
    for k, a in json.load(open(f)).items():
        if int(k) in want: roof[int(k)] = a
byprop = {r["prop_id"]: r for r in csv.DictReader(open(CSV, encoding="utf-8"))}
ma = json.load(open(os.path.join(D, "meta/reroof-ma.json")))
for j in rows:
    a = roof.get(j); b = os.path.join(LIB, "roof-blocks", "collin-tx", f"{j}.json")
    g = json.load(open(b)).get("gate") if os.path.exists(b) else None
    c = byprop.get(str(cad[j]))
    print(f"m{j}  {no[j]} {streets[sid[j]]}, {cities[cid[j]]}  CAD id {cad[j]}")
    print(f"   CAD: year built {yr[j] or '-'}, living {sqft[j] or '-'} sq ft")
    print(f"   LiDAR roof: " + (f"{a[1]} sq, pitch {a[3]}/12 + {a[4]}/12, lidar {a[15]}, measured flag {a[0]}" if a else "no record"))
    print(f"   re-roof CSV: " + (f"{c['last_reroof_year_month'] or c['last_reroof_year']} {c['last_permit']} {c['last_permit_status']} conf {c['confidence']} (CSV year built {c['year_built']}, sqft {c['living_sqft']})" if c else "no row") + f"   app file: {ma['rows'].get(str(j))}")
    print(f"   3D gate: " + (json.dumps({k: g.get(k) for k in ('pass', 'checking', 'rules')}) if g else "no block model -> outline house, roof shape being checked"))
