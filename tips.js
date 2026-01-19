// tips.js - "Heute"-Phase & neutrale Tipps (ausgelagert aus app.js)
// Hinweis: Dieses Skript wird nach app.js geladen (index.html),
// damit es auf die dort definierten globalen Helper zugreifen kann.

// ---------- TODAY: phase info (neutral tips) ----------
function getCurrentCycleContext(){
  const days = loadBleedDays();
  const periods = derivePeriodsFromBleed(days);
  const model = buildCalendarModel(periods, 6);
  if (!periods.length || !model.latestStart) return null;

  const cycleStart = model.latestStart;
  const nextStart = periods.length > 1 ? periods[1].start : addDays(cycleStart, model.cycleLen);
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

  // phase labels are heuristic and intentionally simple
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

function phaseTips(phaseKey){
  // Neutral, alltagstauglich, nicht-medizinisch.
  const common = [
    { t: "Trinken", d: "Regelmäßig Wasser/Tee – besonders, wenn du viel unterwegs bist." },
    { t: "Sanfte Routine", d: "Kleine, verlässliche Routinen (Schlaf, Spaziergang) wirken oft stabilisierend." },
  ];

  const byPhase = {
    menstrual: [
      { t: "Wärme & Ruhe", d: "Wärmflasche, Tee, entspannte Bewegung – wenn dir danach ist." },
      { t: "Essen", d: "Einfache, sättigende Mahlzeiten: Suppe, Hafer, Kartoffeln, Gemüse." },
      { t: "Optional", d: "Wenn du es verträgst: Magnesium abends oder Ingwer als Getränk (alltagsüblich)." },
    ],
    follicular: [
      { t: "Energie nutzen", d: "Gute Phase für Planung, Ordnung, neue Projekte in kleinen Schritten." },
      { t: "Bewegung", d: "Wenn du Lust hast: etwas intensiver (z. B. zügiger Spaziergang, Kraft)." },
      { t: "Essen", d: "Protein + bunte Pflanzen (Salat, Beeren, Hülsenfrüchte) als Basis." },
    ],
    fertile: [
      { t: "Körpergefühl", d: "Manche fühlen sich sozialer/energiegeladener – andere merken wenig. Beides ist ok." },
      { t: "Alltag", d: "Kalender/Termine: eher Puffer einplanen, falls Energie schwankt." },
      { t: "Optional", d: "Wenn Kinderwunsch aktiv: Timing/Planung kann helfen – ohne Druck." },
    ],
    luteal: [
      { t: "Stress runterfahren", d: "Mehr Pausen, weniger Multitasking – besonders, wenn du schneller gereizt bist." },
      { t: "Essen", d: "Sättigende Snacks: Nüsse, Joghurt, Vollkorn, Obst. Nicht zu lange ohne Essen." },
      { t: "Optional", d: "Wenn du zu Cravings neigst: vorbereitete Snacks (z. B. Nüsse, Riegel)." },
    ],
  };

  return [...(byPhase[phaseKey] || []), ...common];
}

function renderPhasePanel(todayISO){
  const panel = document.getElementById("phasePanel");
  if (!panel) return;

  const ctx = getCurrentCycleContext();
  const titleEl = document.getElementById("phaseTitle");
  const metaEl = document.getElementById("phaseMeta");
  const badgeEl = document.getElementById("phaseBadge");
  const tipsEl = document.getElementById("phaseTips");

  if (!ctx){
    if (titleEl) titleEl.textContent = "Noch keine Zyklus-Daten";
    if (metaEl) metaEl.textContent = "Trage ein paar Blutungstage ein, dann kann Lunacy den aktuellen Zyklus modellieren.";
    if (badgeEl) badgeEl.textContent = "–";
    if (tipsEl) tipsEl.innerHTML = "";
    return;
  }

  const info = computePhaseForDate(todayISO, ctx);
  if (titleEl) titleEl.textContent = `${info.phaseLabel} • ZT ${info.dayInCycle}/${info.cycleLen}`;
  if (metaEl) metaEl.textContent = `${info.ovText} • ${info.nextText}`;
  if (badgeEl) badgeEl.textContent = info.phaseLabel.replace(" (≈)", "");

  const tips = phaseTips(info.phaseKey);
  tipsEl.innerHTML = tips.map(x=>`
    <div class="tip">
      <div class="tipT">${escapeHtml(x.t)}</div>
      <div class="tipD">${escapeHtml(x.d)}</div>
    </div>
  `).join("");
}
