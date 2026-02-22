// tips.js - Mini-Übersicht (Heute) + Detail-Tipps (Hormonkurve)
// Wird nach app.js geladen (index.html), damit setView(), diffDays(), between(), etc. verfügbar sind.

// ---------- TODAY: cycle context (re-used by hormones view) ----------
function getCurrentCycleContext(){
  const days = loadBleedDays();
  const allPeriods = derivePeriodsFromBleed(days);
  // Use visible periods for cycle start / model (hidden cycles excluded from predictions)
  const periods = (typeof window.filterVisiblePeriods === "function")
    ? window.filterVisiblePeriods(allPeriods)
    : allPeriods;
  // Compute the correct average from ALL periods (skipping hidden diffs), consistent with all other views
  const allSorted = allPeriods.slice().sort((a,b)=>a.start-b.start);
  const avgCycleLen = (typeof window.computeAvgCycleLen === "function")
    ? window.computeAvgCycleLen(allSorted)
    : null;
  const model = buildCalendarModel(periods, 12, avgCycleLen);
  if (!periods.length || !model.latestStart) return null;

  const cycleStart = model.latestStart;
  const nextStart = model.forecastPeriods?.[0]?.start || addDays(cycleStart, model.cycleLen);
  const ovISO = model.ovulationDaysISO?.[0] || null;
  const ovuDate = ovISO ? parseISO(ovISO) : addDays(cycleStart, model.personalOvuOffset);
  const periodEnd = addDays(cycleStart, model.periodLen - 1);

  return {
    days,
    periods,
    model,
    cycleStart,
    nextStart,
    ovuDate,
    periodEnd,
  };
}

function computePhaseForDate(dateISO, ctx){
  const d = parseISO(dateISO);
  const { model, cycleStart, nextStart, ovuDate, periodEnd } = ctx;

  const isBleeding = ctx.days.includes(dateISO);
  const dayInCycle = diffDays(cycleStart, d) + 1; // ZT 1..

  // heuristic labels (intentionally simple)
  let phaseKey = "follicular";
  let phaseLabel = "Follikelphase (≈)";

  if (isBleeding || between(d, cycleStart, periodEnd)){
    phaseKey = "menstrual";
    phaseLabel = "Periode / Menstruation (≈)";
  } else if (between(d, addDays(ovuDate, -5), addDays(ovuDate, 1))){
    phaseKey = "fertile";
    phaseLabel = "Fruchtbare Phase (≈)";
  } else if (d > addDays(ovuDate, 1) && d < nextStart){
    phaseKey = "luteal";
    phaseLabel = "Lutealphase (≈)";
  } else {
    phaseKey = "follicular";
    phaseLabel = "Follikelphase (≈)";
  }

  const ovDay = diffDays(cycleStart, ovuDate) + 1;
  const ovText = `Eisprung (≈): ZT ${ovDay} • ${formatDateDE(ovuDate)}`;
  const nextText = `Nächste Periode (≈): ${formatDateDE(nextStart)}`;

  return {
    phaseKey,
    phaseLabel,
    dayInCycle: Math.max(1, dayInCycle), // no upper clamp — long cycles run freely
    cycleLen: model.cycleLen,
    ovText,
    nextText,
  };
}

// ---------- Content model (Mini + Details) ----------
const CATS = [
  { key: "food",  icon: "🍽️", label: "Ernährung" },
  { key: "sport", icon: "🏃", label: "Bewegung" },
  { key: "supp",  icon: "💊", label: "Supplements" },
  { key: "mind",  icon: "🧠", label: "Fokus" },
  { key: "rest",  icon: "😴", label: "Regeneration" },
  { key: "care",  icon: "❤️", label: "Selbstfürsorge" },
];

function dirArrow(dir){
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  return "→";
}

function normalizeMacro(m){
  const p = Math.max(0, Number(m?.protein) || 0);
  const c = Math.max(0, Number(m?.carbs) || 0);
  const f = Math.max(0, Number(m?.fat) || 0);
  const sum = p + c + f;
  if (!sum) return { protein:0, carbs:0, fat:0 };
  return {
    protein: Math.round((p/sum)*100),
    carbs: Math.round((c/sum)*100),
    fat: Math.max(0, 100 - Math.round((p/sum)*100) - Math.round((c/sum)*100)),
  };
}

function renderMacroMini(macro){
  const mm = normalizeMacro(macro);
  return `
    <div class="macroWrap" aria-label="Makro-Aufteilung">
      <div class="macroBar" role="img" aria-label="Protein ${mm.protein} Prozent, Kohlenhydrate ${mm.carbs} Prozent, Fett ${mm.fat} Prozent">
        <span class="macroSeg macroProtein" style="width:${mm.protein}%;"></span>
        <span class="macroSeg macroCarbs" style="width:${mm.carbs}%;"></span>
        <span class="macroSeg macroFat" style="width:${mm.fat}%;"></span>
      </div>
      <div class="macroLegend">
        <span class="macroKey"><span class="macroDot macroProtein"></span>Protein <b>${mm.protein}%</b></span>
        <span class="macroKey"><span class="macroDot macroCarbs"></span>Kohlenhydrate <b>${mm.carbs}%</b></span>
        <span class="macroKey"><span class="macroDot macroFat"></span>Fett <b>${mm.fat}%</b></span>
      </div>
    </div>
  `;
}

function renderMiniLines(lines){
  const safeLines = (lines || []).slice(0, 3).map(x => escapeHtml(String(x || ""))).filter(Boolean);
  if (!safeLines.length) return "";
  return `<ul class="miniLines">${safeLines.map(t=>`<li>${t}</li>`).join("")}</ul>`;
}

// Mini: ultra-klar, ohne Floskeln
const PHASE_GUIDE = {
  menstrual: {
    mini: {
      food:  { short:"Carbphase", dir:"up",  macro:{ protein:30, carbs:45, fat:25 }, lines:["Protein: 30%","KH: 45%","Fett: 25%"] },
      sport: { short:"Pause / locker", dir:"down", lines:["0–30 min locker","Mobility/Stretch","Kein HIIT nötig"] },
      supp:  { short:"Nur Basics", dir:"mid", lines:["Mg: wenn gewohnt","Eisen: nur bei Mangel","Keine Experimente"] },
      mind:  { short:"1 Task", dir:"down", lines:["1 Priorität","Kein Multitask","Alles optional"] },
      rest:  { short:"Mehr Schlaf", dir:"up",  lines:["früher ins Bett","Wärme/ruhe","Pausen einplanen"] },
      care:  { short:"Symptom-Plan", dir:"up", lines:["Wärme/Pad","Kalender leichter","Grenzen setzen"] },
    },
    details: {
      food: {
        title:"Wärmend & nährend",
        text:"Viele fühlen sich mit warmen, einfachen Mahlzeiten wohler (z. B. Suppe, Hafer, Kartoffeln, Gemüse).",
        why:"Blutverlust/Stress können Energie kosten – Stabilität & Sättigung helfen oft."
      },
      sport: {
        title:"Sanft oder Pause",
        text:"Wenn du willst: kurze Spaziergänge, Mobility, leichtes Dehnen. Wenn nicht: komplett okay.",
        why:"Körper arbeitet bereits – weniger ist in dieser Phase oft mehr."
      },
      supp: {
        title:"Optional & individuell",
        text:"Magnesium wird häufig als abendliche Routine genutzt. Eisen nur, wenn du weißt, dass du es brauchst und es verträgst.",
        why:"Supplements sind kein Muss – Basics (Essen/Schlaf) sind meist wichtiger."
      },
      mind: {
        title:"Weniger Output, mehr Gefühl",
        text:"Gute Phase für Reflexion, Journaling, Aufräumen im Kopf – statt Vollgas.",
        why:"Viele sind sensibler und weniger belastbar."
      },
      rest: {
        title:"Regeneration hochfahren",
        text:"Wenn möglich: früher schlafen, Wärme, ruhige Abende. Kleine Routinen stabilisieren.",
        why:"Erholung wirkt oft stärker als " +
            "noch ein To-do."
      },
      care: {
        title:"Selbstfürsorge aktiv",
        text:"Termine reduzieren, Nein sagen, Hilfe annehmen. Du darfst es dir leicht machen.",
        why:"Weniger Reize = weniger Stress = oft besseres Wohlgefühl."
      },
    }
  },

  follicular: {
    mini: {
      food:  { short:"Protein hoch", dir:"up",  macro:{ protein:35, carbs:40, fat:25 }, lines:["Protein: 35%","KH: 40%","Fett: 25%"] },
      sport: { short:"Kraft + Aufbau", dir:"up",  lines:["Kraft: ja","Neue Reize: ja","HIIT: optional"] },
      supp:  { short:"Konstant", dir:"mid", lines:["Wenn du nimmst: konstant","Sonst: nichts extra","Basics zuerst"] },
      mind:  { short:"Fokus", dir:"up",  lines:["Planen/lernen","Deep Work","To-dos bündeln"] },
      rest:  { short:"Routine", dir:"mid", lines:["7–9 h Schlaf","Regelmäßig essen","Bewegung täglich"] },
      care:  { short:"Nach außen", dir:"up",  lines:["Termine/Meetings ok","Neues starten","Sozial leichter"] },
    },
    details: {
      food: {
        title:"Frisch & proteinbetont",
        text:"Bunte Pflanzen + Protein als Basis (z. B. Joghurt/Tofu/Ei, Hülsenfrüchte, Beeren, Salat).",
        why:"Viele fühlen sich stabiler und leichter – ideal, um gute Basics aufzubauen."
      },
      sport: {
        title:"Aufbau & Progress",
        text:"Gute Zeit für Krafttraining, längere Walks oder etwas Neues. Steigere langsam.",
        why:"Energie & Motivation steigen bei vielen in dieser Phase."
      },
      supp: {
        title:"Meist nicht nötig",
        text:"Wenn du Supplements nimmst: lieber konstant und niedrigschwellig statt ständig zu wechseln.",
        why:"Kontinuität schlägt Komplexität."
      },
      mind: {
        title:"Fokus & Lernfenster",
        text:"Ideal für Planung, Struktur, neue Projekte, Lernen – kleine Schritte funktionieren super.",
        why:"Viele erleben mehr Klarheit und Antrieb."
      },
      rest: {
        title:"Stabile Routine",
        text:"Normaler Schlaf, regelmäßige Bewegung, wenig Drama – dein System baut auf.",
        why:"Du profitierst jetzt oft stark von einfachen Gewohnheiten."
      },
      care: {
        title:"Mehr nach außen",
        text:"Soziales fühlt sich oft leichter an: Treffen, Gespräche, Kooperation.",
        why:"Viele sind kommunikativer und offener."
      },
    }
  },

  fertile: {
    mini: {
      food:  { short:"Carbphase", dir:"up",  macro:{ protein:28, carbs:50, fat:22 }, lines:["Protein: 28%","KH: 50%","Fett: 22%"] },
      sport: { short:"Intensiv ok", dir:"up",  lines:["Kraft/HIIT: ok","Warm-up Pflicht","Technik sauber"] },
      supp:  { short:"Hydration", dir:"mid", lines:["Wasser + Salz","Elektrolyte bei Sport","Mg nur wenn gewohnt"] },
      mind:  { short:"Kommunikation", dir:"up",  lines:["Gespräche/Calls","Präsentieren","Konflikte klären"] },
      rest:  { short:"Puffer", dir:"mid", lines:["Cooldown einplanen","Nicht überziehen","Schlaf normal"] },
      care:  { short:"Mehr Energie", dir:"up",  lines:["Sozial ok","Grenzen halten","Self-Expression"] },
    },
    details: {
      food: {
        title:"Ausgewogen & regelmäßig",
        text:"Nicht zu lange ohne Essen – ein stabiler Rhythmus hilft. Leicht + proteinreich klappt oft gut.",
        why:"Hohe Aktivität kann dazu führen, dass Hunger/Ermüdung später kommt."
      },
      sport: {
        title:"Leistungsfähig",
        text:"Wenn du Lust hast: intensiver (Kraft, Intervall, längere Sessions). Achte auf Technik.",
        why:"Viele fühlen sich koordinativer und stärker."
      },
      supp: {
        title:"Keep it simple",
        text:"Optional: Magnesium am Abend oder Elektrolyte bei viel Sport – nur wenn du es ohnehin gut verträgst.",
        why:"In dieser Phase reicht oft Basics: Essen, Trinken, Schlaf."
      },
      mind: {
        title:"Kommunikation & Mut",
        text:"Gute Zeit für Gespräche, Präsentationen, schwierige Themen – sofern du dich danach fühlst.",
        why:"Selbstvertrauen und Ausdruck sind bei vielen höher."
      },
      rest: {
        title:"Übermut vermeiden",
        text:"Plane bewusst Pausen ein, damit du nicht über deine Grenzen gehst.",
        why:"Viel Energie kann Erschöpfung maskieren."
      },
      care: {
        title:"Verbindung",
        text:"Nähe, Austausch, Self-Expression – das darf jetzt mehr Raum haben.",
        why:"Soziale Bedürfnisse können stärker sein."
      },
    }
  },

  luteal: {
    mini: {
      food:  { short:"Proteinphase", dir:"up",  macro:{ protein:40, carbs:30, fat:30 }, lines:["Protein: 40%","KH: 30%","Fett: 30%"] },
      sport: { short:"Volumen runter", dir:"mid", lines:["Volumen -20%","Intensität moderat","Mehr Walks"] },
      supp:  { short:"PMS-Setup", dir:"mid", lines:["Mg abends (wenn du nutzt)","Keine neuen Sachen","Basics zuerst"] },
      mind:  { short:"Monotask", dir:"down", lines:["1 Task nach dem anderen","Pausen 60–90 min","Reiz reduzieren"] },
      rest:  { short:"Früher runter", dir:"up",  lines:["Screen runter","Abendroutine","Schlaf priorisieren"] },
      care:  { short:"Reizschutz", dir:"up",  lines:["Kalender leerer","Nein sagen","Alles vereinfachen"] },
    },
    details: {
      food: {
        title:"Sättigend & stabil",
        text:"Viele profitieren von regelmäßigen, sättigenden Mahlzeiten (komplexe Carbs, Protein, gesunde Fette).",
        why:"Blutzuckerschwankungen/Cravings können stärker sein – Planung hilft."
      },
      sport: {
        title:"Moderate Bewegung",
        text:"Gern: Walks, Yoga, moderates Krafttraining. Intensität nur, wenn es sich wirklich gut anfühlt.",
        why:"Belastbarkeit kann sinken, Regeneration dauert manchmal länger."
      },
      supp: {
        title:"Optional",
        text:"Manche nehmen Magnesium als Abendroutine; B6 wird teils genutzt – wenn du es ohnehin gut verträgst.",
        why:"Wenn du PMS hast, wirkt Struktur (Essen/Schlaf) oft stärker als Supplement-Hopping."
      },
      mind: {
        title:"Reizschutz",
        text:"Weniger Multitasking, mehr klare Prioritäten. Micro-Pausen helfen.",
        why:"Viele sind sensibler/reizbarer – das ist normal."
      },
      rest: {
        title:"Mehr Erholung",
        text:"Früher runterfahren, Screen-Time reduzieren, abends Routine. Lieber konstant als perfekt.",
        why:"Schlafqualität kann schwanken, besonders in der späten Lutealphase."
      },
      care: {
        title:"Sanft zu dir",
        text:"Erwartungen reduzieren, Grenzen setzen, Dinge vereinfachen. Du musst nicht durchziehen.",
        why:"Weniger Druck = oft weniger Symptome."
      },
    }
  },
};

// Compact explanation for the hormones view (kept short but explanatory)
const HORMONE_EXPLAIN = {
  menstrual: {
    title: "Was passiert gerade?",
    bullets: [
      "Hormone sind niedrig → Koerper startet neu.",
      "Energie kann geringer sein; Schmerz/Empfindlichkeit ist moeglich.",
      "Fokus: Waerme, Regelmaessigkeit, Druck rausnehmen.",
    ]
  },
  follicular: {
    title: "Was passiert gerade?",
    bullets: [
      "Oestrogen steigt → Antrieb, Fokus und Belastbarkeit nehmen oft zu.",
      "Guter Zeitpunkt fuer Aufbau (Training, Planung, neue Routinen).",
      "Fokus: Protein-Basis, klare Ziele, Progression.",
    ]
  },
  fertile: {
    title: "Was passiert gerade?",
    bullets: [
      "LH-Spitze rund um den Eisprung → Koerper ist auf " +
      "Freisetzung der Eizelle eingestellt.",
      "Viele fuehlen sich leistungsfaehig und kommunikativer.",
      "Fokus: Stabil essen, nicht ueberpacen, Technik vor Ego.",
    ]
  },
  luteal: {
    title: "Was passiert gerade?",
    bullets: [
      "Progesteron dominiert → Regeneration langsamer, Hunger/Cravings moeglich.",
      "Reizbarkeit/Schlafschwankungen koennen zunehmen (v. a. spaet luteal).",
      "Fokus: Proteinphase, Volumen runter, Routinen vereinfachen.",
    ]
  },
};

function phaseCat(phaseKey, catKey){
  const phase = PHASE_GUIDE[phaseKey] || PHASE_GUIDE.follicular;
  const mini = phase.mini?.[catKey];
  const det = phase.details?.[catKey];
  return { mini, det };
}

// ---------- Rendering: Heute (Mini-Kacheln) ----------
function renderPhaseMini(phaseKey){
  const el = document.getElementById("phaseMini");
  const fallback = document.getElementById("phaseTips");
  const target = el || fallback;
  if (!target) return;

  const phase = PHASE_GUIDE[phaseKey] || PHASE_GUIDE.follicular;
  target.classList.toggle("tips", false);
  target.classList.toggle("phaseMini", true);

  target.innerHTML = CATS.map(c => {
    const m = phase.mini[c.key] || {};
    const dir = dirArrow(m?.dir || "mid");
    const short = escapeHtml(m?.short || "–");

    const body = (c.key === "food" && m?.macro)
      ? renderMacroMini(m.macro)
      : renderMiniLines(m?.lines || []);

    return `
      <button type="button" class="phaseTile" data-cat="${escapeHtml(c.key)}">
        <div class="phaseIcon" aria-hidden="true">${c.icon}</div>
        <div class="phaseTileMain">
          <div class="phaseTileTop">
            <div class="phaseTileLabel">${escapeHtml(c.label)} • ${short}</div>
            <div class="phaseTileDir" aria-label="Tendenz">${dir}</div>
          </div>
          <div class="phaseTileHint">${body}</div>
        </div>
      </button>
    `;
  }).join("");
}

function goToHormones(){
  if (typeof window.setView === "function") window.setView("hormones");
  // gentle scroll to top for mobile
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindPhaseMiniInteractions(phaseKey){
  const target = document.getElementById("phaseMini") || document.getElementById("phaseTips");
  if (!target) return;

  target.querySelectorAll(".phaseTile").forEach(btn => {
    btn.addEventListener("click", () => {
      goToHormones();
      // optional: preselect by scrolling to details (we keep it simple)
      // details are always visible; no extra state required
    });
  });

  const more = document.getElementById("phaseMoreBtn");
  if (more){
    more.onclick = () => goToHormones();
  }
}

function renderPhasePanel(todayISO){
  const panel = document.getElementById("phasePanel");
  if (!panel) return;

  const ctx = getCurrentCycleContext();
  const titleEl = document.getElementById("phaseTitle");
  const metaEl = document.getElementById("phaseMeta");
  const badgeEl = document.getElementById("phaseBadge");

  if (!ctx){
    if (titleEl) titleEl.textContent = "Noch keine Zyklus-Daten";
    if (metaEl) metaEl.textContent = "Trage ein paar Blutungstage ein, dann kann Lunacy den aktuellen Zyklus modellieren.";
    if (badgeEl) badgeEl.textContent = "–";

    const mini = document.getElementById("phaseMini") || document.getElementById("phaseTips");
    if (mini) mini.innerHTML = "";
    const more = document.getElementById("phaseMoreBtn");
    if (more) more.disabled = true;
    return;
  }

  const info = computePhaseForDate(todayISO, ctx);
  if (titleEl) titleEl.textContent = `${info.phaseLabel} • ZT ${info.dayInCycle}/${info.cycleLen}`;
  if (metaEl) metaEl.textContent = `${info.ovText} • ${info.nextText}`;
  if (badgeEl) badgeEl.textContent = info.phaseLabel.replace(" (≈)", "");

  const more = document.getElementById("phaseMoreBtn");
  if (more) more.disabled = false;

  renderPhaseMini(info.phaseKey);
  bindPhaseMiniInteractions(info.phaseKey);

  // warnings (only if any exist; module decides)
  if (typeof window.renderWarningsPanel === "function"){
    window.renderWarningsPanel(todayISO, ctx);
  }
}

// ---------- Rendering: Hormonkurve (Details) ----------
function renderHormoneDetails(payload){
  const wrap = document.getElementById("hormoneDetails");
  const titleEl = document.getElementById("hormoneDetailsTitle");
  const metaEl = document.getElementById("hormoneDetailsMeta");
  const explainEl = document.getElementById("hormoneExplain");
  const bodyEl = document.getElementById("hormoneDetailsBody");
  if (!wrap || !bodyEl) return;

  if (!payload){
    if (titleEl) titleEl.textContent = "Noch keine Zyklus-Daten";
    if (metaEl) metaEl.textContent = "Trage Blutungstage ein, dann erscheinen hier die Erklärungen.";
    if (explainEl) explainEl.innerHTML = "";
    bodyEl.innerHTML = "";
    return;
  }

  const phaseKey = payload.phaseKey;
  const phaseLabel = payload.phaseLabel || "";
  const phase = PHASE_GUIDE[phaseKey] || PHASE_GUIDE.follicular;

  if (titleEl) titleEl.textContent = `${phaseLabel.replace(" (≈)", "")} • ZT ${payload.dayInCycle}/${payload.cycleLen}`;
  if (metaEl) metaEl.textContent = `${payload.ovText} • ${payload.nextText}`;

  if (explainEl){
    const ex = HORMONE_EXPLAIN[phaseKey] || HORMONE_EXPLAIN.follicular;
    explainEl.innerHTML = `
      <div class="hExplainT">${escapeHtml(ex.title || "")}</div>
      <ul>
        ${(ex.bullets||[]).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}
      </ul>
    `;
  }

  bodyEl.innerHTML = CATS.map(c => {
    const det = phase.details[c.key];
    const mini = phase.mini[c.key];
    const dir = dirArrow(mini?.dir || "mid");

    return `
      <div class="hDetail" data-cat="${escapeHtml(c.key)}">
        <div class="hDetailH">
          <div class="phaseIcon" aria-hidden="true">${c.icon}</div>
          <div style="flex:1;min-width:0;">
            <div class="phaseTileTop">
              <div class="hDetailTitle">${escapeHtml(c.label)} • ${escapeHtml(mini?.short || "")}</div>
              <div class="phaseTileDir" aria-label="Tendenz">${dir}</div>
            </div>
            <div class="hDetailText">${escapeHtml(det?.text || "")}</div>
            <div class="hDetailWhy"><span class="strong">Warum?</span> ${escapeHtml(det?.why || "")}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// expose for app.js
window.getCurrentCycleContext = getCurrentCycleContext;
window.computePhaseForDate = computePhaseForDate;
window.renderPhasePanel = renderPhasePanel;
window.renderHormoneDetails = renderHormoneDetails;
