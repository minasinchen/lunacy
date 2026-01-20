// icsExport.js - Export Lunacy forecast as iCalendar (.ics)
// Loaded AFTER app.js (index.html). Uses helpers from utils.js + app.js.
// Exposes: window.exportCalendarICS({ includePeriod: boolean, includeFertile: boolean })

(function(){
  "use strict";

  function pad2(n){ return String(n).padStart(2, "0"); }

  // YYYYMMDD (DATE value)
  function toICSDate(dateOrISO){
    const d = (typeof dateOrISO === "string") ? parseISO(dateOrISO) : new Date(dateOrISO);
    return String(d.getFullYear()) + pad2(d.getMonth()+1) + pad2(d.getDate());
  }

  function escapeICSText(v){
    const s = String(v ?? "");
    return s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function uid(){
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  }

  function buildICS(events, meta){
    const prod = "-//Lunacy//Cycle Forecast//DE";
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");
    lines.push("PRODID:" + prod);
    lines.push("X-WR-CALNAME:" + escapeICSText(meta?.name || "Lunacy (Prognose)"));
    lines.push("X-WR-CALDESC:" + escapeICSText(meta?.description || "Lunacy – lokale Zyklus-Prognose"));

    for (const ev of events){
      const dtStart = toICSDate(ev.start);
      const dtEnd = toICSDate(ev.endExclusive);

      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + uid());
      lines.push("DTSTAMP:" + now);
      lines.push("SUMMARY:" + escapeICSText(ev.summary));
      lines.push("DTSTART;VALUE=DATE:" + dtStart);
      lines.push("DTEND;VALUE=DATE:" + dtEnd);
      lines.push("CLASS:PRIVATE");
      lines.push("TRANSP:TRANSPARENT");
      if (ev.description) lines.push("DESCRIPTION:" + escapeICSText(ev.description));
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    // Use CRLF for maximum compatibility
    return lines.join("\r\n") + "\r\n";
  }

  function downloadText(filename, text, mime){
    const blob = new Blob([text], { type: mime || "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 0);
  }

  function overlaps(aStart, aEndExclusive, bStart, bEndExclusive){
    return aStart < bEndExclusive && bStart < aEndExclusive;
  }

  function exportCalendarICS(opts){
    const includePeriod = !!opts?.includePeriod;
    const includeFertile = !!opts?.includeFertile;

    const days = loadBleedDays();
    const periods = derivePeriodsFromBleed(days);
    if (!periods.length){
      alert("Noch keine Blutungstage. Trage erst Daten ein, damit Lunacy eine Prognose erstellen kann.");
      return;
    }

    const settings = loadSettings();
    const approxCycles = Math.ceil(370 / clamp(Number(settings.cycleLen||28), 15, 60));
    const model = buildCalendarModel(periods, Math.max(6, approxCycles));

    const now = new Date();
    const startWin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endWinExclusive = addDays(startWin, 366); // ~12 months window

    const events = [];

    // Period forecast (only forecast, no actual periods)
    if (includePeriod){
      for (const p of model.forecastPeriods){
        const s = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate());
        const eEx = addDays(new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate()), 1);
        if (!overlaps(s, eEx, startWin, endWinExclusive)) continue;
        events.push({
          summary: "Periode (≈)",
          start: s,
          endExclusive: eEx,
          description: "Lunacy – Prognose (lokal, ohne Cloud)",
        });
      }
    }

    // Fertile window as one block per cycle
    if (includeFertile){
      for (const r of model.fertileRanges){
        const s = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate());
        const eEx = addDays(new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate()), 1);
        if (!overlaps(s, eEx, startWin, endWinExclusive)) continue;
        events.push({
          summary: "Fruchtbare Tage (≈)",
          start: s,
          endExclusive: eEx,
          description: "Lunacy – fruchtbares Fenster (Block).",
        });
      }
    }

    if (!events.length){
      alert("Keine Prognose-Termine im nächsten 12-Monate-Fenster gefunden.");
      return;
    }

    // Stable ordering helps when importing
    events.sort((a,b)=>{
      const ta = new Date(a.start).getTime();
      const tb = new Date(b.start).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.summary).localeCompare(String(b.summary));
    });

    const ics = buildICS(events, {
      name: "Lunacy (Prognose)",
      description: "Private Ganztags-Termine (Periode + fruchtbare Tage) – erstellt von Lunacy.",
    });

    const filename = "lunacy_prognose_" + iso(new Date()) + ".ics";
    downloadText(filename, ics, "text/calendar;charset=utf-8");
  }

  window.exportCalendarICS = exportCalendarICS;
})();
