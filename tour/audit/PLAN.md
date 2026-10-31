# Roof Command concept: improvement plan

Ranked by what it does for the three goals: immersive, easy, seamless. Effort is S (hours), M (a day or two), L (several days). Plain English. Details and evidence are in `AUDIT.md` and `IA.md`; screenshots in `audit/shots/` and the board at `audit/board.png`.

The short version: the app looks like one product and behaves like five slideshows. Making it one connected app with one set of numbers and buttons that do what they say will do more for "immersive" than any new animation.

---

## A. The big moves (in order)

### 1. One app, one set of facts (L)
What it fixes: nine facts that disagree between screens (May 8 vs Sep 12 as "the" storm; 539,000 vs 492,887 homes; 1,755 vs 1,611 hit; 1.78 vs 1.23 in max; four different pipelines; "12 called" before calling opens; Pickard at New hit on one page and Proposal on another). Every number a roofer sees should come from one storm list, one home list and one pipeline, shared by every screen. The Daily 50 is built from the latest storm, so the map, the list and Nimbus all agree. The Home page shows the home you picked, not a fixed one.
Screens: all. Also removes the orphan `record.html` by folding its Proposal-stage design into Home.
Why first: without this, every other fix polishes a contradiction. Seamless depends on it.

### 2. Real navigation instead of the tab shell (L)
What it fixes: two headers and two nav rows on every screen, no URL per screen, Back that leaves the app or hangs, state that resets on every tab (selected storm, current stop, open sheet), the Desktop/Phone toggle on a real phone, 130 px of shell on a 390 px screen.
How: one header (company, search, Nimbus, you), a left rail on desktop and a bottom tab bar on phone (Today, Storms, Homes, Pipeline, Ask), real routes with URLs (`/today/13`, `/homes/2417-cedar-ridge`, `/storms/2026-09-12`), transitions between screens like the website (16 px rise, 0.4 s ease-out, staggered). Keep the Playwright-friendly deep links.
Screens: shell, all pages.

### 3. Every button does its job, and the three loops close (L)
What it fixes: 29 dead or dead-end controls on the five screens. The three loops a roofer actually runs:
- Storm to list: select a storm, see hardest streets, "Add to Daily 50" really adds, "Plan a route" really draws it.
- List to call: Call opens the dialer (`tel:`), then an outcome row (No answer, Spoke, Booked, Wrong number, Note) that updates the 3-per-24h counter and the pipeline; Text shows the draft and the opt-in state first; Skip asks why or offers undo; Directions opens Maps.
- Call to book: Book opens a date/time picker and writes "Inspection booked" to the home's stage and activity; Next stop and Back to Daily 50 exist on Home.
Screens: Storm map (Open record, Add, Route), Daily 50 (Call, Text, Directions, nav, stages, Find an address), Home (Book, Text, Done, Reschedule, Add a note, activity tabs), Ask (composer, Plan a route, chips).
This is the single biggest move for "easy" and for the first-tap impression.

### 4. Nimbus as the connective layer, not a fifth tab (M)
What it fixes: Ask Nimbus is one fixed question with a composer you cannot type in; the shell chat answers out of context ("what happened overnight" returns a Home screen line) and never opens anything; bubbles rotate random sample news that exists nowhere else and cover page content.
How: Nimbus is a drawer that opens from the orb on any screen with a real input. Answers are cards with sources and actions, and the actions navigate: "show me the Alvarez home" opens that home, "add Lindsey to the Daily 50" adds, "book Thursday 5:30" books. Bubbles only say things that are true elsewhere in the app (a booking that is in the pipeline, a follow-up that is in a task) and link to them. Ctrl K opens the same drawer in search mode everywhere.
Screens: shell, Ask Nimbus (dissolves into the drawer), Storm map (streets panel).

### 5. One information pattern on every page (M)
What it fixes: five headers, four brand marks, three ways to reveal detail, two home record designs, and the duplication that makes pages feel crowded (hail stated three to six times per screen, storm stats in two places on phone, the same answer three times on Ask). Full wireframes are in `IA.md`.
How: primary content fills the stage; secondary panels live in a right rail on desktop and a three-stop bottom sheet on phone, in the same order on every page (Roof, People, Storms, Activity, Notes on a home; Storm detail, Pipeline, Hardest streets on the map; Roof, Route, Pipeline on Today); tertiary detail opens the Home page or Nimbus. One brand line in the footer instead of four pills. Keep every piece of information; change only where it lives.
Screens: all.

### 6. Phone sheets that behave (S to M)
What it fixes: the real overlaps. The Daily 50 roof and route sheets have no background at phone width, so chips, tables and map pins render on top of the card (72 pairs). Home's plane sheet collides with the sticky Call/Text/Book bar and the dock chips (36 pairs). Storm map stats run under the Open record CTA. Ask's pins land on the answer text.
How: every sheet gets a background, a scrim and bottom padding equal to the sticky bar; the sticky bar gets a top fade; sheet content keeps its CTA inside the sheet; map pins hide while a sheet is above half.
Screens: Daily 50 (phone), Home (phone), Storm map (phone), Ask (phone).

### 7. Make the first ten seconds the morning brief (M)
What it fixes: 9 seconds of opening (every time), landing on "No hail in the last 3 days", three greetings (Good evening, Morning, Morning), and Cody learning nothing about overnight.
How: the sculpture plays once per session for 2 to 3 s and dissolves into Today. Today opens with one line ("Monday 7:40. 0 of 50 called, 3 inspections today, 1 call-back due at 5:30, Thursday storm watch") and the first stop. One greeting, from the clock. The long opening stays as "About Roof Command" for demos.
Screens: Opening, Daily 50 header, Storm map header, Nimbus greeting.

### 8. Load once, move fast (M)
What it fixes: 7.2 s to first paint on Home, 6.2 s on Ask, 4.4 s on Daily 50 (cold), and a full reload of Three.js, MapLibre and fonts on every tab switch because each tab is an iframe. Also the 0.9 to 1.1 s Nimbus "thinking" pause before every bubble, and the 2.2 s Storm map intro even on `?recent=1`.
How: one page app (move 2) loads the libraries once and keeps the map and 3D warm; self-host fonts and libraries; skip the intro when a storm is recent or the user is returning; Nimbus pauses only when it is actually fetching.
Screens: all.

---

## B. Quick wins (under an hour each)

1. Give `Call` on the Daily 50 a `tel:` link and stop auto-advancing; show four outcome buttons under it. (Even as a mock, this changes the first impression.)
2. Wire Storm map `Open record` and the Daily 50 address to open Home with `?home=<id>`; make Home read the id and show that address in the title and crumb.
3. Make the Ask Nimbus composer a real `input`; on Enter show the fallback card honestly. Hide `Compare with Aug 21` and `Who picked up yesterday?` until they answer something.
4. Give the Daily 50 roof and route sheets a white background and scrim on phone; add bottom padding equal to the sticky bar on Home's plane sheet. Kills about 100 overlapping pairs.
5. One greeting from the clock on Daily 50 (replace the hard-coded "Morning").
6. Set the Daily 50 header to agree with itself before 8 am: "0 of 50 called" and hide "9 texts sent" unless those homes are opted in.
7. Anchor the Nimbus bubble to the orb with a maximum width, and never over the right rail (fixes the pipeline and measurements overlaps).
8. Remove three of the four disclaimer and brand strips per screen; keep one small footer line.
9. Use one company mark everywhere (the red house, "RD" or "R", pick one).
10. Add `aria-pressed` and real buttons to the Home activity tabs and make the stepper either clickable or clearly static.
11. Rank Norman street results above same-named towns in the Storm map search; include W Lindsey St since Ask Nimbus names it.
12. Hide the shell's Desktop/Phone toggle below 600 px and let the tab row wrap.
13. Explain "12 homes, 4.4 mi" on the route ("this leg of today's 50").
14. Bump tap targets under 44 px on phone (nav tabs 30 px, roof `sq` pills 27 px, chips 33 to 38 px).
15. Make Esc close the Storm map record card and clear the storm on phone.

---

## C. Things to cut

- The Ask Nimbus page as a separate tab (it becomes the Nimbus drawer plus the Storm map's streets panel; nothing in it is lost).
- `record.html` as a second home record design (fold into Home at the Proposal stage).
- The 9 s opening on every Opening click (once per session, 2 to 3 s; keep the long version as About).
- The Desktop/Phone toggle for end users.
- Random Nimbus "news" bubbles that are not backed by data on another screen (claims approved, reviews, Thursday storm watch) until they are.
- The Daily 50 bottom pipeline strip for a storm that is not today's (move to the Pipeline page).
- Three of the four "Concept, sample data" and "Powered by Wing Digital" strips per screen.
- "Compare with Aug 21" and "Who picked up yesterday?" chips until they do something.
- The 0.9 s "thinking" delay before every Nimbus line when nothing is being fetched.
- The three stacked cards behind the current stop on desktop (the queue already shows what is next; keep the swipe on phone).

---

## D. How the IA moves fold in

From `IA.md`, the three organisation changes that matter most are already inside moves 2, 5 and 6 above: one header and nav (2), one rail / sheet pattern with fixed panel order and every fact stated once per screen (5), and sheets with backgrounds and padding (6). The wireframes in `IA.md` are the target layouts; the inventories there are the checklist that nothing is dropped.

## E. Suggested order of work

1. Quick wins 1 to 8 (one morning): the demo stops contradicting itself and the first taps work.
2. Move 1 and move 2 together (one data model, one router, one shell): everything else hangs off these.
3. Move 3 loop by loop: storm to list, list to call, call to book.
4. Moves 4 and 5 (Nimbus drawer, rail/sheet pattern) as the pages are rebuilt on the router.
5. Moves 6, 7, 8 as polish on the rebuilt pages.
