/* Nimbus cloud brain (Cloudflare Worker). One step of the tool loop per request, same protocol as the laptop server
   (scripts/nimbus/server.py):

     GET  /health  -> {brain_ok, brain:'cloud', model}
     POST /chat    {roofer, messages:[Anthropic message params], tools:[{name, description, input_schema}]}
                   -> {content:[blocks], stop_reason, usage}

   The browser runs every tool itself (tour/lib/nimbus-tools.js, with Undo) and posts tool_result blocks back, so the model
   sees each result before it answers. Nothing here touches the app's data and nothing here can send a message.

   Guards: CORS only for the app's origins, a cap on request size and output tokens, a daily dollar cap, and homeowner names
   cut to initials plus phone numbers masked before anything reaches the model (KB privacy rule). The API key is a worker
   secret (ANTHROPIC_API_KEY) and never goes to the page. */
import kb from '../../../tour/lib/nimbus-kb.json' with { type: 'json' };

const PRICE = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2.00, 10.00], 'claude-opus-5-5': [4.00, 20.00] };   // $ per 1M tokens in / out
const MAX_BODY = 120000;      // bytes of JSON from the page per step
const MAX_MESSAGES = 40;
const MAX_TOOLS = 80;

// ---------------------------------------------------------------- privacy
const PHONE = /\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const NAME_KEY = /^(name|owner|owner_name|homeowner|customer|contact|first_name|last_name|full_name)$/i;
const initials = s => String(s).trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join('');
export function scrub(x, key) {
  if (typeof x === 'string') {
    if (key && NAME_KEY.test(key) && /[A-Za-z]/.test(x)) return initials(x);
    return x.replace(PHONE, '[phone]').replace(EMAIL, '[email]');
  }
  if (Array.isArray(x)) return x.map(v => scrub(v));
  if (x && typeof x === 'object') {
    const o = {};
    const block = typeof x.type === 'string';   // a message block: its own name/id/type fields are not homeowner data
    for (const k of Object.keys(x)) o[k] = block && /^(id|tool_use_id|type|name)$/.test(k) ? x[k] : scrub(x[k], k);
    return o;
  }
  return x;
}
const nodash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ');

// ---------------------------------------------------------------- the prompt
function systemPrompt() {
  const topics = Object.entries(kb.topics || {}).map(([k, v]) => '- ' + k + ': ' + v.say).join('\n');
  const rules = (kb.rules || []).map(r => '- ' + r).join('\n');
  return `You are Nimbus, the assistant inside Wing Outreach, a storm and roof lead app for roofing companies.
The people talking to you are roofers and their reps. Many are not comfortable with software, so you do the clicking for them.

How you talk (your words are often spoken aloud):
- One or two short sentences. Plain words a roofer uses. No lists, no markdown, no emoji, never an em dash.
- Say what you did, then stop. If you need something, ask one short question.
- Professional and warm, like a good office manager. Never pushy.

How you act:
- Use the tools to run the app. Every tool shows on screen what it touches. Prefer doing over explaining how.
- Chain tools when a request needs it: look something up first, read the result, then act on what it says. Never guess an id, a home or a time a tool can give you.
- "This house", "this one", "them" mean the home on screen (home_on_screen in the context).
- Use real numbers from tool results only. If a tool fails, say why in plain words.
- If a request is unclear, ask one question instead of guessing.
- Homeowner names reach you as initials (for example J.S.). Use them as given; the app swaps the full name back in.

Hard rules:
${rules}
- You cannot send texts or emails. draft_message opens the draft with the words filled in; the roofer taps Send. Say so.
- Never promise anything about insurance, claims, coverage or deductibles. In Texas a roofer cannot act as a public adjuster or waive a deductible.

What things mean (use these words when explaining):
${topics}
`;
}

// ---------------------------------------------------------------- daily spend cap
const memSpend = { day: '', usd: 0 };   // fallback when no KV is bound (wrangler dev without --kv): per isolate only
const today = () => new Date().toISOString().slice(0, 10);
async function spentToday(env) {
  if (env.SPEND) return +(await env.SPEND.get('usd:' + today())) || 0;
  if (memSpend.day !== today()) { memSpend.day = today(); memSpend.usd = 0; }
  return memSpend.usd;
}
async function addSpend(env, usd) {
  if (env.SPEND) {
    const k = 'usd:' + today(), now = (+(await env.SPEND.get(k)) || 0) + usd;
    await env.SPEND.put(k, String(Math.round(now * 1e6) / 1e6), { expirationTtl: 3 * 86400 });
    return now;
  }
  await spentToday(env); memSpend.usd += usd; return memSpend.usd;
}

// ---------------------------------------------------------------- is the Anthropic account usable (no credit = off)
// A 1-token call, remembered for 10 minutes, so the app falls back at once instead of failing every turn.
const acctMemo = { at: 0, ok: false, err: '' };
async function accountOk(env) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, err: 'no key' };
  if (Date.now() - acctMemo.at < 600000) return acctMemo;
  const r = await fetch(env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] })
  }).catch(() => null);
  const d = r && await r.json().catch(() => null);
  acctMemo.at = Date.now(); acctMemo.ok = !!(r && r.ok);
  acctMemo.err = acctMemo.ok ? '' : /credit/i.test((d && d.error && d.error.message) || '') ? 'Anthropic account: no credit left' : 'model ' + (r ? r.status : 'unreachable');
  return acctMemo;
}

// ---------------------------------------------------------------- http
function allowedOrigin(env, origin) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return origin && list.includes(origin) ? origin : '';
}
function cors(origin) {
  const h = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  return h;
}
function out(code, obj, origin) {
  return new Response(JSON.stringify(obj), { status: code, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)) });
}

async function chat(body, env) {
  const model = env.MODEL || 'claude-sonnet-5-5';
  const messages = scrub((body.messages || []).slice(-MAX_MESSAGES));
  const tools = (body.tools || []).slice(0, MAX_TOOLS).map(t => ({ name: String(t.name), description: String(t.description || '').slice(0, 1200), input_schema: t.input_schema || { type: 'object' } }));
  if (!messages.length || messages[0].role !== 'user') return [400, { error: 'messages must start with a user turn' }];
  const r = await fetch(env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: +env.MAX_OUTPUT_TOKENS || 1024,
      system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      tools: tools.length ? tools.map((t, i) => i === tools.length - 1 ? Object.assign({}, t, { cache_control: { type: 'ephemeral' } }) : t) : undefined,
      tool_choice: tools.length ? { type: 'auto' } : undefined,
      messages
    })
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) return [502, { error: 'model ' + r.status + ': ' + ((d && d.error && d.error.message) || '').slice(0, 160) }];
  const u = d.usage || {}, [pin, pout] = PRICE[model] || [4, 20];
  const cost = ((u.input_tokens || 0) * pin + (u.cache_creation_input_tokens || 0) * pin * 1.25 + (u.cache_read_input_tokens || 0) * pin * 0.1 + (u.output_tokens || 0) * pout) / 1e6;
  await addSpend(env, cost);
  if (d.stop_reason === 'refusal') return [200, { content: [{ type: 'text', text: "I can't help with that one." }], stop_reason: 'end_turn' }];
  const content = (d.content || []).map(b => b.type === 'text' ? { type: 'text', text: nodash(b.text) } : b).filter(b => b.type === 'text' || b.type === 'tool_use');
  return [200, { content, stop_reason: d.stop_reason, usage: { in: u.input_tokens, out: u.output_tokens, cache_read: u.cache_read_input_tokens || 0 } }];
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = allowedOrigin(env, req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (!origin) return out(403, { error: 'origin not allowed' }, '');
    const cap = +env.DAILY_USD_CAP || 5;
    if (url.pathname === '/health') {
      const spent = await spentToday(env), acct = await accountOk(env);
      return out(200, { brain_ok: acct.ok && spent < cap, brain: 'cloud', model: env.MODEL || 'claude-sonnet-5-5', brain_err: acct.ok ? undefined : acct.err }, origin);
    }
    if (url.pathname === '/chat' && req.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) return out(503, { error: 'no key' }, origin);
      if (await spentToday(env) >= cap) return out(429, { error: 'daily cap reached' }, origin);
      const raw = await req.text();
      if (raw.length > MAX_BODY) return out(413, { error: 'too big' }, origin);
      let body; try { body = JSON.parse(raw); } catch (e) { return out(400, { error: 'bad json' }, origin); }
      try { const [code, obj] = await chat(body, env); return out(code, obj, origin); }
      catch (e) { return out(502, { error: String(e).slice(0, 160) }, origin); }
    }
    return out(404, { error: 'not found' }, origin);
  }
};
