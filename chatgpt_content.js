// ChatGPT content script for GFormToGPT v4.1.5 - Neural Interface

(function () {
  "use strict";

  console.log("[GFormToGPT ChatGPT] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT ChatGPT]", ...args); }

  function pushDiag(payload) {
    chrome.runtime.sendMessage({ action: "diagPush", payload }).catch(() => {});
  }

  pushDiag({ type: "ai_script_loaded", platform: "chatgpt" });

  let promptStartTime = null;

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.transition = "all 0.5s ease";
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  function autoSubmitPrompt() {
    chrome.storage.local.get(["pendingPrompt", "pendingAiType"], (data) => {
      if (data.pendingPrompt && (data.pendingAiType === "chatgpt" || !data.pendingAiType)) {
        const prompt = data.pendingPrompt;
        log("Pending prompt found, attempting injection...");
        pushDiag({ type: "ai_prompt_found", platform: "chatgpt", promptLength: prompt.length });
        
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          const textarea = document.querySelector('#prompt-textarea') || 
                          document.querySelector('[contenteditable="true"]');
          const sendBtn = document.querySelector('[data-testid="send-button"]') || 
                          document.querySelector('button[aria-label="Send prompt"]') ||
                          document.querySelector('[data-testid="send-button"]:not([disabled])');

          if (textarea) {
            if (textarea.textContent.includes("JSON") || textarea.value?.includes("JSON")) {
                if (sendBtn && !sendBtn.disabled) {
                    clearInterval(checkInterval);
                    log("Clicking send...");
                    promptStartTime = Date.now();
                    highlightElement(sendBtn, "#4caf50");
                    pushDiag({ type: "ai_prompt_sent", platform: "chatgpt", attempts });
                    setTimeout(() => { 
                        sendBtn.click();
                        chrome.storage.local.remove(["pendingPrompt", "pendingAiType"]);
                    }, 500);
                }
                return;
            }

            log("Injecting...");
            textarea.focus();
            document.execCommand('insertText', false, prompt);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          if (attempts > 30) {
            clearInterval(checkInterval);
            pushDiag({ type: "ai_inject_timeout", platform: "chatgpt", attempts });
          }
        }, 1000);
      }
    });
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    const blocks = document.querySelectorAll("pre, code, div.markdown, .markdown, .prose");
    for (const block of blocks) {
      let text = block.textContent.trim();
      const startIdx = text.indexOf('{'), endIdx = text.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const potentialJson = text.substring(startIdx, endIdx + 1);
        if (potentialJson === lastProcessedJson) continue;
        
        if (/"\d+"(\s*):|'\d+'(\s*):/.test(potentialJson)) {
          try {
            const cleanedText = potentialJson.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
            const parsed = JSON.parse(cleanedText);
            log("Valid JSON detected!", parsed);
            lastProcessedJson = potentialJson;
            highlightElement(block, "#4caf50");
            const responseTime = promptStartTime ? Date.now() - promptStartTime : null;
            chrome.runtime.sendMessage({ action: "chatGptResponseReceived", data: parsed, rawJson: cleanedText });
            pushDiag({ type: "ai_response_received", platform: "chatgpt", responseTime, keyCount: Object.keys(parsed).length });
            promptStartTime = null;
          } catch (e) { }
        }
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  const startObserving = () => {
    const target = document.querySelector("main") || document.body;
    observer.observe(target, { childList: true, subtree: true });
    autoSubmitPrompt();
    setInterval(extractAndSendJson, 2000);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserving);
  else startObserving();
})();
