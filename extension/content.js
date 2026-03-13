// Chrome Extension version of GForm to GPT
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log("🚀 [GFormToGPT v3.2.1] Script execution started");

  // ── Personal question filter keywords ──
  let personalKeywords = ["name", "full name", "email", "gmail", "section", "class", "grade", "year", "student number", "id", "phone", "contact", "address", "school"];

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
  });

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
    } catch (e) { console.log("⚠️ Metadata error:", e); }
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

  // ── UI CONSTRUCTION (Safe way) ──
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    #gf-panel{position:fixed;top:20px;right:20px;width:420px;background:#f5f5f5;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);z-index:2147483647;font-family:'Outfit',sans-serif;color:#202124;overflow:hidden;pointer-events:auto;user-select:none;}
    #gf-panel.minimized #gf-body {display:none;}
    #gf-header-top{background:linear-gradient(135deg, #3d5a80 0%, #2d4563 100%);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;cursor:grab;}
    #gf-title-text{font-size:15px;font-weight:700;color:#fff;margin:0;}
    #gf-minimize, #gf-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
    #gf-minimize:hover, #gf-close:hover{background:rgba(255,255,255,0.4);}
    #gf-body{padding:16px;max-height:600px;overflow-y:auto;background:#fff;user-select:text;}
    .gf-section{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e0e0e0;}
    .gf-section-title{font-size:12px;font-weight:600;color:#3d5a80;margin-bottom:8px;text-transform:uppercase;}
    .gf-helper-text{font-size:12px;color:#666;margin-bottom:12px;line-height:1.4;}
    #gf-status{background:#e8f1ff;padding:12px;border-radius:6px;font-size:13px;margin-bottom:12px;color:#1a237e;border-left:4px solid #3d5a80;border:1px solid #c5d9f1;}
    .gf-btn-group{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
    #gf-output{width:100%;height:100px;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:11px;font-family:monospace;resize:vertical;margin-bottom:12px;box-sizing:border-box;}
    .gf-button{padding:10px 14px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;}
    .gf-button-primary{background:#3d5a80;color:#fff;}
    .gf-button-success{background:#4caf50;color:#fff;}
    .gf-button-secondary{background:#e0e0e0;color:#333;}
    .gf-button:hover{filter:brightness(0.9);}
    .gf-button:active{transform:scale(0.98);}
    #gf-filtered-notice{font-size:12px;color:#856404;background-color:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:4px;margin-bottom:12px;display:none;}
    .gf-author{margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:12px;color:#999;text-align:center;}
    .gf-author a{color:#3d5a80;text-decoration:none;font-weight:600;}
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
  body.appendChild(status);

  // Scan Section
  const sec1 = document.createElement("div"); sec1.className = "gf-section";
  sec1.innerHTML = `<div class="gf-section-title">Step 1: Extract</div>`;
  const scanBtn = document.createElement("button"); scanBtn.className = "gf-button gf-button-primary"; scanBtn.style.width="100%"; scanBtn.textContent = "🔍 Scan Form & Open ChatGPT";
  const resetBtn = document.createElement("button"); resetBtn.className = "gf-button gf-button-secondary"; resetBtn.style.width="100%"; resetBtn.style.marginTop="8px"; resetBtn.style.fontSize="11px"; resetBtn.textContent = "🔄 Reset Count";
  const filtNot = document.createElement("div"); filtNot.id = "gf-filtered-notice";
  sec1.appendChild(scanBtn); sec1.appendChild(resetBtn); sec1.appendChild(filtNot);
  body.appendChild(sec1);

  // Response Section
  const sec2 = document.createElement("div"); sec2.className = "gf-section";
  sec2.innerHTML = `<div class="gf-section-title">Step 2: Paste Response</div>`;
  const output = document.createElement("textarea"); output.id = "gf-output"; output.placeholder = "Paste ChatGPT JSON here...";
  sec2.appendChild(output); body.appendChild(sec2);

  // Fill Section
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

  // ── Initial State ──
  chrome.storage.local.get([`gform_count_${formId}`]).then(d => {
    resetBtn.textContent = `🔄 Reset Count (${d[`gform_count_${formId}`] || 0})`;
  });

  // ── Event Handlers ──
  minBtn.onclick = () => { panel.classList.toggle("minimized"); minBtn.textContent = panel.classList.contains("minimized") ? "+" : "−"; };
  closeBtn.onclick = () => { panel.style.display = "none"; };
  resetBtn.onclick = async () => { await chrome.storage.local.remove(`gform_count_${formId}`); resetBtn.textContent = "🔄 Reset Count (0)"; status.textContent = "🔄 Counter Reset!"; };
  clearBtn.onclick = () => { document.querySelectorAll('input[type="text"], textarea').forEach(i => i.value = ""); document.querySelectorAll('[role="checkbox"][aria-checked="true"]').forEach(c => c.click()); output.value = ""; status.textContent = "🗑️ Cleared!"; };

  // ── SCAN ──
  scanBtn.onclick = async () => {
    console.log("🖱️ Scan clicked");
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

    for (const c of containers) {
      let h = c.querySelector('[role="heading"]') || c.querySelector('legend');
      if (!h) continue;
      let txt = h.textContent.trim();
      if (c.querySelector('img')) txt += " [Contains Image]";

      if (isPersonalQuestion(txt)) {
        questionMap.set(txt.toLowerCase().trim(), { type: "filtered", container: c });
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
          drp.click(); await new Promise(r => setTimeout(res, 350));
          const os = document.querySelectorAll('[role="option"]');
          let oi = 0;
          os.forEach(el => {
            const t = el.textContent.trim();
            if (t && t.toLowerCase() !== "choose") {
              qd.options.push({ letter: String.fromCharCode(97 + oi), text: t, element: el });
              oi++;
            }
          });
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 200));
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

      if (!qd.type) continue;
      types.add(qd.type);
      questionMap.set(txt.toLowerCase().trim(), qd);
      list += `Q${qc}. [${qd.type.toUpperCase()}] ${txt}\n`;
      qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
      list += "\n";
    }

    if (!pc) { status.textContent = "❌ No questions found. Try scrolling?"; return; }

    chrome.runtime.sendMessage({ action: "reportStats", payload: { scannedCount: pc, types: Array.from(types).join(", ") } });
    await chrome.storage.local.set({ [sk]: qc });
    resetBtn.textContent = `🔄 Reset Count (${qc})`;

    status.textContent = `✅ Found ${pc} questions! Opening ChatGPT...`;
    const prompt = `Answer these questions from a Google Form.\n${formTitle ? `TITLE: ${formTitle}\n` : ""}${formDescription ? `CONTEXT: ${formDescription}\n` : ""}${customInstructions ? `RULES: ${customInstructions}\n` : ""}Output ONLY JSON.\n\n${list}`;
    chrome.runtime.sendMessage({ action: "openChatGPT", url: `https://chatgpt.com/?prompt=${encodeURIComponent(prompt).replace(/%20/g, "+")}&hints=search` });
  };

  // ── FILL ──
  fillBtn.onclick = async () => {
    log("Fill button clicked");
    const tStart = Date.now();
    if (!questionMap.size) { status.textContent = "⚠️ Scan first!"; return; }

    let ans;
    try {
      const m = output.value.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No JSON");
      ans = JSON.parse(m[0]);
    } catch (e) {
      status.textContent = "❌ Invalid JSON.";
      chrome.runtime.sendMessage({ action: "reportError", payload: { errorType: "JSON_ERROR", message: e.message } });
      return;
    }

    status.textContent = "⏳ Filling...";
    let f=0, t=0;

    for (const q of questionMap.values()) {
      if (q.type === "filtered") continue;
      t++;
      const val = ans[q.number] ?? ans[String(q.number)];
      if (val === undefined || val === null) continue;

      q.container.style.outline = "3px solid #4caf50";
      q.container.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise(r => setTimeout(r, 150));

      try {
        if (q.type === "radio") {
          const o = q.options.find(o => o.letter === String(val).toLowerCase());
          if (o) { o.element.click(); f++; }
        } else if (q.type === "checkbox") {
          const ls = (Array.isArray(val) ? val : [val]).map(l => String(l).toLowerCase());
          let ok = false;
          for (const l of ls) {
            const o = q.options.find(o => o.letter === l);
            if (o && o.element.getAttribute("aria-checked") !== "true") { o.element.click(); await new Promise(r => setTimeout(r, 80)); ok = true; }
          }
          if (ok) f++;
        } else if (q.type === "dropdown") {
          q.dropdownTrigger.click(); await new Promise(r => setTimeout(r, 400));
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
      } catch (e) { console.error(e); }
      await new Promise(r => setTimeout(r, 200)); q.container.style.outline = "";
    }

    const saved = Math.round((t * 10) - ((Date.now() - tStart) / 1000));
    status.textContent = `✅ Filled ${f}/${t}. Saved ~${saved}s!`;
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { filledCount: f, totalCount: t, secondsSaved: Math.max(0, saved) } });
  };

  // ── Drag & Keyboard ──
  document.addEventListener("keydown", (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); panel.style.display = panel.style.display === "none" ? "block" : "none"; } });
  let isDrag = false, ox = 0, oy = 0;
  header.onmousedown = (e) => { if (e.target.closest("button")) return; isDrag = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; };
  document.onmousemove = (e) => { if (isDrag) { panel.style.left = e.clientX - ox + "px"; panel.style.top = e.clientY - oy + "px"; panel.style.right = "auto"; } };
  document.onmouseup = () => isDrag = false;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoFillForm") {
      output.value = request.rawJson;
      fillBtn.click();
      sendResponse({ success: true });
    }
    return true;
  });

})();
istener((request, sender, sendResponse) => {
    if (request.action === "autoFillForm") {
      output.value = request.rawJson;
      fillBtn.click();
      sendResponse({ success: true });
    }
    return true;
  });

})();
