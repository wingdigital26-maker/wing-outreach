# Daily 50 engine: how Today should use it

`lib/rc-queue.js` picks each day's 50 homes. Today does not load it yet. To wire it in (owner of `c4-command-deck/*`):

1. Load it after the state and brand files:
   `<script src="../lib/rc-state.js"></script> <script src="../lib/brand.js"></script> <script src="../lib/rc-queue.js"></script>`
2. Wait for the data, then read the list:
   ```js
   RC.queueReady.then(ok => { if (!ok) return showEmpty(RC.queueStats().err); render(RC.daily()); });
   RC.on(d => { if (['pipe', 'att', 'optout'].includes(d.key)) render(RC.daily()); });   // live status, same 50
   ```
3. Each pick: `{ id, gi, address, street, city, zip, lon, lat, score, why: [two short reasons], reason: 'cadence' | 'new',
   step (cadence day 1, 3, 7, 30, 60...), touch, nextDue, status: 'open' | 'done' | 'closed', closedBy, hail, storm,
   roofYear, yearBuilt, permit, squares, miles, parts }`.
   - `id` is the shared home id (`'m' + gi`), the same one RC.logCall / logText / logEmail / setStage / remember use.
   - Show `why` under the address as is (plain words, no em dashes). Cadence picks lead with "Day 7 follow-up, due today".
   - `status: 'done'` = reached today on this device; keep it in the list, greyed. `closed` = Won, Not now or opted out since the list was built.
4. Same 50 all day: the first `RC.daily()` of a day is kept on the device (`rc.t.daily`); later calls return the same homes
   in the same order. `RC.daily(null, { rebuild: true })` rebuilds (use only for a "Refresh list" action).
5. `RC.queueStats()` gives the numbers behind the list (storm, candidates, eligible, due today, exclusions, weights, timings)
   for a "How this list was picked" panel. `RC.queueWeights` holds the five factors with a one-line reason each.
6. The deck's own `ROUTES` stops can be retired once Today renders from `RC.daily()`; routes and roof drawings for a pick
   come from `gi` (lib/st-homes.js footprints, lib/st-meta.js facts) as the Home screen already does.

Opt-out: when a homeowner says stop (or a texting provider reports STOP), call `RC.optOut(id, 'STOP')`. That ends the
cadence, removes the home from the list and blocks scheduled texts. `RC.optOut(id, how, false)` undoes it.

Check: `python tour/audit/_queue_check.py` (server on :4886 already running).

## Automation rules every screen shares (10-15, docs/SELL-GAPS-AUTOMATIONS.md)
- `RC.cadence(id).stopped`: 'opted out' | 'won' | 'not now' | 'in a deal' (Sent to owner, Inspection, Proposal) | 'replied' | 'not a fit'
  (Today's Skip). A stopped home gets no cold follow-up and no cadence slot; `RC.cadenceStopText(why)` is the line to show.
- `RC.canText(id, phone)`: opt-out, phone, texting hours and at most `RC.TEXT_CAP` (3) texts per home in 24 h. Every
  Open in Messages goes through it.
- `RC.proposalSent(id)` / `RC.proposalSentAt(id)`; `RC.replied(id)`; `RC.addedOpen()` (hand-added homes until their first touch).
- `RC.CONNECT`: the one list of outside connections (what happens now, what connects at onboarding).
- Tests: `scripts/automation/sim_week.py`, `ui_week.py --step 1..7`, `cloud_mock_check.py` (server on :4930).
