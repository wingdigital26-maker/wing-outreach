// Scripted stand-in for the Messages API (no spend), for proving the page's multi-step tool loop end to end.
// It answers like the model would for "book the next storm-hit home Tuesday at 10", and each step READS the previous
// tool_result the page posted back: step 2 books the address that step 1 returned. Logs every request it gets.
// Usage: node workers/nimbus-brain/test/mock-anthropic.mjs   (port 8799), then ANTHROPIC_URL=http://localhost:8799 node workers/nimbus-brain/dev.mjs
import http from 'node:http';
const say = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 40 } });
const use = (id, name, input) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 3000, output_tokens: 60 } });
http.createServer(async (q, s) => {
  let raw = ''; for await (const c of q) raw += c;
  const b = JSON.parse(raw), msgs = b.messages, last = msgs[msgs.length - 1];
  const results = Array.isArray(last.content) ? last.content.filter(x => x.type === 'tool_result') : [];
  console.log('step', msgs.length, 'tools', (b.tools || []).length, 'last', JSON.stringify(last.content).slice(0, 300));
  let r;
  if (!results.length) r = use('t1', 'call_today', { ask: 'next', count: 1 });
  else {
    const prev = msgs[msgs.length - 2].content.find(x => x.type === 'tool_use'), d = JSON.parse(results[0].content);
    if (prev.name === 'call_today') {
      const m = d.data && d.data[0] && [d.data[0].street];   // the address comes from the tool result, not from the script
      r = m ? use('t2', 'book_inspection', { when: 'Tuesday at 10am', query: m[0] }) : say('I could not find a storm-hit home on today\'s list.');
    } else r = say(d.ok ? d.said : 'That did not work: ' + d.said);
  }
  s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(r));
}).listen(8799, () => console.log('mock model on :8799'));
