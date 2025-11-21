# Build script for MCP Java Indexer

Write-Host "🔨 Building MCP Java Indexer..." -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Java
try {
    $javaVersion = java -version 2>&1 | Select-String "version" | ForEach-Object { $_.ToString() }
    Write-Host "✓ Java found: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Java not found. Please install Java 11 or higher." -ForegroundColor Red
    exit 1
}

# Check Maven
try {
    $mavenVersion = mvn -version | Select-String "Apache Maven" | ForEach-Object { $_.ToString() }
    Write-Host "✓ Maven found: $mavenVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Maven not found. Please install Maven 3.6 or higher." -ForegroundColor Red
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js 18 or higher." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 Building Java Indexer..." -ForegroundColor Cyan

Set-Location java-indexer

try {
    mvn clean package -q
    Write-Host "✓ Java Indexer built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Java Indexer build failed" -ForegroundColor Red
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "📦 Building Node.js Server..." -ForegroundColor Cyan

Set-Location server

try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        npm install --silent
    }
    
    npm run build --silent
    Write-Host "✓ Node.js Server built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js Server build failed" -ForegroundColor Red
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
Write-Host '   @java-indexer index_project with rootDir: "C:/path/to/java/project"' -ForegroundColor Gray
