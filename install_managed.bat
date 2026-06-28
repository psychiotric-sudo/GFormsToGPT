@echo off
title GFormsToGPT - Managed Extension Installer
cd /d "%~dp0"

:: Check if PowerShell or pwsh is available
set "PS="
where pwsh >nul 2>&1 && set "PS=pwsh" || (
    where powershell >nul 2>&1 && set "PS=powershell"
)

if not defined PS (
    echo ERROR: PowerShell is required to run this installer.
    echo Please install PowerShell 7+ from https://github.com/PowerShell/PowerShell/releases
    pause
    exit /b 1
)

:: Elevate and run the PowerShell installer
echo ============================================
echo    GFormsToGPT - Managed Extension Installer
echo ============================================
echo.
echo This will install GFormsToGPT as a managed
echo organization extension with protected files.
echo.
echo Administrator privileges are required.
echo.
%PS% -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_managed.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Installation failed or was cancelled.
    pause
)
