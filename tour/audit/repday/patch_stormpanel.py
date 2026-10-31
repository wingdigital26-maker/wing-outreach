"""One-off patch (10-22): the storm map's home panel says what the lead card says (LiDAR squares + pitch as estimates, re-roof
line from st-meta, no guessed planes / edges / walls); a story count shows only when the LiDAR is sure (no 'likely 3')."""
R = 'C:/Users/wjack/roof-command-sell/tour/lib/'

def patch(rel, pairs):
    p = R + rel; s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (rel, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)

i0 = "  const per=f.permit?f.permit.slice(0,4):null;"
patch('st-map.js', [(
    i0 + "\n  document.getElementById('p-age').textContent=per||(f.year?String(f.year):'None'); document.querySelector('#p-age+span').textContent=per?'reroof permit':f.year?'built, no permit':'reroof permit';",
    "  // last re-roof only from the sources the lead card uses (lib/st-meta.js reroof); else the year built, no permit claim (10-22)\n"
    "  const rr=f.reroof&&!f.reroof.none?f.reroof:null;\n"
    "  document.getElementById('p-age').textContent=rr?rr.when.slice(0,4):f.year?String(f.year):'None'; document.querySelector('#p-age+span').textContent=rr?(rr.done?'re-roof permit':'permit, not confirmed'):f.year?'built':'year built';"),
  ("  const M=f.M, E=M.edges;\n  document.getElementById('p-sq').textContent=M.facet?M.squares+' sq measured':'~'+M.squares+' sq (est.)';",
   "  // roof size and pitch only from the home's LiDAR record (estimates); the outline's planes and edges are not this roof's (10-22)\n"
   "  const W=window.RCROOF&&f.roof?RCROOF.words(f.roof):null, ly=f.roof?f.roof.year||2018:null;\n"
   "  document.getElementById('p-sq').textContent=W&&W.sq>0?'~'+W.sq+' sq':'Not measured';\n"
   "  box.innerHTML=(W&&W.sq>0?`<p class=\"rm-l\"><b>~${W.sq} squares, pitch ${esc(W.pitch||'not measured')}</b>, estimated from ${ly} LiDAR (typically within 6 to 8% of a roofer's count). Roof shape being checked; verify on site.</p>`\n"
   "    :`<p class=\"rm-l\"><b>Roof size not measured.</b> ${f.lidarBefore?'Built '+f.year+', after the '+f.lidarBefore+' LiDAR flew.':'No LiDAR roof record covers this home.'}</p>`)\n"
   "    +(f.reroof?`<p class=\"rm-l\">${esc(f.reroof.text)}${f.reroof.none?'':', '+esc(f.reroof.means)} (${esc(f.reroof.src)}).</p>`:'');\n"
   "  return;\n"
   "  const M=f.M, E=M.edges;"),
])
patch('rc-roof.js', [(
    "    const n = Math.min(3, Math.round(row.stories)), sure = row.storyConf >= GOOD;",
    "    const n = Math.min(3, Math.round(row.stories)), sure = row.storyConf >= GOOD;\n"
    "    if (!sure) return null;   // a low-confidence count ('likely 3' on a one-story house) is a guess: not shown (10-22)"),
])
print('patched')
