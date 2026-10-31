# Roof Command concepts: plan + refs (visual-2 Part A, two passes)

## Shared tokens (Wing x roofer co-brand)
- Abyss navy #071230 (dark surfaces, never #111) | Ink navy #0E1B3D (text on light) | Cobalt #2757E6 (Wing, from the v5 sculpture CTA) | Cobalt hi #5B82FF | Mist #EDF1F8 (cool light canvas, NOT cream) | Slate #5D6982 | Champagne #CDB98F (metal accent, max one use per frame)
- Roofer accent (per customer, tints the UI): Red Dirt Roofing #B3262E brick red; Cedar Line Roofing #1F6B55 cedar green (frame 6)
- Type: Manrope only (Wing's brand face). Display 200/300 at -0.035em, data 600/700 tabular numerals. No serif, no mono labels, no all-caps eyebrows, no italic accents, no middle-dot meta strings, no arrows appended to buttons.
- Review pass against the 5 AI clusters: dropped a champagne-on-cream idea (cluster 1), dropped hairline-only cards (cluster 3), varied radius by hierarchy (panels 22, chips 999, rows 10) so it is not the SaaS card kit (cluster 4), solid fills only, no gradient washes.

## 1 Storm Theater (dark, time is the navigation)
Structure: no sidebar. Full-bleed tilted 3D map dominates; floating co-brand capsule top-left; one glass stat card; one record peek on the right; timeline scrubber is the main nav.
```
[RD Red Dirt Roofing]                       [Ask]        concept
            3D map, hail ribbon, extruded homes
 [1,755 homes hit / 1.78in]                  [record peek: timeline]
 |--Jul 11----Aug 7--Aug 16-17--Aug 21------Sep 12--|  pipeline counts
```
Refs: ui/colour/dyslove-eclipse-card (deep field + one floating glass card), ui/components/kalypso-shader-orbs (a single luminous object in the dark), Wing v5 sculpture (material).

## 2 Nimbus Copilot (light, asking is the navigation)
Structure: conversation column left-center with Nimbus docked in a tall rail; map is the right half and reacts to the answer; ranked streets live inside the answer.
```
|N|  thread: question / Nimbus answer + ranked streets  |  map, top streets glowing |
|i|  [Add 312 homes to pipeline as New hit]             |                           |
```
Refs: ui/dashboard/codexr-dashboards-v2-weekly-schedule (rounded white on light canvas, pill tabs), ui/components/kalypso-shader-orbs (orb as the agent).

## 3 Roof X-Ray (object first, configurator)
Structure: the house is the screen. Exploded 3D roof center stage; glass spec panel right; plane selector strip bottom like a car configurator.
Refs: Wing v5 sculpture (studio-lit object on navy), ui/colour/dyslove-eclipse-card (glass panel over a deep field).

## 4 Command Deck / Daily 50 (dense, the queue is the navigation)
Structure: Dashboards V2 kit Jack kept (icon rail, "Hi Cody", pastel KPI tiles, pill tabs) but the deck dominates: a fanned stack with one focus card, progress ring, pipeline strip, route map.
Refs: ui/dashboard/codexr-dashboards-v2-performance-analytics (KPI tiles, greeting), ui/dashboard/codexr-dashboards-v2-weekly-schedule (rail + pills), ui/ux-laws/settri-fitts-law (big call target for the truck).

## 5 CRM record (document, the record is the navigation)
Structure: one homeowner record as a page: stage path across the top, timeline down the center, facts + X-Ray thumb right, next action pinned.
Refs: ui/dashboard/codexr-dashboards-v2-financial-calendar (rounded white panels, calm density), ui/ux-laws/settri-law-of-proximity.

## 6 Personalized
Same home screen (frame 4 skeleton) rendered for Red Dirt Roofing and Cedar Line Roofing side by side: logo, accent, name, service area, greeting change; Wing signature stays quiet.
