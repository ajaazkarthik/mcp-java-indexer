# Package Extension Script
# Kills any stuck processes and packages the extension

Write-Host "Cleaning up any stuck processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Setting memory limit..." -ForegroundColor Cyan
$env:NODE_OPTIONS="--max-old-space-size=4096"

Write-Host "Packaging extension..." -ForegroundColor Cyan
Set-Location "d:\workspace\repo\github-playground\mcp-java-indexer"

& vsce package --no-dependencies

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Extension packaged successfully!" -ForegroundColor Green
    Get-ChildItem -Filter "*.vsix" | ForEach-Object {
        Write-Host "  Created: $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Green
    }
} else {
    Write-Host "`n✗ Packaging failed!" -ForegroundColor Red
    exit 1
}
