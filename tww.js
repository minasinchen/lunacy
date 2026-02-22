// tww.js
// TTC/TWW Blastozysten-Overlay (mobile-first)
//
// Anforderungen (kurz):
// - Icon (abstrahierte Blastozyste) erscheint nur wenn:
//     • Settings: TTC aktiv
//     • UND (optional) nur in TWW: ab Eisprung (inkl.) bis vor Periode
// - Tap auf Icon öffnet Modal/Overlay (kein Auto-Open, kein Tooltip)
// - Modal:
//     • "Heute" / Aktuell-Karte (immer sichtbar) inkl. DPO, Ort, hCG-Hinweis, Biologie + Mantra (mit kurzer Anleitung)
//     • Chronologische Übersicht ES+0–14 (aufklappbar), in korrekter Reihenfolge, nicht-aktuelle Zeilen ausgegraut
//     • Evidenzbasierte Hinweise (aufklappbar): Supplements/Nährstoffe + Lifestyle (ohne Dosierungen)
// - Kein Logging, keine Pushes
// - Guard: Wenn TTC in Settings deaktiviert wird, darf nichts mehr klickbar sein (Icon wird entfernt, Click öffnet nichts)

(function(){
  "use strict";

  // ------------------ content: DPO timeline ------------------
  // Neutral & respektvoll. Keine medizinische Beratung.
  const STEPS = [
    { dpo:0,  title:"Eisprung",                where:"Eileiter",                      text:"Die Eizelle wird aufgenommen. Wenn Spermien vorhanden sind, kann es zur Befruchtung kommen." },
    { dpo:1,  title:"Erste Teilungen",         where:"Eileiter",                      text:"Die befruchtete Eizelle teilt sich weiter und wandert langsam Richtung Gebärmutter." },
    { dpo:2,  title:"Weitere Teilungen",       where:"Eileiter",                      text:"Der Zellverband wächst (≈ 8–16 Zellen). Die Reise läuft weiter." },
    { dpo:3,  title:"Zellkugel",               where:"Übergang zur Gebärmutter",      text:"Die Zellen verdichten sich weiter. Häufig ohne spürbare Zeichen." },
    { dpo:4,  title:"Morula",                  where:"nahe Gebärmutter",              text:"Ein kompakter Zellball. Die Gebärmutter wird erreicht oder ist sehr nah." },
    { dpo:5,  title:"Blastozyste",             where:"Gebärmutter",                   text:"Die Blastozyste entfaltet sich. Vorbereitung auf möglichen Kontakt zur Schleimhaut." },
    { dpo:6,  title:"Kontakt möglich",         where:"Gebärmutterschleimhaut",        text:"Ein erstes Andocken kann möglich sein. Wenn Einnistung beginnt, kann hCG sehr niedrig starten." },
    { dpo:7,  title:"Einnistung kann starten", where:"Gebärmutterschleimhaut",        text:"Falls es dazu kommt, kann die Einnistung beginnen. Oft passiert das ohne klare Symptome." },
    { dpo:8,  title:"Einnistung im Verlauf",   where:"Gebärmutterschleimhaut",        text:"Die Einnistung kann sich fortsetzen. hCG steigt typischerweise erst nach und nach." },
    { dpo:9,  title:"Vertiefung",              where:"Gebärmutterschleimhaut",        text:"Bei bestehender Einnistung kann hCG messbar werden – Werte sind aber häufig noch niedrig." },
    { dpo:10, title:"Frühe Phase",             where:"Gebärmutter",                   text:"hCG kann weiter steigen. Urintests sind häufig noch negativ oder unsicher." },
    { dpo:11, title:"Aufbau",                  where:"Gebärmutter",                   text:"Tests können positiver werden, müssen es aber noch nicht. Der Trend ist wichtiger als ein Einzelwert." },
    { dpo:12, title:"Stabilisierung",          where:"Gebärmutter",                   text:"hCG steigt weiter. Frühtests sind oft verlässlicher, bleiben aber variabel." },
    { dpo:13, title:"Übergang",                where:"Gebärmutter",                   text:"Viele sind nahe am Periodentermin: Periode kommt – oder ein Test wird deutlicher." },
    { dpo:14, title:"TWW-Ende",                where:"Gebärmutter",                   text:"Standard-Urintests sind meist aussagekräftiger. Ein negatives Ergebnis kann trotzdem Timing-Gründe haben." },
  ];

  // ------------------ evidence-based optional guidance ------------------
  // Medizinisch fundierte Hinweise (ohne Dosierungen).
  // Forschung entwickelt sich laufend weiter – keine Garantie, keine Voraussetzung.
  const EVIDENCE_TIPS = {
    intro: "Die folgenden Hinweise basieren auf aktuellen wissenschaftlichen Erkenntnissen zum Kinderwunsch. Forschung entwickelt sich laufend weiter; individuelle Bedürfnisse können abweichen. Nichts davon ist Voraussetzung oder Garantie.",

    nutrients: [
      {
        title: "Folat / Folsäure",
        text: "Folat ist zentral für Zellteilung und frühe Entwicklung. Viele Leitlinien empfehlen Supplementierung im Kinderwunsch. Bei manchen Menschen kann die aktive Form 5‑MTHF (Tetrahydrofolat) besser verträglich/verwertbar sein als synthetische Folsäure."
      },
      {
        title: "Cholin",
        text: "Cholin unterstützt Zellmembranen, neuronale Entwicklung und Methylierungsprozesse. Der Bedarf wird häufig unterschätzt."
      },
      {
        title: "Jod",
        text: "Jod unterstützt die Schilddrüsenfunktion. Versorgung ist individuell unterschiedlich; vor Supplementierung ist eine Abklärung sinnvoll, besonders bei Schilddrüsen-Themen."
      },
      {
        title: "Vitamin D",
        text: "Vitamin D steht im Zusammenhang mit hormoneller Regulation und Immunprozessen. Niedrige Spiegel sind verbreitet, besonders in lichtarmen Monaten."
      },
      {
        title: "Omega‑3 (DHA/EPA)",
        text: "Omega‑3‑Fettsäuren sind Bestandteile von Zellmembranen und an Entzündungs-/Signalprozessen beteiligt. Effekte können individuell variieren."
      },
      {
        title: "Magnesium",
        text: "Magnesium ist an vielen Stoffwechsel- und Muskelprozessen beteiligt. Ein direkter Einfluss auf den Zyklus ist nicht eindeutig belegt, kann aber allgemeines Wohlbefinden unterstützen."
      },
      {
        title: "Inositol",
        text: "Inositol wird vor allem bei PCOS-bezogenen Fragestellungen untersucht (Insulin-/Signalwege). Nutzen ohne PCOS ist weniger klar."
      },
      {
        title: "Coenzym Q10",
        text: "Q10 ist an mitochondrialen Energieprozessen beteiligt und wird im Kontext von Eizellqualität diskutiert. Evidenz ist noch nicht abschließend."
      },
      {
        title: "N‑Acetylcystein (NAC)",
        text: "NAC ist eine Vorstufe von Glutathion (antioxidativ) und wird in bestimmten Kontexten untersucht (z. B. PCOS/oxidativer Stress). Keine generelle Empfehlung für alle."
      }
    ],

    lifestyle: [
      "Regelmäßige Mahlzeiten mit komplexen Kohlenhydraten, Eiweiß und gesunden Fetten können stabilisierend wirken.",
      "Moderate Bewegung ist häufig wohltuend; extremes Training kann für manche belastend sein.",
      "Schlaf und Erholung sind Teil hormoneller Regulation. Kleine Routinen (Licht am Morgen, abends runterfahren) können helfen."
    ]
  };

  // ------------------ mantra (phasenabhängig) ------------------
  const MANTRAS = {
    early: [
      "Mein Körper tut genau das, was er gerade tun soll.",
      "Ich darf meinem Körper vertrauen, ohne etwas beobachten zu müssen.",
      "Ich muss nichts kontrollieren, um gut für mich zu sorgen.",
      "Mein Körper arbeitet in seinem eigenen Tempo."
    ],
    mid: [
      "Ich begleite meinen Körper mit Ruhe und Geduld.",
      "Ich bin gut zu meinem Körper – auch wenn ich nichts „spüre“.",
      "Ich darf freundlich mit mir sein, auch in der Ungewissheit.",
      "Heute muss ich nichts optimieren."
    ],
    late: [
      "Egal was kommt: Ich darf sanft mit mir bleiben.",
      "Mein Wert hängt nicht von einem Ergebnis ab.",
      "Ich achte heute besonders gut auf mich.",
      "Ich darf mir Ruhe erlauben – ohne Entscheidung."
    ],
    neutral: [
      "Ich bin gut zu meinem Körper, egal wo ich im Zyklus stehe.",
      "Heute darf es leise sein.",
      "Ich nehme den Tag, wie er ist."
    ]
  };

  function pickDailyMantra(seedISO, dpo){
    let phase = "neutral";
    if (Number.isFinite(dpo)){
      if (dpo <= 4) phase = "early";
      else if (dpo <= 8) phase = "mid";
      else phase = "late";
    }
    const list = MANTRAS[phase] || MANTRAS.neutral;
    try{
      const d = new Date(seedISO);
      const idx = (d.getFullYear() + d.getMonth() + d.getDate()) % list.length;
      return list[idx];
    }catch(e){
      return list[0];
    }
  }

  // ------------------ hCG (typische SERUM‑Bereiche) ------------------
  // Wichtig:
  // - hCG entsteht erst nach begonnener Einnistung (typisch etwa ES+6/7, variabel).
  // - Zahlen sind grobe Referenzbereiche (Serum, mIU/ml), keine Zielwerte.
  // - Urin ist meist später/variabler als Blut (Verdünnung, Timing, Test-Sensitivität).
  function hcgRangeForDpo(dpo){
    if (!Number.isFinite(dpo)) return null;
    if (dpo < 5) return { range:null, note:"vor Einnistung: kein hCG" };
    if (dpo <= 6) return { range:"<1–2", note:"nicht nachweisbar" };
    if (dpo === 7) return { range:"1–5", note:"meist unter Nachweisgrenze" };
    if (dpo === 8) return { range:"2–10", note:"Urin meist negativ" };
    if (dpo === 9) return { range:"5–25", note:"sehr früh" };
    if (dpo === 10) return { range:"10–50", note:"Frühtest (≈10er) evtl." };
    if (dpo === 11) return { range:"20–100", note:"Tests zunehmend möglich" };
    if (dpo === 12) return { range:"30–200", note:"häufiger nachweisbar" };
    // 13–14+
    return { range:"100–500+", note:"Standardtests (≈20–25er) eher relevant" };
  }

  function hcgLineForDpo(dpo){
    const info = hcgRangeForDpo(dpo);
    if (!info) return "hCG (Serum): —";
    if (!info.range) return `hCG (Serum): — · ${info.note}`;
    return `hCG (Serum): ${info.range} mIU/ml · ${info.note}`;
  }

  // ------------------ helpers ------------------
  function isoToday(){
    try{ if (typeof window.iso === "function") return window.iso(new Date()); }catch(e){}
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function safeParseISO(s){
    if (!s) return null;
    try{ if (typeof window.parseISO === "function") return window.parseISO(s); }catch(e){}
    return new Date(String(s) + "T00:00:00");
  }

  function safeDiffDays(a,b){
    if (!a || !b) return null;
    try{ if (typeof window.diffDays === "function") return window.diffDays(a,b); }catch(e){}
    const ms = 24*60*60*1000;
    const aa = new Date(a.getFullYear(),a.getMonth(),a.getDate()).getTime();
    const bb = new Date(b.getFullYear(),b.getMonth(),b.getDate()).getTime();
    return Math.round((bb-aa)/ms);
  }

  function esc(s){
    return String(s||"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }

  function loadSettingsSafe(){
    try{ return (typeof window.loadSettings === "function") ? (window.loadSettings()||{}) : {}; }
    catch(e){ return {}; }
  }

  function getCycleCtxSafe(){
    try{ return (typeof window.getCurrentCycleContext === "function") ? window.getCurrentCycleContext() : null; }
    catch(e){ return null; }
  }

  // ------------------ modal ------------------
  function ensureModal(){
    let m = document.getElementById("blastocystModal");
    if (m) return m;

    m = document.createElement("div");
    m.id = "blastocystModal";
    m.className = "modal blastoModal hidden";
    m.setAttribute("aria-hidden","true");

    m.innerHTML = `
      <div class="modalBackdrop" data-close="1"></div>
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalHeader">
          <div>
            <div class="muted" style="font-size:12px; letter-spacing:0.06em; text-transform:uppercase; opacity:0.85;">Two Week Wait</div>
            <div class="strong" style="margin-top:2px;">Wanderung & Zeitfenster</div>
          </div>
          <button class="btn" type="button" data-close="1" aria-label="Schließen">✕</button>
        </div>

        <div class="blastoNow" id="blastoNow"></div>

        <button class="btn blastoToggle" id="blastoToggle" type="button" aria-expanded="false"
          style="width:100%; margin-top:10px; display:flex; align-items:center; justify-content:space-between;">
          <span>Chronologische Übersicht</span>
          <span class="chev" aria-hidden="true">▾</span>
        </button>
        <div class="blastoStepsWrap hidden" id="blastoStepsWrap"></div>

        <button class="btn blastoToggle" id="blastoTipsToggle" type="button" aria-expanded="false"
          style="width:100%; margin-top:12px; display:flex; justify-content:space-between;">
          <span>Evidenzbasierte Hinweise (optional)</span>
          <span class="chev" aria-hidden="true">▾</span>
        </button>
        <div class="blastoTipsWrap hidden" id="blastoTipsWrap"></div>

        <div class="muted" style="margin-top:10px; font-size:12px; line-height:1.35;">
          Hinweis: Das ist eine grobe Orientierung (typische Zeitfenster) – kein Test- oder Medizin‑Tool.
          hCG‑Angaben sind typische Serum‑Bereiche (mIU/ml), keine Zielwerte.
        </div>
      </div>
    `;

    document.body.appendChild(m);

    function close(){
      m.classList.add("hidden");
      m.setAttribute("aria-hidden","true");
      document.body.style.overflow = "";
    }

    m.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click", close));

    document.addEventListener("keydown", (e)=>{
      if (e.key === "Escape" && !m.classList.contains("hidden")) close();
    });

    function wireToggle(btnSel, wrapSel){
      const btn = m.querySelector(btnSel);
      const wrap = m.querySelector(wrapSel);
      if (!btn || !wrap) return;
      btn.addEventListener("click", ()=>{
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        wrap.classList.toggle("hidden", open);
      });
    }

    wireToggle("#blastoToggle", "#blastoStepsWrap");
    wireToggle("#blastoTipsToggle", "#blastoTipsWrap");

    return m;
  }

  function computeDPO(todayISO){
    const ctx = getCycleCtxSafe();
    if (!ctx || !ctx.ovuDate) return { dpo:null, ctx:null, todayISO };
    const today = safeParseISO(todayISO);
    const dpo = safeDiffDays(ctx.ovuDate, today); // today - ovulation
    return { dpo, ctx, todayISO };
  }

  function renderModalContent(todayISO){
    const m = ensureModal();
    const nowEl = m.querySelector("#blastoNow");
    const listEl = m.querySelector("#blastoStepsWrap");
    const tipsEl = m.querySelector("#blastoTipsWrap");

    const { dpo } = computeDPO(todayISO);
    const curDpo = (Number.isFinite(dpo) ? dpo : null);
    const clampDpo = (curDpo === null) ? null : Math.max(0, Math.min(14, curDpo));

    const mantra = pickDailyMantra(todayISO, curDpo);

    if (nowEl){
      if (curDpo === null){
        nowEl.innerHTML = `
          <div class="card inner" style="margin-top:10px;">
            <div class="strong">Noch keine Einordnung möglich</div>
            <div class="muted" style="margin-top:6px; line-height:1.35;">
              Trage Blutungstage ein (und ggf. LH/Mittelschmerz), damit Lunacy deinen aktuellen Eisprung (≈) bestimmen kann.
            </div>
            <div class="muted" style="margin-top:6px; font-size:12px; line-height:1.35;">${esc(hcgLineForDpo(curDpo))}</div>

            <div class="card inner" style="margin-top:12px; padding:12px;">
              <div class="strong">Mantra für heute</div>
              <div class="muted" style="margin-top:6px; font-size:12px; line-height:1.35;">
                So kannst du es nutzen (ohne Druck): Lies den Satz langsam 1–2×. Atme einmal bewusst aus.
                Wenn es passt: Hand auf Bauch oder Brust.
              </div>
              <div style="margin-top:10px; line-height:1.45;">${esc(mantra)}</div>
            </div>
          </div>
        `;
      } else if (curDpo < 0){
        nowEl.innerHTML = `
          <div class="card inner" style="margin-top:10px;">
            <div class="strong">Vor dem Eisprung</div>
            <div class="muted" style="margin-top:6px; line-height:1.35;">
              Die DPO‑Übersicht startet ab Eisprung. Sobald der Eisprung (≈) erreicht ist, zeigt Lunacy hier den passenden Schritt.
            </div>
            <div class="muted" style="margin-top:6px; font-size:12px; line-height:1.35;">${esc(hcgLineForDpo(curDpo))}</div>

            <div class="card inner" style="margin-top:12px; padding:12px;">
              <div class="strong">Mantra für heute</div>
              <div class="muted" style="margin-top:6px; font-size:12px; line-height:1.35;">
                Lies den Satz langsam 1–2×. Atme einmal bewusst aus. Wenn es passt: Hand auf Bauch/Brust.
                Du musst nichts „glauben“ – nimm ihn als Ton für den Tag mit.
              </div>
              <div style="margin-top:10px; line-height:1.45;">${esc(mantra)}</div>
            </div>
          </div>
        `;
      } else {
        const step = STEPS.find(x=>x.dpo===clampDpo) || STEPS[0];
        nowEl.innerHTML = `
          <div class="card inner" style="margin-top:10px;">
            <div class="muted" style="font-size:12px; letter-spacing:0.06em; text-transform:uppercase;">Aktuell</div>
            <div class="strong" style="margin-top:2px;">ES+${step.dpo} · ${esc(step.title)}</div>
            <div class="muted" style="margin-top:6px; line-height:1.35;">Ort: ${esc(step.where)}</div>
            <div class="muted" style="margin-top:4px; font-size:12px; line-height:1.35;">${esc(hcgLineForDpo(curDpo))}</div>
            <div style="margin-top:8px; line-height:1.4;">${esc(step.text)}</div>

            <div class="card inner" style="margin-top:12px; padding:12px;">
              <div class="strong">Mantra für heute</div>
              <div class="muted" style="margin-top:6px; font-size:12px; line-height:1.35;">
                So kannst du es nutzen (ohne Druck): Lies den Satz langsam 1–2×. Atme einmal bewusst aus.
                Wenn es passt: Hand auf Bauch oder Brust.
              </div>
              <div style="margin-top:10px; line-height:1.45;">${esc(mantra)}</div>
            </div>
          </div>
        `;
      }
    }

    if (listEl){
      listEl.innerHTML = STEPS.map(step=>{
        const isCurrent = (clampDpo !== null && step.dpo === clampDpo && curDpo >= 0);
        const cls = isCurrent ? "blastoStep current" : "blastoStep inactive";
        return `
          <div class="${cls}" data-dpo="${step.dpo}">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
              <div class="strong">ES+${step.dpo} · ${esc(step.title)}</div>
              <div class="muted" style="font-size:12px; white-space:nowrap;">${esc(step.where)}</div>
            </div>
            <div class="muted" style="margin-top:4px; font-size:12px; line-height:1.35;">${esc(hcgLineForDpo(step.dpo))}</div>
            <div class="muted" style="margin-top:6px; line-height:1.35;">${esc(step.text)}</div>
          </div>
        `;
      }).join("");
    }

    if (tipsEl){
      tipsEl.innerHTML = `
        <div class="muted" style="font-size:12px; line-height:1.35; margin-top:6px;">
          ${esc(EVIDENCE_TIPS.intro)}
        </div>

        <div class="strong" style="margin-top:10px;">Nährstoffe & Supplemente</div>
        ${EVIDENCE_TIPS.nutrients.map(n=>`
          <div style="margin-top:8px;">
            <div class="strong">${esc(n.title)}</div>
            <div class="muted" style="margin-top:4px; line-height:1.35;">${esc(n.text)}</div>
          </div>
        `).join("")}

        <div class="strong" style="margin-top:12px;">Alltag</div>
        ${EVIDENCE_TIPS.lifestyle.map(t=>`
          <div class="muted" style="margin-top:4px; line-height:1.35;">• ${esc(t)}</div>
        `).join("")}
      `;
    }
  }

  function openModal(){
    // Guard: TTC kann in Settings ausgeschaltet sein
    const sNow = loadSettingsSafe();
    if (!sNow || !sNow.ttc) return;

    const m = ensureModal();
    const todayISO = isoToday();
    renderModalContent(todayISO);
    m.classList.remove("hidden");
    m.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }

  // ------------------ icon rendering ------------------
  // Gate visibility: only if settings.ttc is true.
  // Optional: only show after ovulation (TWW).
  const ONLY_TWW = true;

  window.renderBlastocyst = function({ markerEl } = {}){
    if (!markerEl) return;

    const s = loadSettingsSafe();
    if (!s || !s.ttc){
      // Remove icon if TTC got disabled after it was created
      const existing = markerEl.querySelector(".blastocyst");
      if (existing) existing.remove();
      return;
    }

    // Optional TWW gating (after ovulation until next period):
    if (ONLY_TWW){
      const todayISO = isoToday();
      const ctx = getCycleCtxSafe();
      if (ctx && ctx.ovuDate && ctx.nextStart){
        const today = safeParseISO(todayISO);
        const ov = ctx.ovuDate;
        const next = ctx.nextStart;
        if (!(today >= ov && today < next)){
          const existing = markerEl.querySelector(".blastocyst");
          if (existing) existing.remove();
          return;
        }
      }
    }

    let el = markerEl.querySelector(".blastocyst");
    if (!el){
      el = document.createElement("div");
      el.className = "blastocyst";
      markerEl.appendChild(el);

      el.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();

        // Guard (nochmal): TTC könnte inzwischen aus sein
        const sNow = loadSettingsSafe();
        if (!sNow || !sNow.ttc) return;

        openModal();
      });
    }
  };

})();
