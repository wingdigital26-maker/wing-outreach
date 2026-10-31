# Tour load speed (PLAN.md move 8, load part)

Measured 2026-10-06 with `audit/_speed.py` (one headless Chromium on a software GPU, 1440x900, `?nointro=1&noprefetch=1` so each screen is measured alone, median of 3). The machine was heavily loaded and the GPU is software, so absolute numbers are slow and noisy; compare before against after, not against a real phone.

- **paint**: the screen's first contentful paint, ms from opening the URL
- **ready**: screen usable (Storm map: homes decoded and map loaded; Daily 50: map loaded; Home: 3D roof drawn)
- **cold**: first visit, empty cache. **repeat**: second visit in the same browser
- **from CDN**: requests to unpkg / jsdelivr / tile server. **from cache worker**: requests answered by `sw.js`

## Before

| Screen | Cold paint | Cold ready | Repeat paint | Repeat ready | Cold bytes | Requests | 3rd-party requests |
|---|---|---|---|---|---|---|---|
| Daily 50 | 17,053 | 17,370 | 723 | 9,736 | 1.0 MB | 31 | 12 |
| Storm map | 2,040 | 20,244 | 307 | 3,966 | 5.6 MB | 37 | 16 |
| Home | 1,566 | 6,073 | 791 | 4,955 | 0.7 MB | 23 | 3 |

In one of the three Daily 50 runs unpkg dropped the connection and the page threw `maplibregl is not defined`: the screen depended on a third-party CDN to work at all.

## After

| Screen | Cold paint | Cold ready | Repeat paint | Repeat ready | Cold bytes | Requests | 3rd-party (tiles only) | Repeat from cache worker |
|---|---|---|---|---|---|---|---|---|
| Daily 50 | 1,769 | 7,583 | 298 | 6,057 | 1.7 MB | 31 | 10 | 30 of 31 |
| Storm map | 822 | 5,313 | 248 | 2,727 | 7.2 MB | 37 | 13 | 35 of 37 |
| Home | 327 | 4,962 | 302 | 4,818 | 1.1 MB | 23 | 0 | 23 of 23 |

Cold bytes went up because the local test server does not gzip; the CDN did. Any real host (Cloudflare, Vercel, Pages) gzips/brotlis these and the bytes come back to the CDN numbers or below. Repeat "ready" is now bound by drawing the map / 3D on a software GPU, not by the network.

## What changed

1. **Libraries self-hosted** in `tour/vendor/` at the exact versions: maplibre-gl 4.7.1 (js + css), deck.gl 9.0.38 `dist.min.js`, three 0.170.0 (`three.module.min.js` + the two addons Home imports, OrbitControls and RoomEnvironment). Storm map, Daily 50, Ask Nimbus and Home point at them; Home's importmap maps `three` and `three/addons/` to `../vendor/`.
2. **Preloads**: the Storm map preloads `homes.bin`, `catalog.json` and its font in `<head>`, so the 4 MB homes file downloads alongside maplibre and deck.gl instead of after them. Daily 50 and Home preload their font; Home modulepreloads three, both addons and `home.js`. Map pages preconnect to `tiles.openfreemap.org`. The shell preloads its font.
3. **Cache worker** `tour/sw.js` (scope `tour/`), registered by `product.html` only after the first screen has loaded and the page is idle. Precaches the shell, every screen's html/css/js, fonts and vendor files. Vendor files and fonts: cache first. Pages, scripts, `lib/st-data` (homes + footprint tiles): stale-while-revalidate (instant from cache, refreshed in the background, so an edit shows on the next load). Basemap tiles, glyphs and sprites: cache first, capped at 3,000 entries. Only GET over http(s); POST, Range requests, tel:/sms: and other hosts (search) pass straight through. Registration failure is caught and changes nothing.
4. **Prefetch waits for idle**: the shell already warmed the next likely screen 1.5 s after the current one loaded; it now also waits for `requestIdleCallback`.
5. **Opening once per session**: confirmed, `sessionStorage rc.introSeen` sends return visits in the same tab straight to the Daily 50. piece-engine.js only loads inside the opening frame.

Checked and left alone: `homes.bin` decode is two zero-copy typed-array views (no parsing), and footprint tiles decode one 0.05 degree tile at a time, so neither needs a worker; the hail field already runs in a worker. Long tasks seen in the check are WebGL drawing on the software GPU. `wing-mascot.js` + `nimbus-shell.js` are 64 KB and the shell calls them synchronously on first render, so deferring them would change behaviour for no measurable gain.

## Checks (`audit/_speed_check.py`, `audit/speed-check.json`)

- Every screen (Daily 50, Storm map, Home, Ask, Opening) at 1440x900 and 390x844 with the worker controlling the shell and the frame: loaded, **0 console errors, 0 page errors**.
- Hard reload (CDP `ignoreCache`, same as Ctrl+Shift+R): the page loads normally from the network, uncontrolled for that load.
- Version bump: a copy of `sw.js` with `CACHE_VERSION = 'rc-tour-v2'` installed, activated, took control and deleted every `rc-tour-v1-*` cache; the next reload filled `rc-tour-v2-*`.

## Operating notes

- To push a change to every returning visitor at once: bump `CACHE_VERSION` in `tour/sw.js`. Without a bump, html/js/css edits show on the second load (stale-while-revalidate).
- To switch the worker off in one browser: open `product.html?nosw=1` (unregisters it).
- Vendor files are cache-first forever: to upgrade a library, add a new versioned folder in `vendor/` rather than overwriting.
