// app.js - Lunacy v2 (3 Dateien)
// Neu: tägliches Blutungs-Logging + automatische Perioden-Erkennung (inkl. vergessene Tage)
// Neu: Notiz-Icon im Kalender
// Neu: Stats: Eisprung-Zyklustag für letzte 12 Zyklen (LH+ berücksichtigt)

const KEY_BLEED   = "pt_bleed_v1";   // array of ISO dates with bleeding
const KEY_NOTES   = "pt_notes_v1";   // {dateISO: [notes]}
const KEY_SETTINGS= "pt_settings_v1";// {cycleLen,periodLen,ovuDay,motherSign,fatherSign,ttc}

// ---------- utils ----------
function loadJSON(key, fallback){ try{const r=localStorage.getItem(key);return r?JSON.parse(r):fallback;}catch{return fallback;}}
function saveJSON(key, v){ localStorage.setItem(key, JSON.stringify(v));}
function uid(){ return crypto.randomUUID?crypto.randomUUID():String(Date.now())+"_"+Math.random().toString(16).slice(2);}

function iso(d){
  const dd=new Date(d); const y=dd.getFullYear();
  const m=String(dd.getMonth()+1).padStart(2,"0");
  const day=String(dd.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function diffDays(a,b){
  const ms=24*60*60*1000;
  const aa=new Date(a.getFullYear(),a.getMonth(),a.getDate()).getTime();
  const bb=new Date(b.getFullYear(),b.getMonth(),b.getDate()).getTime();
  return Math.round((bb-aa)/ms);
}
function between(d,a,b){ const t=d.getTime(); return t>=a.getTime() && t<=b.getTime();}
function formatDateDE(dateOrISO){
  const d=typeof dateOrISO==="string"?parseISO(dateOrISO):dateOrISO;
  return d.toLocaleDateString("de-DE",{year:"numeric",month:"2-digit",day:"2-digit"});
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,(c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function shortText(s, max=42){
  const t = String(s||"").trim();
  if (!t) return "";
  return t.length > max ? (t.slice(0, max-1) + "…") : t;
}

// ---------- astrology helpers (optional fun layer) ----------
// Ausgelagert nach astro.js

// ---------- settings ----------
function loadSettings(){
  const s = loadJSON(KEY_SETTINGS, { cycleLen: 28, periodLen: 5, ovuDay: null, motherSign: "", fatherSign: "", ttc: true });
  return {
    cycleLen: clamp(Number(s.cycleLen||28), 15, 60),
    periodLen: clamp(Number(s.periodLen||5), 1, 14),
    ovuDay: (s.ovuDay === null || s.ovuDay === "" || typeof s.ovuDay === "undefined") ? null : clamp(Number(s.ovuDay), 6, 50),
    motherSign: String(s.motherSign||"").trim(),
    fatherSign: String(s.fatherSign||"").trim(),
    ttc: (typeof s.ttc === "boolean") ? s.ttc : true,
  };
}
function saveSettings(s){ saveJSON(KEY_SETTINGS, s); }

// ---------- bleeding log ----------
function loadBleedDays(){
  const arr = loadJSON(KEY_BLEED, []);
  const set = new Set(arr.filter(Boolean));
  return [...set].sort(); // ascending ISO
}
function saveBleedDays(days){ saveJSON(KEY_BLEED, days); }

function addBleedDay(dateISO){
  const days = loadBleedDays();
  if (!days.includes(dateISO)) days.push(dateISO);
  // auto-fill missing days within short gaps (<=2 days) to handle "forgotten days"
  const filled = fillSmallGaps([...new Set(days)].sort());
  saveBleedDays(filled);
}
function removeBleedDay(dateISO){
  const days = loadBleedDays().filter(d => d !== dateISO);
  saveBleedDays(days);
}

function fillSmallGaps(sortedISO){
  // if we have 18 and 21, fill 19 and 20 (gap 3 -> missing 2)
  const out = [];
  for (let i=0;i<sortedISO.length;i++){
    const cur = sortedISO[i];
    out.push(cur);
    const next = sortedISO[i+1];
    if (!next) continue;
    const a = parseISO(cur);
    const b = parseISO(next);
    const gap = diffDays(a,b);
    if (gap >= 2 && gap <= 3){
      // fill missing days between (gap=2 -> fill 1 day, gap=3 -> fill 2 days)
      for (let k=1;k<gap;k++){
        out.push(iso(addDays(a,k)));
      }
    }
  }
  return [...new Set(out)].sort();
}

function derivePeriodsFromBleed(daysISO){
  // group consecutive days allowing 1-day gaps already filled; after fillSmallGaps it's contiguous.
  if (!daysISO.length) return [];
  const days = daysISO.map(parseISO).sort((a,b)=>a-b);

  const periods = [];
  let start = days[0];
  let prev = days[0];

  for (let i=1;i<days.length;i++){
    const d = days[i];
    const gap = diffDays(prev, d);
    if (gap <= 1){
      prev = d;
      continue;
    }
    // end current
    periods.push({ start: start, end: prev });
    start = d;
    prev = d;
  }
  periods.push({ start: start, end: prev });

  // newest first
  periods.sort((a,b)=>b.start - a.start);
  return periods;
}

// ---------- notes ----------
function loadNotesByDate(){ return loadJSON(KEY_NOTES, {}); }
function saveNotesByDate(map){ saveJSON(KEY_NOTES, map); }

function dayHasNotes(dateISO){
  const notes = (loadNotesByDate()[dateISO] || []);
  return notes.length > 0;
}

// ---------- cycle model & LH personalization ----------
function findPositiveLHInWindow(notesByDate, cycleStart, cycleEnd){
  const keys = Object.keys(notesByDate||{});
  const inWindow = keys.filter(k => between(parseISO(k), cycleStart, cycleEnd));
  const positives=[];
  for (const dateISO of inWindow){
    const notes = notesByDate[dateISO] || [];
    const hasPos = notes.some(n => n && n.type==="LH" && String(n.result||"").toLowerCase()==="positiv");
    if (hasPos) positives.push(dateISO);
  }
  positives.sort();
  return positives[0] || null;
}

function findFirstNoteMatchInWindow(notesByDate, cycleStart, cycleEnd, predicate){
  const keys = Object.keys(notesByDate||{});
  const inWindow = keys.filter(k => between(parseISO(k), cycleStart, cycleEnd)).sort();
  for (const dateISO of inWindow){
    const notes = notesByDate[dateISO] || [];
    for (const n of notes){
      if (predicate(n)) return { dateISO, note: n };
    }
  }
  return null;
}

function findMittelschmerzInWindow(notesByDate, cycleStart, cycleEnd){
  return findFirstNoteMatchInWindow(notesByDate, cycleStart, cycleEnd, (n)=>n && n.type==="MITTELSCHMERZ");
}

function findCervixFadenziehendInWindow(notesByDate, cycleStart, cycleEnd){
  return findFirstNoteMatchInWindow(notesByDate, cycleStart, cycleEnd, (n)=>{
    if (!n) return false;
    if (n.type !== "ZERVIX") return false;
    const r = String(n.result||"").toLowerCase();
    if (r === "fadenziehend") return true;
    const t = String(n.text||"").toLowerCase();
    return t.includes("fadenziehend");
  });
}

function computePersonalOvulationOffset(periodsNewestFirst, notesByDate, fallbackOffset){
  // use cycles where LH+ exists: ovulation = LH+1; offset = days from period start
  const sorted = [...periodsNewestFirst].sort((a,b)=>a.start-b.start); // old->new
  const offsets = [];

  for (let i=0;i<sorted.length;i++){
    const start = sorted[i].start;
    const end = (i+1<sorted.length) ? addDays(sorted[i+1].start, -1) : addDays(start, 60); // wide window for last
    const lhISO = findPositiveLHInWindow(notesByDate, start, end);
    if (!lhISO) continue;
    const ov = addDays(parseISO(lhISO), 1);
    const off = diffDays(start, ov);
    if (off>=5 && off<=50) offsets.push(off);
  }
  if (!offsets.length) return fallbackOffset;
  return Math.round(offsets.reduce((s,x)=>s+x,0)/offsets.length);
}

function buildCalendarModel(periodsNewestFirst, forecastCycles=6){
  const settings = loadSettings();
  if (!periodsNewestFirst.length){
    return { actualPeriods: [], forecastPeriods: [], fertileRanges: [], ovulationDaysISO: [], cycleLen: settings.cycleLen, periodLen: settings.periodLen, personalOvuOffset: (settings.ovuDay?settings.ovuDay-1:(settings.cycleLen-14)), latestStart: null };
  }

  const latestStart = periodsNewestFirst[0].start;
  const notesByDate = loadNotesByDate();

  // compute cycle length from last 12 period starts if possible
  const starts = periodsNewestFirst.slice(0, 13).map(p=>p.start).sort((a,b)=>a-b);
  const diffs = [];
  for (let i=1;i<starts.length;i++){
    const d = diffDays(starts[i-1], starts[i]);
    if (d>=15 && d<=60) diffs.push(d);
  }
  const cycleLen = diffs.length ? Math.round(diffs.reduce((s,x)=>s+x,0)/diffs.length) : settings.cycleLen;
  const periodLen = settings.periodLen; // baseline; actual comes from bleed groups

  const fallbackOffset = settings.ovuDay ? (settings.ovuDay - 1) : (cycleLen - 14);
  const personalOvuOffset = computePersonalOvulationOffset(periodsNewestFirst.slice(0,12), notesByDate, fallbackOffset);

  // Actual periods from bleed groups
  const actualPeriods = periodsNewestFirst.map(p => ({ start: p.start, end: p.end }));

  const fertileRanges = [];
  const ovulationDaysISO = [];

  // current cycle ovulation: priority LH+ > Mittelschmerz > Zervix (fadenziehend) > Standard
  const nextStart = periodsNewestFirst.length > 1 ? periodsNewestFirst[1].start : addDays(latestStart, cycleLen);
  const currentOv = computeOvulationForCycle(latestStart, nextStart, { personalOvuOffset }, notesByDate);
  ovulationDaysISO.push(iso(currentOv.ovuDate));
  fertileRanges.push({ start: addDays(currentOv.ovuDate, -5), end: addDays(currentOv.ovuDate, 1) });

  // Future cycles forecast
  const forecastPeriods = [];
  for (let k=1;k<=forecastCycles;k++){
    const startK = addDays(latestStart, cycleLen * k);
    const endK = addDays(startK, periodLen - 1);
    forecastPeriods.push({ start: startK, end: endK });

    const ovu = addDays(startK, personalOvuOffset);
    ovulationDaysISO.push(iso(ovu));
    fertileRanges.push({ start: addDays(ovu, -5), end: addDays(ovu, 1) });
  }

  return { actualPeriods, forecastPeriods, fertileRanges, ovulationDaysISO, cycleLen, periodLen, personalOvuOffset, latestStart, currentOvulation: currentOv };
}

// ---------- UI: views ----------
function setView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  document.getElementById(`view-${name}`).classList.remove("hidden");

  document.querySelectorAll(".nav .btn").forEach(b=>b.classList.remove("primary"));
  const active = document.querySelector(`.nav .btn[data-view='${name}']`);
  if (active) active.classList.add("primary");

  if (name==="calendar") rerenderCalendar();
  if (name==="hormones") rerenderHormones();
  if (name==="stats") rerenderStats();
  if (name==="today") rerenderToday();
  if (name==="settings") renderSettingsForm();
}

// ---------- TODAY ----------
let editingPeriod = null; // {startISO,endISO} currently being edited

function normalizeRange(fromISO, toISO){
  if (!fromISO || !toISO) return null;
  let a = parseISO(fromISO);
  let b = parseISO(toISO);
  if (a > b){ const tmp = a; a = b; b = tmp; }
  return { a, b, fromISO: iso(a), toISO: iso(b) };
}

function addBleedRange(fromISO, toISO){
  const r = normalizeRange(fromISO, toISO);
  if (!r) return;

  const days = loadBleedDays();
  const set = new Set(days);
  const span = clamp(diffDays(r.a, r.b), 0, 400); // safety
  for (let i=0;i<=span;i++) set.add(iso(addDays(r.a, i)));

  const filled = fillSmallGaps([...set].sort());
  saveBleedDays(filled);
}

function removeBleedRange(fromISO, toISO){
  const r = normalizeRange(fromISO, toISO);
  if (!r) return;

  const span = clamp(diffDays(r.a, r.b), 0, 400);
  const remove = new Set();
  for (let i=0;i<=span;i++) remove.add(iso(addDays(r.a, i)));

  const filtered = loadBleedDays().filter(d => !remove.has(d));
  saveBleedDays(filtered);
}

function replaceBleedRange(oldFromISO, oldToISO, newFromISO, newToISO){
  removeBleedRange(oldFromISO, oldToISO);
  addBleedRange(newFromISO, newToISO);
}

function openEditPeriod(startISO, endISO){
  editingPeriod = { startISO, endISO };
  const box = document.getElementById("editPeriodBox");
  if (!box) return;
  box.classList.remove("hidden");
  document.getElementById("editFrom").value = startISO;
  document.getElementById("editTo").value = endISO;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditPeriod(){
  editingPeriod = null;
  const box = document.getElementById("editPeriodBox");
  if (box) box.classList.add("hidden");
}

function rerenderToday(){
  const todayISO = iso(new Date());
  document.getElementById("bleedDate").value = todayISO;

  renderPhasePanel(todayISO);

  // defaults for range inputs
  const fromEl = document.getElementById("bleedFrom");
  const toEl = document.getElementById("bleedTo");
  if (fromEl && !fromEl.value) fromEl.value = todayISO;
  if (toEl && !toEl.value) toEl.value = todayISO;

  const days = loadBleedDays();
  const has = days.includes(todayISO);
  const btn = document.getElementById("bleedTodayBtn");
  btn.textContent = has ? "Heute Blutung: entfernen" : "Heute Blutung: hinzufügen";
  btn.classList.toggle("danger", has);
  btn.classList.toggle("primary", !has);

  const periods = derivePeriodsFromBleed(days);
  const list = document.getElementById("periodsList");
  if (!periods.length){
    list.innerHTML = '<p class="muted">Noch keine Blutungstage eingetragen.</p>';
    closeEditPeriod();
    return;
  }

  list.innerHTML = periods.slice(0, 12).map((p) => {
    const startISO = iso(p.start);
    const endISO = iso(p.end);
    const len = diffDays(p.start, p.end) + 1;
    return `
      <div class="row">
        <div style="flex:1;">
          <div class="strong">${formatDateDE(p.start)} – ${formatDateDE(p.end)}</div>
          <div class="muted" style="font-size:12px;margin-top:2px;">Dauer: ${len} Tage</div>
        </div>
        <div class="rowBtns" style="justify-content:flex-end;">
          <button class="btn" type="button" data-edit-period="${startISO}|${endISO}">Bearbeiten</button>
          <button class="btn danger" type="button" data-del-period="${startISO}|${endISO}">Löschen</button>
        </div>
      </div>
    `;
  }).join("");

  // bind buttons
  list.querySelectorAll("[data-edit-period]").forEach((b)=>{
    b.addEventListener("click", ()=>{
      const raw = b.getAttribute("data-edit-period") || "";
      const [s,e] = raw.split("|");
      if (s && e) openEditPeriod(s,e);
    });
  });

  list.querySelectorAll("[data-del-period]").forEach((b)=>{
    b.addEventListener("click", ()=>{
      const raw = b.getAttribute("data-del-period") || "";
      const [s,e] = raw.split("|");
      if (!s || !e) return;
      if (!confirm(`Periode ${formatDateDE(s)} – ${formatDateDE(e)} wirklich löschen?`)) return;
      removeBleedRange(s,e);
      if (editingPeriod && editingPeriod.startISO===s && editingPeriod.endISO===e) closeEditPeriod();
      rerenderToday(); rerenderCalendar(); rerenderStats();
    });
  });
}

// ---------- TODAY: phase info (neutral tips) ----------
// Ausgelagert nach tips.js (getCurrentCycleContext / computePhaseForDate / phaseTips / renderPhasePanel)

// ---------- CALENDAR ----------
let viewDate = new Date();
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function fmtMonth(d){ return d.toLocaleDateString("de-DE", { month:"long", year:"numeric" }); }

function renderNoteIcon(btn){
  // small note icon (SVG) — more visible than a dot
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.classList.add("dayNoteIcon");
  svg.innerHTML = `
    <path fill="rgba(201,166,255,0.95)" d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
    <path fill="rgba(15,12,26,0.85)" d="M15 2v5h5z"/>
    <path fill="rgba(15,12,26,0.65)" d="M7 10h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/>
  `;
  btn.appendChild(svg);
}

function rerenderCalendar(){
  const days = loadBleedDays();
  const periods = derivePeriodsFromBleed(days);
  const model = buildCalendarModel(periods, 6);

  document.getElementById("monthTitle").textContent = fmtMonth(viewDate);
  const cal = document.getElementById("calendar");
  const summary = document.getElementById("summary");
  cal.innerHTML = "";

  const weekdays=["Mo","Di","Mi","Do","Fr","Sa","So"];
  weekdays.forEach(w=>{
    const el=document.createElement("div");
    el.className="cell head";
    el.textContent=w;
    cal.appendChild(el);
  });

  const monthStart = startOfMonth(viewDate);
  const dow = (monthStart.getDay()+6)%7;
  const gridStart = addDays(monthStart, -dow);

  const inAny = (rangesArr, d) => rangesArr.some(r => between(d, r.start, r.end));

  for (let i=0;i<42;i++){
    const d = addDays(gridStart, i);
    const dateISO = iso(d);
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const btn=document.createElement("button");
    btn.type="button";
    btn.className="cell day";
    if (d.getMonth() !== viewDate.getMonth()) btn.classList.add("dim");

    const label=document.createElement("div");
    label.className="date";
    label.textContent=d.getDate();
    btn.appendChild(label);

    if (periods.length){
      const isActual = inAny(model.actualPeriods, dd);
      if (isActual) btn.classList.add("bg-period");
      if (!isActual && inAny(model.forecastPeriods, dd)) btn.classList.add("bg-predicted");
      if (inAny(model.fertileRanges, dd)) btn.classList.add("bg-fertile");
      if (model.ovulationDaysISO.includes(dateISO)) btn.classList.add("bg-ovu");
    }

    if (dayHasNotes(dateISO)) renderNoteIcon(btn);

    btn.addEventListener("click", () => openNotes(dateISO));
    cal.appendChild(btn);
  }

  if (!periods.length){
    summary.innerHTML = '<p class="muted">Noch keine Blutungstage. Nutze „Heute“ oder trage rückwirkend ein.</p>';
    return;
  }

  const nextStarts = model.forecastPeriods.map(r=>formatDateDE(r.start)).slice(0,6);
  const settings = loadSettings();
  const nextOvISOs = model.ovulationDaysISO.slice(0,6);
  const nextOvBadges = nextOvISOs.map(d=>formatDateDE(d));

  const pregnancyGrid = (()=>{
    if (!settings.ttc) return "";

    const pregnancyData = nextOvISOs.map((dISO, idx)=>{
      const ovuDate = parseISO(dISO);
      const et = computeETFromOvulation(ovuDate);
      const w = getWesternSign(et);
      const cz = getChineseZodiac(et);
      const g = combinedParentGrade(w.name, settings.motherSign, settings.fatherSign);
      const adj = (w.adj||[]).slice(0,3).join(", ");
      const gTxt = g.grade ? `${g.grade}${g.detail?` (${g.detail})`:""}` : "–";
      return {
        idx,
        ovu: `${idx===0?"(aktuell) ":""}${formatDateDE(ovuDate)}`,
        et: formatDateDE(et),
        sign: `${escapeHtml(w.name)}${adj?` <span class="muted" style="font-size:12px;">(${escapeHtml(adj)})</span>`:""}`,
        chinese: escapeHtml(cz.animal),
        match: gTxt,
        signPlain: w.name,
        adjPlain: adj,
      };
    });

    const head = `
      <div class="th">Eisprung</div>
      <div class="th">ET (≈)</div>
      <div class="th">Sternzeichen</div>
      <div class="th">Chinesisch</div>
      <div class="th">Match (1–6)</div>
    `;

    const desktopCells = pregnancyData.map(r=>`
      <div class="td">${r.ovu}</div>
      <div class="td">${r.et}</div>
      <div class="td">${r.sign}</div>
      <div class="td">${r.chinese}</div>
      <div class="td">${r.match}</div>
    `).join("");

    const mobileCards = pregnancyData.map(r=>`
      <div class="rowCard">
        <div class="kv"><div class="k">Eisprung</div><div class="v">${r.ovu}</div></div>
        <div class="kv"><div class="k">ET (≈)</div><div class="v">${r.et}</div></div>
        <div class="kv"><div class="k">Sternzeichen</div><div class="v">${escapeHtml(r.signPlain)}${r.adjPlain?` <span class="muted" style="font-size:12px;">(${escapeHtml(r.adjPlain)})</span>`:""}</div></div>
        <div class="kv"><div class="k">Chinesisch</div><div class="v">${r.chinese}</div></div>
        <div class="kv"><div class="k">Match</div><div class="v">${r.match}</div></div>
      </div>
    `).join("");

    return `<div class="tableGrid" style="margin-top:8px;">${head}${desktopCells}${mobileCards}</div>`;
  })();
  const ovReason = model.currentOvulation?.reasonText ? ` • ${escapeHtml(model.currentOvulation.reasonText)}` : "";
  summary.innerHTML = `
    <div class="grid2">
      <div class="card inner"><div class="muted">Zyklus (Ø / Standard)</div><div class="big">${model.cycleLen} Tage</div></div>
      <div class="card inner"><div class="muted">Periode (Standard)</div><div class="big">${model.periodLen} Tage</div></div>
      <div class="card inner"><div class="muted">Eisprung-Offset (gelernt)</div><div class="big">Tag ${model.personalOvuOffset+1}</div></div>
      <div class="card inner"><div class="muted">Eisprung (≈, aktuell)</div><div class="big">${formatDateDE(model.ovulationDaysISO[0])}${ovReason}</div></div>
      <div class="card inner" style="grid-column:1/-1;">
        <div class="muted">Nächste 6 Periodenstarts (≈)</div>
        <div class="badges">${nextStarts.map(x=>`<span class="badge">${x}</span>`).join("")}</div>
      </div>
      <div class="card inner" style="grid-column:1/-1;">
        <div class="muted">Nächste 6 Eisprünge (≈)</div>
        <div class="badges">${nextOvBadges.map(x=>`<span class="badge">${x}</span>`).join("")}</div>
      </div>
      ${settings.ttc ? `
      <div class="card inner" style="grid-column:1/-1;">
        <div class="muted">Wenn Schwangerschaft im jeweiligen Zyklus (ET & Sternzeichen nach Eisprung)</div>
        ${pregnancyGrid}
        <div class="muted" style="margin-top:8px;font-size:12px;">
          Match ist eine einfache Element-Heuristik (Feuer/Luft & Erde/Wasser tendenziell besser). Für den Match-Wert bitte Mutter/Vater-Sternzeichen in den Einstellungen setzen.
        </div>
      </div>
      ` : ""}
    </div>
  `;
}

// ---------- HORMONE CURVE (reference model; no measurements) ----------
function gaussian(x, mu, sigma){
  const z = (x - mu) / (sigma || 1);
  return Math.exp(-0.5 * z * z);
}

function buildHormoneModel(cycleLen, ovDay){
  // Returns values in [0,1] (relative). Heuristic reference curves.
  const estrogen = [];
  const lh = [];
  const progesterone = [];
  const bbt = [];

  for (let d=1; d<=cycleLen; d++){
    const e1 = 0.18 + 0.85*gaussian(d, ovDay-1.4, 3.2); // dominant pre-ovulatory rise
    const e2 = 0.20*gaussian(d, ovDay+6.5, 5.0);        // smaller luteal bump
    const e = clamp(e1 + e2, 0, 1);

    const l = clamp(0.06 + 0.98*gaussian(d, ovDay, 1.0), 0, 1);

    // Progesterone rises after ovulation and peaks mid-luteal
    const pRise = 1/(1 + Math.exp(-(d-(ovDay+1.5))*1.2));
    const pFall = 1/(1 + Math.exp((d-(ovDay+12))*0.8));
    const p = clamp(0.10 + 0.90*(pRise*pFall), 0, 1);

    // Basal body temperature (relative): step-up after ovulation, slight drift
    const step = 1/(1 + Math.exp(-(d-(ovDay+0.8))*2.0));
    const drift = 0.04*(d/cycleLen);
    const t = clamp(0.25 + 0.55*step + drift, 0, 1);

    estrogen.push(e);
    lh.push(l);
    progesterone.push(p);
    bbt.push(t);
  }
  return { estrogen, lh, progesterone, bbt };
}

function drawLine(ctx, xs, ys, color, width){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i=0;i<xs.length;i++){
    const x = xs[i], y = ys[i];
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.restore();
}

function rerenderHormones(){
  const canvas = document.getElementById("hormoneChart");
  const labelEl = document.getElementById("hormoneCycleLabel");
  const metaEl = document.getElementById("hormoneMeta");
  if (!canvas) return;

  const ctx0 = getCurrentCycleContext();
  if (!ctx0){
    if (labelEl) labelEl.textContent = "Noch keine Zyklus-Daten";
    if (metaEl) metaEl.textContent = "Trage Blutungstage ein, dann kann Lunacy den aktuellen Zyklus modellieren.";
    const g = canvas.getContext("2d");
    g.clearRect(0,0,canvas.width,canvas.height);
    // optional details renderer (tips.js)
    if (typeof window.renderHormoneDetails === "function") window.renderHormoneDetails(null);
    return;
  }

  const today = new Date();
  const todayISO = iso(today);
  const cycleStartISO = iso(ctx0.cycleStart);
  const dayInCycle = clamp(diffDays(ctx0.cycleStart, today) + 1, 1, ctx0.model.cycleLen);
  const ovDay = diffDays(ctx0.cycleStart, ctx0.ovuDate) + 1;

  if (labelEl) labelEl.textContent = `${formatDateDE(ctx0.cycleStart)} – (≈) ${formatDateDE(ctx0.nextStart)}`;
  if (metaEl) metaEl.textContent = `Heute: ZT ${dayInCycle}/${ctx0.model.cycleLen} • Eisprung (≈): ZT ${ovDay} (${formatDateDE(ctx0.ovuDate)}) • Start: ${formatDateDE(cycleStartISO)}`;

  const { estrogen, lh, progesterone, bbt } = buildHormoneModel(ctx0.model.cycleLen, ovDay);

  // Resize canvas to container while keeping crisp lines
  const wrap = canvas.closest(".chartWrap") || canvas.parentElement;
  const cssW = Math.max(320, Math.floor((wrap?.clientWidth || canvas.width)));
  const cssH = Math.max(280, Math.floor((wrap?.clientHeight || 420)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  const g = canvas.getContext("2d");
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,cssW,cssH);

  const styles = getComputedStyle(document.documentElement);
  const colE = styles.getPropertyValue("--curve-e").trim() || "#e7d3ff";
  const colLH = styles.getPropertyValue("--curve-lh").trim() || "#f5d36a";
  const colP = styles.getPropertyValue("--curve-p").trim() || "#b7ffdd";
  const colBBT = styles.getPropertyValue("--curve-bbt").trim() || "#ff86b1";
  const grid = styles.getPropertyValue("--line").trim() || "rgba(255,255,255,0.12)";
  const text = styles.getPropertyValue("--text").trim() || "#fff";
  const muted = styles.getPropertyValue("--muted").trim() || "rgba(255,255,255,0.7)";

  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 34;
  const W = cssW - padL - padR;
  const H = cssH - padT - padB;

  // grid + axes
  g.save();
  g.strokeStyle = grid;
  g.lineWidth = 1;
  g.globalAlpha = 1;
  for (let i=0;i<=4;i++){
    const y = padT + (H*i/4);
    g.beginPath(); g.moveTo(padL, y); g.lineTo(padL+W, y); g.stroke();
  }
  // x ticks (every ~7 days)
  const step = Math.max(5, Math.round(ctx0.model.cycleLen/4));
  for (let d=1; d<=ctx0.model.cycleLen; d+=step){
    const x = padL + W*(d-1)/(ctx0.model.cycleLen-1);
    g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT+H); g.stroke();
  }
  g.restore();

  // labels
  g.save();
  g.fillStyle = muted;
  g.font = "12px ui-sans-serif, system-ui";
  g.textAlign = "right";
  g.textBaseline = "middle";
  for (let i=0;i<=4;i++){
    const y = padT + (H*i/4);
    const v = (1 - i/4).toFixed(2);
    g.fillText(v, padL-8, y);
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  for (let d=1; d<=ctx0.model.cycleLen; d+=step){
    const x = padL + W*(d-1)/(ctx0.model.cycleLen-1);
    g.fillText("ZT " + d, x, padT+H+8);
  }
  g.restore();

  const toXY = (arr)=>{
    const xs=[]; const ys=[];
    for (let i=0;i<arr.length;i++){
      const d = i+1;
      const x = padL + W*(d-1)/(ctx0.model.cycleLen-1);
      const y = padT + H*(1-arr[i]);
      xs.push(x); ys.push(y);
    }
    return { xs, ys };
  };

  const eXY = toXY(estrogen);
  const lhXY = toXY(lh);
  const pXY = toXY(progesterone);
  const tXY = toXY(bbt);

  drawLine(g, eXY.xs, eXY.ys, colE, 3);
  drawLine(g, lhXY.xs, lhXY.ys, colLH, 3);
  drawLine(g, pXY.xs, pXY.ys, colP, 3);
  drawLine(g, tXY.xs, tXY.ys, colBBT, 2);

  // markers: ovulation + today
  const markerX = (d)=> padL + W*(d-1)/(ctx0.model.cycleLen-1);
  const drawMarker = (x, label, color)=>{
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.globalAlpha = 0.95;
    g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT+H); g.stroke();
    g.fillStyle = color;
    g.globalAlpha = 1;
    g.font = "12px ui-sans-serif, system-ui";
    g.textAlign = "left";
    g.textBaseline = "top";
    const lx = Math.min(cssW-120, Math.max(8, x+6));
    g.fillText(label, lx, 6);
    g.restore();
  };
  drawMarker(markerX(ovDay), `Eisprung (≈) • ZT ${ovDay}`, colLH);
  drawMarker(markerX(dayInCycle), `Heute • ZT ${dayInCycle}`, text);

  // optional details renderer (tips.js)
  if (typeof window.renderHormoneDetails === "function" && typeof window.computePhaseForDate === "function"){
    try{
      const info = window.computePhaseForDate(todayISO, ctx0);
      window.renderHormoneDetails({
        todayISO,
        phaseKey: info.phaseKey,
        phaseLabel: info.phaseLabel,
        dayInCycle: info.dayInCycle,
        cycleLen: info.cycleLen,
        ovText: info.ovText,
        nextText: info.nextText,
      });
    }catch(e){
      console.warn("renderHormoneDetails failed", e);
    }
  }
}

// ---------- sharing ----------
async function shareSummaryAsImage(){
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) throw new Error("Zusammenfassung nicht gefunden.");
  if (!summaryEl.innerText.trim()) throw new Error("Noch keine Zusammenfassung zum Teilen.");

  const month = document.getElementById("monthTitle")?.innerText?.trim() || "";
  const title = month ? `Lunacy – ${month}` : "Lunacy";

  const h2c = (window.html2canvas || window.html2Canvas);
  if (typeof h2c !== "function"){
    throw new Error("html2canvas fehlt.");
  }

  /* -------------------------------
     SHARE WRAP (Cosmic Card)
  -------------------------------- */
  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden","true");
  wrap.style.position = "fixed";
  wrap.style.left = "-99999px";
  wrap.style.top = "0";
  wrap.style.width = "980px";
  wrap.style.padding = "32px";
  wrap.style.borderRadius = "28px";
  wrap.style.color = "#fbf7ff";
  wrap.style.fontFamily = "ui-sans-serif, system-ui";
  wrap.style.background =
    "radial-gradient(900px 500px at 20% -10%, rgba(201,166,255,0.25), transparent 60%),"+
    "radial-gradient(700px 500px at 90% 0%, rgba(247,217,120,0.18), transparent 55%),"+
    "linear-gradient(180deg, #07051a, #140f33)";

  /* -------------------------------
     STAR CANVAS
  -------------------------------- */
  const stars = document.createElement("canvas");
  stars.width = 980;
  stars.height = 520;
  stars.style.position = "absolute";
  stars.style.inset = "0";
  stars.style.zIndex = "0";

  const sctx = stars.getContext("2d");
  sctx.fillStyle = "transparent";
  sctx.fillRect(0,0,stars.width,stars.height);

  for (let i=0;i<140;i++){
    const x = Math.random()*stars.width;
    const y = Math.random()*stars.height;
    const r = Math.random()*1.4 + 0.2;
    const a = Math.random()*0.8 + 0.2;
    sctx.beginPath();
    sctx.arc(x,y,r,0,Math.PI*2);
    sctx.fillStyle = `rgba(255,255,255,${a})`;
    sctx.fill();
  }

  wrap.appendChild(stars);

  /* -------------------------------
     HEADER (Logo + Title)
  -------------------------------- */
  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.alignItems = "center";
  head.style.gap = "16px";
  head.style.marginBottom = "20px";
  head.style.position = "relative";
  head.style.zIndex = "1";

  const img = document.createElement("img");
  img.src = "logo.png";
  img.alt = "Lunacy";
  img.style.width = "56px";
  img.style.height = "56px";
  img.style.borderRadius = "18px";
  img.style.border = "1px solid rgba(255,255,255,0.25)";
  img.style.boxShadow = "0 0 24px rgba(247,217,120,0.35)";

  const tbox = document.createElement("div");
  const t1 = document.createElement("div");
  t1.textContent = "Lunacy";
  t1.style.fontWeight = "900";
  t1.style.fontSize = "22px";
  t1.style.color = "#f7d978";

  const t2 = document.createElement("div");
  t2.textContent = month || "";
  t2.style.opacity = "0.8";
  t2.style.fontSize = "14px";

  tbox.appendChild(t1);
  tbox.appendChild(t2);

  head.appendChild(img);
  head.appendChild(tbox);

  /* -------------------------------
     CONTENT CARD
  -------------------------------- */
  const card = document.createElement("div");
  card.style.position = "relative";
  card.style.zIndex = "1";
  card.style.background = "rgba(24,16,52,0.88)";
  card.style.border = "1px solid rgba(255,255,255,0.14)";
  card.style.borderRadius = "22px";
  card.style.padding = "18px";
  card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.45)";

  const cloned = summaryEl.cloneNode(true);
  cloned.style.margin = "0";

  card.appendChild(cloned);

  wrap.appendChild(head);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  /* -------------------------------
     RENDER IMAGE
  -------------------------------- */
  const canvas = await h2c(wrap, {
    backgroundColor: null,
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
  });

  document.body.removeChild(wrap);

  const blob = await new Promise(res => canvas.toBlob(res, "image/png", 0.92));
  if (!blob) throw new Error("Bild konnte nicht erzeugt werden.");

  const filename = `lunacy_${iso(new Date())}.png`;
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files:[file] })){
    await navigator.share({ title, files:[file] });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);

  alert("Dein Browser unterstützt Teilen nicht direkt – Bild wurde heruntergeladen.");
}

// ---------- STATS ----------
function computeOvulationForCycle(periodStart, nextStart, model, notesByDate){
  const cycleEnd = addDays(nextStart, -1);

  // 1) LH+ (stärker als alles andere): Eisprung ≈ LH+1
  const lhISO = findPositiveLHInWindow(notesByDate, periodStart, cycleEnd);
  if (lhISO){
    const ovuDate = addDays(parseISO(lhISO), 1);
    const zt = diffDays(periodStart, ovuDate) + 1;
    return { ovuDate, zt, reasonCode:"LH+", reasonText:`LH+ (${formatDateDE(lhISO)}) → +1`, note: null };
  }

  // 2) Mittelschmerz: Eisprung ≈ gleicher Tag
  const ms = findMittelschmerzInWindow(notesByDate, periodStart, cycleEnd);
  if (ms){
    const ovuDate = parseISO(ms.dateISO);
    const zt = diffDays(periodStart, ovuDate) + 1;
    const side = ms.note?.side ? ` (${ms.note.side})` : "";
    const extra = ms.note?.text ? `: ${shortText(ms.note.text, 36)}` : "";
    return { ovuDate, zt, reasonCode:"MITTELSCHMERZ", reasonText:`Mittelschmerz${side}${extra}`, note: ms.note };
  }

  // 3) Zervixschleim (fadenziehend): nachrangig
  const cx = findCervixFadenziehendInWindow(notesByDate, periodStart, cycleEnd);
  if (cx){
    const ovuDate = parseISO(cx.dateISO);
    const zt = diffDays(periodStart, ovuDate) + 1;
    const extra = cx.note?.text ? `: ${shortText(cx.note.text, 36)}` : "";
    return { ovuDate, zt, reasonCode:"ZERVIX", reasonText:`Zervix (fadenziehend)${extra}`, note: cx.note };
  }

  // 4) Fallback: gelernt/Standard
  const ovuDate = addDays(periodStart, model.personalOvuOffset);
  const zt = diffDays(periodStart, ovuDate) + 1;
  return { ovuDate, zt, reasonCode:"STANDARD", reasonText:`Standard (Offset Tag ${model.personalOvuOffset+1})`, note: null };
}

// expose for stats modules
window.computeOvulationForCycle = computeOvulationForCycle;

function rerenderStats(){
  const days = loadBleedDays();
  const periods = derivePeriodsFromBleed(days);
  const settings = loadSettings();

  const statsSummary = document.getElementById("statsSummary");
  const last12 = document.getElementById("last12");

  if (!periods.length){
    statsSummary.innerHTML = '<p class="muted">Keine Daten.</p>';
    last12.innerHTML = '<p class="muted">Keine Zyklen vorhanden.</p>';
    return;
  }

  // cycle length average from last starts
  const starts = periods.slice(0, 13).map(p=>p.start).sort((a,b)=>a-b);
  const diffs=[];
  for (let i=1;i<starts.length;i++){
    const d = diffDays(starts[i-1], starts[i]);
    if (d>=15 && d<=60) diffs.push(d);
  }
  const avgCycle = diffs.length ? Math.round(diffs.reduce((s,x)=>s+x,0)/diffs.length) : settings.cycleLen;

  // period length average from bleed-derived periods
  const lens = periods.slice(0,12).map(p => diffDays(p.start, p.end)+1);
  const avgPeriod = Math.round(lens.reduce((s,x)=>s+x,0)/lens.length);

  // simple variability as std dev of diffs
  const mean = diffs.length ? (diffs.reduce((s,x)=>s+x,0)/diffs.length) : avgCycle;
  const variance = diffs.length ? diffs.reduce((s,x)=>s+(x-mean)*(x-mean),0)/diffs.length : 0;
  const stdCycle = Math.sqrt(Math.max(0, variance));
  const variability = stdCycle < 1.5 ? "sehr stabil" : stdCycle < 3.5 ? "relativ stabil" : stdCycle < 6 ? "wechselhaft" : "stark wechselhaft";

  // build model for ovulation offset
  const model = buildCalendarModel(periods, 6);
  const notesByDate = loadNotesByDate();

  statsSummary.innerHTML = `
    <div class="grid2">
      <div class="card inner"><div class="muted">Ø Zyklus</div><div class="big">${avgCycle} Tage</div></div>
      <div class="card inner"><div class="muted">Ø Periode</div><div class="big">${avgPeriod} Tage</div></div>
      <div class="card inner"><div class="muted">Schwankung (σ)</div><div class="big">${stdCycle.toFixed(1)} Tage</div></div>
      <div class="card inner"><div class="muted">Einschätzung</div><div class="big">${variability}</div></div>
      <div class="card inner" style="grid-column:1/-1;"><div class="muted">Eisprung-Offset (gelernt)</div><div class="big">Tag ${model.personalOvuOffset+1}</div></div>
    </div>
  `;

  // table last 12 cycles: start, bleed length, cycle length, ovulation day (ZT) + date
  const cycles = periods.slice(0, 12).sort((a,b)=>a.start-b.start); // old->new
  const rows = [];
  for (let i=0;i<cycles.length;i++){
    const cur = cycles[i];
    const next = (i+1 < cycles.length) ? cycles[i+1] : { start: addDays(cur.start, avgCycle) };

    const cycleLen = diffDays(cur.start, next.start);
    const bleedLen = diffDays(cur.start, cur.end) + 1;

    const ov = computeOvulationForCycle(cur.start, next.start, model, notesByDate);
    rows.push({
      start: formatDateDE(cur.start),
      bleedLen: String(bleedLen),
      cycleLen: String((cycleLen>=15 && cycleLen<=60)?cycleLen:"–"),
      ov: `ZT ${ov.zt} (${formatDateDE(ov.ovuDate)})${ov.reasonText ? " • "+escapeHtml(ov.reasonText) : ""}`,
    });
  }

  const head = `
    <div class="th">Start</div>
    <div class="th">Periode (Tage)</div>
    <div class="th">Zyklus (Tage)</div>
    <div class="th">Eisprung (Zyklustag)</div>
  `;

  const desktopCells = rows.map(r=>`
    <div class="td">${r.start}</div>
    <div class="td">${r.bleedLen}</div>
    <div class="td">${r.cycleLen}</div>
    <div class="td">${r.ov}</div>
  `).join("");

  const mobileCards = rows.map(r=>`
    <div class="rowCard">
      <div class="kv"><div class="k">Start</div><div class="v">${r.start}</div></div>
      <div class="kv"><div class="k">Periode</div><div class="v">${r.bleedLen} Tage</div></div>
      <div class="kv"><div class="k">Zyklus</div><div class="v">${r.cycleLen}</div></div>
      <div class="kv"><div class="k">Eisprung</div><div class="v">${r.ov}</div></div>
    </div>
  `).join("");

  last12.innerHTML = `<div class="tableGrid" style="grid-template-columns:1fr 1fr 1fr 2fr;">${head}${desktopCells}${mobileCards}</div>`;

  // ---- Mittelschmerz-Statistik (optional module) ----
  if (typeof window.renderMittelschmerzStats === "function"){
    try{
      window.renderMittelschmerzStats({
        periods,
        model,
        notesByDate,
        avgCycle,
        // helpers
        formatDateDE,
        diffDays,
        addDays,
        parseISO,
        between,
        escapeHtml,
        shortText,
        computeOvulationForCycle,
      });
    }catch(e){
      console.warn("renderMittelschmerzStats failed", e);
    }
  }

}

// ---------- NOTES MODAL ----------
let currentNotesDate = null;
let editingNoteId = null; // when set: we are editing an existing note

// Per note type: which subfields should be shown + which result options exist.
const NOTE_TYPE_CONFIG = {
  LH: {
    showResult: true,
    resultOptions: ["negativ","positiv","unsicher"],
    showSide: false,
    showIntensity: false,
  },
  HCG: {
    showResult: true,
    resultOptions: ["negativ","positiv","unsicher"],
    showSide: false,
    showIntensity: false,
  },
  MITTELSCHMERZ: {
    showResult: false,
    resultOptions: [],
    showSide: true,
    showIntensity: true,
  },
  ZERVIX: {
    showResult: true,
    // Simple & common categories. "fadenziehend" is important for your ovulation heuristic.
    resultOptions: ["trocken","klebrig","cremig","wässrig","fadenziehend"],
    showSide: false,
    showIntensity: false,
  },
  SCHMERZ: {
    showResult: false,
    resultOptions: [],
    showSide: true,
    showIntensity: true,
  },
  SYMPTOM: {
    showResult: false,
    resultOptions: [],
    showSide: false,
    showIntensity: false,
  },
};

function setSelectOptions(selectEl, values, keepValue){
  if (!selectEl) return;
  const cur = keepValue ? selectEl.value : "";
  const opts = ["", ...(values||[])];
  selectEl.innerHTML = opts.map(v => {
    const label = v ? v : "–";
    const val = v;
    return `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
  }).join("");
  if (keepValue && opts.includes(cur)) selectEl.value = cur;
  else selectEl.value = "";
}

function updateNoteFormFields(type){
  const cfg = NOTE_TYPE_CONFIG[type] || NOTE_TYPE_CONFIG.SYMPTOM;

  const resultEl = document.getElementById("noteResult");
  const sideEl = document.getElementById("noteSide");
  const intEl = document.getElementById("noteIntensity");

  const resultLabel = resultEl?.closest("label") || null;
  const sideLabel = sideEl?.closest("label") || null;
  const intLabel = intEl?.closest("label") || null;

  if (resultLabel){
    resultLabel.classList.toggle("hidden", !cfg.showResult);
    if (cfg.showResult){
      setSelectOptions(resultEl, cfg.resultOptions, true);
    } else {
      // keep DOM stable, but clear
      setSelectOptions(resultEl, [], false);
    }
  }

  if (sideLabel){
    sideLabel.classList.toggle("hidden", !cfg.showSide);
    if (!cfg.showSide && sideEl) sideEl.value = "";
  }

  if (intLabel){
    intLabel.classList.toggle("hidden", !cfg.showIntensity);
    if (!cfg.showIntensity && intEl) intEl.value = 0;
  }
}

function setNoteEditingState(noteOrNull){
  const submitBtn = document.querySelector("#noteForm button[type='submit']");
  const clearBtn = document.getElementById("noteClearBtn");
  if (noteOrNull){
    editingNoteId = noteOrNull.id;
    if (submitBtn) submitBtn.textContent = "Änderungen speichern";
    if (clearBtn) clearBtn.textContent = "Abbrechen";
  } else {
    editingNoteId = null;
    if (submitBtn) submitBtn.textContent = "Notiz speichern";
    if (clearBtn) clearBtn.textContent = "Eingaben leeren";
  }
}

function startEditNote(noteId){
  if (!currentNotesDate) return;
  const notesByDate = loadNotesByDate();
  const notes = notesByDate[currentNotesDate] || [];
  const n = notes.find(x => x && x.id === noteId);
  if (!n) return;

  // Fill form
  const typeEl = document.getElementById("noteType");
  const resultEl = document.getElementById("noteResult");
  const sideEl = document.getElementById("noteSide");
  const intEl = document.getElementById("noteIntensity");
  const textEl = document.getElementById("noteText");

  if (typeEl) typeEl.value = n.type || "SYMPTOM";
  updateNoteFormFields(typeEl?.value || n.type || "SYMPTOM");

  if (resultEl) resultEl.value = n.result || "";
  if (sideEl) sideEl.value = n.side || "";
  if (intEl) intEl.value = (typeof n.intensity === "number") ? n.intensity : 0;
  if (textEl) textEl.value = n.text || "";

  setNoteEditingState(n);

  // Scroll form into view (useful on mobile)
  document.getElementById("noteForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEditNote(){
  setNoteEditingState(null);
  document.getElementById("noteForm")?.reset();
  document.getElementById("noteIntensity").value = 0;
  // keep correct field visibility for the current type selection
  const type = document.getElementById("noteType")?.value || "SYMPTOM";
  updateNoteFormFields(type);
}
function labelForType(t){
  return ({ "LH":"LH-Test","HCG":"Schwangerschaftstest","MITTELSCHMERZ":"Mittelschmerz","ZERVIX":"Zervixschleim","SCHMERZ":"Schmerz","SYMPTOM":"Symptom / Notiz" }[t]||t);
}
function openNotes(dateISO){
  currentNotesDate = dateISO;
  document.getElementById("notesTitle").textContent = formatDateDE(dateISO);
  document.getElementById("notesModal").classList.remove("hidden");
  // reset form state when opening
  cancelEditNote();
  renderNotesList();
}
function closeNotes(){
  document.getElementById("notesModal").classList.add("hidden");
  currentNotesDate = null;
  setNoteEditingState(null);
}

function renderNotesList(){
  const list = document.getElementById("notesList");
  const notesByDate = loadNotesByDate();
  const notes = (notesByDate[currentNotesDate] || []).slice().sort((a,b)=>(a.createdAt<b.createdAt?1:-1));

  if (!notes.length){ list.innerHTML = '<p class="muted">Keine Notizen für diesen Tag.</p>'; return; }

  list.innerHTML = notes.map(n=>{
    const badges=[];
    if (n.result) badges.push(`Ergebnis: ${n.result}`);
    if (n.side) badges.push(`Seite: ${n.side}`);
    if (typeof n.intensity==="number" && n.intensity>0) badges.push(`Intensität: ${n.intensity}/10`);

    return `
      <div class="row">
        <div style="flex:1;">
          <div class="strong">${escapeHtml(labelForType(n.type))}</div>
          ${n.text?`<div style="margin-top:6px;">${escapeHtml(n.text)}</div>`:""}
          ${badges.length?`<div class="badges">${badges.map(b=>`<span class="badge">${escapeHtml(b)}</span>`).join("")}</div>`:""}
        </div>
        <div class="rowBtns" style="justify-content:flex-end;">
          <button class="btn small" type="button" data-edit-note="${n.id}">Bearbeiten</button>
          <button class="btn small" type="button" data-del-note="${n.id}">Löschen</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-edit-note]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-edit-note");
      if (!id) return;
      startEditNote(id);
    });
  });

  list.querySelectorAll("[data-del-note]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-del-note");
      const notesByDate = loadNotesByDate();
      notesByDate[currentNotesDate] = (notesByDate[currentNotesDate]||[]).filter(x=>x.id!==id);
      saveNotesByDate(notesByDate);
      if (editingNoteId === id) cancelEditNote();
      renderNotesList();
      rerenderCalendar();
      rerenderStats();
    });
  });

}

// ---------- CSV Import/Export ----------
function csvEscape(v){
  const s = String(v ?? "");
  if (/[\n\r",]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function toCSV(rows){
  return rows.map(r => r.map(csvEscape).join(",")).join("\n");
}

function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];
    if (inQuotes){
      if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch; continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(cur); cur = ""; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row=[]; cur=""; continue; }
    if (ch === '\r') { continue; }
    cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.filter(r => r.some(c => String(c||"").trim()!==""));
}

function exportAllToCSV(){
  const rows = [[
    "record_type","date","id","type","result","side","intensity","text","createdAt","cycleLen","periodLen","ovuDay","motherSign","fatherSign","ttc"
  ]];

  const s = loadSettings();
  rows.push([
    "SETTINGS",
    "", "", "", "", "", "", "", "",
    String(s.cycleLen),
    String(s.periodLen),
    String(s.ovuDay ?? ""),
    String(s.motherSign||""),
    String(s.fatherSign||""),
    String(!!s.ttc)
  ]);

  for (const d of loadBleedDays()){
    rows.push(["BLEED", d, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const notesByDate = loadNotesByDate();
  for (const dateISO of Object.keys(notesByDate||{}).sort()){
    for (const n of (notesByDate[dateISO]||[])){
      rows.push([
        "NOTE",
        dateISO,
        n.id||"",
        n.type||"",
        n.result||"",
        n.side||"",
        (typeof n.intensity==="number"?String(n.intensity):""),
        n.text||"",
        n.createdAt||"",
        "","","","","",""
      ]);
    }
  }

  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lunacy_export_${iso(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  document.body.removeChild(a);
}

async function importAllFromCSV(file, replaceExisting=false){
  const text = await file.text();
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("Leere Datei");
  const header = rows[0].map(h => String(h||"").trim());
  const idx = (name) => header.indexOf(name);
  const ri = {
    record_type: idx("record_type"),
    date: idx("date"),
    id: idx("id"),
    type: idx("type"),
    result: idx("result"),
    side: idx("side"),
    intensity: idx("intensity"),
    text: idx("text"),
    createdAt: idx("createdAt"),
    cycleLen: idx("cycleLen"),
    periodLen: idx("periodLen"),
    ovuDay: idx("ovuDay"),
    motherSign: idx("motherSign"),
    fatherSign: idx("fatherSign"),
    ttc: idx("ttc"),
  };

  if (ri.record_type < 0) throw new Error("CSV-Format nicht erkannt (record_type fehlt)");

  if (replaceExisting){
    localStorage.removeItem(KEY_BLEED);
    localStorage.removeItem(KEY_NOTES);
    localStorage.removeItem(KEY_SETTINGS);
  }

  // existing
  const bleed = new Set(loadBleedDays());
  const notesByDate = loadNotesByDate();
  const noteIds = new Set(Object.values(notesByDate).flat().map(n=>n.id));

  for (let r=1;r<rows.length;r++){
    const row = rows[r];
    const rt = String(row[ri.record_type]||"").trim();
    if (!rt) continue;

    if (rt === "SETTINGS"){
      const cycleLen = clamp(Number(row[ri.cycleLen]||28), 15, 60);
      const periodLen = clamp(Number(row[ri.periodLen]||5), 1, 14);
      const ovuRaw = row[ri.ovuDay];
      const ovuDay = (ovuRaw === "" || ovuRaw === null || typeof ovuRaw === "undefined") ? null : clamp(Number(ovuRaw), 6, 50);
      const motherSign = ri.motherSign >= 0 ? String(row[ri.motherSign]||"").trim() : "";
      const fatherSign = ri.fatherSign >= 0 ? String(row[ri.fatherSign]||"").trim() : "";
      const ttcRaw = (ri.ttc >= 0) ? String(row[ri.ttc]||"").trim().toLowerCase() : "";
      const ttc = (ttcRaw === "" ? true : (ttcRaw === "true" || ttcRaw === "1" || ttcRaw === "ja" || ttcRaw === "yes"));
      saveSettings({ cycleLen, periodLen, ovuDay, motherSign, fatherSign, ttc });
      continue;
    }

    if (rt === "BLEED"){
      const d = String(row[ri.date]||"").trim();
      if (d) bleed.add(d);
      continue;
    }

    if (rt === "NOTE"){
      const dateISO = String(row[ri.date]||"").trim();
      if (!dateISO) continue;
      const id = String(row[ri.id]||"").trim() || uid();
      if (noteIds.has(id)) continue;
      const note = {
        id,
        type: String(row[ri.type]||"").trim() || "SYMPTOM",
        result: String(row[ri.result]||"").trim() || null,
        side: String(row[ri.side]||"").trim() || null,
        intensity: clamp(Number(row[ri.intensity]||0), 0, 10),
        text: String(row[ri.text]||"").trim() || null,
        createdAt: String(row[ri.createdAt]||new Date().toISOString()),
      };
      notesByDate[dateISO] = notesByDate[dateISO] || [];
      notesByDate[dateISO].push(note);
      noteIds.add(id);
      continue;
    }
  }

  const filled = fillSmallGaps([...bleed].sort());
  saveBleedDays(filled);
  saveNotesByDate(notesByDate);
}

// ---------- SETTINGS UI ----------
function renderSettingsForm(){
  const s = loadSettings();
  document.getElementById("setCycleLen").value = s.cycleLen;
  document.getElementById("setPeriodLen").value = s.periodLen;
  const ttcEl = document.getElementById("setTtc");
  if (ttcEl) ttcEl.checked = !!s.ttc;
  document.getElementById("setOvuDay").value = s.ovuDay ?? "";
  const m = document.getElementById("setMotherSign");
  const f = document.getElementById("setFatherSign");
  if (m) m.value = s.motherSign || "";
  if (f) f.value = s.fatherSign || "";
}

// ---------- init ----------
function init(){
  const todayISO = iso(new Date());
  document.getElementById("bleedDate").value = todayISO;

  // nav
  document.querySelectorAll(".nav .btn").forEach(btn=>{
    btn.addEventListener("click", ()=>setView(btn.getAttribute("data-view")));
  });

  // today buttons
  document.getElementById("bleedTodayBtn").addEventListener("click", ()=>{
    const t = iso(new Date());
    const days = loadBleedDays();
    if (days.includes(t)) removeBleedDay(t);
    else addBleedDay(t);
    rerenderToday(); rerenderCalendar(); rerenderStats();
  });

  document.getElementById("bleedAddBtn").addEventListener("click", ()=>{
    const d = document.getElementById("bleedDate").value;
    if (!d) return;
    addBleedDay(d);
    rerenderToday(); rerenderCalendar(); rerenderStats();
  });

  // range add (von–bis)
  document.getElementById("bleedAddRangeBtn")?.addEventListener("click", ()=>{
    const f = document.getElementById("bleedFrom")?.value;
    const t = document.getElementById("bleedTo")?.value;
    if (!f || !t){ alert("Bitte ‘Von’ und ‘Bis’ wählen."); return; }
    addBleedRange(f, t);
    closeEditPeriod();
    rerenderToday(); rerenderCalendar(); rerenderStats();
  });

  // edit existing period
  document.getElementById("editSaveBtn")?.addEventListener("click", ()=>{
    if (!editingPeriod) return;
    const f = document.getElementById("editFrom")?.value;
    const t = document.getElementById("editTo")?.value;
    if (!f || !t){ alert("Bitte ‘Von’ und ‘Bis’ wählen."); return; }
    replaceBleedRange(editingPeriod.startISO, editingPeriod.endISO, f, t);
    closeEditPeriod();
    rerenderToday(); rerenderCalendar(); rerenderStats();
  });
  document.getElementById("editCancelBtn")?.addEventListener("click", ()=> closeEditPeriod());

  // calendar month
  document.getElementById("prevBtn").addEventListener("click", ()=>{
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
    rerenderCalendar();
  });
  document.getElementById("nextBtn").addEventListener("click", ()=>{
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1);
    rerenderCalendar();
  });

  // notes modal close
  document.querySelector("#notesModal [data-close='1']").addEventListener("click", closeNotes);
  document.getElementById("notesClose").addEventListener("click", closeNotes);

  // dynamic note subfields
  document.getElementById("noteType")?.addEventListener("change", (ev)=>{
    updateNoteFormFields(ev.target.value);
  });
  // initial config for modal (in case user opens quickly)
  updateNoteFormFields(document.getElementById("noteType")?.value || "LH");

  // note save
  document.getElementById("noteForm").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    if (!currentNotesDate) return;

    const type = document.getElementById("noteType").value;
    // Ensure visibility + options are correct even if something changed programmatically
    updateNoteFormFields(type);

    const cfg = NOTE_TYPE_CONFIG[type] || NOTE_TYPE_CONFIG.SYMPTOM;
    const result = cfg.showResult ? document.getElementById("noteResult").value : "";
    const side = cfg.showSide ? document.getElementById("noteSide").value : "";
    const intensity = cfg.showIntensity ? clamp(Number(document.getElementById("noteIntensity").value||0), 0, 10) : 0;
    const text = (document.getElementById("noteText").value||"").trim();

    const notesByDate = loadNotesByDate();
    notesByDate[currentNotesDate] = notesByDate[currentNotesDate] || [];

    if (editingNoteId){
      // update existing
      const idx = (notesByDate[currentNotesDate]||[]).findIndex(n => n && n.id === editingNoteId);
      if (idx >= 0){
        const old = notesByDate[currentNotesDate][idx];
        notesByDate[currentNotesDate][idx] = {
          ...old,
          type,
          result: (result||null),
          side: (side||null),
          intensity,
          text: (text||null),
          // keep createdAt to preserve original ordering intent
        };
      } else {
        // fallback: if not found, create new
        notesByDate[currentNotesDate].push({ id: uid(), type, result: result||null, side: side||null, intensity, text: text||null, createdAt: new Date().toISOString() });
      }
    } else {
      // create new
      notesByDate[currentNotesDate].push({ id: uid(), type, result: result||null, side: side||null, intensity, text: text||null, createdAt: new Date().toISOString() });
    }

    saveNotesByDate(notesByDate);

    ev.target.reset();
    document.getElementById("noteIntensity").value = 0;
    setNoteEditingState(null);
    updateNoteFormFields(document.getElementById("noteType")?.value || "LH");

    renderNotesList();
    rerenderCalendar();
    rerenderStats();
  });

  document.getElementById("noteClearBtn")?.addEventListener("click", ()=>{
    if (editingNoteId){
      cancelEditNote();
      return;
    }
    document.getElementById("noteForm")?.reset();
    document.getElementById("noteIntensity").value = 0;
    updateNoteFormFields(document.getElementById("noteType")?.value || "LH");
  });

  // share: calendar summary as image
  document.getElementById("shareSummaryBtn")?.addEventListener("click", async ()=>{
    try{
      await shareSummaryAsImage();
    }catch(e){
      console.error(e);
      alert("Teilen fehlgeschlagen: " + (e?.message || String(e)));
    }
  });

  // settings form
  document.getElementById("settingsForm").addEventListener("submit", (ev)=>{
    ev.preventDefault();
    const cycleLen = clamp(Number(document.getElementById("setCycleLen").value||28), 15, 60);
    const periodLen = clamp(Number(document.getElementById("setPeriodLen").value||5), 1, 14);
    const ttc = !!document.getElementById("setTtc")?.checked;
    const ovuRaw = document.getElementById("setOvuDay").value;
    const ovuDay = (ovuRaw === "" || ovuRaw === null) ? null : clamp(Number(ovuRaw), 6, 50);
    const motherSign = String(document.getElementById("setMotherSign")?.value||"").trim();
    const fatherSign = String(document.getElementById("setFatherSign")?.value||"").trim();
    saveSettings({ cycleLen, periodLen, ovuDay, motherSign, fatherSign, ttc });
    alert("Einstellungen gespeichert.");
    rerenderCalendar(); rerenderStats(); rerenderToday(); rerenderHormones();
  });

  // CSV export/import
  document.getElementById("exportCsvBtn")?.addEventListener("click", ()=>{
    exportAllToCSV();
  });

  document.getElementById("importCsvFile")?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0] || null;
    if (!file) return;
    try{
      const replace = !!document.getElementById("importReplace")?.checked;
      await importAllFromCSV(file, replace);
      alert("Import abgeschlossen.");
      ev.target.value = "";
      rerenderToday(); rerenderCalendar(); rerenderStats();
    }catch(e){
      console.error(e);
      alert("Import fehlgeschlagen: " + (e?.message || String(e)));
      ev.target.value = "";
    }
  });

  document.getElementById("resetDataBtn").addEventListener("click", ()=>{
    if (!confirm("Wirklich ALLE Daten löschen (Blutungstage/Notizen/Einstellungen)?")) return;
    localStorage.removeItem(KEY_BLEED);
    localStorage.removeItem(KEY_NOTES);
    localStorage.removeItem(KEY_SETTINGS);
    rerenderToday(); rerenderCalendar(); rerenderStats(); rerenderHormones();
  });

  // initial
  rerenderToday();
  rerenderCalendar();
  rerenderStats();
  rerenderHormones();
  setView("today");
}

document.addEventListener("DOMContentLoaded", init);
