// backup.js - Auto-Backup to a real file (outside browser storage)
// Strategy:
// - Best case (Chrome/Edge): File System Access API -> write/overwrite lunacy-backup.json in a user-chosen folder.
// - Fallback (Safari/iOS): allow manual export (download) and manual import.
//
// Exposes: window.LunacyBackup = { enable, disable, writeNow, markDirty }

(function(){
  "use strict";

  const BACKUP_FILENAME = "lunacy-backup.json";

  // These are the current storage keys used by Lunacy (app.js)
  const K_BLEED = "pt_bleed_v1";
  const K_NOTES = "pt_notes_v1";
  const K_SETTINGS = "pt_settings_v1";

const K_MED_SETTINGS = "pt_med_settings_v1";
const K_MED_LOG = "pt_med_log_v1";
  const K_ENABLED = "lunacy_backup_enabled_v1";
  const K_LAST_WRITE = "lunacy_backup_last_write_ms_v1";
  const K_LAST_HASH = "lunacy_backup_last_hash_v1";

  // cadence
  const DEBOUNCE_MS = 15000;          // write after user stops changing things
  const MIN_INTERVAL_MS = 6 * 3600 * 1000;  // at most every 6h automatically
  const DAILY_NUDGE_MS = 24 * 3600 * 1000;  // if enabled, try at least once per day

  const IDB_NAME = "lunacy_backup_db";
  const IDB_STORE = "kv";
  const IDB_KEY = "dirHandle";

  let dirty = false;
  let pendingTimer = null;
  let nudgeTimer = null;

  function $(id){ return document.getElementById(id); }

  function supportsFileSystemAccess(){
    return !!(window.showDirectoryPicker || window.showSaveFilePicker);
  }

  function nowMs(){ return Date.now(); }

  function safeParseJSON(s, fallback){
    try{ return JSON.parse(s); }catch(e){ return fallback; }
  }

  function readStorage(key, fallback){
    const s = localStorage.getItem(key);
    if (s === null || s === undefined) return fallback;
    return safeParseJSON(s, fallback);
  }

  function writeStorage(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  // tiny stable hash for change detection
  function hashString(str){
    let h = 5381;
    for (let i=0;i<str.length;i++){
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h >>> 0;
    }
    return String(h);
  }

  // --- IndexedDB helpers for storing the directory handle ---
  function idbOpen(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "k" });
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function idbGet(k){
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(k);
      req.onsuccess = ()=> resolve(req.result ? req.result.v : null);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function idbSet(k, v){
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put({ k, v });
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function idbDel(k){
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(k);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  function isEnabled(){
    return localStorage.getItem(K_ENABLED) === "1";
  }

  function setEnabled(v){
    localStorage.setItem(K_ENABLED, v ? "1" : "0");
  }

  function getLastWriteMs(){
    return Number(localStorage.getItem(K_LAST_WRITE) || 0) || 0;
  }

  function setLastWriteMs(ms){
    localStorage.setItem(K_LAST_WRITE, String(Number(ms)||0));
  }

  function getLastHash(){
    return String(localStorage.getItem(K_LAST_HASH) || "");
  }

  function setLastHash(h){
    localStorage.setItem(K_LAST_HASH, String(h||""));
  }

  function formatDE(ms){
    if (!ms) return "–";
    const d = new Date(ms);
    return d.toLocaleString("de-DE", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }

  function setStatus(msg){
    const el = $("backupStatus");
    if (el) el.textContent = msg;
  }

  function updateButtons(){
    const en = $("backupEnableBtn");
    const dis = $("backupDisableBtn");
    const now = $("backupNowBtn");

    const enabled = isEnabled();
    if (en) en.disabled = enabled;
    if (dis) dis.disabled = !enabled;
    if (now) now.disabled = !enabled;
  }

  function buildBackupObject(){
    const bleedDays = readStorage(K_BLEED, []);
    const notesByDate = readStorage(K_NOTES, {});
    const settings = readStorage(K_SETTINGS, {});
    const medSettings = readStorage(K_MED_SETTINGS, {});
    const medLog = readStorage(K_MED_LOG, { events:[] });

    return {
      schema: "lunacy-backup-v1",
      exportedAt: new Date().toISOString(),
      data: {
        bleedDays,
        notesByDate,
        settings,
        medSettings,
        medLog,
      }
    };
  }

  function buildBackupText(){
    const obj = buildBackupObject();
    // stable-ish ordering by JSON.stringify with spacing
    return JSON.stringify(obj, null, 2);
  }

  async function ensureWritePermission(dirHandle){
    if (!dirHandle) return false;
    // Some browsers need an explicit permission query
    if (typeof dirHandle.queryPermission === "function"){
      const q = await dirHandle.queryPermission({ mode: "readwrite" });
      if (q === "granted") return true;
      const r = await dirHandle.requestPermission({ mode: "readwrite" });
      return r === "granted";
    }
    return true;
  }

  async function getDirHandle(){
    return await idbGet(IDB_KEY);
  }

  async function writeBackupToFile(opts){
    const manual = !!opts?.manual;

    if (!supportsFileSystemAccess()){
      setStatus("Status: Dieser Browser unterstützt kein automatisches Überschreiben. Nutze ‚Backup jetzt schreiben‘ (Download) oder wechsle zu Chrome/Edge.");
      return { ok:false, reason:"no_fs_api" };
    }

    const dirHandle = await getDirHandle();
    if (!dirHandle){
      setStatus("Status: Kein Backup-Ordner gewählt. Klicke ‚Auto-Backup aktivieren‘.");
      return { ok:false, reason:"no_dir" };
    }

    const hasPerm = await ensureWritePermission(dirHandle);
    if (!hasPerm){
      setStatus("Status: Keine Schreibberechtigung für den Backup-Ordner.");
      return { ok:false, reason:"no_perm" };
    }

    // cadence gate for automatic writes
    const last = getLastWriteMs();
    const age = nowMs() - last;
    if (!manual && last && age < MIN_INTERVAL_MS){
      const mins = Math.ceil((MIN_INTERVAL_MS - age) / 60000);
      setStatus(`Status: Backup geplant – frühestens in ca. ${mins} Min.`);
      return { ok:false, reason:"too_soon" };
    }

    const text = buildBackupText();
    const h = hashString(text);
    if (!manual && h && h === getLastHash()){
      // nothing changed
      setLastWriteMs(nowMs());
      setStatus(`Status: Keine Änderungen seit letztem Backup. (geprüft: ${formatDE(nowMs())})`);
      return { ok:true, reason:"unchanged" };
    }

    const fileHandle = await dirHandle.getFileHandle(BACKUP_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();

    const t = nowMs();
    setLastWriteMs(t);
    setLastHash(h);
    dirty = false;

    setStatus(`Status: Backup geschrieben: ${formatDE(t)} (${BACKUP_FILENAME})`);
    return { ok:true };
  }

  // Fallback: manual download (cannot reliably overwrite existing downloads)
  function downloadBackupFallback(){
    const text = buildBackupText();
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = BACKUP_FILENAME;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 0);

    const t = nowMs();
    setLastWriteMs(t);
    setLastHash(hashString(text));
    dirty = false;
    setStatus(`Status: Backup-Download gestartet: ${formatDE(t)} (${BACKUP_FILENAME})`);
  }

  function clearTimers(){
    if (pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; }
    if (nudgeTimer){ clearTimeout(nudgeTimer); nudgeTimer = null; }
  }

  function scheduleWrite(reason){
    if (!isEnabled()) return;

    dirty = true;

    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async ()=>{
      pendingTimer = null;
      // try FS write if possible, otherwise fallback to status only (manual button can download)
      try{
        if (supportsFileSystemAccess()){
          await writeBackupToFile({ manual:false, reason });
        } else {
          setStatus("Status: Auto-Backup nicht verfügbar (Browser). Nutze ‚Backup jetzt schreiben‘.");
        }
      }catch(e){
        console.warn("Auto-Backup failed", e);
        setStatus("Status: Auto-Backup fehlgeschlagen (siehe Konsole). Bitte erneut aktivieren.");
      }
    }, DEBOUNCE_MS);
  }

  function scheduleDailyNudge(){
    if (nudgeTimer) clearTimeout(nudgeTimer);
    if (!isEnabled()) return;

    nudgeTimer = setTimeout(async ()=>{
      nudgeTimer = null;
      try{
        const last = getLastWriteMs();
        if (!last || (nowMs() - last) > DAILY_NUDGE_MS){
          // If enabled, try to write (manual bypass min interval is NOT used here)
          if (dirty) await writeBackupToFile({ manual:false, reason:"daily" });
          else {
            // still touch status
            setStatus(`Status: Letztes Backup: ${formatDE(last)}${supportsFileSystemAccess() ? "" : " (Browser ohne Auto-Backup)"}`);
          }
        }
      }catch(e){
        console.warn("Daily backup nudge failed", e);
      } finally {
        scheduleDailyNudge();
      }
    }, 30 * 60 * 1000); // check every 30 min, lightweight
  }

  async function enable(){
    setEnabled(true);

    if (!supportsFileSystemAccess()){
      updateButtons();
      setStatus("Status: Dein Browser unterstützt kein automatisches Überschreiben. Du kannst aber manuell sichern (Backup jetzt schreiben). Empfehlung: Chrome/Edge.");
      scheduleDailyNudge();
      return;
    }

    try{
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      await idbSet(IDB_KEY, dirHandle);
      updateButtons();
      setStatus(`Status: Auto-Backup aktiv. Datei: ${BACKUP_FILENAME}`);

      // Immediately write once (manual bypasses min interval)
      await writeBackupToFile({ manual:true, reason:"enable" });

      scheduleDailyNudge();
    }catch(e){
      // user cancelled
      setEnabled(false);
      updateButtons();
      setStatus("Status: Abgebrochen. Auto-Backup ist nicht aktiv.");
    }
  }

  async function disable(){
    setEnabled(false);
    clearTimers();
    try{ await idbDel(IDB_KEY); }catch(e){}
    updateButtons();
    setStatus("Status: Auto-Backup deaktiviert.");
  }

  async function writeNow(){
    if (!isEnabled()){
      setStatus("Status: Auto-Backup ist nicht aktiv.");
      return;
    }

    try{
      if (supportsFileSystemAccess()){
        const res = await writeBackupToFile({ manual:true, reason:"manual" });
        if (!res.ok && res.reason === "no_dir"){
          setStatus("Status: Kein Backup-Ordner gewählt. Klicke ‚Auto-Backup aktivieren‘.");
        }
      } else {
        downloadBackupFallback();
      }
    }catch(e){
      console.warn("Backup writeNow failed", e);
      setStatus("Status: Backup fehlgeschlagen (siehe Konsole)." );
    }
  }

  function markDirty(reason){
    if (!isEnabled()) return;
    scheduleWrite(reason);
  }

  function mergeArraysUnique(a, b){
    const out = [];
    const set = new Set();
    for (const x of (a||[])){
      const s = String(x);
      if (!set.has(s)){ set.add(s); out.push(x); }
    }
    for (const x of (b||[])){
      const s = String(x);
      if (!set.has(s)){ set.add(s); out.push(x); }
    }
    return out;
  }

  function mergeNotesByDate(cur, inc){
    const out = Object.assign({}, cur || {});
    for (const dateISO of Object.keys(inc || {})){
      const a = Array.isArray(out[dateISO]) ? out[dateISO].slice() : [];
      const b = Array.isArray(inc[dateISO]) ? inc[dateISO] : [];

      const seen = new Set(a.map(n=>String(n && (n.id || n.createdAt || JSON.stringify(n))).slice(0,200)));
      for (const n of b){
        const key = String(n && (n.id || n.createdAt || JSON.stringify(n))).slice(0,200);
        if (!seen.has(key)){
          seen.add(key);
          a.push(n);
        }
      }


function mergeMedLog(cur, inc){
  const out = { events:[] };
  const a = (cur && Array.isArray(cur.events)) ? cur.events : [];
  const b = (inc && Array.isArray(inc.events)) ? inc.events : [];
  out.events = a.slice();
  const seen = new Set(out.events.map(e=>String(e && (e.id || (e.itemId+"|"+e.dateISO+"|"+e.slot))).slice(0,200)));
  for (const e of b){
    const key = String(e && (e.id || (e.itemId+"|"+e.dateISO+"|"+e.slot))).slice(0,200);
    if (e && !seen.has(key)){
      seen.add(key);
      out.events.push(e);
    }
  }
  return out;
}

      out[dateISO] = a;
    }
    return out;
  }

  async function importBackupFile(file, replaceExisting){
    if (!file) return;

    const txt = await file.text();
    const obj = safeParseJSON(txt, null);
    if (!obj || !obj.data){
      alert("Ungültiges Backup-Format.");
      return;
    }

    const incoming = obj.data || {};
    const incBleed = Array.isArray(incoming.bleedDays) ? incoming.bleedDays : [];
    const incNotes = incoming.notesByDate && typeof incoming.notesByDate === "object" ? incoming.notesByDate : {};
    const incSettings = incoming.settings && typeof incoming.settings === "object" ? incoming.settings : {};
    const incMedSettings = incoming.medSettings && typeof incoming.medSettings === "object" ? incoming.medSettings : {};
    const incMedLog = incoming.medLog && typeof incoming.medLog === "object" ? incoming.medLog : { events:[] };

    if (replaceExisting){
      writeStorage(K_BLEED, incBleed);
      writeStorage(K_NOTES, incNotes);
      writeStorage(K_SETTINGS, incSettings);
      writeStorage(K_MED_SETTINGS, incMedSettings);
      writeStorage(K_MED_LOG, incMedLog);
    } else {
      const curBleed = readStorage(K_BLEED, []);
      const curNotes = readStorage(K_NOTES, {});
      const curSettings = readStorage(K_SETTINGS, {});
      const curMedSettings = readStorage(K_MED_SETTINGS, {});
      const curMedLog = readStorage(K_MED_LOG, { events:[] });

      writeStorage(K_BLEED, mergeArraysUnique(curBleed, incBleed));
      writeStorage(K_NOTES, mergeNotesByDate(curNotes, incNotes));
      writeStorage(K_SETTINGS, Object.assign({}, curSettings, incSettings));
      writeStorage(K_MED_SETTINGS, Object.assign({}, curMedSettings, incMedSettings));
      writeStorage(K_MED_LOG, mergeMedLog(curMedLog, incMedLog));
    }

    // After import, schedule a backup and refresh UI
    markDirty("import");

    alert("Backup importiert. Die Seite wird neu geladen.");
    window.location.reload();
  }

  function bindUI(){
    const enableBtn = $("backupEnableBtn");
    const disableBtn = $("backupDisableBtn");
    const nowBtn = $("backupNowBtn");
    const importFile = $("importBackupFile");
    const importReplace = $("importBackupReplace");

    if (enableBtn) enableBtn.addEventListener("click", ()=> enable());
    if (disableBtn) disableBtn.addEventListener("click", ()=> disable());
    if (nowBtn) nowBtn.addEventListener("click", ()=> writeNow());

    if (importFile){
      importFile.addEventListener("change", async ()=>{
        const f = importFile.files && importFile.files[0];
        if (!f) return;
        const rep = !!(importReplace && importReplace.checked);
        await importBackupFile(f, rep);
        importFile.value = "";
      });
    }

    updateButtons();

    const last = getLastWriteMs();
    if (isEnabled()){
      setStatus(`Status: Auto-Backup aktiv. Letztes Backup: ${formatDE(last)}${supportsFileSystemAccess()?"":" (Browser ohne Auto-Backup)"}`);
      scheduleDailyNudge();
    } else {
      setStatus("Status: Auto-Backup ist aus.");
    }
  }

  // Expose
  window.LunacyBackup = {
    enable,
    disable,
    writeNow,
    markDirty,
  };

  document.addEventListener("DOMContentLoaded", bindUI);
})();
