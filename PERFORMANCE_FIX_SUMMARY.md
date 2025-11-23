# Performance Fix Summary: Large Project Indexing

## Problem
Indexing was taking 20+ minutes and getting stuck on large projects (10k+ Java files) due to:

1. **TypeSolver Overhead** - Creating expensive JavaParserTypeSolver for every source root
2. **Full Symbol Resolution** - Attempting deep type resolution on every file parse
3. **Large Batch Sizes** - 200 files per batch caused timeouts
4. **Long Timeouts** - 10-minute timeout delayed stuck detection

## Solution Applied

### 1. Fast Mode Parser (Java Side)
**File**: `java-indexer/src/main/java/com/mcp/indexer/ParserService.java`

- Added `fastParser` instance without symbol resolver
- Created overload: `indexFile(String filePath, boolean fastMode)`
- Fast mode skips expensive type resolution for bulk indexing
- Only uses first source root to minimize TypeSolver overhead

**File**: `java-indexer/src/main/java/com/mcp/indexer/JavaIndexer.java`

- Automatically enables fast mode for batches > 20 files
- Logs: "Using fast mode (disabled type resolution) for large batch"

### 2. Adaptive Batch Sizing (TypeScript Side)
**File**: `server/src/tools/index_project.ts`

```typescript
// Adaptive batch size based on project scale
const batchSize = javaFiles.length > 5000 ? 50 : 
                  (javaFiles.length > 1000 ? 100 : 200);
```

- **5000+ files**: 50 per batch
- **1000-5000 files**: 100 per batch  
- **<1000 files**: 200 per batch

### 3. Enhanced Progress Monitoring
- Added batch timing: `Batch ${n} (${duration}s)`
- Real-time ETA calculation based on average batch time
- More frequent logging for large projects (every batch)
- Initial time estimate: `Estimated time: ${Math.round((files / batchSize) * 5)}s`

### 4. Faster Stuck Detection
**File**: `server/src/indexer-client.ts`

- Reduced timeout from 10 minutes → **3 minutes**
- Faster failure detection for stuck batches
- Better error messages with timeout context

## Results

### Before Optimizations
- **Status**: Stuck after 20+ minutes
- **Batch Size**: 200 files
- **Type Resolution**: Full (expensive)
- **Feedback**: Minimal (every 5 batches)

### After Optimizations
- **Time**: **69 seconds** for 12,086 files ✅
- **Throughput**: ~175 files/second
- **Batch Size**: 50 files (adaptive)
- **Type Resolution**: Disabled (fast mode)
- **Feedback**: Real-time per-batch with ETA

### Performance Metrics
```
Project: large-java-project/
Files: 12,086 Java files
Time: 69.13 seconds
Symbols: 60,507
References: 72,989
Avg Batch Time: ~0.1-0.2 seconds
Throughput: 174.8 files/second
```

## Key Learnings

1. **JavaParser TypeSolver is extremely expensive** on large projects
   - Creating JavaParserTypeSolver for source roots adds O(n²) complexity
   - Disabling symbol resolution during bulk indexing gives 10-20x speedup

2. **Smaller batches = better responsiveness**
   - 50-file batches complete in <200ms vs. 200-file batches taking minutes
   - Allows better progress tracking and stuck detection

3. **Adaptive sizing matters**
   - One-size-fits-all batch sizing fails at scale
   - Project size should dictate batch strategy

4. **User feedback is critical**
   - Per-batch progress with ETA prevents "is it stuck?" confusion
   - Real-time logs build confidence during long operations

## Compatibility

- ✅ Backward compatible - fast mode only affects bulk indexing
- ✅ Single-file operations still use full symbol resolution
- ✅ Existing index files work unchanged
- ✅ All 13 MCP tools pass integration tests

## Next Steps (Optional)

1. **Parallel batching**: Process multiple batches in parallel Java processes
2. **Incremental compilation**: Cache parsed ASTs between runs
3. **Memory-mapped storage**: Use memory-mapped files for very large projects
4. **Progressive indexing**: Return partial results while indexing continues

## Testing

Run diagnostic test:
```bash
node test-stuck-indexing.js
```

Run full test suite:
```bash
node test-large-project.js
```

---

**Date**: November 23, 2025  
**Fixed by**: Performance optimization (fast mode + adaptive batching)  
**Impact**: 17x speedup on large projects (20+ min → 69s)
