# Package VSIX v2.2.1

Write-Host "📦 Creating VSIX package v2.2.1..." -ForegroundColor Cyan

# Update version in package.json if needed
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
Write-Host "Current version: $($packageJson.version)" -ForegroundColor Yellow

# Build Java JAR
Write-Host "`n🔨 Building Java Indexer..." -ForegroundColor Cyan
Push-Location java-indexer
mvn clean package -DskipTests -q
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Java build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "✅ Java Indexer built" -ForegroundColor Green

# Build TypeScript
Write-Host "`n🔨 Building TypeScript..." -ForegroundColor Cyan
Push-Location server
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ TypeScript build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "✅ TypeScript built" -ForegroundColor Green

# Install root dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Cyan
npm install --silent

# Create VSIX
Write-Host "`n📦 Creating VSIX package..." -ForegroundColor Cyan

# Try vsce package with error handling
$vsixName = "java-indexer-mcp-$($packageJson.version).vsix"

# Remove old VSIX if exists
if (Test-Path $vsixName) {
    Remove-Item $vsixName -Force
    Write-Host "Removed old $vsixName" -ForegroundColor Yellow
}

# Package using vsce
try {
    # Try with npx first
    $env:npm_config_yes = "true"
    & npx "@vscode/vsce" package --out $vsixName 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0 -and (Test-Path $vsixName)) {
        $size = (Get-Item $vsixName).Length / 1MB
        Write-Host "`n✅ SUCCESS: $vsixName created!" -ForegroundColor Green
        Write-Host "   Size: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
        Write-Host "   Location: $(Resolve-Path $vsixName)" -ForegroundColor Cyan
        
        Write-Host "`n🚀 Next steps:" -ForegroundColor Yellow
        Write-Host "   Test locally: code --install-extension $vsixName" -ForegroundColor Gray
        Write-Host "   Publish: vsce publish" -ForegroundColor Gray
        Write-Host "   Or upload manually at: https://marketplace.visualstudio.com/manage" -ForegroundColor Gray
        
        exit 0
    }
} catch {
    Write-Host "⚠️  vsce package failed: $_" -ForegroundColor Yellow
}

# Fallback: Manual instructions
Write-Host "`n⚠️  Automatic packaging failed (npm issue)" -ForegroundColor Yellow
Write-Host "`nℹ️  Manual Publishing Steps:" -ForegroundColor Cyan
Write-Host "1. Restart PowerShell/Terminal" -ForegroundColor White
Write-Host "2. Run: vsce package" -ForegroundColor White
Write-Host "3. Or use VS Code Marketplace web UI:" -ForegroundColor White
Write-Host "   https://marketplace.visualstudio.com/manage/publishers/ubanishathanvenkatesan" -ForegroundColor Gray
Write-Host "`n4. Upload the following files manually:" -ForegroundColor White
Write-Host "   - Extension package (ZIP all files)" -ForegroundColor Gray
Write-Host "   - README.md, CHANGELOG.md, LICENSE" -ForegroundColor Gray
Write-Host ""
Write-Host "All builds ready in java-indexer/target and server/dist" -ForegroundColor Cyan

exit 1
