// Chrome Extension version of GForm to GPT
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log(`🚀 [GFormToGPT v${chrome.runtime.getManifest().version}] Script execution started`);

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
    if (verboseLogging) console.log("🔍 [GFormToGPT-Verbose]", ...args);
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

  const panel = document.createElement("div"); panel.id = "gf-panel";
  const header = document.createElement("div"); header.id = "gf-header-top";
  header.innerHTML = `<div><div id="gf-title-text">GForms to GPT</div><div style="font-size:10px;color:rgba(255,255,255,0.7)">by @chqrlzz</div></div>`;
  const btnCont = document.createElement("div"); btnCont.style.display="flex"; btnCont.style.gap="4px";
  const minBtn = document.createElement("button"); minBtn.id="gf-minimize"; minBtn.textContent="−";
  const closeBtn = document.createElement("button"); closeBtn.id="gf-close"; closeBtn.textContent="✕";
  btnCont.appendChild(minBtn); btnCont.appendChild(closeBtn);
  header.appendChild(btnCont); panel.appendChild(header);

  const body = document.createElement("div"); body.id = "gf-body";
  const status = document.createElement("div"); status.id = "gf-status"; status.textContent = "✅ Ready to Scan!";
  
  // ── Update Notice in Floating Panel ──
  const updateBanner = document.createElement("div");
  updateBanner.id = "gf-update-banner";
  updateBanner.style.cssText = "display:none; background:#e8f1ff; border:1px solid #c5d9f1; border-radius:6px; padding:10px; margin-bottom:12px; border-left:4px solid #3d5a80;";
  updateBanner.innerHTML = `
    <div style="font-size:12px; font-weight:700; color:#1a237e; margin-bottom:4px;">✨ New Version Available!</div>
    <div style="font-size:11px; color:#3d5a80; margin-bottom:8px;">A newer version is ready on GitHub.</div>
    <a href="https://github.com/psychiotric-sudo/GFormsToGPT" target="_blank" style="display:block; background:#3d5a80; color:#fff; text-align:center; padding:6px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:600;">Update Now</a>
  `;
  body.appendChild(updateBanner);
  body.appendChild(status);

  // Check storage for update flag
  chrome.storage.local.get(["updateAvailable"], (data) => {
    if (data.updateAvailable) updateBanner.style.display = "block";
  });

  const sec1 = document.createElement("div"); sec1.className = "gf-section";
  sec1.innerHTML = `<div class="gf-section-title">Step 1: Extract</div>`;
  const scanBtn = document.createElement("button"); scanBtn.className = "gf-button gf-button-primary"; scanBtn.style.width="100%"; scanBtn.textContent = "🔍 Scan Form & Open ChatGPT";
  const resetBtn = document.createElement("button"); resetBtn.className = "gf-button gf-button-secondary"; resetBtn.style.width="100%"; resetBtn.style.marginTop="8px"; resetBtn.style.fontSize="11px"; resetBtn.textContent = "🔄 Reset Count";
  const filtNot = document.createElement("div"); filtNot.id = "gf-filtered-notice";
  sec1.appendChild(scanBtn); sec1.appendChild(resetBtn); sec1.appendChild(filtNot);
  body.appendChild(sec1);

  const sec2 = document.createElement("div"); sec2.className = "gf-section";
  sec2.innerHTML = `<div class="gf-section-title">Step 2: Paste Response</div>`;
  const output = document.createElement("textarea"); output.id = "gf-output"; output.placeholder = "Paste ChatGPT JSON here...";
  sec2.appendChild(output); body.appendChild(sec2);

  const sec3 = document.createElement("div"); sec3.className = "gf-section";
  sec3.innerHTML = `<div class="gf-section-title">Step 3: Fill</div>`;
  const bg = document.createElement("div"); bg.className = "gf-btn-group";
  const fillBtn = document.createElement("button"); fillBtn.className = "gf-button gf-button-success"; fillBtn.textContent = "✨ Fill Form";
  const clearBtn = document.createElement("button"); clearBtn.className = "gf-button gf-button-secondary"; clearBtn.textContent = "🗑️ Clear";
  bg.appendChild(fillBtn); bg.appendChild(clearBtn);
  sec3.appendChild(bg); body.appendChild(sec3);

  const auth = document.createElement("div"); auth.className = "gf-author";
  auth.innerHTML = `Made by <a href="https://t.me/chqrlzz" target="_blank">@chqrlzz</a>`;
  body.appendChild(auth);

  panel.appendChild(body);
  document.body.appendChild(panel);

  chrome.storage.local.get([`gform_count_${formId}`]).then(d => {
    resetBtn.textContent = `🔄 Reset Count (${d[`gform_count_${formId}`] || 0})`;
  });

  minBtn.onclick = () => { panel.classList.toggle("minimized"); minBtn.textContent = panel.classList.contains("minimized") ? "+" : "−"; };
  closeBtn.onclick = () => { panel.style.display = "none"; };
  resetBtn.onclick = async () => { await chrome.storage.local.remove(`gform_count_${formId}`); resetBtn.textContent = "🔄 Reset Count (0)"; status.textContent = "🔄 Counter Reset!"; showToast("Counter reset successfully", "info"); };
  clearBtn.onclick = () => { document.querySelectorAll('input[type="text"], textarea').forEach(i => i.value = ""); document.querySelectorAll('[role="checkbox"][aria-checked="true"]').forEach(c => c.click()); output.value = ""; status.textContent = "🗑️ Cleared!"; showToast("Form cleared", "info"); };

  function sleepAsync(ms) { return new Promise(res => setTimeout(res, ms)); }
  function normalizeQuestionText(t) { return t.toLowerCase().replace(/\s+/g, " ").trim(); }

  scanBtn.onclick = async () => {
    log("Scan button clicked");
    status.textContent = "🔍 Initializing scan...";
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

    status.textContent = "🔍 Scanning questions...";

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
      status.textContent = "❌ No questions found."; 
      showToast("No questions found! Make sure the form is fully loaded.", "error");
      return; 
    }

    chrome.runtime.sendMessage({ action: "reportStats", payload: { scannedCount: pc, types: Array.from(types).join(", ") } });
    await chrome.storage.local.set({ [sk]: qc });
    resetBtn.textContent = `🔄 Reset Count (${qc})`;

    status.textContent = `✅ Scanned ${pc} questions. Opening ChatGPT...`;
    showToast("Questions extracted! Switching to ChatGPT...", "success");
    
    const prompt = `Act as an intelligent form-filler. ${customInstructions ? `RULE: ${customInstructions}` : ""}

CRITICAL:
1. Output ONLY a valid JSON object. No other text.
2. JSON keys must be question numbers (e.g., "1", "2").
3. For [RADIO], [DROPDOWN], and [CHECKBOX], use ONLY the lowercase letter (e.g., "a", "b"). DO NOT write the option text.
4. For [CHECKBOX], use an array of letters (e.g., ["a", "c"]).
5. For [TEXT] or [TEXTAREA], provide a high-quality written response.

QUESTIONS:
${list}

JSON:`;

    chrome.runtime.sendMessage({ action: "openChatGPT", url: `https://chatgpt.com/?prompt=${encodeURIComponent(prompt).replace(/%20/g, "+")}` });
  };

  fillBtn.onclick = async () => {
    log("Fill button clicked");
    const tStart = Date.now();
    if (!questionMap.size) { status.textContent = "⚠️ Scan first!"; showToast("Please scan the form first", "info"); return; }

    let ans;
    try {
      const m = output.value.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No JSON found");
      ans = JSON.parse(m[0]);
    } catch (e) {
      status.textContent = "❌ Invalid JSON.";
      showToast("AI response invalid. Check manually.", "error");
      chrome.runtime.sendMessage({ action: "reportError", payload: { errorType: "JSON_ERROR", message: e.message } });
      return;
    }

    status.textContent = "⏳ Auto-filling form...";
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
    status.textContent = `✅ Filled ${f}/${t}. Saved ~${saved}s!`;
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
