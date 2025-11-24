# Package MCP Java Indexer v2.1.0

Write-Host "Packaging MCP Java Indexer v2.1.0..." -ForegroundColor Cyan

# Set working directory
Set-Location "d:\workspace\repo\github-playground\mcp-java-indexer"

# Build TypeScript
Write-Host "`nBuilding TypeScript..." -ForegroundColor Yellow
Set-Location server
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript build failed!" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Package extension
Write-Host "`nPackaging extension..." -ForegroundColor Yellow
$Env:NODE_OPTIONS = "--max-old-space-size=4096"

# Try to package
$result = & { vsce package --no-dependencies 2>&1 }
Write-Host $result

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS: Extension packaged!" -ForegroundColor Green
    Get-ChildItem -Filter "*.vsix" | Select-Object -First 1 | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  File: $($_.Name)" -ForegroundColor Green
        Write-Host "  Size: $sizeMB MB" -ForegroundColor Green
    }
} else {
    Write-Host "`nERROR: Packaging failed!" -ForegroundColor Red
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $result
    exit 1
}
