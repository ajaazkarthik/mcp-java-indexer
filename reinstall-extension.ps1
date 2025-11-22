# Reinstall Extension Script
Write-Host "`nReinstalling Java Indexer MCP Extension...`n" -ForegroundColor Cyan

# Build Java indexer
Write-Host "1. Building Java indexer..." -ForegroundColor Yellow
Set-Location java-indexer
mvn clean package -q
Set-Location ..

# Build TypeScript server
Write-Host "2. Building TypeScript server..." -ForegroundColor Yellow
Set-Location server
npm run build
Set-Location ..

# Copy to extension location
Write-Host "3. Extension files ready" -ForegroundColor Yellow

Write-Host "`n✅ Build complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Press Ctrl+Shift+P in VS Code" -ForegroundColor White
Write-Host "2. Type 'Developer: Reload Window'" -ForegroundColor White
Write-Host "3. Press Enter to reload VS Code`n" -ForegroundColor White
