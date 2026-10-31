import json,pathlib,sys
from playwright.sync_api import sync_playwright
OUT=pathlib.Path(__file__).parent; S=json.load(open("C:/Users/wjack/AppData/Local/Temp/rep1011/session.json"))
B="https://wingdigital26-maker.github.io/jackson-roof-command/product.html"
ARGS=["--use-gl=swiftshader","--enable-unsafe-swiftshader"]
def fr(pg,part): return next((f for f in pg.frames if part in f.url),None)
R={}
with sync_playwright() as p:
    b=p.chromium.launch(args=ARGS)
    # logged out
    c=b.new_context(viewport={"width":1440,"height":900}); pg=c.new_page(); pg.goto(B,wait_until="domcontentloaded"); pg.wait_for_timeout(15000)
    R["out"]={"text":pg.evaluate("document.body.innerText")[:300],"nav":pg.evaluate("[...document.querySelectorAll('#nav a,#nav button')].map(e=>e.innerText.trim())")}
    pg.screenshot(path=str(OUT/"live-logged-out-1440.png")); c.close()
    for hid in sys.argv[1:]:
        c=b.new_context(viewport={"width":1440,"height":900}); c.add_init_script("try{localStorage.setItem('rc.session',%s);sessionStorage.setItem('rc.introSeen','1');localStorage.setItem('rc.t.stormSeen',JSON.stringify('2099-01-01'))}catch(e){}"%json.dumps(json.dumps(S)))
        c.route("**/formsubmit.co/**",lambda x:x.abort()); pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
        pg.goto(B+"#/crm/home/"+hid,wait_until="domcontentloaded")
        f=None
        for _ in range(240):
            f=fr(pg,"c5-home")
            try:
                if f and f.evaluate("!!(window.HOME&&HOME.roof&&HOME.measure)"): break
            except Exception: pass
            pg.wait_for_timeout(500)
        pg.wait_for_timeout(6000)
        r=R[hid]={"errs":errs,"nav":pg.evaluate("[...document.querySelectorAll('#nav a,#nav button')].map(e=>e.innerText.trim())")}
        if f:
            r["measure"]=f.evaluate("HOME.measure"); r["roof"]=f.evaluate("({sq:HOME.roof.sq,p:HOME.roof.pitch,p2:HOME.roof.pitch2,st:HOME.roof.stories,facets:HOME.roof.facets,est:HOME.roof.est})")
            r["chip"]=f.evaluate("[...document.querySelectorAll('.rc-story')].map(e=>e.innerText)")
            r["title"]=f.evaluate("(document.querySelector('#stage')||document.body).parentElement.innerText.replace(/\s+/g,' ').slice(0,300)")
            pg.screenshot(path=str(OUT/f"live-{hid}-record.png"))
            try: f.locator("#stage").screenshot(path=str(OUT/f"live-{hid}-3d.png"))
            except Exception as e: r["e3d"]=str(e)[:80]
            f.evaluate("(()=>{const b=document.querySelector('#tabs [data-t=\"report\"]'); if(b) b.click();})()"); pg.wait_for_timeout(2500)
            r["report"]=f.evaluate("(document.querySelector('#report')||{innerText:''}).innerText.replace(/\s+/g,' ').slice(0,300)")
            r["svg"]=f.evaluate("!!document.querySelector('#report svg.rr-diag')")
            try: f.locator("#report").screenshot(path=str(OUT/f"live-{hid}-report.png"))
            except Exception as e: r["erep"]=str(e)[:80]
        c.close()
    b.close()
print(json.dumps(R,indent=1)[:5000]); (OUT/"live.json").write_text(json.dumps(R,indent=1))
