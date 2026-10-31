# Storm Theater: interaction language borrowed from the Wing Digital website

Source: `C:/Users/wjack/wing-site-v4/style.css` (served on :4890 and hovered/scrolled in Playwright). Everything below is what the site actually does; Storm Theater copies it rather than inventing its own motion.

## Timing and curves (site)
- Hover colour/background changes: `.2s ease` (`.btn`, nav links, `.svc-row .ar`, burger spans).
- Border/colour shifts on larger surfaces: `.3s ease` (`#nav` border, cards).
- Reveals: `.rv {opacity:0; transform:translateY(16px)}` to `.rv.in` in `.4s ease-out`, children staggered `.15s` / `.3s`. "Quick, staggered, no bounce."
- Easings used anywhere: `ease` and `ease-out` only. No springs, no cubic-bezier overshoot.
- `prefers-reduced-motion: reduce` sets `transition:none` and shows everything in place.

## Shapes and states (site)
- Primary action: pill (`--radius-pill`), `--blue` fill, hover `--blue-light`, min-height 48, weight 600.
- Secondary: `--panel-2` fill, `--hair` border, hover `--panel-3`.
- Focus: `outline:2px solid var(--blue-light); outline-offset:3px` (pill radius on buttons).
- Hover on a row reveals direction by moving an arrow `translateX(8px)` and tinting the link `--blue-light`.
- Panels: white on the gradient stage, hairline border; the site's dark panels use "hairline, never a shadow", the light stage uses one soft shadow.
- Labels: the site uses IBM Plex Mono only for `.lbl`/`.n`/ledger terms. Storm Theater does not reproduce those tracked uppercase eyebrows (Jack read them as the eyebrow-microlabels tell); all app labels are Instrument Sans sentence case.

## What Storm Theater does with it
| Moment | Site rule applied |
|---|---|
| Panels appear after the map draws | `.rv` 16px-up, `.4s ease-out`, stagger .1s/.2s |
| Tower hover tooltip | opacity `.2s ease`; hovered tower turns ink, no scale |
| Timeline tick hover / selected | background `.2s ease`; readout chip moves `left/bottom .3s ease` |
| Storm swap (click tick or chip) | layers fade out 300ms, data swaps, fade in 300ms; camera `easeTo` 600ms quadratic ease-out |
| Open record pill | roofer accent fill, hover `--accent-ink`, `.2s ease`; pill radius; 46/50px tall |
| Ask bar hover | border `.3s ease` to `--edge` |
| Focus anywhere | 2px `--blue-light` outline, 3px offset |
| Phone bottom sheet | `transform .4s ease-out` between peek / half / full; drag has no transition; CTA fades `.2s ease` and rises `.4s ease-out` |
| Intro | about 2.2s, brass progress bar `width 2.2s linear`, Skip pill (secondary style), any key/click skips, `sessionStorage['st-intro-seen']` skips it on return; exit fade `.4s ease-out` |
| Reduced motion | all transitions off, panels visible, hail streaks frozen |

Not borrowed on purpose: the site's scroll-driven sculpture choreography (the app has no long scroll), and the mono eyebrow labels.
