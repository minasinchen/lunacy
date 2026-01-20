// mittelschmerz_stats.js - Extra Statistiken fuer Mittelschmerz (links/rechts/Muster)
// Wird NACH app.js geladen. app.js ruft window.renderMittelschmerzStats(...) auf.

(function(){
  "use strict";

  function normSide(s){
    const v = String(s||"").trim().toLowerCase();
    if (v === "links") return "links";
    if (v === "rechts") return "rechts";
    if (v === "beidseitig") return "beidseitig";
    return "";
  }

  function ensureContainer(){
    const view = document.getElementById("view-stats");
    if (!view) return null;

    let box = document.getElementById("mittelschmerzStats");
    if (box) return box;

    box = document.createElement("div");
    box.id = "mittelschmerzStats";
    box.style.marginTop = "14px";

    // Insert after the last12 table if possible
    const last12 = document.getElementById("last12");
    if (last12 && last12.parentElement){
      last12.insertAdjacentElement("afterend", box);
    } else {
      view.appendChild(box);
    }

    return box;
  }

  function findMittelschmerzInWindow(notesByDate, start, end, between, parseISO){
    const keys = Object.keys(notesByDate || {}).sort();
    const matches = [];
    for (const dateISO of keys){
      const d = parseISO(dateISO);
      if (!between(d, start, end)) continue;
      const notes = notesByDate[dateISO] || [];
      for (const n of notes){
        if (n && n.type === "MITTELSCHMERZ"){
          matches.push({ dateISO, note: n });
        }
      }
    }
    // sort by date ascending, then createdAt
    matches.sort((a,b)=>{
      if (a.dateISO < b.dateISO) return -1;
      if (a.dateISO > b.dateISO) return 1;
      const ca = String(a.note?.createdAt||"");
      const cb = String(b.note?.createdAt||"");
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
    return matches;
  }

  function compute(payload){
    const { periods, model, notesByDate, avgCycle, diffDays, addDays, parseISO, between, computeOvulationForCycle } = payload;

    // cycles old->new for pattern recognition
    const cycles = (periods || []).slice(0, 12).slice().sort((a,b)=>a.start-b.start);
    const out = [];

    for (let i=0;i<cycles.length;i++){
      const cur = cycles[i];
      const next = (i+1 < cycles.length) ? cycles[i+1] : { start: addDays(cur.start, avgCycle || model?.cycleLen || 28) };
      const cycleEnd = addDays(next.start, -1);

      const msAll = findMittelschmerzInWindow(notesByDate, cur.start, cycleEnd, between, parseISO);

      // Pick a Mittelschmerz entry for this cycle.
      // Preference order:
      // 1) first entry that has a meaningful side (links/rechts/beidseitig)
      // 2) otherwise: earliest entry in the cycle
      let ms = null;
      if (msAll.length){
        ms = msAll.find(x => {
          const s = normSide(x?.note?.side);
          return s === "links" || s === "rechts" || s === "beidseitig";
        }) || msAll[0];
      }

      const ov = computeOvulationForCycle(cur.start, next.start, model, notesByDate);

      const msDate = ms ? parseISO(ms.dateISO) : null;
      const proximity = (msDate ? diffDays(ov.ovuDate, msDate) : null); // ms - ov (in days)

      out.push({
        cycleStart: cur.start,
        ms,
        msDate,
        side: normSide(ms?.note?.side),
        intensity: (typeof ms?.note?.intensity === "number") ? ms.note.intensity : null,
        ov,
        proximity,
      });
    }

    return out;
  }

  function summarize(items){
    const totalCycles = items.length;
    const withMS = items.filter(x=>!!x.msDate);

    const counts = { links:0, rechts:0, beidseitig:0, unbekannt:0 };
    for (const it of withMS){
      if (it.side === "links") counts.links++;
      else if (it.side === "rechts") counts.rechts++;
      else if (it.side === "beidseitig") counts.beidseitig++;
      else counts.unbekannt++;
    }

    // dominant side (ignore unknown/beidseitig)
    const dom = (counts.links === 0 && counts.rechts === 0) ? null : (counts.links === counts.rechts ? "gleich" : (counts.links > counts.rechts ? "links" : "rechts"));

    // switching analysis: consider only cycles where side is links/rechts
    const lr = withMS.map(x=>x.side).filter(s=>s==="links" || s==="rechts");
    let same = 0, switchy = 0;
    for (let i=1;i<lr.length;i++){
      if (lr[i] === lr[i-1]) same++;
      else switchy++;
    }
    let patternLabel = "–";
    if (lr.length >= 3){
      if (switchy >= same + 1) patternLabel = "wechselt oft";
      else if (same >= switchy + 1) patternLabel = "bleibt oft gleich";
      else patternLabel = "gemischt";
    } else if (lr.length >= 2){
      patternLabel = (lr[0] === lr[1]) ? "gleichbleibend" : "wechselnd";
    }

    // proximity buckets
    let onDay = 0, plusminus1 = 0, farther = 0;
    for (const it of withMS){
      const d = it.proximity;
      if (d === 0) onDay++;
      else if (d === 1 || d === -1) plusminus1++;
      else farther++;
    }

    return {
      totalCycles,
      withMSCount: withMS.length,
      counts,
      dominant: dom,
      patternLabel,
      proximity: { onDay, plusminus1, farther },
    };
  }

  function pct(part, whole){
    if (!whole) return "0";
    return String(Math.round((part/whole)*100));
  }

  function render(payload){
    const box = ensureContainer();
    if (!box) return;

    const items = compute(payload);
    const s = summarize(items);

    // If no MS at all, show a compact hint and bail.
    if (s.withMSCount === 0){
      box.innerHTML = `
        <h3 style="margin-top:14px;">Mittelschmerz-Statistik</h3>
        <p class="muted" style="margin-top:6px;">Noch keine Mittelschmerz-Notizen in deinen letzten Zyklen. Trage im Kalender bei einem Tag eine Notiz vom Typ „Mittelschmerz“ ein (optional mit Seite/Intensität).</p>
      `;
      return;
    }

    const c = s.counts;
    const domText = (s.dominant === null) ? "–" : (s.dominant === "gleich" ? "links & rechts gleich oft" : `eher ${s.dominant}`);

    const prox = s.proximity;
    const proxTotal = prox.onDay + prox.plusminus1 + prox.farther;

    box.innerHTML = `
      <h3 style="margin-top:14px;">Mittelschmerz-Statistik</h3>
      <div class="grid2" style="margin-top:10px;">
        <div class="card inner"><div class="muted">Zyklen betrachtet</div><div class="big">${s.totalCycles}</div></div>
        <div class="card inner"><div class="muted">Zyklen mit Mittelschmerz</div><div class="big">${s.withMSCount}</div></div>

        <div class="card inner"><div class="muted">Seite: rechts</div><div class="big">${c.rechts} <span class="muted" style="font-size:12px;">(${pct(c.rechts, s.withMSCount)}%)</span></div></div>
        <div class="card inner"><div class="muted">Seite: links</div><div class="big">${c.links} <span class="muted" style="font-size:12px;">(${pct(c.links, s.withMSCount)}%)</span></div></div>

        <div class="card inner"><div class="muted">Beidseitig</div><div class="big">${c.beidseitig}</div></div>
        <div class="card inner"><div class="muted">Dominanz</div><div class="big">${payload.escapeHtml(domText)}</div></div>

        <div class="card inner"><div class="muted">Muster (L/R)</div><div class="big">${payload.escapeHtml(s.patternLabel)}</div></div>
        <div class="card inner"><div class="muted">Nähe zum Eisprung</div><div class="big">${pct(prox.onDay + prox.plusminus1, proxTotal)}% <span class="muted" style="font-size:12px;">(am Tag / ±1)</span></div></div>

        <div class="card inner" style="grid-column:1/-1;">
          <div class="muted">Aufschlüsselung Nähe zum Eisprung (nur Zyklen mit Mittelschmerz)</div>
          <div class="badges" style="margin-top:8px;">
            <span class="badge">am Eisprung: ${prox.onDay}</span>
            <span class="badge">±1 Tag: ${prox.plusminus1}</span>
            <span class="badge">weiter weg: ${prox.farther}</span>
          </div>
          <div class="muted" style="margin-top:8px;font-size:12px;">Hinweis: Eisprung ist in Lunacy eine Näherung (LH+ hat Priorität). Diese Auswertung ist rein statistisch.</div>
        </div>
      </div>
    `;
  }

  window.renderMittelschmerzStats = render;
})();
