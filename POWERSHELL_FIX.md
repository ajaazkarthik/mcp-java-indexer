# PowerShell Execution Policy Fix

## Problem Solved ✅

Windows PowerShell execution policy was blocking npm and build scripts with error:
```
npm.ps1 cannot be loaded. The file is not digitally signed.
```

## Solution Implemented

### 1. **Node.js Build Script** (Cross-Platform)
Created `build.js` - a pure Node.js build script that works on all platforms without execution policy issues.

**Usage:**
```bash
node build.js
```

Or through npm (using wrapper):
```bash
npm run compile
```

### 2. **NPM Wrapper Batch File**
Created `npm.bat` to bypass PowerShell execution policy when running npm commands.

**Usage:**
```bash
# Instead of: npm run compile
# Use: npm.bat run compile

npm.bat run compile
npm.bat run package
npm.bat run publish
```

### 3. **Direct Node.js Execution**
You can always run Node.js commands directly:
```bash
node build.js                    # Build everything
node node_modules/.bin/vsce package  # Package extension
```

## Recommended Workflow

### For Development:
```bash
# Option 1: Direct Node.js (always works)
node build.js

# Option 2: Through cmd (bypasses PowerShell)
cmd /c "npm run compile"

# Option 3: Use batch wrapper
npm.bat run compile
```

### For Packaging:
```bash
# Build and package
node build.js
cmd /c "npm run package"

# Or use batch wrapper
npm.bat run package
```

### For Publishing:
```bash
# Build, package, and publish
node build.js
cmd /c "vsce package"
cmd /c "vsce publish"

# Or use batch wrapper
npm.bat run publish
```

## What the Build Script Does

The `build.js` script:
1. ✅ Compiles extension TypeScript → `dist/extension.js`
2. ✅ Installs server dependencies
3. ✅ Compiles server TypeScript → `server/dist/index.js`
4. ✅ Verifies Java JAR exists (6 MB)
5. ✅ Shows build status and next steps

**Cross-platform**: Works on Windows, macOS, and Linux!

## Alternative: Fix PowerShell Execution Policy (Optional)

If you want to fix PowerShell globally (not recommended for security):

```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**But you don't need this!** Our build script works without changing system settings.

## Build Outputs

After running `node build.js`:
```
✓ dist/extension.js                              (Extension entry point)
✓ server/dist/index.js                           (MCP server)
✓ java-indexer/target/java-indexer-1.0.0.jar    (Java indexer - 6 MB)
```

## Package Extension

```bash
# Build first
node build.js

# Package (creates VSIX file)
cmd /c "npm run package"

# Result: java-indexer-mcp-1.0.0.vsix
```

## Common Commands

| Task | Command |
|------|---------|
| Build | `node build.js` |
| Package | `cmd /c "npm run package"` or `npm.bat run package` |
| Publish | `cmd /c "npm run publish"` or `npm.bat run publish` |
| Watch mode | `cmd /c "npm run watch"` |

## Why This Works

- **Node.js** doesn't require execution policy permissions
- **cmd.exe** bypasses PowerShell entirely
- **Batch files** (.bat) aren't affected by PowerShell policy
- **Build script** uses only Node.js APIs and spawns processes safely

## Verification

Test that everything works:
```bash
# Build
node build.js

# Should show:
# ✓ BUILD SUCCESSFUL!
# • Extension: dist/extension.js
# • Server: server/dist/index.js
# • Java JAR: java-indexer/target/java-indexer-1.0.0.jar
```

## Summary

✅ **No PowerShell execution policy changes needed**  
✅ **Cross-platform build script**  
✅ **Works immediately without configuration**  
✅ **Same functionality as before**  

Just use `node build.js` and you're good to go! 🚀
