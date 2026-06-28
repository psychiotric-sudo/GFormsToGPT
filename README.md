# GFormToGPT 🚀

Scan Google Forms, filter personal questions, and auto-fill with ChatGPT, Claude, or Gemini responses.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L4L326C1X)

## ⚡ One-Click System Installation (PowerShell)

Run the following command in PowerShell to automatically download, extract, and deploy GFormsToGPT to your system (**Auto-Elevates to Admin** if needed):

```powershell
powershell -ExecutionPolicy Bypass -Command "irm -useb https://raw.githubusercontent.com/drnx64/GFormsToGPT/main/install.ps1 | iex"
```

*This installs the extension to `C:\ProgramData\GFormsToGPT` for universal access and opens your browser's extensions page.*

### 🛠️ Manual Installation Steps

1.  **Download** or Clone this repository.
2.  Open your browser (Chrome or Edge).
3.  Go to `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
4.  Enable **Developer Mode** (top right).
5.  Click **Load unpacked** and select the folder where you extracted the files.

## 🌟 Features

- **Auto-Scan:** Automatically detects questions on Google Forms.
- **Privacy Filtering:** Safely filters out personal information.
- **AI Integration:** Seamlessly works with ChatGPT, Claude, and Gemini.
- **Easy UI:** Clean, floating panel for quick access.

## 📂 Project Structure

- `content.js`: Main logic for scanning Google Forms.
- `chatgpt_content.js`: Interaction with ChatGPT.
- `claude_content.js`: Interaction with Claude AI.
- `gemini_content.js`: Interaction with Gemini.
- `manifest.json`: Extension metadata and permissions.
- `install.ps1`: Automated PowerShell installer.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

Developed with ❤️ by drnx64
