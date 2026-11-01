# Nimbus cloud brain

A Cloudflare Worker that runs Claude (`claude-sonnet-5-5`, tool use) for Nimbus. It works on a roofer's phone with no laptop.

How it works: the page sends the chat plus Nimbus's tool list. The worker asks Claude for one step and returns either tool calls or a final answer. The page runs the tools itself (with Undo, ringed on screen), posts the results back, and repeats for up to 5 steps. Claude sees every tool result before it answers. The worker never touches app data and cannot send a text or email: drafts still need the roofer's tap on Send.

Guards:
- CORS: only the origins in `ALLOWED_ORIGINS`. Other sites get a 403.
- Size: request body capped at 120 KB, last 40 messages, 80 tools. Output capped at `MAX_OUTPUT_TOKENS` (1024).
- Spend: `DAILY_USD_CAP` (default $5/day, all roofers together). At the cap `/health` reports off and the app quietly uses the built-in brain.
- Privacy: before anything reaches Claude, homeowner name fields become initials (Maria Lopez becomes M.L.), and phone numbers and emails are masked. The tools already keep names and phones out of their results.
- The API key is a worker secret. It never goes to the page.

Fallback order in `tour/lib/nimbus-assistant.js`: cloud brain, then the laptop server (:4913), then the built-in regex brain.

## Deploy (only after Jack says yes)
One command does steps 1 to 6: `powershell -ExecutionPolicy Bypass -File workers/nimbus-brain/deploy.ps1` (Cloudflare login opens in the browser once). By hand:
1. `cd workers/nimbus-brain`
2. `npx wrangler login` (Jack's Cloudflare account)
3. `npx wrangler kv namespace create SPEND`, then paste the id into `wrangler.toml` (uncomment the `kv_namespaces` block). Without it the daily cap is only per worker instance.
4. `npx wrangler secret put ANTHROPIC_API_KEY` (paste the key when asked; it is never stored in the repo)
5. Add the live app origin to `ALLOWED_ORIGINS` in `wrangler.toml` (for example `https://app.wingdigital.com`).
6. `npx wrangler deploy`. This prints the URL, like `https://nimbus-brain.<account>.workers.dev`.
7. Point the app at it: fill in `window.NIMBUS_CLOUD` in `tour/product.html` (the line just above the Nimbus scripts). For a one-device test, run `localStorage.setItem('rc.nimbus.cloud', '<url>')` in that browser instead.
8. Add credit to the Anthropic account first. On 2026-11-01 the API answered "credit balance is too low".

## Local test
- `node workers/nimbus-brain/dev.mjs` serves the worker on :8787. It reads the key from the same local env files as `scripts/nimbus/server.py` and keeps it in memory only. This is a Node runner instead of `wrangler dev` to save RAM. `npx wrangler dev` also works.
- No-spend test: `node workers/nimbus-brain/test/mock-anthropic.mjs`, then start the runner with `ANTHROPIC_URL=http://localhost:8799` set. The mock acts like Claude for "book the next storm-hit home Tuesday at 10": it reads each tool result the page posts back and books the address from step 1.
- In the app (:4965): `localStorage.setItem('rc.nimbus.cloud', 'http://localhost:8787')`, reload, then open Nimbus. The panel should say "Claude brain (online)".

## Cost estimate (Sonnet 5.5: $2 in / $10 out per 1M tokens)
One step is about 7k tokens of prompt and tools (cached, billed at 10%), about 3k of fresh chat, and about 100 tokens out, so roughly $0.009. A typical request takes 2 to 3 steps, so about $0.02 to $0.03.
- Light use (15 requests a day, 22 days): about **$6 to $10 per roofer per month**
- Heavy use (40 a day): about **$18 to $25 per roofer per month**
- 10 roofers on light use: about **$60 to $100 a month**
- Cloudflare Workers and KV: free tier (100k requests a day)
- With `MODEL = "claude-haiku-5-5"` instead, it costs about 1/20 of that (under $1 per roofer), but Haiku is weaker at multi-step chains.
