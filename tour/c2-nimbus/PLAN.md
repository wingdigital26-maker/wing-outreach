# c2 Nimbus Copilot: plan (visual-2 Part A, two passes)

## Pass 1: tokens
- Abyss navy #0A1633 (answer bubble, selected card, Cody's question)
- Ink navy #13203F (text on light)
- Cobalt #2757E6 (Wing: swath, selected street, links)
- Mist #EEF2F8 (canvas + map land), Paper #FFFFFF (sheet)
- Slate #5E6A84 (secondary text)
- Roofer accent: Red Dirt brick #B3262E (logo tile, the one primary action)
- Metal: champagne #C9B48A, used once (the ring on the selected street pin)
Type: Manrope only. Answer text 300 at 26px/-0.02em (the type IS the voice of Nimbus); data 700 tabular; labels 500 sentence case.

Layout: map is the canvas (full bleed under a 64px co-brand bar). One tall white "conversation sheet" floats left with Nimbus large (150px, real component) at its head, the real bubble docked to his right. Ranked streets are a horizontal row of cards floating on the bottom of the map (they belong to the map, not to a list). Pipeline lives inside the top bar as a slim proportional strip.
```
[RD Red Dirt Roofing  Roof Command]  [New hit 1,755 |Called|Insp|Prop|Won]  Powered by Wing [mark]
 _______________________                                                  
| Cody: Which streets...|        map (positron restyled navy/cobalt)       
| (NIMBUS 150) [bubble] |        swath bands, weak dots, 5 street lines    
| answer in big light   |                     (1)  (2)                     
| type, sources         |                                    legend       
| [Add 38 homes to D50] |                                                 
| chips / composer      |  [1 card][2 card][3 card][4 card][5 card]       
|_______________________|                                     concept     
```
Left aligned throughout. Phone: bar, map 300px, sheet, cards scroll sideways.

Principles: asking is the navigation (no sidebar, no menu). Nimbus is the one bold thing; everything else quiet. Map dots recede; only the 5 streets carry dark color.

## Pass 2: review against the AI clusters
1. Cream + serif + terracotta: none. Cool mist canvas, sans only, brick is the roofer's own color used once.
2. Near-black + acid accent: no; navy is a true deep blue, not #111.
3. Broadsheet hairlines: removed a hairline-divided answer list I first sketched; sections separate by space and surface.
4. SaaS card kit: radius by hierarchy (sheet 28, street cards 18, chips 999), shadow only on the two floating layers (sheet, card row), not on every element. No gradient washes; swath is 3 solid tint bands.
5. Template chrome: no all-caps eyebrows, no middle-dot meta, no mono numbers, no arrows on buttons, no green dots.
Changed after review: first draft had a vertical ranked list in the sheet (same as the earlier Nimbus frame); moved streets onto the map as a bottom card row so the answer and the map read as one gesture.


## Pass 3 (2026-10-05, Fable "make it excellent" loop, 4 rounds)
Theme change from Jack mid-loop: skin = the Wing Digital WEBSITE (wing-site-v4/style.css tokens). Light cool-grey gradient stage,
white panels with soft shadow, Instrument Sans (self-hosted woff2 in fonts/), IBM Plex Mono held in reserve, blue #2757E6 the only
brand hue, ink #0B1020, muted #465065. The roofer's brick red still tints the ONE primary action and the logo tile. Brass #8A5A00
appears once: the ring on the selected pin.

Structure kept, mechanics replaced:
- Streets follow REAL road geometry. Extracted once from the basemap's OpenMapTiles `transportation_name` tiles (Overpass was down),
  clipped, deduped across tile overlaps, Douglas-Peucker simplified (~5 m), cached in streets.geojson. The page fetches the cache and
  falls back to querySourceFeatures live. The basemap's own labels for those five streets are filtered off so there are no fragments.
- Hail swath is a MapLibre heatmap over a seeded SW-NE field with an uneven core and bent spine, so the edge feathers and the footprint
  is irregular; intensity is kept low so blue stays reserved for the selected street, pins and the Nimbus bubble.
- Nimbus's real bubble is docked into a flex slot beside him (one class + reparent, no pixel positioning) with a CSS tail.
- Selected card grows (flex 1.55) and turns ink; the rest stay white. Legend + Concept label sit low-right, grouped, above the cards.
- Phone is phone-first: full-bleed map, bottom sheet with drag handle and peek / half / full states (drag, tap, arrow keys),
  Nimbus at the head of the sheet, swipe carousel in the first screen, red action in the thumb zone, composer pinned above the home
  indicator with safe-area insets, 44 px targets. Pins spread so none collide at 390 or 430.

Shots: shots/round-N/ (judges.json + vs-prev.png per round), top-level shots/ = latest. Capture: `python shoot.py shots/round-N`,
compare: `python compare.py shots/round-N-1 shots/round-N`.
