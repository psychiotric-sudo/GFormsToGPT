// Gemini content script for GFormToGPT v3.8.8 - Neural Interface
(function () {
  "use strict";

  console.log("[GFormToGPT Gemini] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
    if (verboseLogging) console.log("[GFormToGPT Gemini] Verbose logging enabled");
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT Gemini]", ...args); }

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
        const editor = document.querySelector('.ql-editor[contenteditable="true"]') || 
                       document.querySelector('div[contenteditable="true"][role="textbox"]');
        const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                        document.querySelector('.send-button-container button');

        if (editor) {
          clearInterval(checkInterval);
          highlightElement(editor);
          log("Injecting prompt into Gemini...");
          editor.focus();
          document.execCommand('insertText', false, prompt);
          setTimeout(() => {
            if (sendBtn && !sendBtn.disabled) {
                log("Clicking send button...");
                highlightElement(sendBtn, "#4caf50");
                sendBtn.click();
            }
          }, 1000);
        }
      }, 1000);
      setTimeout(() => clearInterval(checkInterval), 15000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    const blocks = document.querySelectorAll("pre, code, div.markdown, .message-content");
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
