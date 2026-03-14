// Gemini content script for GFormToGPT automation
(function () {
  "use strict";

  console.log("[GFormToGPT Gemini] Script loaded");

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
      console.log("[GFormToGPT Gemini] Prompt found, attempting auto-submit...");
      const checkInterval = setInterval(() => {
        // Gemini uses a contenteditable div
        const editor = document.querySelector('.ql-editor[contenteditable="true"]') || 
                       document.querySelector('div[contenteditable="true"][role="textbox"]');
        
        const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                        document.querySelector('.send-button-container button');

        if (editor) {
          clearInterval(checkInterval);
          highlightElement(editor);
          
          editor.focus();
          // Clear current content and add prompt
          document.execCommand('insertText', false, prompt);
          
          setTimeout(() => {
            if (sendBtn && !sendBtn.disabled) {
                console.log("[GFormToGPT Gemini] Clicking send button...");
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
      // Remove backticks if present
      text = text.replace(/```json\n?/, "").replace(/```/, "").trim();
      
      if (text.startsWith("{") && text.endsWith("}") && /"\d+"(\s*):/.test(text)) {
        if (text === lastProcessedJson) continue;
        try {
          const parsed = JSON.parse(text);
          lastProcessedJson = text;
          chrome.runtime.sendMessage({
            action: "chatGptResponseReceived",
            data: parsed,
            rawJson: text
          });
          highlightElement(block, "#4caf50");
        } catch (e) {}
      }
    }
  }

  const observer = new MutationObserver(extractAndSendJson);
  observer.observe(document.body, { childList: true, subtree: true });
  autoSubmitPrompt();
  setInterval(extractAndSendJson, 2000);
})();