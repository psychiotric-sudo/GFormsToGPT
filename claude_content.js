// Claude.ai content script for GFormToGPT v4.1.5 - Neural Interface
(function () {
  "use strict";

  console.log("[GFormToGPT Claude] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT Claude]", ...args); }

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  function autoSubmitPrompt() {
    chrome.storage.local.get(["pendingPrompt", "pendingAiType"], (data) => {
      if (data.pendingPrompt && data.pendingAiType === "claude") {
        const prompt = data.pendingPrompt;
        log("Pending prompt found, attempting injection...");

        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          const editor = document.querySelector('[contenteditable="true"]') || 
                         document.querySelector('.ProseMirror');
          const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                          document.querySelector('button:has(svg path[d*="M208.49"])') ||
                          document.querySelector('button[type="button"] svg path[d*="M208.49"]')?.closest('button') ||
                          document.querySelector('button._claude_x02hl_108');

          if (editor) {
            if (editor.textContent.includes("JSON")) {
                if (sendBtn && !sendBtn.disabled) {
                    clearInterval(checkInterval);
                    log("Clicking send...");
                    highlightElement(sendBtn, "#4caf50");
                    setTimeout(() => {
                        sendBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                        sendBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                        sendBtn.click();
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
    const blocks = document.querySelectorAll("pre, code, .prose, div.markdown, .font-mono");
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
