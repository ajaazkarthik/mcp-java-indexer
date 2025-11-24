# Build script for MCP Java Indexer

Write-Host "🔨 Building MCP Java Indexer..." -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Java
$javaCheck = java -version 2>&1
if ($LASTEXITCODE -eq 0) {
    $javaVersion = $javaCheck | Select-String "version" | Select-Object -First 1
    Write-Host "✓ Java found: $javaVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Java not found. Please install Java 11 or higher." -ForegroundColor Red
    exit 1
}

# Check Maven
$mavenCheck = mvn -version 2>&1
if ($LASTEXITCODE -eq 0) {
    $mavenVersion = $mavenCheck | Select-String "Apache Maven" | Select-Object -First 1
    Write-Host "✓ Maven found: $mavenVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Maven not found. Please install Maven 3.6 or higher." -ForegroundColor Red
    exit 1
}

# Check Node.js
$nodeCheck = node --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js found: $nodeCheck" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Please install Node.js 18 or higher." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 Building Java Indexer..." -ForegroundColor Cyan

Set-Location java-indexer

mvn clean package -q
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Java Indexer built successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Java Indexer build failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "📦 Building Node.js Server..." -ForegroundColor Cyan

Set-Location server

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install --silent
}

npm run build --silent
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js Server built successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js Server build failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Add the MCP server to VS Code configuration:"
Write-Host "   File location: %APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json"
Write-Host ""
Write-Host "2. Add this configuration:"
Write-Host '   {' -ForegroundColor Gray
Write-Host '     "mcpServers": {' -ForegroundColor Gray
Write-Host '       "java-indexer": {' -ForegroundColor Gray
Write-Host '         "command": "node",' -ForegroundColor Gray
Write-Host "         `"args`": [`"$PWD\server\dist\index.js`"]" -ForegroundColor Gray
Write-Host '       }' -ForegroundColor Gray
Write-Host '     }' -ForegroundColor Gray
Write-Host '   }' -ForegroundColor Gray
Write-Host ""
Write-Host "3. Restart VS Code"
Write-Host ""
Write-Host "4. Test in Copilot Chat:"
Write-Host "   @java-indexer index_project with rootDir: `"C:/path/to/java/project`"" -ForegroundColor Gray
