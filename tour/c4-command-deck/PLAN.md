# c4 Command Deck: plan (visual-2 Part A, two passes)

## Subject, audience, job
A roofing rep in a truck in Norman, OK the week after the Sep 12 2026 hail (1.78in max, 1,755 homes hit). Job of the screen: tell him which home is next, let him tap to call or text, show where he is on today's 50 and today's knock route. Owner of the account is the roofer; Wing Digital signs quietly.

## Pass 1 tokens
- Desk navy #0B1734 (the app canvas, solid) | Panel navy #13224A | Ink #0E1B3D | Cobalt #2757E6 (Wing) | Paper #FFFFFF (cards) | Mist #EEF2F8 (record canvas) | Slate #63708A
- Champagne #CDB98F: ONE use per frame, the progress ring arc only.
- Roofer accent var(--accent) leads every primary action (Call), the monogram tile and the active stage. Red Dirt #9E1F2A, Prairie Peak #1C5F58.
- Type: Manrope (Wing brand face) only. Greeting 300 at -0.03em, data 700 tabular. Sentence case labels, no caps eyebrows, no mono.
- Radius by hierarchy: paper cards 20, panels 16, rows 12, chips/pills 999.

## Pass 1 layout (desktop)
```
[RD Red Dirt Roofing  Norman and south OKC]   Today  Pipeline  Map  Homes        Powered by [W] Wing Digital  (C)
 Morning, Cody.                                                    ( ring 12 of 50 )  3 booked  9 texts
 50 homes from the Sep 12 storm. Calling opens 8am.
 [ Up next list  ]  [   THE DECK: front paper card, 2 cards stacked behind   ]  [ map: route line, stops ]
 [ 13 .. 22      ]  [   aerial roof | address | hail | roof age | best time  ]  [                        ]
 [               ]  [   Call (accent)  Text   Skip                            ]  [                        ]
 New hit 1,693 > Called 38 > Inspection booked 14 > Proposal 6 > Won 4   (slim strip)
```
Phone: navy head with ring, the deck fills the screen, big Call/Text thumb buttons, pipeline strip as a scroller, map peek at the bottom.

## Review against the brief (pass 2 changes)
- Pass 1 had the greeting on a light canvas with KPI tiles in a row: that is Dashboards V2 again and the rejected board skeleton (sidebar + map left + list right). Changed: no sidebar, no KPI tiles; the CARD STACK is the dominant object, centred on a navy desk like physical index cards. Structure is task-led (one home at a time), not overview-led.
- Map was going to be full height left. Moved right and made it subordinate to the deck; route drawn in the roofer accent, stops numbered because the route IS a sequence.
- Considered a gradient on the desk for depth. Dropped (banned). Depth comes from stacked paper with real layered shadows instead.
- Champagne was also on the Wing signature. Dropped: one use only, the ring.
- Removed status chips that read like "online"; call limits shown as plain text "0 of 3 calls in 24h".

## Record (frame 5)
Navy header band carries the address and the stage stepper (the pipeline as the page's spine). Mist canvas below in three columns: timeline (left, the history is a real sequence), roof facts + aerial (centre), next task + notes (right). Reads like Attio/Linear-grade CRM, not a dashboard.

## Personalized (frame 6)
personalized.html renders deck.html twice in iframes with ?roofer=reddirt and ?roofer=prairie. All theming is CSS variables set from one ROOFERS table, so the switch is real. Wing signature identical in both.

## Theme change (coordinator, from Jack): Wing website skin
Structure kept, skin swapped to wing-site-v4 tokens: white-gradient stage, --bar header, white panels with soft shadow, --blue for data (route line, Directions), --brass as the one metallic (progress ring arc, next-task clock), Instrument Sans throughout, IBM Plex Mono only on the Concept label. Map greys tinted to the site's cool greys. Roofer accent still owns Call, the monogram, the active stage.
