# ⚠️ URGENT FIX: Memory Crash on Large Projects

## The Problem You're Seeing

```
FATAL ERROR: Reached heap limit 
Allocation failed - JavaScript heap out of memory
```

Your MCP Java Indexer server is crashing because Node.js doesn't have enough memory.

---

## The Fix (2 minutes)

### Step 1: Open Your MCP Configuration

**Windows**: 
```
%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json
```

**Mac/Linux**: 
```
~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/mcp.json
```

### Step 2: Add Memory Flag

Find your `java-indexer` configuration and add `"--max-old-space-size=8192"` as the **first** item in the `args` array:

**BEFORE** (crashes):
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "C:\\path\\to\\server\\dist\\index.js"
      ]
    }
  }
}
```

**AFTER** (fixed):
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "--max-old-space-size=8192",
        "C:\\path\\to\\server\\dist\\index.js"
      ]
    }
  }
}
```

### Step 3: Restart VS Code

Close VS Code **completely** and reopen it.

---

## What This Does

- `--max-old-space-size=8192` sets Node.js heap limit to **8GB**
- Default is only ~2GB (not enough for large Java projects)
- 8GB handles projects with 15,000+ files comfortably

---

## Choose Your Heap Size

| Your Project Size | Heap Size | Use This Number |
|------------------|-----------|-----------------|
| Small (<1,000 files) | 4GB | `4096` |
| Medium (1k-5k files) | 6GB | `6144` |
| Large (5k-15k files) | 8GB | `8192` ✅ Recommended |
| Very Large (15k+ files) | 12GB | `12288` |

---

## Verify It's Working

1. After restarting VS Code, open Output panel (View → Output)
2. Select "GitHub Copilot Chat" from the dropdown
3. Look for: `Initial memory: { heapUsed: '10MB', ... }`
4. Try indexing your project again - it should not crash

---

## Still Having Issues?

See the full guide: [HEAP_MEMORY_FIX.md](HEAP_MEMORY_FIX.md)

Or check troubleshooting: [MCP_TROUBLESHOOTING.md](MCP_TROUBLESHOOTING.md)

---

**Why did this happen?**  
The `--max-old-space-size` flag was in our development scripts but wasn't being applied when VS Code launched the server through `mcp.json`. This is now fixed in our documentation and example configurations.

**Will this be fixed automatically?**  
No - you must manually update your `mcp.json` file. Future releases will have this in the example configuration.
