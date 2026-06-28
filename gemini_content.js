// Gemini content script for GFormToGPT v4.1.5 - Neural Interface
(function () {
  "use strict";

  console.log("[GFormToGPT Gemini] Script loaded");

  let verboseLogging = false;
  chrome.storage.local.get(["verboseLogging"], (data) => {
    verboseLogging = !!data.verboseLogging;
  });

  function log(...args) { if (verboseLogging) console.log("[GFormToGPT Gemini]", ...args); }

  function pushDiag(payload) {
    chrome.runtime.sendMessage({ action: "diagPush", payload }).catch(() => {});
  }

  pushDiag({ type: "ai_script_loaded", platform: "gemini" });

  let promptStartTime = null;

  function highlightElement(el, color = "#3d5a80") {
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    setTimeout(() => { el.style.outline = ""; }, 2000);
  }

  async function uploadImageToGemini(imageUrl, questionNum) {
    try {
      const resp = await fetch(imageUrl, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const ext = blob.type.split("/")[1] || "png";
      const file = new File([blob], `question_${questionNum}.${ext}`, { type: blob.type });

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        log(`Uploaded image for Q${questionNum}:`, file.name);
        return true;
      }

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      pasteEvent.clipboardData.items.add(file);
      const target = document.querySelector('[contenteditable="true"], .ql-editor, .rich-textarea');
      if (target) {
        target.dispatchEvent(pasteEvent);
        log(`Pasted image for Q${questionNum}:`, file.name);
        return true;
      }

      log("No upload target found for image");
      return false;
    } catch (e) {
      log("Image upload failed:", e);
      return false;
    }
  }

  const uploadedUrls = new Set();

  async function uploadAllImages(images) {
    const entries = Object.entries(images).slice(0, 10);
    for (const [qNum, urls] of entries) {
      for (const url of urls) {
        if (uploadedUrls.has(url)) continue;
        uploadedUrls.add(url);
        const ok = await uploadImageToGemini(url, qNum);
        if (ok) await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  function autoSubmitPrompt() {
    chrome.storage.local.get(["pendingPrompt", "pendingAiType", "pendingImages"], async (data) => {
      if (data.pendingPrompt && data.pendingAiType === "gemini") {
        const prompt = data.pendingPrompt;
        log("Pending prompt found, attempting injection...");
        pushDiag({ type: "ai_prompt_found", platform: "gemini", promptLength: prompt.length });

        if (data.pendingImages && Object.keys(data.pendingImages).length > 0) {
          log("Uploading images...");
          await uploadAllImages(data.pendingImages);
          log("Image upload complete");
        }

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
                    promptStartTime = Date.now();
                    highlightElement(sendBtn, "#4caf50");
                    pushDiag({ type: "ai_prompt_sent", platform: "gemini", attempts });
                    setTimeout(() => { 
                        sendBtn.click();
                        chrome.storage.local.remove(["pendingPrompt", "pendingAiType", "pendingImages"]);
                    }, 500);
                }
                return;
            }

            log("Injecting...");
            editor.focus();
            document.execCommand('insertText', false, prompt);
          }
          
          if (attempts > 30) {
            clearInterval(checkInterval);
            pushDiag({ type: "ai_inject_timeout", platform: "gemini", attempts });
          }
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
            const responseTime = promptStartTime ? Date.now() - promptStartTime : null;
            pushDiag({ type: "ai_response_received", platform: "gemini", responseTime, keyCount: Object.keys(parsed).length });
            promptStartTime = null;
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
