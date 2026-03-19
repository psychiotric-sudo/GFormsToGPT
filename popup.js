// Popup script for GFormToGPT v3.8.6

// ── Tab switching functionality ──
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");
    document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));

    const targetTab = document.getElementById(tabName);
    if (targetTab) {
      targetTab.classList.add("active");
      btn.classList.add("active");
      if (tabName === "history") loadHistory();
    }
  });
});

// ── History Logic ──
const historyList = document.getElementById("historyList");

async function loadHistory() {
  const data = await chrome.storage.local.get(["history", "totalSecondsSaved", "formCount"]);
  const history = data.history || [];
  
  // Update Dashboard
  const totalSeconds = data.totalSecondsSaved || 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  document.getElementById("totalTimeSaved").textContent = `${minutes}m ${seconds}s`;
  document.getElementById("totalFormsFilled").textContent = `${data.formCount || 0} forms automated`;

  if (history.length === 0) {
    historyList.innerHTML = '<div class="empty-history">No forms scanned yet.</div>';
    return;
  }

  historyList.innerHTML = history.map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-header">
        <div>
          <h4>${item.formTitle}</h4>
          <span>${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
      <div class="history-content">
        ${item.questions.map((q, idx) => `
          <div class="history-q-row">
            <div class="history-q">[Q${idx + 1}] ${q.q}</div>
            <div class="history-a">${q.a}</div>
          </div>
        `).join('')}
        <div class="export-btn-container">
          <button class="btn btn-outline export-btn" style="width:100%; font-size:11px; padding:6px;">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export to Text
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Add accordion behavior
  document.querySelectorAll(".history-header").forEach(header => {
    header.addEventListener("click", () => {
      header.parentElement.classList.toggle("open");
    });
  });

  // Add export behavior
  document.querySelectorAll(".export-btn").forEach((btn, idx) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportEntry(history[idx]);
    });
  });
}

function exportEntry(entry) {
  let text = `FORM: ${entry.formTitle}\nDATE: ${new Date(entry.timestamp).toLocaleString()}\n\n`;
  entry.questions.forEach((q, idx) => {
    text += `[Q${idx + 1}] ${q.q}\n${q.a}\n\n`;
  });

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entry.formTitle.replace(/[^a-z0-9]/gi, '_')}_history.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Settings Logic ──
const customPromptInput = document.getElementById("customPrompt");
const humanTypingInput = document.getElementById("humanTyping");
const verboseLoggingInput = document.getElementById("verboseLogging");
const saveSettingsBtn = document.getElementById("saveSettings");
const settingsStatus = document.getElementById("settingsStatus");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const updateStatus = document.getElementById("updateStatus");

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const targetTabId = params.get("tab") || "history";

  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  
  const targetTab = document.getElementById(targetTabId);
  const targetBtn = document.querySelector(`[data-tab="${targetTabId}"]`);

  if (targetTab && targetBtn) {
    targetTab.classList.add("active");
    targetBtn.classList.add("active");
    if (targetTabId === "history") loadHistory();
  }
});

// Load settings
chrome.storage.local.get(["customPrompt", "humanTyping", "verboseLogging"], (data) => {
  if (data.customPrompt && customPromptInput) customPromptInput.value = data.customPrompt;
  if (data.humanTyping !== undefined && humanTypingInput) humanTypingInput.checked = data.humanTyping;
  if (data.verboseLogging !== undefined && verboseLoggingInput) verboseLoggingInput.checked = data.verboseLogging;
});

// Save settings
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    chrome.storage.local.set({
      customPrompt: customPromptInput.value.trim(),
      humanTyping: humanTypingInput.checked,
      verboseLogging: verboseLoggingInput.checked,
    }, () => {
      settingsStatus.className = "status success";
      settingsStatus.textContent = "✓ Settings saved!";
      settingsStatus.style.display = "block";
      setTimeout(() => settingsStatus.style.display = "none", 2000);
    });
  });
}

// Update Check
if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener("click", () => {
    checkUpdateBtn.disabled = true;
    updateStatus.className = "status loading";
    updateStatus.textContent = "Checking...";
    updateStatus.style.display = "block";

    chrome.runtime.sendMessage({ action: "manualUpdateCheck" }, (response) => {
      checkUpdateBtn.disabled = false;
      if (response && response.updateAvailable) {
        updateStatus.className = "status success";
        updateStatus.textContent = `✓ New version ${response.version} found!`;
      } else {
        updateStatus.className = "status success";
        updateStatus.textContent = "✓ You are on the latest version.";
      }
      setTimeout(() => updateStatus.style.display = "none", 3000);
    });
  });
}

// Clear Data
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const statusDiv = document.getElementById("status");
    clearBtn.disabled = true;
    statusDiv.className = "status loading";
    statusDiv.textContent = "Clearing...";
    statusDiv.style.display = "block";

    chrome.runtime.sendMessage({ action: "clearChatGPTData" }, (response) => {
      clearBtn.disabled = false;
      statusDiv.className = response.success ? "status success" : "status error";
      statusDiv.textContent = response.message;
    });
  });
}

// Legal Link
document.getElementById("viewFullLegalBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html#legal") });
});
