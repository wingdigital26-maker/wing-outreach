# Round 6 (2026-10-17): roofs with wings, lines from the LiDAR's face directions

## In plain words

**The problem.** On complex homes (wings, cross gables, front projections, garage wings) the app often drew one plain hip box (204869, 4427 Kelly Dr) or missed a section (15292, 13 Carter Ct).

**Jack's idea.** The satellite knows what the roof looks like and the LiDAR knows the measurements, so use both. Google imagery can only be looked at by eye (never downloaded or scraped), and the free state photos are too blurry for lines. So the "what it looks like" part comes from the LiDAR itself: every return also tells us which way that bit of roof faces. Ridges, hips and valleys are exactly where that direction changes, which is the same thing the photo shows.

**What was built.** A new roof candidate, **W** (scripts/roofs/wings.py):
1. Reads which way each patch of roof faces (one colour per face on the review sheets).
2. Turns each face into a roof section. A face's outer edge is that section's eave.
3. Tries several main blocks, then adds wings while they make both the heights and the face directions fit better. It drops a section when the wings explain the roof better (this is what stops the "one big box").
4. Keeps the measured main pitch, cleans up with the same steps as model C, and must pass the same clean-house check.

"Lines match %" = share of the LiDAR's clean roof faces that the drawing slopes the same way (within 35 degrees).

## Results (67 test homes, what the app draws)

| | before | after |
|---|---|---|
| clear the full bar | 11 | **15** |
| at least 30% of the roof within 1 ft | 41 | 50 |
| median share of roof within 1 ft | 40.9% | 52.9% |
| homes now drawing the new W roof | 0 | 29 |
| homes that got worse | | 1 (164158, 47% to 42% within 1 ft) |
| Caleo | approved hand model | approved hand model (unchanged) |

New homes clearing the bar: 36436, 35469, 205330, 164157 (plus 32591, 164227, 164207, 15574 still clear it on W).

W built for all 67; 52 pass the clean-house check on their own. roof_pick (with W in MODEL_CANDS) only switches a home when W is clean, keeps the measured main pitch exactly and is clearly closer to the LiDAR.

## Known-bad homes, checked by eye on Google Maps satellite (viewing only, nothing saved)

| home | Google shows | before | after |
|---|---|---|---|
| 204869, 4427 Kelly Dr | main hip, wing to the north-east, street-side projection, skylight | one hip box, 45% within 1 ft, lines 55% | main + 3 wings, 58% within 1 ft, lines 71%. Closer; not yet at the bar |
| 164231, 3312 Snidow Ct | main hip, two front projections, rear garage wing | 46% within 1 ft | unchanged. W at the measured 7/12 pitch fits only 38%; at 12/12 it fit 59%, but the record pitch is 7/12, so it is not shown |
| 15292, 13 Carter Ct | long main, rear wing north, front cross section | 49%, squares 8.7% short | 53%, squares 5.7% short. Still missing part of the rear wing (flagged) |
| 34780 | large house with wings both sides | 7% within 1 ft | 55% within 1 ft, but drops the west wing (squares 12.6% short, flagged) |
| rockwall 5321 | long main hip + lower street-side section | one box, 18% | two sections, 65% |
| 36436 | big main hip, front wing, small pieces | one box, 25% | main + pieces, 68%, clears the bar |

## What is left
- 164231: the record says 7/12 but the faces fit 12/12 better. Look at the pitch by eye (a steeper front gable over a 7/12 main?) before forcing either.
- Missing wings (34780 west, 15292 rear): the greedy step stops one section early when the wing sits low. Next: try each leftover face region as a forced wing.
- Speed: about 1 to 2.5 minutes per home (4 at a time on this laptop). For 200,000 homes, build only homes that matter (storm path, Daily 50, opened records) in the nightly runner; a quick mode is the next step.

## Files
- Builder: scripts/roofs/wings.py (`one`, `batch`, `faces`); review sheets: scripts/roofs/wings_sheet.py
- Models: tour/audit/roof-accuracy/cand/W/; scores: metrics.csv (cand W), faces.csv (lines match), wings.csv (run log), picks.csv
- Sheets: .visual/sell/round6/wings/before-after-0N-01.png [LiDAR heights | LiDAR face directions | before | after], google-check-01.png, first8-01.png
