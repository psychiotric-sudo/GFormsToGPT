# GFormsToGPT - Managed Extension Installer
# Requires: Run as Administrator
# Downloads, extracts, and deploys the extension as a managed/organization install.

param(
    [string]$InstallPath = "",
    [string]$Browser = ""
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/drnx64/GFormsToGPT.git"
$ZipUrl  = "https://github.com/drnx64/GFormsToGPT/archive/main.zip"
$TempDir = "$env:TEMP\GFormsToGPT_Install"

function Elevate-AsAdmin {
    if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "pwsh"
        if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) { $psi.FileName = "powershell" }
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $args"
        $psi.Verb = "runas"
        Start-Process $psi
        exit
    }
}

function Write-Banner {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "    GFormsToGPT - Managed Extension Installer" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Select-Browser {
    Write-Host "Select your browser:" -ForegroundColor Yellow
    Write-Host "  1) Google Chrome" -ForegroundColor White
    Write-Host "  2) Microsoft Edge" -ForegroundColor White
    Write-Host "  3) Mozilla Firefox" -ForegroundColor White
    Write-Host "  4) Brave" -ForegroundColor White
    Write-Host "  5) Opera" -ForegroundColor White
    Write-Host "  6) Other (custom path)" -ForegroundColor White
    Write-Host ""
    $choice = Read-Host "Enter number (1-6)"
    return $choice
}

function Get-BrowserPath {
    param([string]$browserChoice)
    
    $progFiles = if ([Environment]::Is64BitOperatingSystem) { "${env:ProgramFiles}" } else { "${env:ProgramFiles(x86)}" }
    
    switch ($browserChoice) {
        "1" { return "$progFiles\GFormsToGPT\Chrome" }
        "2" { return "$progFiles\GFormsToGPT\Edge" }
        "3" { return "$progFiles\GFormsToGPT\Firefox" }
        "4" { return "$progFiles\GFormsToGPT\Brave" }
        "5" { return "$progFiles\GFormsToGPT\Opera" }
        default { return "" }
    }
}

function Get-ExtensionId {
    param([string]$manifestPath)
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    # Chrome extension ID is a 32-char hash of the public key; for unpacked it's derived from the path.
    # We use a fixed derived ID for policy purposes.
    return "gformstogpt_managed_extension"
}

function Set-ProtectedPermissions {
    param([string]$path)
    Write-Host "  Setting protected permissions (non-deletable)..." -ForegroundColor Yellow
    
    # Remove inherited permissions and set explicit ones
    icacls $path /inheritance:r /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "BUILTIN\Administrators:(OI)(CI)F" /deny "Users:(OI)(CI)DE" /deny "Users:(OI)(CI)WD" /deny "Users:(OI)(CI)AD" 2>&1 | Out-Null
    
    Write-Host "  Permissions locked: only SYSTEM and Administrators can modify." -ForegroundColor Green
}

function Set-ChromiumPolicy {
    param([string]$extPath, [string]$policyKey = "Google\Chrome", [string]$browserName = "Chrome")
    Write-Host "  Creating $browserName managed policy..." -ForegroundColor Yellow
    
    $manifestPath = "$extPath\manifest.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Host "  manifest.json not found at $manifestPath" -ForegroundColor Red
        return $false
    }
    
    $policiesPath = "HKLM:\SOFTWARE\Policies\$policyKey"
    if (-not (Test-Path $policiesPath)) { New-Item -Path $policiesPath -Force | Out-Null }
    
    # ExtensionInstallSources allows loading unpacked from this path
    $sourcesPath = "$policiesPath\ExtensionInstallSources"
    if (-not (Test-Path $sourcesPath)) { New-Item -Path $sourcesPath -Force | Out-Null }
    Set-ItemProperty -Path $sourcesPath -Name "1" -Value "file:///$($extPath.Replace('\','/'))/*" -Type String -Force
    
    # ExtensionInstallForcelist entry (requires .crx hosted URL; included as reference)
    Write-Host "  $browserName policy applied." -ForegroundColor Green
    Write-Host "  NOTE: Load the extension at $browserName://extensions (Developer mode -> Load unpacked)." -ForegroundColor Yellow
    Write-Host "  Or add --load-extension=`"$extPath`" to the $browserName shortcut target for auto-load." -ForegroundColor Yellow
    return $true
}

function Set-FirefoxPolicy {
    param([string]$extPath)
    Write-Host "  Creating Firefox managed policy..." -ForegroundColor Yellow
    
    $ffPoliciesDir = "$env:ProgramFiles\Mozilla Firefox\distribution"
    if (-not (Test-Path $ffPoliciesDir)) {
        $ffPoliciesDir = "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution"
        if (-not (Test-Path $ffPoliciesDir)) {
            New-Item -Path $ffPoliciesDir -Force | Out-Null
        }
    }
    
    $policiesFile = "$ffPoliciesDir\policies.json"
    $policies = @{}
    if (Test-Path $policiesFile) {
        $policies = Get-Content $policiesFile -Raw | ConvertFrom-Json
    }
    
    # Add or update the extensions settings
    $policiesExtensions = @{
        "Install" = @($extPath)
        "Locked" = @($true)
    }
    
    $policies | Add-Member -Type NoteProperty -Name "Extensions" -Value $policiesExtensions -Force
    
    $policies | ConvertTo-Json -Depth 10 | Set-Content $policiesFile -Force
    Write-Host "  Firefox policy applied at $policiesFile" -ForegroundColor Green
}

function Install-Extension {
    param([string]$targetPath)
    
    Write-Host ""
    Write-Host "Installing to: $targetPath" -ForegroundColor Cyan
    
    # Clean and recreate target
    if (Test-Path $targetPath) {
        Remove-Item -Path "$targetPath\*" -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -Path $targetPath -ItemType Directory -Force | Out-Null
    }
    
    # Copy extension files
    Write-Host "  Copying extension files..." -ForegroundColor Yellow
    $sourceDir = "$TempDir\GFormsToGPT-main"
    Copy-Item -Path "$sourceDir\*" -Destination $targetPath -Recurse -Force
    
    # Remove installer scripts from deployed extension
    @("install_managed.ps1", "install_managed.bat") | ForEach-Object {
        $f = "$targetPath\$_"
        if (Test-Path $f) { Remove-Item $f -Force }
    }
    
    # Set protected permissions
    Set-ProtectedPermissions -path $targetPath
    
    Write-Host "  Extension installed successfully!" -ForegroundColor Green
}

# ─── MAIN ───

# Self-elevate
Elevate-AsAdmin

# Banner
Write-Banner

# ── Step 1: Download ──
Write-Host "[1/5] Downloading extension source..." -ForegroundColor Cyan
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -Path $TempDir -ItemType Directory -Force | Out-Null

try {
    Write-Host "  Downloading ZIP from $ZipUrl ..." -ForegroundColor Yellow
    $zipFile = "$TempDir\repo.zip"
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zipFile -UseBasicParsing
    Expand-Archive -Path $zipFile -DestinationPath $TempDir -Force
    Write-Host "  Download complete." -ForegroundColor Green
} catch {
    Write-Host "  ZIP download failed, trying git clone..." -ForegroundColor Yellow
    if (Get-Command git -ErrorAction SilentlyContinue) {
        git clone $RepoUrl "$TempDir\GFormsToGPT-main" 2>&1 | Out-Null
        Write-Host "  Git clone complete." -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Neither ZIP download nor git worked. Check your internet connection." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── Step 2: Browser selection ──
Write-Host "[2/5] Selecting browser..." -ForegroundColor Cyan
if ([string]::IsNullOrEmpty($Browser)) {
    $browserChoice = Select-Browser
} else {
    $browserChoice = $Browser
}

$defaultPath = Get-BrowserPath -browserChoice $browserChoice
$targetPath = ""

if ($browserChoice -eq "6") {
    Write-Host "Enter custom installation path:" -ForegroundColor Yellow
    $targetPath = Read-Host "Path"
    if ([string]::IsNullOrEmpty($targetPath)) {
        Write-Host "No path entered. Exiting." -ForegroundColor Red
        exit 1
    }
} elseif ([string]::IsNullOrEmpty($defaultPath)) {
    Write-Host "Invalid choice. Defaulting to: C:\Program Files\GFormsToGPT" -ForegroundColor Yellow
    $targetPath = "${env:ProgramFiles}\GFormsToGPT"
} else {
    $targetPath = $defaultPath
}

# ── Step 3: Install files ──
Write-Host "[3/5] Installing extension files..." -ForegroundColor Cyan
Install-Extension -targetPath $targetPath

# ── Step 4: Set browser policy ──
Write-Host "[4/5] Applying browser managed policy..." -ForegroundColor Cyan
switch ($browserChoice) {
    "1" { Set-ChromiumPolicy -extPath $targetPath -policyKey "Google\Chrome" -browserName "Chrome" }
    "2" { Set-ChromiumPolicy -extPath $targetPath -policyKey "Microsoft\Edge" -browserName "Edge" }
    "3" { Set-FirefoxPolicy -extPath $targetPath }
    "4" { Set-ChromiumPolicy -extPath $targetPath -policyKey "BraveSoftware\Brave" -browserName "Brave" }
    default { Write-Host "  Skipping policy for custom/other browser." -ForegroundColor Yellow }
}

# ── Step 5: Cleanup ──
Write-Host "[5/5] Cleaning up..." -ForegroundColor Cyan
Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Extension installed at: $targetPath" -ForegroundColor White
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
switch ($browserChoice) {
    "1" {
        Write-Host "  For Chrome managed deployment:"
        Write-Host "  1. Go to chrome://extensions"
        Write-Host "  2. Enable 'Developer mode' (top right)"
        Write-Host "  3. Click 'Load unpacked' and select: $targetPath"
        Write-Host "  4. Or add --load-extension=`"$targetPath`" to Chrome shortcut target"
        Write-Host "  5. Policies applied (visible at chrome://policy)"
    }
    "2" {
        Write-Host "  For Edge managed deployment:"
        Write-Host "  1. Go to edge://extensions"
        Write-Host "  2. Enable 'Developer mode'"
        Write-Host "  3. Click 'Load unpacked' and select: $targetPath"
        Write-Host "  4. Policies applied (visible at edge://policy)"
    }
    "3" {
        Write-Host "  For Firefox managed deployment:"
        Write-Host "  1. Go to about:config"
        Write-Host "  2. Policies file created at Firefox distribution directory"
        Write-Host "  3. Extension path: $targetPath"
    }
    "4" {
        Write-Host "  For Brave managed deployment:"
        Write-Host "  1. Go to brave://extensions"
        Write-Host "  2. Enable 'Developer mode'"
        Write-Host "  3. Click 'Load unpacked' and select: $targetPath"
        Write-Host "  4. Policies applied"
    }
    default {
        Write-Host "  Load the unpacked extension from your browser's extension page."
        Write-Host "  Path: $targetPath"
    }
}
Write-Host ""
Write-Host "The extension folder is protected with SYSTEM/Administrator-only permissions." -ForegroundColor Green
Write-Host "Standard users cannot delete or modify the files." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
