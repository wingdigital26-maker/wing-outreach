# How old is each roof? What works for free (Jack, 10-17)

Short answer: **public permits are the only free signal that actually dates a roof.** Photos, LiDAR and hail reports do
not. The one big new find is **Frisco**: its public permit search goes back to when each home was built and shows reroofs
by name, so Frisco can join McKinney as a city where we really know the roof's age.

Insurance claims (CLUE) are private and were not touched. Nothing was paid for, signed up for, or sent. No Google imagery
was used.

## What covers how many homes

The test set file (`tour/audit/roof-accuracy/testset.json`) has 82 homes today (77 Collin, 5 Rockwall).
"Collin" below means the app's 207,724 Collin County homes (Allen, Frisco, McKinney, Plano, Richardson).

| Method | Test homes (82) | Collin homes (207,724) | How sure | Status |
|---|---|---|---|---|
| Reroof permit already in the app (state list 2023 on, McKinney 2015 on) | 4 (all McKinney) | 21,484 (10.3%) | High: a dated public record | Live |
| **Frisco city permit search (new)** | 9 Frisco homes: full history back to when built; 1 home has reroofs in 2012 and 2018, 8 have none on record | 35,816 Frisco homes in Collin, plus 26,219 in Denton County (no permits there today) | High where a reroof shows; "none on record" is medium | Works, one home at a time (script ready) |
| Year built, nothing newer on record | 82 | 207,724 (100%) | Low for homes over about 12 years old | Live |
| Built 2014 or later, no permit: likely the first roof | 0 | 39,068 (18.8%) | Medium (in McKinney only 7% of these got a new roof since) | Ready to wire |
| Radar hail at the home since 2024, no permit after it | 60 | 95,164 (1.25 in or more) | Weak as a roof-age signal (see below), still the sales signal | Live as hail |
| Aerial photo change (free 2015 to 2022 state photos) | 0 | 0 | Does not work (coin flip) | Dropped |
| LiDAR 2018 vs 2020 | 0 | 0 | Cannot see a reroof | Dropped |
| NOAA hail reports since 1955 | 0 | 0 | Only says which years were bad, not which street | Dropped as a per-home signal |

## 1. More city permit portals

| City | Free public reroof records? | How far back | Can we fetch politely? |
|---|---|---|---|
| **Frisco** | **Yes.** City eTRAKiT search, "Public", no login. Search by address lists every permit with the contractor; opening a permit shows type, description and dates. Before 2023 a reroof is a building permit described "REROOF" (often with the squares, e.g. "REROOF/SALT/84SQS"); from 2023 it is a ROOF permit. | About 1996 (back to when the home was built) | Yes, one address at a time, about 15 to 20 seconds a home with pauses. No bulk download: a contractor-name search stops at 50 pages. |
| McKinney | Yes (already in the app) | About 2015 | Yes, bulk map layer |
| Allen, Prosper, Celina, Anna, Wylie and the rest of Collin | Only through the Collin CAD state list (already in the app) | 2023 | Yes, bulk |
| Plano | No. The permit search needs a login (checked again today). Plano's open data has only totals by month and by neighbourhood, no addresses. | n/a | No |
| Richardson | No public permit search found; the city's map server has no permit layer. Only the state list (178 Richardson roof permits since 2023). | 2023 (thin) | n/a |
| Rockwall, Heath, Royse City | No (login or a records request, which is your call) | n/a | No |
| Dallas (city) | Yes, Dallas open data: about 10,800 "remove existing roof and install new roof" permits, but only 2018 to 2020, and the app has no City of Dallas homes | 2018 to 2020 | Yes, bulk |
| Garland | No permit layer found | n/a | n/a |

Frisco test, 9 test homes (`frisco-test.json`): every home returned its permit history back to the year it was built.
7672 Fossil Ridge Dr (built 1999) shows "REROOF/SALT/84SQS" in 2012 and "SALT / REROOF" in 2018. One of these two was
pulled by a contractor without "roofing" in the name, so reading the permit detail matters, not just the contractor.
Several homes also have unlabeled "HZ" permits from 2008 to 2011 whose type the site does not show; they are not counted.

## 2. Aerial photo change

Tested on McKinney homes with a known reroof permit (`photo-change.json`). Free state photos from Feb 2015, Sep 2016,
Nov 2018, Oct 2020 and Jul 2022, lined up year to year and to the county building outlines, roof colour measured on each
outline (trees skipped) and compared with the other roofs in the same block that year.

- 1,094 homes in 12 blocks: 446 with a reroof permit between two photos, 608 neighbours with no permit.
- Homes reroofed between 2016 and 2018 changed colour no more than their neighbours: score 0.51, where 0.50 is a coin
  flip. The window with the biggest change was the right one 25.3% of the time, chance is 25%.
- The measurement itself is steady (a roof's colour next to its neighbours matches from photo to photo, 0.6 to 0.9), so
  the photos are not too noisy to measure. A new roof in a similar shingle colour just does not show at 0.5 to 1 m.
- A second run on 10 other blocks picked for later permits (915 homes; 56 reroofs dated to the month between the 2018
  and 2020 photos, 27 between 2020 and 2022) also failed: scores 0.54 and 0.45, right window 29.5% of the time against
  25% by chance (`photo-change-late.json`).

Verdict: do not use free aerial photos to date roofs. This matches the earlier crude test (deep-research, f6e).

## 3. LiDAR 2018 vs 2020

No home in the point cache has both years: 57 have only the 2018 USGS points and 10 have only the 2020 TxGIO points
(2020 was only filled in where 2018 was missing). More importantly, new shingles on the same roof change the height by
a centimetre or so, far below what LiDAR measures (about 10 cm), and the return strength is not comparable between two
different flights. It could only catch a rebuilt or added roof, not a reroof. Not pursued further.

## 4. Fallback estimate (year built plus hail)

`estimate.py` gives every home a roof year, a reason and how sure it is:
1. Reroof permit on file: that year (high).
2. No permit, built 2014 or later: year built, likely the first roof (medium). In McKinney, where every reroof since 2015
   is public, only 7% of homes built 2014 on have had one.
3. Older home, no permit: "no older than the year built" (low). McKinney shows how weak this is: 25 to 31% of homes built
   1980 to 2013 got a permitted new roof since 2015 alone, so most older DFW homes are on their second or third roof.
4. Flag: radar hail of 1.25 in or more at the home since 2024 and no reroof permit after that storm.

Hail checks against permits:
- NOAA storm reports (free, back to 1955): within 3 km of a home they predict a reroof permit worse than chance
  (reports follow where people are, not where hail fell). At 15 km they only mark the bad years around a city. Dropped.
- The app's radar hail at each home (2024 on): homes hit by 1.25 in or more got a reroof permit afterwards 1 to 2.6 times
  as often as unhit homes, depending on the storm (best: 25 Mar 2025, 6.6% vs 2.5%). Real but weak, and many reroofs are
  still in progress, so it stays a "who to call" signal, not a roof age.

## Recommendation: what to wire in next

1. **Frisco permit history** (biggest win). Run `frisco_etrakit.py` for each home on the daily list (50 homes is about
   15 minutes, cached forever), and slowly in the background for the rest of Frisco (about 62,000 homes in Collin and
   Denton County; at a polite pace that is a few weeks of nights). Show "Reroof permit <month year> (Frisco)" exactly like
   McKinney. Frisco is also the city that took the June 2026 storm.
2. **Say "likely the first roof" for homes built 2014 on** with no permit (39,068 Collin homes, plus Denton and Rockwall).
3. **For older homes with no permit, say what we know honestly**: "no newer than <year built>; about 3 in 10 homes this
   age in McKinney got a new roof since 2015". Do not show a guessed year.
4. **Keep pulling the state list nightly** (already running): it is the only free record for Allen and the smaller cities,
   and it keeps only three years.
5. Plano (72,000 homes, the biggest city) and Rockwall have no free route. The only way is a public records request
   to each city, which is your call.

## Files

Scripts (`scripts/roofage/`): `common.py` (readers), `coverage.py`, `frisco_etrakit.py` (Frisco search + permit detail,
cached, 3 s pauses), `frisco_test.py`, `photo_change.py`, `hail_history.py`, `build_index.py`, `estimate.py`.
Outputs (`tour/audit/roof-age/`): `coverage.json`, `frisco-test.json`, `photo-change.json`, `photo-homes.csv`,
`photo-change-late.json`, `photo-homes-late.csv`, `hail-calibration.json`, `estimate-summary.json`, `estimate-testset.csv`.
Downloads (photos, NOAA file, Frisco pages) are cached outside the repo in `C:/Users/wjack/roof-command-data/roofage-cache/`.
