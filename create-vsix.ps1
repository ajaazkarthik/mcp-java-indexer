$ErrorActionPreference = "Stop"

Write-Host "Creating VSIX for v2.3.1..." -ForegroundColor Cyan

$stagingDir = "vsix-temp"
$outputVsix = "java-indexer-mcp-2.3.1.vsix"

# Clean staging
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy files
Write-Host "Copying files..."
Copy-Item "package.json" "$stagingDir\" -Force
Copy-Item "README.md" "$stagingDir\" -Force
Copy-Item "LICENSE" "$stagingDir\" -Force
Copy-Item "CHANGELOG.md" "$stagingDir\" -Force
Copy-Item "AGENT_INTEGRATION.md" "$stagingDir\" -Force
Copy-Item "dist\" "$stagingDir\dist\" -Recurse -Force
Copy-Item "server\dist\" "$stagingDir\server-dist\" -Recurse -Force
Copy-Item "java-indexer\target\java-indexer-1.0.0.jar" "$stagingDir\java-indexer.jar" -Force

# Create manifest
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="java-indexer-mcp" Version="2.3.1" Publisher="ubanishathanvenkatesan"/>
    <DisplayName>Java Indexer MCP</DisplayName>
    <Description>Java code analysis via MCP for AI agents</Description>
  </Metadata>
</PackageManifest>
"@
$manifest | Out-File "$stagingDir\extension.vsixmanifest" -Encoding UTF8

# Create content types
$ct = @"
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
</Types>
"@
$ctPath = Join-Path $stagingDir "[Content_Types].xml"
$ct | Out-File -LiteralPath $ctPath -Encoding UTF8

# Create VSIX
Write-Host "Creating VSIX..."
if (Test-Path $outputVsix) { Remove-Item $outputVsix -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $outputVsix)

Write-Host "SUCCESS! Created $outputVsix" -ForegroundColor Green
$size = [math]::Round((Get-Item $outputVsix).Length / 1MB, 2)
Write-Host "Size: $size MB" -ForegroundColor Gray

# Cleanup
Remove-Item $stagingDir -Recurse -Force
