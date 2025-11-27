# Package extension v2.3.0 as VSIX
$ErrorActionPreference = "Stop"

$extensionDir = "d:\workspace\repo\github-playground\mcp-java-indexer"
$outputVsix = "$extensionDir\java-indexer-mcp-2.3.0.vsix"

# Create temporary staging directory
$stagingDir = "$extensionDir\vsix-temp"
if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy required files
@(
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "AGENT_INTEGRATION.md"
) | ForEach-Object {
    $src = Join-Path $extensionDir $_
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $stagingDir $_) -Force
    }
}

# Copy dist folder
Copy-Item "$extensionDir\dist" (Join-Path $stagingDir "dist") -Recurse -Force

# Copy server dist
Copy-Item "$extensionDir\server\dist" (Join-Path $stagingDir "server-dist") -Recurse -Force

# Copy java-indexer JAR
$jarFile = Get-ChildItem "$extensionDir\java-indexer\target" -Filter "*.jar" | Select-Object -First 1
if ($jarFile) {
    Copy-Item $jarFile.FullName (Join-Path $stagingDir "java-indexer.jar") -Force
}

# Create VSIX (zip file)
if (Test-Path $outputVsix) {
    Remove-Item $outputVsix -Force
}

# PowerShell 5.1 doesn't have Compress-Archive in all versions, use 7-Zip or built-in compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipFile = [System.IO.Compression.ZipFile]::Open($outputVsix, 'Create')

Get-ChildItem -Path $stagingDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($stagingDir.Length + 1)
    $entry = $zipFile.CreateEntry($relativePath)
    $stream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($_.FullName)
    $fileStream.CopyTo($stream)
    $stream.Close()
    $fileStream.Close()
}

$zipFile.Dispose()

Write-Host "✅ Created VSIX: $outputVsix"
Get-Item $outputVsix | Select-Object Name, Length, LastWriteTime
