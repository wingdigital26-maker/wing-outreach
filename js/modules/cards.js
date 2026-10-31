/* Roof Command demo. cards.js: house/property card markup (homePopup) + customer card (custPopup) +
   mini roof diagram. Moved verbatim from js/app.js (2026-10-02 split), no behaviour change. */
(function () {
  const RC = window.RC;
  const { $, esc, money, ic } = RC;
  const st = RC.st;

  function custPopup(id, ll) {
    const c = st.DATA.customers.find(x => x.id === id);
    const h = c.hail[st.MS.storm];
    new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(ll).setHTML(`<div class="pop"><b>${esc(c.name)}</b> <span class="tag accent">Customer</span><div class="muted" style="margin:2px 0 8px">${esc(c.addr)} &middot; sample record</div>
      <div class="row"><span>Radar hail, ${st.DATA.byDate[st.MS.storm].label}</span><b class="num">${h != null ? h.toFixed(2) + " in" : "no data for this storm"}</b></div>
      <div class="row"><span>Roof installed</span><span class="num">${c.roof_year}</span></div><div class="row"><span>Last job</span><span>${c.last_job}</span></div></div>`).addTo(st.map);
  }
  RC.custPopup = custPopup;

  // property card for any county home: address/city/zip/type/year/value from homes_meta.bin (lazy per
  // region), hail at the selected storm plus the worst storms already cached (never fetches all storms
  // on a click); "load full hail history" fetches every remaining storm's bin for this home's region,
  // sequentially, with a progress readout, only when the owner explicitly asks for it.
  function homePopup(region, id, ll) {
    const typeLabel = RC.TYPE_LABELS[region.type[id]] || "Building";
    const pop = new maplibregl.Popup({ closeButton: true, offset: 6, maxWidth: "272px" }).setLngLat(ll)
      .setHTML(`<div class="pop" style="min-width:210px"><b>${esc(typeLabel)}</b><div class="muted" style="margin:2px 0 8px">Loading property details...</div></div>`).addTo(st.map);
    let miniRoof; // undefined = not checked yet, null = checked/no footprint, object = has one
    function hailRows() {
      const dates = Object.keys(region.hailCache).filter(d => region.hailCache[d] && region.hailCache[d][id] >= 75);
      return dates.map(d => ({ date: d, label: st.DATA.byDate[d] ? st.DATA.byDate[d].label : d, in: region.hailCache[d][id] / 100 })).sort((a, b) => b.in - a.in);
    }
    // honest hail line: distinguishes "haven't fetched this storm's bin yet" from "fetched it, this
    // exact home shows nothing" -- the latter must never read as "not loaded" (F5 fix)
    function hailLine() {
      const curBytes = region.hailCache[st.MS.storm];
      const stLabel = st.DATA.byDate[st.MS.storm] ? st.DATA.byDate[st.MS.storm].label : st.MS.storm;
      if (curBytes === undefined) return { label: `Radar hail, ${stLabel}`, val: `<span class="muted" style="font-weight:400">Loading...</span>` };
      const v = curBytes ? curBytes[id] / 100 : 0;
      return v > 0 ? { label: `Radar hail, ${stLabel}`, val: v.toFixed(2) + " in" } : { label: `Radar hail, ${stLabel}`, val: `No hail recorded at this home` };
    }
    function render(m) {
      if (!pop.isOpen()) return;
      const hl = hailLine();
      const rows = hailRows().slice(0, 6);
      const allLoaded = st.DATA.catalog.every(s => !region.byDate[s.date] || region.hailCache[s.date] !== undefined);
      const owner = RC.regionOwnerInfo(region, id);
      pop.setHTML(`<div class="pop" style="min-width:230px"><b>${esc(m.addr)}</b><div class="muted" style="margin:2px 0 8px">${esc(m.city || "")}${m.zip ? " " + m.zip : ""} &middot; county tax roll &middot; not a current customer (sample)</div>
        ${owner ? `<div class="row"><span>Owner (tax roll)</span><b class="num">${esc(owner.name)}</b></div>` : ""}
        ${owner && owner.ownerOccupied ? `<div class="row"><span></span><span class="muted">Owner-occupied</span></div>` : ""}
        <div class="row"><span>Type</span><span class="num">${esc(typeLabel)}</span></div>
        <div class="row"><span>Home age (not roof age)</span><b class="num">${m.year ? "Built " + m.year : "On file"}</b></div>
        <div class="row"><span>Assessed value</span><b class="num">${m.value ? money(m.value) : "n/a"}</b></div>
        <div class="row"><span>${hl.label}</span><b class="num">${hl.val}</b></div>
        <div class="muted" style="margin-top:8px;margin-bottom:2px;font-weight:600;font-size:11.5px">Worst storms on file${allLoaded ? "" : " (loaded so far)"}</div>
        ${rows.length ? rows.map(h => `<div class="row"><span>${esc(h.label)}</span><b class="num">${h.in.toFixed(2)} in</b></div>`).join("") : `<div class="muted" style="font-size:12px">No hail loaded for this home yet beyond the selected storm.</div>`}
        ${allLoaded ? "" : `<button class="btn sm block" id="loadHistBtn" style="margin-top:8px">${ic("download")}Load full hail history</button>`}
        ${miniRoof ? `<div class="mini-roof">${RC.buildRoofDiagramSVG(miniRoof, { mini: true })}</div>` : ""}
        <button class="btn sm accent block" id="measureBtn" style="margin-top:8px">${ic("ruler")}Measure roof</button></div>`);
      $("#measureBtn")?.addEventListener("click", () => {
        st.roofReturn = { screen: st.lastMapScreen, center: st.map.getCenter(), zoom: st.map.getZoom(), regionId: region.id, homeId: id, lng: ll.lng, lat: ll.lat };
        RC.openRoofFor(region, id, { lng: ll.lng, lat: ll.lat }, m.addr);
      });
      $("#loadHistBtn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const need = st.DATA.catalog.filter(s => region.byDate[s.date] && region.hailCache[s.date] === undefined);
        for (let i = 0; i < need.length; i++) {
          if (!pop.isOpen()) return;
          btn.textContent = `Loading ${i + 1}/${need.length}...`;
          await RC.fetchHail(region, need[i].date);
        }
        if (pop.isOpen()) render(m);
      });
    }
    // auto-load this one region's bin for the currently-selected storm so the hail line is never stuck
    // on "not loaded" just because this home's region wasn't part of whatever screen set MS.storm
    RC.fetchHail(region, st.MS.storm).then(() => { if (pop.isOpen()) render(RC.regionHomeMeta(region, id)); });
    Promise.all([RC.loadRegionMeta(region), RC.loadRegionOwners(region)]).then(() => {
      if (pop.isOpen()) render(RC.regionHomeMeta(region, id));
      // best-effort mini footprint preview; never blocks or replaces the main render above
      RC.loadRoofForHome(region, id).then(rd => { miniRoof = rd || null; if (rd && pop.isOpen()) render(RC.regionHomeMeta(region, id)); });
    });
  }
  RC.homePopup = homePopup;
})();
