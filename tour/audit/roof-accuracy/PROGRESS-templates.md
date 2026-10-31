# HANDOVER (2026-10-22): roof-improvement work STOPPED by Jack; product work moves to the lead session
Nothing is running. Rounds 14-17 were not run (round 14 is picked + prepared only; its rows stay in used.json).

## What the app shows today (per home, written by scripts/roofs/sound.py into the preview copy C:/Users/wjack/rc-preview)
1. Outline: the best of Microsoft ML footprint (scripts/roofs/msfp.py, index C:/Users/wjack/msfp/collin-index.npz),
   county footprint, photo trace, each moved onto the LiDAR roof (<= 4 ft) and kept only if it agrees with it
   (0.7 / 0.7 / 0.85); patio covers (low flat LiDAR) cut; squared on the house axes, wings >= 10 ft.
2. Roof: the exact straight skeleton of that outline (CGAL wasm, scripts/dfw/vendor), one eave + pitch per level from the
   LiDAR, two levels when the LiDAR shows a 6 ft step, gables only when the LiDAR proves them.
3. Soundness gate on the rendered mesh (no gap/overlap/sliver/stray line, touching faces meet in height, every face reaches an
   eave). A detailed model (simple/ hybrid / OLD) is shown only if it passes this AND the accuracy gates; else the skeleton.
4. CHECK HOUSE (never a guessed shape): no outline agrees with the LiDAR, or the skeleton fits the LiDAR < 60%. The app file
   then has status "checking" + gate.checking; the app draws its generic outline roof with the header "roof shape being
   checked" and no section pills (tour/lib/real-roof.js + rc-roof.js c963a51, tour/c5-home/home.js ebb053e).
Measured: fresh round 13 (frozen) sound 4/5, shown 1 right / 1 close / 3 wrong before the 60% fit floor; with the current
rules most 2-storey / cut-up homes go to check house, plain homes come out right (41137, 116507, 56630).

## Commands (repo root C:/Users/wjack/roof-command-sell, one heavy job at a time, Python 3.14 with -E)
- New batch of fresh homes, end to end (resumable; pick -> prep -> OLD run -> sound -> sheet):
  `python -E scripts/roofs/sound_rounds.py 14 15`   (round numbers; rows/verdicts in tour/audit/roof-accuracy/onehouse/rounds.json)
- Specific homes that are already prepared (gtrace + 2020 points):
  `python -E scripts/roofs/sound.py --shots --page --rows 116507,56630`
  -> onehouse/<row>/sound/ (lines-v3.png, photo3d.png, app.png, sound.json with shown / check_house / gate reasons),
     the preview app file, and Jack's page files onehouse/pick/<row>/ + pick/results.json (page :4960)
- Prepare a home first if it is new: `python -E scripts/roofs/fresh_round.py prep --round N` (needs the round in rounds.json)
- Microsoft index rebuild (only if the tiles change): `python -E scripts/roofs/msfp.py index`
Other scripts from this session, kept for reference: templates.py (LiDAR-only templates), cap.py (candidate-and-pick with a
Fable reader), simplify.py (shape-right simplify), linemodels.py + linemodels/linemodels.ipynb (Point2Roof test: 0/10).

# Roof templates (model-driven) progress, from 2026-10-21

Owner: session "roof templates" (started by Main Roof/lead local_29875bdc). Jack's decision 10-21: no paid data; match each
house to standard DFW roof forms and fit them with the LiDAR.

## Method (scripts/roofs/templates.py, outputs onehouse/<row>/tmpl/)
1. Outline: LiDAR roof mask (gtrace.lidar_shape, canopy removed) minus low flat areas (local plane < 2/12, rms < 0.4 ft,
   below min(14.5 ft, roof median - 2.5 ft), >= 40 sq ft touching the edge). House axes from the photo trace's edges
   (the LiDAR mask is too blobby to give the angle). Squared by a Kada-style cell grid: wall lines = places where the mask's
   edges pile up (>= 4 ft of wall, lines >= 4 ft apart), cells kept where the mask fills >= 50%.
2. Rectangles: every all-inside maximal rectangle (>= 6 ft wide) on that grid, greedy by new area, redundant ones dropped.
3. Templates per rectangle: flat, hip, gable, half-hip (either end), shed (4 ways), ridge along u or v; one robust fit
   (eave + one pitch, 12ths); score = share within 1 ft - 0.01 per face; flat only when the returns span < 1 ft.
4. Union = exact upper envelope, refit 3x on each piece's own top-surface returns; a piece under 80% is split once where
   its halves fit best (+8 pts needed), up to 2 passes.
5. Render + gates: onehouse_mesh.publish (lines-v3, photo3d, step4.json, app with --shots) + rects.png; layout_fit.passes.

## Log
- 10-21 first build. Fixes on the way: axis angle from the photo trace (mask edges gave -12 deg on an axis-aligned house);
  wall-line support threshold bug; maximal-rectangle check O(1).

## Resume step
(see bottom of this file; updated after every piece)

## 10-21 midday: v0 results and pivot
- Template v0 practice: 64162 (plain hip) fit 69% -> 87% once each rectangle's sides were fitted to the LiDAR (mask edges sit
  2-3 ft off the eaves); 10709 (multi-level) stays cluttered (8 pieces, 80%): LiDAR-only choice of rectangles/forms overfits.
- Changes kept: wall lines voted by LiDAR mask (un-fattened 1 ft) + photo trace + county footprint, both moved onto the LiDAR
  (up to 8 ft lean); cell kept at >= 80% mask, or >= 50% with the photo/footprint agreeing (tree spill); wings trimmed to
  half the covered depth; sheds priced as 3 faces; forward selection of rectangles by a global objective
  (inliers - 0.5 misfits - 0.6 missed roof - max(20, 2.5% of returns) per piece); line fit 6x faster (capped KD query).
- PIVOT (Jack via lead, 10-21): draw-then-LiDAR as CANDIDATE-AND-PICK (scripts/roofs/cap.py). Templates are the candidate
  generator; a Fable reader picks keep/drop + form + ridge direction + gable/low ends per numbered wing (no coordinates);
  the LiDAR fits the picked forms. Outputs: onehouse/<row>/new/ (old layout model kept once as new-v1/), Jack's page :4960
  reads onehouse/pick/<row>/{photo,lines,app}.png + pick/results.json. Target 90% by eye on the 55 dev homes, then 10 fresh.
- Test 1 homes: 33709 (trees), 10709 (multi-level), 56682, 31648, 52803.

## Resume step
1. `python -E scripts/roofs/cap.py prep --rows 33709,10709,56682,31648,52803` (writes tmpl/, wings.json, pick.png)
2. One Fable agent with `python scripts/roofs/cap.py brief` + the row list -> onehouse/<row>/pick.json
3. `python -E scripts/roofs/cap.py fit --rows ... --shots` then `cap.py page --rows ...`, judge by eye, write verdicts into
   pick/results.json + rounds.json, message the lead (local_29875bdc) with the count.

## Test 1 (candidate-and-pick v1, 10-21 afternoon): 0 right, 1 close, 4 wrong by eye
Sheet onehouse/templates/test1-sheet.png; page files onehouse/pick/ (+ results.json); rounds.json entry "pick-1".
What failed and the general fix for each (in order of value):
1. Candidates too coarse (56682 cross-hip in one box; porch notches on 31648/52803): the reader can only keep/drop.
   FIX: show the outline's CELL grid (photo trace + LiDAR wall lines, finer: 3 ft jog, 3 ft support) with numbered cells;
   the reader groups cell IDs into wings + form per wing (IDs only). A wing overlapping the body extends half way in.
2. Reader overrides strong LiDAR (33709 gable 98% -> forced hip 45%): FIX: reader sure < 0.7, or forced fit > 10 pts
   below the LiDAR's own form on that wing -> the LiDAR form wins.
3. Clutter from overlapping wings (10709): FIX: after the fit, drop a wing whose visible area < 25% of its rectangle or
   whose removal keeps fit within 2 pts (prune() exists in templates.py, objective()).
4. Axis wrong on 52803 (drawing ~10 deg off the photo): FIX: axis from the photo trace only when its length-weighted
   agreement is strong; else the county frame; log both; check against the LiDAR mask's min-area rectangle.
5. Lean: single global shift; per-vertex lean (deepdive gap 2) still to do.
Resume step: implement fixes 1-4 in cap.py/templates.py, re-prep + re-read + re-fit the same 5 (practice), then all 55
dev homes (one reader agent per batch of 5, one heavy job at a time), verdicts by eye -> pick/results.json + rounds.json.

## Shape-right (10-21 late)
- simplify.py on 5 "close" homes: 0 right, 2 close, 3 wrong (sheet onehouse/templates/shape1-sheet.png). Simplify cleans only
  when the wings are already right; it cannot fix structure.
- Re-judge of the 55 under shape-right (Fable judge, onehouse/shape-right-rejudge.json): 13 right / 19 close / 23 wrong
  (any of OLD/HYBRID). Spot check: judge slightly lenient (10519 OLD has an extra SE piece: close), so ~12 honest.
  Failure modes: LiDAR region-growing clutter (~15 homes), neighbour/pool/patio in the outline (~7), missing wings, main
  ridge not drawn. The 19 "close" are the cheapest gain: one rule broken each.
Resume step: per "close" home, the single broken rule from shape-right-rejudge.json -> one general fix per failure mode
(outline exclusions first, then clutter), re-run, re-judge.

## Sound roofs (Jack via coach, 10-21 night): soundness beats detail
scripts/roofs/sound.py, outputs onehouse/<row>/sound/ (+ sound.json), page onehouse/pick/ titled "Sound roofs: skeleton + LiDAR pitch".
- Outline: county footprint or photo trace (moved onto the LiDAR), whichever agrees better with the LiDAR roof; minus low flat
  (patio covers) and sparse-return cells (slatted pergolas); squared, wings >= 10 ft. CHECK HOUSE (never shown) when the
  better source agrees < 0.7 with the LiDAR.
- Roof = exact CGAL straight skeleton (node + scripts/dfw/vendor wasm); one eave + one pitch per level fitted to the LiDAR;
  two levels when grid cells' p10 sit >= 6 ft over the low eave (lower roof = skeleton of the whole outline clipped outside
  the upper region); gables only when the side planes explain a hip end >= 15 pts better.
- Soundness gate: no gap/overlap, one piece, no sliver (< 20 sq ft or < 1 ft wide), every face reaches an eave or the upper
  wall, no dangling ends, every line inside the outline, nothing above the roof; two-level failing -> one level.
- Detailed model (simple/ hybrid / OLD) shown only when sound AND passing the accuracy gates.
- simplify.py step 1 (outline exclusions) ran on all 55 (simple/ refreshed); its re-judge was skipped by the pivot.
Test 1, fresh round 12 (116507, 37228, 34243, 56630, 54316): SOUND 4/5, SHAPE 1 right + 1 close + 3 wrong (sound1-sheet.png).
Fixes after it: check house by LiDAR agreement (54316: county diamond 0.58), sparse-return cut, gate edge checks (37228's
stray line). Open: two-level split often falls back to one level (lower roof pokes above the upper eave: 10519, 54316);
cut-up roofs come out blocky (34243).
Resume step: judge fresh round 13 (rows in rounds.json; sound/ pictures + pick/), keep only round 13 on the page, report.

## Rounds 12-13 + fixes (10-21 night)
- Practice (round 12, county outline + rendered-mesh slab gate): sound 5/5, shape 1 right + 2 close, 2 wrong both CHECK HOUSE.
- Fresh round 13 (frozen, incl. photo fallback when county < 0.7 and photo >= 0.85): sound 4/5; shown 1 right (41137),
  1 close, 3 wrong; 0 check house. Causes: two-level homes fell back to one level (LiDAR fit 9%), clutter.
- Fixes after round 13: skeleton shown only at >= 60% LiDAR fit (else CHECK HOUSE); lower roof = skeleton of the lower
  region carried 12 ft into the upper part, pitch eased (down to 3/12) until it meets the upper wall under its eave.
  Re-run: 37990 9% -> 51%, 33583 9% -> 55% (both still check house), 10519 41% (check house). 0 wrong shown on these.
Open: the upper-region detection (grid cells p10 >= low eave + 6 ft) is rough: it decides most of the remaining fit.
Resume step: improve the upper-region detection (use the LiDAR height map's step edges, square to the outline's wall lines),
practice on rounds 12-13, freeze, fresh round 14 (fresh_round.py pick/prep/run --round 14, then sound.py --shots --page).
- Tried (reverted): LiDAR step lines (height jump >= 4 ft over 2 ft, >= 6 ft long) as extra split lines for the upper region:
  fits 37990 51->35%, 33483 45->35%, 64655 65->56%, 10519 41->45%, 33583 crashed. Not kept.
- Tried (reverted): upper storey = the detailed model's faces whose lowest corner sits >= 6 ft over the low eave: those
  faces are too fragmented, fits fell to 9-19%. Committed state (fit floor 60% + eased lower pitch) restored and re-run.

## Microsoft outlines + line models (10-21 late)
- msfp.py: Microsoft ML footprints (4 Collin quadkeys, 559,893 buildings). sound.py picks the best-agreeing outline of
  Microsoft / county / photo after moving each onto the LiDAR (<= 4 ft). On the 5 sound-test homes: shown 1 right + 2 close
  (all sound), 2 check house, 0 wrong shown; LiDAR fit 56630 64->92%.
- App: publish_shown() writes exactly what is shown; check house = generic outline roof labelled "roof shape being checked"
  (lead's c963a51 + home.js ebb053e).
- Line models (Colab, coach ran it): Point2Roof 0/10 right by eye (sparse edges, not on the photo's lines, even on plain
  hips); BWFormer stopped at its Building3D dataset loader. Not pursued. Pictures: linemodels/compare-1.png, compare-2.png.
