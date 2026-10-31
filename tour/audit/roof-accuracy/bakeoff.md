# Roof bake-off, 67 test homes (2026-10-16)

Every candidate drawing scored against the home's LiDAR by scripts/roofs/accuracy.py. Bar = squares within 5%, roof-from-above IoU >= 0.85, >= 60% of LiDAR roof returns within 1 ft of the drawn surface.

Clean = passes the clean-house gate (one sealed solid, no stub walls, straight eaves and level ridges, no tiny pieces, looks like a house, check_edges). Only clean drawings may be shown.

| candidate | what it is | scored | clean | clear the bar | clean AND clear the bar | median within 1 ft % | median MAE ft | median IoU | median abs squares err % |
|---|---|---|---|---|---|---|---|---|---|
| A | outline house (what most homes drew) | 67 | 67 | 2 | 2 | 9.4 | 4.44 | 0.82 | 6.2 |
| now | what the app drew before this round | 67 | 67 | 7 | 7 | 11.0 | 4.23 | 0.83 | 4.0 |
| B | clean house on the LiDAR roof plan | 64 | 36 | 1 | 1 | 20.0 | 4.05 | 0.89 | 9.5 |
| C | roof_blocks model, post-cleaned | 63 | 31 | 15 | 9 | 55.6 | 1.92 | 0.85 | 3.8 |
| D | hybrid plan blocks fitted to returns | 62 | 37 | 8 | 6 | 43.35 | 2.34 | 0.86 | 4.55 |
| E | D with hip/gable per end from the facet record | 59 | 30 | 4 | 4 | 36.4 | 2.85 | 0.87 | 7.1 |
| F | simplest clean house on the LiDAR | 67 | 67 | 3 | 3 | 30.4 | 3.77 | 0.79 | 20.2 |

## Per home pick (scripts/roofs/roof_pick.py)

Rule: only clean models that cover the house (IoU >= 0.75, own squares within 15%) and keep the measured main pitch; the most accurate one replaces the outline house only when it is at least 5 points closer within 1 ft and its mean error is no larger.

Picking per home: 11 of 67 clear the bar. Picks: A 28, C 17, D 15, F 3, B 2, hand 1, E 1.

Re-scored from the running app after publishing (cand 'now' vs 'before' in summary.md): clear the bar 7 -> 11 of 67 (12 on shape alone; the shown total is always the LiDAR squares), median within 1 ft 11% -> 33%, median MAE 4.2 -> 3.2 ft, main pitch matches LiDAR on 67 of 67.

Per home tables: table-<candidate>.md; picks: picks.csv.
