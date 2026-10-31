# Roof Command 3D roofs: where we are (10-20), both chats combined

One page to start the next roof chat from. Two chats worked on this: the BUILD chat (code, runs, scorecard, this repo) and the
DEEPDIVE chat (research, Jack's side-by-side page, review of every picture). This file merges both.
Repo: C:/Users/wjack/roof-command-sell. Serve: python -m http.server 4930 --bind 127.0.0.1 --directory C:/Users/wjack/roof-command-sell
Research: C:/Users/wjack/deep-research/roof-3d-reconstruction/MASTER_PLAYBOOK.md + shared notes deepdive-roof3d-*.md

## Goal (Jack)
Roofs whose 3D looks like the satellite: right lines (ridges, hips, valleys on the photo's peaks), no missing pieces, clean
(Caleo rules: watertight, level ridges, straight eaves, no fake edges, no slivers), squares near the permit. At scale ~200k homes.

## What we learned (the big lessons)
1. The outline is solved: the Google-traced outline sits ~0.35 ft from the photo's eaves.
2. The LAYOUT (which faces exist, where ridges run) is the hard part. Guessing it from LiDAR blocks fails on complex roofs.
3. LiDAR is good at planes, pitch and ridge heights when each face has its own points (Vosselman: ~5-10 cm ridges with 10-20 pts/face).
   Its weak part is deciding which points belong to which face. Our homes: StratMap 2020, ~5.3 pts/m2 median.
4. The photo is good at telling faces apart (light vs shade), bad where faces share a tone (E/W slopes at noon) or under trees/shade.
5. So the winning recipe is a HYBRID (research: Enphase patent, Jarzabek-Rychard & Maas 2016, Dehbi/Henn 2019):
   photo patches propose faces -> LiDAR splits / merges / vetoes them -> every interior line = intersection of two planes.
6. LiDAR must be centered on the photo per home first (median 1.0 ft shift; 15 homes > 1.5 ft). Done in combined.py.
7. Measure honestly: three scorecard bugs made good roofs look bad (unshifted LiDAR, 1.2 ft disc fattening, centering metric).
8. Speed: one slow helper made a house take 85 s; fixed to 26 s. Scale plan in side-session-notes roof-timing-scale-plan.md
   (FAST tier LiDAR+footprint+roofer for all homes ~3 s/house; PRECISE tier photo+LiDAR only for homes a roofer opens).

## The pipeline that works best today ("one house" method, Jack liked it on 10803 Ambergate)
scripts/roofs/onehouse.py step1  photo brightness patches (k-means on lightness inside the outline, smoothed, small patches
                                 merged) + LSD photo lines -> onehouse/<row>/lines.png, lines-v2.png
scripts/roofs/onehouse.py step2  LiDAR per patch (centering shift applied): two-plane patches split on the plane intersection,
                                 same-plane neighbours merged, unconfirmed = photo-only (rule: >=5 pts, median |dz| < 0.25 ft
                                 (0.30 on faces > 300 sq ft), 60% within 0.35 ft) -> lidar.png
scripts/roofs/onehouse_mesh.py   planes levelled to their eave (kept only if the fit holds), junk faces dropped, photo-only area
                                 given the neighbour plane that fits its points best, lines = exact plane intersections (0 dangling
                                 ends), faces cut from them, app mesh written into the PREVIEW copy -> lines-v3.png, app-v2.png
scripts/roofs/onehouse_batch.py  all of the above on many homes + summary.json (pass / needs work + reasons) + app.png per home
App preview (never touches what the CRM shows): scripts/roofs/app_preview.py (mirror at C:/Users/wjack/rc-preview, port 4941).

## Results
- 10803 Ambergate Ln (58566): 95% LiDAR fit, 31.3 sq vs permit 30.0, 0 dangling lines, shown in the real app view.
  Left: one small wall piece at a valley junction in the app; the two dark north faces now drawn as one.
- 36-home batch (onehouse/summary.json, first pass): 5 pass, 16 needs work (shade / trees / same-tone faces / outline includes a
  patio cover), 8 crashed (a face in two pieces; being fixed: always one polygon per face).
- Older route (combined.py round 3, clean blocks): 0 of 38 "perfect"; centering 0.3 ft, lines 1.08 ft, missing 0.7%.
  Scorecard: scripts/roofs/scorecard.py -> compare/scorecard.html (needs combined/visual-check.json: a home is perfect only after
  a human/visual check).

## Next steps (in order)
1. Fix the 8 batch crashes (multi-piece faces) and write app.png for every home.
2. Research merge rule: merge patches when their LiDAR planes agree AND the photo edge between them is weak (fixes over-split /
   photo-only on plain hips like 57928). Snap plane-intersection lines to LSD photo segments within 0.4-0.5 m.
3. Ambergate polish: keep the two north faces separate (split rule should not undo the photo split), remove the last wall piece.
4. Outline: drop patio covers / pergolas the Google trace includes (LiDAR height + texture check).
5. Then re-run the 36, check every passing home by eye next to the satellite, and only count those.
Rules: one heavy job at a time (16 GB laptop), commit own files after each piece, never git add -A, keep this file + PROGRESS current.

## Files
Code (build chat): scripts/roofs/{combined,peak_blocks,photo_lines,centering,scorecard,app_preview,onehouse,onehouse_mesh,
onehouse_batch,blocks_ab}.py. Progress log: tour/audit/roof-accuracy/PROGRESS-combined.md.
Pictures: onehouse/<row>/*.png, compare/scorecard.html, compare/check-combined.html, compare/photo-lines/before-after-*.jpg.
Research + Jack's side-by-side page (deepdive chat): deep-research/roof-3d-reconstruction/, side-session-notes deepdive-roof3d-*.md.

## Deepdive corrections and additions (10-20, deepdive chat)
1. **Jack's current direction (overrides "re-run the 36" in Next steps):**
   - Make 5 test houses perfect first, one at a time, with Jack's OK on each house's lines/LiDAR/app pictures:
     - 58566 Ambergate (reference)
     - 31438 Doctor Pink (plain hip)
     - 57928 (patio cover)
     - 36800 Canvas Back (cut-up + shade)
     - 35864 (trees)
   - Every fix is a general rule, never a per-house tweak. Rerun all 5 after each fix and write onehouse/five.json.
   - Only then run every house, with no hand-tuning; failures show as "needs work".
   - Jack's progress page: https://claude.ai/artifact/MoAs6sA5mq7XrmN26grWGi
2. **Honest scoring (research, verified):**
   - answer_key.py:133's fixed 1.12 waste over-corrects; the best fit is about +4.5% (model/permit constant 0.956 on the plausible 30).
   - Permits scatter about ±10%, so pass at ±10%. Leave-one-out error is about 7%.
3. **LiDAR vintage:**
   - App captions say "LiDAR roof facets (2018)": roof_blocks reads 2018 3DEP Pecos-Dallas.
   - onehouse/fuse3 read StratMap North Central Texas 2020 (5.3 pts/m2 median, 22 cm horizontal RMSE).
   - Use one cloud (2020) everywhere and fix the caption.
4. **Untested:** lean on the Frisco 2025 city ortho. Lines are still drawn on the Google screenshot.
5. **Research:**
   - Photo faces: deepdive-roof3d-photo-faces.md and the ranked list deepdive-roof3d-FINAL.md, both in side-session-notes/local_29875bdc-f000-49c1-970f-1cb19670bed9/.
   - Side-by-side of all homes: https://claude.ai/artifact/7kxVBeL3qm89w6FGkM3Mbn


## 5-house loop (10-20 late, build chat): general rules added, in order
Script: `python scripts/roofs/onehouse_batch.py --five` (58566, 31438, 57928, 36800, 35864) -> onehouse/five.json, summary.json, <row>/*.png
1. Every face and the outline are one polygon (onehouse.poly1); multi-piece crash fixed everywhere.
2. Photo patch not confirmed by the LiDAR -> the LiDAR's own faces (fuse3 segments) inside it take over when planar.
3. Unconfirmed area / small odd-angle faces (< 60 sq ft, off the house axes) borrow the touching face plane that fits their points best.
4. Look-alike neighbours (azimuth within 25 deg, pitch within 2.5/12, meeting within 1.5 ft) are one face.
5. Faces < 150 sq ft join the touching face pointing the most similar way (within 50 deg), taking its plane (tree / bump noise).
6. Nearly flat faces (< 2/12) well below the main eaves are cut out (patio covers, pergolas).
7. Simplest model that explains the LiDAR: clean hip/gable blocks win when fit >= 85%, within 8 pts of the faces model, fewer faces.
8. Wall tops = the roof face just inside the outline at that point (no wall pieces above the roof).
9. Pass gate: LiDAR fit >= 85% of all roof returns within 1 ft of the drawn faces (Jack's original 'perfect' number), 0 dangling
   lines, no faces < 30 sq ft, squares within +-10% where the permit is plausible. Photo-only % is info only.
Status before the last run: 58566, 31438, 57928, 35864 pass by numbers; by eye 31438 + 57928 clean; 58566 had one wall piece
(rule 8 targets it); 35864 lines right but the outline takes in a strip under the trees (permit not plausible, so squares not gated);
36800 (cut-up roof, shade) fit 81%: still needs work.

## Next (Jack, via the deepdive chat)
A) Fresh homes every round: 5 new random Frisco/Collin homes with 2020 LiDAR + a photo, never the 36 key homes, never repeated
   (onehouse/used.json), method frozen during a round, pass rate per round in onehouse/rounds.json. Fresh homes need the Google
   capture + trace first (gtrace.py capture/run_home) and usually have no permit: score on LiDAR fit, line fit, clean rules, by eye.
B) Paint the photo onto each roof face in the app render (faces are already registered to the photo) instead of the blue shingles.
C) 35864 outline under trees; 58566 wall piece check; 36800.
