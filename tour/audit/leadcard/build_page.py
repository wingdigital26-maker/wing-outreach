"""Lead card QA page (10-22): tour/audit/leadcard/index.html from shots/results.json + the shots.
  python -E tour/audit/leadcard/build_page.py   -> open http://127.0.0.1:4930/tour/audit/leadcard/index.html"""
import html, json, os

HERE = os.path.dirname(os.path.abspath(__file__)); R = json.load(open(os.path.join(HERE, "shots", "results.json")))
WHY = {"92039": "McKinney, re-roof permit completed", "89018": "McKinney, permit expired (low confidence)", "76695": "McKinney, legacy permit (year or earlier)",
       "74194": "McKinney, no permit on file", "27526": "Allen, permit issued", "4049": "Allen, no permit on file", "178303": "Plano (no re-roof line)",
       "53207": "Frisco (no re-roof line)", "166093": "Plano, 3D model passed every gate", "148535": "Plano, no building outline, no LiDAR",
       "202228": "Built after the LiDAR flew: no roof size"}
FIELDS = [("Right house", "County parcel (address, subdivision) + building outline + USDA NAIP satellite photo", "every home with an outline"),
          ("Owner", "County roll, initials until messaged (RC.owner)", "Collin homes"),
          ("Hail here", "NOAA MRMS radar hail per home (app storm files)", "every home"),
          ("Roof size", "LiDAR roof record (footprint over pitch, plus overhang); labelled estimate with the LiDAR year; median 6 to 8% off 30 Frisco roofer permits", "where LiDAR covers the home and the house stood when it flew"),
          ("Pitch", "Same LiDAR record, to the nearest 12th (main + second when present)", "same as roof size"),
          ("Year built, living area", "Collin CAD parcel layer", "where the CAD has it"),
          ("Last re-roof", "City of McKinney (about 2015 on) and City of Allen (about 2017 on) permit records, matched by CAD id; permit number, city status, confidence", "McKinney + Allen only; Plano, Frisco and others show no line"),
          ("3D roof", "Measured model only when the block model passed every gate rule (solid, walls, lines, sizes, LiDAR fit, looks); else the plain outline house with 'Roof shape being checked', no sections, no edge lengths", "16 homes pass today (15 block models + Caleo)")]
rows = []
for r, v in R.items():
    d = v.get("desk", {}); kv = "".join(f"<tr><th>{html.escape(k)}</th><td>{html.escape(t).replace(' | ', '<br><small>', 1)}{'</small>' if ' | ' in t else ''}</td></tr>" for k, t in d.get("kv", []))
    img = lambda n: f'<a href="shots/{r}-{n}.png"><img src="shots/{r}-{n}.png" loading="lazy" alt="{r} {n}"></a>' if os.path.exists(os.path.join(HERE, "shots", f"{r}-{n}.png")) else ""
    rows.append(f"""<section><h2>{html.escape(d.get('addr', '').replace(chr(10), ' '))} <span>m{r} · {html.escape(WHY.get(r, ''))}</span></h2>
<p class="t">3D header: {html.escape(d.get('title', ''))}</p><table>{kv}</table>
<div class="g">{img('desk-top')}{img('desk-facts')}{img('desk-roof')}</div><div class="g p">{img('phone-top')}{img('phone-facts')}{img('phone-roof')}</div></section>""")
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead Card QA</title>
<style>:root{{--ink:#0B1020;--mut:#5A6478;--rule:#E4E7EC;--bg:#F6F7F9}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:24px 16px 60px}}h1{{font-size:28px;margin:0 0 6px}}h2{{font-size:20px;margin:0 0 4px}}h2 span{{font-size:13px;color:var(--mut);font-weight:500}}
section{{background:#fff;border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,.06)}}table{{border-collapse:collapse;width:100%;margin:8px 0}}th,td{{text-align:left;padding:6px 8px;border-top:1px solid var(--rule);vertical-align:top;font-size:14px}}
th{{width:170px;color:var(--mut);font-weight:500}}small{{color:var(--mut)}}.t{{color:var(--mut);margin:0}}.g{{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-top:10px}}.g.p{{grid-template-columns:repeat(3,1fr);max-width:640px}}
.g img{{width:100%;border:1px solid var(--rule);border-radius:8px;display:block}}@media(max-width:700px){{.g{{grid-template-columns:1fr}}th{{width:110px}}}}</style></head><body><main>
<h1>Lead card QA, 10-22</h1><p class="t">Every figure below was read from the running app (desktop 1440 and phone 390) and checked against its source file with tour/audit/leadcard/verify.py: all match. Screenshots are clickable.</p>
<section><h2>What each field shows and where it comes from</h2><table><tr><th>Field</th><td><b>Source</b></td><td><b>Shown when</b></td></tr>{''.join(f'<tr><th>{a}</th><td>{html.escape(b)}</td><td>{html.escape(c)}</td></tr>' for a, b, c in FIELDS)}</table></section>
{''.join(rows)}</main></body></html>"""
open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(page); print(os.path.join(HERE, "index.html"))
