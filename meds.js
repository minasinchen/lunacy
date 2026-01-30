// meds.js — Medi-/Supplement-Checkliste (Kalender + Settings)
// Mobile-first, lokal (localStorage), neutral formuliert.
//
// Features:
// - Presets (Standard-Liste)
// - Multi-Select Dropdown mit Suche (✅ anchecken) – Auswahl bleibt trotz Suche erhalten
// - Kompakte "Deine Liste" (1 Zeile pro Medi) + Overlay/Modal für Details
// - Kalender-Kachel im #summary (nur wenn aktiviert)
// - Letzte 7 Tage (Übersicht + rückgängig/ändern pro Tag)
// - Export/Import (nur Medi-Daten: Plan + Log)
//
// Storage:
// - pt_med_settings_v1 (Plan/Items/UI-State)
// - pt_med_log_v1 (Checkbox-Log)
//
// Exposes: window.Meds = { loadSettings, saveSettings, loadLog, saveLog, renderSettingsUI, renderCalendarTile }

(function(){
  "use strict";

  const KEY_MED_SETTINGS = "pt_med_settings_v1";
  const KEY_MED_LOG = "pt_med_log_v1";

  const SLOT_DEFS = {
    MORNING_EMPTY_STOMACH: { label:"morgens nüchtern", short:"nüchtern", order:10 },
    MORNING:              { label:"morgens",          short:"morgens", order:20 },
    MIDDAY:               { label:"mittags",          short:"mittags", order:30 },
    EVENING:              { label:"abends",           short:"abends", order:40 },
    BEDTIME:              { label:"vor dem Schlafen", short:"nachts",  order:50 },
  };

  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

  function safeParse(s, fallback){ try{ return JSON.parse(s); }catch(e){ return fallback; } }
  function load(key, fallback){
    const raw = localStorage.getItem(key);
    return (raw===null || raw===undefined) ? fallback : safeParse(raw, fallback);
  }
  function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  function uid(){ return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16); }
  function iso(d){ return new Date(d).toISOString().slice(0,10); }
  function parseISO(s){ return new Date(String(s).slice(0,10)+"T00:00:00"); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function fmtDateDE(dateISO){
    const d = parseISO(dateISO);
    return d.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});
  }
  function escapeHtml(str){
    return String(str??"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  // ---------------- Presets ----------------
  const PRESETS = [
    { id:"lthyroxin", name:"L-Thyroxin", icon:"💊", cat:"Schilddrüse", schedule:{ type:"DAILY", slots:["MORNING_EMPTY_STOMACH"] }, note:"danach 30 Min warten" },

    { id:"vitd_5", name:"Vitamin D (alle 5 Tage)", icon:"🔆", cat:"Basics", schedule:{ type:"EVERY_N_DAYS", everyDays:5, preferredSlot:"MORNING", anchorStart:null }, note:"" },
    { id:"vitd_weekly", name:"Vitamin D (wöchentlich)", icon:"🔆", cat:"Basics", schedule:{ type:"EVERY_N_DAYS", everyDays:7, preferredSlot:"MORNING", anchorStart:null }, note:"" },
    { id:"b12_weekly", name:"Vitamin B12 (wöchentlich)", icon:"🔷", cat:"Basics", schedule:{ type:"EVERY_N_DAYS", everyDays:7, preferredSlot:"MORNING", anchorStart:null }, note:"" },
    { id:"b12_daily", name:"Vitamin B12", icon:"🔷", cat:"Basics", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },
    { id:"folate", name:"Folat / Folsäure", icon:"🌿", cat:"Basics", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },
    { id:"omega3", name:"Omega-3", icon:"🐟", cat:"Basics", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"zu einer Mahlzeit" },
    { id:"probiotic", name:"Probiotikum", icon:"🦠", cat:"Darm", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },
    { id:"vitc", name:"Vitamin C", icon:"🍊", cat:"Basics", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"" },
    { id:"k2", name:"Vitamin K2", icon:"🟩", cat:"Basics", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"" },
    { id:"electrolytes", name:"Elektrolyte", icon:"💧", cat:"Basics", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"optional bei Sport" },

    { id:"magnesium", name:"Magnesium", icon:"🌙", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["EVENING"] }, note:"" },
    { id:"iron", name:"Eisen", icon:"🩸", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"nicht zusammen mit Calcium/Magnesium" },
    { id:"zinc", name:"Zink", icon:"💠", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["EVENING"] }, note:"" },
    { id:"selenium", name:"Selen", icon:"⚪️", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },
    { id:"iodine", name:"Jod", icon:"🧂", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },
    { id:"calcium", name:"Calcium", icon:"🦴", cat:"Mineralstoffe", schedule:{ type:"DAILY", slots:["EVENING"] }, note:"Abstand zu L-Thyroxin/Eisen" },

    { id:"myo_inositol", name:"Myo-Inositol (2× täglich)", icon:"✨", cat:"Zyklus", schedule:{ type:"DAILY", slots:["MORNING","EVENING"] }, note:"" },
    { id:"coq10", name:"CoQ10", icon:"⚡", cat:"Zyklus", schedule:{ type:"DAILY", slots:["MIDDAY"] }, note:"" },
    { id:"nac", name:"NAC", icon:"🧩", cat:"Zyklus", schedule:{ type:"DAILY", slots:["MORNING"] }, note:"" },

    { id:"melatonin", name:"Melatonin", icon:"🌙", cat:"Schlaf", schedule:{ type:"DAILY", slots:["BEDTIME"] }, note:"" },
    { id:"ltheanine", name:"L-Theanin", icon:"🫧", cat:"Schlaf", schedule:{ type:"DAILY", slots:["EVENING"] }, note:"" },

    { id:"fiber", name:"Flohsamenschalen", icon:"🌾", cat:"Darm", schedule:{ type:"DAILY", slots:["EVENING"] }, note:"mit viel Wasser" },
  ];
  const PRESET_BY_ID = Object.fromEntries(PRESETS.map(p=>[p.id,p]));

  // ---------------- Storage models + self-heal ----------------
  function normalizeSettings(s){
    const base = (s && typeof s==="object") ? s : {};
    let items = Array.isArray(base.items) ? base.items : [];
    items = items.filter(it=>it && it.id).map(it=>{
      const p = PRESET_BY_ID[it.id];
      const out = Object.assign({}, it);
      if (out.active === undefined) out.active = true;
      if ((!out.name || !String(out.name).trim()) && p) out.name = p.name;
      if ((!out.icon || !String(out.icon).trim()) && p) out.icon = p.icon || "💊";
      if ((!out.cat  || !String(out.cat).trim())  && p) out.cat  = p.cat || "";
      if ((out.note===undefined || out.note===null) && p) out.note = p.note || "";

      // schedule normalize
      const sched = (out.schedule && typeof out.schedule==="object") ? out.schedule : (p ? JSON.parse(JSON.stringify(p.schedule||{})) : {});
      const type = String(sched.type || "DAILY");
      if (type === "EVERY_N_DAYS"){
        out.schedule = {
          type:"EVERY_N_DAYS",
          everyDays: Math.max(1, Math.min(60, Number(sched.everyDays || p?.schedule?.everyDays || 5))),
          preferredSlot: String(sched.preferredSlot || p?.schedule?.preferredSlot || "MORNING"),
          anchorStart: sched.anchorStart || null,
        };
      } else {
        const slots = Array.isArray(sched.slots) ? sched.slots.filter(Boolean) : (p?.schedule?.slots || ["MORNING"]);
        out.schedule = { type:"DAILY", slots: slots.length ? slots : ["MORNING"] };
      }
      return out;
    });

    const ui = Object.assign({ presetQuery:"", selectedPresetIds:null }, base.ui||{});
    if (!Array.isArray(ui.selectedPresetIds)) ui.selectedPresetIds = items.map(x=>x.id);

    return { enabled: !!base.enabled, items, ui };
  }

  function loadSettings(){ return normalizeSettings(load(KEY_MED_SETTINGS, { enabled:false, items:[], ui:{} })); }
  function saveSettings(s){ save(KEY_MED_SETTINGS, normalizeSettings(s)); }

  function loadLog(){ return load(KEY_MED_LOG, { events:[] }); }
  function saveLog(l){ save(KEY_MED_LOG, (l && typeof l==="object") ? l : { events:[] }); }

  function addEvent(itemId, dateISO, slot){
    const l = loadLog();
    l.events = Array.isArray(l.events) ? l.events : [];
    l.events.push({ id: uid(), itemId, dateISO, slot, doneAt: new Date().toISOString() });
    saveLog(l);
  }
  function hasEvent(itemId, dateISO, slot){
    const evs = (loadLog().events||[]);
    return evs.some(e=>e && e.itemId===itemId && e.dateISO===dateISO && e.slot===slot);
  }
  function clearDaySlot(itemId, dateISO, slot){
    const l = loadLog();
    l.events = (l.events||[]).filter(e => !(e.itemId===itemId && e.dateISO===dateISO && e.slot===slot));
    saveLog(l);
  }

  // ---------------- Scheduling ----------------
  function lastEventOnOrBefore(itemId, dateISO){
    const evs = (loadLog().events||[]);
    let last = null;
    for (const e of evs){
      if (!e || e.itemId !== itemId) continue;
      if (e.dateISO <= dateISO){
        if (!last || e.dateISO > last) last = e.dateISO;
      }
    }
    return last;
  }
  function nextOccurrenceFromAnchor(anchorISO, everyDays, fromISO){
    const anchor = parseISO(anchorISO);
    const from = parseISO(fromISO);
    if (from < anchor) return iso(anchor);
    const diff = Math.floor((from - anchor) / (24*3600*1000));
    const mod = diff % everyDays;
    if (mod === 0) return fromISO;
    return iso(addDays(from, everyDays - mod));
  }
  function everyNDaysStatus(item, dateISO){
    const every = Math.max(1, Number(item.schedule?.everyDays||1));
    const slot = item.schedule?.preferredSlot || "MORNING";

    const done = hasEvent(item.id, dateISO, slot);
    const last = lastEventOnOrBefore(item.id, dateISO);
    const anchorISO = item.schedule?.anchorStart || null;

    const lastBefore = (last && last < dateISO) ? last : (done ? null : last);
    let dueISO = null;
    if (lastBefore) dueISO = iso(addDays(parseISO(lastBefore), every));
    else if (anchorISO) dueISO = nextOccurrenceFromAnchor(anchorISO, every, dateISO);
    else dueISO = dateISO;

    const due = (dateISO >= dueISO) && !done;
    const nextDueIfTakenToday = iso(addDays(parseISO(dateISO), every));

    return { type:"EVERY_N_DAYS", everyDays: every, slot, done, due, dueISO, nextDueIfTakenToday };
  }

  function tasksForDate(dateISO){
    const s = loadSettings();
    if (!s.enabled) return [];
    const out = [];
    for (const it of (s.items||[])){
      if (!it || !it.active) continue;
      const sched = it.schedule || { type:"DAILY", slots:["MORNING"] };

      if (sched.type === "EVERY_N_DAYS"){
        const st = everyNDaysStatus(it, dateISO);
        if (st.due || st.done){
          out.push({ item: it, slot: st.slot, meta: st });
        }
        continue;
      }

      const slots = Array.isArray(sched.slots) ? sched.slots : [];
      for (const slot of slots){
        const done = hasEvent(it.id, dateISO, slot);
        out.push({ item: it, slot, meta: { type:"DAILY", done } });
      }
    }
    out.sort((a,b)=>{
      const oa = SLOT_DEFS[a.slot]?.order ?? 999;
      const ob = SLOT_DEFS[b.slot]?.order ?? 999;
      if (oa!==ob) return oa-ob;
      return String(a.item.name||"").localeCompare(String(b.item.name||""),"de");
    });
    return out;
  }

  function scheduleBrief(it){
    const sched = it.schedule || { type:"DAILY", slots:["MORNING"] };
    if (sched.type==="EVERY_N_DAYS"){
      const n = Number(sched.everyDays||1);
      const slot = SLOT_DEFS[sched.preferredSlot||"MORNING"]?.short || "morgens";
      return `alle ${n} Tage · ${slot}`;
    }
    const slots = Array.isArray(sched.slots) ? sched.slots : [];
    const nice = slots.slice().sort((a,b)=>(SLOT_DEFS[a]?.order??999)-(SLOT_DEFS[b]?.order??999))
      .map(s=>SLOT_DEFS[s]?.short || s);
    return `täglich · ${nice.join(", ") || "–"}`;
  }

  // ---------------- Navigation helper ----------------
  function goToSettings(){
    const btn = document.querySelector(".tabBtn[data-view='settings'], .mTab[data-view='settings']");
    if (btn) btn.click();
    else if (typeof window.setView==="function") window.setView("settings");
  }

  // ---------------- Modal: Details ----------------
  const MODAL_ID = "medsModal";
  function ensureModal(){
    if (document.getElementById(MODAL_ID)) return;
    const modal = document.createElement("div");
    modal.className = "modal hidden medsModal";
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="modalBackdrop" data-close="1"></div>
      <div class="modalCard">
        <div class="modalHeader">
          <div>
            <div class="muted" style="font-size:12px;">Medi-Details</div>
            <div class="strong" id="medsModalTitle">–</div>
          </div>
          <button class="btn small" type="button" id="medsModalClose">Schließen</button>
        </div>
        <div id="medsModalBody" style="margin-top:12px;"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("[data-close='1']")?.addEventListener("click", closeModal);
    modal.querySelector("#medsModalClose")?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (ev)=>{
      if (ev.key==="Escape" && !modal.classList.contains("hidden")) closeModal();
    });
  }
  function closeModal(){
    const m = document.getElementById(MODAL_ID);
    if (!m) return;
    m.classList.add("hidden");
    document.body.classList.remove("modalOpen");
  }

  function openModalForItem(itemId){
    ensureModal();
    const s = loadSettings();
    const it = (s.items||[]).find(x=>x.id===itemId);
    if (!it) return;

    $("#medsModalTitle").textContent = it.name || "Details";
    const body = $("#medsModalBody");

    const slotOptions = Object.keys(SLOT_DEFS)
      .sort((a,b)=>SLOT_DEFS[a].order - SLOT_DEFS[b].order)
      .map(k=>`<option value="${k}">${escapeHtml(SLOT_DEFS[k].label)}</option>`).join("");

    const type = it.schedule?.type || "DAILY";
    const everyDays = Number(it.schedule?.everyDays||5);
    const prefSlot = it.schedule?.preferredSlot || "MORNING";
    const slots = Array.isArray(it.schedule?.slots) ? it.schedule.slots : ["MORNING"];
    const note = it.note || "";

    body.innerHTML = `
      <div class="medsModalGrid">
        <label>Typ
          <select id="medEditType">
            <option value="DAILY">Täglich</option>
            <option value="EVERY_N_DAYS">Alle N Tage</option>
          </select>
        </label>

        <label id="medEditEveryWrap">Alle (Tage)
          <input type="number" min="1" max="60" id="medEditEvery" value="${everyDays}">
        </label>

        <label id="medEditSlotsWrap">Slots
          <div class="medsSlotChips" id="medEditSlots"></div>
          <div class="muted" style="font-size:12px;margin-top:6px;">Tippe Slots an/aus.</div>
        </label>

        <label id="medEditPrefWrap">Slot (für „Alle N Tage“)
          <select id="medEditPref">${slotOptions}</select>
        </label>

        <label>Notiz (optional)
          <input type="text" id="medEditNote" value="${escapeHtml(note)}" placeholder="z. B. Abstand / Essen / Hinweis">
        </label>

        <div class="rowBtns" style="justify-content:flex-end;">
          <button class="btn" type="button" id="medEditSave">Speichern</button>
          <button class="btn small" type="button" id="medEditRemove">Entfernen</button>
        </div>
      </div>
    `;

    $("#medEditType").value = type;
    $("#medEditEvery").value = String(everyDays);
    $("#medEditPref").value = prefSlot;

    const slotWrap = $("#medEditSlots");
    slotWrap.innerHTML = Object.keys(SLOT_DEFS).sort((a,b)=>SLOT_DEFS[a].order - SLOT_DEFS[b].order).map(k=>{
      const on = slots.includes(k);
      return `<button type="button" class="medsChip ${on?"on":""}" data-slot="${k}">${escapeHtml(SLOT_DEFS[k].short)}</button>`;
    }).join("");
    slotWrap.querySelectorAll("[data-slot]").forEach(btn=>btn.addEventListener("click", ()=>btn.classList.toggle("on")));

    function applyTypeVisibility(){
      const t = $("#medEditType").value;
      $("#medEditEveryWrap").classList.toggle("hidden", t!=="EVERY_N_DAYS");
      $("#medEditPrefWrap").classList.toggle("hidden", t!=="EVERY_N_DAYS");
      $("#medEditSlotsWrap").classList.toggle("hidden", t!=="DAILY");
    }
    $("#medEditType").addEventListener("change", applyTypeVisibility);
    applyTypeVisibility();

    $("#medEditSave").addEventListener("click", ()=>{
      const s2 = loadSettings();
      const idx = (s2.items||[]).findIndex(x=>x.id===itemId);
      if (idx<0) return;

      const t = $("#medEditType").value;
      const note2 = ($("#medEditNote").value||"").trim();
      const updated = Object.assign({}, s2.items[idx], { note: note2 });

      if (t==="EVERY_N_DAYS"){
        const n = Math.max(1, Math.min(60, Number($("#medEditEvery").value||1)));
        const pref = $("#medEditPref").value || "MORNING";
        updated.schedule = { type:"EVERY_N_DAYS", everyDays:n, preferredSlot:pref, anchorStart: updated.schedule?.anchorStart || null };
      } else {
        const chosen = $$(".medsChip.on", slotWrap).map(b=>b.getAttribute("data-slot")).filter(Boolean);
        updated.schedule = { type:"DAILY", slots: chosen.length?chosen:["MORNING"] };
      }

      s2.items[idx] = updated;
      // keep ui selection in sync
      s2.ui = s2.ui || {};
      if (!Array.isArray(s2.ui.selectedPresetIds)) s2.ui.selectedPresetIds = s2.items.map(x=>x.id);
      saveSettings(s2);

      renderSettingsUI();
      try{ renderCalendarTile(); }catch(e){}
      closeModal();
    });

    $("#medEditRemove").addEventListener("click", ()=>{
      const s2 = loadSettings();
      s2.items = (s2.items||[]).filter(x=>x.id!==itemId);
      s2.ui = s2.ui || {};
      s2.ui.selectedPresetIds = (s2.ui.selectedPresetIds||[]).filter(id=>id!==itemId);
      saveSettings(s2);

      renderSettingsUI();
      try{ renderCalendarTile(); }catch(e){}
      closeModal();
    });

    $("#"+MODAL_ID).classList.remove("hidden");
    document.body.classList.add("modalOpen");
  }

  // ---------------- Modal: Day editor (undo) ----------------
  const DAY_MODAL_ID = "medsDayModal";
  function ensureDayModal(){
    if (document.getElementById(DAY_MODAL_ID)) return;
    const modal = document.createElement("div");
    modal.id = DAY_MODAL_ID;
    modal.className = "modal hidden medsDayModal";
    modal.innerHTML = `
      <div class="modalBackdrop" data-close="1"></div>
      <div class="modalCard">
        <div class="modalHeader">
          <div>
            <div class="muted" style="font-size:12px;">Letzte 7 Tage</div>
            <div class="strong" id="medsDayTitle">–</div>
          </div>
          <button class="btn small" type="button" id="medsDayClose">Schließen</button>
        </div>
        <div id="medsDayBody" style="margin-top:12px;"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("[data-close='1']")?.addEventListener("click", ()=>modal.classList.add("hidden"));
    modal.querySelector("#medsDayClose")?.addEventListener("click", ()=>modal.classList.add("hidden"));
  }

  function openDayEditor(dateISO){
    ensureDayModal();
    const modal = document.getElementById(DAY_MODAL_ID);
    const title = $("#medsDayTitle", modal);
    const body = $("#medsDayBody", modal);
    title.textContent = `Medi-Log · ${fmtDateDE(dateISO)}`;

    const tasks = tasksForDate(dateISO);
    const groups = {};
    for (const t of tasks){
      const k = t.slot || "MORNING";
      (groups[k] = groups[k] || []).push(t);
    }
    const slotKeys = Object.keys(groups).sort((a,b)=>(SLOT_DEFS[a]?.order??999)-(SLOT_DEFS[b]?.order??999));

    body.innerHTML = `
      <div class="muted" style="font-size:12px;margin-bottom:10px;">Häkchen aus = rückgängig.</div>
      ${slotKeys.map(sk=>{
        const slotLabel = SLOT_DEFS[sk]?.label || sk;
        return `
          <div class="medsCalGroup">
            <div class="medsCalGroupTitle">${escapeHtml(slotLabel)}</div>
            <div class="medsCalList">
              ${groups[sk].map(t=>{
                const done = hasEvent(t.item.id, dateISO, t.slot);
                return `
                  <label class="medsCalRow ${done?"done":""}">
                    <input type="checkbox" data-med-day="1" data-day="${escapeHtml(dateISO)}" data-item="${escapeHtml(t.item.id)}" data-slot="${escapeHtml(t.slot)}" ${done?"checked":""}>
                    <span class="medsCalName">${escapeHtml(t.item.icon||"💊")} ${escapeHtml(t.item.name||"(ohne Name)")}</span>
                  </label>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    `;

    $$("[data-med-day]", modal).forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const day = cb.getAttribute("data-day");
        const id = cb.getAttribute("data-item");
        const slot = cb.getAttribute("data-slot");
        if (!day || !id || !slot) return;
        if (cb.checked) addEvent(id, day, slot);
        else clearDaySlot(id, day, slot);
        openDayEditor(day);
        try{ renderCalendarTile(); }catch(e){}
      });
    });

    modal.classList.remove("hidden");
  }

  // ---------------- Settings UI ----------------
  const SETTINGS_CARD_ID = "medsSettingsCard";

  function upsertPreset(p){
    const s = loadSettings();
    s.items = Array.isArray(s.items) ? s.items : [];
    const idx = s.items.findIndex(x=>x.id===p.id);
    if (idx>=0){
      s.items[idx] = Object.assign({}, s.items[idx], { active:true });
    } else {
      s.items.push({
        id: p.id,
        name: p.name,
        icon: p.icon || "💊",
        cat: p.cat || "",
        active: true,
        schedule: JSON.parse(JSON.stringify(p.schedule || { type:"DAILY", slots:["MORNING"] })),
        note: p.note || ""
      });
    }
    // sync ui selection
    s.ui = s.ui || {};
    const arr = Array.isArray(s.ui.selectedPresetIds) ? s.ui.selectedPresetIds.slice() : [];
    if (!arr.includes(p.id)) arr.push(p.id);
    s.ui.selectedPresetIds = arr;
    saveSettings(s);
  }

  function syncToSelected(selectedIds){
    const s = loadSettings();
    const keep = new Set(selectedIds);

    for (const id of selectedIds){
      const p = PRESET_BY_ID[id];
      if (!p) continue;
      const exists = (s.items||[]).some(it=>it.id===id);
      if (!exists) s.items.push({
        id: p.id, name:p.name, icon:p.icon||"💊", cat:p.cat||"", active:true,
        schedule: JSON.parse(JSON.stringify(p.schedule || { type:"DAILY", slots:["MORNING"] })),
        note: p.note || ""
      });
    }

    s.items = (s.items||[]).filter(it=>{
      const isPreset = !!PRESET_BY_ID[it.id];
      return isPreset ? keep.has(it.id) : true;
    });

    s.ui = s.ui || {};
    s.ui.selectedPresetIds = selectedIds.slice();
    saveSettings(s);
  }

  function exportMeds(){
    const payload = {
      schema: "lunacy-meds-v1",
      exportedAt: new Date().toISOString(),
      settings: loadSettings(),
      log: loadLog(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lunacy_meds_${iso(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }

  async function importMedsFromFile(file, replace){
    const txt = await file.text();
    const obj = safeParse(txt, null);
    if (!obj || obj.schema !== "lunacy-meds-v1" || !obj.settings || !obj.log){
      alert("Ungültige Medi-Datei.");
      return;
    }
    if (replace){
      saveSettings(obj.settings);
      saveLog(obj.log);
    } else {
      // merge: settings by id, log by event id
      const curS = loadSettings();
      const incS = normalizeSettings(obj.settings);
      const byId = new Map((curS.items||[]).map(x=>[x.id,x]));
      for (const it of (incS.items||[])) byId.set(it.id, it);
      curS.enabled = incS.enabled || curS.enabled;
      curS.items = Array.from(byId.values());
      curS.ui = Object.assign({}, curS.ui||{}, incS.ui||{});
      saveSettings(curS);

      const curL = loadLog();
      const incL = (obj.log && typeof obj.log==="object") ? obj.log : { events:[] };
      const seen = new Set((curL.events||[]).map(e=>e.id));
      for (const e of (incL.events||[])){
        if (e && e.id && !seen.has(e.id)){
          seen.add(e.id);
          curL.events.push(e);
        }
      }
      saveLog(curL);
    }
    alert("Medi-Daten importiert.");
  }

  function renderSettingsUI(){
    const form = document.getElementById("settingsForm");
    if (!form) return;

    let card = document.getElementById(SETTINGS_CARD_ID);
    if (!card){
      card = document.createElement("div");
      card.id = SETTINGS_CARD_ID;
      card.className = "card inner medsCard";
      form.appendChild(card);
    }

    const s = loadSettings();
    const enabled = !!s.enabled;
    const q = String(s.ui?.presetQuery||"");
    const selectedIds = Array.isArray(s.ui?.selectedPresetIds) ? s.ui.selectedPresetIds.slice() : (s.items||[]).map(x=>x.id);
    const selectedSet = new Set(selectedIds);

    const qLow = q.toLowerCase().trim();
    const filtered = PRESETS
      .filter(p=>{
        if (!qLow) return true;
        return (p.name||"").toLowerCase().includes(qLow) || (p.cat||"").toLowerCase().includes(qLow);
      })
      .sort((a,b)=>{
        const ca=String(a.cat||""), cb=String(b.cat||"");
        if (ca!==cb) return ca.localeCompare(cb,"de");
        return String(a.name||"").localeCompare(String(b.name||""),"de");
      });

    const myItems = (s.items||[]).slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"de"));

    card.innerHTML = `
      <div class="row" style="background:transparent;border:none;padding:0;">
        <div style="flex:1;">
          <div class="strong">💊 Medi-Checkliste</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">Optional: hilft nur beim Überblick (lokal, offline).</div>
        </div>
        <label class="inlineCheck" style="margin:0;">
          <input type="checkbox" id="medsEnableToggle" ${enabled?"checked":""}>
          Aktiv
        </label>
      </div>

      <div class="${enabled?"":"hidden"}" id="medsSettingsBody" style="margin-top:12px;">
        <details class="medsDropdown" id="medsPresetDropdown">
          <summary class="btn medsDropBtn">Vorlagen auswählen <span class="medsDropMeta">${selectedIds.length?`${selectedIds.length} gewählt`:""}</span></summary>
          <div class="medsDropPanel">
            <input type="text" class="medsSearch" id="medsPresetSearch" placeholder="Suchen… (z. B. magnesium, vitamin, schilddrüse)" value="${escapeHtml(q)}">
            <div class="medsPresetList" id="medsPresetList">
              ${filtered.map(p=>{
                const on = selectedSet.has(p.id);
                const meta = p.cat ? `<span class="medsPresetCat">${escapeHtml(p.cat)}</span>` : "";
                return `
                  <label class="medsPresetOpt" data-opt="1">
                    <input type="checkbox" data-preset="${p.id}" ${on?"checked":""}>
                    <span class="medsPresetName">${escapeHtml(p.icon||"💊")} ${escapeHtml(p.name)}</span>
                    ${meta}
                  </label>
                `;
              }).join("")}
            </div>
            <div class="rowBtns" style="justify-content:space-between;margin-top:10px;gap:8px;flex-wrap:wrap;">
              <button class="btn small" type="button" id="medsPresetApply">Auswahl übernehmen</button>
              <div class="rowBtns" style="gap:8px;flex-wrap:wrap;">
                <button class="btn small" type="button" id="medsExportBtn">Export</button>
                <button class="btn small" type="button" id="medsImportBtn">Import…</button>
                <label class="inlineCheck" style="margin:0;">
                  <input type="checkbox" id="medsImportReplace" checked>
                  Ersetzen
                </label>
              </div>
            </div>
            <input type="file" id="medsImportFile" accept="application/json,.json" class="hidden" />
          </div>
        </details>

        <div class="medsListHeader">
          <div class="muted" style="font-size:12px;">Deine Liste</div>
          <button class="btn small" type="button" id="medsClearAll" ${myItems.length? "": "disabled"}>Alles entfernen</button>
        </div>

        <div class="medsMyList">
          ${myItems.length ? myItems.map(it=>{
            const brief = scheduleBrief(it);
            return `
              <div class="medsLine" role="button" tabindex="0" data-med-edit="${escapeHtml(it.id)}">
                <div class="medsLineLeft">
                  <span class="medsLineIcon">${escapeHtml(it.icon||"💊")}</span>
                  <span class="medsLineName">${escapeHtml(it.name||"(ohne Name)")}</span>
                </div>
                <div class="medsLineRight">
                  <span class="medsLineMeta">${escapeHtml(brief)}</span>
                  <span class="medsLineChevron">›</span>
                </div>
              </div>
            `;
          }).join("") : `<div class="muted" style="font-size:12px;">Noch nichts ausgewählt. Öffne „Vorlagen auswählen“ und hake an, was du nutzen willst.</div>`}
        </div>
      </div>
    `;

    $("#medsEnableToggle", card)?.addEventListener("change", (ev)=>{
      const s2 = loadSettings();
      s2.enabled = !!ev.target.checked;
      saveSettings(s2);
      renderSettingsUI();
      try{ renderCalendarTile(); }catch(e){}
      if (typeof window.rerenderCalendar==="function") try{ window.rerenderCalendar(); }catch(e){}
    });

    $("#medsPresetSearch", card)?.addEventListener("input", (ev)=>{
      const s2 = loadSettings();
      s2.ui = s2.ui || {};
      s2.ui.presetQuery = String(ev.target.value||"");
      if (!Array.isArray(s2.ui.selectedPresetIds)) s2.ui.selectedPresetIds = (s2.items||[]).map(x=>x.id);
      saveSettings(s2);
      renderSettingsUI();
      $("#medsPresetDropdown")?.setAttribute("open","open");
      $("#medsPresetSearch")?.focus();
      try{ $("#medsPresetSearch").setSelectionRange(9999,9999); }catch(e){}
    });

    $$("[data-preset]", card).forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const id = cb.getAttribute("data-preset");
        if (!id) return;
        const s2 = loadSettings();
        s2.ui = s2.ui || {};
        let arr = Array.isArray(s2.ui.selectedPresetIds) ? s2.ui.selectedPresetIds.slice() : (s2.items||[]).map(x=>x.id);
        if (cb.checked){
          if (!arr.includes(id)) arr.push(id);
        } else {
          arr = arr.filter(x=>x!==id);
        }
        s2.ui.selectedPresetIds = arr;
        saveSettings(s2);
        renderSettingsUI();
        $("#medsPresetDropdown")?.setAttribute("open","open");
      });
    });

    $("#medsPresetApply", card)?.addEventListener("click", ()=>{
      const s2 = loadSettings();
      const arr = Array.isArray(s2.ui?.selectedPresetIds) ? s2.ui.selectedPresetIds.slice() : (s2.items||[]).map(x=>x.id);
      syncToSelected(arr);
      renderSettingsUI();
      try{ renderCalendarTile(); }catch(e){}
      if (typeof window.rerenderCalendar==="function") try{ window.rerenderCalendar(); }catch(e){}
      $("#medsPresetDropdown")?.removeAttribute("open");
    });

    $("#medsClearAll", card)?.addEventListener("click", ()=>{
      const s2 = loadSettings();
      s2.items = [];
      s2.ui = s2.ui || {};
      s2.ui.selectedPresetIds = [];
      saveSettings(s2);
      renderSettingsUI();
      try{ renderCalendarTile(); }catch(e){}
      if (typeof window.rerenderCalendar==="function") try{ window.rerenderCalendar(); }catch(e){}
    });

    $("#medsExportBtn", card)?.addEventListener("click", exportMeds);
    $("#medsImportBtn", card)?.addEventListener("click", ()=> $("#medsImportFile", card)?.click());
    $("#medsImportFile", card)?.addEventListener("change", async (ev)=>{
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try{
        const replace = !!$("#medsImportReplace", card)?.checked;
        await importMedsFromFile(file, replace);
        renderSettingsUI();
        try{ renderCalendarTile(); }catch(e){}
        if (typeof window.rerenderCalendar==="function") try{ window.rerenderCalendar(); }catch(e){}
      }catch(e){
        alert("Import fehlgeschlagen.");
      }finally{
        ev.target.value = "";
      }
    });

    $$("[data-med-edit]", card).forEach(row=>{
      const id = row.getAttribute("data-med-edit");
      const open = ()=> id && openModalForItem(id);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (ev)=>{ if (ev.key==="Enter"||ev.key===" ") { ev.preventDefault(); open(); }});
    });
  }

  // ---------------- Calendar Tile ----------------
  const CAL_TILE_ID = "medsCalendarTile";

  function groupBySlot(tasks){
    const map = new Map();
    for (const t of tasks){
      const slot = t.slot || "MORNING";
      if (!map.has(slot)) map.set(slot, []);
      map.get(slot).push(t);
    }
    return Array.from(map.entries()).sort((a,b)=>{
      const oa = SLOT_DEFS[a[0]]?.order ?? 999;
      const ob = SLOT_DEFS[b[0]]?.order ?? 999;
      return oa-ob;
    });
  }

  function renderCalendarTile(){
    const summary = document.getElementById("summary");
    if (!summary) return;

    const s = loadSettings();
    if (!s.enabled || !(s.items||[]).length){
      const old = document.getElementById(CAL_TILE_ID);
      if (old) old.remove();
      return;
    }

    const todayISO = iso(new Date());
    const tasks = tasksForDate(todayISO);
    const groups = groupBySlot(tasks);

    const historyDays = Array.from({length:7}, (_,i)=> iso(addDays(new Date(), -i)));
    const historyRows = historyDays.map(dISO=>{
      const t = tasksForDate(dISO);
      const done = t.filter(x=>hasEvent(x.item.id, dISO, x.slot)).length;
      const total = t.length;
      return `
        <button type="button" class="medsHistoryRow" data-med-day-open="${escapeHtml(dISO)}">
          <span class="medsHistoryDate">${escapeHtml(fmtDateDE(dISO))}</span>
          <span class="medsHistoryMeta">${done}/${total}</span>
        </button>
      `;
    }).join("");

    let tile = document.getElementById(CAL_TILE_ID);
    if (!tile){
      tile = document.createElement("div");
      tile.id = CAL_TILE_ID;
      tile.className = "card inner medsCard medsCalendarTile";
      summary.prepend(tile);
    }

    tile.innerHTML = `
      <div class="medsCalHeader">
        <div>
          <div class="strong">💊 Medi-Checkliste</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">Heute · ${tasks.length} ${tasks.length===1?"Eintrag":"Einträge"}</div>
        </div>
        <button class="btn small" type="button" data-meds-settings="1">Einstellungen</button>
      </div>

      ${tasks.length ? groups.map(([slot, arr])=>{
        const title = SLOT_DEFS[slot]?.label || slot;
        return `
          <div class="medsCalGroup">
            <div class="medsCalGroupTitle">${escapeHtml(title)}</div>
            <div class="medsCalList">
              ${arr.map(t=>{
                const done = hasEvent(t.item.id, todayISO, t.slot);
                const metaLine = (t.meta && t.meta.type==="EVERY_N_DAYS")
                  ? (done
                      ? `✓ genommen · nächstes: ${escapeHtml(fmtDateDE(t.meta.nextDueIfTakenToday))}`
                      : `fällig · Intervall: ${t.meta.everyDays} Tage`)
                  : (done ? "✓ genommen" : "");
                return `
                  <label class="medsCalRow ${done?"done":""}">
                    <input type="checkbox" data-med-done="1" data-item="${escapeHtml(t.item.id)}" data-slot="${escapeHtml(t.slot)}" ${done?"checked":""}>
                    <span class="medsCalName">${escapeHtml(t.item.icon||"💊")} ${escapeHtml(t.item.name||"(ohne Name)")}</span>
                    ${metaLine?`<span class="medsCalMeta">${escapeHtml(metaLine)}</span>`:""}
                  </label>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("") : `<div class="muted" style="font-size:12px;margin-top:10px;">Heute ist nichts geplant (laut deinem Plan).</div>`}

      <details class="medsHistory" style="margin-top:12px;">
        <summary class="medsHistorySum">Letzte 7 Tage <span class="muted">(Tippen zum Bearbeiten)</span></summary>
        <div class="medsHistoryList">${historyRows}</div>
      </details>
    `;

    tile.querySelector("[data-meds-settings='1']")?.addEventListener("click", (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      goToSettings();
    });

    $$("[data-med-done]", tile).forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const id = cb.getAttribute("data-item");
        const slot = cb.getAttribute("data-slot");
        if (!id || !slot) return;
        if (cb.checked) addEvent(id, todayISO, slot);
        else clearDaySlot(id, todayISO, slot);
        try{ renderCalendarTile(); }catch(e){}
      });
    });

    $$("[data-med-day-open]", tile).forEach(b=>{
      b.addEventListener("click", ()=>{
        const d = b.getAttribute("data-med-day-open");
        if (d) openDayEditor(d);
      });
    });
  }

  window.Meds = {
    loadSettings, saveSettings,
    loadLog, saveLog,
    renderSettingsUI,
    renderCalendarTile,
    tasksForDate,
    addEvent, hasEvent,
  };
})();
