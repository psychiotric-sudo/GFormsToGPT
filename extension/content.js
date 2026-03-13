// Chrome Extension version of GForm to GPT
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log("🚀 [GFormToGPT v3.2.0] Script execution started");

  // ── Personal question filter keywords (Default) ──
  let personalKeywords = [
    "name", "full name", "email", "gmail", "section", "class", "grade", "year", "student number", "id", "phone", "contact", "address", "school",
  ];

  // Settings
  let customInstructions = "";
  let useHumanTyping = false; 
  let formTitle = "";
  let formDescription = "";

  // Load settings
  chrome.storage.local.get(["customPrompt", "ignoredKeywords", "humanTyping"], (data) => {
    if (data.customPrompt) customInstructions = data.customPrompt;
    if (data.humanTyping) useHumanTyping = data.humanTyping;
    if (data.ignoredKeywords) {
      const userKeywords = data.ignoredKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(k => k);
      personalKeywords = [...new Set([...personalKeywords, ...userKeywords])];
    }
    console.log("⚙️ [GFormToGPT] Settings loaded.", { customInstructions, useHumanTyping });
  });

  function isPersonalQuestion(questionText) {
    const lowerText = questionText.toLowerCase();
    return personalKeywords.some((keyword) => {
      const boundaryRegex = new RegExp(`(^|\\s|:)${keyword}(\\s|$|\\?|:)`, "i");
      return boundaryRegex.test(lowerText);
    });
  }

  // ── Form Metadata Extraction ──
  function extractFormMetadata() {
    try {
      const titleEl = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('.freebirdFormviewerViewHeaderTitle');
      if (titleEl) formTitle = titleEl.textContent.trim();
      const descEl = document.querySelector('.freebirdFormviewerViewHeaderDescription') || document.querySelector('div[dir="auto"]');
      if (descEl && descEl !== titleEl) {
         formDescription = descEl.textContent.trim().substring(0, 500);
      }
    } catch (e) {
      console.log("⚠️ [GFormToGPT] Metadata error:", e);
    }
  }

  // ── Human-Like Typing Simulation ──
  async function humanType(element, text) {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(element, ""); else element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));

    for (const char of text) {
      if (setter) setter.call(element, element.value + char); else element.value += char;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await sleepAsync(20 + Math.random() * 60);
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let questionMap = new Map();
  let formId = window.location.pathname.split("/")[3] || "default";

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoFillForm") {
      console.log("🤖 [GFormToGPT] Auto-fill message received!");
      if (request.rawJson) {
        output.value = request.rawJson;
        fillButton.click();
        sendResponse({ success: true });
      }
    }
    return true;
  });

  // ── Styles ──
  const style = document.createElement("style");
  style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
        #gf-panel{position:fixed;top:20px;right:20px;width:420px;background:#f5f5f5;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10000000;font-family:'Outfit',sans-serif;color:#202124;overflow:hidden;}
        #gf-panel.minimized #gf-body {display:none;}
        #gf-header-top{background:linear-gradient(135deg, #3d5a80 0%, #2d4563 100%);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;}
        #gf-title{font-size:15px;font-weight:700;color:#fff;margin:0;flex:1;}
        #gf-minimize, #gf-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
        #gf-minimize:hover, #gf-close:hover{background:rgba(255,255,255,0.4);}
        #gf-body{padding:16px;max-height:600px;overflow-y:auto;background:#fff;}
        .gf-section{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e0e0e0;}
        .gf-section:last-child{border-bottom:none;}
        .gf-section-title{font-size:12px;font-weight:600;color:#3d5a80;margin-bottom:8px;text-transform:uppercase;}
        .gf-helper-text{font-size:12px;color:#666;margin-bottom:12px;line-height:1.4;}
        #gf-status{background:#e8f1ff;padding:12px;border-radius:6px;font-size:13px;margin-bottom:12px;color:#1a237e;border-left:4px solid #3d5a80;border:1px solid #c5d9f1;}
        .gf-btn-group{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
        #gf-output{width:100%;height:100px;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:11px;font-family:monospace;resize:vertical;margin-bottom:12px;box-sizing:border-box;}
        .gf-button{padding:10px 14px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;}
        .gf-button-primary{background:#3d5a80;color:#fff;}
        .gf-button-success{background:#4caf50;color:#fff;}
        .gf-button-secondary{background:#e0e0e0;color:#333;}
        .gf-author{margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:13px;color:#666;text-align:center;}
        .gf-author a{color:#0a8cdc;text-decoration:none;font-weight:600;}
        #gf-filtered-notice{font-size:12px;color:#856404;background-color:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:4px;margin-bottom:12px;display:none;}
    `;
  document.head.appendChild(style);

  // ── Panel Structure ──
  const panel = document.createElement("div");
  panel.id = "gf-panel";
  const headerTop = document.createElement("div");
  headerTop.id = "gf-header-top";
  const titleContainer = document.createElement("div");
  titleContainer.innerHTML = `<h2 id="gf-title">GForms to GPT</h2><div style="font-size:10px; color:rgba(255,255,255,0.7)">by @chqrlzz</div>`;
  const btnContainer = document.createElement("div");
  btnContainer.style.display = "flex"; btnContainer.style.gap = "4px";
  const minimizeButton = document.createElement("button"); minimizeButton.id = "gf-minimize"; minimizeButton.textContent = "−";
  const closeButton = document.createElement("button"); closeButton.id = "gf-close"; closeButton.textContent = "✕";
  btnContainer.appendChild(minimizeButton); btnContainer.appendChild(closeButton);
  headerTop.appendChild(titleContainer); headerTop.appendChild(btnContainer);
  panel.appendChild(headerTop);

  const body = document.createElement("div"); body.id = "gf-body";
  const status = document.createElement("div"); status.id = "gf-status"; status.textContent = "✅ Ready! Click Scan Form to start.";
  body.appendChild(status);

  // Section 1: Scan
  const section1 = document.createElement("div"); section1.className = "gf-section";
  section1.innerHTML = `<div class="gf-section-title">Step 1: Extract Questions</div><p class="gf-helper-text">Scan all questions and send them to ChatGPT.</p>`;
  const scanButton = document.createElement("button"); scanButton.className = "gf-button gf-button-primary"; scanButton.style.width = "100%"; scanButton.textContent = "🔍 Scan Form & Open ChatGPT";
  const resetCountButton = document.createElement("button"); resetCountButton.className = "gf-button gf-button-secondary"; resetCountButton.style.width = "100%"; resetCountButton.style.marginTop = "8px"; resetCountButton.style.fontSize = "11px"; resetCountButton.textContent = "🔄 Reset Count (0)";
  const filteredNotice = document.createElement("div"); filteredNotice.id = "gf-filtered-notice";
  section1.appendChild(scanButton); section1.appendChild(resetCountButton); section1.appendChild(filteredNotice);
  body.appendChild(section1);

  // Section 2: Paste
  const section2 = document.createElement("div"); section2.className = "gf-section";
  section2.innerHTML = `<div class="gf-section-title">Step 2: Paste Response</div><textarea id="gf-output" placeholder="Paste JSON here..."></textarea>`;
  const output = section2.querySelector("textarea");
  body.appendChild(section2);

  // Section 3: Fill
  const section3 = document.createElement("div"); section3.className = "gf-section";
  section3.innerHTML = `<div class="gf-section-title">Step 3: Auto-Fill</div>`;
  const btnGroup = document.createElement("div"); btnGroup.className = "gf-btn-group";
  const fillButton = document.createElement("button"); fillButton.className = "gf-button gf-button-success"; fillButton.textContent = "✨ Fill Form";
  const clearButton = document.createElement("button"); clearButton.className = "gf-button gf-button-secondary"; clearButton.textContent = "🗑️ Clear";
  btnGroup.appendChild(fillButton); btnGroup.appendChild(clearButton);
  section3.appendChild(btnGroup);
  body.appendChild(section3);

  body.innerHTML += `<div class="gf-author">Made by <a href="https://t.me/chqrlzz" target="_blank">@chqrlzz</a></div>`;
  panel.appendChild(body);
  document.body.appendChild(panel);

  // Update reset button text
  chrome.storage.local.get([`gform_count_${formId}`]).then(d => {
    resetCountButton.textContent = `🔄 Reset Count (${d[`gform_count_${formId}`] || 0})`;
  });

  // ── Handlers ──
  minimizeButton.onclick = () => { panel.classList.toggle("minimized"); minimizeButton.textContent = panel.classList.contains("minimized") ? "+" : "−"; };
  closeButton.onclick = () => { panel.style.display = "none"; };
  resetCountButton.onclick = async () => { await chrome.storage.local.remove(`gform_count_${formId}`); resetCountButton.textContent = "🔄 Reset Count (0)"; status.textContent = "🔄 Reset!"; };

  function sleepAsync(ms) { return new Promise(res => setTimeout(res, ms)); }
  function normalizeQuestionText(t) { return t.toLowerCase().replace(/\s+/g, " ").trim(); }

  // ── SCAN ──
  scanButton.onclick = async () => {
    extractFormMetadata();
    const storageKey = `gform_count_${formId}`;
    const storageData = await chrome.storage.local.get([storageKey]);
    const startCount = storageData[storageKey] || 0;
    
    questionMap.clear();
    filteredNotice.style.display = "none";
    const questionContainers = document.querySelectorAll('[role="listitem"]');
    let qCount = startCount;
    let filteredCount = 0;
    let formattedList = "";
    let pageCount = 0;
    const detectedTypes = new Set();

    for (const container of questionContainers) {
      let heading = container.querySelector('[role="heading"]') || container.querySelector('legend');
      if (!heading) continue;
      let qText = heading.textContent.trim();
      if (container.querySelector('img')) qText += " [Contains Image]";

      if (isPersonalQuestion(qText)) {
        filteredCount++;
        questionMap.set(normalizeQuestionText(qText), { type: "filtered", container });
        continue;
      }

      qCount++; pageCount++;
      const qData = { number: qCount, text: qText, type: null, options: [], container };
      
      const radios = container.querySelectorAll('[role="radio"]');
      if (radios.length) {
        qData.type = "radio";
        radios.forEach((el, i) => {
          let label = el.getAttribute("aria-label") || el.textContent.trim() || el.closest('div')?.textContent.trim();
          qData.options.push({ letter: String.fromCharCode(97 + i), text: label, element: el });
        });
      }

      if (!qData.type) {
        const checks = container.querySelectorAll('[role="checkbox"]');
        if (checks.length) {
          qData.type = "checkbox";
          checks.forEach((el, i) => {
            qData.options.push({ letter: String.fromCharCode(97 + i), text: el.getAttribute("aria-label") || el.textContent.trim(), element: el });
          });
        }
      }

      if (!qData.type) {
        const drop = container.querySelector('[role="combobox"], [role="button"][aria-haspopup]');
        if (drop) {
          qData.type = "dropdown"; qData.dropdownTrigger = drop;
          drop.click(); await sleepAsync(350);
          const opts = document.querySelectorAll('[role="option"]');
          let oi = 0;
          opts.forEach(el => {
            const txt = el.textContent.trim();
            if (txt && txt.toLowerCase() !== "choose") {
              qData.options.push({ letter: String.fromCharCode(97 + oi), text: txt, element: el });
              oi++;
            }
          });
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleepAsync(200);
        }
      }

      if (!qData.type) {
        const inp = container.querySelector('input[type="text"], input[type="email"], input[type="number"]');
        if (inp) { qData.type = "text"; qData.inputElement = inp; }
      }

      if (!qData.type) {
        const area = container.querySelector("textarea");
        if (area) { qData.type = "textarea"; qData.inputElement = area; }
      }

      if (!qData.type) continue;
      detectedTypes.add(qData.type);
      questionMap.set(normalizeQuestionText(qText), qData);
      formattedList += `Q${qCount}. [${qData.type.toUpperCase()}] ${qText}\n`;
      qData.options.forEach(o => formattedList += `   ${o.letter}) ${o.text}\n`);
      formattedList += "\n";
    }

    if (!pageCount) { status.textContent = "❌ No questions found."; return; }

    chrome.runtime.sendMessage({ action: "reportStats", payload: { scannedCount: pageCount, types: Array.from(detectedTypes).join(", ") } });
    await chrome.storage.local.set({ [storageKey]: qCount });
    resetCountButton.textContent = `🔄 Reset Count (${qCount})`;

    if (filteredCount > 0) {
      filteredNotice.style.display = "block";
      filteredNotice.textContent = `⚠️ ${filteredCount} personal questions skipped.`;
    }

    status.textContent = `✅ Found ${pageCount} questions! ChatGPT opening...`;
    const prompt = `You are answering questions from a Google Form.\n${formTitle ? `TITLE: ${formTitle}\n` : ""}${formDescription ? `CONTEXT: ${formDescription}\n` : ""}${customInstructions ? `USER RULES: ${customInstructions}\n` : ""}Output ONLY JSON.\n\n${formattedList}`;
    
    chrome.runtime.sendMessage({ action: "openChatGPT", url: `https://chatgpt.com/?prompt=${encodeURIComponent(prompt).replace(/%20/g, "+")}&hints=search` });
  };

  // ── FILL ──
  fillButton.onclick = async () => {
    const startTime = Date.now();
    if (!questionMap.size) { status.textContent = "⚠️ Scan first!"; return; }

    let answers;
    try {
      const match = output.value.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON");
      answers = JSON.parse(match[0]);
    } catch (e) {
      status.textContent = "❌ Invalid JSON.";
      chrome.runtime.sendMessage({ action: "reportError", payload: { errorType: "JSON_ERROR", message: e.message } });
      return;
    }

    status.textContent = "⏳ Filling...";
    let filled = 0, total = 0;

    for (const q of questionMap.values()) {
      if (q.type === "filtered") continue;
      total++;
      const ans = answers[q.number] ?? answers[String(q.number)];
      if (ans === undefined || ans === null) continue;

      q.container.style.outline = "2px solid #4caf50";
      q.container.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleepAsync(150);

      try {
        if (q.type === "radio") {
          const opt = q.options.find(o => o.letter === String(ans).toLowerCase());
          if (opt) { opt.element.click(); filled++; }
        } else if (q.type === "checkbox") {
          const letters = (Array.isArray(ans) ? ans : [ans]).map(l => String(l).toLowerCase());
          let ok = false;
          for (const l of letters) {
            const opt = q.options.find(o => o.letter === l);
            if (opt && opt.element.getAttribute("aria-checked") !== "true") { opt.element.click(); await sleepAsync(80); ok = true; }
          }
          if (ok) filled++;
        } else if (q.type === "dropdown") {
          q.dropdownTrigger.click(); await sleepAsync(400);
          const live = document.querySelectorAll('[role="option"]');
          const idx = q.options.findIndex(o => o.letter === String(ans).toLowerCase());
          if (idx !== -1 && live[idx]) { live[idx].click(); filled++; }
          else { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }
        } else if (q.type === "text" || q.type === "textarea") {
          if (useHumanTyping) { await humanType(q.inputElement, String(ans)); }
          else {
            q.inputElement.focus();
            const s = Object.getOwnPropertyDescriptor(q.inputElement.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
            if (s) s.call(q.inputElement, String(ans)); else q.inputElement.value = String(ans);
            q.inputElement.dispatchEvent(new Event("input", { bubbles: true }));
            q.inputElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
          filled++;
        }
      } catch (e) { console.error(e); }
      await sleepAsync(200); q.container.style.outline = "";
    }

    const saved = Math.round((total * 10) - ((Date.now() - startTime) / 1000));
    status.textContent = `✅ Filled ${filled}/${total}. Saved ~${saved}s!`;
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { filledCount: filled, totalCount: total, secondsSaved: Math.max(0, saved) } });
  };

  clearButton.onclick = () => {
    document.querySelectorAll('input[type="text"], textarea').forEach(i => i.value = "");
    document.querySelectorAll('[role="checkbox"][aria-checked="true"]').forEach(c => c.click());
    output.value = ""; status.textContent = "🗑️ Cleared!";
  };

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault(); panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  // Dragging
  let isDragging = false, ox = 0, oy = 0;
  headerTop.onmousedown = (e) => {
    if (e.target === closeButton || e.target === minimizeButton) return;
    isDragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop;
  };
  document.onmousemove = (e) => { if (isDragging) { panel.style.left = e.clientX - ox + "px"; panel.style.top = e.clientY - oy + "px"; panel.style.right = "auto"; } };
  document.onmouseup = () => isDragging = false;

})();
