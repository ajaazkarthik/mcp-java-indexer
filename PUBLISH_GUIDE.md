# Publishing Java Indexer MCP to VS Code Marketplace

Complete step-by-step guide to publish your extension to the official VS Code Marketplace.

## Prerequisites

- GitHub account and repository created
- VS Code Marketplace account
- `vsce` (VS Code Extension Manager) installed globally
- All marketplace requirements met (icon, README, LICENSE, etc.)

## Step 1: Create GitHub Repository

### 1.1 Initialize Git (if not already done)

```powershell
# Navigate to project root
cd d:\workspace\repo\github-playground\mcp-java-indexer

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Java Indexer MCP Extension"
```

### 1.2 Create Repository on GitHub

1. Go to https://github.com/new
2. Create repository named: `java-indexer-mcp` (or your preferred name)
3. Copy the repository URL (e.g., `https://github.com/yourusername/java-indexer-mcp.git`)

### 1.3 Push to GitHub

```powershell
# Add remote
git remote add origin https://github.com/yourusername/java-indexer-mcp.git

# Push to main
git branch -M main
git push -u origin main

# Verify
git remote -v
```

## Step 2: Register VS Code Marketplace Publisher Account

### 2.1 Create Microsoft Account

1. Go to https://login.live.com/
2. Sign in or create a free Microsoft account

### 2.2 Register Publisher

1. Visit https://marketplace.visualstudio.com/manage/
2. Click "Create publisher" button
3. Fill in:
   - **Publisher ID**: Choose unique lowercase ID (e.g., `yourusername`, `yourcompany`)
   - **Publisher Name**: Display name (e.g., "John Doe", "ACME Corp")
   - **Email**: Your email address
4. Click "Create"

### 2.3 Generate Personal Access Token (PAT)

1. Go to https://dev.azure.com/
2. Click "User settings" (top right icon)
3. Select "Personal access tokens"
4. Click "New Token"
5. Configure:
   - **Name**: `vsce-extension-publish`
   - **Organization**: Select "All accessible organizations"
   - **Expiration**: 1 year (or as needed)
   - **Scopes**: Select "Marketplace" → Check "Publish"
6. Click "Create"
7. **Copy the token immediately** (can't view again)

## Step 3: Prepare Extension Package

### 3.1 Update package.json with Your Details

```json
{
  "publisher": "yourusername",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "homepage": "https://github.com/yourusername/java-indexer-mcp",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/java-indexer-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/java-indexer-mcp/issues"
  }
}
```

### 3.2 Create Extension Icon

Create a **128x128px** PNG icon at `media/icon.png`:

```powershell
# Create media directory if needed
mkdir -Force media

# Download and save a Java-related icon (or create one)
# Recommended: Blue background with white "J" or similar
# File: media/icon.png
```

### 3.3 Verify Required Files

Ensure these files exist in root directory:

```powershell
# Check all required files
$requiredFiles = @(
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "media/icon.png",
    ".vscodeignore",
    ".gitignore",
    "src/extension.ts",
    "server/dist/index.js",
    "java-indexer/target/java-indexer-1.0.0.jar"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✓ $file" -ForegroundColor Green
    } else {
        Write-Host "✗ $file MISSING" -ForegroundColor Red
    }
}
```

### 3.4 Create CHANGELOG.md

```markdown
# Changelog

## [1.0.0] - 2024-01-XX

### Added
- Initial release of Java Indexer MCP
- Support for Java 8+ projects
- 7 MCP tools for code analysis:
  - index_project: Batch index Java files
  - reindex_file: Incremental file reindexing
  - find_symbol: Symbol definition lookup
  - find_usages: Reference tracking
  - call_graph: Bidirectional call analysis
  - goto_definition: Navigate to definitions
  - search_text: Regex-based code search
- Automatic file watcher for incremental updates
- Zero-database architecture with JSON persistence
- Full support for Java inheritance and polymorphism
- Comprehensive documentation and examples
```

## Step 4: Build and Package Extension

### 4.1 Clean Build

```powershell
# Clean previous builds
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue

# Reinstall dependencies
cd server
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
cd ..
```

### 4.2 Compile TypeScript

```powershell
# Compile extension and server
npm run compile

# Verify compilation succeeded
if (Test-Path "dist/extension.js" -and Test-Path "server/dist/index.js") {
    Write-Host "✓ Compilation successful" -ForegroundColor Green
} else {
    Write-Host "✗ Compilation failed" -ForegroundColor Red
    exit 1
}
```

### 4.3 Install vsce (if not already installed)

```powershell
# Install globally
npm install -g @vscode/vsce

# Verify
vsce --version
```

### 4.4 Package Extension as VSIX

```powershell
# Create VSIX package
vsce package

# Verify VSIX created
$vsixFile = Get-ChildItem -Filter "*.vsix" | Select-Object -First 1
if ($vsixFile) {
    Write-Host "✓ VSIX created: $($vsixFile.Name) ($([math]::Round($vsixFile.Length / 1MB, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "✗ VSIX creation failed" -ForegroundColor Red
    exit 1
}
```

Expected VSIX filename: `java-indexer-mcp-1.0.0.vsix`

## Step 5: Test Extension Locally

### 5.1 Install Locally in VS Code

```powershell
# Get the VSIX file
$vsixFile = Get-ChildItem -Filter "*.vsix" | Select-Object -First 1 -ExpandProperty FullName

# Install via VS Code CLI
code --install-extension $vsixFile
```

Or manually:
1. Open VS Code
2. Click Extensions in sidebar (Ctrl+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select the `.vsix` file

### 5.2 Test Functionality

1. Open a Java project in VS Code
2. Press `Ctrl+Shift+P` and search for "Java Indexer"
3. Run: **Java Indexer: Index Project**
4. Verify indexing completes successfully
5. Test other commands (Find Symbol, Find Usages, etc.)

### 5.3 Check MCP Configuration

1. Open VS Code settings: `Ctrl+,`
2. Search for "MCP"
3. Verify Java Indexer MCP server is listed
4. Check MCP extension logs for any errors

## Step 6: Publish to Marketplace

### 6.1 Authenticate with vsce

```powershell
# Authenticate with your PAT
vsce login

# Paste your Personal Access Token when prompted
# Format: yourusername
# Token: (paste the PAT you copied earlier)
```

### 6.2 Publish Extension

```powershell
# Publish with automatic version increment
vsce publish

# Or publish specific version
vsce publish 1.0.0

# Or publish patch update
vsce publish patch
```

Expected output:
```
Publishing yourusername/java-indexer-mcp v1.0.0...
✓ Packaged: java-indexer-mcp-1.0.0.vsix (...)
✓ Uploading...
✓ Published to VS Code Marketplace!
```

### 6.3 Verify Publication

1. Wait 5-10 minutes for marketplace to update
2. Visit: https://marketplace.visualstudio.com/items?itemName=yourusername.java-indexer-mcp
3. Verify:
   - Extension appears in results
   - Icon displays correctly
   - Description and README visible
   - Installation count shows 1

## Step 7: Update Extension

When making updates:

### 7.1 Update Version

```powershell
# Increment version in package.json
# Option 1: Manual update to "1.0.1"
# Option 2: Automatic patch
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

### 7.2 Update CHANGELOG.md

```markdown
## [1.0.1] - 2024-01-XX

### Fixed
- Fix issue with large projects timing out

### Improved
- Better error messages for missing Java installation
```

### 7.3 Commit and Push

```powershell
# Commit changes
git add package.json CHANGELOG.md README.md
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

### 7.4 Republish

```powershell
# Verify compilation
npm run compile

# Create VSIX
vsce package

# Publish
vsce publish
```

## Troubleshooting

### "vsce not found" or "command not recognized"

```powershell
# Install globally
npm install -g @vscode/vsce

# Add npm global bins to PATH if needed
$npmPath = npm config get prefix
$env:Path = "$npmPath\bin;$env:Path"
```

### "Authentication failed" or "Invalid token"

```powershell
# Re-authenticate
vsce logout
vsce login
# Enter publisher ID and paste token again
```

### "Marketplace validation failed"

Common issues:
1. **Missing README.md** - Must exist and be readable
2. **Missing icon** - Must be at `media/icon.png` (128x128 PNG)
3. **Invalid publisher ID** - Check spelling in `package.json`
4. **License not MIT** - Change to MIT or update marketplace settings
5. **Large VSIX** - Check `.vscodeignore` excludes unnecessary files

Solution:
```powershell
# Run with verbose output
vsce package --no-update-package-json 2>&1 | Select-Object -Last 50

# Check VSIX contents
# Windows: use 7-Zip or similar archive manager
# PowerShell: Expand-Archive *.vsix -DestinationPath vsix-contents
```

### "Repository must be public on GitHub"

```powershell
# Check your GitHub repository is public:
# 1. Go to https://github.com/yourusername/java-indexer-mcp
# 2. Click Settings
# 3. Scroll to "Danger Zone"
# 4. Verify repository is public (not private)
```

## Best Practices

### Version Management

```json
{
  "version": "1.0.0"
}
```

Follow Semantic Versioning:
- **Major (1.0.0)**: Breaking changes
- **Minor (1.1.0)**: New features, backward compatible
- **Patch (1.0.1)**: Bug fixes, no new features

### CHANGELOG Format

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Improvements

### Fixed
- Bug fixes

### Deprecated
- Deprecated features

### Removed
- Removed features

### Security
- Security fixes
```

### Documentation

Keep updated:
- `README.md` - User-facing documentation
- `CHANGELOG.md` - Version history
- GitHub Issues - For user feedback
- GitHub Wiki - For advanced topics (optional)

### Testing Before Publishing

```powershell
# Full test cycle
$steps = @(
    "npm run compile",
    "vsce package",
    "code --install-extension (Get-ChildItem *.vsix | Select-Object -First 1 -ExpandProperty FullName)",
    "# Manually test in VS Code",
    "# Then: vsce publish"
)

foreach ($step in $steps) {
    Write-Host "→ $step" -ForegroundColor Cyan
}
```

## Quick Reference: Publish Checklist

- [ ] GitHub repository created and pushed
- [ ] Marketplace publisher account created
- [ ] Personal Access Token generated
- [ ] `publisher` updated in `package.json`
- [ ] Author information updated
- [ ] GitHub repository URL updated in `package.json`
- [ ] Icon created at `media/icon.png` (128x128)
- [ ] `CHANGELOG.md` created
- [ ] Version incremented in `package.json`
- [ ] `npm run compile` succeeds
- [ ] Extension tested locally
- [ ] `vsce package` succeeds
- [ ] `vsce login` authenticated
- [ ] `vsce publish` completes successfully
- [ ] Marketplace page appears after 5-10 minutes
- [ ] Extension installable from marketplace

## Next Steps

1. **Promote Extension**
   - Share on Twitter, Reddit, Dev.to
   - Add to awesome-lists
   - Write blog post about features

2. **Gather Feedback**
   - Monitor GitHub Issues
   - Review marketplace ratings
   - Implement user requests

3. **Maintain Extension**
   - Keep dependencies updated
   - Fix reported bugs promptly
   - Add new features based on feedback
   - Document known limitations

## Support

- **Documentation**: See README.md and inline docs
- **Issues**: Open on GitHub
- **Marketplace**: Visit extension page
- **VS Code Marketplace Help**: https://code.visualstudio.com/docs/editor/extension-marketplace

---

Happy publishing! 🚀

For more information:
- [VS Code Extension Publishing Guide](https://code.visualstudio.com/docs/editor/publish-extension)
- [vsce Documentation](https://github.com/microsoft/vsce)
- [Marketplace Verification Guidelines](https://marketplace.visualstudio.com/manage/publishers/verification)
