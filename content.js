// Chrome Extension version of GForm to GPT v4.1.5 - Neural Interface
// Content script injected into Google Forms

(function () {
  "use strict";

  console.log(`[GFormToGPT v${chrome.runtime.getManifest().version}] Neural Interface Active`);

  // ── Configuration & State ──
  let customInstructions = "";
  let useHumanTyping = true; 
  let verboseLogging = true;
  let formTitle = "";
  let questionMap = new Map();

  // Load settings
  chrome.storage.local.get(["customPrompt", "humanTyping", "verboseLogging"], (data) => {
    if (data.customPrompt) customInstructions = data.customPrompt;
    if (data.humanTyping !== undefined) useHumanTyping = data.humanTyping;
    if (data.verboseLogging !== undefined) verboseLogging = data.verboseLogging;
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT]", ...args); }

  // ── UI Styles ──
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    #gf-status-overlay { position: fixed; bottom: 30px; left: 30px; background: rgba(0,0,0,0.9); color: #fff; padding: 12px 24px; border-radius: 50px; font-family: 'Outfit', sans-serif; font-size: 14px; z-index: 2147483646; display: flex; align-items: center; gap: 12px; box-shadow: 0 8px 25px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); transform: translateY(100px); transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; pointer-events: none; }
    #gf-status-overlay.visible { transform: translateY(0); opacity: 1; }
    .gf-pulse { width: 10px; height: 10px; background: #00ff88; border-radius: 50%; animation: gf-pulse 1.5s infinite; }
    @keyframes gf-pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(0, 255, 136, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); } }
    #gf-toast-container { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 2147483649; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .gf-toast { padding: 14px 28px; border-radius: 50px; background: #1a1a1a; color: #fff; font-size: 14px; font-weight: 600; opacity: 0; transform: translateY(20px); transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); box-shadow: 0 10px 20px rgba(0,0,0,0.3); border-bottom: 2px solid #3d5a80; }
    .gf-toast.visible { opacity: 1; transform: translateY(0); }
    .gf-highlight-scanning { outline: 3px solid #3d5a80 !important; outline-offset: 1px !important; transition: outline 0.1s ease !important; }
    .gf-highlight-filling { outline: 4px solid #00ff88 !important; outline-offset: 2px !important; transition: outline 0.2s ease !important; border-radius: 8px !important; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div"); overlay.id = "gf-status-overlay"; document.body.appendChild(overlay);
  const toastCont = document.createElement("div"); toastCont.id = "gf-toast-container"; document.body.appendChild(toastCont);

  function showOverlay(msg) { overlay.innerHTML = `<div class="gf-pulse"></div><span>${msg}</span>`; overlay.classList.add("visible"); }
  function hideOverlay() { overlay.classList.remove("visible"); }
  function showToast(msg) {
    const toast = document.createElement("div"); toast.className = "gf-toast"; toast.textContent = msg;
    toastCont.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 50);
    setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function getFormEmail() {
    const emailEl = document.querySelector('.EbMsme, .Y9699c');
    return emailEl ? emailEl.textContent.trim() : "Unknown User";
  }

  // ── Core Logic ──
  async function scanForm() {
    showOverlay("Neural Scanning Deep Form Data...");
    let containers = Array.from(document.querySelectorAll('[role="listitem"], .Qr7Oae, .geS5ne, .z387u, .m79B2c'));
    if (!containers.length) { 
        hideOverlay();
        return { success: false, error: "Scan failed: No items detected." }; 
    }

    containers = [...new Set(containers)];
    questionMap.clear();
    let qc = 0;
    let list = "";

    for (const c of containers) {
      let h = c.querySelector('[role="heading"]') || c.querySelector('legend') || c.querySelector('.M7Me3b, .w89u7b, .Ho70mc');
      if (!h) continue;
      
      let txt = h.textContent.replace(/\*/g, '').trim();
      if (!txt) continue;

      qc++;
      c.classList.add("gf-highlight-scanning");
      
      const qd = { number: qc, text: txt, type: null, options: [], container: c };
      
      // Type detection
      if (c.querySelector('[role="radio"]')) qd.type = "radio";
      else if (c.querySelector('[role="checkbox"]')) qd.type = "checkbox";
      else if (c.querySelector('[role="listbox"]') || c.querySelector('[role="combobox"]') || c.querySelector('.v08pS') || c.querySelector('.ryv9W')) qd.type = "dropdown";
      else if (c.querySelector('textarea')) qd.type = "textarea";
      else if (c.querySelector('input')) qd.type = "text";

      if (!qd.type) { qc--; c.classList.remove("gf-highlight-scanning"); continue; }

      // Handle Radio/Checkbox options
      if (qd.type === "radio" || qd.type === "checkbox") {
        c.querySelectorAll('[role="radio"], [role="checkbox"], .Od2B9h, .u67un, .L97oY').forEach((el, i) => {
          let label = el.getAttribute("aria-label") || el.textContent.trim();
          if (!label) {
              const labelEl = el.closest('label') || el.parentElement.querySelector('.wG4flb, .XV7SSe, .a-X');
              if (labelEl) label = labelEl.textContent.trim();
          }
          if (label) {
            qd.options.push({ letter: String.fromCharCode(97 + qd.options.length), text: label, element: el });
          }
        });
      }
      
      // Handle Dropdown options (ADVANCED RECURSIVE PARSING)
      if (qd.type === "dropdown") {
          const params = c.getAttribute('data-params');
          if (params) {
              try {
                  const cleaned = params.replace('%.@.', '');
                  const data = JSON.parse(cleaned);
                  
                  // Look for the options array in the nested Google Form JSON structure
                  // It's usually in [0][4][0][1] or [0][1][0][1]
                  let opts = null;
                  const findOptions = (obj) => {
                      if (Array.isArray(obj)) {
                          if (obj.length > 5 && Array.isArray(obj[1]) && obj[1].length > 0 && typeof obj[1][0] === 'string') {
                              return obj;
                          }
                          for (let i = 0; i < obj.length; i++) {
                              let found = findOptions(obj[i]);
                              if (found) return found;
                          }
                      }
                      return null;
                  };
                  
                  const optionsParent = findOptions(data);
                  if (optionsParent && Array.isArray(optionsParent)) {
                      optionsParent.forEach(opt => {
                          if (Array.isArray(opt) && opt[0] && typeof opt[0] === 'string') {
                              qd.options.push({ letter: String.fromCharCode(97 + qd.options.length), text: opt[0] });
                          }
                      });
                  }
              } catch(e) { log("Dropdown JSON Err:", e); }
          }
          
          // Fallback to DOM parsing for Dropdowns
          if (!qd.options.length) {
              // Sometimes options are already in the DOM but hidden
              const domOptions = c.querySelectorAll('[role="option"], .v08pS option, .ryv9W option');
              domOptions.forEach((el) => {
                  let label = el.textContent.trim() || el.getAttribute('data-value');
                  if (label && !/Choose|Select/i.test(label)) {
                      qd.options.push({ letter: String.fromCharCode(97 + qd.options.length), text: label, element: el });
                  }
              });
          }
      }
      
      questionMap.set(qc, qd);
      list += `Q${qc}. [${qd.type.toUpperCase()}] ${txt}\n`;
      qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
      list += "\n";
      
      setTimeout(() => c.classList.remove("gf-highlight-scanning"), 50);
    }

    const titleEl = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('.freebirdFormviewerViewHeaderTitle, .F9vEBc');
    formTitle = titleEl ? titleEl.textContent.trim() : "Google Form";

    showToast(`Scan Complete: ${qc} questions found.`);
    hideOverlay();

    const prompt = `Act as an intelligent form-filler. Search the internet first for factual answers. ${customInstructions}
    Output ONLY valid JSON. Keys: numbers ("1"). Values: lowercase letters ("a") or detailed text.
    QUESTIONS:\n${list}\nJSON:`;

    return { success: true, qc, prompt, formTitle, email: getFormEmail() };
  }

  async function fillForm(answers) {
    if (!questionMap.size) { await scanForm(); }
    showOverlay("Injecting Neural Responses...");
    
    let filled = 0, total = 0;
    const historyPayload = { formTitle, questions: [] };

    for (const [num, qd] of questionMap.entries()) {
      const val = answers[num] || answers[String(num)];
      if (val === undefined) continue;
      
      total++;
      qd.container.scrollIntoView({ behavior: "smooth", block: "center" });
      qd.container.classList.add("gf-highlight-filling");
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
          const input = qd.container.querySelector('input, textarea');
          if (input) {
            input.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, String(val));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        } else if (qd.type === "dropdown") {
            log("Dropdown auto-select requested for:", val);
            // Dropdowns are difficult to automate headlessly, but we save the intent to history
        }
        historyPayload.questions.push({ q: qd.text, a: String(val) });
      } catch (e) { log("Fill Err:", e); }
      
      await sleep(50); 
      qd.container.classList.remove("gf-highlight-filling");
    }
    
    hideOverlay();
    showToast(`Neural Filling Complete: ${filled}/${total} items.`);
    chrome.runtime.sendMessage({ action: "saveToHistory", payload: historyPayload });
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { formTitle, filledCount: filled, totalCount: total, secondsSaved: filled * 10, email: getFormEmail() } });
    
    return { success: true, filled, total };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanForm") { scanForm().then(sendResponse); return true; }
    else if (request.action === "fillForm") { fillForm(request.answers).then(sendResponse); return true; }
    else if (request.action === "autoFillForm") { fillForm(request.data).then(sendResponse); return true; }
  });
})();
