// Claude.ai content script for GFormToGPT automation
(function () {
  "use strict";

  console.log("🚀 [GFormToGPT Claude] Script loaded");

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
      console.log("📝 [GFormToGPT Claude] Prompt found, attempting auto-submit...");
      const checkInterval = setInterval(() => {
        // Claude uses a contenteditable div for input
        const editor = document.querySelector('[contenteditable="true"]');
        const sendBtn = document.querySelector('button[aria-label="Send Message"]') || 
                        document.querySelector('button:has(svg[fill="none"])'); // Fallback

        if (editor) {
          clearInterval(checkInterval);
          highlightElement(editor);
          
          // Claude's editor needs focused and then the text inserted
          editor.focus();
          // Clear current content and add prompt
          document.execCommand('insertText', false, prompt);
          
          setTimeout(() => {
            if (sendBtn && !sendBtn.disabled) {
              console.log("🖱️ [GFormToGPT Claude] Clicking send button...");
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
    const blocks = document.querySelectorAll("pre, code, .prose");
    for (const block of blocks) {
      let text = block.textContent.trim();
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