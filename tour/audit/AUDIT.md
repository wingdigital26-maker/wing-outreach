# Roof Command concept: functional audit

Date: 2026-10-05. Audited by driving the app in Playwright (Chromium, headless) at desktop 1440x900 and phone 390x844, both through the shell (`product.html`, Desktop and Phone modes) and each screen opened directly at phone size. Every visible button, chip, toggle, link and shortcut was clicked; state was fingerprinted before and after. Screenshots are in `audit/shots/` (behaviour) and `audit/shots/ia/` (full pages, annotated overlaps). Raw logs: `audit/log-all.json`, `audit/log-followup.json`, `audit/ia-data.json`.

Read-only audit. No app file was touched.

**Moving target.** Another agent rewrote the Storm map (`1b-storm-theater.html` + new `lib/st-map.js`, `lib/st-data/`) at about 15:09 while this audit ran. Findings marked **(old map)** come from the version served until then (6 storms, 1,755 homes, `shots/desk-storm-*`). Findings marked **(map now)** come from a re-shoot of the new version at the end (22 storms, 492,887 homes, `shots/ia/*-storm-NOW-*`). The phone pass of the Storm map at ~15:05 caught the page mid-edit (blank, `STH is not defined`, 18.7 s load); those phone storm results are discarded.

## Headline numbers

| | Count |
|---|---|
| Dead or dead-end controls on the five tour screens (hand verified, per control, not per size) | **29** |
| Dead controls on `c4-command-deck/record.html` (not in the shell, but linked as the "Pipeline" record concept) | 18 of 19 buttons |
| Flows that break between screens | 7 (see "Between screens") |
| Facts that disagree across screens | 9 (see "Data consistency") |
| Genuine text-over-text overlaps at phone size (eyeballed, false positives removed) | ~110 pairs across 5 states, worst: Daily 50 roof sheet (52), Home plane sheet (36), Daily 50 route sheet (20) |
| Console errors on a normal walk | MapLibre "Cannot style non-existing layer homes/dots/edge", "Expected number, found null" x many, `Cannot read properties of undefined (reading 'setData')` (old map) |
| Slowest first paint | Home 7.2 s (Three.js + fonts), Ask Nimbus 6.2 s, Storm map ?recent 4.6 s, Daily 50 4.4 s (desktop, cold) |

Dead = clicking produces no visible change, no navigation, no sheet, no toast. Dead-end = it changes a label but the task cannot continue (for example "Logged, pick result" with no result to pick).

### The 29 dead or dead-end controls

Storm map **(old map and map now)**: 1 `Open record` (desktop record card), 2 `Open record` CTA (phone sheet). Both have no click handler in source.
Daily 50 (`deck.html`): 3 to 6 top nav `Pipeline`, `Map`, `Homes`, `Storms` (no handlers; `Today` is current), 7 `Find an address`, 8 avatar `C`, 9 to 13 the five pipeline stage tiles at the bottom (`.stg`), 14 `Directions` (does nothing, not even a maps link), 15 `Call` (no `tel:` link, no dialer, no outcome picker; the card simply slides away after 0.9 s), 16 `Text` (label becomes "Draft ready", no draft anywhere), 17 the stop pins on the knock route map (desktop) jump the card but the "Stop 13" footer never changes with them.
Home (`c5-home`): 18 `Text`, 19 `Book`, 20 `More`, 21 `Done`, 22 `Reschedule`, 23 `Add a note`, 24 to 26 Activity filter `Calls`, `Texts`, `Notes` (spans, not buttons, no handler), 27 the five stage steps in the stepper look like tabs and do nothing.
Ask Nimbus (`c2-nimbus`): 28 `Plan a route`, 29 `Compare with Aug 21` and `Who picked up yesterday?` chips (no handlers), plus the composer: you cannot type into it (it is a `span`, not an input) and `Send` does nothing. `Add 38 homes to Daily 50` changes its own label and nothing else.

Working controls, for balance: Storm map timeline ticks and chips, Clear, Show the Sep 12 storm, record close, phone sheet drag, 3D / zoom / county filter and search (map now); Daily 50 Skip, swipe, queue rows, roof `sq` sheet and its view chips, phone Route and Pipeline peek sheets; Home plane click, view chips, Whole roof, Explode, Esc, sheet close; Ask Nimbus street cards and pins; shell tabs, Desktop/Phone, Nimbus orb, chat suggested questions and typed questions, Esc.

---

## Persona 1: Cody, the owner, Monday 7:40 am

Goal: open the app, understand what happened overnight, decide the plan.

| # | Sev | Screen | What I expected | What happened | Shot |
|---|---|---|---|---|---|
| 1.1 | major | Opening | A one-line "overnight" summary I can act on | 9 seconds of logo sculpture and hail, then it lands on the Storm map with "No hail in the last 3 days". Nothing about calls, bookings, follow-ups or reviews. The only "news" is the Nimbus bubble, which disappears after 6.5 s. | `shots/desk-cody-02-intro-4s.png`, `shots/desk-cody-03-after-intro.png` |
| 1.2 | minor | Opening | Skippable, or skipped on return | Any key skips it, and `sessionStorage` skips it on return, but the shell's Opening tab clears that flag so it plays again every time you click Opening. There is no "morning brief" to land on instead. | `shots/desk-opening-2.png` |
| 1.3 | major | Storm map | "Morning, Cody" | "Good evening, Cody" (real clock) while the Daily 50 says "Morning, Cody." (hard-coded) and Nimbus says "Morning. I am Nimbus". Three greetings, two wrong at any given moment. | `shots/desk-cody-03-after-intro.png`, `shots/desk-rep-01-deck.png` |
| 1.4 | major | Shell | Nimbus tells me what matters | Bubbles rotate random sample updates ("Inspection booked Thu Oct 8", "Claim approved for the Nguyen roof") that appear nowhere else in the app. The bubble sits over the pipeline numbers on the Storm map and over the measurements table on Home. | `shots/desk-cody-03-after-intro.png`, `shots/desk-cody-07-tab-home.png` |
| 1.5 | major | Shell chat | Ask "what happened overnight" and get the overnight | Chat opens, suggested questions answer. Typed questions are keyword-matched: "what happened overnight" returns the Home screen's call log line ("Called Sep 15 and left a voicemail"); "book an inspection at 413 S Pickard" returns "Hail size at the address, roof age..."; "show me the Alvarez home" (a home Nimbus itself mentioned) returns "I do not have that one". The chat never navigates or opens anything. | `shots/desk-g-chat-typed.png` |
| 1.6 | major | Daily 50 | Today's plan | "12 of 50 called" and "3 inspections booked, 9 texts sent" in the header, while the sentence below says "Calling opens at 8am" and the first card says "No calls yet, 0 of 3 calls in 24h". 9 texts sent contradicts the texts-only-to-opted-in rule unless those homes opted in; nothing says so. | `shots/desk-rep-01-deck.png` |
| 1.7 | blocker | Daily 50 | Today's list built from the latest storm | The Daily 50 is "50 homes from the May 8 hail" (1,750 homes, 2.50 in max, Cleveland County). The Storm map, Ask Nimbus, Opening and Nimbus all talk about Sep 12. May 8 did not exist on the old storm timeline at all; on the new map it is a 32,531-home storm. | `shots/desk-rep-01-deck.png`, `shots/ia/desk-storm-NOW-default.png` |
| 1.8 | minor | Shell | Ctrl K opens search anywhere | Ctrl K does nothing in the shell. Inside the Storm map it focuses the ask bar (the bar even shows a "Ctrl K" badge), but only when the iframe already has focus. On the other four screens there is no search at all. `Find an address` on the Daily 50 is dead. | `shots/desk-g-storm-search.png` |
| 1.9 | major | Shell | URL follows me, Back works | Clicking tabs never changes the URL (deep links `?tab=daily`, `?tab=home&mode=phone` do work on load). Browser Back from the shell leaves the app or hangs (Playwright `go_back` timed out at 30 s twice, on both sizes). | `shots/desk-f-deep-tabdaily.png` |
| 1.10 | polish | Shell | App, not a demo | Every screen carries a "Concept, sample data" pill, a "Powered by Wing Digital" sig, a shell caption, and the shell's own "Roof Command by Wing Digital" header. Four brand/disclaimer strips on one screen. The Daily 50 and record pages use a different company mark (red "R") than the Storm map and Home (red house, "RD"). | `shots/desk-rep-01-deck.png` vs `shots/desk-rep-13-home.png` |
| 1.11 | minor | Shell phone | Usable on my phone | At 390 px the shell's own header eats 130 px: brand, Desktop/Phone toggle (meaningless on a phone), and a tab row that cuts off "Ask Nimbus" (horizontal scroll, no affordance). The Nimbus orb sits on the caption text. | `shots/phone-cody-03-after-intro.png` |

What Cody can actually decide from the app at 7:40: nothing beyond "no hail lately, there is a list of 50". He cannot see who booked, who asked for a call back, which rep has what, or what today's route is without opening the Daily 50 and reading the first card.

## Persona 2: a storm just hit (`?recent=1`, `?storm=1`)

Goal: find the hardest-hit streets, queue homes, plan a knock route.

| # | Sev | Screen | Expected | Happened | Shot |
|---|---|---|---|---|---|
| 2.1 | minor | Storm map | Straight to the storm | `?recent=1` still plays the 2.2 s intro with a Skip pill, then shows "Your service area, 2 days since the Sep 12 storm" and a "Show the Sep 12 storm" button. One more click to see the thing I came for. `?storm=1` on `1a` just plays the opening; on `1b` it is identical to default. | `shots/desk-storm-01-recent.png`, `shots/desk-storm-03-show-latest.png` |
| 2.2 | major | Storm map | Hardest-hit streets | There is no street ranking on the Storm map. Only towers per home. The street answer lives on a different screen (Ask Nimbus) with different numbers (its header pipeline is 1,755 / 214 / 31 / 12 / 5; the Storm map's Sep 12 pipeline was 1,755 / 176 / 26 / 7 / 5). | `shots/desk-storm-04-no-house.png`, `shots/desk-storm-08-ask.png` |
| 2.3 | blocker | Storm map | Open the home I clicked | Clicking a tower opens a record card (old map: "1862 S Santa Fe Ave, Moore, 1.51 in, Next: call from the Daily 50"; map now: "Single-family home, Cleveland County, Address and owner come with the signed-in database"). `Open record` does nothing on either version, desktop or phone. The home never reaches the Home screen, which always shows 2417 Cedar Ridge Ln. | `shots/desk-storm-05-open-record.png`, `shots/ia/desk-storm-NOW-recent-selected.png` |
| 2.4 | blocker | Storm map | Queue the hit homes into the Daily 50, plan a route | No such control exists on the Storm map. The record card says "Next: call from the Daily 50" but the Daily 50 is built from a different storm. | `shots/desk-storm-04-no-house.png` |
| 2.5 | major | Storm map | Clicking a house is easy | Old map: towers are 2 to 6 px wide; 7 clicks around the centre hit nothing on desktop. Map now: homes are real footprints and a click did open a card, but the card for a home with "0 in hail this season" is the same size and weight as a hit home. | `shots/ia/desk-storm-NOW-recent-selected.png` |
| 2.6 | minor | Storm map | Esc clears | Esc closes nothing on the Storm map (storm stays selected on phone; the record card stays open). | |
| 2.7 | major | Map now | Search finds my streets | Search works and suggests, but "Lindsey" ranks "Lindsey, Grady County, Oklahoma (Place, no loaded home within a block)" first, above "East Lindsey Street, Norman". W Lindsey St (the Ask screen's top street) is not offered. | `shots/desk-g-storm-search.png` |
| 2.8 | blocker | Ask Nimbus | Type a question | The composer is a `span` with placeholder text. Typing does nothing. `Send` does nothing. The whole screen is one pre-answered question. | `shots/desk-storm-09-ask-typed.png` |
| 2.9 | blocker | Ask Nimbus to Daily 50 | "Add 38 homes to Daily 50" puts them in the Daily 50 | Button relabels itself "38 homes added". Open the Daily 50: still 413 S. Pickard, May 8, no Lindsey, no Berry. Nimbus says "first in tomorrow's Daily 50" but there is no tomorrow view. Where does "38" come from? The street cards say 14 + 13 + 11 + 9 + 7 = 54 not called, and the fact tile says 237 on these five streets. | `shots/desk-storm-11-ask-added.png`, `shots/desk-storm-12-daily-after-add.png` |
| 2.10 | major | Ask Nimbus | Plan a route | `Plan a route` has no handler. `Compare with Aug 21` and `Who picked up yesterday?` have no handlers. | `shots/desk-storm-13-ask-after-chips.png` |
| 2.11 | minor | Ask Nimbus | Street tap updates the answer | Tapping a street flies the map and the Nimbus bubble changes, but the big answer paragraph still says "W Lindsey St has the most homes you have not called yet" whichever street is selected. | `shots/desk-storm-10-ask-street.png` |
| 2.12 | polish | Ask Nimbus phone | Readable | Map pins 1 to 5 sit on top of the Nimbus bubble and the answer paragraph when the sheet is pulled up; the "Concept. Street counts illustrative" pill overlaps the question bubble. | `shots/ia/phone-ask-sheet-full-annot.png` |

Outcome: a storm hits and the app cannot take me from "storm" to "these 50 homes, in this order, on this route". Each of the three steps lives on a different screen with different numbers and no link between them.

## Persona 3: a rep in the truck, on a phone

Goal: work the Daily 50, call a home, log the outcome, open the home, measure the roof, book an inspection, move to the next stop.

| # | Sev | Screen | Expected | Happened | Shot |
|---|---|---|---|---|---|
| 3.1 | blocker | Daily 50 | Tap Call, phone dials, then log the result | `Call` has no `tel:` link, so nothing dials. Label flips to "Logged, pick result" and 0.9 s later the card slides away to the next home. There is nothing to pick. No "no answer / spoke / booked / wrong number", no note, no 3-per-24h counter update. | `shots/phone-rep-03-call-pressed.png`, `shots/phone-rep-04-after-call.png` |
| 3.2 | major | Daily 50 | Tap Text, see the draft, send only if opted in | Label flips to "Draft ready". No draft appears anywhere, no opt-in check, no `sms:` link. | `shots/phone-rep-05-text.png` |
| 3.3 | minor | Daily 50 | Skip asks why or allows undo | Skip advances immediately. No reason, no undo. Swipe does the same; swipe direction has no on-screen meaning. | `shots/phone-rep-06-skip.png` |
| 3.4 | blocker | Daily 50 | Tap the address to open the full home | The address is not a link. No "Open record" anywhere on the card, in the roof sheet, or in the queue. The only route to Home is the shell tab, which always shows 2417 Cedar Ridge Ln, a home that is not in the Daily 50. | `shots/phone-rep-01-deck.png` |
| 3.5 | major | Daily 50 roof sheet | Measure, then book from here | The `23.6 sq` button opens a roof sheet with planes, edges, dimensions, hail and a table. Good. But no Book, no Open home, no "send to proposal". On phone the sheet has no background: its chips and table render over the card text (52 overlapping pairs). | `shots/phone-rep-08-roof-sheet.png`, `shots/ia/phone-daily-roof-sheet-annot.png` |
| 3.6 | major | Daily 50 route | Directions to the stop | Route sheet shows a nice map and "Stop 16, 919 Leslie Ln, then 1417 Cruce St, 2 min". The blue pin button is `Directions` and does nothing (no `geo:`/Google Maps link). On phone the route map's stop markers also render through the card underneath (20 overlaps). "12 homes, 4.4 mi" on the route vs "50 homes" in the queue is never explained. | `shots/phone-rep-11-route.png`, `shots/ia/phone-daily-route-sheet-annot.png` |
| 3.7 | minor | Daily 50 | Keyboard | No keyboard shortcuts on the deck (arrows, N, Enter, Space do nothing). Fine on a phone, missing on desktop. | |
| 3.8 | blocker | Home | The home I was working | Home is a fixed record (2417 Cedar Ridge Ln, Sep 12, 1.75 in, Called). The breadcrumb "Sep 12 hit list / 2417 Cedar Ridge Ln" is not a link. | `shots/phone-rep-13-home.png` |
| 3.9 | ok | Home | Measure a plane | Click a plane: it highlights, the measurements panel focuses it (or a bottom sheet on phone) with squares, area, edges, hail marks. Chips Planes/Edges/Dimensions/Hail and Explode all work. Esc resets. This is the strongest interaction in the app. | `shots/desk-rep-14-plane.png`, `shots/phone-rep-14-plane.png` |
| 3.10 | blocker | Home | Book an inspection | `Book` does nothing (both sizes, header and sticky bar). `Text`, `More`, `Done`, `Reschedule`, `Add a note` all do nothing. `Call` is a `tel:` to the same sample number on every home. | `shots/phone-rep-17-book.png` |
| 3.11 | blocker | Home | Next stop | No "Next stop" or "Back to Daily 50". Browser Back works only because I typed the URL; from the shell it does not. | |
| 3.12 | major | Home phone | Plane sheet readable | When a plane is selected on phone, the bottom sheet's last lines ("1.75 in hail Sep 12, 64 marks") sit under the sticky Call/Text/Book bar, the hail pin on the 3D view overlaps the sheet's "6.5 squares" heading, and the stage chips show through the sheet (36 overlaps). | `shots/ia/phone-home-plane-selected-hail-annot.png` |
| 3.13 | minor | Home | Fast | 7.2 s to first paint on desktop cold (Three.js from CDN, fonts). 4.7 s on phone emulation. The 3D also drags with no inertia hint; the title "Drag to turn the house" is the only cue. | |
| 3.14 | minor | Home | Owner name | "Owner on file", "Phone on file, ends 18". A rep needs the name before knocking. Nimbus knows "Alvarez" and "Nguyen" but no screen shows a name. | |

Outcome: the rep can look, but cannot do. Call, text, log, book, note, directions and next-stop are all dead or dead-ends. The one complete loop (pick a plane, read its squares) does not connect to a proposal.

## Between screens (connected app check)

| Flow | Works? | Detail |
|---|---|---|
| Storm map: select a home, Open record, see it in Home | No | Open record dead; Home is a fixed home |
| Ask Nimbus: Add 38 homes, see them in Daily 50 | No | Label only; Daily 50 unchanged and on a different storm |
| Daily 50: current stop, open Home | No | No link; Home shows a different address |
| Home: back to the Daily 50 at the same stop | No | No control |
| Nimbus chat: ask to open or book something | No | Chat answers text only, never navigates |
| Shell tabs: state carries (selected storm, current stop) | No | Each tab is a fresh iframe load; selected storm, card position and sheet state reset |
| URL / Back | Partly | `?tab=` and `?mode=phone` deep links load; clicking tabs does not update the URL; Back leaves or hangs |
| Record page `record.html` | Orphan | A second home record design (tabs, Proposal stage, "Call now" task) not reachable from any screen |

## Data consistency

| Fact | Opening | Storm map (old) | Storm map (now) | Daily 50 | Home | Ask Nimbus | Nimbus shell |
|---|---|---|---|---|---|---|---|
| Homes watched | 539,000, 7 counties | 539k | 492,887, 5 counties | | | | 539k |
| Latest storm | Sep 12 | Sep 12 | Sep 12 | **May 8** | Sep 12 | Sep 12 | Sep 12 |
| Sep 12 homes hit | 1,755 | 1,755 | **1,611** | (May 8: 1,750) | | 1,755 | 1,755 |
| Sep 12 max hail | | 1.78 in | **1.23 in** | (May 8: 2.50) | 1.75 in at this home (above the new max) | 1.78 in | 1.78 in |
| Storms this season | | 6 (Jul 11 to Sep 12) | 22 (Mar 1 to Sep 12) | refers to May 8, Jul 4, Jun 26 (not on old map) | Sep 12, Aug 7 | Sep 12, Aug 21 | |
| Pipeline, all storms | | 3,736 / 763 / 130 / 35 / 27 | 188,600 / 18,860 / 2,829 / 754 / 566 | 1,688 / 38 / 14 / 6 / 4 (May 8) | | 1,755 / 214 / 31 / 12 / 5 | |
| Called today | | | | 12 of 50 in header; 0 calls on card; "calling opens at 8am" | | | 12 of 50, 3 booked |
| 413 S. Pickard Ave | | | | New hit, May 8, 1.32 in, 0 calls | (record.html: Proposal sent, Sep 12, 1.32 in, storms Aug 21 / Jul 4) | | "next: 1.32 in on May 8" |
| Greeting | | Good evening | Good evening | Morning | | Cody, 7:42 am | Morning |
| Company mark | red house | red house | red house | red "R" | "RD" | red house | |

Numbers also disagree within one screen: Ask Nimbus says 237 homes on five streets, the cards sum to 237 hit but 54 not called, and the button adds 38. The Daily 50 route says 12 homes / 4.4 mi for a 50-home day.

## Accessibility, ergonomics, motion

- Tap targets under 44 px on phone: Daily 50 nav tabs (30 px), roof `sq` pills (27 to 30 px), Directions (36 px), Storm map 3D / zoom (40 px), Home chips (38 px), Ask Nimbus chips (33 px). Timeline ticks on the old map were 44 x 128, fine.
- Focus: visible 2 px outline on buttons across screens. Tab order on Home starts nowhere (first Tab lands on nothing visible on desktop). Activity tabs on Home are `span`s, unreachable by keyboard. Stage steppers look clickable and are not.
- Contrast: small text passed 4.5:1 in the scripted check. Attribution text at 9 px is unreadable but legally required; move it to the info button.
- Motion: the 9 s opening (every time Opening is clicked), the 2.2 s Storm map intro even on `?recent=1`, the 0.9 s Nimbus "thinking" before every bubble, the 1.1 s "check" delay. For a rep this is waiting, not immersion. Reduced-motion is respected (good).
- Loading: Home 7.2 s and Ask 6.2 s on desktop cold are the two worst. Three.js, MapLibre and fonts all load from CDNs on every tab switch because each tab is a fresh iframe.
- Phone ergonomics: sticky Call/Text/Book bars are good; bottom sheets drag well on Storm map; but sheets have no scrim or background on Daily 50, the shell steals 130 px of a 844 px phone, and the three sticky bars (shell header, page header, action bar) leave about 480 px for content on Home.

## Immersive vs flat

Immersive today: the opening sculpture with hail; the Storm map camera, towers and timeline; the 3D house with plane highlighting and explode; the knock route map; the Nimbus orb with moods. These are the parts a roofer would show a friend.

Flat today: every action button. The app looks alive and behaves like a slideshow. The feeling breaks the first time a rep taps Call and the card just slides away, or Cody taps Open record and nothing happens. Numbers that disagree between tabs make it feel like five mockups, which is what it is. The repeated "Concept, sample data" pills (four per screen) undercut the luxury feel more than the sample data itself does.

See `IA.md` for the information-organisation audit (inventories, overlaps, proposed layout) and `PLAN.md` for the ranked plan.
