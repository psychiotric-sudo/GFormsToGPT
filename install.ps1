# GFormsToGPT Auto-Installer for PowerShell
# This script downloads, extracts, and prepares the extension for loading.

# 0. Auto-Elevate to Admin if needed
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "⚠️ Elevation required. Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"irm -useb https://raw.githubusercontent.com/drnx64/GFormsToGPT/main/install.ps1 | iex`"" -Verb RunAs
    exit
}

$repoUrl = "https://github.com/drnx64/GFormsToGPT/archive/refs/heads/main.zip"
$installDir = Join-Path $env:ProgramData "GFormsToGPT"
$zipFile = Join-Path $env:TEMP "gform_update.zip"

Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "🚀 GFormsToGPT Universal Auto-Installer" -ForegroundColor Cyan
Write-Host "------------------------------------------" -ForegroundColor Cyan

# 1. Create directory in ProgramData (System-wide access)
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Write-Host "📂 Created system directory: $installDir" -ForegroundColor Gray
}

# 2. Download
Write-Host "🌐 Downloading latest version from GitHub..." -ForegroundColor Gray
Invoke-WebRequest -Uri $repoUrl -OutFile $zipFile

# 3. Extract
Write-Host "📦 Extracting files..." -ForegroundColor Gray
$extractTemp = Join-Path $env:TEMP "gform_extracted"
if (Test-Path $extractTemp) { Remove-Item -Recurse -Force $extractTemp }
Expand-Archive -Path $zipFile -DestinationPath $extractTemp

# 4. Move files
Copy-Item -Path "$extractTemp\GFormsToGPT-main\*" -Destination $installDir -Recurse -Force
Remove-Item -Recurse -Force $extractTemp
Remove-Item -Force $zipFile

Write-Host "✅ Extension files deployed to: $installDir" -ForegroundColor Green

# 5. Open Browser Extensions Page for all detected browsers
$browsers = @("chrome.exe", "msedge.exe", "brave.exe")
foreach ($b in $browsers) {
    $path = where.exe $b 2>$null
    if ($path) {
        $url = if ($b -eq "msedge.exe") { "edge://extensions" } else { "chrome://extensions" }
        Write-Host "🖥️ Opening extensions page in $($b)..." -ForegroundColor Cyan
        Start-Process $b " $url" -ErrorAction SilentlyContinue
    }
}

Write-Host "`n💡 FINAL STEPS (Required once):" -ForegroundColor Yellow
Write-Host "1. Turn ON 'Developer Mode' in your browser."
Write-Host "2. Click 'Load unpacked'."
Write-Host "3. Select the folder: $installDir"
Write-Host "4. Repeat this for each browser profile you use."

Write-Host "`n------------------------------------------" -ForegroundColor Cyan
Write-Host "Installation Complete! GFormToGPT is ready." -ForegroundColor Cyan
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
