// Popup script for GFormToGPT v4.1.5 - Neural Interface

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

  const totalSeconds = data.totalSecondsSaved || 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (document.getElementById("totalTimeSaved")) document.getElementById("totalTimeSaved").textContent = `${minutes}m ${seconds}s`;
  if (document.getElementById("totalFormsFilled")) document.getElementById("totalFormsFilled").textContent = `${data.formCount || 0} forms automated`;

  if (history.length === 0) {
    if (historyList) historyList.innerHTML = '<div class="empty-history">No forms scanned yet.</div>';
    return;
  }

  if (historyList) {
    historyList.innerHTML = history.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-header">
          <div>
            <h4>${item.formTitle || "Untitled Form"}</h4>
            <span>${new Date(item.timestamp).toLocaleString()}</span>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="history-content">
          ${(item.questions || []).map((q, idx) => `
            <div class="history-q-row">
              <div class="history-q">[Q${idx + 1}] ${q.q}</div>
              <div class="history-a">${q.a}</div>
            </div>
          `).join('')}
          <div class="export-btn-container">
            <button class="btn btn-outline export-btn" style="width:100%; font-size:11px; padding:6px;">Export to Text</button>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll(".history-header").forEach(header => {
      header.addEventListener("click", () => header.parentElement.classList.toggle("open"));
    });

    document.querySelectorAll(".export-btn").forEach((btn, idx) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); exportEntry(history[idx]); });
    });
  }
}

function exportEntry(entry) {
  let text = `FORM: ${entry.formTitle}\nDATE: ${new Date(entry.timestamp).toLocaleString()}\n\n`;
  (entry.questions || []).forEach((q, idx) => { text += `[Q${idx + 1}] ${q.q}\n${q.a}\n\n`; });
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(entry.formTitle || "Form").replace(/[^a-z0-9]/gi, '_')}_history.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Engine Logic ──
const scanBtn = document.getElementById("gf-scan-btn");
const fillBtn = document.getElementById("gf-fill-btn");
const aiTypeSelect = document.getElementById("gf-ai-type");
const outputTextarea = document.getElementById("gf-output");
const engineStatus = document.getElementById("engineStatus");

function showEngineStatus(msg, type = "loading") {
  if (!engineStatus) return;
  engineStatus.className = `status ${type}`;
  engineStatus.textContent = msg;
  engineStatus.style.display = "block";
}

if (scanBtn) {
  scanBtn.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes("docs.google.com/forms")) {
      showEngineStatus("Please open a Google Form first.", "error");
      return;
    }

    showEngineStatus("Scanning form questions...");
    chrome.tabs.sendMessage(tab.id, { action: "scanForm" }, async (response) => {
      if (chrome.runtime.lastError) {
        showEngineStatus("Could not connect to page. Refresh the form.", "error");
        return;
      }

      if (response && response.success) {
        showEngineStatus(`Scanned ${response.qc} questions.`, "success");
        const aiType = aiTypeSelect.value;
        let url = "";
        if (aiType === "claude") url = `https://claude.ai/new`;
        else if (aiType === "gemini") url = `https://gemini.google.com/app`;
        else url = `https://chatgpt.com/`;

        await chrome.storage.local.set({ pendingPrompt: response.prompt, pendingAiType: aiType, lastGFormTabId: tab.id });

        setTimeout(() => {
          showEngineStatus("Redirecting to AI...");
          chrome.runtime.sendMessage({ action: "openAI", url: url, aiType, email: response.email, scannedCount: response.qc, fromTabId: tab.id });
        }, 800);
      } else {
        showEngineStatus(response?.error || "Scan failed.", "error");
      }
    });
  };
}

if (fillBtn) {
  fillBtn.onclick = async () => {
    const raw = outputTextarea.value.trim();
    if (!raw) {
      showEngineStatus("Please paste the AI JSON response first.", "error");
      return;
    }

    let answers;
    try {
      const startIdx = raw.indexOf('{'), endIdx = raw.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) throw new Error("No JSON boundaries");
      answers = JSON.parse(raw.substring(startIdx, endIdx + 1));
    } catch (e) {
      showEngineStatus("Invalid JSON format.", "error");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    showEngineStatus("Injecting responses...", "loading");
    chrome.tabs.sendMessage(tab.id, { action: "fillForm", answers }, (response) => {
      if (chrome.runtime.lastError) { showEngineStatus("Connection lost. Refresh.", "error"); return; }
      if (response && response.success) {
        showEngineStatus(`Filled ${response.filled}/${response.total} questions.`, "success");
        loadHistory();
      } else {
        showEngineStatus("Filling failed.", "error");
      }
    });
  };
}

// ── Settings Logic ──
const customPromptInput = document.getElementById("customPrompt");
const humanTypingInput = document.getElementById("humanTyping");
const verboseLoggingInput = document.getElementById("verboseLogging");
const diagnosticToggle = document.getElementById("diagnosticToggle");
const saveSettingsBtn = document.getElementById("saveSettings");
const settingsStatus = document.getElementById("settingsStatus");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const updateStatus = document.getElementById("updateStatus");

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  
  chrome.storage.local.get(["customPrompt", "humanTyping", "verboseLogging", "diagnosticEnabled", "diagnosticCaptured"], (data) => {
    if (data.customPrompt && customPromptInput) customPromptInput.value = data.customPrompt;
    
    // Default humanTyping to true if not set
    const humanTypingEnabled = data.humanTyping !== undefined ? data.humanTyping : true;
    if (humanTypingInput) humanTypingInput.checked = humanTypingEnabled;
    
    // Default verboseLogging to true if not set
    const verbLogEnabled = data.verboseLogging !== undefined ? data.verboseLogging : true;
    if (verboseLoggingInput) verboseLoggingInput.checked = verbLogEnabled;

    // Default diagnosticEnabled to true if not set
    const diagEnabled = data.diagnosticEnabled !== undefined ? data.diagnosticEnabled : true;
    if (diagnosticToggle) diagnosticToggle.checked = diagEnabled;
  });
});

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    const isDiagEnabled = diagnosticToggle ? diagnosticToggle.checked : true;
    const isVerbLogEnabled = verboseLoggingInput ? verboseLoggingInput.checked : true;
    
    chrome.storage.local.set({
      customPrompt: customPromptInput.value.trim(),
      humanTyping: humanTypingInput.checked,
      verboseLogging: isVerbLogEnabled,
      diagnosticEnabled: isDiagEnabled
    }, () => {
      settingsStatus.className = "status success";
      settingsStatus.textContent = "✓ Settings saved!";
      settingsStatus.style.display = "block";
      setTimeout(() => { if (settingsStatus) settingsStatus.style.display = "none"; }, 2000);
    });
  });
}

if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener("click", () => {
    checkUpdateBtn.disabled = true;
    updateStatus.className = "status loading";
    updateStatus.textContent = "Checking...";
    updateStatus.style.display = "block";
    chrome.runtime.sendMessage({ action: "manualUpdateCheck" }, (response) => {
      checkUpdateBtn.disabled = false;
      updateStatus.className = "status success";
      updateStatus.textContent = (response && response.updateAvailable) ? `✓ New version ${response.version} found!` : "✓ Latest version.";
      setTimeout(() => { if (updateStatus) updateStatus.style.display = "none"; }, 3000);
    });
  });
}

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

if (document.getElementById("viewFullLegalBtn")) {
  document.getElementById("viewFullLegalBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html#legal") });
  });
}
