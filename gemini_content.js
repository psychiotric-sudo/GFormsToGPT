// Gemini content script for GFormToGPT v4.1.5 - Neural Interface
(function () {
  "use strict";

  console.log("[GFormToGPT Gemini] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT Gemini]", ...args); }

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  function autoSubmitPrompt() {
    chrome.storage.local.get(["pendingPrompt", "pendingAiType"], (data) => {
      if (data.pendingPrompt && data.pendingAiType === "gemini") {
        const prompt = data.pendingPrompt;
        log("Pending prompt found, attempting injection...");

        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          const editor = document.querySelector('.ql-editor[contenteditable="true"]') || 
                         document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                         document.querySelector('.rich-textarea');
          const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                          document.querySelector('.send-button-container button') ||
                          document.querySelector('button:has(mat-icon)');

          if (editor) {
            if (editor.textContent.includes("JSON")) {
                if (sendBtn && !sendBtn.disabled) {
                    clearInterval(checkInterval);
                    log("Clicking send button...");
                    highlightElement(sendBtn, "#4caf50");
                    setTimeout(() => { 
                        sendBtn.click();
                        sendBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                        chrome.storage.local.remove(["pendingPrompt", "pendingAiType"]);
                    }, 500);
                }
                return;
            }

            log("Injecting...");
            editor.focus();
            document.execCommand('insertText', false, prompt);
          }
          
          if (attempts > 30) clearInterval(checkInterval);
        }, 1000);
      }
    });
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    const blocks = document.querySelectorAll("pre, code, div.markdown, .message-content, .model-response-text");
    for (const block of blocks) {
      let text = block.textContent.trim();
      const startIdx = text.indexOf('{'), endIdx = text.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const potentialJson = text.substring(startIdx, endIdx + 1);
        if (potentialJson === lastProcessedJson) continue;
        
        if (/"\d+"(\s*):|'\d+'(\s*):|(\s+)\d+:/.test(potentialJson)) {
          try {
            const cleanedText = potentialJson.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
            const parsed = JSON.parse(cleanedText);
            log("Valid JSON detected!", parsed);
            lastProcessedJson = potentialJson;
            chrome.runtime.sendMessage({ action: "chatGptResponseReceived", data: parsed, rawJson: cleanedText });
            highlightElement(block, "#4caf50");
          } catch (e) { }
        }
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  observer.observe(document.body, { childList: true, subtree: true });
  autoSubmitPrompt();
  setInterval(extractAndSendJson, 2000);
})();
