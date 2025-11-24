# Troubleshooting Guide

## Issue: Agent Memory Not Working

### Root Cause
The agent memory extension was installed but the memory directory structure didn't exist.

### Solution Implemented
1. ✅ Created `.github/copilot-memory/` directory
2. ✅ Added README.md with project overview
3. ✅ Added status.md to track progress
4. ✅ Fixed build.ps1 PowerShell 5.1 compatibility issues
5. ✅ Built all components successfully using build.bat

### Build Issues Fixed
**Problem**: build.ps1 had PowerShell syntax errors
- Try/catch blocks not compatible with PowerShell 5.1
- String escaping issues in Write-Host commands

**Solution**: 
- Rewrote error handling to use $LASTEXITCODE checks
- Used build.bat as alternative (works perfectly)

## How to Rebuild Extension
```powershell
# Option 1: Use build.bat (recommended)
.\build.bat

# Option 2: Manual build
cd java-indexer
mvn clean package
cd ..\server
npm install
npm run build
cd ..
```

## Verification Steps
```powershell
# Check extension files
Test-Path "dist\extension.js"           # Should be True
Test-Path "server\dist\index.js"        # Should be True
Test-Path "java-indexer\target\java-indexer-1.0.0.jar"  # Should be True

# Reload VS Code
# Press Ctrl+Shift+P -> "Developer: Reload Window"

# Test in Copilot Chat
@java-indexer index_project with rootDir: "C:/path/to/your/java/project"
```

## Extension Architecture
- **Extension**: `dist/extension.js` - VS Code extension entry point
- **MCP Server**: `server/dist/index.js` - Node.js MCP server
- **Java Parser**: `java-indexer/target/java-indexer-1.0.0.jar` - JavaParser-based indexer

## Agent Memory Extension
- **Version**: 0.1.66
- **Location**: `.github/copilot-memory/`
- **Purpose**: Tracks context and progress across sessions
