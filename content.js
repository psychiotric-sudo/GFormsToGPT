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

  function pushDiag(payload) {
    chrome.runtime.sendMessage({ action: "diagPush", payload }).catch(() => {});
  }

  function optLetter(index) {
    let result = "";
    let n = index;
    do {
      result = String.fromCharCode(97 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
  }

  // ── UI Styles ──
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500&display=swap');
    #gf-status-overlay { position: fixed; bottom: 30px; left: 30px; background: rgba(15, 12, 41, 0.9); backdrop-filter: blur(16px); color: #fff; padding: 12px 24px; border-radius: 50px; font-family: 'Inter', sans-serif; font-size: 14px; z-index: 2147483646; display: flex; align-items: center; gap: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); transform: translateY(100px); transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; pointer-events: none; }
    #gf-status-overlay.visible { transform: translateY(0); opacity: 1; }
    .gf-pulse { width: 10px; height: 10px; background: rgba(108, 99, 255, 0.8); border-radius: 50%; animation: gf-pulse 1.5s infinite; }
    @keyframes gf-pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(108, 99, 255, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 12px rgba(108, 99, 255, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(108, 99, 255, 0); } }
    #gf-toast-container { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 2147483649; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .gf-toast { padding: 14px 28px; border-radius: 50px; background: rgba(15, 12, 41, 0.9); backdrop-filter: blur(16px); color: #fff; font-size: 14px; font-weight: 500; opacity: 0; transform: translateY(20px); transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); box-shadow: 0 10px 30px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); font-family: 'Inter', sans-serif; }
    .gf-toast.visible { opacity: 1; transform: translateY(0); }
    .gf-highlight-scanning { outline: 3px solid rgba(108, 99, 255, 0.6) !important; outline-offset: 1px !important; transition: outline 0.1s ease !important; border-radius: 8px !important; }
    .gf-highlight-filling { outline: 4px solid rgba(108, 99, 255, 0.8) !important; outline-offset: 2px !important; transition: outline 0.2s ease !important; border-radius: 8px !important; }
    #gf-disclaimer { position: fixed; top: 20px; right: 20px; z-index: 2147483647; background: rgba(15, 12, 41, 0.92); backdrop-filter: blur(20px); color: #fff; padding: 12px 20px; border-radius: 12px; max-width: 300px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.5; opacity: 0; transform: translateX(40px); transition: 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none; }
    #gf-disclaimer.visible { opacity: 1; transform: translateX(0); }
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

  function showDisclaimer() {
    const el = document.createElement("div"); el.id = "gf-disclaimer";
    el.textContent = "Review your answers. The extension is not liable if you fail a quiz.";
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 350);
    }, 10000);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function getFormEmail() {
    const emailEl = document.querySelector('.EbMsme, .Y9699c');
    return emailEl ? emailEl.textContent.trim() : "Unknown User";
  }

  // ── Core Logic ──
  async function scanForm() {
    showOverlay("Neural Scanning Deep Form Data...");
    let containers = Array.from(document.querySelectorAll('[role="listitem"], .Qr7Oae, .geS5ne, .geS5n, .z387u, .m79B2c'));
    if (!containers.length) { 
        hideOverlay();
        return { success: false, error: "Scan failed: No items detected." }; 
    }

    containers = [...new Set(containers)];
    questionMap.clear();
    let qc = 0;
    let list = "";

    function extractOptions(parentEl) {
      const opts = [];
      const items = parentEl.querySelectorAll('[role="radio"], [role="checkbox"], .Od2B9h, .u67un, .L97oY');
      items.forEach(el => {
        let label = el.getAttribute("aria-label") || el.getAttribute("data-value") || el.textContent.trim();
        if (!label) {
          const labelEl = el.closest('label') || el.parentElement.querySelector('.wG4flb, .XV7SSe, .a-X');
          if (labelEl) label = labelEl.textContent.trim();
        }
        if (label) opts.push({ element: el, text: label, value: el.getAttribute("data-value") || "" });
      });
      return opts;
    }

    for (const c of containers) {
      let h = c.querySelector('[role="heading"]') || c.querySelector('legend') || c.querySelector('.M7Me3b, .w89u7b, .Ho70mc');
      if (!h) continue;
      
      let txt = h.textContent.replace(/\*/g, '').trim();
      if (!txt) continue;

      c.classList.add("gf-highlight-scanning");

      // ── MULTI-ROW RADIO GROUPS (grid/matrix) ──
      const radioGroups = c.querySelectorAll('[role="radiogroup"]');
      if (radioGroups.length > 1) {
        const colHeaderEl = c.querySelector('.ssX1Bd');
        const colLabels = [];
        if (colHeaderEl) {
          colHeaderEl.querySelectorAll('.V4d7Ke.OIC90c, .V4d7Ke').forEach(cell => {
            const lbl = cell.textContent.trim();
            if (lbl) colLabels.push(lbl);
          });
        }
        for (const rg of radioGroups) {
          const rowLabel = rg.getAttribute('aria-label') || rg.querySelector('.V4d7Ke.wzWPxe, .Ho70mc')?.textContent?.trim() || "";
          if (!rowLabel) continue;
          qc++;
          const qd = {
            number: qc, type: "radio", container: c, images: [],
            text: `${txt} - ${rowLabel}`,
            options: [], subRow: rg
          };
          rg.querySelectorAll('[role="radio"]').forEach((radio, idx) => {
            const val = radio.getAttribute('data-value') || radio.getAttribute('aria-label') || String(idx + 1);
            const colLabel = colLabels[idx] || val;
            qd.options.push({
              letter: optLetter(qd.options.length),
              text: colLabel,
              element: radio
            });
          });
          questionMap.set(qc, qd);
          list += `Q${qc}. [RADIO] ${rowLabel}\n`;
          qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
          list += "\n";
        }
        setTimeout(() => c.classList.remove("gf-highlight-scanning"), 50);
        continue;
      }

      // ── SINGLE QUESTION ──
      qc++;
      const qd = { number: qc, text: txt, type: null, options: [], container: c, images: [] };

      const seen = new Set();
      const imgEls = c.querySelectorAll('img[src], .freebirdFormviewerComponentsQuestionTextImage img');
      imgEls.forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('http') && !seen.has(src) && qd.images.length < 10) {
          seen.add(src);
          qd.images.push(src);
        }
      });

      // Type detection
      let hasRadio = c.querySelector('[role="radio"]');
      let hasCheckbox = c.querySelector('[role="checkbox"]');
      let hasListbox = c.querySelector('[role="listbox"], [role="combobox"], .docssharedWizSelect, .v08pS, .ryv9W, .RbCvuf');
      
      if (hasRadio && !hasListbox) qd.type = "radio";
      else if (hasCheckbox) qd.type = "checkbox";
      else if (hasListbox) qd.type = "dropdown";
      else if (c.querySelector('textarea')) qd.type = "textarea";
      else if (c.querySelector('input')) qd.type = "text";

      if (!qd.type) { qc--; c.classList.remove("gf-highlight-scanning"); continue; }

      if (qd.type === "radio" || qd.type === "checkbox") {
        const rawOpts = extractOptions(c);
        rawOpts.forEach(opt => {
          qd.options.push({
            letter: optLetter(qd.options.length),
            text: opt.text,
            element: opt.element
          });
        });
      }

      if (qd.type === "dropdown") {
        const params = c.getAttribute('data-params');
        if (params) {
          try {
            const cleaned = params.replace('%.@.', '');
            const data = JSON.parse(cleaned);
            const findOptions = (obj) => {
              if (Array.isArray(obj)) {
                if (obj.length > 5 && Array.isArray(obj[1]) && obj[1].length > 0 && typeof obj[1][0] === 'string') return obj;
                for (let i = 0; i < obj.length; i++) {
                  const found = findOptions(obj[i]);
                  if (found) return found;
                }
              }
              return null;
            };
            const optionsParent = findOptions(data);
            if (optionsParent && Array.isArray(optionsParent)) {
              optionsParent.forEach(opt => {
                if (Array.isArray(opt) && opt[0] && typeof opt[0] === 'string') {
                  qd.options.push({ letter: optLetter(qd.options.length), text: opt[0] });
                }
              });
            }
          } catch(e) { log("Dropdown JSON Err:", e); }
        }
        if (!qd.options.length) {
          const domOptions = c.querySelectorAll('[role="option"], [aria-selected], .v08pS option, .ryv9W option, .docssharedWizSelect option, .RbCvuf option');
          domOptions.forEach(el => {
            let label = el.textContent.trim() || el.getAttribute('data-value') || el.getAttribute('aria-label');
            if (label && !/Choose|Select/i.test(label)) {
              qd.options.push({ letter: optLetter(qd.options.length), text: label, element: el });
            }
          });
        }
      }

      questionMap.set(qc, qd);
      list += `Q${qc}. [${qd.type.toUpperCase()}] ${txt}\n`;
      if (qd.images.length > 0) list += `   [Images: ${qd.images.length} attached]\n`;
      qd.options.forEach(o => list += `   ${o.letter}) ${o.text}\n`);
      list += "\n";

      setTimeout(() => c.classList.remove("gf-highlight-scanning"), 50);
    }

    const titleEl = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('.freebirdFormviewerViewHeaderTitle, .F9vEBc');
    formTitle = titleEl ? titleEl.textContent.trim() : "Google Form";

    showToast(`Scan Complete: ${qc} questions found.`);
    hideOverlay();

    const customBlock = customInstructions ? `\nIMPORTANT USER INSTRUCTIONS: ${customInstructions}\n` : "";
    const prompt = `You are an intelligent form-filler.${customBlock}
Rules:
- Search the internet first for factual answers.
- Output ONLY valid JSON with no markdown or explanation.
- Keys are question numbers as strings ("1", "2", etc.).
- Values are lowercase letters ("a") for multiple choice, or detailed text for open-ended.
QUESTIONS:\n${list}\nJSON:`;

    const typeCounts = {};
    let completedQuestions = 0;
    for (const [, qd] of questionMap) {
      typeCounts[qd.type] = (typeCounts[qd.type] || 0) + 1;
    }

    const allImages = {};
    const globalSeen = new Set();
    let totalImages = 0;
    for (const [num, qd] of questionMap) {
      if (qd.images.length > 0) {
        const unique = qd.images.filter(url => {
          if (globalSeen.has(url)) return false;
          globalSeen.add(url);
          return true;
        });
        if (unique.length > 0) {
          allImages[num] = unique;
          totalImages += unique.length;
        }
      }
    }

    pushDiag({
      type: "form_scanned",
      formTitle,
      questionCount: qc,
      typeBreakdown: typeCounts,
      hasEmail: getFormEmail() !== "Unknown User",
      totalImages,
      url: window.location.href
    });

    return { success: true, qc, prompt, formTitle, email: getFormEmail(), typeBreakdown: typeCounts, images: allImages };
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
          if (opt && opt.element) { opt.element.click(); filled++; }
          else if (opt && qd.subRow) {
            const radios = qd.subRow.querySelectorAll('[role="radio"]');
            const idx = qd.options.indexOf(opt);
            if (radios[idx]) { radios[idx].click(); filled++; }
          }
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
            const nativeInputValue = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            ) || Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, 'value'
            );
            if (nativeInputValue && nativeInputValue.set) {
              nativeInputValue.set.call(input, String(val));
            } else {
              input.value = String(val);
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        } else if (qd.type === "dropdown") {
          const select = qd.container.querySelector('select, [role="listbox"], [role="combobox"], .docssharedWizSelect, .v08pS, .ryv9W, .RbCvuf');
          const targetOption = qd.options.find(o => o.letter === String(val).toLowerCase()) || qd.options[0];
          if (targetOption && targetOption.element) {
            targetOption.element.click();
            filled++;
          } else if (targetOption && targetOption.text && select) {
            const nativeSelect = select.tagName === 'SELECT' ? select : select.querySelector('select');
            if (nativeSelect) {
              const matchingOption = Array.from(nativeSelect.options).find(o =>
                o.textContent.trim() === targetOption.text
              );
              if (matchingOption) {
                matchingOption.selected = true;
                nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
              }
            }
          }
          if (!filled) {
            log("Dropdown auto-fill not available for:", val, qd);
          }
        }
        if (qd.type !== "dropdown" || filled) {
          historyPayload.questions.push({ q: qd.text, a: String(val) });
        }
      } catch (e) { log("Fill Err:", e); }
      
      await sleep(50); 
      qd.container.classList.remove("gf-highlight-filling");
    }
    
    hideOverlay();
    showDisclaimer();
    showToast(`Neural Filling Complete: ${filled}/${total} items.`);
    chrome.runtime.sendMessage({ action: "saveToHistory", payload: historyPayload });
    chrome.runtime.sendMessage({ action: "trackFormFilled", payload: { formTitle, filledCount: filled, totalCount: total, secondsSaved: filled * 10, email: getFormEmail() } });

    pushDiag({
      type: "form_filled",
      formTitle,
      filled,
      total,
      fillRate: total > 0 ? Math.round(filled / total * 100) : 0,
      url: window.location.href
    });
    
    return { success: true, filled, total };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanForm") { scanForm().then(sendResponse); return true; }
    else if (request.action === "fillForm") { fillForm(request.answers).then(sendResponse); return true; }
    else if (request.action === "autoFillForm") { fillForm(request.data).then(sendResponse); return true; }
  });
})();
