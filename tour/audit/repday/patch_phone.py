"""One-off patch (10-22): no sample phone numbers anywhere; the rep adds a real phone on the home record."""
R = 'C:/Users/wjack/roof-command-sell/tour/'

def patch(rel, pairs):
    p = R + rel; s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (rel, a[:60]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)

patch('c4-command-deck/deck.html', [
    ("const samplePhone = i => '+1'+(R.areaCode||'972')+'555'+String(100+i).padStart(4,'0');   // 555-01xx: fictional numbers\n",
     "// no sample phone numbers (10-22): a home has a phone only when the rep added one (record > Add phone) or a record holds one\n"),
    ("phone:seen.phone || samplePhone(i),", "phone:seen.phone && !/5550\\d{3}$/.test(String(seen.phone)) ? seen.phone : null,"),
    ("const ph = h.phone ? pretty(h.phone)+' (sample)' : '';", "const ph = h.phone ? pretty(h.phone) : '';"),
    ("(h.phone ? pretty(h.phone)+(OWNDATA?' (sample phone)':'') : 'No phone on file')", "(h.phone ? pretty(h.phone) : 'No phone on file')"),
])

patch('c5-home/rec.js', [
    ("    const digits = String(rec.phone || '').replace(/\\D/g, '');",
     "    // a fictional 555-01xx number saved by an older Today build is not a phone (10-22)\n"
     "    if (rec.phone && /5550\\d{3}$/.test(String(rec.phone).replace(/\\D/g, '')) && !rec.phoneBy) rec.phone = null;\n"
     "    const digits = String(rec.phone || '').replace(/\\D/g, '');"),
    ("    document.querySelectorAll('.callwhy').forEach(w => { w.hidden = c.ok; w.textContent = c.reason; });",
     "    document.querySelectorAll('.callwhy').forEach(w => { w.hidden = c.ok; w.innerHTML = esc(c.reason) + (tel ? '' : ' <button type=\"button\" class=\"addph\" data-act=\"addphone\">Add phone</button>'); });\n"
     "    document.querySelectorAll('[data-act=\"addphone\"]').forEach(b => b.onclick = phoneDlg);"),
    ("['Phone', rec.phone ? esc(rec.phone) + ' (sample)' : 'Not on file']",
     "['Phone', rec.phone ? esc(rec.phone) + (rec.phoneBy === 'you' ? ' <i class=\"src\">added by you</i>' : '') : 'Not on file <button type=\"button\" class=\"addph\" data-act=\"addphone\">Add phone</button>']"),
    ("  document.querySelectorAll('[data-act=\"text\"]').forEach(b => b.onclick = textDlg);",
     "  document.querySelectorAll('[data-act=\"text\"]').forEach(b => b.onclick = textDlg);\n"
     "  // ---------- add a phone the homeowner gave the rep (at the door, a call back): saved with this home on this device ----------\n"
     "  function phoneDlg() {\n"
     "    open('Add a phone number', `<p class=\"dl\">Only a number the homeowner gave you, or one from a source you are allowed to text. It is saved with this home and the Text button uses it.</p>\n"
     "      <input id=\"phIn\" type=\"tel\" inputmode=\"tel\" autocomplete=\"off\" placeholder=\"(972) 555-1234\" class=\"draft\" style=\"width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px\">\n"
     "      <p class=\"dl\" id=\"phWhy\" hidden></p><div class=\"drow\"><button type=\"button\" class=\"pbtn\" id=\"phSave\">Save phone</button></div>`, body => {\n"
     "      const inp = body.querySelector('#phIn'), why = body.querySelector('#phWhy'); inp.value = rec.phone || ''; inp.focus();\n"
     "      body.querySelector('#phSave').onclick = () => {\n"
     "        const d = inp.value.replace(/\\D/g, ''), ok = d.length === 10 || (d.length === 11 && d[0] === '1');\n"
     "        if (!ok) { why.hidden = false; why.textContent = 'Type a 10 digit US number.'; return; }\n"
     "        const p = d.slice(-10), pretty = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;\n"
     "        RC.remember({ id, phone: pretty, phoneBy: 'you' }); rec.phone = pretty; rec.phoneBy = 'you'; tel = '+1' + p;\n"
     "        RC.note(id, 'Phone added: ' + pretty); dlg.close(); say('Phone saved. Text is ready.'); renderAll();\n"
     "      };\n"
     "    });\n"
     "  }"),
])
print('patched')
