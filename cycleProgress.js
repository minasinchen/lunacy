// cycleProgress.js - Sternschnuppen-Progressbar (Heute)
// Wird nach app.js + tips.js geladen. Nutzt getCurrentCycleContext() aus tips.js.
// Exposed: window.renderCycleProgress(todayISO)

(function(){
  "use strict";

  function $(id){ return document.getElementById(id); }

  function safeParseISO(s){
    if (!s) return null;
    if (typeof window.parseISO === "function") return window.parseISO(s);
    return new Date(String(s) + "T00:00:00");
  }

  function safeFormatDateDE(dateOrISO){
    if (typeof window.formatDateDE === "function") return window.formatDateDE(dateOrISO);
    const d = (typeof dateOrISO === "string") ? safeParseISO(dateOrISO) : dateOrISO;
    if (!d) return "–";
    return d.toLocaleDateString("de-DE", { year:"numeric", month:"2-digit", day:"2-digit" });
  }

  function safeDiffDays(a, b){
    if (!a || !b) return 0;
    if (typeof window.diffDays === "function") return window.diffDays(a, b);
    const ms = 24*60*60*1000;
    const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.round((bb - aa) / ms);
  }

  function clamp(n, min, max){
    if (typeof window.clamp === "function") return window.clamp(n, min, max);
    return Math.max(min, Math.min(max, n));
  }

  function setLeftPct(el, pct){
    if (!el) return;
    const p = clamp(Number(pct) || 0, 0, 100);
    el.style.left = p.toFixed(3) + "%";
  }

  function computePayload(todayISO){
    if (typeof window.getCurrentCycleContext !== "function") return null;
    const ctx = window.getCurrentCycleContext();
    if (!ctx) return null;

    const today = safeParseISO(todayISO);
    const cycleStart = ctx.cycleStart;
    const nextStart = ctx.nextStart;
    const ovuDate = ctx.ovuDate;
    const periodEnd = ctx.periodEnd;
    const model = ctx.model;

    const cycleLen = Math.max(1, Number(model?.cycleLen) || 28);
    const dayInCycle = clamp(safeDiffDays(cycleStart, today) + 1, 1, cycleLen);
    const ovDay = clamp(safeDiffDays(cycleStart, ovuDate) + 1, 1, cycleLen);

    const isBleeding = Array.isArray(ctx.days) && ctx.days.includes(todayISO);
    const inPeriod = isBleeding || (today >= cycleStart && today <= periodEnd);

    let nextKey = "ovulation";
    let nextDate = ovuDate;
    let daysUntil = safeDiffDays(today, ovuDate);

    if (inPeriod){
      nextKey = "period_end";
      nextDate = periodEnd;
      daysUntil = safeDiffDays(today, periodEnd);
    } else if (today > ovuDate){
      nextKey = "next_period";
      nextDate = nextStart;
      daysUntil = safeDiffDays(today, nextStart);
    }

    return {
      ctx,
      model,
      today,
      todayISO,
      cycleStart,
      nextStart,
      ovuDate,
      periodEnd,
      cycleLen,
      dayInCycle,
      ovDay,
      inPeriod,
      nextKey,
      nextDate,
      daysUntil: Math.max(0, Number(daysUntil) || 0),
    };
  }

  function renderCycleProgress(todayISO){
    const card = $("cycleProgressCard");
    if (!card) return;

    const kicker = $("cycleProgressKicker");
    const headline = $("cycleProgressHeadline");
    const sub = $("cycleProgressSub");
    const badge = $("cycleProgressBadge");

    const track = $("cycleProgressTrack");
    const fill = $("cycleProgressFill");
    const mOvu = $("cycleMarkerOvu");
    const mToday = $("cycleMarkerToday");

    const startLabel = $("cycleProgressStartDate");
    const ovuWrap = $("cycleProgressOvuWrap");
    const ovuLabel = $("cycleProgressOvuDate");
    const nextLabel = $("cycleProgressNextStart");

    const p = computePayload(todayISO);
    if (!p){
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");

    // Fill length (progress)
    const prog01 = p.dayInCycle / Math.max(1, p.cycleLen);
    const progPct = clamp(prog01 * 100, 0, 100);
    if (fill) fill.style.width = progPct.toFixed(3) + "%";

    // Markers
    const ovPct = clamp(((p.ovDay - 1) / Math.max(1, p.cycleLen - 1)) * 100, 0, 100);
    const todayPct = clamp(((p.dayInCycle - 1) / Math.max(1, p.cycleLen - 1)) * 100, 0, 100);
    setLeftPct(mOvu, ovPct);
    setLeftPct(mToday, todayPct);

// TTC Blastozyste: direkt auf dem Heute-Kreis rendern (überdeckt ihn komplett)
if (mToday && typeof window.renderBlastocyst === "function"){
  window.renderBlastocyst({ markerEl: mToday });
}

    // Dates (bottom)
    if (startLabel) startLabel.textContent = safeFormatDateDE(p.cycleStart);
    if (ovuLabel) ovuLabel.textContent = safeFormatDateDE(p.ovuDate);
    if (nextLabel) nextLabel.textContent = safeFormatDateDE(p.nextStart);

    // Center the ovulation label under the golden star
    if (ovuWrap){
      // Keep label inside bounds so it never overflows on small screens
      const clamped = clamp(ovPct, 8, 92);
      ovuWrap.style.left = clamped.toFixed(3) + "%";
    }

    if (badge) badge.textContent = `ZT ${p.dayInCycle}/${p.cycleLen}`;

    const dd = p.daysUntil;
    const dateTxt = safeFormatDateDE(p.nextDate);

    if (p.inPeriod){
      const remaining = dd + 1; // inclusive
      if (kicker) kicker.textContent = "Aktuell";
      if (headline) headline.textContent = `Periode • noch ${remaining} Tag${remaining===1?"":"e"}`;
      if (sub) sub.textContent = `Bis voraussichtlich ${safeFormatDateDE(p.periodEnd)}`;
      card.setAttribute("data-state", "period");
    } else if (p.nextKey === "ovulation"){
      if (kicker) kicker.textContent = "Nächstes Ereignis";
      if (headline) headline.textContent = dd===0 ? "Eisprung (≈) ist heute" : `Eisprung (≈) in ${dd} Tag${dd===1?"":"en"}`;
      if (sub) sub.textContent = `Datum: ${dateTxt}`;
      card.setAttribute("data-state", "ovulation");
    } else {
      if (kicker) kicker.textContent = "Nächstes Ereignis";
      if (headline) headline.textContent = dd===0 ? "Periode (≈) ist heute" : `Periode (≈) in ${dd} Tag${dd===1?"":"en"}`;
      if (sub) sub.textContent = `Voraussichtlich: ${dateTxt}`;
      card.setAttribute("data-state", "next_period");
    }

    // ---- Lunacy: Set background phase for today-bg.css ----
    // data-phase expects: rueckzug | erwachen | bluete | einkehr
    // Regeln:
    // - Rückzug: während Periode
    // - Blüte: 3 Tage vor Eisprung bis 1 Tag nach Eisprung
    // - Erwachen: zwischen Periode und Blüte
    // - Einkehr: nach Blüte
    let phaseBg = "einkehr"; // fallback
    const ovuWindowBefore = 3; // 3 Tage vor Eisprung
    const ovuWindowAfter  = 1; // 1 Tag nach Eisprung

    if (p.inPeriod){
      phaseBg = "rueckzug";
    } else {
      const deltaToOvu = safeDiffDays(p.today, p.ovuDate); // >0 vor Ovu, 0 am Ovu-Tag, <0 nach Ovu
      const inOvuWindow = (deltaToOvu <= ovuWindowBefore && deltaToOvu >= -ovuWindowAfter);

      if (inOvuWindow){
        phaseBg = "bluete";
      } else if (p.today < p.ovuDate){
        phaseBg = "erwachen";
      } else {
        phaseBg = "einkehr";
      }
    }

    card.setAttribute("data-phase", phaseBg);
    // ------------------------------------------------------

    // If track is missing for some reason, hide card to avoid a broken UI.
    if (!track) card.classList.add("hidden");
  }

  window.renderCycleProgress = renderCycleProgress;
})();
