// ChatGPT content script for GFormToGPT v3.8.8 - Neural Interface

(function () {
  "use strict";

  console.log("[GFormToGPT ChatGPT] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
    if (verboseLogging) console.log("[GFormToGPT ChatGPT] Verbose logging enabled");
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT ChatGPT]", ...args); }

  const isGFormSession = window.location.href.includes("prompt=") || document.referrer.includes("docs.google.com/forms");
  if (!isGFormSession) { log("Not a GForm session, skipping..."); return; }

  log("GForm session detected. Monitoring for JSON...");

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    const originalTransition = el.style.transition;
    const originalOutline = el.style.outline;
    const originalBoxShadow = el.style.boxShadow;
    el.style.transition = "all 0.5s ease";
    el.style.outline = `3px solid ${color}`;
    el.style.boxShadow = `0 0 15px ${color}`;
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.boxShadow = originalBoxShadow;
      setTimeout(() => el.style.transition = originalTransition, 500);
    }, 2000);
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 999999; padding: 12px 20px; border-radius: 8px; color: #fff; font-family: sans-serif; font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.2); background: ${type === "success" ? "#10b981" : "#3b82f6"}; transition: all 0.3s ease; opacity: 0; transform: translateY(-20px);`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "1"; toast.style.transform = "translateY(0)"; }, 10);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function autoSubmitPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    const prompt = urlParams.get('prompt');
    if (prompt) {
      log("Prompt found, attempting auto-submit...");
      const checkInterval = setInterval(() => {
        const textarea = document.querySelector('#prompt-textarea');
        const sendBtn = document.querySelector('[data-testid="send-button"]') || 
                        document.querySelector('button[aria-label="Send prompt"]') ||
                        document.querySelector('button:has(svg use[href*="#01bab7"])') ||
                        document.querySelector('button.absolute.bottom-1\\.5');

        if (textarea && (textarea.value.length > 10 || textarea.innerText.length > 10)) { 
            clearInterval(checkInterval);
            log("Prompt ready, clicking send...");
            if (sendBtn) {
                highlightElement(sendBtn, "#4caf50");
                setTimeout(() => {
                    sendBtn.click();
                    setTimeout(() => { if (sendBtn) sendBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window})); }, 500);
                }, 1000);
            }
        } else if (textarea && textarea.value === "" && prompt) {
            textarea.value = prompt;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 800);
      setTimeout(() => clearInterval(checkInterval), 12000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    const blocks = document.querySelectorAll("pre, code, div.markdown");
    for (const block of blocks) {
      let text = block.textContent.trim();
      const startIdx = text.indexOf('{'), endIdx = text.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const potentialJson = text.substring(startIdx, endIdx + 1);
        if (potentialJson === lastProcessedJson) continue;
        if (/"\d+"(\s*):/.test(potentialJson)) {
          try {
            const cleanedText = potentialJson.replace(/[\u201C\u201D]/g, '"');
            const parsed = JSON.parse(cleanedText);
            log("Valid JSON detected!", parsed);
            lastProcessedJson = potentialJson;
            highlightElement(block, "#4caf50");
            showToast("JSON Detected!", "success");
            chrome.runtime.sendMessage({ action: "chatGptResponseReceived", data: parsed, rawJson: cleanedText });
          } catch (e) { if (potentialJson.includes('"1":')) log("Parse Err:", e.message); }
        }
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  const startObserving = () => {
    const target = document.querySelector("main") || document.body;
    observer.observe(target, { childList: true, subtree: true });
    autoSubmitPrompt();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserving);
  else startObserving();
  setInterval(extractAndSendJson, 2000);
})();
