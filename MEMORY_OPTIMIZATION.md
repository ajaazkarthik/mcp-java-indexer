# Memory Optimization Guide

## Problem

When indexing large Java projects (10,000+ files), the MCP Java Indexer can consume 2-4GB of memory and potentially crash with Out-Of-Memory (OOM) errors.

## Root Cause

The index stores all symbols, references, and call graph data in memory for fast queries. For 16,000 Java files:
- ~50,000-300,000 symbols (classes, methods, fields)
- ~500,000-2,000,000 references (method calls, field accesses)
- ~100,000-500,000 call graph edges

This can exceed Node.js's default heap limit (~2GB).

## Solutions

### 1. Increase Heap Size (Immediate)

The simplest solution is to allocate more memory to Node.js:

#### For MCP Server
Edit your MCP config (usually `%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json`):

```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "--max-old-space-size=8192",
        "--expose-gc",
        "C:\\path\\to\\mcp-java-indexer\\server\\dist\\index.js"
      ]
    }
  }
}
```

**Flags explained:**
- `--max-old-space-size=8192`: Sets heap limit to 8GB (adjust based on your RAM)
- `--expose-gc`: Enables manual garbage collection (required for cleanup features)

#### For VS Code Extension
The extension automatically uses `--max-old-space-size=4096` (4GB).

### 2. Aggressive Memory Management (v2.2.0+)

The indexer now includes aggressive cleanup strategies:

#### Automatic Cleanup
- **Reduced Thresholds**: Symbol cache reduced from 300k → 50k
- **Dependency Eviction**: Old dependencies removed after 10 minutes (was 30)
- **Emergency Brake**: Triggers cleanup at 1.5GB heap usage (was 2GB)
- **Frequent GC**: Runs garbage collection every 2 batches during indexing

#### Manual Cleanup Tool

Use `@java-indexer compact_index` to free memory:

```
// Standard cleanup (removes old dependencies, evicts LRU symbols)
@java-indexer compact_index

// Aggressive cleanup (multiple passes, extensive GC)
@java-indexer compact_index with aggressive: true

// Emergency cleanup (removes ALL dependency data, keeps only indexed files)
@java-indexer compact_index with emergency: true
```

**When to use:**
- After indexing a large project
- When memory usage is high
- Before starting a new indexing task

### 3. Incremental Indexing

Instead of indexing entire project at once, use incremental indexing:

```
// Initial index (may use more memory)
@java-indexer index_project with rootDir: "C:/project"

// File watcher automatically reindexes changed files with minimal memory

// Force incremental update (only changed files)
@java-indexer index_project with rootDir: "C:/project", forceFullIndex: false
```

Benefits:
- Subsequent updates use ~10-100x less memory
- Existing index loaded from disk
- Only changed files processed

### 4. Scope Reduction

Index only relevant parts of your project:

```typescript
// Index only main source code (skip tests, generated code)
@java-indexer index_project with 
  rootDir: "C:/project",
  sourceRoots: ["src/main/java"]
```

**Best practices:**
- Skip test directories if not needed
- Exclude generated code (`target/`, `build/`, `.apt_generated/`)
- Index microservices individually instead of monorepo

### 5. Persistence-First Architecture (Future)

We've prepared a SQLite-backed storage layer that keeps data on disk instead of memory. This is currently **experimental** and not enabled by default.

**To enable (advanced users only):**
```bash
# Install better-sqlite3
npm install better-sqlite3

# Set environment variable
SET USE_SQLITE_STORAGE=1

# Run indexer (will use SQLite backend)
@java-indexer index_project...
```

⚠️ **Warning**: This changes all APIs to async. Many features will break. Use only for testing.

## Monitoring Memory Usage

### During Indexing
Watch console output for memory stats:
```
📊 Batch 10: 1000/10000 (10.0%) - 50000 symbols - 25 files/s - Heap: 800/2048MB
```

### Check Stats
```
@java-indexer index_project  // Shows stats at end
```

Output includes:
- Symbols count
- References count
- Memory usage

### Cleanup Logs
When cleanup runs, you'll see:
```
🧹 Cleanup: -5000 symbols, -10000 refs, -50 old deps, freed 250.5MB (heap: 750MB)
```

## Troubleshooting

### "JavaScript heap out of memory" Error

**Immediate fix:**
1. Increase heap size to 8GB (see Solution #1)
2. Run `@java-indexer compact_index with emergency: true`
3. Restart VS Code / MCP server

**Long-term fix:**
1. Use incremental indexing (don't force full rebuilds)
2. Reduce source roots to skip unnecessary files
3. Run `compact_index` after each large indexing operation

### Memory Keeps Growing

**Causes:**
- Too many dependency files (JDK classes, libraries)
- Old references not cleaned up
- File watcher triggering too frequently

**Fixes:**
1. Run `compact_index with aggressive: true` regularly
2. Disable file watcher if not needed
3. Index only application code, not dependencies

### Slow Indexing Performance

**If memory cleanup is too aggressive:**
- Increase `MAX_SYMBOLS` in `memory-index.ts` (requires rebuild)
- Reduce cleanup frequency in `index_project.ts`

**Trade-off:** More memory = faster queries but higher RAM usage

## Memory Budget Guidelines

| Project Size | Recommended Heap | Typical Usage | Notes |
|--------------|------------------|---------------|-------|
| < 1,000 files | 2GB (default) | 200-500MB | No tuning needed |
| 1,000-5,000 | 4GB | 500MB-1.5GB | Standard config |
| 5,000-10,000 | 6GB | 1.5GB-3GB | Use aggressive cleanup |
| 10,000-20,000 | 8GB | 3GB-5GB | Incremental indexing required |
| > 20,000 | 12GB+ | 5GB+ | Consider splitting project |

## Performance Tips

1. **First Run**: Will use more memory (builds full index)
2. **Subsequent Runs**: Much faster (incremental updates)
3. **After Cleanup**: Queries may be slower temporarily (need to rebuild caches)
4. **Background Processing**: File watcher has minimal impact (~10MB per update)

## Future Improvements

We're working on:
- ✅ Aggressive memory cleanup (v2.2.0)
- ✅ Emergency cleanup mode (v2.2.0)
- ⏳ SQLite storage backend (experimental)
- ⏳ Lazy loading symbols on demand
- ⏳ Compression for large reference arrays

## Getting Help

If you continue to experience memory issues:

1. Share your stats:
   ```
   @java-indexer index_project  // Copy the statistics output
   ```

2. Check memory after cleanup:
   ```
   @java-indexer compact_index with aggressive: true
   ```

3. Open an issue with:
   - Project size (number of Java files)
   - Memory usage (from stats)
   - Heap size setting
   - Steps that trigger OOM

## Summary

**Quick wins:**
- ✅ Increase heap to 8GB (`--max-old-space-size=8192`)
- ✅ Enable GC (`--expose-gc`)
- ✅ Use `compact_index` after large operations
- ✅ Use incremental indexing (don't force full rebuilds)

**Best practice workflow:**
```
1. Index project: @java-indexer index_project with rootDir: "..."
2. Compact memory: @java-indexer compact_index with aggressive: true
3. Use features normally (find_symbol, call_graph, etc.)
4. File watcher handles updates automatically
5. Periodically run compact_index if memory grows
```
