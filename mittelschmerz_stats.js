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

    // ✅ benutze den festen Platzhalter aus der HTML
  const slot = document.getElementById("statsMittelschmerz");
  if (slot) return slot;

  // Fallback: falls der Slot fehlt, hänge ans Ende
    let box = document.getElementById("mittelschmerzStats");
    if (box) return box;

    box = document.createElement("div");
    box.id = "mittelschmerzStats";
    box.style.marginTop = "14px";

    view.appendChild(box);
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

    const c = s.counts;
    const prox = s.proximity;
    const proxTotal = s.withMSCount || 0;

    const domText = (()=>{
      if (!s.dominant) return "–";
      if (s.dominant === "gleich") return "gleich oft";
      if (s.dominant === "links") return "eher links";
      if (s.dominant === "rechts") return "eher rechts";
      return "–";
    })();

    // No entries at all -> keep it short and reassuring
    if (s.withMSCount === 0){
      box.innerHTML = `
        <div class="msHero">
          <div class="msHeroTop">
            <div>
              <div class="msTitle">Mittelschmerz – dein Muster</div>
              <div class="msSub muted">Letzte ${s.totalCycles} Zyklen • mit Eintrag: 0 (0%)</div>
            </div>
            <span class="msBadge">statistisch</span>
          </div>

          <div class="msKpis">
            <div class="msKpi">
              <div class="k">Kommt vor</div>
              <div class="v">0%</div>
              <div class="m muted">bisher kein Mittelschmerz eingetragen</div>
            </div>

            <div class="msKpi">
              <div class="k">Tipp</div>
              <div class="v">optional</div>
              <div class="m muted">wenn du’s trackst, erkennt Lunacy ein Muster</div>
            </div>

            <div class="msKpi">
              <div class="k">Hinweis</div>
              <div class="v">sanft</div>
              <div class="m muted">Auswertung ist rein statistisch</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Normal case (there are entries)
    box.innerHTML = `
      <div class="msHero">
        <div class="msHeroTop">
          <div>
            <div class="msTitle">Mittelschmerz – dein Muster</div>
            <div class="msSub muted">Letzte ${s.totalCycles} Zyklen • mit Eintrag: ${s.withMSCount} (${pct(s.withMSCount, s.totalCycles)}%)</div>
          </div>
          <span class="msBadge">statistisch</span>
        </div>

        <div class="msKpis">
          <div class="msKpi">
            <div class="k">Kommt vor</div>
            <div class="v">${pct(s.withMSCount, s.totalCycles)}%</div>
            <div class="m muted">Anteil Zyklen mit Mittelschmerz</div>
          </div>

          <div class="msKpi">
            <div class="k">Meistens</div>
            <div class="v">${payload.escapeHtml ? payload.escapeHtml(domText) : domText}</div>
            <div class="m muted">dominante Seite (L/R)</div>
          </div>

          <div class="msKpi">
            <div class="k">Timing</div>
            <div class="v">${pct(prox.onDay + prox.plusminus1, proxTotal)}%</div>
            <div class="m muted">am Eisprung / ±1 Tag</div>
          </div>
        </div>

        <div class="msBars">
          <div class="msBarsLabel muted">Nähe zum Eisprung (nur Zyklen mit Mittelschmerz)</div>
          <div class="msBar" role="img" aria-label="Verteilung Nähe zum Eisprung">
            <span class="seg s1" style="width:${(proxTotal ? (prox.onDay/proxTotal*100) : 0).toFixed(1)}%"></span>
            <span class="seg s2" style="width:${(proxTotal ? (prox.plusminus1/proxTotal*100) : 0).toFixed(1)}%"></span>
            <span class="seg s3" style="width:${(proxTotal ? (prox.farther/proxTotal*100) : 0).toFixed(1)}%"></span>
          </div>
          <div class="msLegend">
            <span class="msLegendItem"><span class="dot msDot1"></span>am ES: <b>${prox.onDay}</b></span>
            <span class="msLegendItem"><span class="dot msDot2"></span>±1: <b>${prox.plusminus1}</b></span>
            <span class="msLegendItem"><span class="dot msDot3"></span>weiter: <b>${prox.farther}</b></span>
          </div>
        </div>

        <details class="msDetails">
          <summary>Details (Seite & Muster)</summary>
          <div class="msDetailsBody">
            <div class="grid2" style="margin-top:10px;">
              <div class="card inner"><div class="muted">Seite: rechts</div><div class="big">${c.rechts} <span class="muted" style="font-size:12px;">(${pct(c.rechts, s.withMSCount)}%)</span></div></div>
              <div class="card inner"><div class="muted">Seite: links</div><div class="big">${c.links} <span class="muted" style="font-size:12px;">(${pct(c.links, s.withMSCount)}%)</span></div></div>
              <div class="card inner"><div class="muted">Beidseitig</div><div class="big">${c.beidseitig}</div></div>
              <div class="card inner"><div class="muted">Muster (L/R)</div><div class="big">${payload.escapeHtml ? payload.escapeHtml(s.patternLabel) : s.patternLabel}</div></div>
            </div>
          </div>
        </details>

        <div class="msHint muted">
          Hinweis: Der Eisprung ist in Lunacy eine Näherung (LH+ hat Priorität). Diese Auswertung ist rein statistisch.
        </div>
      </div>
    `;
  }

  window.renderMittelschmerzStats = render;
})();
