# Nimbus audit (2026-10-31, read-only)

## Today
About 40 tools in tour/lib/nimbus-tools.js, nimbus-data.js and nimbus-ops.js, with Undo on every change. They cover questions (calendar, inbox, call_today, results, storms, home_facts, briefing, recall_homeowner), navigation (open_screen, open_home, next house, map mode, truck mode, talk mode), data changes (book_inspection, log_knock, move_stage, bulk_move, add_note, pause/resume follow-ups, set_field), drafts (draft_message opens the composer and the roofer taps Send), and settings (change_setting with 7 settings, display size, request_change to Wing).

Two brains:
- **Built-in:** regex rules in nimbus-brain.js. It's the only one on the phone and public build, and phrases it doesn't know hit a dead end.
- **Claude:** runs only through the LAPTOP server scripts/nimbus/server.py on :4913, gated by rc.localsvc. Its default "subscription" mode plans once and never sees the tool results.

Voice: browser voices, plus optional ElevenLabs through the laptop server (free cap).
Memory: only home history plus keyword recall. Chat is lost on reload, and there are no per-client summaries.
Calls: scripts/nimbus/calls.py is team-only and regex. Homeowner calls aren't handled.

## Biggest gaps vs Jack's goals, ranked
1. **Brain in the cloud (the unlock for everything else).** Host Claude with tools as a Supabase edge function or Cloudflare worker, like roof-engine/draft. Then the full brain works on roofers' phones, with no laptop and no localsvc toggle. Use the API brain, so it sees tool results across multiple steps.
2. **Edits the app.** Widen change_setting: show and hide sections, reorder panels, saved views and filters, add and remove pipeline stages, message templates. Add propose_change, which previews a config diff and applies it on confirm, with Undo. Send request_change to a cloud table instead of localStorage.
3. **Sells automatically.** Add draft_reply and draft_followups that write in the roofer's voice into an approval tray, plus approve_send for warm homes only, with a code-enforced rule that cold homes always need a human tap. Add set_cadence. Keep the Texas window and opt-out checks.
4. **Client memory.** A per-home client_notes store, auto-summarised after each reply or call and cloud-synced. A remember(home, fact) tool. Roofer-given nicknames ("the lady with the dog"), fuzzy search, and a per-home brief in context.
5. **Voice.** Cloud text-to-speech and speech-to-text (OpenAI or ElevenLabs paid) through a proxy. Pre-render common lines. Talk mode as the default on mobile.
6. **Inbound homeowner calls.** Twilio plus a cloud brain with tools: identify the home by phone, book, take a message, text the roofer a summary.
7. **Non-tech roofers.** Ask a clarifying question instead of the dead-end miss. Macros like "start my day" and "wrap up". A proactive loop for storm hits, replies, and an inspection coming up in 1 hour.

## Bugs found (file:line)
- brain:121 vs :135: "nobody answered" opens the inbox instead of logging no-answer.
- brain:113: any sentence containing "request" or "feature" becomes a Wing request.
- brain:124: any mention of seo, website or blog hijacks the request.
- brain:70: "undo" matches with no word boundary.
- brain:136: "not now" logs a knock instead of moving the stage.
- server.py: raw roofer words, including names, go to the model, against the KB privacy rule. The TTS lock serialises parallel clips. CORS is open to any localhost port.
- assistant.js:596: tool JSON is cut at 4000 characters, which breaks the JSON.
- assistant.js:287-299: the "Nimbus can call me" settings are saved but nothing reads them.
- calls.py: the docstring says Claude, but it's regex only.
- settings.js:100 and ops.js:~190: setInterval loops run every 1.5 seconds. Settings changes reload the frame and lose the roofer's place.
