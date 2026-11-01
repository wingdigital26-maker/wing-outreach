// Low-RAM local runner (no workerd): serves the worker's fetch handler on :8787 with Node's built-in fetch.
// Usage: node workers/nimbus-brain/dev.mjs   (reads ANTHROPIC_API_KEY from .dev.vars or the environment)
import http from 'node:http';
import fs from 'node:fs';
import worker from './src/index.js';
const here = new URL('.', import.meta.url);
const env = { MODEL: 'claude-sonnet-5-5', MAX_OUTPUT_TOKENS: '1024', DAILY_USD_CAP: '5', ALLOWED_ORIGINS: 'http://localhost:4965,http://127.0.0.1:4965' };
try { for (const l of fs.readFileSync(new URL('.dev.vars', here), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*(\w+)\s*=\s*"?(.*?)"?\s*$/); if (m) env[m[1]] = m[2]; } } catch (e) { }
// same local env files as scripts/nimbus/server.py; the key stays in this process
for (const f of ['C:/Users/wjack/ghl-cli/.env', 'C:/Users/wjack/wing-digital-os/.env.local']) { if (env.ANTHROPIC_API_KEY) break; try { const m = fs.readFileSync(f, 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^\s"']+)/m); if (m) env.ANTHROPIC_API_KEY = m[1]; } catch (e) { } }
if (process.env.ANTHROPIC_URL) { env.ANTHROPIC_URL = process.env.ANTHROPIC_URL; env.ANTHROPIC_API_KEY = 'mock'; }   // test: a scripted stand-in for the model
if (!env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
http.createServer(async (q, s) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const req = new Request('http://localhost:8787' + q.url, { method: q.method, headers: q.headers, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : body });
  let r; try { r = await worker.fetch(req, env); } catch (e) { console.error(e); s.writeHead(500); return s.end(); }
  s.writeHead(r.status, Object.fromEntries(r.headers)); s.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log('nimbus-brain on http://localhost:8787'));
