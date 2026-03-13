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
    document.getElementById(tabName).classList.add("active");
    btn.classList.add("active");
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
const updateStatus = document.getElementById("updateStatus");

// Ensure "Clear" tab is active on load
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("clear").classList.add("active");
  document.querySelector('[data-tab="clear"]').classList.add("active");
  
  // Set dynamic version display
  document.getElementById('currentVersionDisplay').textContent = chrome.runtime.getManifest().version;
});

// Load settings
chrome.storage.local.get(["customPrompt", "ignoredKeywords", "humanTyping", "verboseLogging", "updateAvailable"], (data) => {
  if (data.customPrompt) customPromptInput.value = data.customPrompt;
  if (data.ignoredKeywords) ignoredKeywordsInput.value = data.ignoredKeywords;
  if (data.humanTyping) humanTypingInput.checked = data.humanTyping;
  if (data.verboseLogging) verboseLoggingInput.checked = data.verboseLogging;
  
  if (data.updateAvailable) {
    newVersionSpan.textContent = data.updateAvailable;
    updateNotice.style.display = "block";
  }
});

// Manual Update Check
checkUpdateBtn.addEventListener("click", () => {
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = "Checking...";
  updateStatus.className = "status loading";
  updateStatus.textContent = "Fetching latest version...";
  updateStatus.style.display = "block";

  // Send message to background to trigger check
  chrome.runtime.sendMessage({ action: "manualUpdateCheck" }, (response) => {
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.textContent = "🔍 Check for Updates";
    
    if (response && response.updateAvailable) {
      updateStatus.className = "status success";
      updateStatus.textContent = `✓ New version ${response.version} found!`;
      newVersionSpan.textContent = response.version;
      updateNotice.style.display = "block";
    } else if (response && response.error) {
      updateStatus.className = "status error";
      updateStatus.textContent = "✗ Error checking for updates.";
    } else {
      updateStatus.className = "status success";
      updateStatus.textContent = "✓ You are on the latest version.";
      updateNotice.style.display = "none";
    }
    
    setTimeout(() => { updateStatus.style.display = "none"; }, 3000);
  });
});

// Save settings
saveSettingsBtn.addEventListener("click", () => {
  const customPrompt = customPromptInput.value.trim();
  const ignoredKeywords = ignoredKeywordsInput.value.trim();
  const humanTyping = humanTypingInput.checked;
  const verboseLogging = verboseLoggingInput.checked;

  chrome.storage.local.set(
    {
      customPrompt,
      ignoredKeywords,
      humanTyping,
      verboseLogging,
    },
    () => {
      settingsStatus.className = "status success";
      settingsStatus.textContent = "✓ Settings saved!";
      settingsStatus.style.display = "block";
      setTimeout(() => {
        settingsStatus.style.display = "none";
      }, 2000);
    },
  );
});

// ── Clear data button functionality ──
document.getElementById("clearBtn").addEventListener("click", async () => {
  const btn = document.getElementById("clearBtn");
  const statusDiv = document.getElementById("status");

  // Disable button and show loading state
  btn.disabled = true;
  btn.textContent = "Clearing...";
  statusDiv.className = "status loading";
  statusDiv.textContent = "Processing...";

  // Send message to background script
  chrome.runtime.sendMessage({ action: "clearChatGPTData" }, (response) => {
    btn.disabled = false;
    btn.textContent = "Clear ChatGPT Data Now";

    if (response && response.success) {
      statusDiv.className = "status success";
      statusDiv.textContent = "✓ " + response.message;
    } else {
      statusDiv.className = "status error";
      statusDiv.textContent =
        "✗ " + (response?.message || "Failed to clear data");
    }
  });
});
