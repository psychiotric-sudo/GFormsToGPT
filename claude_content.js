// Claude.ai content script for GFormToGPT automation
(function () {
  "use strict";

  console.log("[GFormToGPT Claude] Script loaded");

  const isGFormSession = window.location.href.includes("q=") || document.referrer.includes("docs.google.com/forms");
  if (!isGFormSession) return;

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  function autoSubmitPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    const prompt = urlParams.get('q');
    
    if (prompt) {
      console.log("[GFormToGPT Claude] Prompt found, attempting auto-submit...");
      const checkInterval = setInterval(() => {
        // Claude uses a contenteditable div for input
        const editor = document.querySelector('[contenteditable="true"]');
        
        // Target the specific button provided by the user
        const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                        document.querySelector('button._claude_x02hl_108') ||
                        document.querySelector('button:has(svg path[d*="M208.49"])');

        if (editor) {
          clearInterval(checkInterval);
          highlightElement(editor);
          
          console.log("[GFormToGPT Claude] Editor found, injecting prompt...");
          editor.focus();
          
          // Clear and insert
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          document.execCommand('insertText', false, prompt);
          
          // Small delay to allow Claude's UI to enable the send button
          setTimeout(() => {
            if (sendBtn) {
              console.log("[GFormToGPT Claude] Send button detected, clicking...");
              highlightElement(sendBtn, "#4caf50");
              sendBtn.click();
            } else {
              console.log("[GFormToGPT Claude] Send button not found yet, manual click required.");
            }
          }, 800);
        }
      }, 1000);
      
      // Stop checking after 15 seconds to prevent infinite loops
      setTimeout(() => clearInterval(checkInterval), 15000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    // Claude often puts JSON in prose or code blocks
    const blocks = document.querySelectorAll("pre, code, .prose");
    for (const block of blocks) {
      let text = block.textContent.trim();
      // Look for JSON structure specifically with question keys like "1":
      if (text.startsWith("{") && text.endsWith("}") && /"\d+"(\s*):/.test(text)) {
        if (text === lastProcessedJson) continue;
        try {
          const parsed = JSON.parse(text);
          lastProcessedJson = text;
          console.log("[GFormToGPT Claude] Valid JSON detected and sent to form.");
          chrome.runtime.sendMessage({
            action: "chatGptResponseReceived",
            data: parsed,
            rawJson: text
          });
          highlightElement(block, "#4caf50");
        } catch (e) {
          // Not a complete or valid JSON yet
        }
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  observer.observe(document.body, { childList: true, subtree: true });
  autoSubmitPrompt();
  
  // Periodically check just in case
  setInterval(extractAndSendJson, 2000);
})();
