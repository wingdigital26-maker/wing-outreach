# Combined roof pipeline: progress (10-19)

Script: scripts/roofs/combined.py. Outputs: tour/audit/roof-accuracy/combined/<row>/ (git-ignored), page compare/check-combined.html
(serve: python -m http.server 4930 --bind 127.0.0.1 --directory C:/Users/wjack/roof-command-sell).

## Done (10-19)
- Google trace, SAM, HEAT on all 36 answer-key homes (+164231, 15292 trace only). SAM/HEAT commands: side-session-notes/.../sam-heat-runner.md.
- combined.py run + page on all 38 homes. 11 pass every check, 27 needs work.
- Face layout picked per home by LiDAR fit (share of roof returns within 1 ft): roofer solid 30, straightened LiDAR faces 7, HEAT lines + LiDAR planes 1.
- Squares = LiDAR pitches on the eave plan (Google trace joined with county walls + 1.5 ft). Believable permits (30): median error 9.1% raw (ratio ~1.00),
  vs old fuse2 6.4%, fuse3 7.0%. The Google outline adds scatter; it does not beat the old footprint method on squares.
- SAM: loose masks (IoU 0.30 to 0.89, ~2x footprint); added no wing on any home. HEAT: weak on these photos, wins 1 home.
- 3 "missing wing" homes (32855, 46079, 55033): outlines complete by eye, SAM adds nothing, LiDAR fits 89 to 97%. Gap = permit numbers.

## Photo lines, 4th layout (10-19, session "photo lines")
Script: scripts/roofs/photo_lines.py (`test [--rows]` writes combined/<row>/snap-test.jpg: sat, LiDAR labels, snapped top+overlay, skeleton top+overlay).
Two candidates, both scored with combined.fit_share, drawn only when >= 90% of the LiDAR roof sits within 1 ft; both pass = fewer faces wins:
- (a) Outline skeleton: hip roof on the Google outline (each point belongs to the eave edge it is nearest to, inside the corner
  bisector wedge = straight skeleton), LiDAR plane per face; hip ends the two side planes explain better become gables. Planes are
  rebuilt from the eaves (shared eave levels + one pitch, so faces meet at ridges) when that costs < 2 pts fit, else own LiDAR planes.
- (b) Snapped LiDAR lines: fuse3 faces tidied (same-plane neighbours join, faces < 30 sq ft and thin off-axis hip strips fold in),
  plane-intersection line per touching pair, squared to the house axes/45 deg within 7 deg, slid up to 2 ft onto the strongest
  parallel photo edge, ends run on to a line of the same face or the outline, outline cut by the lines, pieces take their majority face.
- Test on 38 homes (snap-test.log): 18 homes pass the 90% gate with at least one candidate (skeleton 6, snapped 17).
  By eye the photo layouts clearly beat today's jagged/blobby pictures on 43959, 46083, 48582, 57216, 57928, 58566, 59538; about equal on most others.
- Gotcha: scripts/dfw/scipy_shim.py swaps in its own cKDTree (no query_pairs) once loaded; combined.py imports photo_lines first.
- Run 4 (all 38, in combined.py): photo lines drawn on 19 homes (snapped 16, skeleton 3); layouts now roofer 18, photo 19, LiDAR faces 1.
  Pass 13 -> 18, but mostly because roofer-only rules do not apply to non-roofer layouts (same as before for LiDAR/HEAT), not new accuracy.
  Squares unchanged (squares always = LiDAR on the eave plan). Before/after sheets: compare/photo-lines/before-after-1..4.jpg.
  By eye vs satellite: clearly closer on 43959, 46066, 46083, 48582, 57216, 57928, 58092, 58566, 59538 (+59633 straighter);
  about the same on 31438, 35845, 35864, 39730, 55669, 59179; WORSE on 46081, 48888, 59177 (snapped lines cluttered).
  A "photo must fit within 3 pts of the best layout" rule was checked on paper: it would drop those 3 but also 57216, 58092, 59538,
  57928, 58566, so it is not used.
- Next: cleaner snapped lines (snap line ENDS to junctions, drop lines the photo has no edge for); skeleton for cross-gable roofs
  (split the outline into overlapping rectangles); faces that meet in 3D.
- Known: 3D front view shows small steps at ridges when own LiDAR planes are kept (planes fitted per face do not meet exactly).
- Skeleton fails (< 90%) on cross-gable / multi-level roofs; snapped lines stay cluttered where the LiDAR faces are noisy (35845, 55669, 59177).

## Clean blocks + scorecard loop (10-19 late, this session is the single owner of roof accuracy)
Jack: "really close, lines just barely off, missing small pieces". Targets per round on the 38 homes:
line fit < 1 ft median | missing roof < 3% and no piece > 20 sq ft | squares median < 5% (30 believable) | clean (one solid, no slivers/tiny faces).
- scripts/roofs/peak_blocks.py: MAIN layout. Rectangle blocks (sides on outline vertex lines, LiDAR line ends, or mirrored about a
  LiDAR ridge; >= 1 eave on the outline; >= 10 ft) added greedily by LiDAR fit; each a hip or gable tent (eave height + pitch from
  robust LS); house = upper envelope; thin visible strips dropped; photo lean (lx, ly ft per ft above the eaves, cap 0.3) fitted on
  the model's lines; overlay drawn leaned. Used when fit >= 0.85, else the older layouts + a "needs work" flag.
- combined.py: SAM + HEAT off in the per-home run; writes combined/<row>/drawn.json (faces + lines as drawn on the photo).
- scripts/roofs/scorecard.py: `score --round "<label>"` -> combined/<row>/scorecard.json + combined/scorecard-rounds.json;
  `page` -> compare/scorecard.html (sat | lines on sat | top | angled 3D | scorecard, + trend chart).
- Old pictures for the before/after: combined/_before_page/ (run 4 page copies).

## Known issues / next
- "roof top above LiDAR + 1.5 ft" rule fires a lot: likely a ground-height mismatch between roofer z and LiDAR z; check before trusting it.
- Pictures: roofer faces blobby, LiDAR face edges partly jagged; HEAT too weak to fix it. Next real step = roof lines from the photo itself.

## Centering diagnosis (10-20, scripts/roofs/centering.py -> combined/centering.json)
LiDAR roof eave line vs the photo-snapped outline: median chamfer 1.2 ft before; best shift median 1.0 ft (15 homes > 1.5 ft).
Centroid offset median 1.5 ft (19 > 1.5, but centroids move with porches too). Flags: 64783 (9 ft, LiDAR shape includes more
than this roof), 58566 (shift at the 4 ft cap). Fix in round 3: P shifted by the best shift when it improves >= 0.15 ft and <= 3 ft.

## One house at a time (Jack 10-20): 10803 Ambergate Ln (58566), outputs in onehouse/58566/
- step 1 scripts/roofs/onehouse.py step1: photo brightness patches + LSD photo lines -> lines.png / lines-v2.png (finds the 2 dark north faces; same-tone faces merge)
- step 2 onehouse.py step2: LiDAR per photo face; faces with 2 planes split on the LiDAR plane intersection; same-plane merged; unconfirmed = photo-only -> lidar.png (right wing split E/W by LiDAR)
- step 3 onehouse.py step3: cells straightened onto plane intersections -> app.png (fit 98%, 31.2 sq vs permit 30.0, borders still wavy)
- step 4 scripts/roofs/onehouse_mesh.py --row 58566 --shots: planes levelled to their eave (kept only if the fit holds), lines = exact plane
  intersections run to meet each other / the outline (0 dangling ends), faces cut from them, app mesh written into the PREVIEW copy
  (C:/Users/wjack/rc-preview, port 4941) -> lines-v3.png + app-v2.png. Fit 96%, 31.2 sq vs 30.0.
- Open on 58566: (a) a horizontal ridge/valley pair crosses the top-left dark north face (photo shows it bounded by 45 deg lines);
  (b) app view shows white wall slabs poking up near the valleys (walls made from outline points: check the wall top heights);
  (c) small junk faces by the chimney.
- Round 3 scorecard (all 38): 0 perfect; centering 0.3 ft median; lines 1.08; missing 0.7% (25 ok); clean 1. Visual check file
  combined/visual-check.json is required for "perfect". Timing/scale plan: side-session-notes roof-timing-scale-plan.md.

## Resume step
Next: fix (a)-(c) on 58566 in onehouse_mesh.py, re-run `python scripts/roofs/onehouse_mesh.py --row 58566 --shots`, show app-v2.png.
Only then the same 4 steps on a second house (Jack: one house at a time). Nothing running in the background.

## Fresh round 2 (10-20 night, round-2 session)
Rules added (general, frozen for the round once round-1 retest is done):
1. Capture: gtrace.capture hides every Google Maps UI element (search, "This area" card, chips, rail, footer) before the
   screenshot (CLEAR_UI_JS), logs leftover UI boxes (ui_left); run_home refuses a photo with > 0.2% flat-bright card pixels
   in the outline grown 20 px (card_share; round 1's 428 = 0.3%, clean homes <= 0.02%). Tested on 428: clean photo.
2. LiDAR leads (scripts/roofs/onehouse_lidar.py, called by onehouse_mesh.run when the photo model fits < 85%): region growing
   on the roof returns (12 nearest normals, 12 deg, 0.5 ft; min 12 returns under 5 pts/m2 else 10), cells -> faces, photo
   patch split only on two tones (L* >= 8) AND two planes (>= 10 deg); merges/joins only when they keep the fit; planes
   steeper than 18/12 dropped; steps between roof levels get a straight step line + wall piece, and no ridge/valley
   straightening across a step (step_pairs). Kept when it fits better than the photo model. step4.json "lead" logs both fits.
Round-1 homes as practice: 5921 66% -> 95%, 10524 75% -> 85% (others in the retest).
Round 2 rows (seed 49449, pool 55,420): 33165, 6782, 46572, 7116, 34027 (spares in rounds.json).
Resume step: `python -E scripts/roofs/fresh_round.py prep --round 2` (2020 points + capture + trace, swaps logged), then
`python -E scripts/roofs/fresh_round.py run --round 2` (batch + app.png + rounds.json counts), then look at every app.png.
Round 2 DONE (10-20 late). Rows 33165, 46572, 34027, 56739, 31311 (swaps: 6782 card-test false positive on a white
carport roof; 7116 + 164265 no 2020 points). Numbers: 4 pass / 1 needs work. By eye: 2 pass (46572, 56739), 3 needs work
(31311 thin strip between parallel ridges; 34027 trees/shade, pitches too flat; 33165 multi-wing 67%). Round 1 was 0/5.
LiDAR led on 3 of 5 (33165 45->67%, 56739 72->96%, 31311 60->93%). Gate corrected before scoring: off-axis on planes + ridges.
Known: app header 'pitch 0/12' + '(2018)' caption on fresh homes (no template); pixel card test false-positives on white roofs.
Resume step: build the next general rule (proposed to the deepdive: minimum face width + canopy returns out before region
growing), test it on round 1 + 2 homes as practice, then fresh round 3 (`fresh_round.py pick --round 3`).

## Rounds 2 re-score + 3 (10-20 late)
Round 2 re-scored with the corrected gates (outline vs county footprint IoU >= 0.75 + retrace from footprint on fail;
photo line_fit and eave_fit <= 1.0 ft): 1/5 (56739). Lean check: 46572's 3.0 ft line fit is wrong structure, not lean.
Round 3 rules (frozen at 825f8c5): (a) min face width 4 ft (guarded by fit), (b) canopy-rough returns (local RMS > 0.35 ft)
never seed/grow regions; app header predominant pitch + lidar_year 2020.
Round 3 rows 783, 149197, 224, 38831, 55125: gates 1/5 (149197), by eye 1/5 (783). RUNNING RIGHT BY EYE: 2 (target ~40).
Sheet per round: python scripts/roofs/round_sheet.py --round N -> onehouse/roundN-sheet.png
Resume step: build the next rule (model choice by BOTH sources: candidates photo / LiDAR / blocks / outline skeleton with
LiDAR fit >= 85%, then lowest photo line_fit, fewer faces on ties), practice on rounds 1-3 rows, freeze + commit, then
(python -E scripts/roofs/fresh_round.py pick --round 4 && ... prep --round 4 && ... run --round 4), eye check, sheet, report.
Round 4 (rule: simplest model that fits, 5-pt window; line gate 1.5 ft) rows 66037, 22669, 8396, 37271, 64304: gates 1/5,
by eye 1/5 (8396). RUNNING RIGHT BY EYE: 3. Outline errors now dominate (pool/patio inside, partial footprint, skewed trace).
Resume step: next rule = outline from the LiDAR roof-height mask (cut low/flat non-roof, add missing roof) before faces, plus a
jaggedness gate; practice on rounds 2-4 rows (back up + restore their published files), freeze, fresh round 5.
Round 5 (rules 4db55a4: LiDAR mask adds missing roof only; line fit after +-3 ft shift, gate 1.0 ft; jaggedness + holes
gates) rows 59767, 5696, 64162, 12727, 62819: gates 2/5, by eye 1/5 (64162). RUNNING RIGHT BY EYE: 4.
Resume step: Frisco 2025 3 in ortho as an alternate photo (deepdive item 4), then the next rule from round 5's failures
(trace spill onto neighbours; cluttered LiDAR faces on cut-up roofs), practice, freeze, fresh round 6.
Frisco 2025 3 in ortho (scripts/roofs/frisco_photo.py): fetched per home (EPSG:4326 export, pixels square in degrees),
resampled into the Google capture's pixel frame, aligned by scale (0.90-1.10) + shift (<= 150 px) template match on edge
strength -> gtrace/<row>/frisco.png (git-ignored, licence unclear). Picker + line gate use the better of the two photos.
First look (round 5 models): helps 59767 (0.84 -> 0.66 ft), worse on 64162 (0.48 -> 1.24) and 62819; about half of the
fresh homes are outside the city's coverage (Allen / McKinney / Plano). Likely cause: aligning to the leaned Google photo
re-adds lean; a better use is registering the model straight to the ortho (no Google step). Prep now fetches it for new homes.
Rounds 6-7 (10-21): OLD (frozen pipeline) vs NEW (vision layout from the deepdive's reader -> scripts/roofs/layout_fit.py)
+ chooser (NEW if it passes the gates, else OLD, else needs work; shown.json per home). Round 6 by eye OLD 2/5; NEW after
practice fixes (45-deg pieces, top-surface refit, layout lean shift, crack fix) shows 3/5 right with the chooser (practice).
Round 7 fresh: OLD 1/5 (10709), NEW 0/5, shown right 1. RUNNING RIGHT BY EYE: 7.
Resume step: NEW rules from round 7 (flat only when returns are flat; reader splits until one primitive per rectangle),
practice on rounds 6-7, freeze, fresh round 8 (prep -> ping the deepdive for layouts -> OLD -> NEW + chooser -> eye check).
Rounds 8-10 (10-21): HYBRID (reader outline/exclusions/wings + LiDAR faces + primitives where they fit, layout_fit.py
--mode hybrid) + chooser (HYBRID > OLD > needs work, shown-hybrid.json). Gates added: lighting S>N (faces misoriented),
sun-brightness rms <= 20 (segmentation), IoU vs footprint minus exclusions, one borderline gate allowed (sun 20-25, IoU
0.70-0.75, lines 1.0-1.25) after a rounds 2-9 re-score with no wrong-by-eye flips. Contour registration (register.py)
showed lighting-flagged homes are registered; inverted lighting = misoriented faces.
Right by eye, shown: round 8 2, round 9 2 (after the band), round 10 0. RUNNING RIGHT SHOWN: 11 (any model 12).
Resume step: next rule from round 10 (gates passed 2 that are not right by eye: 50599 cluttered, 12735 extra valleys ->
a clutter gate: count of interior lines per 100 sq ft vs the reader's piece count); then fresh round 11.
Clutter gate + precision check (10-21, deepdive: a wrong roof shown is worse than a right one blocked): scripts/roofs/clutter_check.py
(interior line length per 1000 sq ft > 74 = 90th pct of right-by-eye homes; layout models also interior line count >
1.5 x reader-implied + 2), wired into layout_fit.choose; sun band capped at 22. Confusion over all 50 fresh homes
(onehouse/clutter-check.json): current gates shown 12 right / 8 wrong; with clutter gate + sun band 22: shown 10 right /
3 wrong (117590 hybrid, 43154 hybrid, 33416 old), blocked 6 right / 31 wrong. The 3 wrong-shown homes are metric-identical
to right ones (density 41-69, lines 0.6-0.8 ft, fit 0.90-0.91): zero wrong is not reachable with numeric gates; needs an
eye-type check (vision verify of lines on the photo) as the final gate.
HOLD before round 11 (deepdive checking direction with Jack).

## HANDOVER (10-21): rule rounds stopped, method moved to "Roof templates: DFW builder shapes + LiDAR"
Jack switched to a roof-template / model-driven approach (no paid data), owned by session local_53faf824-a3cf-48e9-a1e9-e822f191e58f.
Round 11 was finished at Jack's request (OLD + reader + HYBRID + chooser): 1 right shown (56682 HYBRID), 2 close, 1 wrong
shown (33709, tree-covered roof), 1 failed. FINAL: 12 right as shown out of 55 fresh homes (rounds 1-11).
Score: fresh rounds 1-10 (50 never-reused homes, 5 per round) right by eye as shown: 0,1,1,1,1,2,1,2,2,0 = 11/50 (22%);
12 counting a right model the gates blocked. Precision table over the 50 (onehouse/clutter-check.json, current gates incl.
clutter): shown 10 right / 3 wrong, blocked 6 right / 31 wrong.
WHAT WORKS
- Simplest model that fits (onehouse_mesh.pick: photo / LiDAR faces / clean blocks / outline skeleton, >= 85% LiDAR fit,
  within 5 pts of best, fewest faces): plain DFW hips come out clean (55125, 64162, 783).
- LiDAR roof mask ADDS missing roof to the outline (fresh_round.outline_check); it must never cut (it drops low wings).
- HYBRID (scripts/roofs/layout_fit.py --mode hybrid): a vision reader's outline/exclusions/wings + LiDAR faces + primitives
  where they fit; one-building cut only across ground gaps; carried rounds 8-9.
- Gates (onehouse_batch.judge, layout_fit.passes + clutter_check): LiDAR fit, photo line/eave fit after a bounded shift,
  jagged/holes, footprint IoU (minus reader exclusions), lighting S>N, sun-brightness rms, clutter density; one borderline gate.
- Capture: Maps UI hidden + card check (gtrace.capture/card_share; the pixel test false-positives on white roofs).
WHAT FAILS
- Outlines on unusual homes (two buildings, low-slope modern, tile + turret, trace onto neighbours).
- Cut-up / multi-level roofs: LiDAR faces come out cluttered; single primitives per reader rectangle cannot fit them.
- Numeric gates cannot reach zero wrong-shown (3 wrong homes are metric-identical to right ones). A blind Fable judge
  (onehouse/vision-val/) agreed only 72-77% with the eye (too strict); a few-shot retry was planned, not run.
- Registration theory: contour correlation (register.py) shows lighting-flagged homes ARE registered; inverted lighting =
  misoriented faces from segmentation.
WHERE THINGS ARE
- Rounds, rows, verdicts, counts: tour/audit/roof-accuracy/onehouse/rounds.json (+ summary.json, used.json).
- Per home: onehouse/<row>/{lines-v3,photo3d,app}.png (OLD), new/ and hybrid/ (layout models), layout.json, shown*.json.
- Sheets: onehouse/round<N>-sheet.png, round6-10 *-old-vs-new/hybrid.png, practice-*.png, clutter-check.json, light-sweep.json.
- Scripts: scripts/roofs/{fresh_round,onehouse,onehouse_mesh,onehouse_lidar,onehouse_batch,layout_fit,clutter_check,
  register,frisco_photo,round_sheet,oracle}.py. App preview copy: C:/Users/wjack/rc-preview (never the live CRM data).
LESSONS THAT CARRY OVER TO TEMPLATES (all coded in scripts/roofs/layout_fit.py unless noted)
1. One primitive per eave height: a block spanning two levels cannot fit (10709 main: 11 ft z spread, best primitive 36%).
2. Top-surface refit: fit each block only on the returns where it is the top surface (fit, envelope, refit, 3 passes).
3. Flat only if the block's own returns are flat (p10-p90 < 1 ft); otherwise the best sloped primitive.
4. Level prior: a 2-storey block first fits the upper half of the returns in its box.
5. Exact upper envelope across blocks (half-plane regions per face, world-frame planes) gives straight, watertight lines.
6. One-building cut across ground gaps only (keep what lies within 2 ft of the connected LiDAR roof); never open across
   a wall/step. Close hairline cracks first (they turned into 6 ft splits).
7. The photo leans on tall roofs: one global layout shift onto the LiDAR roof (+-8 ft) before fitting; score photo lines
   with a bounded shift centred on it; eaves get their own shift (less lean at eave height).
8. Gates worth keeping: lighting S>N and sun-brightness rms <= 20 (catch misoriented faces, onehouse_mesh.light_check);
   clutter (interior line length/1000 sq ft <= 74, clutter_check.py); footprint IoU minus deliberate exclusions; one
   borderline gate allowed (sun 20-22, IoU 0.70-0.75, lines 1.0-1.25 ft), validated so no wrong-by-eye home flips.
9. 45-deg blocks need their own frame; half-hips = gable with gable_ends listing only the gabled sides.
