# Package v2.3.1 VSIX
$ErrorActionPreference = "Stop"

Write-Host "Packaging Java Indexer MCP v2.3.1..." -ForegroundColor Cyan

$extensionDir = $PSScriptRoot
$outputVsix = Join-Path $extensionDir "java-indexer-mcp-2.3.1.vsix"
$stagingDir = Join-Path $extensionDir "vsix-temp"

# Clean and create staging directory
if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy required files
Write-Host "Copying files..." -ForegroundColor Yellow
@("package.json", "README.md", "LICENSE", "CHANGELOG.md", "AGENT_INTEGRATION.md") | ForEach-Object {
    $src = Join-Path $extensionDir $_
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $stagingDir $_) -Force
        Write-Host "  ✓ $_" -ForegroundColor Gray
    }
}

# Copy extension dist
Write-Host "Copying extension dist..." -ForegroundColor Yellow
Copy-Item (Join-Path $extensionDir "dist") (Join-Path $stagingDir "dist") -Recurse -Force

# Copy server dist
Write-Host "Copying server dist..." -ForegroundColor Yellow
Copy-Item (Join-Path $extensionDir "server\dist") (Join-Path $stagingDir "server-dist") -Recurse -Force

# Copy java-indexer JAR
Write-Host "Copying Java JAR..." -ForegroundColor Yellow
$jarFile = Get-ChildItem (Join-Path $extensionDir "java-indexer\target") -Filter "java-indexer-*.jar" | Select-Object -First 1
if ($jarFile) {
    Copy-Item $jarFile.FullName (Join-Path $stagingDir "java-indexer.jar") -Force
    Write-Host "  ✓ $($jarFile.Name)" -ForegroundColor Gray
}

# Create extension.vsixmanifest
Write-Host "Creating manifest..." -ForegroundColor Yellow
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="java-indexer-mcp" Version="2.3.1" Publisher="ubanishathanvenkatesan"/>
    <DisplayName>Java Indexer MCP</DisplayName>
    <Description>IntelliJ-style Java code analysis via Model Context Protocol (MCP). Provides 13 tools for AI agents: indexing, code navigation, call graphs, impact analysis, test coverage, and more.</Description>
  </Metadata>
</PackageManifest>
"@
$manifest | Out-File -FilePath (Join-Path $stagingDir "extension.vsixmanifest") -Encoding UTF8

# Create [Content_Types].xml
$contentTypes = @"
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
</Types>
"@
$contentTypes | Out-File -FilePath (Join-Path $stagingDir "[Content_Types].xml") -Encoding UTF8

# Create VSIX (zip file)
Write-Host "Creating VSIX..." -ForegroundColor Yellow
if (Test-Path $outputVsix) {
    Remove-Item $outputVsix -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $outputVsix)

Write-Host ""
Write-Host "SUCCESS! VSIX created: $outputVsix" -ForegroundColor Green
Write-Host "Size: $([math]::Round((Get-Item $outputVsix).Length / 1MB, 2)) MB" -ForegroundColor Gray

# Clean up staging
Remove-Item $stagingDir -Recurse -Force
Write-Host ""
Write-Host "Next step: Upload to VS Code Marketplace" -ForegroundColor Cyan
