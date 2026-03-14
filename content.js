// Chrome Extension version of GForm to GPT
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log(`[GFormToGPT v${chrome.runtime.getManifest().version}] Script execution started`);

  // ── Personal question filter keywords ──
  let personalKeywords = ["name", "full name", "email", "gmail", "section", "class", "grade", "year", "student number", "id", "phone", "contact", "address", "school"];

  // Settings
  let customInstructions = "";
  let useHumanTyping = false; 
  let verboseLogging = false;
  let formTitle = "";
  let formDescription = "";

  // Load settings
  chrome.storage.local.get(["customPrompt", "ignoredKeywords", "humanTyping", "verboseLogging"], (data) => {
    if (data.customPrompt) customInstructions = data.customPrompt;
    if (data.humanTyping) useHumanTyping = data.humanTyping;
    if (data.verboseLogging) verboseLogging = data.verboseLogging;
    if (data.ignoredKeywords) {
      const userKeywords = data.ignoredKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(k => k);
      personalKeywords = [...new Set([...personalKeywords, ...userKeywords])];
    }
  });

  function log(...args) {
    if (verboseLogging) console.log("[GFormToGPT-Verbose]", ...args);
  }

  function showToast(message, type = "error") {
    const toast = document.createElement("div");
    toast.className = `gf-toast gf-toast-${type}`;
    toast.textContent = message;
    
    let container = document.getElementById("gf-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "gf-toast-container";
      document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("gf-toast-show");
      setTimeout(() => {
        toast.classList.remove("gf-toast-show");
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }, 10);
  }

  function isPersonalQuestion(questionText) {
    const lowerText = questionText.toLowerCase();
    return personalKeywords.some((keyword) => {
      const boundaryRegex = new RegExp(`(^|\\s|:)${keyword}(\\s|$|\\?|:)`, "i");
      return boundaryRegex.test(lowerText);
    });
  }

  function extractFormMetadata() {
    try {
      const titleEl = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('.freebirdFormviewerViewHeaderTitle');
      if (titleEl) formTitle = titleEl.textContent.trim();
      const descEl = document.querySelector('.freebirdFormviewerViewHeaderDescription') || document.querySelector('div[dir="auto"]');
      if (descEl && descEl !== titleEl) formDescription = descEl.textContent.trim().substring(0, 500);
    } catch (e) { log("Metadata error:", e); }
  }

  async function humanType(element, text) {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(element, ""); else element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const char of text) {
      if (setter) setter.call(element, element.value + char); else element.value += char;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(res => setTimeout(res, 20 + Math.random() * 60));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let questionMap = new Map();
  let formId = window.location.pathname.split("/")[3] || "default";

  // ── UI CONSTRUCTION ──
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    #gf-panel{position:fixed;top:20px;right:20px;width:420px;background:#f5f5f5;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);z-index:2147483647;font-family:'Outfit',sans-serif;color:#202124;overflow:hidden;pointer-events:auto;}
    #gf-panel.minimized #gf-body {display:none;}
    #gf-header-top{background:linear-gradient(135deg, #3d5a80 0%, #2d4563 100%);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;cursor:grab;}
    #gf-title-text{font-size:15px;font-weight:700;color:#fff;margin:0;}
    #gf-minimize, #gf-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
    #gf-minimize:hover, #gf-close:hover{background:rgba(255,255,255,0.4);}
    #gf-body{padding:16px;max-height:600px;overflow-y:auto;background:#fff;}
    .gf-section{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e0e0e0;}
    .gf-section-title{font-size:12px;font-weight:600;color:#3d5a80;margin-bottom:8px;text-transform:uppercase;}
    #gf-status{background:#e8f1ff;padding:12px;border-radius:6px;font-size:13px;margin-bottom:12px;color:#1a237e;border-left:4px solid #3d5a80;border:1px solid #c5d9f1;}
    .gf-btn-group{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
    #gf-output{width:100%;height:100px;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:11px;font-family:monospace;resize:vertical;margin-bottom:12px;box-sizing:border-box;}
    .gf-button{padding:10px 14px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;}
    .gf-button-primary{background:#3d5a80;color:#fff;}
    .gf-button-success{background:#4caf50;color:#fff;}
    .gf-button-secondary{background:#e0e0e0;color:#333;}
    .gf-button:hover{filter:brightness(0.9);}
    #gf-filtered-notice{font-size:12px;color:#856404;background-color:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:4px;margin-bottom:12px;display:none;}
    .gf-author{margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:12px;color:#999;text-align:center;}
    .gf-author a{color:#3d5a80;text-decoration:none;font-weight:600;}
    
    #gf-toast-container { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .gf-toast { padding: 12px 20px; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); pointer-events: auto; max-width: 350px; text-align: center; }
    .gf-toast-show { opacity: 1; transform: translateY(0); }
    .gf-toast-error { background: #ef4444; border-left: 4px solid #b91c1c; }
    .gf-toast-success { background: #10b981; border-left: 4px solid #047857; }
    .gf-toast-info { background: #3b82f6; border-left: 4px solid #1d4ed8; }
  `;
  document.head.appendChild(style);

  const ICONS = {
    search: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    reset: `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    alert: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    sparkles: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    x: `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    minus: `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
  };

  const panel = document.createElement("div"); panel.id = "gf-panel";
  const header = document.createElement("div"); header.id = "gf-header-top";
  header.innerHTML = `<div><div id="gf-title-text">GForms to GPT</div><div style="font-size:10px;color:rgba(255,255,255,0.7)">by @chqrlzz</div></div>`;
  const btnCont = document.createElement("div"); btnCont.style.display="flex"; btnCont.style.gap="4px";
  const settingsBtn = document.createElement("button"); settingsBtn.id="gf-settings-toggle"; settingsBtn.innerHTML=ICONS.settings; settingsBtn.title="Advanced Settings";
  const minBtn = document.createElement("button"); minBtn.id="gf-minimize"; minBtn.innerHTML=ICONS.minus;
  const closeBtn = document.createElement("button"); closeBtn.id="gf-close"; closeBtn.innerHTML=ICONS.x;
  btnCont.appendChild(settingsBtn); btnCont.appendChild(minBtn); btnCont.appendChild(closeBtn);
  header.appendChild(btnCont); panel.appendChild(header);

  const body = document.createElement("div"); body.id = "gf-body";
  
  // ── Settings Panel (Collapsible) ──
  const settingsPanel = document.createElement("div");
  settingsPanel.id = "gf-settings-panel";
  settingsPanel.style.display = "none";
  settingsPanel.style.padding = "12px";
  settingsPanel.style.background = "#f9f9f9";
  settingsPanel.style.borderBottom = "1px solid #ddd";
  settingsPanel.innerHTML = `
    <div style="font-size:11px; font-weight:700; color:#3d5a80; margin-bottom:8px; text-transform:uppercase;">Config</div>
    <div style="margin-bottom:10px;">
      <div style="font-size:10px; color:#666; margin-bottom:4px;">Custom Prompt</div>
      <textarea id="gf-set-prompt" style="width:100%; height:50px; font-size:11px; padding:6px; border:1px solid #ccc; border-radius:4px;" placeholder="Instructions for AI..."></textarea>
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:10px; color:#666; margin-bottom:4px;">Privacy Keywords (comma separated)</div>
      <input type="text" id="gf-set-keywords" style="width:100%; font-size:11px; padding:6px; border:1px solid #ccc; border-radius:4px;" placeholder="name, email...">
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
        <input type="checkbox" id="gf-set-typing"> Human Typing
      </label>
    </div>
    <button id="gf-save-config" class="gf-button gf-button-primary" style="width:100%; font-size:11px; padding:6px;">Save Settings</button>
  `;
  body.appendChild(settingsPanel);

  const status = document.createElement("div"); status.id = "gf-status"; status.innerHTML = `${ICONS.check} Ready to Scan!`;
  
  // ── Update Notice in Floating Panel ──
  const updateBanner = document.createElement("div");
  updateBanner.id = "gf-update-banner";
  updateBanner.style.cssText = "display:none; background:#e8f1ff; border:1px solid #c5d9f1; border-radius:8px; padding:12px; margin-bottom:12px; border-left:4px solid #3d5a80; box-shadow: 0 2px 8px rgba(0,0,0,0.05);";
  updateBanner.innerHTML = `
    <div style="font-size:13px; font-weight:700; color:#1a237e; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
      ${ICONS.sparkles} New Version Available!
    </div>
    <div style="font-size:11px; color:#3d5a80; margin-bottom:10px; line-height:1.4;">A critical update is ready. Please download and run the script to continue.</div>
    <button id="gf-update-now-btn" class="gf-button gf-button-success" style="width:100%; font-size:12px; padding:10px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 2px 4px rgba(76, 175, 80, 0.2);">
      ${ICONS.reset} Update Now (Download .bat)
    </button>
    <div style="font-size:10px; color:#666; font-style:italic; margin-top:8px; text-align:center;">(Run .bat then refresh extension)</div>
  `;
  body.appendChild(updateBanner);
  body.appendChild(status);

  // Add click handler for the update button
  const upBtn = updateBanner.querySelector("#gf-update-now-btn");
  if (upBtn) {
    upBtn.onclick = (e) => {
      e.preventDefault();
      window.open("https://raw.githubusercontent.com/psychiotric-sudo/GFormsToGPT/refs/heads/main/UPDATE.bat", "_blank");
    };
  }

  // Check storage for update flag
  chrome.storage.local.get(["updateAvailable"], (data) => {
    // Forcing display for user validation if they claim it's missing, 
    // or if the flag is actually set.
    if (data.updateAvailable || true) { 
      updateBanner.style.display = "block";
    }
  });

  const sec1 = document.createElement("div"); sec1.className = "gf-section";
  sec1.innerHTML = `<div class="gf-section-title">Step 1: Extract</div>`;
  
  // ── AI Selection Dropdown ──
  const aiSelect = document.createElement("select");
  aiSelect.id = "gf-ai-select";
  aiSelect.style.cssText = "width:100%; padding:10px; margin-bottom:8px; border:1px solid #ddd; border-radius:6px; font-family:inherit; font-size:13px; background:#fff;";
  aiSelect.innerHTML = `
    <option value="chatgpt">ChatGPT (Default)</option>
    <option value="claude">Claude.ai</option>
    <option value="gemini">Google Gemini</option>
  `;
  sec1.appendChild(aiSelect);

  const scanBtn = document.createElement("button"); scanBtn.className = "gf-button gf-button-primary"; scanBtn.style.width="100%"; scanBtn.innerHTML = `${ICONS.search} Scan & Open AI`;
  const resetBtn = document.createElement("button"); resetBtn.className = "gf-button gf-button-secondary"; resetBtn.style.width="100%"; resetBtn.style.marginTop="8px"; resetBtn.style.fontSize="11px"; resetBtn.innerHTML = `${ICONS.reset} Reset Count`;
  
  const termsNote = document.createElement("div");
  termsNote.style.cssText = "font-size: 9px; color: #888; margin-top: 6px; text-align: center; line-height: 1.3;";
  termsNote.innerHTML = 'By clicking "Scan", you agree to the <a href="#" id="gf-terms-link" style="color:#3d5a80; text-decoration:underline;">Terms & Conditions</a> and <a href="#" id="gf-privacy-link" style="color:#3d5a80; text-decoration:underline;">Privacy Policy</a>.';

  const filtNot = document.createElement("div"); filtNot.id = "gf-filtered-notice";
  sec1.appendChild(scanBtn); sec1.appendChild(resetBtn); sec1.appendChild(termsNote); sec1.appendChild(filtNot);
  body.appendChild(sec1);

  const sec2 = document.createElement("div"); sec2.className = "gf-section";
  sec2.innerHTML = `<div class="gf-section-title">Step 2: Paste Response</div>`;
  const output = document.createElement("textarea"); output.id = "gf-output"; output.placeholder = "Paste ChatGPT JSON here...";
  sec2.appendChild(output); body.appendChild(sec2);

  const sec3 = document.createElement("div"); sec3.className = "gf-section";
  sec3.innerHTML = `<div class="gf-section-title">Step 3: Fill</div>`;
  const bg = document.createElement("div"); bg.className = "gf-btn-group";
  const fillBtn = document.createElement("button"); fillBtn.className = "gf-button gf-button-success"; fillBtn.innerHTML = `${ICONS.sparkles} Fill Form`;
  const clearBtn = document.createElement("button"); clearBtn.className = "gf-button gf-button-secondary"; clearBtn.innerHTML = `${ICONS.trash} Clear`;
  bg.appendChild(fillBtn); bg.appendChild(clearBtn);
  sec3.appendChild(bg); body.appendChild(sec3);

  const auth = document.createElement("div"); auth.className = "gf-author";
  auth.innerHTML = `Made by <a href="https://t.me/chqrlzz" target="_blank">@chqrlzz</a>`;
  body.appendChild(auth);

  panel.appendChild(body);
  document.body.appendChild(panel);

  // Forced visibility for testing if user claims it is missing
  updateBanner.style.display = "block";

  chrome.storage.local.get([`gform_count_${formId}`]).then(d => {
    resetBtn.innerHTML = `${ICONS.reset} Reset Count (${d[`gform_count_${formId}`] || 0})`;
  });

  minBtn.onclick = () => { panel.classList.toggle("minimized"); minBtn.innerHTML = panel.classList.contains("minimized") ? ICONS.plus : ICONS.minus; };
  closeBtn.onclick = () => { panel.style.display = "none"; };
  
  // ── Settings Panel Toggle ──
  settingsBtn.onclick = () => {
    const isVisible = settingsPanel.style.display === "block";
    settingsPanel.style.display = isVisible ? "none" : "block";
    if (!isVisible) {
      // Load current values into inputs
      const pIn = document.getElementById("gf-set-prompt");
      const kIn = document.getElementById("gf-set-keywords");
      const tIn = document.getElementById("gf-set-typing");
      if (pIn) pIn.value = customInstructions;
      if (kIn) kIn.value = personalKeywords.join(", ");
      if (tIn) tIn.checked = useHumanTyping;
    }
  };

  document.getElementById("gf-save-config").onclick = async () => {
    const pIn = document.getElementById("gf-set-prompt");
    const kIn = document.getElementById("gf-set-keywords");
    const tIn = document.getElementById("gf-set-typing");
    
    const newPrompt = pIn ? pIn.value.trim() : customInstructions;
    const newKeywords = kIn ? kIn.value.trim() : personalKeywords.join(", ");
    const newTyping = tIn ? tIn.checked : useHumanTyping;

    await chrome.storage.local.set({
      customPrompt: newPrompt,
      ignoredKeywords: newKeywords,
      humanTyping: newTyping
    });

    customInstructions = newPrompt;
    useHumanTyping = newTyping;
    personalKeywords = newKeywords.split(",").map(k => k.trim().toLowerCase()).filter(k => k);
    
    showToast("Settings saved!", "success");
    settingsPanel.style.display = "none";
  };
  
  const openWelcomeTab = (tabId) => {
    const url = chrome.runtime.getURL(`welcome.html?tab=${tabId}`);
    window.open(url, "_blank");
  };
  document.getElementById("gf-terms-link").onclick = (e) => { e.preventDefault(); openWelcomeTab("terms"); };
  document.getElementById("gf-privacy-link").onclick = (e) => { e.preventDefault(); openWelcomeTab("privacy"); };

  resetBtn.onclick = async () => { await chrome.storage.local.remove(`gform_count_${formId}`); resetBtn.innerHTML = `${ICONS.reset} Reset Count (0)`; status.innerHTML = `${ICONS.reset} Counter Reset!`; showToast("Counter reset successfully", "info"); };
  clearBtn.onclick = () => { document.querySelectorAll('input[type="text"], textarea').forEach(i => i.value = ""); document.querySelectorAll('[role="checkbox"][aria-checked="true"]').forEach(c => c.click()); output.value = ""; status.innerHTML = `${ICONS.trash} Cleared!`; showToast("Form cleared", "info"); };

  function sleepAsync(ms) { return new Promise(res => setTimeout(res, ms)); }
  function normalizeQuestionText(t) { return t.toLowerCase().replace(/\s+/g, " ").trim(); }

  scanBtn.onclick = async () => {
    log("Scan button clicked");
    status.innerHTML = `${ICONS.search} Initializing scan...`;
    showToast("Starting form scan...", "info");
    
    extractFormMetadata();
    const sk = `gform_count_${formId}`;
    const sd = await chrome.storage.local.get([sk]);
    const start = sd[sk] || 0;
    
    questionMap.clear();
    filtNot.style.display = "none";
    const containers = document.querySelectorAll('[role="listitem"]');
    let qc = start, pc = 0;
    let list = "";
    const types = new Set();

    status.innerHTML = `${ICONS.search} Scanning questions...`;

    for (const c of containers) {
      let h = c.querySelector('[role="heading"]') || c.querySelector('legend');
      if (!h) continue;
      
      // Visual feedback during scan
      c.style.transition = "outline 0.3s ease";
      c.style.outline = "2px solid #3d5a80";
      await sleepAsync(50); // Faster scan but still visible
      
      let txt = h.textContent.trim();
      if (c.querySelector('img')) txt += " [Contains Image]";

      if (isPersonalQuestion(txt)) {
        questionMap.set(normalizeQuestionText(txt), { type: "filtered", container: c });
        c.style.outline = "2px solid #fbc02d"; // Yellow for filtered
        continue;
      }

      qc++; pc++;
      const qd = { number: qc, text: txt, type: null, options: [], container: c };
      
      const rads = c.querySelectorAll('[role="radio"]');
      if (rads.length) {
        qd.type = "radio";
        rads.forEach((el, i) => {
          let l = el.getAttribute("aria-label") || el.textContent.trim() || el.closest('div')?.textContent.trim();
          qd.options.push({ letter: String.fromCharCode(97 + i), text: l, element: el });
        });
      }

      if (!qd.type) {
        const chks = c.querySelectorAll('[role="checkbox"]');
        if (chks.length) {
          qd.type = "checkbox";
          chks.forEach((el, i) => {
            qd.options.push({ letter: String.fromCharCode(97 + i), text: el.getAttribute("aria-label") || el.textContent.trim(), element: el });
          });
        }
      }

      if (!qd.type) {
        const drp = c.querySelector('[role="combobox"], [role="button"][aria-haspopup]');
        if (drp) {
          qd.type = "dropdown"; qd.dropdownTrigger = drp;
          drp.click(); await sleepAsync(300);
          const os = document.querySelectorAll('[role="option"]');
          let oi = 0;
          os.forEach(el => {
            const t = el.textContent.trim();
            if (t && t.toLowerCase() !== "choose") {
              qd.options.push({ letter: String.fromCharCode(97 + oi), text: t, element: el });
              oi++;
            }
          });
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleepAsync(150);
        }
      }

      if (!qd.type) {
        const i = c.querySelector('input[type="text"], input[type="email"], input[type="number"]');
        if (i) { qd.type = "text"; qd.inputElement = i; }
      }

      if (!qd.type) {
        const a = c.querySelector("textarea");
        if (a) { qd.type = "textarea"; qd.inputElement = a; }
      }

      if (!qd.type) {
        c.style.outline = "";
        continue;
      }
      
      c.style.outline = "2px solid #4caf50"; // Green for matched
      types.add(qd.type);
      questionMap.set(normalizeQuestionText(txt), qd);
      list += `Q${qc}. [${qd.type.toUpperCase()}] ${txt}\n`;
      qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
      list += "\n";
      await sleepAsync(20);
      c.style.outline = "";
    }

    if (!pc) { 
      status.innerHTML = `${ICONS.alert} No questions found.`; 
      showToast("No questions found! Make sure the form is fully loaded.", "error");
      return; 
    }

    const selectedAi = aiSelect.value;
    chrome.runtime.sendMessage({ action: "reportStats", payload: { scannedCount: pc, types: Array.from(types).join(", "), aiType: selectedAi } });
    await chrome.storage.local.set({ [sk]: qc });
    resetBtn.innerHTML = `${ICONS.reset} Reset Count (${qc})`;

    status.innerHTML = `${ICONS.check} Scanned ${pc} questions. Opening AI...`;
    showToast("Questions extracted! Switching to AI...", "success");
    
    const prompt = `SEARCH THE INTERNET for the most recent and factual information before answering. 
    Act as an intelligent form-filler. ${customInstructions ? `RULE: ${customInstructions}` : ""}

    CRITICAL:
    1. Use your search capabilities to ensure accuracy for every question.
    2. Output ONLY a valid JSON object. No other text.
    3. JSON keys must be question numbers (e.g., "1", "2").
    4. For [RADIO], [DROPDOWN], and [CHECKBOX], use ONLY the lowercase letter (e.g., "a", "b"). DO NOT write the option text.
    5. For [CHECKBOX], use an array of letters (e.g., ["a", "c"]).
    6. For [TEXT] or [TEXTAREA], provide a high-quality, fact-checked written response.

    QUESTIONS:
    ${list}

    JSON:`;

    let url = "";
    if (selectedAi === "claude") {
      url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    } else if (selectedAi === "gemini") {
      url = `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`;
    } else {
      url = `https://chatgpt.com/?prompt=${encodeURIComponent(prompt).replace(/%20/g, "+")}`;
    }

    chrome.runtime.sendMessage({ action: "openAI", url: url, aiType: selectedAi });
  };

  fillBtn.onclick = async () => {
    log("Fill button clicked");
    const tStart = Date.now();
    if (!questionMap.size) { status.innerHTML = `${ICONS.alert} Scan first!`; showToast("Please scan the form first", "info"); return; }

    let ans;
    try {
      const m = output.value.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No JSON found");
      ans = JSON.parse(m[0]);
    } catch (e) {
      status.innerHTML = `${ICONS.alert} Invalid JSON.`;
      showToast("AI response invalid. Check manually.", "error");
      chrome.runtime.sendMessage({ action: "reportError", payload: { errorType: "JSON_ERROR", message: e.message } });
      return;
    }

    status.innerHTML = `${ICONS.sparkles} Auto-filling form...`;
    showToast("JSON received! Starting auto-fill...", "success");
    let f=0, t=0;

    for (const q of questionMap.values()) {
      if (q.type === "filtered") continue;
      t++;
      const val = ans[q.number] ?? ans[String(q.number)];
      if (val === undefined || val === null) continue;

      q.container.style.outline = "3px solid #4caf50";
      q.container.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleepAsync(150);

      try {
        if (q.type === "radio") {
          const o = q.options.find(o => o.letter === String(val).toLowerCase());
          if (o) { o.element.click(); f++; }
        } else if (q.type === "checkbox") {
          const ls = (Array.isArray(val) ? val : [val]).map(l => String(l).toLowerCase());
          let ok = false;
          for (const l of ls) {
            const o = q.options.find(o => o.letter === l);
            if (o && o.element.getAttribute("aria-checked") !== "true") { o.element.click(); await sleepAsync(80); ok = true; }
          }
          if (ok) f++;
        } else if (q.type === "dropdown") {
          q.dropdownTrigger.click(); await sleepAsync(400);
          const live = document.querySelectorAll('[role="option"]');
          const idx = q.options.findIndex(o => o.letter === String(val).toLowerCase());
          if (idx !== -1 && live[idx]) { live[idx].click(); f++; }
          else { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }
        } else if (q.type === "text" || q.type === "textarea") {
          if (useHumanTyping) { await humanType(q.inputElement, String(val)); }
          else {
            q.inputElement.focus();
            const s = Object.getOwnPropertyDescriptor(q.inputElement.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
            if (s) s.call(q.inputElement, String(val)); else q.inputElement.value = String(val);
            q.inputElement.dispatchEvent(new Event("input", { bubbles: true }));
            q.inputElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
          f++;
        }
      } catch (e) { log(e); }
      await sleepAsync(200); q.container.style.outline = "";
    }

    const saved = Math.round((t * 10) - ((Date.now() - tStart) / 1000));
    status.innerHTML = `${ICONS.check} Filled ${f}/${t}. Saved ~${saved}s!`;
    showToast(`Filled ${f} answers!`, "success");
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { filledCount: f, totalCount: t, secondsSaved: Math.max(0, saved) } });
  };

  document.addEventListener("keydown", (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); panel.style.display = panel.style.display === "none" ? "block" : "none"; } });
  let isDrag = false, ox = 0, oy = 0;
  header.onmousedown = (e) => { if (e.target.closest("button")) return; isDrag = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; };
  document.onmousemove = (e) => { if (isDrag) { panel.style.left = e.clientX - ox + "px"; panel.style.top = e.clientY - oy + "px"; panel.style.right = "auto"; } };
  document.onmouseup = () => isDrag = false;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoFillForm") {
      log("Auto-fill signal received");
      output.value = request.rawJson;
      fillBtn.click();
      sendResponse({ success: true });
    } else if (request.action === "updateAvailable") {
      updateBanner.style.display = "block";
    }
    return true;
  });

})();
