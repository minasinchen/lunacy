/* Lunacy Tarot — stilles Easter Egg (Self-reflection, no oracle)
   - Hidden behind repeated taps on the footer logo
   - One deterministic draw per calendar day
   - Special case: if Kinderwunsch aktiv AND Eisprung heute -> 3 cards
*/
(function(){
  "use strict";

  const KEY_UNLOCKED = "lunacy_tarot_unlocked_v1";
  const KEY_SEED = "lunacy_tarot_seed_v1";
  const KEY_DRAW_PREFIX = "lunacy_tarot_draw_v1:"; // + YYYY-MM-DD

  // gentle tap-progress opacity ramp (quiet reveal)
  const OPACITY_STEPS = [0.12, 0.16, 0.22, 0.30, 0.42, 0.58, 0.76, 0.92];
  const TAP_WINDOW_MS = 2400;

  // Minimal deck: neutral titles + keywords (no interpretations)
  const DECK = [
    { t:"Der Kreis", k:["Rhythmus","Wiederkehr","Grenzen","Halt"] },
    { t:"Die Schwelle", k:["Übergang","Mut","Nein / Ja","Klarheit"] },
    { t:"Das Leise", k:["Stille","Feinheit","Zuhören","Tempo"] },
    { t:"Die Flut", k:["Intensität","Bewegung","Weichheit","Durchlassen"] },
    { t:"Die Kante", k:["Abgrenzung","Schutz","Ehrlichkeit","Respekt"] },
    { t:"Der Kern", k:["Wert","Mitte","Wesentliches","Einfach"] },
    { t:"Der Funke", k:["Impuls","Neugier","Start","Spiel"] },
    { t:"Der Schatten", k:["Unerkanntes","Anteil","Scham","Wahrheit"] },
    { t:"Die Hand", k:["Berührung","Tun","Fürsorge","Präsenz"] },
    { t:"Der Atem", k:["Raum","Pausen","Regulation","Körper"] },
    { t:"Die Linie", k:["Richtung","Priorität","Fokus","Entscheidung"] },
    { t:"Der Spiegel", k:["Reflexion","Projektion","Selbstbild","Fragen"] },
    { t:"Der Garten", k:["Nähren","Geduld","Wachsen","Zyklen"] },
    { t:"Das Feuer", k:["Energie","Grenzen","Mut","Klarheit"] },
    { t:"Das Wasser", k:["Gefühl","Fluss","Empfangen","Weich"] },
    { t:"Die Erde", k:["Körper","Realität","Stabilität","Routinen"] },
    { t:"Die Luft", k:["Gedanke","Weite","Perspektive","Sprache"] },
    { t:"Der Mond", k:["Inneres","Nacht","Wandel","Intuition"] },
    { t:"Der Stern", k:["Orientierung","Hoffnung","Weitblick","Leuchten"] },
    { t:"Die Ruhe", k:["Ausruhen","Grenzen","Sanftheit","Zeit"] },
    { t:"Die Welle", k:["Ankommen","Abklingen","Akzeptanz","Atmen"] },
    { t:"Die Quelle", k:["Ursprung","Bedürfnis","Wahrheit","Durst"] },
    { t:"Der Faden", k:["Verbindung","Geschichte","Kontinuität","Sinn"] },
    { t:"Die Tür", k:["Option","Entscheid","Loslassen","Einlassen"] },
    { t:"Der Raum", k:["Weite","Platz","Erlaubnis","Sicherheit"] },
    { t:"Die Grenze", k:["Stop","Ja","Eindeutigkeit","Selbstschutz"] },
    { t:"Die Maske", k:["Rolle","Bild","Schutz","Echtheit"] },
    { t:"Der Blick", k:["Beobachten","Neugier","Annahme","Zartheit"] },
    { t:"Die Stimme", k:["Ausdruck","Wunsch","Klartext","Ton"] },
    { t:"Das Gewicht", k:["Last","Priorität","Ballast","Wahl"] },
    { t:"Das Licht", k:["Klarheit","Wärme","Sichtbar","Sanft"] },
    { t:"Der Knoten", k:["Spannung","Verstrickt","Geduld","Lösen"] },
    { t:"Die Brücke", k:["Beziehung","Übergang","Nähe","Dialog"] },
    { t:"Die Schale", k:["Containment","Hülle","Zart","Schutz"] },
    { t:"Der Puls", k:["Lebendigkeit","Tempo","Signal","Wahrnehmen"] },
    { t:"Die Ordnung", k:["Struktur","Ritual","Einfachheit","Platz"] },
    { t:"Das Unfertige", k:["Prozess","Üben","Neugier","Fehler"] },
    { t:"Der Mut", k:["Wagnis","Herz","Grenzen","Ehrlich"] },
    { t:"Die Milde", k:["Freundlich","Weich","Nachsicht","Würde"] },
    { t:"Der Schnitt", k:["Klar","Trennen","Ende","Raum"] },
    { t:"Die Nähe", k:["Kontakt","Wärme","Zuwendung","Sehen"] },
    { t:"Die Ferne", k:["Abstand","Perspektive","Atem","Weite"] },
    { t:"Der Anfang", k:["Start","Absicht","Neuer Schritt","Leise"] },
    { t:"Das Ende", k:["Abschluss","Ernte","Loslassen","Dank"] },
    { t:"Der Takt", k:["Timing","Rhythmus","Pausen","Zyklus"] },
    { t:"Die Frage", k:["Warum","Wie","Neugier","Offen"] },
  ];

  // ---------- utilities ----------
  const clamp = (x,a,b)=>Math.max(a, Math.min(b,x));

  function isoToday(){
    try{
      if (typeof window.iso === "function") return window.iso(new Date());
    }catch(e){}
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  // FNV-1a 32-bit
  function hash32(str){
    let h = 0x811c9dc5;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return h >>> 0;
  }

  function getSeed(){
    let s = null;
    try{ s = localStorage.getItem(KEY_SEED); }catch(e){}
    if (s) return s;
    // create a stable-ish seed once
    s = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()) + ":" + String(Date.now());
    try{ localStorage.setItem(KEY_SEED, s); }catch(e){}
    return s;
  }

  function pickCard(dateISO, slot){
    const seed = getSeed();
    const h = hash32(`${seed}|${dateISO}|${slot}`);
    let idx = h % DECK.length;
    return { idx, card: DECK[idx] };
  }

  function uniquePicks(dateISO, n){
    const picks = [];
    const used = new Set();
    for (let i=0;i<n;i++){
      let p = pickCard(dateISO, i);
      let guard = 0;
      while (used.has(p.idx) && guard < 20){
        // nudge deterministically
        p.idx = (p.idx + 1) % DECK.length;
        p.card = DECK[p.idx];
        guard++;
      }
      used.add(p.idx);
      picks.push(p.card);
    }
    return picks;
  }

  function shouldShowThreeCards(todayISO){
    try{
      if (typeof window.loadSettings !== "function") return false;
      const settings = window.loadSettings() || {};
      if (!settings.ttc) return false;

      // need cycle data to know ovulation day
      if (typeof window.loadBleedDays !== "function") return false;
      if (typeof window.derivePeriodsFromBleed !== "function") return false;
      if (typeof window.buildCalendarModel !== "function") return false;

      const days = window.loadBleedDays();
      const periods = window.derivePeriodsFromBleed(days);
      if (!periods || !periods.length) return false;

      const model = window.buildCalendarModel(periods, 12);
      const ovISO = Array.isArray(model?.ovulationDaysISO) ? model.ovulationDaysISO[0] : null;
      return !!ovISO && ovISO === todayISO;
    }catch(e){
      return false;
    }
  }

  // ---------- modal ----------
  function ensureModal(){
    let m = document.getElementById("tarotModal");
    if (m) return m;

    m = document.createElement("div");
    m.id = "tarotModal";
    m.className = "modal hidden";
    m.setAttribute("aria-hidden","true");

    m.innerHTML = `
      <div class="modalBackdrop" data-close="1"></div>
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalHeader">
          <div class="muted" id="tarotDate" style="font-size:12px; letter-spacing:0.06em; text-transform:uppercase; opacity:0.85;"></div>
          <button class="btn" id="tarotClose" type="button" aria-label="Schließen">✕</button>
        </div>

        <div id="tarotIntro" class="tarotIntro"></div>
        <div id="tarotBody" class="tarotCardWrap"></div>
        <div class="tarotHint" id="tarotHint"> </div>
      </div>
    `;
    document.body.appendChild(m);

    const close = ()=>{
      m.classList.add("hidden");
      m.setAttribute("aria-hidden","true");
      document.body.style.overflow = "";
    };

    m.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click", close));
    m.querySelector("#tarotClose")?.addEventListener("click", close);
    document.addEventListener("keydown", (e)=>{
      if (e.key === "Escape" && !m.classList.contains("hidden")) close();
    });

    return m;
  }

  function renderCards(dateISO){
    const modal = ensureModal();
    const dateEl = modal.querySelector("#tarotDate");
    if (dateEl) dateEl.textContent = dateISO;

    const intro = modal.querySelector("#tarotIntro");
    const body = modal.querySelector("#tarotBody");
    if (!body) return;

    const three = shouldShowThreeCards(dateISO);
    const cards = uniquePicks(dateISO, three ? 3 : 1);

    body.innerHTML = "";

    // Intro copy: minimal, respectful. Explains *use*, not *meaning*.
    if (intro){
      if (!three){
        intro.innerHTML = `
          <div class="tarotIntroTitle">Heute</div>
          <div class="tarotIntroText">Eine Karte – als Spiegel für deinen aktuellen Stand. Keine Deutung. Nur Raum.</div>
          <div class="tarotExplainRow" aria-hidden="true">
            <span class="tarotExplainPill">Tippe, um umzudrehen</span>
            <span class="tarotExplainPill">Tippe erneut, um zurückzudrehen</span>
          </div>
        `;
      }else{
        intro.innerHTML = `
          <div class="tarotIntroTitle">Heute</div>
          <div class="tarotIntroText">Drei Blickrichtungen – innen, Beziehung, Welt. Keine Aussagen über Zukunft. Nur das, was jetzt da ist.</div>
        `;
      }
    }

    if (!three){
      body.appendChild(buildTarotFlip(cards[0], { dateISO, slot: 0 }));
    }else{
      const grid = document.createElement("div");
      grid.className = "tarotTriGrid";

      const labels = [
        "Blick nach innen",
        "Blick auf das Paar",
        "Blick in die Welt",
      ];

      const helps = [
        "Was ist in dir gerade lebendig – im Körper, im Gefühl, im Tempo?",
        "Was steht zwischen euch – Nähe, Abstand, ein Wunsch, ein Schutz?",
        "Welcher Kontext hält dich heute – Alltag, Druck, Unterstützung, Weite?",
      ];

      for (let i=0;i<3;i++){
        const slot = document.createElement("div");
        const lab = document.createElement("div");
        lab.className = "tarotSlotLabel";
        lab.textContent = labels[i];
        slot.appendChild(lab);

        // Additional explanation only in the special ovulation + TTC case
        const help = document.createElement("div");
        help.className = "tarotSlotHelp";
        help.textContent = helps[i];

        slot.appendChild(buildTarotFlip(cards[i], { dateISO, slot: i }));
        slot.appendChild(help);
        grid.appendChild(slot);
      }
      body.appendChild(grid);
    }

    // silent hint line: just a breath
    const hint = modal.querySelector("#tarotHint");
    if (hint) hint.textContent = " ";

    // open
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }

  function buildTarotFlip(card, ctx){
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = "tarotFlip";
    flip.setAttribute("aria-label", "Tarotkarte umdrehen");
    flip.style.border = "none";
    flip.style.background = "transparent";
    flip.style.padding = "0";
    flip.style.cursor = "pointer";

    const dateISO = (ctx && ctx.dateISO) ? ctx.dateISO : isoToday();
    const slot = (ctx && typeof ctx.slot === "number") ? ctx.slot : 0;
    // Remember last side per day + slot (so the "state" feels consistent)
    const flippedKey = `${KEY_DRAW_PREFIX}${dateISO}:flip:${slot}`;
    let wasFlipped = false;
    try{ wasFlipped = localStorage.getItem(flippedKey) === "1"; }catch(e){}

    flip.innerHTML = `
      <div class="tarotInner">
        <div class="tarotFace tarotBack">
          <img class="tarotBackImg" src="tarot-back.png" alt="" aria-hidden="true">
        </div>
        <div class="tarotFace tarotFront">
          <div>
            <div class="tarotTitle">${escapeHtml(card.t)}</div>
            <div class="tarotKeywords">
              ${card.k.map(x=>`<span class="tarotKw">${escapeHtml(x)}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    const setState = (isFlipped)=>{
      flip.classList.toggle("is-flipped", !!isFlipped);
      try{ localStorage.setItem(flippedKey, isFlipped ? "1" : "0"); }catch(e){}
    };

    if (wasFlipped) setState(true);

    flip.addEventListener("click", ()=>{
      // Allow flipping back and forth
      setState(!flip.classList.contains("is-flipped"));
    });

    return flip;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  // ---------- Easter Egg: footer logo taps ----------
  function attachFooterEasterEgg(){
    const el = document.getElementById("footerLogo") || document.querySelector(".footerLogo");
    if (!el) return;

    // Keep an in-memory flag too, so we can switch behavior immediately
    // (even if the user taps again within the same session).
    let unlocked = (()=>{
      try{ return localStorage.getItem(KEY_UNLOCKED) === "1"; }catch(e){ return false; }
    })();

    if (unlocked) document.body.classList.add("tarotUnlocked");

    // base state
    el.style.opacity = unlocked ? "0.92" : String(OPACITY_STEPS[0]);

    const openTarot = ()=> renderCards(isoToday());

    // Helpers to swap listeners after unlock
    const onKeyOpen = (e)=>{ if (e.key==="Enter" || e.key===" ") openTarot(); };
    const enableDirectOpen = ()=>{
      // remove discovery listeners (if present)
      try{ el.removeEventListener("click", onTap); }catch(e){}
      try{ el.removeEventListener("keydown", onKeyTap); }catch(e){}
      // add direct open
      el.addEventListener("click", openTarot);
      el.addEventListener("keydown", onKeyOpen);
    };

    // If already unlocked, a single tap opens (still quiet)
    if (unlocked){
      enableDirectOpen();
      return;
    }

    let count = 0;
    let lastTap = 0;

    const reset = ()=>{
      count = 0;
      el.style.opacity = String(OPACITY_STEPS[0]);
    };

    const onTap = ()=>{
      const now = Date.now();
      if (!lastTap || (now - lastTap) > TAP_WINDOW_MS){
        count = 0;
        el.style.opacity = String(OPACITY_STEPS[0]);
      }
      lastTap = now;
      count++;

      const stepIdx = clamp(count-1, 0, OPACITY_STEPS.length-1);
      el.style.opacity = String(OPACITY_STEPS[stepIdx]);

      if (count >= OPACITY_STEPS.length){
        unlocked = true;
        try{ localStorage.setItem(KEY_UNLOCKED, "1"); }catch(e){}
        document.body.classList.add("tarotUnlocked");
        el.style.opacity = "0.92";
        // tiny breath before opening
        setTimeout(openTarot, 160);
        count = 0;
        // Important: from now on, tapping should open immediately (no re-unlocking)
        enableDirectOpen();
      }
    };

    const onKeyTap = (e)=>{
      if (e.key==="Enter" || e.key===" "){
        e.preventDefault();
        onTap();
      }
    };

    el.addEventListener("click", onTap);
    el.addEventListener("keydown", onKeyTap);

    // if user pauses, fade back down (quietly)
    setInterval(()=>{
      if (unlocked) return; // once unlocked, never fade back or reset
      if (!lastTap) return;
      if ((Date.now() - lastTap) > TAP_WINDOW_MS){
        lastTap = 0;
        reset();
      }
    }, 600);
  }

  document.addEventListener("DOMContentLoaded", attachFooterEasterEgg);
})();
