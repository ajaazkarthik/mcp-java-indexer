# CRITICAL: Heap Memory Configuration Fix

## Problem

The MCP Java Indexer server crashes with "JavaScript heap out of memory" error when indexing large projects (10k+ files):

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## Root Cause

When VS Code launches the MCP server via `mcp.json`, it bypasses the npm scripts in `server/package.json` and directly calls:
```
node dist/index.js
```

This means the `--max-old-space-size=4096` flag configured in `package.json` scripts is **NEVER APPLIED**.

Node.js defaults to ~2GB heap on most systems, which is insufficient for large Java projects.

## Solution

**Add the heap size flag directly to the MCP server configuration.**

### Step 1: Locate Your MCP Configuration

**Windows**: 
```
%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json
```

**Mac/Linux**: 
```
~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/mcp.json
```

### Step 2: Update Configuration

**BEFORE** (causes crashes):
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "C:\\path\\to\\mcp-java-indexer\\server\\dist\\index.js"
      ],
      "env": {}
    }
  }
}
```

**AFTER** (fixes crashes):
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "--max-old-space-size=8192",
        "C:\\path\\to\\mcp-java-indexer\\server\\dist\\index.js"
      ],
      "env": {}
    }
  }
}
```

### Step 3: Restart VS Code

Close and reopen VS Code completely for the changes to take effect.

## Heap Size Recommendations

| Project Size | Heap Size | Flag |
|-------------|-----------|------|
| Small (<1k files) | 4GB | `--max-old-space-size=4096` |
| Medium (1-5k files) | 6GB | `--max-old-space-size=6144` |
| Large (5-15k files) | 8GB | `--max-old-space-size=8192` |
| Very Large (15k+ files) | 12GB | `--max-old-space-size=12288` |

**Note**: The number is in MB (e.g., 8192 = 8GB).

## Verification

After updating the configuration, check the server logs to confirm:

1. **Open Output Panel**: View → Output → Select "GitHub Copilot Chat" from dropdown
2. **Look for**: `Initial memory: { heapUsed: 'XMB', heapTotal: 'YMB', ... }`
3. **Verify**: The server starts successfully without crashes

## Additional Optimizations

### For Very Large Projects (20k+ files):

**Option 1: Increase Batch Size** (faster indexing, more memory):
```typescript
// server/src/tools/index_project.ts
const batchSize = 500; // Increased from 200
```

**Option 2: Reduce Batch Size** (slower indexing, less memory):
```typescript
// server/src/tools/index_project.ts
const batchSize = 100; // Reduced from 200
```

### Memory Monitoring

The server logs memory statistics every 30 minutes:
```
Memory stats: {
  heapUsed: '3072MB',
  heapTotal: '4096MB',
  rss: '5120MB',
  symbols: 150000,
  references: 500000,
  ...
}
```

If `heapUsed` approaches your configured limit, increase the heap size.

## Common Mistakes

### ❌ WRONG: Adding to env section
```json
"env": {
  "NODE_OPTIONS": "--max-old-space-size=8192"
}
```
This **may not work** reliably across all VS Code versions.

### ❌ WRONG: Modifying package.json only
```json
// server/package.json
"scripts": {
  "start": "node --max-old-space-size=8192 dist/index.js"
}
```
This is **ignored** when VS Code launches the server via mcp.json.

### ✅ CORRECT: In args array
```json
"args": [
  "--max-old-space-size=8192",
  "C:\\path\\to\\server\\dist\\index.js"
]
```

## Troubleshooting

### Still Getting OOM Errors?

1. **Verify the configuration**:
   - Check `mcp.json` has the `--max-old-space-size` flag
   - Ensure it's in the `args` array, not `env`
   - Path to `index.js` should come **after** the flag

2. **Restart VS Code completely**:
   - Close all windows
   - Exit from system tray (if applicable)
   - Reopen VS Code

3. **Check actual heap usage**:
   - Look at "Memory stats" logs
   - If using >90% of heap, increase the limit

4. **Reduce memory consumption**:
   - Smaller batch size in `index_project.ts`
   - Index only specific source directories (use `sourceRoots`)
   - Exclude test files: `src/main/java` instead of full project

5. **System limitations**:
   - Ensure your system has enough RAM
   - 8GB heap requires ~10GB free RAM
   - Close other memory-intensive applications

### VS Code Doesn't Recognize the Server?

- Verify the path to `index.js` is absolute and correct
- Check for typos in JSON syntax
- Ensure `server/dist/index.js` exists (run `cd server && npm run build`)

## Prevention Checklist

When setting up the MCP Java Indexer:

- [ ] Add `--max-old-space-size=8192` to `mcp.json` args array
- [ ] Verify path to `index.js` is absolute
- [ ] Restart VS Code completely
- [ ] Test with a small project first
- [ ] Monitor memory logs during indexing
- [ ] Increase heap if needed for your project size

## Impact

### Before Fix:
- ❌ Crashes after 10-30 minutes on large projects
- ❌ "heap out of memory" errors
- ❌ Unreliable indexing

### After Fix:
- ✅ Stable for projects with 16k+ files
- ✅ No memory crashes
- ✅ Reliable long-running operation
- ✅ Predictable memory usage

## Related Issues

- See: `MEMORY_LEAK_FIX_v1.4.2.md` for memory optimization details
- See: `PERFORMANCE_OPTIMIZATION_v2.md` for indexing speed improvements
- See: `MCP_TROUBLESHOOTING.md` for general setup issues

## Quick Reference

**One-line fix**: Add `"--max-old-space-size=8192",` as the first element in the `args` array of your `mcp.json` configuration.

**Example**:
```json
"args": ["--max-old-space-size=8192", "C:\\Users\\You\\...\\index.js"]
```

---

**Last Updated**: November 23, 2025
**Severity**: CRITICAL - Required for production use
**Status**: FIXED in example-config/mcp.json
