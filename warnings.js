// warnings.js - Hinweise/Warnungen fuer Heute (neutral, nicht-medizinisch)
// Wird nach app.js geladen.
// Exposed: window.renderWarningsPanel(todayISO, ctx)

(function(){
  "use strict";

  const KEY_WARN_STATE = "lunacy_warn_state_v1";

  function avg(arr){
    const a = (arr||[]).filter(x=>Number.isFinite(x));
    if (!a.length) return null;
    return a.reduce((s,x)=>s+x,0) / a.length;
  }

  function minmax(arr){
    const a = (arr||[]).filter(x=>Number.isFinite(x));
    if (!a.length) return { min:null, max:null, range:null };
    let min = a[0], max = a[0];
    for (const x of a){
      if (x < min) min = x;
      if (x > max) max = x;
    }
    return { min, max, range: max - min };
  }

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }

  function isoDate(d){
    if (typeof window.iso === "function") return window.iso(d);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function addMonths(date, months){
    const d = new Date(date);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + (Number(months)||0));
    // clamp day to month length
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  }

  function loadWarnState(){
    try{
      const raw = localStorage.getItem(KEY_WARN_STATE);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    }catch(_e){
      return {};
    }
  }

  function saveWarnState(obj){
    try{
      localStorage.setItem(KEY_WARN_STATE, JSON.stringify(obj||{}));
    }catch(_e){
      // ignore
    }
  }

  function suppressedUntilISO(id){
    const st = loadWarnState();
    const rec = st?.[id];
    return rec?.untilISO || null;
  }

  function isSuppressed(id, todayISO){
    const untilISO = suppressedUntilISO(id);
    if (!untilISO) return false;
    const until = (typeof window.parseISO === "function") ? window.parseISO(untilISO) : new Date(untilISO + "T00:00:00");
    const today = (typeof window.parseISO === "function") ? window.parseISO(todayISO) : new Date(todayISO + "T00:00:00");
    return today < until;
  }

  function suppress(id, untilISO){
    const st = loadWarnState();
    st[id] = { untilISO: String(untilISO||"") };
    saveWarnState(st);
  }

  function computeCycleLengths(periods){
    const ps = (periods||[]).slice().sort((a,b)=>a.start-b.start);
    const lens = [];
    for (let i=0;i<ps.length-1;i++){
      const a = ps[i].start;
      const b = ps[i+1].start;
      const len = (typeof window.diffDays === "function") ? window.diffDays(a,b) : Math.round((b-a)/(24*60*60*1000));
      if (Number.isFinite(len) && len > 0) lens.push(len);
    }
    return lens; // old->new order by construction
  }

  function computeWarnings(ctx, todayISO){
    const out = [];
    if (!ctx) return out;

    const settings = (typeof window.loadSettings === "function") ? window.loadSettings() : { ttc:false };

    // 1) TTC + short luteal phase
    // luteal length ~= days between ovulation and next period start
    const lutealLen = (typeof window.diffDays === "function") ? window.diffDays(ctx.ovuDate, ctx.nextStart) : null;
    if (settings.ttc && Number.isFinite(lutealLen)){
      if (lutealLen <= 8){
        out.push({
          id: "ttc_luteal_very_short",
          level: "high",
          title: "Kinderwunsch: Lutealphase sehr kurz",
          text: `Zwischen Eisprung (≈) und Periode liegen nur ${lutealLen} Tage. Wenn das haeufig so ist: Progesteron/Lutealphase beim Frauenarzt ansprechen.`
        });
      } else if (lutealLen <= 10){
        out.push({
          id: "ttc_luteal_short",
          level: "mid",
          title: "Kinderwunsch: Lutealphase eher kurz",
          text: `Zwischen Eisprung (≈) und Periode liegen ${lutealLen} Tage. Bei wiederholt < 11 Tagen: ggf. Progesteron/Lutealphase abklaeren.`
        });
      }
    }

    // 2) Cycle length trends / variability
    const cycleLens = computeCycleLengths(ctx.periods);
    if (cycleLens.length >= 6){
      const last3 = cycleLens.slice(-3);
      const prev3 = cycleLens.slice(-6,-3);
      const aLast = avg(last3);
      const aPrev = avg(prev3);
      if (aLast !== null && aPrev !== null){
        const delta = aLast - aPrev;
        if (delta >= 3){
          out.push({
            id: "cycle_trend_longer",
            level: "mid",
            title: "Deine Zyklen werden laenger",
            text: `In den letzten 3 Zyklen im Schnitt +${Math.round(delta)} Tage gegenueber den 3 davor. Wenn das sich fortsetzt: Hormone/Stress/Schilddruese bei Bedarf abklaeren.`
          });
        } else if (delta <= -3){
          out.push({
            id: "cycle_trend_shorter",
            level: "mid",
            title: "Deine Zyklen werden kuerzer",
            text: `In den letzten 3 Zyklen im Schnitt ${Math.round(delta)} Tage gegenueber den 3 davor. Wenn das neu ist: ggf. hormonelle Veraenderungen mit Gyn besprechen.`
          });
        }
      }

      const mm = minmax(cycleLens.slice(-6));
      if (mm.range !== null && mm.range >= 8){
        out.push({
          id: "cycle_variability",
          level: "low",
          title: "Zyklus schwankt deutlich",
          text: `Letzte 6 Zyklen: ${mm.min}–${mm.max} Tage (Spanne ${mm.range}). Das kann normal sein, aber wenn es stoert: Tracking (LH/BBT) + ggf. Check.`
        });
      }
    }

    // apply suppression state
    const filtered = out.filter(w => {
      if (!w?.id) return true;
      return !isSuppressed(w.id, todayISO);
    });
    return filtered;
  }

  function renderWarningsPanel(todayISO, ctx){
    const box = document.getElementById("warningsPanel");
    if (!box) return;
    if (!ctx){
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }

    const items = computeWarnings(ctx, todayISO);
    if (!items.length){
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }

    const settings = (typeof window.loadSettings === "function") ? window.loadSettings() : { warnSnoozeMonths: 6 };
    const defaultMonths = Number(settings.warnSnoozeMonths || 6);

    const badge = (lvl)=>{
      if (lvl === "high") return '<span class="warnBadge high">Wichtig</span>';
      if (lvl === "mid") return '<span class="warnBadge mid">Hinweis</span>';
      return '<span class="warnBadge low">Info</span>';
    };

    box.classList.remove("hidden");
    box.classList.add("warningsCard");
    box.innerHTML = `
      <div class="warnHeader">
        <div>
          <div class="muted">Hinweise & Warnungen</div>
          <div class="strong">Kurz-Check</div>
        </div>
      </div>
      <div class="warnList">
        ${items.map(it => `
          <div class="warnItem ${escapeHtml(it.level)}" data-warn-id="${escapeHtml(it.id||"")}">
            <div class="warnTop">
              <div class="warnTitle">${escapeHtml(it.title)}</div>
              ${badge(it.level)}
            </div>
            <div class="warnText">${escapeHtml(it.text)}</div>
            <div class="warnActions">
              <button type="button" class="btn warnBtn" data-act="dismiss" data-id="${escapeHtml(it.id||"")}">Nicht mehr anzeigen</button>
              <div class="warnSnooze">
                <select class="warnSelect" data-for="${escapeHtml(it.id||"")}" aria-label="Erinnerung in Monaten">
                  ${[1,3,6,12].map(m=>`<option value="${m}" ${m===defaultMonths?"selected":""}>in ${m} Monat${m===1?"":"en"}</option>`).join("")}
                </select>
                <button type="button" class="btn warnBtn" data-act="snooze" data-id="${escapeHtml(it.id||"")}">Später erinnern</button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="muted" style="margin-top:10px;font-size:12px;">Hinweis: Keine medizinische Beratung. Wenn dich etwas verunsichert: ärztlich abklären.</div>
    `;

    // bind actions
    box.querySelectorAll(".warnBtn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id") || "";
        if (!id) return;

        if (act === "dismiss"){
          suppress(id, "9999-12-31");
          renderWarningsPanel(todayISO, ctx);
          return;
        }

        if (act === "snooze"){
          const esc = (window.CSS && typeof window.CSS.escape === "function") ? window.CSS.escape(id) : id.replace(/\\/g,"\\\\").replace(/\"/g,'\\"');
          const sel = box.querySelector(`.warnSelect[data-for="${esc}"]`);
          const months = clampNum(Number(sel?.value || defaultMonths), 1, 24);
          const today = (typeof window.parseISO === "function") ? window.parseISO(todayISO) : new Date(todayISO + "T00:00:00");
          const until = addMonths(today, months);
          suppress(id, isoDate(until));
          renderWarningsPanel(todayISO, ctx);
        }
      });
    });
  }

  function clampNum(n, min, max){
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  }

  window.renderWarningsPanel = renderWarningsPanel;
})();
