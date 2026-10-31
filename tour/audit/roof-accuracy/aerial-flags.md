# Photo flags (aerial.py): homes whose shown roof matches the photo's shading 15+ points worse than the outline house

| home | shown | within 1 ft % | photo % | outline photo % |
|---|---|---|---|---|
| collin-tx 1954 | D | 67.1 | 76 | 93 |
| collin-tx 206483 | D | 29.3 | 17 | 40 |
| collin-tx 204869 | C | 50.6 | 48 | 86 |
| collin-tx 173943 | C | 55.6 | 71 | 100 |
| collin-tx 15292 | C | 48.7 | 62 | 98 |
| collin-tx 207704 | D | 72.3 | 65 | 91 |
| collin-tx 164227 | C | 66.3 | 54 | 72 |

7 of 67 homes flagged.

## Spot check by eye on Google Maps satellite (2026-10-17, viewing only, nothing downloaded)

| home | address | verdict | what Google shows |
|---|---|---|---|
| collin-tx 204869 | 4427 Kelly Dr, Richardson | REAL MISS | a main hip with wings and a skylight; our model is one plain hip box |
| collin-tx 15292 | 13 Carter Ct, Allen | close, missing a piece | main section, long rear wing, front cross gable; our model has the main shape but is 8.7% short on squares |
| collin-tx 1954 | 1524 Yorkshire Dr, Allen | right | cross-hip roof; matches (checked on the Allen 3 in photo) |
| collin-tx 206483 | 2670 Daffodil Dr, Richardson | false alarm | roof mostly under trees, even on Google |
| collin-tx 173943 | 1510 R Ave, Plano | false alarm | long spine with branching wings; matches our model (2015 photo was cut off) |
| collin-tx 207704 | 5601 Baskerville Dr, Richardson | false alarm | simple hip rectangle with a rear section; matches (clears the bar) |
| collin-tx 164227 | 3304 Snidow Ct, Plano | false alarm | roof covered in solar panels (they break the shading check); shape matches |

Patterns to fix: (1) a plain box drawn where the roof has wings (204869): the outline house / single-block fallback wins too easily when the block model fails the clean check; (2) a missing section shows up as a squares shortfall (15292): a model more than 5% short on squares should be flagged; (3) solar panels and trees fool the photo shading check: skip the photo veto where the roof is mostly panels or canopy.
