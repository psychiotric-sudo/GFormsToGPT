// Popup script for ChatGPT data clearing UI and tab management

// ── Tab switching functionality ──
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");

    // Remove active class from all tabs and buttons
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.classList.remove("active");
    });
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.classList.remove("active");
    });

    // Add active class to clicked tab and button
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
      targetTab.classList.add("active");
      btn.classList.add("active");
    }
  });
});

// ── Settings Logic ──
const customPromptInput = document.getElementById("customPrompt");
const ignoredKeywordsInput = document.getElementById("ignoredKeywords");
const humanTypingInput = document.getElementById("humanTyping");
const verboseLoggingInput = document.getElementById("verboseLogging");
const saveSettingsBtn = document.getElementById("saveSettings");
const settingsStatus = document.getElementById("settingsStatus");
const updateNotice = document.getElementById("updateNotice");
const newVersionSpan = document.getElementById("newVersion");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const updateNowBtn = document.getElementById("updateNowBtn");
const viewFullLegalBtn = document.getElementById("viewFullLegalBtn");
const updateStatus = document.getElementById("updateStatus");

// Ensure "Clear" tab is active on load or handle tab param
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const targetTabId = params.get("tab") || "clear";

  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  
  const targetTab = document.getElementById(targetTabId);
  const targetBtn = document.querySelector(`[data-tab="${targetTabId}"]`);

  if (targetTab && targetBtn) {
    targetTab.classList.add("active");
    targetBtn.classList.add("active");
  } else {
    // Default to clear
    const clearTab = document.getElementById("clear");
    const clearBtnTab = document.querySelector('[data-tab="clear"]');
    if (clearTab) clearTab.classList.add("active");
    if (clearBtnTab) clearBtnTab.classList.add("active");
  }
  
  // Set dynamic version display
  const versionDisplay = document.getElementById('currentVersionDisplay');
  if (versionDisplay) versionDisplay.textContent = chrome.runtime.getManifest().version;
});

// Load settings
chrome.storage.local.get(["customPrompt", "ignoredKeywords", "humanTyping", "verboseLogging", "updateAvailable"], (data) => {
  if (data.customPrompt && customPromptInput) customPromptInput.value = data.customPrompt;
  if (data.ignoredKeywords && ignoredKeywordsInput) ignoredKeywordsInput.value = data.ignoredKeywords;
  if (data.humanTyping !== undefined && humanTypingInput) humanTypingInput.checked = data.humanTyping;
  if (data.verboseLogging !== undefined && verboseLoggingInput) verboseLoggingInput.checked = data.verboseLogging;
  
  if (data.updateAvailable && newVersionSpan && updateNotice) {
    newVersionSpan.textContent = data.updateAvailable;
    updateNotice.style.display = "block";
  }
});

// Manual Update Check
if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener("click", () => {
    checkUpdateBtn.disabled = true;
    checkUpdateBtn.textContent = "Checking...";
    if (updateStatus) {
      updateStatus.className = "status loading";
      updateStatus.textContent = "Fetching latest version...";
      updateStatus.style.display = "block";
    }

    chrome.runtime.sendMessage({ action: "manualUpdateCheck" }, (response) => {
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = "Check for Updates";
      
      if (response && response.updateAvailable) {
        if (updateStatus) {
          updateStatus.className = "status success";
          updateStatus.textContent = `✓ New version ${response.version} found!`;
        }
        if (newVersionSpan) newVersionSpan.textContent = response.version;
        if (updateNotice) updateNotice.style.display = "block";
      } else if (response && response.error) {
        if (updateStatus) {
          updateStatus.className = "status error";
          updateStatus.textContent = "✗ Error checking for updates.";
        }
      } else {
        if (updateStatus) {
          updateStatus.className = "status success";
          updateStatus.textContent = "✓ You are on the latest version.";
        }
        if (updateNotice) updateNotice.style.display = "none";
      }
      
      if (updateStatus) {
        setTimeout(() => { updateStatus.style.display = "none"; }, 3000);
      }
    });
  });
}

// Save settings
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    const customPrompt = customPromptInput ? customPromptInput.value.trim() : "";
    const ignoredKeywords = ignoredKeywordsInput ? ignoredKeywordsInput.value.trim() : "";
    const humanTyping = humanTypingInput ? humanTypingInput.checked : false;
    const verboseLogging = verboseLoggingInput ? verboseLoggingInput.checked : false;

    chrome.storage.local.set(
      {
        customPrompt,
        ignoredKeywords,
        humanTyping,
        verboseLogging,
      },
      () => {
        if (settingsStatus) {
          settingsStatus.className = "status success";
          settingsStatus.textContent = "✓ Settings saved!";
          settingsStatus.style.display = "block";
          setTimeout(() => {
            settingsStatus.style.display = "none";
          }, 2000);
        }
      },
    );
  });
}

// ── Clear data button functionality ──
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");

    clearBtn.disabled = true;
    const oldText = clearBtn.textContent;
    clearBtn.textContent = "Clearing...";
    
    if (statusDiv) {
      statusDiv.className = "status loading";
      statusDiv.textContent = "Processing...";
      statusDiv.style.display = "block";
    }

    chrome.runtime.sendMessage({ action: "clearChatGPTData" }, (response) => {
      clearBtn.disabled = false;
      clearBtn.textContent = oldText;

      if (statusDiv) {
        if (response && response.success) {
          statusDiv.className = "status success";
          statusDiv.textContent = "✓ " + response.message;
        } else {
          statusDiv.className = "status error";
          statusDiv.textContent = "✗ " + (response?.message || "Failed to clear data");
        }
      }
    });
  });
}

// Update Now Button
if (updateNowBtn) {
  updateNowBtn.addEventListener("click", () => {
    const url = "https://raw.githubusercontent.com/psychiotric-sudo/GFormsToGPT/refs/heads/main/UPDATE.bat";
    window.open(url, "_blank");
  });
}

// View Full Legal Button
if (viewFullLegalBtn) {
  viewFullLegalBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html#legal") });
  });
}
