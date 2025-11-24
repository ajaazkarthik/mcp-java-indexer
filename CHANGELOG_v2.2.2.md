# Changelog v2.2.2 - Critical Performance Fix

## Release Date: November 25, 2025

## 🚨 Critical Fix: 20x Performance Improvement

### Problem
After enabling SQLite storage backend in v2.2.1, indexing 12,000 files took **30+ minutes** instead of the expected ~60 seconds.

### Root Cause
The storage write queue was processing operations too slowly:
- Processing 10 operations at a time with 10ms delays between batches
- Each reference created 3 async operations (saveReference + 2x saveCallEdge)
- 60,000 refs × 3 ops ÷ 10 per batch × 10ms = **~18 minutes** of pure waiting time

### Solution
1. **Batch references before writing** - Collect 500 refs before flushing to storage
2. **Bulk INSERT** - Use `INSERT OR IGNORE INTO refs` instead of individual inserts
3. **Remove fixed delays** - Use `setImmediate()` instead of 10ms setTimeout
4. **Larger batches** - Process 50 operations per transaction (was 10)

### Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **12k files** | 30+ min | **85 sec** | **20x faster** |
| **Throughput** | ~7 files/s | **142 files/s** | **20x faster** |
| **DB overhead** | 266% | **27%** | **10x better** |
| **Memory** | Varies | **~200MB** | Stable |

## Additional Fixes

- Fixed `toJSON()` to return compatible structure for Persistence class
- Fixed `saveReferences()` table name (`references` → `refs`)
- Fixed batch size optimization (100 → 300)
- Reduced maintenance cleanup frequency (every 2 → every 5 batches)

## New Test Suite

Added comprehensive regression tests to prevent future issues:

- `test-regression-references-zero.js` - Catches zero-references bug
- `test-isolate-bottleneck.js` - Identifies performance bottlenecks
- `test-performance-profiler.js` - Deep analysis of indexing time
- `test-pure-java-performance.js` - Tests Java parser in isolation

## How to Test

```bash
# Quick regression test (~8 seconds)
node test-regression-references-zero.js

# Performance analysis
node test-isolate-bottleneck.js
```

## Upgrade Notes

- No configuration changes required
- Existing indexes will continue to work
- Full reindex recommended for best performance

## Files Changed

- `server/src/memory-index-storage.ts` - Batched writes, bulk inserts
- `server/src/storage/sqlite-storage.ts` - Fixed table name
- `server/src/tools/index_project.ts` - Optimized batch size
- Added 10+ test files for regression prevention
