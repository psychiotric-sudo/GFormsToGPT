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

  // ── Highlight helper ──
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

  // ── Auto-submit prompt if it's in the URL ──
  function autoSubmitPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    const prompt = urlParams.get('prompt');
    
    if (prompt) {
      console.log("📝 [GFormToGPT ChatGPT] Prompt found in URL, attempting auto-submit...");
      
      const checkInterval = setInterval(() => {
        const textarea = document.querySelector('#prompt-textarea');
        // Expanded selectors for send button
        const sendBtn = document.querySelector('[data-testid="send-button"]') || 
                        document.querySelector('button[aria-label="Send prompt"]') ||
                        document.querySelector('button.absolute.bottom-1\\.5');
        
        if (textarea && textarea.value.length > 10) { 
            clearInterval(checkInterval);
            console.log("🚀 [GFormToGPT ChatGPT] Textarea filled. Triggering click...");
            highlightElement(textarea);
            
            if (sendBtn) {
                console.log("🖱️ [GFormToGPT ChatGPT] Clicking send button...");
                highlightElement(sendBtn, "#4caf50");
                sendBtn.click();
                // Fallback for some ChatGPT versions where click() isn't enough
                setTimeout(() => {
                    if (sendBtn) sendBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
                }, 500);
            }
        } else if (textarea) {
            if (textarea.value === "" && prompt) {
                console.log("⌨️ [GFormToGPT ChatGPT] Manual injection needed...");
                textarea.value = prompt;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
      }, 1000);
      
      // Safety timeout
      setTimeout(() => clearInterval(checkInterval), 15000);
    }
  }

  let lastProcessedJson = "";

  function extractAndSendJson() {
    // Look for all <pre> or <code> blocks which often contain the JSON
    const blocks = document.querySelectorAll("pre, code, div.markdown");

    for (const block of blocks) {
      let text = block.textContent.trim();
      
      // Improved JSON detection: look for a JSON object with numeric keys
      if (text.startsWith("{") && text.endsWith("}") && /"\d+"(\s*):/.test(text)) {
        try {
          const cleanedText = text.replace(/[\u201C\u201D]/g, '"');
          const parsed = JSON.parse(cleanedText);
          
          if (cleanedText !== lastProcessedJson) {
            console.log("💎 [GFormToGPT ChatGPT] Valid JSON detected!", parsed);
            lastProcessedJson = cleanedText;
            highlightElement(block, "#4caf50");
            
            chrome.runtime.sendMessage({
              action: "chatGptResponseReceived",
              data: parsed,
              rawJson: cleanedText
            }, (response) => {
              if (response && response.success) {
                console.log("📤 [GFormToGPT ChatGPT] JSON sent back. Process complete.");
              }
            });
          }
        } catch (e) {}
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
