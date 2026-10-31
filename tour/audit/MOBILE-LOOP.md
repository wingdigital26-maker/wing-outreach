# Phone loop: Roof Command tour at 390x844

Shell: `product.html?nointro=1` at 390x844 (dpr 2, touch), clock Mon 2026-10-05 10:00 Central, `rc.t.*` cleared first.
Shoot + checks: `python tour/audit/_mobile_round.py <round>` (shots `audit/shots/m<round>-<screen>.png`, report `audit/m<round>-report.json`).
Checks per screen: zero console and page errors across frames, zero overlapping visible leaf text/controls (shell and frame), tap targets under 44 px listed, the Daily 50 card's address + Call inside the viewport, the chat input inside the viewport.
Nav checks (round 0): `python tour/audit/_nav_check.py`.

## Round 0: seamless navigation + one set of facts (commit b8066ba)
- Frames post `{type:'route'}` when they move on their own (next stop, next home, storm picked on the timeline); the shell mirrors it into the hash with `replaceState`, never reloading the frame. Frames answer the shell's route message with a `routed` ack, so Daily 50 "Open home" for stop 3 then stop 4 switches the Home frame in place (a window marker survives, history length unchanged).
- `RC.go('home',{id})` outside the shell writes `?home=`; Home reads `?home=` and `?id=`.
- Storm map strip "Season pipeline" (hashed sample counts) replaced by "Your pipeline" from `RC.pipeline()`; the record stage is `RC.stage`. Default Home has no invented voicemail, next task or note; empty states read "No calls yet". Daily 50 header, cards and footer count the stops actually queued (12); Nimbus reads the same queue (`RC.queue`).
- Desktop re-shots: `r0-storm-1440.png`, `r0-daily-1440.png`, `r0-home-1440.png`.

## Round 1: the shell gets out of the way (390x844)
What I saw (before, `m1-*` from the first shoot, now overwritten):
1. The shell ate 160 px of an 844 px phone: two header rows plus a two-line caption strip, and the fifth tab ("Ask Ni...") was cut off. The Daily 50 card's Call bar sat 2 px below the frame, under the Route/Pipeline peek: no Call button in view on the one screen that exists to call.
2. The morning brief said "0 of 50 called" while the header said 0 of 12 (the brief fired before the deck loaded).
3. Nimbus sat bottom-right over every screen's own thumb-zone controls (Skip, Open record, Book).
4. Home's stop strip said "Stop 1 of 50" with "Back to Daily 50" and "Next stop" wrapping to two lines inside pills.
5. Ask page street pins were 30 px targets; the composer input 20 px tall.

Fixed:
- Shell (`product.html`): caption strip hidden on phone, header 8 px padding, Opening tab hidden (the opening still plays once per session), short labels (Storms, Daily 50, Home, Ask) that fill the row, sub-line is the service area alone. Frame height 685 -> 723 px.
- Nimbus (`lib/nimbus-shell.js/.css`): on narrow screens the orb lives in a header slot (scaled to 46 px), the bubble hangs under the header full width, the chat is a sheet under the header with the input at 44 px and `visualViewport` resize keeps it in view when the keyboard is up.
- Morning brief waits for the Daily 50 frame to load, so it states the real queue ("0 of 12 called").
- Daily 50 phone (`c4-command-deck/deck.html`): the deck's own bar hidden inside the shell, "called today" joins the stats line, calling-window and concept lines hidden on phone (the Call button carries the window, every sample pill stays), roof art 36%, the main column clips so nothing slides under the peek. Address, hail, roof and Call all in view (Call bottom 611 of 723).
- Home (`c5-home/rec.js`, `home.css`): "Stop 1 of 12" from `RC.queue()`, pills "Daily 50" / "Next" that never wrap.
- Ask (`c2-nimbus/index.html`): pins get a 44 px hit area (`::before`), composer input 44 px / 16 px type.

After: `m1-opening`, `m1-brief` (Daily 50 with the brief), `m1-daily-roof-sheet`, `m1-storm`, `m1-storm-sep12`, `m1-storm-record` (dpr 1: the record over the map plus the orb crashes the software GPU at dpr 2; the direct page shoots fine at 2), `m1-home`, `m1-home-plane-sheet`, `m1-ask`, `m1-nimbus`.
Checks: 0 overlaps on every screen, 0 console/page errors, tap targets under 44 px: Home "Hail" chip 39 px wide; Ask pins report 30 px rects (hit area is 44 via `::before`).

Remaining, ranked:
1. Storm record sheet at half height cuts the "Next: ..." task line under the CTA fade (scrollable, but the first read is a clipped line).
2. Daily 50 card states hail twice (top-left pill and the facts row).
3. Home "Hail" chip 39 px wide; Home address line carries two "sample" pills.
4. Not yet spot-checked at 360x780 and 430x932.

## Round 2: the second read, plus 360x780 and 430x932
What I saw: at 360 the Daily 50 facts label "Hail at home" clipped to "Hail at hom"; hail was stated twice on the card; the storm record's "Next:" task line sat under the pinned CTA at half height; Home's head carried two "sample" pills and a 39 px "Hail" chip. 430x932 was clean (more air between the chips and the Call bar, nothing wrong).
Fixed:
- Daily 50 (`deck.html` CSS): hail pill on the roof art hidden on phone (the facts row states it, the sub-line says sample); at <=380 px the facts labels shrink to 10.5 px and the Skip pill gives up a little width.
- Storm map (`1b-storm-theater.html` CSS): with a home selected the sheet body pads 104 px so the last timeline line scrolls clear of the CTA; the CTA fade is a short gradient instead of a 80 px white block.
- Home (`home.css`): chips never under 44 px wide, the owner's second "sample" pill hidden on phone (the address keeps one).
After: `m2-brief`, `m2-daily-roof-sheet`, `m2-storm-record`, `m2-home`, `m2-home-plane-sheet`, `m2-360x780-brief`, `m2-360x780-daily-roof-sheet`, `m2-430x932-brief`, `m2-430x932-daily-roof-sheet`.
Checks: 0 overlaps and 0 errors on every screen at all three sizes; 0 targets under 44 px on daily, storm, home.
Note: `m2-storm-record` caught the sheet mid-rise (the software GPU lags the compositor); the measured sheet/CTA rects are right (CTA at 659 of 723, body padded).
Not mine to change (owned by other agents): `dk.js`, `data/*`, `home.js`, every script/link/preload tag, vendor, sw.js, st-homes.js. Nothing in this round needed them.

Remaining, ranked:
1. Home head on phone spends a line on "Assigned to Cody"; the 3D stage could be taller.
2. Daily 50 at 430x932 leaves ~120 px of air between the chips and the Call bar; the roof art could grow with the height.
3. Nimbus chat with the real keyboard up is handled by a visualViewport resize hook; not verifiable headless.

## Round 3: taller phones use their height
Fixed:
- Daily 50 (`deck.html` CSS): the roof art is a flex child (36% basis, 46% cap) so on a 430x932 phone it grows instead of leaving air above the Call bar; the card body stops stretching.
- Home (`rec.js`, `home.css`): "Assigned to Cody" gets a class and is hidden on phone (the header already names the rep), so the head is one line shorter.
- Shoot script: `ONLY=` without `opening` goes straight to `#/daily` (the software GPU needs 100 s+ for the opening shot when the box is loaded).
After: `m3-430x932-brief`, `m3-430x932-daily-roof-sheet`, `m3-home`, `m3-home-plane-sheet`.
Checks: Daily 50 at 430x932 0 overlaps, 0 errors, 0 small targets.
Seen, not mine: `m3-home` shows an empty 3D stage, no squares headline and no icons in the Call/Text/Book bar, and the overlap check flags the Next task pill under the sticky bar. That is the uncommitted `c5-home/home.js` rewrite in this worktree (real measured roofs from footprints, owned by the engineering agent); `m2-home` from the committed state is clean. Re-run `ONLY=home python tour/audit/_mobile_round.py 4` once that lands.

## Round 4: Ask and Nimbus
What I saw: on phone the Ask page's map credit opens expanded until the tiles are idle (slow network or GPU) and lands on the "Concept" tag (2 overlapping pairs); the Nimbus chat sheet had no scrim, so it floated over the page.
Fixed:
- Ask (`c2-nimbus/index.html` CSS): the compact map credit stays collapsed on phone unless tapped or focused.
- Nimbus (`lib/nimbus-shell.css`): the chat sheet carries its own scrim on narrow screens (box-shadow spread, no extra element).
After: `m4-ask`, `m4-nimbus`, `m4-brief`, `m4-daily-roof-sheet`, `m4-storm`.
Checks: ask, nimbus, daily, daily-roof-sheet, storm: 0 overlaps, 0 errors; chat input 44 px tall at 426-470 of 844. `m4-storm-sep12` crashed the software GPU during the evaluate (same screen passed in rounds 1 and 2; no storm CSS changed since).
Nav: `_nav_check.py` passed on desktop and phone after round 0; rounds 1 to 4 changed CSS and layout only, no routing.

## What I would do next
1. Re-shoot Home (`ONLY=home ... 5`) once the measured-roof `home.js` lands; check the plane sheet still clears the Call/Text/Book bar.
2. Real-device pass for the keyboard: the chat and the Ask composer rely on `visualViewport` resize; confirm on iOS Safari.
3. Daily 50 phone: a swipe hint on the first card (the card stack is swipeable but nothing says so).
4. Storm map phone: the record sheet's three stat tiles ("No outline", "Not on file") could collapse to one line when the home has no footprint.
