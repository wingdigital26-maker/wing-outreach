# Roof Command concept: information organisation audit

Jack's brief: "there is a lot of information and I want to keep the information, but it needs to be organized in a better way because it's hard to navigate and some of it overlaps."

Method: every page and state was shot full-page at desktop 1440x900 and phone 390x844 (`audit/shots/ia/<size>-<page>-<state>.png`, with `-view` for the first viewport and `-annot` for the overlap drawing). Every text node and visual block was inventoried (`audit/ia-data.json`, readable dump in `audit/ia-inventory.txt`). A scripted `getBoundingClientRect` intersection check listed every pair of visible text or media boxes that overlap by more than 4 px and are not parent/child. Red boxes in the annotated shots are text over text; orange is text over a map or 3D canvas (usually intentional layering, listed for completeness). Pairs were then eyeballed; clipped-overflow and off-screen pairs are called out as false positives below rather than silently dropped.

The Storm map was being rebuilt by another agent during this audit. Its inventory below is from the version served at the time (`desk-storm-recent-selected`); the re-shoot of the new version is in `shots/ia/*-storm-NOW-*` and its differences are noted.

Nothing is proposed for removal. Every item in the inventories is kept; the proposal only changes where it lives: primary (always visible), secondary (one tap: tab, drawer, expandable row, hover) or tertiary (the home's own page, or Nimbus).

---

## The pattern to use everywhere

The five screens today use five headers, four brand marks, three ways to reveal detail (side card, bottom sheet, tab) and two different "home record" designs. One pattern, applied to all pages:

```
DESKTOP (1440)                                       PHONE (390)
+------------------------------------------------+   +----------------------------+
| [Mark] Red Dirt Roofing   [Search  Ctrl K]  (N) |   | [Mark] Red Dirt   [Q] (N)  |
+-----+------------------------------------------+   +----------------------------+
| Tod |                                          |   |                            |
| Sto |            PAGE CONTENT                  |   |        PAGE CONTENT        |
| Hom |     (primary, fills the stage)           |   |                            |
| Pip |                                          |   |                            |
| Ask |  [right rail: secondary panels, 360 px]  |   |  [bottom sheet: secondary] |
|     |                                          |   |                            |
+-----+------------------------------------------+   +----------------------------+
                                                     | Today Storms Homes Pipe Ask|  <- tab bar
                                                     +----------------------------+
```

- One header: company mark and name on the left, one search box in the middle (addresses, streets, storms, people; Ctrl K everywhere), the Nimbus orb and the signed-in avatar on the right. Brand, disclaimer and "Powered by Wing Digital" collapse into one small line in the footer or the avatar menu, not four pills per screen.
- One nav: a left rail on desktop, a bottom tab bar on phone. Today (Daily 50), Storms, Homes, Pipeline, Ask. The shell's tab strip, the Daily 50's own tab strip and the Desktop/Phone toggle go away (the toggle can live in a tiny dev menu).
- One way to reveal detail: a right rail on desktop (360 px, panels stack, each panel has a title and an optional "Open" link), a bottom sheet on phone with three stops (peek, half, full) and a scrim. Sheets always have a background.
- One home record: the Home page is the single detail page. Storm map cards, Daily 50 cards and search results all open it. The `record.html` design (tabs, Proposal stage, next-task panel with "Call now") is folded into Home as the Pipeline-stage variant, not a second page.
- Numbers come from one source: one storm list, one home list, one pipeline. A number that appears on two screens is the same number.

---

## Page 1: Opening (`1a-storm-intro.html`)

### Inventory (12 items)
Wing Digital wordmark; "Roof Command" and "Red Dirt Roofing" nav labels; the logo sculpture with falling hail (canvas); company mark; "Red Dirt Roofing" title; "Roof Command by Wing Digital"; "539,000 homes watched across 7 counties"; "Last storm Sep 12, 1,755 homes hit"; "Concept, sample data" pill.

### Problems
- No overlaps (the only orange pairs are the caption over the canvas, intentional).
- It carries two facts (539,000 homes, 1,755 hit) that other screens contradict (492,887 and 1,611 on the map now).
- 9 seconds, every time Opening is clicked, with nowhere useful to land. The facts fade in at 1.5 s and are gone by 9 s.

### Proposed organisation
Primary: the sculpture plays once per session (2 to 3 s), then dissolves into Today. Secondary: the two facts become the first two tiles of the Today brief, so they are read, not watched. Tertiary: the full-length piece stays as an "About Roof Command" page reachable from the avatar menu, for demos.

---

## Page 2: Storm map (`1b-storm-theater.html`)

### Inventory (44 distinct text items, old version; the new version adds county chips, 3D/zoom, roof-outlines toggle, a search box with suggestions, and 22 storms)
Header: company mark, "Red Dirt Roofing", "Norman and south OKC", "Good evening, Cody", "Last storm Sep 12, 23 days ago" / "2 days since the Sep 12 storm", "Roof Command by Wing Digital", ask bar "Ask about any storm, street or home" with "Ctrl K".
Left card (service area): "Your service area", "No hail in the last 3 days", "Last storm Sep 12, 23 days ago. 1,755 homes took 1 inch hail or larger", button "Show the Sep 12 storm". When a storm is selected: "Storm of Saturday, Sep 12, 2026", "Clear", big "1,755", "homes hit by 1 inch hail or larger", "1.78 in largest hail, radar", "2 days since the storm", legend "Hail size by home, taller is larger, 1 in / 1.25 / 1.5 / 1.75 in+".
Right card (home): address and town, "Owner on file", "Built 1986", status chip "New hit, not yet called", three tiles (hail here, roof size, roof age), timeline ("Storm hit, 1.51 in hail, Sep 12"; "Next: call from the Daily 50, Task for Cody"), button "Open record", close.
Bottom left: "Storms this season" timeline with ticks, labels Jul 11, Aug 7, Aug 16, 17, Aug 21, Sep 12 and a readout chip "1,755 homes, 1.78 in hail".
Bottom right: "Season pipeline, all storms" or "Sep 12 pipeline": New hit, Called, Inspection, Proposal, Won with counts.
Footer: map attribution, "Storm Map concept. Sample storms, homes and pipeline".
Phone adds: storm chips row ("Your area, all homes", "Sep 12, 1,755 homes", ...), a bottom sheet with the home record and, below it, the storm stats again, and a sticky "Open record, 833 NE 27th St" CTA.

### Problems
- Overlaps (desktop): none text-over-text. Phone, storm selected: the sheet's storm section ("Storm of Saturday, Sep 12, 2026", big "1,755", "homes hit by 1 inch hail or larger") runs under the sticky Open record CTA; 3 genuine pairs. `shots/ia/phone-storm-recent-selected-annot.png`.
- Duplicate: the storm stats appear in the left card and again inside the phone sheet under the home record. "Last storm Sep 12, 23 days ago" appears in the header and in the left card. Home count appears in the left card, the timeline readout chip and the pipeline "New hit".
- Hierarchy: the left card's "1,755" at 80 px is the loudest thing on screen, yet the question a roofer has is "where" and "who", which are the map and the right card. The right card's "Open record" is the only red button on the page and it does nothing.
- Hard to find: the pipeline for one storm vs all storms toggles silently when you select a storm; the label changes but nothing else signals it. Street-level ranking does not exist here (it lives on Ask Nimbus).
- The 9 px attribution and the concept pill sit on the map edge where the phone sheet handle lives.
- Map now: the home card for an unhit home ("0 in hail this season, No outline, Not on file") has the same weight as a hit home; the bottom toolbar (county chips, 3D, +, -, Roof outlines) is a third row of controls competing with the timeline.

### Proposed organisation (keeps everything)
Primary (always visible): the map; the one-line status in the header ("2 days since Sep 12, 1,611 homes hit, 1.23 in max"); the storm timeline as a slim strip along the bottom with the selected storm's readout; the selected home card in the right rail (phone: bottom sheet) with Open record live.
Secondary (one tap): the storm detail (the 1,755 headline, largest hail, days since, hail-size legend) becomes the top panel of the right rail when a storm is selected and nothing else is; the pipeline (storm or season) is the second panel with a visible "This storm / Season" switch; the hardest-hit streets list (from Ask Nimbus) is the third panel, each row with "Add to Daily 50". County chips, 3D and roof outlines move into one "Layers" button on the map.
Tertiary: full home record on Home; "Compare with Aug 21" and street history via Nimbus.

```
DESKTOP                                              PHONE
+--------------------------------------------------+ +----------------------------+
| mark  Red Dirt Roofing | 2 days since Sep 12 ... | | mark Red Dirt  [Q] (N)     |
+-----+----------------------------+---------------+ +----------------------------+
| nav |                            | Sep 12 storm  | | [Sep 12 ▾][Aug 21][Aug 17] |
|     |          M A P             | 1,611 hit     | |                            |
|     |     (towers / footprints)  | 1.23 in  2 d  | |          M A P             |
|     |                            | legend        | |                            |
|     |                            |---------------| |                            |
|     |                            | Pipeline      | |                            |
|     |  [Layers] [+][-]           | storm|season  | | [Layers]            [+][-] |
|     |                            |---------------| +----------------------------+
|     +----------------------------| Hardest streets| | ▬ 833 NE 27th St  1.51 in |  <- sheet peek
|     | timeline  Mar .. Sep 12    | Lindsey  64 + | |   New hit · Open record    |
+-----+----------------------------+---------------+ | Today Storms Homes Pipe Ask|
                                                     +----------------------------+
```
Phone sheet, half: home tiles and timeline. Full: storm detail, pipeline and streets as collapsible sections below the home. The CTA stays inside the sheet, never over its text.

---

## Page 3: Daily 50 (`c4-command-deck/deck.html`)

### Inventory (104 distinct text items)
Header: mark "R", "Red Dirt Roofing", "Norman and south OKC", tabs Today / Pipeline / Map / Homes / Storms, "Find an address", "Powered by Wing Digital", avatar "C".
Hero: "Morning, Cody.", "50 homes from the May 8 hail are queued for today, closest first. Calling opens at 8am.", card "8am to 8pm, Three calls per home in 24 hours, every one tapped by you.", "3 inspections booked", "9 texts sent", ring "12 of 50 called".
Left: "Up next", "38 left today", queue rows (number, short address, best time, hail inches) for stops 13 to 24 visible, "Ordered by route, then best time to call."
Centre card: roof drawing, "1.32 in hail" pill, "13 of 50" pill, "23.6 squares, 5/12 pitch, measured from the drawing (sample)", `23.6 sq` expand button, "413 S. Pickard Avenue", "New hit" chip, "Norman, OK 73069. Owner on file.", tiles Hail at home 1.32 in / Roof age 21 yrs, 2005 / Best time 4 to 6 pm, why-line "Hit on May 8. No roof permit on file since 2005. Two homes on Pickard Avenue booked inspections this week.", chips "No calls yet", "0 of 3 calls in 24h", buttons Call / Text / Skip. Two more cards stacked behind.
Right: knock route map, pills "Knock route", "12 homes", "4.4 mi", numbered stops, footer "Stop 13, 413 S. Pickard Ave, Then 1211 Ann Arbor Dr, 2 min", "Directions".
Bottom: pipeline strip "1,750 homes hit, May 8 hail, 2.50 in max, Cleveland County, 1 in and up", tiles 1,688 New hit / 38 Called / 14 Inspection booked / 6 Proposal / 4 Won.
Footer: "Concept. Storm date and home count from the Roof Command MRMS catalog. Pipeline counts, call notes and 'why this home' lines are sample."
Sheets (phone): Knock route, Pipeline, Roof (address, drawing with compass and 20 ft scale, chips Planes / Edges / Dimensions / Hail, table of planes with pitch, area, squares, totals, "Ridge 82 ft, hip 0 ft, valley 29 ft, eave 125 ft, rake 88 ft. Suggested waste 12%.").

### Problems
- Overlaps (desktop): the 10 flagged pairs are queue rows 22 to 24 under the "Ordered by route" footer and the pipeline strip. These are clipped by `overflow` and not visible: **false positives**. `shots/ia/desk-daily-default-annot.png`.
- Overlaps (phone, roof sheet open): 52 genuine pairs. The sheet has no background at this width, so its chips sit on the card's Hail / Roof age / Best time tiles and its table rows sit on the why-line. `shots/ia/phone-daily-roof-sheet-annot.png`.
- Overlaps (phone, route sheet open): 20 genuine pairs; stop markers render through the card. `shots/ia/phone-daily-route-sheet-annot.png`. The pairs "Knock route / Pipeline / Roof" headers at y 876 are off-screen sheet titles: false positives.
- Duplicates: the hail figure appears three times on one card (pill, tile, why-line); the stop number appears in the queue row, the card pill and the map marker; "12 of 50 called" in the ring and "38 left today" in the queue say the same thing; the storm sentence in the hero and the pipeline strip repeat "May 8".
- Clutter: the hero takes 140 px to say "Morning" plus two sentences, a rules card and three stats. The bottom pipeline strip for a May 8 storm is unrelated to today's calling and is half cut off at 900 px. Two nav rows (shell tabs above, page tabs below).
- Unclear hierarchy: the Call button is the job, but it is the eighth thing down the card. The three stacked cards behind hint at swiping but the queue on the left is the real list.
- Hard to find: there is no way to open the full home; the roof sheet is behind a tiny "23.6 sq" pill; the route's 12 homes vs the queue's 50 is unexplained.

### Proposed organisation (keeps everything)
Primary: the current stop card with address, owner, best time, hail and the three actions (Call, Text, Skip) above the fold; the queue (phone: a "Up next, 38 left" peek row that opens the list); the one-line day status ("12 of 50 called, 3 booked, next window 4 to 6 pm") in the hero replacing the ring, rules card and two stats.
Secondary: the knock route (right rail panel on desktop; Route sheet on phone) with Directions live; the roof measurement as a panel under the card (desktop) or the Roof sheet (phone) with a background and an "Open home" link; the pipeline strip becomes a Pipeline panel in the rail (and the Pipeline nav item); the calling rules ("8am to 8pm, 3 per 24h") become a hover or an info line under the Call button, shown in red only when a limit is near.
Tertiary: the full home (Home page) from the address; the "why this home" explanation expands on tap; the day's call log via the Pipeline page or Nimbus.

```
DESKTOP                                              PHONE
+--------------------------------------------------+ +----------------------------+
| mark Red Dirt Roofing   [Search Ctrl K]   (N) C  | | mark Red Dirt   [Q] (N)    |
+-----+------------------------+-----------------+ +----------------------------+
| nav | Today · 12 of 50 called, 3 booked, 4-6 pm | | Today · 12/50 · 3 booked   |
|     +------------------------+-----------------+ +----------------------------+
|     | Up next (38)           | STOP 13 of 50   | | STOP 13 of 50     1.32 in  |
|     | 13 413 S Pickard  4-6  | 413 S. Pickard  | | 413 S. Pickard Avenue  >   |
|     | 14 1211 Ann Arbor 5-7  | owner · 4-6 pm  | | owner on file · best 4-6pm |
|     | 15 ...                 | [Call][Text][Skip]| | why this home ... (more)   |
|     |                        | why this home   | | [   Call   ][Text][Skip]   |
|     |                        |-----------------| +----------------------------+
|     |                        | Roof 23.6 sq  > | | ▬ Up next 38 · Route 4.4mi | <- peek
|     |                        | Route 4.4 mi  > | +----------------------------+
|     |                        | Pipeline      > | | Today Storms Homes Pipe Ask|
+-----+------------------------+-----------------+ +----------------------------+
```
Call opens the dialer (tel:) and then an outcome row (No answer / Spoke / Booked / Wrong number / Note) that must be answered before the next card. Text shows the draft and the opt-in state before anything is sent.

---

## Page 4: Home (`c5-home/index.html`) and the orphan `record.html`

### Inventory (147 items, Home)
Header: "RD", "Red Dirt Roofing", "Roof Command", crumb "Sep 12 hit list / 2417 Cedar Ridge Ln", "Concept, sample data", "Powered by Wing Digital".
Title block: "2417 Cedar Ridge Ln", "Called" chip, "Norman, OK 73069", "Owner on file", "Assigned to Cody", buttons Call / Text / Book / More.
Stepper: New hit (Sep 12, 1.75 in hail) / Called (Sep 15, voicemail left) / Inspection booked (Not yet) / Proposal (After inspection) / Won (Signed contract).
Stage: "25.1 squares, hip roof, 6/12", "Drag to turn the house. Click a plane to measure it.", 3D house with pins A to G (squares, pitch), chips Planes / Edges / Dimensions / Hail, Whole roof, Explode, hail legend ("1.75 in hail, Sep 12, 79 marks, on front slope and garage west").
Activity panel: tabs All / Calls / Texts / Notes; events Sep 15 Call no answer (5:42 pm, voicemail, 1 of 3 calls, by Cody), Sep 13 Added to the Sep 12 hit list (7 planes drawn), Sep 12 Storm hit this home (1.75 in), Aug 7 Earlier storm (1.25 in).
Notes panel: note card ("Two trucks in the drive... Neighbor at 2421 already has a new roof", Cody, Sep 15), "Add a note".
Right rail: Measurements (Total 25.1 sq, Pitch 6/12, Planes 7; table of 7 planes with pitch, area, squares; total; method note), Next task ("Call back after work hours", Thu Oct 8 5:30 pm, Cody, Done / Reschedule), Contact (Owner on file, Phone ends 18, Texts not opted in, Calls in 24h 1 of 3, Storms over this roof Sep 12, Aug 7).
Phone adds a sticky Call / Text / Book bar and a plane bottom sheet (plane name and pitch, squares, area line, edge list, hail line).

`record.html` (122 items) is the same record for 413 S. Pickard at the Proposal stage with a different header (tabs), a crumb "Pipeline / Proposal", a 2D roof drawing with compass, a Next task panel with "Call now" and "Reschedule", an order line ("Order 27.1 squares with 15% waste..."), a longer activity (proposal sent, inspection done with 14 photos, booked, talked 6 min, no answer, storm hit), Contact with "Texts opted in Sep 19", and a mono uppercase "CONCEPT. STORM DATE AND HOME COUNT FROM THE ROOF COMMAND MRMS CATALOG..." line floating in a 250 px gap inside the roof panel.

### Problems
- Overlaps (desktop): none text-over-text. Pins over the 3D view are intentional.
- Overlaps (phone, default): the sticky Call / Text / Book bar covers the Activity timeline as you scroll (12 pairs, by design but the bar has no top fade, so lines are cut mid-glyph). `shots/ia/phone-home-default-annot.png`.
- Overlaps (phone, plane selected, hail mode): 36 genuine pairs. The plane sheet's hail line sits under the sticky bar; the hail pin on the 3D view sits on the sheet's "6.5 squares"; the Planes / Edges / Dimensions / Hail chips and Whole roof button show through the sheet. `shots/ia/phone-home-plane-selected-hail-annot.png`.
- Overlaps (record.html phone): the mono concept line sits on the crumb; the Next task pill sits under the sticky Call. 5 pairs. `shots/ia/phone-daily-record-default-annot.png`.
- Duplicates: the hail fact (1.75 in, Sep 12) appears in the stepper, the legend, the pin, the plane sheet, the activity and Contact ("Storms over this roof"). The stage appears as a chip, the stepper and the activity. Call appears twice on phone (header and sticky bar). Two whole pages for one record.
- Hierarchy: the 3D house is the hero, which is right for a demo, but the rep's next action (Next task: call back Thu 5:30 pm) is below the fold on the right. The stepper looks like tabs and does nothing.
- Hard to find: the measurement table is excellent but a proposal cannot be started from it; the owner's name is nowhere; the Notes panel is on the left under Activity on desktop, at the very bottom on phone (page height 2,464 px).

### Proposed organisation (keeps everything)
Primary: address, owner name, stage chip, assigned rep; the action row (Call, Text, Book, Note, More) once, sticky on phone; the Next task line directly under the title ("Call back Thu Oct 8, 5:30 pm, Cody: Done / Reschedule"); the 3D roof (stage) with its view chips.
Secondary (one tap, same positions on every record): right rail panels in a fixed order, Roof (measurements, order line, "Start proposal"), People (Contact: owner, phone, opt-in, calls in 24h), Storms over this roof (Sep 12 1.75 in, Aug 7 1.25 in, each linking to the Storm map), Activity (with its filter tabs as real buttons), Notes. On phone these are collapsible sections under the stage, in the same order, with a sticky section index.
Tertiary: the full plane sheet (edge list, marks) on tap of a plane or table row; the stepper's stage details on tap; the proposal itself.
The `record.html` variant becomes the same page at the Proposal stage: same header, same rail order, Next task reads "Follow up on the proposal", Roof panel gains the order line and photos.

```
DESKTOP                                              PHONE
+--------------------------------------------------+ +----------------------------+
| mark Red Dirt Roofing   [Search Ctrl K]   (N) C  | | < Daily 50 · stop 13 of 50 |
+-----+------------------------+-----------------+ +----------------------------+
| nav | 2417 Cedar Ridge Ln  Called · Cody        | | 2417 Cedar Ridge Ln  Called|
|     | Maria Alvarez · ends 18 · texts: not yet  | | Maria Alvarez · not opted in|
|     | Next: call back Thu 5:30 [Done][Resched]  | | Next: call back Thu 5:30 pm|
|     +------------------------+-----------------+ +----------------------------+
|     |  3D ROOF  25.1 sq 6/12 | Roof          > | |        3D ROOF             |
|     |  [Planes][Edges][Dims] | table, order    | | [Planes][Edges][Dims][Hail]|
|     |  [Hail] [Whole][Explode]| [Start proposal]| +----------------------------+
|     |                        | People        > | | Roof · People · Storms ·   |
|     |                        | Storms        > | | Activity · Notes  (index)  |
|     |                        | Activity      > | | ... sections ...           |
|     |                        | Notes         > | +----------------------------+
|     | [< prev stop]  [next stop >]              | | [Call][Text][Book][Note]   | <- sticky
+-----+------------------------+-----------------+ +----------------------------+
```

---

## Page 5: Ask Nimbus (`c2-nimbus/index.html`)

### Inventory (83 items)
Header: mark, "Red Dirt Roofing", "Roof Command, Norman OK", pipeline bar with 1,755 New hit / 214 Called / 31 Inspection booked / 12 Proposal / 5 Won, "Powered by Wing Digital", avatar.
Left panel: question bubble "Which streets got hit hardest Sep 12?" ("Cody, 7:42 am"), Nimbus orb with speech bubble ("W Lindsey St got it worst: 64 homes, hail up to 1.78 in. 14 still need a call."), answer paragraph, source line ("From radar hail estimates for Sep 12 and your call log. Owner on file for every home; inspect before quoting."), fact tiles (1,755 homes hit / 1.78 in max hail / 237 on these five streets), buttons "Add 38 homes to Daily 50", "Plan a route", chips "Compare with Aug 21", "Who picked up yesterday?", composer "Ask Nimbus about a storm, street or home" with send.
Map: swath, home dots, numbered pins 1 to 5, "Concept. Street counts illustrative", legend "Max hail 1.78 in".
Street cards: 1 W Lindsey St 64 homes hit, max 1.78, not called 14; 2 24th Ave SW 52 / 1.74 / 13; 3 S Berry Rd 47 / 1.71 / 11; 4 W Boyd St 41 / 1.66 / 9; 5 W Imhoff Rd 33 / 1.58 / 7; each "Owner on file for all 64. Tap a home on the map for the record."

### Problems
- Overlaps (desktop): none text-over-text; the street cards and legend sit on the map by design.
- Overlaps (phone, sheet full): 8 genuine pairs. Pins 1 to 5 sit on the Nimbus speech bubble and the answer paragraph; the concept pill overlaps the question bubble. `shots/ia/phone-ask-sheet-full-annot.png`.
- Duplicates: the same answer is given three times on one screen (speech bubble, answer paragraph, street card 1), the pipeline bar repeats the Storm map's with different numbers, the fact tiles repeat the Storm map's left card.
- Clutter: on phone the page is a map with a 60% sheet and a floating "Which streets got hit hardest" chip; the Nimbus orb, speech bubble, answer and five cards all fight for the first 400 px.
- Hierarchy: a fixed screen for one question presented as an open assistant; the composer looks typeable and is not.
- Hard to find: "Who picked up yesterday?" and "Compare with Aug 21" promise content that does not exist anywhere.

### Proposed organisation (keeps everything)
Primary: this screen stops being a page and becomes the Nimbus panel that opens from the orb on any screen (right drawer on desktop, bottom sheet on phone), with a real input at the bottom. The street ranking with its pins is the Storm map's "Hardest streets" panel (see Page 2); tapping a street highlights it on whatever map is open.
Secondary: each answer card keeps its source line, fact tiles and actions ("Add to Daily 50", "Plan a route"), rendered as a card in the conversation; actions change the real Daily 50 and open the Route sheet.
Tertiary: "Compare with Aug 21" and "Who picked up yesterday?" become real follow-up answers (storm comparison on the map; yesterday's call log from Pipeline), or are dropped from the chips until they exist.

---

## Page 6: the shell (`product.html`)

### Inventory (10 items)
"Roof Command", "by Wing Digital", tabs Opening / Storm map / Daily 50 / Home / Ask Nimbus, Desktop / Phone, the iframe, the caption ("Today's calls, one card at a time, in knock-route order. Concept: sample data."), the Nimbus orb and its bubble.

### Problems
- The Nimbus bubble is positioned by the shell and lands on page content: on the pipeline numbers of the Storm map (`shots/desk-cody-03-after-intro.png`) and on the measurements table of Home (`shots/desk-cody-07-tab-home.png`).
- On a real phone the shell header is 130 px tall, the tab row scrolls horizontally with no hint, and the orb covers the caption (`shots/phone-cody-03-after-intro.png`).
- Two headers and two nav rows on every screen (shell plus page).

### Proposed organisation
The shell dissolves into the single header and nav described at the top. Nimbus docks in the header; bubbles anchor to the orb and never cover the rail. The caption text becomes the empty state of the Nimbus panel. Desktop/Phone becomes a developer toggle hidden behind a key.

---

## Overlap summary (genuine, after eyeballing)

| Page / state | Desktop | Phone | Cause | Shot |
|---|---|---|---|---|
| Storm map, storm + home selected | 0 | 3 | storm stats duplicated in the sheet run under the CTA | `shots/ia/phone-storm-recent-selected-annot.png` |
| Daily 50, default | 0 (10 false positives, clipped queue) | 0 (12 flagged, all off-screen or inline) | | `shots/ia/desk-daily-default-annot.png` |
| Daily 50, roof sheet | 0 | 52 | sheet has no background on phone | `shots/ia/phone-daily-roof-sheet-annot.png` |
| Daily 50, route sheet | 0 | 20 | same | `shots/ia/phone-daily-route-sheet-annot.png` |
| record.html | 0 | 5 | mono concept line on crumb; task pill under sticky bar | `shots/ia/phone-daily-record-default-annot.png` |
| Home, default | 0 | 12 (sticky bar over timeline, no fade) | | `shots/ia/phone-home-default-annot.png` |
| Home, plane + hail | 0 | 36 | sheet vs sticky bar and dock chips; pin vs sheet | `shots/ia/phone-home-plane-selected-hail-annot.png` |
| Ask Nimbus, sheet full | 0 | 8 | pins over text; concept pill over question | `shots/ia/phone-ask-sheet-full-annot.png` |
| Shell | bubble over pipeline (Storm) and table (Home) | orb over caption | shell-positioned bubble | `shots/desk-cody-07-tab-home.png` |

Desktop has no text-on-text overlap; the problem is duplication and five different layouts. Phone has real overlaps wherever a sheet or sticky bar was added without a background, scrim or bottom padding.
