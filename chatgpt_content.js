// ChatGPT content script for GFormToGPT automation
// Detects JSON responses and sends them to the background script

(function () {
  "use strict";

  console.log("🚀 [GFormToGPT ChatGPT] Script loaded");

  // Only activate if we are in a session initiated by the extension
  const isGFormSession =
    window.location.href.includes("prompt=") ||
    document.referrer.includes("docs.google.com/forms");

  if (!isGFormSession) {
    console.log("⏭️ [GFormToGPT ChatGPT] Not a GForm session, skipping...");
    return;
  }

  console.log("✅ [GFormToGPT ChatGPT] GForm session detected. Monitoring for JSON...");

  // ── Auto-submit prompt if it's in the URL ──
  function autoSubmitPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    const prompt = urlParams.get('prompt');
    
    if (prompt) {
      const checkInterval = setInterval(() => {
        const textarea = document.querySelector('#prompt-textarea');
        if (textarea) {
          clearInterval(checkInterval);
          console.log("✍️ [GFormToGPT ChatGPT] Textarea found, but ChatGPT usually handles URL prompts. Waiting for response...");
          
          // Note: ChatGPT now often auto-starts when 'prompt' is in the URL.
          // If it doesn't, we can force it here:
          /*
          textarea.value = prompt;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          const sendBtn = document.querySelector('[data-testid="send-button"]');
          if (sendBtn) sendBtn.click();
          */
        }
      }, 1000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    // Look for all <pre> or <code> blocks which often contain the JSON
    // Also check for raw text in message divs
    const blocks = document.querySelectorAll("pre, code, div.markdown");

    for (const block of blocks) {
      let text = block.textContent.trim();
      
      // Look for something that looks like our expected JSON: {"1": "...", "2": ...}
      // Simple check for starts with { and ends with } and contains a numbered key
      if (text.startsWith("{") && text.endsWith("}") && /"\d+"(\s*):/.test(text)) {
        try {
          // Attempt to parse to validate it's real JSON
          const cleanedText = text.replace(/[\u201C\u201D]/g, '"'); // Handle smart quotes if any
          const parsed = JSON.parse(cleanedText);
          
          if (cleanedText !== lastProcessedJson) {
            console.log("💎 [GFormToGPT ChatGPT] Valid JSON detected!", parsed);
            lastProcessedJson = cleanedText;
            
            chrome.runtime.sendMessage({
              action: "chatGptResponseReceived",
              data: parsed,
              rawJson: cleanedText
            }, (response) => {
              if (response && response.success) {
                console.log("📤 [GFormToGPT ChatGPT] JSON sent to background script. Closing tab in 2s...");
                setTimeout(() => {
                    // Signal background to close this tab? 
                    // Content scripts can't close their own tab easily in all browsers, 
                    // but we can try or just leave it open. 
                    // Actually, let's just let it stay so the user can see it if they want.
                }, 2000);
              }
            });
          }
        } catch (e) {
          // Not valid JSON yet (maybe still typing)
        }
      }
    }
  }

  // Monitor for changes in the chat container
  const observer = new MutationObserver(() => {
    extractAndSendJson();
  });

  // Start observing once the main chat container is available
  const startObserving = () => {
    const target = document.querySelector("main") || document.body;
    observer.observe(target, {
      childList: true,
      subtree: true
    });
    console.log("👀 [GFormToGPT ChatGPT] Observer started");
    autoSubmitPrompt();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving);
  } else {
    startObserving();
  }

  // Periodically check just in case observer misses it (ChatGPT UI is heavy)
  setInterval(extractAndSendJson, 2000);
})();
