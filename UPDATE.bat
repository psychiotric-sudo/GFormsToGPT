@echo off
setlocal
title GFormsToGPT Universal Updater
echo ------------------------------------------
echo 🔄 Checking for GFormsToGPT Updates...
echo ------------------------------------------
echo.

:: Check if this is a Git repository
if exist ".git" (
    echo 📂 Git repository detected. Using 'git pull'...
    where git >nul 2>nul
    if %errorlevel% equ 0 (
        git pull origin main
        goto :complete
    ) else (
        echo ⚠️ Git not found in PATH. Falling back to ZIP download...
    )
)

:: Fallback: PowerShell Download & Extract
echo 🌐 Downloading latest version from GitHub...
set "repo_url=https://github.com/psychiotric-sudo/GFormsToGPT/archive/refs/heads/main.zip"
set "temp_zip=%temp%\gform_update.zip"
set "extract_path=%temp%\gform_extracted"

:: Download ZIP
powershell -Command "Invoke-WebRequest -Uri '%repo_url%' -OutFile '%temp_zip%'"

:: Extract ZIP
if exist "%extract_path%" rd /s /q "%extract_path%"
powershell -Command "Expand-Archive -Path '%temp_zip%' -DestinationPath '%extract_path%'"

:: Move files (assuming the ZIP has a folder GFormsToGPT-main)
echo 📦 Applying updates...
xcopy /s /e /y "%extract_path%\GFormsToGPT-main\*" "."

:: Cleanup
del "%temp_zip%"
rd /s /q "%extract_path%"

:complete
echo.
echo ------------------------------------------
echo ✅ Update Complete!
echo ------------------------------------------
echo.
echo 💡 NEXT STEPS:
echo 1. Open Chrome and go to: chrome://extensions
echo 2. Find GFormToGPT and click the "Reload" icon (🔄)
echo.
pause
exit /b