# Daily 50 layout audit (deck.html)

Script: `python d50_audit.py` (Playwright, 1440x900, 1366x768, 1280x800, 390x844, 430x932).
It checks text boxes, pins, pills, buttons and panels for:
- overlaps: visible rects intersecting, clipped to their overflow ancestors and measured per line for inline text
- clipped: scrollWidth/scrollHeight over the box with ellipsis or overflow, or a box cut by an overflow-hidden ancestor
- offscreen: past the viewport
- hidden: info that is in the markup but display:none at that size

Content inside a scroll container (the Up next list) counts as reachable, not clipped.

## Before (round 0): 43 overlaps, 41 clipped, 12 hidden
1. The concept label was fixed to the bottom and painted over the pipeline strip at 1366 and 1280, which hid the lead text, stage counts and bars. On phone it sat on top of "Morning, Cody."
2. The Up next list did not scroll. Its grid row grew to fit the content, so rows 22 to 24 were cut off and the card's Call, Text and Skip buttons were pushed under the card edge at 1366x768.
3. At 1366 and 1280 the "8am to 8pm, three calls per home" card was hidden, and so was the Directions label on the map card.
4. Up next addresses and the map stop card used nowrap with an ellipsis, so they could truncate.
5. On phone, the second call pill ("0 of 3 calls in 24h" or "Last: no answer") was hidden. So were "queued for today, closest first", the booked and texts stats, and the calling window. The "why" line was clamped to 2 lines.
6. Phone: the back cards in the stack pressed into the peek bar.
7. Map: the fit padding was fixed numbers rather than the real overlay heights. Pin spacing (30px) was smaller than the current pin plus a neighbour (34px and 26px), which caused one pin overlap at 1366.

## Fixes (deck.html only, dk.css and dk.js untouched)
- One gutter token (`--g`: 28px, or 22px on laptops). The main grid row is bounded (`grid-template-rows:minmax(0,1fr)`), and the bottom padding of the main area matches the column gap.
- The concept label has its own layout row under the pipeline and is set in sentence case in Instrument Sans. On phone it sits in its own line under the stats.
- Up next scrolls inside its panel. Addresses wrap, the current row is scrolled into view, and a fade shows only while rows remain below.
- The roof photo panel flexes (min 118px) so the address, facts, why line, pills and actions always fit.
- The window card and the Directions label stay visible at every desktop size. The map stop card wraps instead of truncating.
- The pipeline lead is a fixed column with balanced wrapping. Each stage is flex 1 with min-width 0.
- The map is fitted between the top pills and the directions card using their measured heights plus 26px. Pin separation is 36px.
- Phone: both call pills, the full subline and a stats line (booked, texts, calling window) are shown, with no clamp on the why line. The card stack inset is 24px. The buttons stay in the thumb zone.

## After (round 3): 0 overlaps, 0 clipped, 0 offscreen, 0 hidden at all five sizes
record.html and personalized.html were re-captured in shots/d50-round-3 and are unchanged, since no shared file was edited.
