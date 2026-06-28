@echo off
:: GFormsToGPT - Managed Extension Installer (Standalone)
:: Downloads the extension from GitHub, deploys as a managed/organization install.
setlocal enabledelayedexpansion

title GFormsToGPT - Managed Extension Installer
cd /d "%~dp0"

:: ─── PowerShell self-elevate & embedded script ───
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
$ErrorActionPreference='Stop'; ^
$RepoUrl='https://github.com/drnx64/GFormsToGPT.git'; ^
$ZipUrl='https://github.com/drnx64/GFormsToGPT/archive/main.zip'; ^
$TempDir=\"$env:TEMP\GFormsToGPT_Install\"; ^
function Elevate { if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]'Administrator')) { $p=New-Object Diagnostics.ProcessStartInfo; $p.FileName='powershell'; $p.Arguments=\"-NoProfile -ExecutionPolicy Bypass -File `\"$PSCommandPath`\"\"; $p.Verb='runas'; Start-Process $p; exit } }; ^
Elevate; ^
Write-Host \"============================================\" -ForegroundColor Cyan; ^
Write-Host \"    GFormsToGPT - Managed Extension Installer\" -ForegroundColor Cyan; ^
Write-Host \"============================================\" -ForegroundColor Cyan; ^
Write-Host \"\"; ^
Write-Host \"[1/4] Downloading extension source...\" -ForegroundColor Cyan; ^
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }; ^
New-Item $TempDir -ItemType Directory -Force | Out-Null; ^
try { ^
  $z=\"$TempDir\repo.zip\"; ^
  Invoke-WebRequest -Uri $ZipUrl -OutFile $z -UseBasicParsing; ^
  Expand-Archive $z -DestinationPath $TempDir -Force; ^
  Write-Host \"  Download complete.\" -ForegroundColor Green ^
} catch { ^
  if (Get-Command git -ErrorAction SilentlyContinue) { ^
    git clone $RepoUrl \"$TempDir\GFormsToGPT-main\" 2>&1 | Out-Null; ^
    Write-Host \"  Git clone complete.\" -ForegroundColor Green ^
  } else { ^
    Write-Host \"  ERROR: Download failed.\" -ForegroundColor Red; ^
    Read-Host \"Press Enter\"; exit 1 ^
  } ^
}; ^
Write-Host \"\"; ^
Write-Host \"[2/4] Select browser:\" -ForegroundColor Yellow; ^
Write-Host \"  1) Google Chrome\"; ^
Write-Host \"  2) Microsoft Edge\"; ^
Write-Host \"  3) Mozilla Firefox\"; ^
Write-Host \"  4) Brave\"; ^
Write-Host \"  5) Other (custom path)\"; ^
Write-Host \"\"; ^
$c=Read-Host \"Enter number (1-5)\"; ^
$progF=if([Environment]::Is64BitOperatingSystem){$env:ProgramFiles}else{\"${env:ProgramFiles(x86)}\"}; ^
switch($c){ ^
  \"1\"{$t=\"$progF\GFormsToGPT\Chrome\"} ^
  \"2\"{$t=\"$progF\GFormsToGPT\Edge\"} ^
  \"3\"{$t=\"$progF\GFormsToGPT\Firefox\"} ^
  \"4\"{$t=\"$progF\GFormsToGPT\Brave\"} ^
  default{$t=Read-Host \"Enter custom path\"} ^
}; ^
if([string]::IsNullOrEmpty($t)){Write-Host \"No path. Exiting.\" -ForegroundColor Red; exit 1}; ^
Write-Host \"\"; ^
Write-Host \"[3/4] Installing to: $t\" -ForegroundColor Cyan; ^
if (Test-Path $t) { Remove-Item \"$t\*\" -Recurse -Force -ErrorAction SilentlyContinue } else { New-Item $t -ItemType Directory -Force | Out-Null }; ^
Copy-Item \"$TempDir\GFormsToGPT-main\*\" $t -Recurse -Force; ^
icacls $t /inheritance:r /grant \"SYSTEM:(OI)(CI)F\" /grant \"Administrators:(OI)(CI)F\" /grant \"BUILTIN\Administrators:(OI)(CI)F\" /deny \"Users:(OI)(CI)DE\" /deny \"Users:(OI)(CI)WD\" /deny \"Users:(OI)(CI)AD\" 2>&1 | Out-Null; ^
Write-Host \"  Permissions locked (SYSTEM/Admin only).\" -ForegroundColor Green; ^
Write-Host \"\"; ^
Write-Host \"[4/4] Cleaning up...\" -ForegroundColor Cyan; ^
Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue; ^
Write-Host \"\"; ^
Write-Host \"============================================\" -ForegroundColor Cyan; ^
Write-Host \"  INSTALLATION COMPLETE\" -ForegroundColor Green; ^
Write-Host \"============================================\" -ForegroundColor Cyan; ^
Write-Host \"\"; ^
Write-Host \"Extension installed at: $t\" -ForegroundColor White; ^
Write-Host \"\"; ^
switch($c){ ^
  \"1\"{Write-Host \"1. Go to chrome://extensions, enable Developer mode, click Load unpacked\";Write-Host \"2. Select: $t\"} ^
  \"2\"{Write-Host \"1. Go to edge://extensions, enable Developer mode, click Load unpacked\";Write-Host \"2. Select: $t\"} ^
  \"3\"{Write-Host \"1. Go to about:debugging#/runtime/this-firefox, click Load Temporary Add-on\";Write-Host \"2. Select: $t\manifest.json\"} ^
  \"4\"{Write-Host \"1. Go to brave://extensions, enable Developer mode, click Load unpacked\";Write-Host \"2. Select: $t\"} ^
  default{Write-Host \"Load the unpacked extension from your browser's extension page.\";Write-Host \"Path: $t\"} ^
}; ^
Write-Host \"\"; ^
Write-Host \"Files are protected - standard users cannot delete them.\" -ForegroundColor Green; ^
Write-Host \"\"; ^
Read-Host \"Press Enter to exit\"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Installation failed or was cancelled.
    pause
)
