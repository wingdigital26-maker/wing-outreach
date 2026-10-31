"""Visual check 10-23 page: tour/audit/visual-check-1023/index.html from before/ + after/ shots, walk.json and the lists below.
  python -E tour/audit/visual-check-1023/build_page.py   -> http://127.0.0.1:4930/tour/audit/visual-check-1023/index.html"""
import html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
E = html.escape
SCREENS = [
    ("today", "Today", "Up next list, greeting with the how-we-help line, home card with Text | Email | Proof | Skip, messages map"),
    ("radar", "Today: Radar tab", "Streets re-roofing now, 'See every re-roof on the Storms map' link"),
    ("radar-street", "Today: Radar street opened", "A street's homes listed under it"),
    ("storms", "Storms map", "Satellite | 3D houses switch, storm timeline (headless swiftshader, so tiles may be plain)"),
    ("inbox", "CRM: Inbox", "Thread, composer, home panel"),
    ("pipeline", "CRM: Pipeline", "Board with stage totals"),
    ("calendar", "CRM: Calendar", "Week (desktop) and Day (phone)"),
    ("record", "Home record (8620 Tuscan Oaks Dr)", "Key facts row with blurred owner, house age, last hail, last re-roof, squares note; 3D roof; Home facts; hail"),
    ("measure", "Home record: LiDAR measurements", "Roof edges over the aerial photo"),
    ("proposal", "Proposal", "Pricing inputs and the printable proposal"),
    ("hailreport", "Homeowner hail report", "Printable storm history"),
    ("proofpage", "Homeowner Proof Page (preview)", "tour/proof/?h=3ixhzvx&preview=1, records nothing"),
    ("nimbus", "Nimbus (Ask panel)", "Orb panel with the question chips"),
]
FIXED = [
    ("Today card", "Squares chip used its own short wording ('~44 sq, LiDAR ~10% est., order a report before quoting') and rounded to whole squares while the CRM, record and Proof Page say 43.5.",
     "Chip now reads the standard note: '~43.5 sq, LiDAR estimate, typically within about 10% of permit records; order a measurement report before you quote', one decimal like everywhere else, wraps inside the photo on desktop.",
     "c4-command-deck/dk.js, deck.html"),
    ("Today card, phone", "The 3-line squares chip covered the 3D house; Email and Proof labels touched their button edges.",
     "Phone chip shows '~43.5 sq, LiDAR estimate' only (the full note is on the record's key facts, Home facts and LiDAR tab); buttons get 6px gaps and slightly smaller text so all four fit at 390px.",
     "deck.html"),
    ("Today greeting", "The how-we-help line jumped between above and below the stats line depending on which loaded first.",
     "Always directly under 'Good evening, Chris.', stats line below it.", "deck.html"),
    ("Today greeting, phone", "The stats line wrapped with a stray dot starting the second line ('· newest storm Jun 2').",
     "Wrapped lines never start with a dot (each fact carries its dot, the line's left edge is clipped).", "c4-command-deck/features.css"),
    ("Header search (every screen)", "Placeholder was cut off at 1440: 'Search address, street, ZIP or'.",
     "'Search address, ZIP or owner' (the tooltip and screen-reader label still list street, subdivision and city).", "lib/rc-find.js"),
    ("Toast", "'Messages · Messages go out until 8 pm.'", "'Sending hours · Messages go out until 8 pm.'", "lib/nimbus-shell.js"),
    ("Pipeline", "Stage total showed a decimal sum: '~2,843.3 sq (est.)'.", "Whole squares: '~2,843 sq (est.)'.", "c5-home/pipe.js"),
    ("Calendar, phone", "Said 'Click an open hour to book' on a touch screen.", "'Tap ...' on touch screens, 'Click ...' with a mouse.", "c5-home/cal.js"),
    ("Home record key facts", "The Roof size card held the full squares note in a card the same width as the others: 8 lines tall, every card stretched to match with empty space.",
     "Roof size card is wider (2.4x), the note wraps to about 3 lines and the row is a third of the height; full-width card on phone.", "c5-home/rec.js, home.css"),
    ("LiDAR measurements tab", "Header and aerial photo sat flush against the card edge (no inset), unlike every other tab.",
     "Same 24px inset as Measurements and Materials (16px on phone).", "c5-home/home.css"),
    ("Hail report", "Desktop: the 'Every storm on file' table was squeezed into a third of the width by the roof table's long permit line, so dates wrapped ('Jun 2, / 2026'). Phone: chart labels clipped to \"Mar '\" and \"Sep '\".",
     "Two even columns with wrapping lines; phone labels show in full (every other one, as before).", "c5-home/hail-report.html"),
    ("Nimbus panel", "Chat text and chips sat 8px from the panel edge (a desktop -8px bleed carried into the panel layout).",
     "16px inset like the rest of the sheet.", "c2-nimbus/index.html"),
]
LEFT = [
    ("High", "Proposal: the Texas Property Code 53.255 disclosure is a visible yellow '[Placeholder: the roofer inserts the required disclosure statement here...]' on the printable proposal.",
     "Legal wording decision (Jackson's lawyer or the statute text). Not changed: wrong legal text is worse than a visible placeholder."),
    ("Medium", "LiDAR measurements photo (USDA NAIP) is very pixelated at house zoom.",
     "Needs the Esri World Imagery key (Jack to create; free tier allows commercial use with the key)."),
    ("Medium", "Desktop Storms takes about 52 s to fill in the software-rendered headless browser (every request slow alike); phone fills in under 15 s.",
     "Not a loading-order bug (fix2/storm_probe.py). One look in a real desktop browser to confirm."),
    ("Low", "Pipeline stage 'Sent to Chris' / 'Handed to Chris' uses the rep's first name as a stage.", "Naming call."),
]


FIXED2 = [
    ("Proof Page hail card", "Led with '1.03 in hail on May 27, 2024' and then said 'The biggest on file here was 1.38 in on May 22, 2024', which read as a contradiction.",
     "'Most recent 1 in+ hail' over the big number, then 'Biggest on file: May 22, 2024, 1.38 in' on its own line.", "proof/proof.js, proof.css"),
    ("Today Radar tab speed", "Phone: sat on 'Loading the re-roof permits...' about 8 s after the tap. turnover.json (306 KB) was fetched twice: by the tidbits at startup and again by Radar only after the tap, on a busy page.",
     "build_turnover.py also writes meta/turnover-streets.json (no per-home rows, no map dots, 120 KB). The tidbits fetch it once at startup and Radar reuses it; the full file loads only for the map dots. Phone list now 2.4 s after the tap (headless; mostly drawing time). Proof Page, Storms dots and the Daily 50 still read turnover.json.",
     "scripts/permits/build_turnover.py, lib/rc-tips.js, c4-command-deck/radar.js"),
    ("Storms 'Hit hardest' panel", "British spelling in US copy: 'neighbourhoods', 'No neighbourhood took...'; also 'Neighbours reroofing' in Nimbus and 'The neighbour angle' on a Proof template note.",
     "'neighborhoods', 'Neighbors re-roofing', 'The neighbor angle'.", "lib/st-hard.js, rc-ask.js, rc-proof.js"),
    ("Today photo chip", "A red square in front of the squares note that no longer meant anything.", "Gone.", "c4-command-deck/deck.html"),
    ("Pipeline on phone", "Stage grid cut 'Inspection booked' to 'Inspection bo...'.", "Labels wrap to two lines.", "c5-home/home.css"),
    ("Home record Roof box", "Two cells in a three-column grid: '8/12 + / 6/12' and '~54.2 est., / 2020 LiDAR' wrapped beside an empty third column.",
     "One column per cell; '~54.2 est. (2020 LiDAR)' and '8/12 + 6/12' on one line each.", "c5-home/home.css, home.js"),
    ("Console error on every screen", "The app checks a local sending server at 127.0.0.1:4911.", "Left as is: it only runs on localhost and stops after two misses, so the live site never logs it.", "lib/nb-react.js (no change)"),
]


FIXED3 = [
    ("Home record sticky bar, phone", "'Add phone' took the bar's 54px button style, so the bar (reason line, Add phone, 4 buttons) covered about a fifth of the screen.",
     "'Add phone' is the small pill on the reason line again; buttons 48px. The bar is about half as tall.", "c5-home/home.css"),
    ("Today 3D house, phone", "The house had a 220 x 58 slot partly under the squares chip, so it showed as a sliver.",
     "Chip '~43.5 sq est.' moves to the top row beside 'Home 1 of 50'; the house gets the middle of the strip (248 x 81) with nothing over it; the card tidbit is one line (tap shows it all with its source).", "c4-command-deck/deck.html, dk.js"),
    ("Today map after a Radar street", "The map flew to the street and showed only a stray spoke from the office.",
     "The street's homes to knock show as ringed dots (orange dots are the re-roofs); hidden when the street closes or the tab changes.", "c4-command-deck/radar.js"),
    ("Nimbus panel", "An empty grey band (6% of the map) above the chat sheet.", "The full sheet fills the panel; dragging down still shows the map.", "c2-nimbus/index.html"),
    ("Storms timeline", "The tallest storm tick ran up through 'Storms, past 6 months'.", "Ticks are scaled to the room under the title; their heights keep their ratio.", "1b-storm-theater.html"),
]


def shots(d, name, sz):
    R = json.load(open(os.path.join(HERE, d, "walk.json"), encoding="utf8")) if os.path.exists(os.path.join(HERE, d, "walk.json")) else {}
    r = R.get(f"{name}-{sz}", {})
    return [s for s in r.get("shots", []) if os.path.exists(os.path.join(HERE, d, s))], r


def col(d, label, name, sz):
    ss, r = shots(d, name, sz)
    errs = [e for e in (r.get("errors") or []) if "ERR_CONNECTION_REFUSED" not in e and "ERR_NETWORK_CHANGED" not in e]
    imgs = "".join(f'<a href="{d}/{s}" target="_blank"><img loading="lazy" src="{d}/{s}" alt="{E(label)} {E(name)} {sz}"></a>' for s in ss[:2]) or '<p class="none">No shot (the screenshot timed out on the slow laptop).</p>'
    more = f'<p class="meta">{len(ss)} shots{", errors: " + E("; ".join(errs[:2])) if errs else ", no console errors (besides the :4911 sending check)"}</p>' if ss else ""
    return f'<div class="col"><h4>{label}</h4>{imgs}{more}</div>'


def main():
    secs = []
    for name, title, what in SCREENS:
        rows = "".join(f'<div class="pair"><h3>{"Desktop 1440" if sz == "desk" else "Phone 390"}</h3><div class="cols">{col("before", "Before", name, sz)}{col("after", "After 10-23", name, sz)}{col("after2", "After fixes 10-24", name, sz) if shots("after2", name, sz)[0] else ""}{col("after3", "After polish 10-24", name, sz) if shots("after3", name, sz)[0] else ""}</div></div>' for sz in ("desk", "phone"))
        secs.append(f'<section id="{name}"><h2>{E(title)}</h2><p class="what">{E(what)}</p>{rows}</section>')
    fixed = "".join(f"<tr><td>{E(a)}</td><td>{E(b)}</td><td>{E(c)}</td><td><code>{E(d)}</code></td></tr>" for a, b, c, d in FIXED)
    fixed2 = "".join(f"<tr><td>{E(a)}</td><td>{E(b)}</td><td>{E(c)}</td><td><code>{E(d)}</code></td></tr>" for a, b, c, d in FIXED2)
    fixed3 = "".join(f"<tr><td>{E(a)}</td><td>{E(b)}</td><td>{E(c)}</td><td><code>{E(d)}</code></td></tr>" for a, b, c, d in FIXED3)
    left = "".join(f'<tr><td><span class="pri {p.lower()}">{p}</span></td><td>{E(a)}</td><td>{E(b)}</td></tr>' for p, a, b in LEFT)
    nav = " ".join(f'<a href="#{n}">{E(t)}</a>' for n, t, _ in SCREENS)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual check, Oct 23</title><meta name="robots" content="noindex">
<style>
:root{{--ink:#0B1020;--muted:#5A6478;--rule:#E3E6EC;--bg:#F4F5F8;--panel:#fff;--accent:#0E6E9E}}
*{{box-sizing:border-box}}body{{margin:0;font:15px/1.5 Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg)}}
.wrap{{max-width:1200px;margin:0 auto;padding:28px 16px 60px}}h1{{font-size:30px;margin:0 0 6px}}h2{{font-size:21px;margin:0 0 2px}}
.lead{{color:var(--muted);max-width:760px}}nav{{display:flex;flex-wrap:wrap;gap:6px 14px;margin:14px 0 22px;font-size:13.5px}}a{{color:var(--accent)}}
table{{width:100%;border-collapse:collapse;background:var(--panel);border-radius:10px;overflow:hidden;margin:10px 0 28px;font-size:13.5px}}
td,th{{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--rule)}}th{{font-size:12px;color:var(--muted)}}
code{{font-size:12px;color:var(--muted)}}.pri{{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px}}
.high{{background:#FDE8E8;color:#9B1C1C}}.medium{{background:#FFF4D6;color:#7A5300}}.low{{background:#EEF1F5;color:#465065}}
section{{background:var(--panel);border-radius:12px;padding:18px;margin:0 0 18px}}.what{{color:var(--muted);margin:0 0 10px;font-size:13.5px}}
.pair h3{{font-size:13px;color:var(--muted);margin:12px 0 6px}}.cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}}
.col h4{{margin:0 0 4px;font-size:13px}}.col img{{width:100%;border:1px solid var(--rule);border-radius:6px;display:block;margin-bottom:6px}}
.meta,.none{{font-size:12px;color:var(--muted);margin:0}}
@media (max-width:640px){{.cols{{grid-template-columns:1fr}}table{{font-size:12.5px}}td,th{{padding:7px 6px}}}}
</style></head><body><div class="wrap">
<h1>Visual check, Oct 23</h1>
<p class="lead">Every screen clicked through like a rep and like the owner at desktop (1440) and phone (390), screenshotted, proofread for em dashes, placeholders and wording, and checked for sideways scroll and console errors. Clear layout and wording problems were fixed in small commits; product and legal calls are listed, not changed. App: <a href="../../product.html?dev=1&nointro=1&noprefetch=1&cloud=0">open the app</a>.</p>
<p class="lead">No sideways scroll on any screen at either width. No em dashes, 'undefined' or 'NaN' found in any screen's text. The squares note reads the standard wording on the record, Home facts, LiDAR tab and (now) the Today card.</p>
<h2>Fixed ({len(FIXED)})</h2>
<table><tr><th>Where</th><th>Before</th><th>After</th><th>File</th></tr>{fixed}</table>
<h2>Follow-up fixes, Oct 24 ({len(FIXED2)})</h2>
<table><tr><th>Where</th><th>Before</th><th>After</th><th>File</th></tr>{fixed2}</table>
<h2>UI polish, Oct 24 ({len(FIXED3)})</h2>
<table><tr><th>Where</th><th>Before</th><th>After</th><th>File</th></tr>{fixed3}</table>
<h2>Left for Jack, by impact ({len(LEFT)})</h2>
<table><tr><th></th><th>What</th><th>Why it was not changed</th></tr>{left}</table>
<h2>Every screen, before and after</h2>
<nav>{nav}</nav>
{''.join(secs)}
<p class="meta">Shots: headless Chromium (swiftshader), one browser at a time, tour/audit/visual-check-1023/shoot.py. Before shots taken during the check; a few 'before' shots taken after the first fixes landed show the new search wording. Storms map tiles render plain in headless.</p>
</div></body></html>"""
    open(os.path.join(HERE, "index.html"), "w", encoding="utf8").write(page)
    print("wrote index.html")


main()
