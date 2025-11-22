# MCP Tools Not Showing - Troubleshooting Guide

## What I Just Fixed

1. ✅ Added `enabledApiProposal: ["lmApi"]` to package.json to enable the proposed LM API
2. ✅ Added try-catch error handling in extension activation
3. ✅ Added console logging to trace activation
4. ✅ Repackaged and reinstalled extension
5. ✅ Opened Spring PetClinic fresh so extension activates

## Steps to Verify It's Working Now

### Step 1: Check Extension Activation (2 minutes)

**In VS Code (Spring PetClinic window):**

1. Press: `Ctrl+Shift+P`
2. Type: `Developer: Toggle Developer Tools`
3. Click: `Console` tab
4. Look for message: **"Java Indexer MCP extension is now active"**

If you see this → Extension is activating ✅

**Alternative:** 
1. `Ctrl+Shift+P` → `Developer: Show Running Extensions`
2. Find `Java Indexer MCP` → Should say "Activated"

### Step 2: Check MCP Provider Registration (2 minutes)

In the same Developer Console, look for:
- `"MCP provider called, returning server definition"` 
- `"MCP server provider registered successfully"`

If you see these → Provider is working ✅

### Step 3: Check if Tools Appear in Copilot

1. Open: Copilot Chat (Ctrl+Shift+Alt+C or click Copilot icon)
2. Look for: A button that says **"Configure Tools"** or similar
3. Click it → Should see **"Java Indexer"** MCP server listed

If you see it → Tools are registered ✅

### Step 4: Try Using a Tool

In Copilot Chat, type:
```
@java-indexer index_project
```

Or:
```
Use java-indexer to index this project
```

Expected: 
- Tool gets called
- Indexing starts
- Progress shown in output

## If It's Still Not Working

### Issue 1: "MCP provider registered successfully" NOT in logs

**Problem:** Extension isn't activating at all

**Solution:**
1. Check: Is `activationEvents` in package.json set to `"onStartupFinished"`? ✅ It is
2. Try: Close and reopen VS Code entirely
3. If still not working → Check VS Code version: `code --version`
   - Must be 1.95.0 or higher (You have 1.106.2 ✅)

### Issue 2: Provider registered but NO tools showing

**Problem:** Extension is activating but MCP server not starting

**Solution:**

**A) Check server path:**
The server path in extension should be:
```
${extensionPath}/server/dist/index.js
```

Verify file exists:
```powershell
Test-Path "$env:USERPROFILE\.vscode\extensions\ubanishathanvenkatesan.java-indexer-mcp-1.0.0\server\dist\index.js"
```

Should return: **True** ✅

**B) Test server manually:**
```powershell
$serverPath = "$env:USERPROFILE\.vscode\extensions\ubanishathanvenkatesan.java-indexer-mcp-1.0.0\server\dist\index.js"
node $serverPath
```

Should show: `MCP Java Indexer server running on stdio`

**C) Check Java installation:**
```powershell
java -version
```

Should show Java version (You have 1.8.0 ✅)

### Issue 3: Tools show but don't work

**Problem:** Tools registered but not executing

**Solution:**

1. Check logs in Developer Console for errors
2. The output should show: indexing progress or results
3. If getting errors → Check:
   - Does test project have Java files? ✅ (47 files)
   - Is Java JAR present? ✅ (6 MB)

## Debugging Checklist

```
Essential files to verify:

☐ Extension file: dist/extension.js (5.27 KB) - contains MCP registration
☐ Server file: server/dist/index.js - runs the MCP server
☐ Server package: server/dist/ (24 files) - compiled TypeScript
☐ Java JAR: java-indexer/target/java-indexer-1.0.0.jar (6.02 MB)
☐ Server node_modules: server/node_modules/ - MCP SDK installed

All verified? ✅ Everything is in place
```

## Next Steps

### If tools ARE showing now:
1. ✅ Go back to testing
2. Test all 7 MCP tools with prompts in `TEST_PROMPTS.md`
3. Document results in `TEST_CHECKLIST.md`

### If tools are STILL NOT showing:

**Most likely cause:** The VS Code version needs the proposed API to be declared in package.json

**What I did:** Added `"enabledApiProposal": ["lmApi"]` - This tells VS Code the extension needs experimental API access

**If still not working:**

1. Try in **VS Code Insiders** (Has more complete MCP support):
   ```powershell
   code-insiders --install-extension java-indexer-mcp-1.0.0.vsix
   ```

2. Or check if `vscode.lm` API is actually available:
   - In extension code, add logging: `console.log('vscode.lm available:', typeof vscode.lm);`
   - Rebuild and check console

3. Or manually register server in `mcp.json`:
   ```json
   {
     "servers": {
       "java-indexer": {
         "type": "stdio",
         "command": "node",
         "args": ["${extensionPath}/server/dist/index.js"]
       }
     }
   }
   ```

## Command to Test Everything

```powershell
# 1. Uninstall old version
code --uninstall-extension ubanishathanvenkatesan.java-indexer-mcp

# 2. Install new version
code --install-extension java-indexer-mcp-1.0.0.vsix

# 3. Open test project
code "D:\workspace\test-java-projects\spring-petclinic"

# 4. Check logs
# - Press: Ctrl+Shift+P → Developer: Toggle Developer Tools
# - Check Console tab for activation messages
# - Open Copilot Chat
# - Look for "Configure Tools" → Should show "Java Indexer"
```

## Summary of What Changed

| Component | Before | After |
|-----------|--------|-------|
| VS Code min version | 1.75.0 | 1.95.0 |
| MCP registration | via package.json `mcpServers` | via API `registerMcpServerDefinitionProvider` |
| API proposal | None | `"enabledApiProposal": ["lmApi"]` |
| Error handling | None | try-catch with logging |
| Logging | Minimal | Detailed activation logs |

---

**TL;DR:** 
1. Reload/reopen VS Code 
2. Open Spring PetClinic fresh
3. Open Copilot Chat
4. Look for "Configure Tools" or try using `@java-indexer` 
5. Check Developer Console for activation logs if not working

Let me know what you see in the console logs!
