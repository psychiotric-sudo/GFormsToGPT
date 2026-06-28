# GFormsToGPT - Create GitHub Release
# Reads GITHUB_TOKEN from .env, creates a tag + release, uploads install_managed.bat

$ErrorActionPreference = "Stop"
$Repo = "drnx64/GFormsToGPT"

# Read token from .env
$envFile = "C:\Users\ADMIN\Projects\GFORMSTOGPT\.env"
Write-Host "Looking for .env at: $envFile" -ForegroundColor Cyan
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    Write-Host "Create it with: GITHUB_TOKEN=ghp_your_token_here" -ForegroundColor Yellow
    exit 1
}

$lines = Get-Content $envFile
$tokenLine = $lines | Where-Object { $_ -match 'GITHUB_TOKEN=' }
if (-not $tokenLine) {
    Write-Host "ERROR: GITHUB_TOKEN not found in .env" -ForegroundColor Red
    Write-Host "Add: GITHUB_TOKEN=ghp_your_token_here" -ForegroundColor Yellow
    exit 1
}

$token = ($tokenLine -split '=', 2)[1].Trim()
if ([string]::IsNullOrEmpty($token)) {
    Write-Host "ERROR: GITHUB_TOKEN is empty" -ForegroundColor Red
    exit 1
}

# Get version from manifest.json
$manifest = Get-Content "$PSScriptRoot\manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$tag = "v$version"

Write-Host "Creating release for $Repo @ $tag" -ForegroundColor Cyan

# Check if tag exists
$tagExists = git tag -l "$tag" 2>&1
if ($tagExists) {
    Write-Host "Tag $tag already exists locally." -ForegroundColor Yellow
} else {
    # Create and push tag
    git tag "$tag"
    git push origin "$tag"
    Write-Host "Tag $tag created and pushed." -ForegroundColor Green
}

# Check if release already exists
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github+json"
}
$existingRelease = $null
try {
    $existingRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$tag" -Headers $headers -UseBasicParsing -ErrorAction SilentlyContinue
} catch {}

$releaseId = $null
if ($existingRelease) {
    Write-Host "Release $tag already exists. Using existing release." -ForegroundColor Yellow
    $releaseId = $existingRelease.id
} else {
    # Create release
    $body = @{
        tag_name = $tag
        name = "GFormsToGPT $tag"
        body = "Managed extension installer for organization deployment.`n`nDownloads the extension from GitHub, installs to a protected system path, and locks permissions so standard users cannot delete it."
        draft = $false
        prerelease = $false
    } | ConvertTo-Json

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Method Post -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing
    $releaseId = $release.id
    Write-Host "Release created: $($release.html_url)" -ForegroundColor Green
}

# Upload install_managed.bat as asset
$assetPath = "$PSScriptRoot\install_managed.bat"
if (Test-Path $assetPath) {
    $assetUrl = "https://uploads.github.com/repos/$Repo/releases/$releaseId/assets?name=install_managed.bat"
    $assetHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/octet-stream"
    }
    $fileBytes = [System.IO.File]::ReadAllBytes($assetPath)
    $uploadResult = Invoke-RestMethod -Uri $assetUrl -Method Post -Headers $assetHeaders -Body $fileBytes -ContentType "application/octet-stream" -UseBasicParsing
    Write-Host "install_managed.bat uploaded to release assets." -ForegroundColor Green
} else {
    Write-Host "WARNING: install_managed.bat not found at $assetPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Release complete: https://github.com/$Repo/releases/tag/$tag" -ForegroundColor Cyan
