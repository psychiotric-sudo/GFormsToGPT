// Claude.ai content script for GFormToGPT v3.8.8 - Neural Interface
(function () {
  "use strict";

  console.log("[GFormToGPT Claude] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
    if (verboseLogging) console.log("[GFormToGPT Claude] Verbose logging enabled");
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT Claude]", ...args); }

  const isGFormSession = window.location.href.includes("q=") || document.referrer.includes("docs.google.com/forms");
  if (!isGFormSession) { log("Not a GForm session"); return; }

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  function autoSubmitPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    const prompt = urlParams.get('q');
    if (prompt) {
      log("Prompt found, attempting auto-submit...");
      const checkInterval = setInterval(() => {
        const editor = document.querySelector('[contenteditable="true"]');
        const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                        document.querySelector('button._claude_x02hl_108') ||
                        document.querySelector('button:has(svg path[d*="M208.49"])') ||
                        document.querySelector('button[type="button"] svg path[d*="M208.49"]')?.closest('button');

        if (editor) {
          if (editor.textContent.trim() === prompt) { /* Injected */ } 
          else {
            log("Injecting prompt...");
            editor.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, prompt);
          }
          
          if (sendBtn && !sendBtn.disabled) {
            clearInterval(checkInterval);
            log("Clicking send...");
            highlightElement(sendBtn, "#4caf50");
            sendBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
            sendBtn.click();
          }
        }
      }, 1000);
      setTimeout(() => clearInterval(checkInterval), 15000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    const blocks = document.querySelectorAll("pre, code, .prose");
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
            chrome.runtime.sendMessage({ action: "chatGptResponseReceived", data: parsed, rawJson: cleanedText });
            highlightElement(block, "#4caf50");
          } catch (e) { if (potentialJson.includes('"1":')) log("Parse Err:", e.message); }
        }
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  observer.observe(document.body, { childList: true, subtree: true });
  autoSubmitPrompt();
  setInterval(extractAndSendJson, 2000);
})();
