$lines = Get-Content "C:\Users\ADMIN\Projects\GFORMSTOGPT\.env"
$token = ($lines | Where-Object { $_ -match 'GITHUB_TOKEN=' } -split '=', 2)[1].Trim()
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }

Write-Host "Deleting old release..."
Invoke-RestMethod -Uri "https://api.github.com/repos/drnx64/GFormsToGPT/releases/315539539" -Method Delete -Headers $headers -UseBasicParsing
Write-Host "Done."

# Also delete the old tag locally and remotely
git tag -d v4.3.0
git push origin :refs/tags/v4.3.0
Write-Host "Tag v4.3.0 deleted."
