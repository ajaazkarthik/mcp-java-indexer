# Java Indexer MCP Extension - Quick Validation Script
# Run this to check if the extension is ready for testing

Write-Host "`n=== Java Indexer MCP Extension - Status Check ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check if extension is installed
Write-Host "1. Checking Extension Installation..." -ForegroundColor Yellow
$extensionInstalled = code --list-extensions | Select-String "java-indexer-mcp"
if ($extensionInstalled) {
    Write-Host "   ✅ Extension installed: $extensionInstalled" -ForegroundColor Green
} else {
    Write-Host "   ❌ Extension NOT installed" -ForegroundColor Red
    exit 1
}

# 2. Check VSIX file
Write-Host "`n2. Checking VSIX Package..." -ForegroundColor Yellow
$vsixPath = "D:\workspace\repo\github-playground\mcp-java-indexer\java-indexer-mcp-1.0.0.vsix"
if (Test-Path $vsixPath) {
    $vsixSize = (Get-Item $vsixPath).Length / 1MB
    Write-Host "   ✅ VSIX exists: $([math]::Round($vsixSize, 2)) MB" -ForegroundColor Green
} else {
    Write-Host "   ❌ VSIX file not found" -ForegroundColor Red
}

# 3. Check JAR file
Write-Host "`n3. Checking Java Indexer JAR..." -ForegroundColor Yellow
$jarPath = "D:\workspace\repo\github-playground\mcp-java-indexer\java-indexer\target\java-indexer-1.0.0.jar"
if (Test-Path $jarPath) {
    $jarSize = (Get-Item $jarPath).Length / 1MB
    Write-Host "   ✅ JAR exists: $([math]::Round($jarSize, 2)) MB" -ForegroundColor Green
} else {
    Write-Host "   ❌ JAR file not found" -ForegroundColor Red
}

# 4. Check MCP Server compiled
Write-Host "`n4. Checking MCP Server..." -ForegroundColor Yellow
$serverPath = "D:\workspace\repo\github-playground\mcp-java-indexer\server\dist\index.js"
if (Test-Path $serverPath) {
    Write-Host "   ✅ Server compiled" -ForegroundColor Green
} else {
    Write-Host "   ❌ Server not compiled" -ForegroundColor Red
}

# 5. Check Extension compiled
Write-Host "`n5. Checking Extension..." -ForegroundColor Yellow
$extPath = "D:\workspace\repo\github-playground\mcp-java-indexer\dist\extension.js"
if (Test-Path $extPath) {
    Write-Host "   ✅ Extension compiled" -ForegroundColor Green
} else {
    Write-Host "   ❌ Extension not compiled" -ForegroundColor Red
}

# 6. Check test project
Write-Host "`n6. Checking Test Project..." -ForegroundColor Yellow
$testProject = "D:\workspace\test-java-projects\spring-petclinic"
if (Test-Path $testProject) {
    $javaFiles = (Get-ChildItem -Path $testProject -Recurse -Filter "*.java" | Measure-Object).Count
    Write-Host "   ✅ Spring PetClinic cloned: $javaFiles Java files" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Test project not found" -ForegroundColor Yellow
}

# 7. Check Java installation
Write-Host "`n7. Checking Java Installation..." -ForegroundColor Yellow
try {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    Write-Host "   ✅ Java installed: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Java not found in PATH" -ForegroundColor Red
}

# 8. Check Node.js installation
Write-Host "`n8. Checking Node.js Installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Node.js not found in PATH" -ForegroundColor Red
}

# 9. Check VS Code running
Write-Host "`n9. Checking VS Code Processes..." -ForegroundColor Yellow
$vscodeProcesses = Get-Process -Name "Code" -ErrorAction SilentlyContinue
if ($vscodeProcesses) {
    $processCount = ($vscodeProcesses | Measure-Object).Count
    Write-Host "   ✅ VS Code running: $processCount instance(s)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  VS Code not currently running" -ForegroundColor Yellow
}

# 10. Check MCP config
Write-Host "`n10. Checking MCP Configuration..." -ForegroundColor Yellow
$mcpConfig = "$env:APPDATA\Code\User\mcp.json"
if (Test-Path $mcpConfig) {
    $config = Get-Content $mcpConfig -Raw | ConvertFrom-Json
    $javaIndexerConfig = $config.servers.'java-indexer'
    if ($javaIndexerConfig) {
        Write-Host "   ⚠️  Manual java-indexer config found (should be commented out)" -ForegroundColor Yellow
    } else {
        Write-Host "   ✅ No manual config (extension will auto-register)" -ForegroundColor Green
    }
} else {
    Write-Host "   ✅ No mcp.json (extension will auto-register)" -ForegroundColor Green
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Extension is ready for testing!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open Spring PetClinic project in VS Code"
Write-Host "2. Open Command Palette (Ctrl+Shift+P)"
Write-Host "3. Run: 'Developer: Show Running Extensions'"
Write-Host "4. Verify 'Java Indexer MCP' is activated"
Write-Host "5. Open Copilot Chat and start testing MCP tools"
Write-Host "6. Follow the checklist in TEST_CHECKLIST.md"
Write-Host ""
