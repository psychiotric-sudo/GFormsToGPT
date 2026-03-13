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
const saveSettingsBtn = document.getElementById("saveSettings");
const settingsStatus = document.getElementById("settingsStatus");
const updateNotice = document.getElementById("updateNotice");
const newVersionSpan = document.getElementById("newVersion");

// Load settings
chrome.storage.local.get(["customPrompt", "ignoredKeywords", "humanTyping", "updateAvailable"], (data) => {
  if (data.customPrompt) customPromptInput.value = data.customPrompt;
  if (data.ignoredKeywords) ignoredKeywordsInput.value = data.ignoredKeywords;
  if (data.humanTyping) humanTypingInput.checked = data.humanTyping;
  
  if (data.updateAvailable) {
    newVersionSpan.textContent = data.updateAvailable;
    updateNotice.style.display = "block";
  }
});

// Save settings
saveSettingsBtn.addEventListener("click", () => {
  const customPrompt = customPromptInput.value.trim();
  const ignoredKeywords = ignoredKeywordsInput.value.trim();
  const humanTyping = humanTypingInput.checked;

  chrome.storage.local.set(
    {
      customPrompt,
      ignoredKeywords,
      humanTyping,
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
