"""RC.copy check: every outreach template, rendered for several homes, obeys the copy rules.
Run: python tour/audit/_copy_check.py   (needs node on PATH; no browser, no server)
Asserts: no em or en dashes, texts <= 300 chars and plain ASCII, every cold text names the roofer and the rep,
no links in cold texts, every opt-in text has STOP language, emails carry the address + unsubscribe line
(cold ones also say they are marketing), banned phrases never appear, "near <street>" only when the home is on
a real route, storm dates carry the year only when it is not this year, and next() blocks what it must."""
import json, pathlib, re, subprocess, sys

LIB = pathlib.Path(__file__).resolve().parent.parent / "lib" / "rc-copy.js"

BASE = {"id": "h1", "street": "3704 Morning Dove Dr", "city": "Plano", "zip": "75025", "stormISO": "2025-08-12",
        "hail": 1.09, "roofYear": 1998, "permit": None, "squares": 54.5, "pitch": 10, "rep": "Chris",
        "roofer": "Jackson Roofing", "rooferCity": "Plano", "phone": "(469) 323-4626", "now": "2026-10-09T12:00:00"}
HOMES = {
    "example": {},
    "named_on_route": {"first": "Dana", "onRoute": True, "mailingAddress": "123 Example St, Plano, TX 75074"},
    "this_year_in_season": {"stormISO": "2026-06-02", "now": "2026-04-15T12:00:00"},
    "thin_facts": {"hail": None, "squares": None, "roofYear": None, "pitch": None},
    "permit_on_file": {"permit": 2012, "hail": 2.0},
    "past_customer": {"source": "past", "pastJobYear": 2019, "first": "Robert Lee"},
    "long_everything": {"first": "Bartholomew", "street": "12345 Prairie Meadow Crossing Ln", "roofer": "Northeast Collin Roofing and Restoration",
                        "rooferCity": "McKinney", "rep": "Alexandria", "hail": 1.76, "onRoute": True, "pitch": 12, "squares": 112.4},
}

NODE = r"""
const C = require(process.argv[1]); const homes = JSON.parse(process.argv[2]); const out = [];
for (const [name, h] of Object.entries(homes)) {
  const f = Object.assign({}, h, { now: new Date(h.now) });
  for (const id of Object.keys(C.templates)) out.push(Object.assign({ home: name, onRoute: !!h.onRoute }, C.render(id, f)));
}
const f = Object.assign({}, homes.example, { now: new Date(homes.example.now) });
const nx = {
  past_text: C.next(Object.assign({ source: 'past' }, f), 0, 'optin', 'text'),
  past_text_alias: C.next(f, 0, 'past', 'text'),
  past_text_ok: C.next(Object.assign({ source: 'past', textConsent: true }, f), 0, 'optin', 'text'),
  opted_out: C.next(Object.assign({ optedOut: true }, f), 1, 'cold', 'text'),
  step5: C.next(f, 5, 'cold', 'email'),
  step4: C.next(f, 4, 'optin', 'text'),
  by_id: (C.factsFor = id => id === 'h1' ? f : null, C.next('h1', 0, 'cold', 'text')),
  unknown_id: C.next('nope', 0, 'cold', 'text'),
};
console.log(JSON.stringify({ out, nx, cadence: C.cadence }));
"""

BANNED = ["deductible", "guarantee", "free roof", "act now", "damage confirmed", "damaged", "insurance", "claim",
          "limited time", "hurry", "before it's too late", "neighborhood", "in your area", "seamless", "peace of mind"]
URL = re.compile(r"https?://|www\.|\.(com|net|org|us)\b", re.I)

def main():
    r = subprocess.run(["node", "-e", NODE, str(LIB), json.dumps({k: {**BASE, **v} for k, v in HOMES.items()})],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        print(r.stderr); sys.exit(1)
    data = json.loads(r.stdout); out, nx = data["out"], data["nx"]
    fails = []
    def bad(m, why): fails.append(f"{m['home']} {m.get('id')}: {why}")
    for m in out:
        full = (m.get("subject") or "") + "\n" + m["body"]
        home = {**BASE, **HOMES[m["home"]]}
        if "—" in full or "–" in full: bad(m, "em/en dash")
        low = full.lower()
        for b in BANNED:
            if b in low: bad(m, f"banned phrase '{b}'")
        if "near " in low and "inspections near" in low and not m["onRoute"]: bad(m, "route line without a route")
        if m["channel"] == "text":
            if m["chars"] > 300: bad(m, f"text is {m['chars']} chars")
            if any(ord(c) > 126 for c in m["body"]): bad(m, "non-ASCII character in a text")
            if m["kind"] != "reply" and m["audience"] == "cold":
                if home["roofer"] not in m["body"] or home["rep"] not in m["body"]: bad(m, "cold text does not name roofer + rep")
                if URL.search(m["body"]): bad(m, "link in a cold text")
                if "STOP" not in m["body"]: bad(m, "cold text has no STOP line")
            if m["kind"] != "reply" and m["audience"] == "optin" and "STOP" not in m["body"]: bad(m, "opt-in text has no STOP language")
        else:
            if m["kind"] != "reply":
                if 'reply "unsubscribe"' not in m["body"]: bad(m, "email has no unsubscribe line")
                if home["roofer"] + ", " not in m["body"].split("\n\n")[-1]: bad(m, "email footer has no roofer + address")
                if m["audience"] == "cold" and "marketing email" not in m["body"]: bad(m, "cold email not marked as marketing")
                if not home.get("mailingAddress") and not m.get("blocked"): bad(m, "email with no mailing address is not blocked")
                if home.get("mailingAddress") and home["mailingAddress"] not in m["body"]: bad(m, "mailing address missing")
        # storm dates: the year shows only when it is not this year
        if m["home"] == "example" and "Aug 12" in full and "Aug 12, 2025" not in full: bad(m, "old storm without its year")
        if m["home"] == "this_year_in_season" and "Jun 2, 2026" in full: bad(m, "this year's storm shows its year")
        if m["home"] == "thin_facts" and re.search(r"None(?! of)|undefined|null|NaN", full): bad(m, "missing fact leaked")
    if not any("Hail season" in m["body"] for m in out if m["home"] == "this_year_in_season"): fails.append("season line never shows in April")
    if any("Hail season" in m["body"] for m in out if m["home"] == "example"): fails.append("season line shows in October")
    if any("inspections near" in m["body"] for m in out if not m["onRoute"]): fails.append("route line on a home not on a route")
    # next()
    if "blocked" not in nx["past_text"] or "blocked" not in nx["past_text_alias"]: fails.append("past customer text without consent was not blocked")
    if nx["past_text_ok"].get("blocked") or "Thanks for checking" in nx["past_text_ok"]["body"]: fails.append("past customer with consent gets the wrong text")
    if nx["opted_out"].get("blocked") != "opted out": fails.append("opted-out home was not blocked")
    if nx["step5"]["id"] != "cold.email.checkin_b" or nx["step5"]["day"] != 90: fails.append(f"step 5 maps wrong: {nx['step5']}")
    if nx["step4"]["id"] != "optin.text.checkin_a" or nx["step4"]["day"] != 60: fails.append(f"step 4 maps wrong: {nx['step4']}")
    if nx["by_id"].get("id") != "cold.text.d1": fails.append("next() by home id failed")
    if "blocked" not in nx["unknown_id"]: fails.append("unknown home id not blocked")
    print(f"{len(out)} renders over {len(HOMES)} homes, cadence " + ", ".join(f"step {c['step']}=day {c['day']} {c['key']}" for c in data["cadence"]))
    if fails:
        print("FAIL"); [print(" -", f) for f in fails]; sys.exit(1)
    print("PASS")

if __name__ == "__main__":
    main()
