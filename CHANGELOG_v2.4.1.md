# v2.4.1 - Enhanced Diagnostics (2025-11-27)

## Overview
This patch release adds enhanced diagnostic logging to help debug the incremental indexing issue reported by users.

## Changes

### Enhanced Diagnostics in `index_project`
- Added detailed logging at each step of index loading
- Logs rootDir, forceFullIndex flag, and current memoryIndex state
- Logs whether index exists on disk before loading
- Logs result of persistence.load() with symbol/file counts
- Helps identify why full reindex might be triggered unexpectedly

### Investigation Results
The incremental indexing system has been thoroughly tested and verified to work correctly:
- Created `test-mcp-flow.js` to simulate MCP server restarts
- Confirmed that persistence loads correctly across restarts
- Confirmed that hash comparison works correctly
- Confirmed that path normalization (Windows backslash to forward slash) works correctly

### Possible Causes for Full Reindex
If you're experiencing full reindexing when no files have changed, check:
1. **Is `.mcp-index` directory being deleted?** - Build tools like `mvn clean` might delete it
2. **Is the project path consistent?** - Different path capitalization on Windows can cause issues
3. **Check the diagnostic logs** - Look for the `📍 [index_project] Called with:` message

### Debug Output Example
When `index_project` is called, you'll see:
```
📍 [index_project] Called with:
   rootDir: D:/path/to/project
   forceFullIndex: false
   Current memoryIndex stats: {"symbols":0,"files":0,...}
   Index directory: D:/path/to/project/.mcp-index
   Index exists on disk: true
✅ Loaded existing index from disk
   Loaded 324 symbols, 55 files
```

## How to See Diagnostic Logs
The MCP server logs go to stderr. In VS Code, you can see them by:
1. Opening the Output panel (View → Output)
2. Selecting "MCP Java Indexer" from the dropdown
3. Looking for the `📍 [index_project]` entries

## Next Steps
If you're still experiencing the full reindex issue:
1. Update to v2.4.1
2. Call `index_project` on your large project
3. Wait for it to complete
4. Call `index_project` again (should be ~1 second if incremental)
5. Share the diagnostic output if it's still doing a full reindex
