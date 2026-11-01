# House page redesign (ui/house-record), 2026-11-01

Worktree: C:\Users\wjack\wing-outreach-house (cut from ui/wing-outreach-v2). Serve: python scripts/serve.py 4967 C:\Users\wjack\wing-outreach-house
Open: http://localhost:4967/tour/product.html#/crm/home/m5704
`tour/lib/st-data-dfw/private` is a junction to the main worktree's git-ignored owner data (not committed).

## Done
- New house page: tour/c5-home/house.js + house.css. Satellite photo (MapLibre + RCIMG Esri/NAIP tiles, capture date shown) is the hero.
  Facts: built year + age, living area, last re-roof (no permit = "Unknown"), owner lives here (Unknown unless the owner roll says),
  county + CAD property ID, subdivision, owner initials, stage buttons + history, radar hail on every storm with dates and sizes.
- Removed: 3D roof (home.js no longer loaded, three.js warm-up gone), the stage/measurement/materials tabs hidden from view,
  Squares / Pitch / Roof shape rows in the inbox side panel, roof squares in text/email drafts (crm.js passes squares: null).
- Screenshots: .visual/house/

## Next / open
- /visual three-direction exploration was skipped (laptop at 0.7 GB free RAM); one direction built.
- Old record DOM (.rh, main.main) is hidden, not deleted: rec.js still owns Text/Email/Book dialogs through it.
- No appraised value exists in the data, so none is shown.
