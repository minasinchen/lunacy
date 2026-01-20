// tips.js - Mini-Übersicht (Heute) + Detail-Tipps (Hormonkurve)
// Wird nach app.js geladen (index.html), damit setView(), diffDays(), between(), etc. verfügbar sind.

// ---------- TODAY: cycle context (re-used by hormones view) ----------
function getCurrentCycleContext(){
  const days = loadBleedDays();
  const periods = derivePeriodsFromBleed(days);
  const model = buildCalendarModel(periods, 12);
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
    dayInCycle: clamp(dayInCycle, 1, model.cycleLen),
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

const PHASE_GUIDE = {
  menstrual: {
    mini: {
      food:  { short:"Wärmend", dir:"up",  hint:"einfach & sättigend" },
      sport: { short:"Sehr sanft", dir:"down", hint:"Spaziergang/Dehnen" },
      supp:  { short:"Mg / Eisen", dir:"mid", hint:"nur wenn passend" },
      mind:  { short:"Nach innen", dir:"down", hint:"weniger Druck" },
      rest:  { short:"Hoch", dir:"up",  hint:"Pausen erlaubt" },
      care:  { short:"Priorität", dir:"up",  hint:"Grenzen setzen" },
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
      food:  { short:"Leicht & frisch", dir:"up",  hint:"protein + bunt" },
      sport: { short:"Aufbau", dir:"up",  hint:"Kraft/Neues" },
      supp:  { short:"Optional", dir:"mid", hint:"Basics reichen" },
      mind:  { short:"Klar", dir:"up",  hint:"planen/lernen" },
      rest:  { short:"Normal", dir:"mid", hint:"Routine" },
      care:  { short:"Offener", dir:"up",  hint:"Kontakte" },
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
      food:  { short:"Ausgewogen", dir:"up",  hint:"regelmäßig" },
      sport: { short:"Peak", dir:"up",  hint:"intensiver ok" },
      supp:  { short:"Optional", dir:"mid", hint:"Hydration" },
      mind:  { short:"Expressiv", dir:"up",  hint:"Gespräche" },
      rest:  { short:"Achten", dir:"mid", hint:"Puffer" },
      care:  { short:"Sozial", dir:"up",  hint:"sichtbarer" },
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
      food:  { short:"Sättigend", dir:"up",  hint:"Snacks planen" },
      sport: { short:"Sanft", dir:"mid", hint:"moderate" },
      supp:  { short:"Mg / B6", dir:"mid", hint:"optional" },
      mind:  { short:"Sensibler", dir:"down", hint:"weniger Multitask" },
      rest:  { short:"Wichtig", dir:"up",  hint:"früher runter" },
      care:  { short:"Schonend", dir:"up",  hint:"Grenzen" },
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
    const m = phase.mini[c.key];
    const dir = dirArrow(m?.dir || "mid");
    const short = escapeHtml(m?.short || "–");
    const hint = escapeHtml(m?.hint || "");

    return `
      <button type="button" class="phaseTile" data-cat="${escapeHtml(c.key)}">
        <div class="phaseIcon" aria-hidden="true">${c.icon}</div>
        <div class="phaseTileMain">
          <div class="phaseTileTop">
            <div class="phaseTileLabel">${escapeHtml(c.label)} • ${short}</div>
            <div class="phaseTileDir" aria-label="Tendenz">${dir}</div>
          </div>
          <div class="phaseTileHint">${hint}</div>
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
}

// ---------- Rendering: Hormonkurve (Details) ----------
function renderHormoneDetails(payload){
  const wrap = document.getElementById("hormoneDetails");
  const titleEl = document.getElementById("hormoneDetailsTitle");
  const metaEl = document.getElementById("hormoneDetailsMeta");
  const bodyEl = document.getElementById("hormoneDetailsBody");
  if (!wrap || !bodyEl) return;

  if (!payload){
    if (titleEl) titleEl.textContent = "Noch keine Zyklus-Daten";
    if (metaEl) metaEl.textContent = "Trage Blutungstage ein, dann erscheinen hier die Erklärungen.";
    bodyEl.innerHTML = "";
    return;
  }

  const phaseKey = payload.phaseKey;
  const phaseLabel = payload.phaseLabel || "";
  const phase = PHASE_GUIDE[phaseKey] || PHASE_GUIDE.follicular;

  if (titleEl) titleEl.textContent = `${phaseLabel.replace(" (≈)", "")} • ZT ${payload.dayInCycle}/${payload.cycleLen}`;
  if (metaEl) metaEl.textContent = `${payload.ovText} • ${payload.nextText}`;

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
