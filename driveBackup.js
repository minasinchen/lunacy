// driveBackup.js - optionales Google-Drive-Backup (Client-side)
//
// Funktionsprinzip
// - Nutzer verbindet einmal per Google OAuth (Google Identity Services)
// - App erstellt (einmalig) eine Datei in Drive und speichert deren fileId lokal
// - Nach jeder Änderung (saveJSON / Reset) wird das Backup debounced hochgeladen
// - Upload überschreibt die gleiche Datei (PATCH /upload/drive/v3/files/{fileId})
//
// Voraussetzungen (Google Cloud Console)
// 1) Projekt anlegen
// 2) "Google Drive API" aktivieren
// 3) OAuth-Client-ID (Web) erstellen
// 4) Authorized JavaScript origins: z.B. https://<user>.github.io
//
// Datenschutz
// - Scope: drive.file (App darf nur Dateien verwalten, die sie selbst erstellt/öffnet)
// - Es wird genau 1 Datei angelegt (Standardname unten), dann nur überschrieben

(() => {
  "use strict";

  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  // SETUP: HIER DEINE OAUTH CLIENT ID EINTRAGEN
  // Beispiel: 1234567890-abc...apps.googleusercontent.com
  const CLIENT_ID = "937108515012-nnajl84ei13bce6el36qr9ur1agm1hqf.apps.googleusercontent.com";
  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  const PREF_KEY = "pt_gdrive_backup_pref_v1";
  const DEFAULT_FILE_NAME = "lunacy-backup.json";

  const SCOPE = "https://www.googleapis.com/auth/drive.file";

  let els = {
    enabled: null,
    connect: null,
    now: null,
    status: null,
  };

  let pref = {
    enabled: false,
    fileId: null,
    fileName: DEFAULT_FILE_NAME,
    lastBackupAt: null,
  };

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  let backupTimer = null;
  let inFlight = false;
  let pending = false;

  function nowISO() {
    return new Date().toISOString();
  }

  function loadPref() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        pref = {
          enabled: !!p.enabled,
          fileId: p.fileId || null,
          fileName: p.fileName || DEFAULT_FILE_NAME,
          lastBackupAt: p.lastBackupAt || null,
        };
      }
    } catch {
      // ignore
    }
  }

  function savePref() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(pref));
    } catch {
      // ignore
    }
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function setUIFromPref() {
    if (els.enabled) els.enabled.checked = !!pref.enabled;
    const last = pref.lastBackupAt ? new Date(pref.lastBackupAt).toLocaleString() : "–";
    const fileInfo = pref.fileId ? `Datei: ${pref.fileName}` : "Datei: –";

    if (!CLIENT_ID || CLIENT_ID.includes("PASTE_YOUR")) {
      setStatus("Status: Google Drive Backup ist im Code noch nicht konfiguriert (CLIENT_ID fehlt).");
      return;
    }

    if (!pref.enabled) {
      setStatus("Status: deaktiviert.");
      return;
    }

    if (!pref.fileId) {
      setStatus("Status: aktiviert – nicht verbunden (bitte verbinden).");
      return;
    }

    setStatus(`Status: aktiviert – ${fileInfo} • letztes Backup: ${last}`);
  }

  function ensureElements() {
    els.enabled = document.getElementById("gdriveBackupEnabled");
    els.connect = document.getElementById("gdriveConnectBtn");
    els.now = document.getElementById("gdriveBackupNowBtn");
    els.status = document.getElementById("gdriveStatus");

    return !!(els.enabled && els.connect && els.now && els.status);
  }

  function ensureGoogleLoaded() {
    return !!(window.google && window.google.accounts && window.google.accounts.oauth2);
  }

  function initTokenClient() {
    if (tokenClient) return;
    if (!ensureGoogleLoaded()) return;
    if (!CLIENT_ID || CLIENT_ID.includes("PASTE_YOUR")) return;

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          // expires_in ist i.d.R. Sekunden
          const ttl = Number(resp.expires_in || 0);
          tokenExpiresAt = Date.now() + Math.max(30, ttl - 30) * 1000;
          setUIFromPref();
        } else {
          setStatus("Status: Verbindung fehlgeschlagen (kein access_token)." );
        }
      },
    });
  }

  async function ensureAccessToken(interactive) {
    initTokenClient();

    if (!tokenClient) {
      throw new Error("Google Login nicht bereit (Script nicht geladen oder CLIENT_ID fehlt)." );
    }

    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

    await new Promise((resolve, reject) => {
      try {
        tokenClient.callback = (resp) => {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            const ttl = Number(resp.expires_in || 0);
            tokenExpiresAt = Date.now() + Math.max(30, ttl - 30) * 1000;
            resolve();
          } else {
            reject(new Error(resp?.error_description || resp?.error || "Token Anfrage fehlgeschlagen"));
          }
        };

        // prompt:
        // - "consent" => zeigt Dialog sicher (1. Verbindung)
        // - "" => versucht still (kann trotzdem ein Popup auslösen)
        tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
      } catch (e) {
        reject(e);
      }
    });

    return accessToken;
  }

  function buildPayloadBlob() {
    const payload = (typeof window.__lunacyGetBackupPayload === "function")
      ? window.__lunacyGetBackupPayload()
      : null;

    if (!payload) throw new Error("Backup-Payload ist nicht verfügbar.");

    const text = JSON.stringify(payload, null, 2);
    return new Blob([text], { type: "application/json" });
  }

  function multipartBody({ metadata, blob, boundary }) {
    // Multipart mit JSON metadata + file content
    // (kein base64 nötig, wir streamen als Blob)
    const metaPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`;

    const fileHeader =
      `--${boundary}\r\n` +
      `Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`;

    const end = `\r\n--${boundary}--`;

    return new Blob([metaPart, fileHeader, blob, end], { type: `multipart/related; boundary=${boundary}` });
  }

  async function createFile(token, blob) {
    const boundary = "lunacy_boundary_" + Math.random().toString(16).slice(2);
    const metadata = {
      name: pref.fileName || DEFAULT_FILE_NAME,
      mimeType: "application/json",
    };

    const body = multipartBody({ metadata, blob, boundary });

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": body.type,
      },
      body,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Drive create failed (${res.status}): ${t || res.statusText}`);
    }

    const json = await res.json();
    if (!json?.id) throw new Error("Drive create returned no file id");
    pref.fileId = json.id;
    savePref();
  }

  async function overwriteFile(token, blob) {
    const boundary = "lunacy_boundary_" + Math.random().toString(16).slice(2);
    const metadata = {
      name: pref.fileName || DEFAULT_FILE_NAME,
      mimeType: "application/json",
    };

    const body = multipartBody({ metadata, blob, boundary });

    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(pref.fileId)}?uploadType=multipart`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": body.type,
        },
        body,
      }
    );

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Drive update failed (${res.status}): ${t || res.statusText}`);
    }
  }

  async function backupNow({ interactiveAuth = false } = {}) {
    if (!pref.enabled) return;
    if (!CLIENT_ID || CLIENT_ID.includes("PASTE_YOUR")) {
      setStatus("Status: CLIENT_ID fehlt – Google Drive Backup nicht konfiguriert.");
      return;
    }

    if (inFlight) {
      pending = true;
      return;
    }

    inFlight = true;
    try {
      setStatus("Status: Backup läuft…");
      const token = await ensureAccessToken(interactiveAuth);
      const blob = buildPayloadBlob();

      if (!pref.fileId) {
        await createFile(token, blob);
      } else {
        await overwriteFile(token, blob);
      }

      pref.lastBackupAt = nowISO();
      savePref();
      setUIFromPref();
    } catch (e) {
      console.error(e);
      setStatus("Status: Backup fehlgeschlagen – " + (e?.message || String(e)));
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        // gleich nochmal (z.B. wenn während Upload neue Änderungen kamen)
        scheduleBackup(300);
      }
    }
  }

  function scheduleBackup(delayMs = 1200) {
    if (!pref.enabled) return;
    if (!pref.fileId) {
      // aktiviert aber noch nicht verbunden
      setUIFromPref();
      return;
    }

    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      backupTimer = null;
      backupNow({ interactiveAuth: false });
    }, delayMs);
  }

  function onDataChanged() {
    // Nach jeder Änderung: debounced sichern
    scheduleBackup(1200);
  }

  function wireUI() {
    if (!ensureElements()) return;

    loadPref();
    setUIFromPref();

    els.enabled.addEventListener("change", () => {
      pref.enabled = !!els.enabled.checked;
      savePref();
      setUIFromPref();

      if (pref.enabled) {
        // wenn bereits verbunden, beim Einschalten einmal sichern
        if (pref.fileId) scheduleBackup(600);
      }
    });

    els.connect.addEventListener("click", async () => {
      try {
        if (!pref.enabled) {
          pref.enabled = true;
          if (els.enabled) els.enabled.checked = true;
          savePref();
        }

        setStatus("Status: Verbindung wird hergestellt…");
        await ensureAccessToken(true);
        // Beim Verbinden sofort ein Backup ausführen (legt Datei an)
        await backupNow({ interactiveAuth: false });
      } catch (e) {
        console.error(e);
        setStatus("Status: Verbindung fehlgeschlagen – " + (e?.message || String(e)));
      }
    });

    els.now.addEventListener("click", async () => {
      try {
        if (!pref.enabled) {
          alert("Bitte zuerst 'Backup aktivieren' einschalten.");
          return;
        }
        await backupNow({ interactiveAuth: true });
      } catch (e) {
        console.error(e);
        setStatus("Status: Backup fehlgeschlagen – " + (e?.message || String(e)));
      }
    });

    // globaler Hook aus app.js
    window.__lunacyOnDataChanged = () => onDataChanged();
  }

  function init() {
    // DOM kann bei Script-Ladezeit noch nicht fertig sein
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => wireUI(), { once: true });
    } else {
      wireUI();
    }
  }

  // Expose
  window.LunacyDriveBackup = {
    init,
    backupNow,
    scheduleBackup,
  };
})();
