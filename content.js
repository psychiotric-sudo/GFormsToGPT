// Chrome Extension version of GForm to GPT v3.8.0
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log(`[GFormToGPT v${chrome.runtime.getManifest().version}] Neural Interface Active`);

  // ── Configuration & State ──
  let personalKeywords = ["name", "full name", "email", "gmail", "section", "class", "grade", "year", "student number", "id", "phone", "contact", "address", "school"];
  let customInstructions = "";
  let useHumanTyping = false; 
  let verboseLogging = false;
  let formTitle = "";
  let formDescription = "";
  let questionMap = new Map();
  let formId = window.location.pathname.split("/")[3] || "default";

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

  // ── UI Styles ──
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    
    :root {
      --gf-primary: #3d5a80;
      --gf-success: #4caf50;
      --gf-bg: #f5f5f5;
      --gf-surface: #ffffff;
      --gf-text: #202124;
    }

    #gf-panel { position: fixed; top: 20px; right: 20px; width: 420px; background: var(--gf-bg); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 2147483647; font-family: 'Outfit', sans-serif; overflow: hidden; border: 1px solid #ddd; }
    #gf-panel.minimized #gf-body { display: none; }
    #gf-header { background: linear-gradient(135deg, #3d5a80 0%, #2d4563 100%); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; cursor: grab; color: #fff; }
    #gf-header h2 { font-size: 16px; margin: 0; font-weight: 700; }
    #gf-header .controls { display: flex; gap: 8px; }
    #gf-header button { background: rgba(255,255,255,0.15); border: none; color: #fff; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
    #gf-header button:hover { background: rgba(255,255,255,0.3); }

    #gf-body { padding: 20px; max-height: 70vh; overflow-y: auto; background: var(--gf-surface); }
    .gf-section { margin-bottom: 20px; }
    .gf-label { font-size: 11px; font-weight: 700; color: var(--gf-primary); text-transform: uppercase; margin-bottom: 8px; display: block; }
    
    #gf-status-overlay { position: fixed; bottom: 30px; left: 30px; background: rgba(0,0,0,0.85); color: #fff; padding: 10px 20px; border-radius: 50px; font-family: 'Outfit', sans-serif; font-size: 13px; z-index: 2147483646; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transform: translateY(100px); transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; }
    #gf-status-overlay.visible { transform: translateY(0); opacity: 1; }
    .gf-pulse { width: 8px; height: 8px; background: #4caf50; border-radius: 50%; animation: gf-pulse 1.5s infinite; }
    @keyframes gf-pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); } }

    .gf-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-family: inherit; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; }
    .gf-btn-primary { background: var(--gf-primary); color: #fff; }
    .gf-btn-success { background: var(--gf-success); color: #fff; }
    .gf-btn-secondary { background: #eee; color: #555; }
    .gf-btn:hover { filter: brightness(0.95); transform: translateY(-1px); }
    
    #gf-output { width: 100%; height: 80px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-family: monospace; font-size: 12px; margin-bottom: 12px; resize: none; background: #f9f9f9; }

    /* Review Screen */
    #gf-review-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 2147483648; display: none; align-items: center; justify-content: center; }
    #gf-review-modal.visible { display: flex; }
    #gf-review-content { background: #fff; width: 90%; max-width: 600px; border-radius: 16px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }
    #gf-review-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    #gf-review-body { padding: 20px; overflow-y: auto; flex: 1; }
    #gf-review-footer { padding: 20px; border-top: 1px solid #eee; display: flex; gap: 12px; }
    
    .review-item { margin-bottom: 20px; padding: 15px; border: 1px solid #f0f0f0; border-radius: 10px; background: #fafafa; }
    .review-q { font-weight: 700; font-size: 14px; color: var(--gf-primary); margin-bottom: 8px; }
    .review-a { font-size: 14px; color: #333; line-height: 1.5; }
    .confidence-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; float: right; }
    .conf-high { background: #dcfce7; color: #166534; }
    .conf-med { background: #fef9c3; color: #854d0e; }

    #gf-toast-container { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 2147483649; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
    .gf-toast { padding: 12px 24px; border-radius: 50px; background: #333; color: #fff; font-size: 13px; font-weight: 500; opacity: 0; transform: translateY(20px); transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .gf-toast.visible { opacity: 1; transform: translateY(0); }
  `;
  document.head.appendChild(style);

  // ── Helper Functions ──
  function showOverlay(msg) {
    overlay.innerHTML = `<div class="gf-pulse"></div><span>${msg}</span>`;
    overlay.classList.add("visible");
  }
  function hideOverlay() { overlay.classList.remove("visible"); }
  
  function showToast(msg) {
    const toast = document.createElement("div");
    toast.className = "gf-toast";
    toast.textContent = msg;
    document.getElementById("gf-toast-container").appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 50);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function isPersonalQuestion(text) {
    const lower = text.toLowerCase();
    return personalKeywords.some(k => lower.includes(k));
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── UI Construction ──
  const overlay = document.createElement("div"); overlay.id = "gf-status-overlay";
  document.body.appendChild(overlay);

  const toastCont = document.createElement("div"); toastCont.id = "gf-toast-container";
  document.body.appendChild(toastCont);

  const panel = document.createElement("div"); panel.id = "gf-panel";
  panel.innerHTML = `
    <div id="gf-header">
      <h2>GForm to GPT</h2>
      <div class="controls">
        <button id="gf-min" title="Minimize">－</button>
        <button id="gf-cls" title="Close">×</button>
      </div>
    </div>
    <div id="gf-body">
      <div class="gf-section">
        <span class="gf-label">Engine Configuration</span>
        <select id="gf-ai-type" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd; font-family:inherit; margin-bottom:12px;">
          <option value="chatgpt">OpenAI ChatGPT</option>
          <option value="claude">Anthropic Claude 3.5</option>
          <option value="gemini">Google Gemini 1.5</option>
        </select>
        <button id="gf-scan-btn" class="gf-btn gf-btn-primary">Scan & Extract Questions</button>
      </div>
      <div class="gf-section">
        <span class="gf-label">AI Intelligence Data</span>
        <textarea id="gf-output" placeholder="Paste response JSON here..."></textarea>
        <button id="gf-review-btn" class="gf-btn gf-btn-success">Review & Fill Form</button>
      </div>
      <div style="font-size:11px; color:#999; text-align:center;">
        Engineered by @chqrlzz | 2026
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const reviewModal = document.createElement("div"); reviewModal.id = "gf-review-modal";
  reviewModal.innerHTML = `
    <div id="gf-review-content">
      <div id="gf-review-header">
        <h3 style="margin:0; font-size:18px;">Neural Verification Screen</h3>
        <span style="font-size:12px; color:#666;">Verify answers before injection</span>
      </div>
      <div id="gf-review-body"></div>
      <div id="gf-review-footer">
        <button id="gf-cancel-review" class="gf-btn gf-btn-secondary" style="flex:1;">Discard</button>
        <button id="gf-confirm-review" class="gf-btn gf-btn-success" style="flex:2;">Confirm & Fill Form</button>
      </div>
    </div>
  `;
  document.body.appendChild(reviewModal);

  // ── Logic ──
  document.getElementById("gf-min").onclick = () => panel.classList.toggle("minimized");
  document.getElementById("gf-cls").onclick = () => panel.style.display = "none";
  document.getElementById("gf-cancel-review").onclick = () => reviewModal.classList.remove("visible");

  const scanBtn = document.getElementById("gf-scan-btn");
  scanBtn.onclick = async () => {
    showOverlay("Initializing Neural Scan...");
    const containers = document.querySelectorAll('[role="listitem"]');
    if (!containers.length) { showToast("No questions detected."); hideOverlay(); return; }

    questionMap.clear();
    let qc = 0, pc = 0;
    let list = "";

    for (const c of containers) {
      let h = c.querySelector('[role="heading"]') || c.querySelector('legend');
      if (!h) continue;
      
      let txt = h.textContent.trim();
      if (isPersonalQuestion(txt)) { pc++; continue; }

      qc++;
      const qd = { number: qc, text: txt, type: null, options: [], container: c };
      
      // Determine type
      if (c.querySelector('[role="radio"]')) qd.type = "radio";
      else if (c.querySelector('[role="checkbox"]')) qd.type = "checkbox";
      else if (c.querySelector('[role="combobox"]')) qd.type = "dropdown";
      else if (c.querySelector('textarea')) qd.type = "textarea";
      else if (c.querySelector('input')) qd.type = "text";

      if (!qd.type) continue;

      if (qd.type === "radio" || qd.type === "checkbox") {
        c.querySelectorAll('[role="radio"], [role="checkbox"]').forEach((el, i) => {
          qd.options.push({ letter: String.fromCharCode(97 + i), text: el.getAttribute("aria-label") || el.textContent.trim(), element: el });
        });
      }

      questionMap.set(qc, qd);
      list += `Q${qc}. [${qd.type.toUpperCase()}] ${txt}\n`;
      qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
      list += "\n";
    }

    const titleEl = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('.freebirdFormviewerViewHeaderTitle');
    formTitle = titleEl ? titleEl.textContent.trim() : "Untitled Form";

    showToast(`Scanned ${qc} questions. ${pc} filtered.`);
    
    const prompt = `Act as an intelligent form-filler. ${customInstructions}
    Output ONLY valid JSON.
    JSON keys: question numbers ("1", "2").
    For RADIO/DROPDOWN/CHECKBOX: Use lowercase letters ("a", "b").
    For TEXT/TEXTAREA: Provide a factual, detailed response.

    QUESTIONS:
    ${list}

    JSON:`;

    const aiType = document.getElementById("gf-ai-type").value;
    let url = "";
    if (aiType === "claude") url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    else if (aiType === "gemini") url = `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`;
    else url = `https://chatgpt.com/?prompt=${encodeURIComponent(prompt).replace(/%20/g, "+")}`;

    showOverlay("Redirecting to AI...");
    await sleep(800);
    chrome.runtime.sendMessage({ action: "openAI", url: url, aiType });
    hideOverlay();
  };

  const reviewBtn = document.getElementById("gf-review-btn");
  const reviewBody = document.getElementById("gf-review-body");
  let pendingAnswers = null;

  function getFormattedAnswer(qd, val) {
    if (!val) return "";
    if (qd.type === "text" || qd.type === "textarea") return String(val);
    
    const vals = Array.isArray(val) ? val : [val];
    return vals.map(v => {
      const opt = qd.options.find(o => o.letter === String(v).toLowerCase());
      return opt ? `${String(v).toUpperCase()}. ${opt.text}` : String(v).toUpperCase();
    }).join(", ");
  }

  reviewBtn.onclick = () => {
    const raw = document.getElementById("gf-output").value.trim();
    if (!raw) { showToast("Please paste the AI JSON response."); return; }

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      pendingAnswers = JSON.parse(match[0]);
    } catch (e) {
      showToast("Invalid JSON format.");
      return;
    }

    reviewBody.innerHTML = "";
    for (const [num, qd] of questionMap.entries()) {
      const ans = pendingAnswers[num] || pendingAnswers[String(num)];
      if (ans === undefined) continue;

      const formatted = getFormattedAnswer(qd, ans);
      const item = document.createElement("div");
      item.className = "review-item";
      item.innerHTML = `
        <div class="review-q">Q${num}: ${qd.text}</div>
        <div class="review-a">${formatted}</div>
      `;
      reviewBody.appendChild(item);
    }

    reviewModal.classList.add("visible");
  };

  document.getElementById("gf-confirm-review").onclick = async () => {
    reviewModal.classList.remove("visible");
    showOverlay("Injecting Neural Responses...");
    
    let filled = 0, total = 0;
    const historyPayload = { formTitle, questions: [] };

    for (const [num, qd] of questionMap.entries()) {
      const val = pendingAnswers[num] || pendingAnswers[String(num)];
      if (val === undefined) continue;
      total++;

      const formatted = getFormattedAnswer(qd, val);
      qd.container.scrollIntoView({ behavior: "smooth", block: "center" });
      qd.container.style.outline = "2px solid var(--gf-success)";
      await sleep(150);

      try {
        if (qd.type === "radio") {
          const opt = qd.options.find(o => o.letter === String(val).toLowerCase());
          if (opt) { opt.element.click(); filled++; }
        } else if (qd.type === "checkbox") {
          const vals = Array.isArray(val) ? val : [val];
          vals.forEach(v => {
            const opt = qd.options.find(o => o.letter === String(v).toLowerCase());
            if (opt && opt.element.getAttribute("aria-checked") !== "true") opt.element.click();
          });
          filled++;
        } else if (qd.type === "text" || qd.type === "textarea") {
          qd.container.querySelector('input, textarea').focus();
          document.execCommand('insertText', false, String(val));
          filled++;
        }
        historyPayload.questions.push({ q: qd.text, a: formatted });
      } catch (e) { console.error(e); }
      
      await sleep(100);
      qd.container.style.outline = "";
    }

    hideOverlay();
    showToast(`Form complete! Filled ${filled}/${total} questions.`);
    
    chrome.runtime.sendMessage({ action: "saveToHistory", payload: historyPayload });
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { filledCount: filled, totalCount: total, secondsSaved: filled * 10 } });
  };

  // Keyboard shortcut
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "togglePanel") {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    } else if (request.action === "autoFillForm") {
      document.getElementById("gf-output").value = request.rawJson;
      reviewBtn.click();
    }
  });

})();
