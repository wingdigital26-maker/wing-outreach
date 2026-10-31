"""Close-ups of every roof-to-wall junction and every valley of one home's 3D roof (headed GPU Chromium).
python _closeups.py <tag> <gi>  -> <tag>-close-NN.png + a contact sheet <tag>-closeups.png"""
import pathlib, sys, json, math
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
OUT = pathlib.Path(__file__).parent; TAG, GI = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(headless=False, args=["--window-position=2000,2000"])
    ctx = b.new_context(viewport={"width": 900, "height": 700}, device_scale_factor=1)
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    pg = ctx.new_page(); pg.goto("http://127.0.0.1:4886/tour/c5-home/index.html?dev=1&nosw=1&nointro=1&id=m" + GI, wait_until="domcontentloaded")
    for _ in range(240):
        try:
            if pg.evaluate("!!(window.HOME&&HOME.measure&&window.__ready&&window.__three&&window.__PLANES)"): break
        except Exception: pass
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(2500)
    pg.evaluate("""(()=>{const s=document.querySelector('#stage'); Object.assign(s.style,{position:'fixed',inset:'0',zIndex:'9999',width:'900px',height:'700px',background:'#eef1f6'});
      document.querySelectorAll('#labels,.title,.chips,#chips,.bar,#legend').forEach(e=>{try{e.style.visibility='hidden'}catch(x){}}); window.dispatchEvent(new Event('resize'));})()""")
    pg.wait_for_timeout(800)
    # junctions: midpoints of wall-type and valley-type edges, clustered 4 units apart
    spots = pg.evaluate("""(()=>{const out=[]; window.__PLANES.forEach(P=>P.types.forEach((t,i)=>{ if(t!=='wall'&&t!=='valley') return; const a=P.pts[i], b=P.pts[(i+1)%P.pts.length];
      out.push({t, x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2, id:P.id}); })); const cl=[];
      out.forEach(s=>{const c=cl.find(c=>Math.hypot(c.x-s.x,c.z-s.z)<4&&Math.abs(c.y-s.y)<3); if(c){c.n++; c.ids.add(s.id);} else cl.push({...s,n:1,ids:new Set([s.id])});});
      return cl.map(c=>({t:c.t,x:c.x,y:c.y,z:c.z,ids:[...c.ids].join('')}));})()""")
    print("spots", len(spots))
    shots = []
    for k, s in enumerate(spots):
        for j, (ax, az) in enumerate([(1, 1), (-1, -1)]):
            pg.evaluate("""([x,y,z,ax,az])=>{const {camera,controls}=window.__three; controls.target.set(x,y,z); const d=16, el=.55; const l=Math.hypot(ax,el,az);
              camera.position.set(x+ax/l*d, y+el/l*d, z+az/l*d); controls.update();}""", [s["x"], s["y"], s["z"], ax, az])
            pg.wait_for_timeout(350)
            f = OUT / f"{TAG}-close-{k:02d}{'ab'[j]}.png"; pg.screenshot(path=str(f)); shots.append((f, f"{k} {s['t']} {s['ids']} {'ab'[j]}"))
    b.close()
# contact sheet: 3 per row, half size
W, H = 450, 350; cols = 4; rows = math.ceil(len(shots) / cols)
sheet = Image.new("RGB", (cols * W, rows * (H + 18)), (255, 255, 255)); dr = ImageDraw.Draw(sheet)
for i, (f, cap) in enumerate(shots):
    im = Image.open(f).resize((W, H)); x, y = (i % cols) * W, (i // cols) * (H + 18); sheet.paste(im, (x, y + 18)); dr.text((x + 4, y + 3), cap, fill=(0, 0, 0))
sheet.save(OUT / f"{TAG}-closeups.png"); print("sheet", OUT / f"{TAG}-closeups.png", len(shots))
