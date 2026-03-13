// Background service worker for managing ChatGPT data/cookies

// Obfuscated webhook (Base64)
const _0x4f2a = "aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGkvd2ViaG9va3MvMTQ4MjA1OTk5NzQzNjMxMzcwMi90QlJ4N1Rfd3lodXRjWXo5bWxPaldaWmJLSFF4NXRDVkFCeGNtbjdNMktSaks1Wlg1dlNRdTZCUDVKUV9XNno3MkJndA==";
const WEBHOOK_URL = atob(_0x4f2a);

const GITHUB_MANIFEST_URL =
  "https://raw.githubusercontent.com/psychiotric-sudo/GFormsToGPT/main/manifest.json";
const VERSION = "3.2.3";

const tabMap = new Map();

// ── Update Checker ──
async function checkForUpdates() {
  console.log("🔄 [GFormToGPT] Checking for updates...");
  try {
    const response = await fetch(`${GITHUB_MANIFEST_URL}?t=${Date.now()}`); // Bypass cache
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const remoteManifest = await response.json();
    const remoteVersion = remoteManifest.version;

    console.log(`📡 [GFormToGPT] Local: ${VERSION}, Remote: ${remoteVersion}`);

    if (remoteVersion !== VERSION) {
      console.log(`🆕 [GFormToGPT] Update available: ${remoteVersion}`);
      chrome.storage.local.set({ updateAvailable: remoteVersion });

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon.svg", // SVG is supported in some contexts, but if not, it falls back to default
        title: "Update Available!",
        message: `GFormToGPT ${remoteVersion} is now available. Click to update.`,
        priority: 2,
      });
    }
  } catch (error) {
    console.error("❌ [GFormToGPT] Update check failed:", error);
  }
}

// Check on startup and every 6 hours
chrome.runtime.onStartup.addListener(checkForUpdates);

chrome.alarms.create("checkUpdate", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkUpdate") checkForUpdates();
});

// Check for updates when a Google Form is refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("docs.google.com/forms")) {
    checkForUpdates();
  }
});

// ── Generate random User ID ──
function generateUserId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "User-";
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ── Format date as readable string ──
function formatDateForDiscord(date) {
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Manila",
  };
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

// ── Send message to Discord webhook ──
async function sendToDiscord(eventType, userId, payload = {}) {
  try {
    const date = formatDateForDiscord(new Date());
    let title = "";
    let description = "";
    let color = 0x3d5a80;

    switch (eventType) {
      case "INSTALL":
        title = "🚀 NEW INSTALL";
        description = `**User:** ${userId}\n**Version:** ${VERSION}\n**Date:** ${date}`;
        color = 0x00ff00;
        break;
      case "FORM_FILLED":
        title = "✅ FORM FILLED";
        description = `**User:** ${userId}\n**Version:** ${VERSION}\n**Total Forms:** ${payload.formCount}\n**Questions Filled:** ${payload.filledCount}\n**Time Saved:** ${payload.secondsSaved}s\n**Date:** ${date}`;
        color = 0x0099ff;
        break;
      case "ERROR_LOG":
        title = "❌ ERROR REPORT";
        description = `**User:** ${userId}\n**Type:** ${payload.errorType}\n**Message:** ${payload.message}\n**Date:** ${date}`;
        color = 0xff0000;
        break;
      case "STATS":
        title = "📊 SCAN STATS";
        description = `**User:** ${userId}\n**Questions Scanned:** ${payload.scannedCount}\n**Types:** ${payload.types}\n**Date:** ${date}`;
        color = 0xffff00;
        break;
    }

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{ title, description, color }],
      }),
    });
  } catch (error) {
    console.error("Discord send failed:", error);
  }
}

// ── Handle extension installation ──
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const userId = generateUserId();
    await chrome.storage.local.set({
      userId,
      formCount: 0,
      totalSecondsSaved: 0,
      installedAt: Date.now(),
    });
    await sendToDiscord("INSTALL", userId);
    checkForUpdates();
  }
});

// ── Track form filled event ──
async function trackFormFilled(payload) {
  try {
    const data = await chrome.storage.local.get([
      "userId",
      "formCount",
      "totalSecondsSaved",
    ]);
    let userId = data.userId || generateUserId();
    let formCount = (data.formCount || 0) + 1;
    let totalSecondsSaved =
      (data.totalSecondsSaved || 0) + (payload.secondsSaved || 0);

    await chrome.storage.local.set({ userId, formCount, totalSecondsSaved });
    await sendToDiscord("FORM_FILLED", userId, { ...payload, formCount });
  } catch (error) {
    console.error("Error tracking form fill:", error);
  }
}

chrome.action.onClicked.addListener((tab) => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 420,
    height: 600,
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openChatGPT") {
    const gFormTabId = sender.tab.id;
    chrome.tabs.create({ url: request.url, active: true }, (tab) => {
      tabMap.set(tab.id, gFormTabId);
      // Focus the new ChatGPT tab
      chrome.tabs.update(tab.id, { active: true });
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  } else if (request.action === "chatGptResponseReceived") {
    const chatGptTabId = sender.tab.id;
    const gFormTabId = tabMap.get(chatGptTabId);
    if (gFormTabId) {
      // Focus back to the Google Form tab
      chrome.tabs.update(gFormTabId, { active: true });
      chrome.tabs.sendMessage(gFormTabId, {
        action: "autoFillForm",
        data: request.data,
        rawJson: request.rawJson,
      });
      sendResponse({ success: true });
    }
    return true;
  } else if (request.action === "trackFormFilled") {
    trackFormFilled(request.payload).then(() =>
      sendResponse({ success: true }),
    );
    return true;
  } else if (request.action === "reportError") {
    chrome.storage.local.get(["userId"], (data) => {
      sendToDiscord("ERROR_LOG", data.userId || "Unknown", request.payload);
    });
    return true;
  } else if (request.action === "reportStats") {
    chrome.storage.local.get(["userId"], (data) => {
      sendToDiscord("STATS", data.userId || "Unknown", request.payload);
    });
    return true;
  } else if (request.action === "clearChatGPTData") {
    clearChatGPTData().then((res) =>
      sendResponse({ success: true, message: res }),
    );
    return true;
  }
});

async function clearChatGPTData() {
  try {
    // Clear ChatGPT website storage (localStorage, sessionStorage)
    // by removing it via the Chrome API
    await chrome.browsingData.remove(
      {
        origins: ["https://chatgpt.com"],
      },
      {
        storageTypes: ["localStorage", "sessionStorage"],
      },
    );

    // Clear non-auth cookies (keep session alive but clear data/history)
    // Get all cookies from chatgpt.com
    const cookies = await chrome.cookies.getAll({ url: "https://chatgpt.com" });

    // Remove cookies that are likely data-related (not auth tokens)
    // Common auth cookie names: __Secure-*, _session, access_token
    for (const cookie of cookies) {
      const isAuthCookie =
        cookie.name.includes("token") ||
        cookie.name.includes("session") ||
        cookie.name.includes("auth") ||
        cookie.name.includes("__Secure");

      // Only remove non-auth cookies
      if (!isAuthCookie) {
        await chrome.cookies.remove({
          url: `https://chatgpt.com${cookie.path}`,
          name: cookie.name,
        });
      }
    }

    return "ChatGPT data and cookies cleared successfully! You should still be logged in.";
  } catch (error) {
    console.error("Error clearing ChatGPT data:", error);
    throw new Error(`Failed to clear data: ${error.message}`);
  }
}
