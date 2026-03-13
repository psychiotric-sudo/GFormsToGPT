// ==UserScript==
// @name         GForm to GPT
// @namespace    http://tampermonkey.net/
// @author       @chqrlxx
// @version      3.0.0
// @description  Scan form, filter personal questions, open ChatGPT with prefilled prompt, paste JSON back to fill
// @match        https://docs.google.com/forms/d/*/viewform*
// @match        https://docs.google.com/forms/*/viewform*
// @grant        GM_openInTab
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  console.log("🚀 [GFormToGPT v3] Script execution started");
  console.log("📍 [GFormToGPT] Current URL:", window.location.href);
  console.log("📍 [GFormToGPT] Document ready state:", document.readyState);
  console.log("📍 [GFormToGPT] document.body exists:", !!document.body);

  // ── Personal question filter keywords ──
  const PERSONAL_KEYWORDS = [
    "name",
    "full name",
    "email",
    "gmail",
    "section",
    "class",
    "grade",
    "year",
    "student number",
    "id",
    "phone",
    "contact",
    "address",
    "school",
  ];

  function isPersonalQuestion(questionText) {
    const lowerText = questionText.toLowerCase();
    return PERSONAL_KEYWORDS.some((keyword) => {
      // Word-boundary check to match whole words only
      const boundaryRegex = new RegExp(`(^|\\s|:)${keyword}(\\s|$|\\?|:)`, "i");
      return boundaryRegex.test(lowerText);
    });
  }

  // Map: normalized question text → question data (for stable tracking, not index-based)
  let questionMap = new Map();

  // ── Styles ──
  const style = document.createElement("style");
  console.log("🎨 [GFormToGPT] Created style element:", style);
  style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
        
        #gf-panel{
          position:fixed;
          top:20px;
          right:20px;
          width:420px;
          background:#f5f5f5;
          border:none;
          border-radius:8px;
          box-shadow:0 2px 8px rgba(0,0,0,0.15);
          z-index:10000000;
          font-family:'Outfit',sans-serif;
          color:#202124;
          display:block;
          visibility:visible;
          opacity:1;
          overflow:hidden;
        }
        
        #gf-panel.minimized #gf-body {
          display:none;
        }
        
        #gf-header-top{
          background:linear-gradient(135deg, #3d5a80 0%, #2d4563 100%);
          padding:12px 16px;
          border-bottom:none;
          border-radius:8px 8px 0 0;
          position:relative;
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        
        #gf-header-top::before {
          display:none;
        }
        
        #gf-title{
          font-size:15px;
          font-weight:700;
          color:#fff;
          margin:0;
          letter-spacing:0px;
          flex:1;
        }
        
        #gf-author-credit{
          display:none;
        }
        
        #gf-author-link{
          display:none;
        }
        
        #gf-minimize{
          background:rgba(255,255,255,0.2);
          border:none;
          color:#fff;
          width:28px;
          height:28px;
          border-radius:4px;
          cursor:pointer;
          font-size:16px;
          line-height:1;
          transition:all .2s;
          display:flex;
          align-items:center;
          justify-content:center;
          margin-right:8px;
        }
        
        #gf-minimize:hover{
          background:rgba(255,255,255,0.3);
        }
        
        #gf-close{
          background:rgba(255,255,255,0.2);
          border:none;
          color:#fff;
          width:28px;
          height:28px;
          border-radius:4px;
          cursor:pointer;
          font-size:20px;
          line-height:1;
          position:relative;
          transition:all .2s;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        
        #gf-close:hover{
          background:rgba(255,255,255,0.4);
        }
        
        #gf-body{
          padding:16px;
          max-height:600px;
          overflow-y:auto;
          background:#fff;
        }
        
        .gf-section{
          margin-bottom:16px;
          padding-bottom:16px;
          border-bottom:1px solid #e0e0e0;
        }
        
        .gf-section:last-child{
          border-bottom:none;
          margin-bottom:0;
          padding-bottom:0;
        }
        
        .gf-section-title{
          font-size:12px;
          font-weight:600;
          color:#3d5a80;
          margin-bottom:8px;
          text-transform:uppercase;
          letter-spacing:0.5px;
        }
        
        .gf-helper-text{
          font-size:12px;
          color:#666;
          margin-bottom:12px;
          line-height:1.4;
        }
        
        #gf-body::-webkit-scrollbar {
          width:6px;
        }
        
        #gf-body::-webkit-scrollbar-track {
          background:#0f0f0f;
        }
        
        #gf-body::-webkit-scrollbar-thumb {
          background:#3d5a80;
          border-radius:3px;
        }
        
        #gf-body::-webkit-scrollbar-thumb:hover {
          background:#5a7ba8;
        }
        
        #gf-status{
          background:#e8f1ff;
          padding:12px;
          border-radius:6px;
          font-size:13px;
          margin-bottom:12px;
          color:#1a237e;
          border-left:4px solid #3d5a80;
          min-height:auto;
          line-height:1.5;
          border:1px solid #c5d9f1;
        }
        
        .gf-btn-group{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
          margin-bottom:12px;
        }
        
        .gf-btn-group.full{
          grid-template-columns:1fr;
        }
        
        #gf-output{
          width:100%;
          height:100px;
          padding:10px;
          border:1px solid #ddd;
          border-radius:6px;
          font-size:11px;
          font-family:'Courier New',monospace;
          resize:vertical;
          margin-bottom:12px;
          box-sizing:border-box;
          background:#f9f9f9;
          color:#1a237e;
          transition:all .2s;
        }
        
        #gf-output:focus{
          outline:none;
          border-color:#3d5a80;
          background:#fff;
          box-shadow:0 0 8px rgba(61,90,128,0.2);
        }
        
        #gf-output::placeholder{
          color:#999;
        }
        
        .gf-button{
          padding:10px 14px;
          border:none;
          border-radius:6px;
          font-size:13px;
          font-weight:600;
          font-family:'Outfit',sans-serif;
          cursor:pointer;
          transition:all .2s;
          text-transform:none;
          letter-spacing:0px;
        }
        
        .gf-button-primary{
          background:#3d5a80;
          color:#fff;
          border:none;
          box-shadow:0 2px 4px rgba(61,90,128,0.2);
        }
        
        .gf-button-primary:hover{
          background:#2d4563;
          box-shadow:0 4px 8px rgba(61,90,128,0.3);
        }
        
        .gf-button-primary:active{
          transform:scale(0.98);
        }
        
        .gf-button-success{
          background:#4caf50;
          color:#fff;
          border:none;
          box-shadow:0 2px 4px rgba(76,175,80,0.2);
        }
        
        .gf-button-success:hover{
          background:#45a049;
          box-shadow:0 4px 8px rgba(76,175,80,0.3);
        }
        
        .gf-button-success:active{
          transform:scale(0.98);
        }
        
        .gf-button-secondary{
          background:#e0e0e0;
          color:#333;
          border:1px solid #ccc;
        }
        
        .gf-button-secondary:hover{
          background:#d0d0d0;
        }
        
        .gf-divider{
          height:1px;
          background:linear-gradient(90deg, transparent, #3d3d3d, transparent);
          margin:16px 0;
        }
        
        .gf-label{
          font-size:12px;
          font-weight:600;
          color:#1a237e;
          margin-bottom:8px;
          display:block;
          text-transform:none;
          letter-spacing:0px;
        }
        
        .gf-label-hint{
          font-size:11px;
          color:#666;
          font-weight:400;
          margin-top:4px;
        }
        
        #gf-filtered-notice{
          font-size:12px;
          color:#c9a878;
          margin-bottom:12px;
          padding:10px;
          background:#2d2620;
          border-radius:6px;
          display:none;
          border:1px solid #3d2d20;
          border-left:4px solid #b8956b;
          line-height:1.4;
        }
    `;
  document.head.appendChild(style);
  console.log("✅ [GFormToGPT] Styles appended to document.head");
  console.log(
    "📍 [GFormToGPT] document.head children count:",
    document.head.children.length,
  );

  // ── Panel Structure ──
  const panel = document.createElement("div");
  panel.id = "gf-panel";
  console.log("📦 [GFormToGPT] Created panel element with id:", panel.id);

  // Header top with title, minimize and close buttons
  const headerTop = document.createElement("div");
  headerTop.id = "gf-header-top";

  const titleElement = document.createElement("h2");
  titleElement.id = "gf-title";
  titleElement.textContent = "📋 ChatGPT Form Helper";

  const minimizeButton = document.createElement("button");
  minimizeButton.id = "gf-minimize";
  minimizeButton.textContent = "−";
  minimizeButton.title = "Minimize panel";
  minimizeButton.setAttribute("aria-label", "Minimize panel");
  minimizeButton.onclick = (e) => {
    e.stopPropagation();
    console.log("📌 [GFormToGPT] Minimize button clicked");
    panel.classList.toggle("minimized");
    minimizeButton.textContent = panel.classList.contains("minimized")
      ? "+"
      : "−";
  };

  const closeButton = document.createElement("button");
  closeButton.id = "gf-close";
  closeButton.textContent = "✕";
  closeButton.onclick = () => {
    console.log("❌ [GFormToGPT] Close button clicked. Hiding panel...");
    panel.style.display = "none";
  };
  closeButton.title = "Close panel (Ctrl+Shift+S to toggle)";
  closeButton.setAttribute("aria-label", "Close panel");

  headerTop.appendChild(titleElement);
  headerTop.appendChild(minimizeButton);
  headerTop.appendChild(closeButton);
  panel.appendChild(headerTop);

  // Body - reorganized for beginners
  const body = document.createElement("div");
  body.id = "gf-body";

  const status = document.createElement("div");
  status.id = "gf-status";
  status.textContent = '✅ Ready! Start by clicking "Scan Form" below.';
  body.appendChild(status);

  // Section 1: Scan & Extract
  const section1 = document.createElement("div");
  section1.className = "gf-section";

  const section1Title = document.createElement("div");
  section1Title.className = "gf-section-title";
  section1Title.textContent = "Step 1: Extract Questions";
  section1.appendChild(section1Title);

  const section1Helper = document.createElement("p");
  section1Helper.className = "gf-helper-text";
  section1Helper.textContent =
    "Click the button below to scan all questions in this form and send them to ChatGPT for answering.";
  section1.appendChild(section1Helper);

  const scanButton = document.createElement("button");
  scanButton.className = "gf-button gf-button-primary";
  scanButton.style.width = "100%";
  scanButton.textContent = "🔍 Scan Form & Open ChatGPT";
  section1.appendChild(scanButton);

  const filteredNotice = document.createElement("div");
  filteredNotice.id = "gf-filtered-notice";
  section1.appendChild(filteredNotice);

  body.appendChild(section1);

  // Section 2: Paste JSON Response
  const section2 = document.createElement("div");
  section2.className = "gf-section";

  const section2Title = document.createElement("div");
  section2Title.className = "gf-section-title";
  section2Title.textContent = "Step 2: Paste ChatGPT Response";
  section2.appendChild(section2Title);

  const section2Helper = document.createElement("p");
  section2Helper.className = "gf-helper-text";
  section2Helper.textContent =
    'Copy the JSON response from ChatGPT and paste it below. It should look like {"1":"a","2":"b"...}';
  section2.appendChild(section2Helper);

  const label = document.createElement("label");
  label.className = "gf-label";
  label.textContent = "ChatGPT JSON Response";
  section2.appendChild(label);

  const output = document.createElement("textarea");
  output.id = "gf-output";
  output.placeholder =
    'Paste JSON like: {"1":"a","2":["b","c"],"3":"photosynthesis"}';
  output.setAttribute("aria-label", "JSON response textarea");
  section2.appendChild(output);
  body.appendChild(section2);

  // Section 3: Fill Form
  const section3 = document.createElement("div");
  section3.className = "gf-section";

  const section3Title = document.createElement("div");
  section3Title.className = "gf-section-title";
  section3Title.textContent = "Step 3: Auto-Fill Form";
  section3.appendChild(section3Title);

  const section3Helper = document.createElement("p");
  section3Helper.className = "gf-helper-text";
  section3Helper.textContent =
    "Click the button below to automatically fill the form with ChatGPT's answers. Questions will be highlighted as they're filled.";
  section3.appendChild(section3Helper);

  const btnGroup = document.createElement("div");
  btnGroup.className = "gf-btn-group";

  const fillButton = document.createElement("button");
  fillButton.className = "gf-button gf-button-success";
  fillButton.textContent = "✨ Fill Form";
  btnGroup.appendChild(fillButton);

  const clearButton = document.createElement("button");
  clearButton.className = "gf-button gf-button-secondary";
  clearButton.textContent = "🗑️ Clear All";
  btnGroup.appendChild(clearButton);

  section3.appendChild(btnGroup);
  body.appendChild(section3);

  panel.appendChild(body);

  console.log(
    "📦 [GFormToGPT] Panel fully constructed. Children count:",
    panel.children.length,
  );
  console.log("📦 [GFormToGPT] Panel computed styles:", {
    display: panel.style.display,
    visibility: panel.style.visibility,
    opacity: panel.style.opacity,
    zIndex: panel.style.zIndex,
    position: panel.style.position,
  });

  // Ensure document.body exists before appending
  if (document.body) {
    console.log("✅ [GFormToGPT] document.body exists. Appending panel...");
    console.log(
      "📊 [GFormToGPT] document.body children count before append:",
      document.body.children.length,
    );
    document.body.appendChild(panel);
    console.log("✅ [GFormToGPT] Panel successfully appended to document.body");
    console.log(
      "📊 [GFormToGPT] document.body children count after append:",
      document.body.children.length,
    );
    console.log(
      "🔍 [GFormToGPT] Panel in DOM:",
      document.getElementById("gf-panel") !== null,
    );
    console.log(
      "🔍 [GFormToGPT] Panel display property:",
      window.getComputedStyle(panel).display,
    );
    console.log(
      "🔍 [GFormToGPT] Panel visibility property:",
      window.getComputedStyle(panel).visibility,
    );
  } else {
    console.warn(
      "⚠️ [GFormToGPT] document.body is null! Waiting for DOMContentLoaded...",
    );
    // Fallback: wait for body to be ready
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) {
        console.log(
          "✅ [GFormToGPT] DOMContentLoaded fired. document.body now exists. Appending panel...",
        );
        document.body.appendChild(panel);
        console.log(
          "✅ [GFormToGPT] Panel successfully appended after DOMContentLoaded",
        );
        console.log(
          "🔍 [GFormToGPT] Panel in DOM:",
          document.getElementById("gf-panel") !== null,
        );
      } else {
        console.error(
          "❌ [GFormToGPT] document.body still null after DOMContentLoaded!",
        );
      }
    });
  }

  // ── Drag functionality ──
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  console.log("🎯 [GFormToGPT] Setting up drag event listeners...");
  headerTop.onmousedown = (event) => {
    console.log("🖱️ [GFormToGPT] Mousedown on header detected");
    if (event.target === closeButton) {
      console.log(
        "🖱️ [GFormToGPT] Mousedown was on close button, skipping drag",
      );
      return;
    }
    isDragging = true;
    offsetX = event.clientX - panel.offsetLeft;
    offsetY = event.clientY - panel.offsetTop;
    headerTop.style.cursor = "grabbing";
  };

  document.onmousemove = (event) => {
    if (!isDragging) return;
    panel.style.left = event.clientX - offsetX + "px";
    panel.style.top = event.clientY - offsetY + "px";
    panel.style.right = "auto";
  };

  document.onmouseup = () => {
    if (isDragging) {
      console.log("🖱️ [GFormToGPT] Mouseup - drag ended");
    }
    isDragging = false;
    headerTop.style.cursor = "grab";
  };
  console.log("✅ [GFormToGPT] Drag event listeners registered");

  // Keyboard toggle: Ctrl+Shift+S
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      console.log("⌨️ [GFormToGPT] Ctrl+Shift+S detected");
      console.log(
        "📍 [GFormToGPT] Panel current display:",
        panel.style.display,
      );
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      console.log("📍 [GFormToGPT] Panel new display:", panel.style.display);
    }
  });
  console.log("✅ [GFormToGPT] Keyboard toggle listener registered");

  // ── Helper functions ──
  function sleepAsync(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function normalizeQuestionText(text) {
    // For stable question tracking: lowercased, whitespace collapsed
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }

  // ── SCAN handler ──
  scanButton.onclick = async () => {
    console.log("🔍 [GFormToGPT] Scan button clicked");
    questionMap.clear();
    filteredNotice.style.display = "none";

    const questionContainers = document.querySelectorAll('[role="listitem"]');
    let questionCount = 0;
    let filteredQuestionCount = 0;
    let formattedQuestionList = "";

    for (const container of questionContainers) {
      const heading = container.querySelector('[role="heading"]');
      if (!heading) continue;
      const questionText = heading.textContent.trim();
      if (!questionText) continue;

      // ── Filter personal questions ──
      if (isPersonalQuestion(questionText)) {
        filteredQuestionCount++;
        // Still track for graceful skipping during fill
        const normalizedKey = normalizeQuestionText(questionText);
        questionMap.set(normalizedKey, {
          number: null,
          text: questionText,
          type: "filtered",
          container,
        });
        continue;
      }

      questionCount++;
      const questionData = {
        number: questionCount,
        text: questionText,
        type: null,
        options: [],
        inputElement: null,
        container,
      };

      // ── Detect radio buttons ──
      const radioElements = container.querySelectorAll('[role="radio"]');
      if (radioElements.length) {
        questionData.type = "radio";
        radioElements.forEach((radioElement, index) => {
          const label =
            radioElement.getAttribute("aria-label") ||
            radioElement.textContent.trim();
          questionData.options.push({
            letter: String.fromCharCode(97 + index),
            text: label,
            element: radioElement,
          });
        });
      }

      // ── Detect checkboxes ──
      if (!questionData.type) {
        const checkboxElements =
          container.querySelectorAll('[role="checkbox"]');
        if (checkboxElements.length) {
          questionData.type = "checkbox";
          checkboxElements.forEach((checkboxElement, index) => {
            const label =
              checkboxElement.getAttribute("aria-label") ||
              checkboxElement.textContent.trim();
            questionData.options.push({
              letter: String.fromCharCode(97 + index),
              text: label,
              element: checkboxElement,
            });
          });
        }
      }

      // ── Detect dropdown ──
      if (!questionData.type) {
        const dropdownTrigger = container.querySelector(
          '[role="combobox"], [role="button"][aria-haspopup]',
        );
        if (dropdownTrigger) {
          questionData.type = "dropdown";
          questionData.dropdownTrigger = dropdownTrigger;
          // Open dropdown to reveal options
          dropdownTrigger.click();
          await sleepAsync(350);
          // Find all visible options
          const optionElements = document.querySelectorAll('[role="option"]');
          let optionIndex = 0;
          optionElements.forEach((optionElement) => {
            const optionText = optionElement.textContent.trim();
            if (optionText && optionText.toLowerCase() !== "choose") {
              questionData.options.push({
                letter: String.fromCharCode(97 + optionIndex),
                text: optionText,
                element: optionElement,
              });
              optionIndex++;
            }
          });
          // Close dropdown
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          await sleepAsync(200);
        }
      }

      // ── Detect text inputs ──
      if (!questionData.type) {
        const textInput = container.querySelector(
          'input[type="text"], input[type="email"], input[type="number"], input[type="tel"]',
        );
        if (textInput) {
          questionData.type = "text";
          questionData.inputElement = textInput;
        }
      }

      // ── Detect textarea (long answer) ──
      if (!questionData.type) {
        const textareaElement = container.querySelector("textarea");
        if (textareaElement) {
          questionData.type = "textarea";
          questionData.inputElement = textareaElement;
        }
      }

      if (!questionData.type) continue; // Unsupported type

      const normalizedKey = normalizeQuestionText(questionText);
      questionMap.set(normalizedKey, questionData);

      // Build formatted output for ChatGPT
      formattedQuestionList += `Q${questionCount}. [${questionData.type.toUpperCase()}] ${questionText}\n`;
      questionData.options.forEach((option) => {
        formattedQuestionList += `   ${option.letter}) ${option.text}\n`;
      });
      formattedQuestionList += "\n";
    }

    if (!questionMap.size || questionCount === 0) {
      status.textContent =
        "❌ No questions found. Try scrolling to load all questions, then try again.";
      console.error(
        "❌ [GFormToGPT] No questions found. questionMap size:",
        questionMap.size,
      );
      console.error(
        "📍 [GFormToGPT] Form containers found:",
        document.querySelectorAll('[role="listitem"]').length,
      );
      return;
    }

    if (filteredQuestionCount > 0) {
      filteredNotice.style.display = "block";
      filteredNotice.textContent = `⚠️ ${filteredQuestionCount} personal question(s) skipped (name, email, etc.)`;
      console.log(
        `⚠️ [GFormToGPT] ${filteredQuestionCount} personal questions filtered`,
      );
    }

    status.textContent = `✅ Found ${questionCount} question(s)! ChatGPT is opening in a new tab. Once it answers them, copy the JSON and paste it here.`;
    console.log(
      `✅ [GFormToGPT] Scan complete: ${questionCount} questions extracted, ${filteredQuestionCount} filtered`,
    );

    // ── Build ChatGPT prompt ──
    const chatGptPrompt = `You are answering questions extracted from a Google Form.

YOU MUST FOLLOW THIS PROCESS FOR EVERY QUESTION:

1. Decide if the question is factual, quiz-based, or searchable.
2. If searchable, search the internet BEFORE answering.
3. Cross-check answers using more than one reliable source.
4. Choose the most likely correct answer.
5. If the answer cannot be verified confidently, return null.
6. Do NOT guess.

STRICT FILTERING RULES:
- IGNORE and DO NOT ANSWER any personal or identifying questions.
- This includes questions asking for: name, full name, email, gmail, section, class, grade, year, student, student number, ID, phone, contact, address, school.
- If personal, return null.

STRICT OUTPUT RULES:
- Output ONLY valid JSON.
- No explanations.
- No confidence statements.
- No source links.
- No text before or after JSON.

ANSWER FORMAT:
- Radio or dropdown: single letter string "a", "b", "c".
- Checkbox: array of letters ["a","c"].
- Text or short answer: string.
- Unknown, unverifiable, or filtered: null.

EXAMPLE OUTPUT:
{
  "1": "b",
  "2": ["a","d"],
  "3": "photosynthesis",
  "4": null
}

NOW ANSWER THE FOLLOWING QUESTIONS:

${formattedQuestionList}`;

    // Open ChatGPT with prefilled prompt
    // Try with standard %20 encoding
    // let encodedPrompt = encodeURIComponent(chatGptPrompt);
    // let chatGptUrl = `https://chatgpt.com/?prompt=${encodedPrompt}&hints=search`;

    // Fallback: if above doesn't work, try with + encoding instead
    // Uncomment the lines below and comment out the above if %20 doesn't work
    encodedPrompt = encodeURIComponent(chatGptPrompt)
      .replace(/%20/g, "+")
      .replace(/%0A/g, "+");
    chatGptUrl = `https://chatgpt.com/?prompt=${encodedPrompt}&hints=search`;
    console.log(
      "🌐 [GFormToGPT] Opening ChatGPT with URL:",
      chatGptUrl.substring(0, 100) + "...",
    );
    GM_openInTab(chatGptUrl, { active: true, insert: true });

    status.textContent = `✅ ChatGPT opened! 1) Wait for it to answer, 2) Copy the JSON response, 3) Paste it above.`;
    console.log(`✅ [GFormToGPT] ChatGPT tab opened successfully`);
  };

  // ── FILL handler ──
  fillButton.onclick = async () => {
    console.log("✨ [GFormToGPT] Fill button clicked");
    if (!questionMap.size) {
      status.textContent = "⚠️ Scan the form first using Step 1!";
      return;
    }

    let answerData;
    try {
      const jsonMatch = output.value.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      answerData = JSON.parse(jsonMatch[0]);
      console.log(
        "📋 [GFormToGPT] JSON parsed successfully. Questions in JSON:",
        Object.keys(answerData).length,
      );
    } catch {
      status.textContent =
        "❌ Invalid JSON. Make sure you copied the correct response from ChatGPT.";
      console.error(
        "❌ [GFormToGPT] JSON parse error. Output value:",
        output.value.substring(0, 100),
      );
      return;
    }

    status.textContent = "⏳ Filling form... (answers will be highlighted)";
    let filledCount = 0;
    let totalCount = 0;

    for (const question of questionMap.values()) {
      if (question.type === "filtered" || question.number === null) continue;
      totalCount++;

      const answer =
        answerData[question.number] ?? answerData[String(question.number)];
      if (answer === undefined || answer === null) continue;

      // Highlight and scroll to question
      question.container.style.outline = "3px solid #4caf50";
      question.container.style.outlineOffset = "4px";
      question.container.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      await sleepAsync(150);

      try {
        if (question.type === "radio") {
          const selectedOption = question.options.find(
            (opt) => opt.letter === String(answer).toLowerCase(),
          );
          if (selectedOption) {
            selectedOption.element.click();
            filledCount++;
          }
        } else if (question.type === "checkbox") {
          const selectedLetters = (
            Array.isArray(answer) ? answer : [answer]
          ).map((letter) => String(letter).toLowerCase());
          let isAnswerFilled = false;
          for (const letter of selectedLetters) {
            const selectedOption = question.options.find(
              (opt) => opt.letter === letter,
            );
            if (
              selectedOption &&
              selectedOption.element.getAttribute("aria-checked") !== "true"
            ) {
              selectedOption.element.click();
              await sleepAsync(80);
              isAnswerFilled = true;
            }
          }
          if (isAnswerFilled) filledCount++;
        } else if (question.type === "dropdown") {
          // Open dropdown, find and click option
          question.dropdownTrigger.click();
          await sleepAsync(400);
          // Re-query live DOM for options
          const liveOptionElements =
            document.querySelectorAll('[role="option"]');
          const targetIndex = question.options.findIndex(
            (opt) => opt.letter === String(answer).toLowerCase(),
          );
          if (targetIndex !== -1 && liveOptionElements[targetIndex]) {
            liveOptionElements[targetIndex].click();
            filledCount++;
          } else {
            // Close dropdown if option not found
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
          }
        } else if (question.type === "text" || question.type === "textarea") {
          question.inputElement.focus();
          // Use native setter for React-controlled inputs
          const nativeValueSetter = Object.getOwnPropertyDescriptor(
            question.inputElement.tagName === "TEXTAREA"
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype,
            "value",
          )?.set;
          if (nativeValueSetter) {
            nativeValueSetter.call(question.inputElement, String(answer));
          } else {
            question.inputElement.value = String(answer);
          }
          question.inputElement.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          question.inputElement.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
          filledCount++;
        }
      } catch (error) {
        console.error(`[GF Filler] Error on Q${question.number}:`, error);
      }

      await sleepAsync(200);
      question.container.style.outline = "";
      question.container.style.outlineOffset = "";
    }

    status.textContent = `✅ Done! Filled ${filledCount} of ${totalCount} answer(s). Check highlighted questions.`;
    console.log(
      `✅ [GFormToGPT] Fill complete: ${filledCount}/${totalCount} questions filled`,
    );
  };

  // ── CLEAR handler ──
  clearButton.onclick = () => {
    console.log("🗑️ [GFormToGPT] Clear button clicked");
    // Clear text inputs
    document
      .querySelectorAll(
        'input[type="text"], input[type="email"], input[type="number"], textarea',
      )
      .forEach((inputElement) => {
        inputElement.value = "";
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      });

    // Clear checkboxes
    document
      .querySelectorAll('[role="checkbox"][aria-checked="true"]')
      .forEach((checkboxElement) => checkboxElement.click());

    // Clear output textarea
    output.value = "";
    status.textContent = "🗑️ Form cleared! Ready to start over.";
    console.log("✅ [GFormToGPT] All fields cleared");
  };

  console.log(
    "✅ Google Forms to ChatGPT v3 loaded. Ctrl+Shift+S to toggle panel.",
  );
  console.log("📊 [GFormToGPT] Final status check:", {
    panelInDOM: document.getElementById("gf-panel") !== null,
    panelParent: panel.parentElement?.tagName || "NOT IN DOM",
    panelDisplay: window.getComputedStyle(panel).display,
    panelVisibility: window.getComputedStyle(panel).visibility,
    panelZIndex: window.getComputedStyle(panel).zIndex,
    bodyExists: !!document.body,
  });
})();
