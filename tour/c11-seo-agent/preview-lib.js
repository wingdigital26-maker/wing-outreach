/* Nimbus SEO page preview: builds a self-contained HTML page for one search, in the browser, from seo-agent.json.
   Nothing here publishes. index.html stores the built page in localStorage ('seo-preview:<slug>') and
   preview.html?slug=<slug> renders it. Client name, colours and logo come from the active roofer (brand.js). */
(function(){
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const STOP=new Set(['tx','in','the','a','an','for','of','near','me','and','to','my','on']);
  const cap=s=>String(s||'').replace(/\b([a-z])/g,m=>m.toUpperCase());
  const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(Boolean);
  const mainWords=kw=>words(kw).filter(w=>!STOP.has(w));

  // the page record for a slug (preview first, then pages) and its keyword row
  function find(d,slug){
    const all=[d.preview].concat(d.pages||[]).filter(Boolean);
    const pg=all.find(x=>x.slug===slug)||null;
    const kw=(d.keywords||[]).find(k=>k.slug===slug)||null;
    return {pg,kw};
  }

  // the two real checks plus suggested fixes
  function checks(pg,kw,brand){
    const keyword=(kw&&kw.keyword)||(pg&&pg.keyword)||'';
    const city=(kw&&kw.city)||(pg&&pg.city)||'';
    const svc=(kw&&kw.service)||'';
    const title=pg?pg.title:(svc&&city?`${svc} in ${city}, TX | ${brand}`:cap(keyword));
    const h1=pg?(pg.h1||pg.title):(svc&&city?`${svc} in ${city}, TX`:cap(keyword));
    const need=mainWords(keyword), have=new Set(words(h1));
    const missing=need.filter(w=>!have.has(w));
    const base=svc&&city?`${svc} in ${city}, TX`:cap(keyword.replace(/\btx\b/i,'TX'));
    let fixTitle=`${base} | ${brand}`; if(fixTitle.length>60) fixTitle=base.slice(0,60);
    return {keyword,title,h1,titleLen:title.length,titleOk:title.length<=60,h1Ok:!need.length||!missing.length,missing,
      fixTitle,fixH1:base,meta:pg?pg.meta:''};
  }

  function build(d,slug,r){
    const {pg,kw}=find(d,slug);
    const brand=(r&&r.name)||'Your roofing company';
    const accent=(r&&r.accent)||'#0D6C99', soft=(r&&r.soft)||'#E3F6FE', ink=(r&&r.ink)||'#07547A';
    const c=checks(pg,kw,brand);
    const city=(kw&&kw.city)||(pg&&pg.city)||(r&&r.city)||'';
    const svc=(kw&&kw.service)||'Roofing';
    const site=String(d.site||'').replace(/\/$/,'');
    const hero=(pg&&pg.hero)||(site?site+'/assets/img/home-inspection.webp':'');
    const phone=r&&r.phone?String(r.phone):'';
    const intro=c.meta||`${svc} for homes in ${city||'your area'}. A local roofer looks at your roof, tells you what they see, and gives you a clear next step.`;
    const sections=[
      [`What ${svc.toLowerCase()} covers in ${city}`,`Every visit starts on the roof: shingles, flashing, vents, gutters and the decking you can see from the attic. You get photos of anything that needs attention.`],
      [`Why ${city} roofs need a look`,`North Texas hail and wind wear roofs faster than most places. Small damage now turns into leaks later, so a check after a storm is worth it.`],
      [`How to book`,`Call or send a message. ${brand} sets a time that works for you, and you get a written summary after the visit.`]];
    const faq=[
      [`How long does ${svc.toLowerCase()} take in ${city}?`,`Most visits take under an hour for a typical home.`],
      [`Do I need to be home?`,`It helps for the walkthrough at the end, but the roof check itself can be done while you are out.`],
      [`Will it work with my insurance?`,`If there is storm damage, you get photos and notes you can share with your insurer.`]];
    const url=(pg&&pg.url)||(kw&&kw.url)||(site?`${site}/services/${slug}.html`:'');
    const schema=[
      {"@context":"https://schema.org","@type":"RoofingContractor","name":brand,"areaServed":city||undefined,"url":site||undefined,"telephone":phone||undefined},
      {"@context":"https://schema.org","@type":"Service","serviceType":svc,"provider":{"@type":"RoofingContractor","name":brand},"areaServed":city||undefined},
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":faq.map(([q,a])=>({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))}];
    const callBtn=phone?`<a class="btn" href="tel:${esc(phone.replace(/[^0-9+]/g,''))}">Call ${esc(brand)}</a>`:`<span class="btn" title="No phone number on file for this roofer yet">Call ${esc(brand)}</span>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)}</title><meta name="description" content="${esc(intro)}">${url?`<link rel="canonical" href="${esc(url)}">`:''}
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>
<style>
:root{--a:${accent};--s:${soft};--i:${ink}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2229;background:#fff}
.bar{background:#fff8e6;color:#6b4e00;font-size:13px;padding:8px 20px;text-align:center;border-bottom:1px solid #f1e2b8}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 40px;border-bottom:1px solid #eceef1}
header b{font-size:18px;color:var(--i)}header nav{display:flex;gap:22px;font-size:14px;color:#4a525c}
.hero{position:relative;min-height:440px;display:flex;align-items:flex-end;color:#fff;background:#10161c}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5}
.hero .in{position:relative;max-width:1040px;margin:0 auto;padding:60px 40px;width:100%}
.hero small{display:block;font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.85;margin-bottom:10px}
h1{margin:0;font-size:46px;line-height:1.1;max-width:20ch}.hero p{max-width:60ch;font-size:18px;opacity:.92}
.btn{display:inline-block;margin-top:14px;padding:13px 22px;border-radius:8px;background:var(--a);color:#fff;font-weight:600;text-decoration:none}
main{max-width:1040px;margin:0 auto;padding:40px}
section{margin:0 0 34px}h2{font-size:28px;margin:0 0 8px;color:var(--i)}
.faq{background:var(--s);border-radius:14px;padding:28px 32px}.faq h3{margin:16px 0 4px;font-size:18px}.faq p{margin:0}
.cta{background:var(--i);color:#fff;border-radius:14px;padding:32px;text-align:center}.cta .btn{background:#fff;color:var(--i)}
footer{padding:24px 40px;color:#6b737d;font-size:13px;border-top:1px solid #eceef1}
</style></head><body>
<div class="bar">Preview built by Nimbus from the page data. Not published. ${url?'Planned address: '+esc(url):''}</div>
<header><b>${esc(brand)}</b><nav><span>Services</span><span>About</span><span>Blog</span><span>Contact</span></nav></header>
<div class="hero">${hero?`<img src="${esc(hero)}" alt="${esc(svc)} in ${esc(city)}">`:''}<div class="in"><small>${esc(svc)} · ${esc(city)}, TX</small><h1>${esc(c.h1)}</h1><p>${esc(intro)}</p>${callBtn}</div></div>
<main>
${sections.map(([h,p])=>`<section><h2>${esc(h)}</h2><p>${esc(p)}</p></section>`).join('')}
<section class="faq"><h2>Questions people ask</h2>${faq.map(([q,a])=>`<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}</section>
<section class="cta"><h2 style="color:#fff">Ready for a look at your roof?</h2><p>${esc(brand)} serves ${esc(city)} and nearby cities.</p>${callBtn}</section>
</main><footer>${esc(brand)} · ${esc(city)}, TX</footer></body></html>`;
  }
  window.SEOPreview={find,checks,build,mainWords};
})();
