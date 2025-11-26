# CHANGELOG v2.3.1 - File Watcher Performance Fix

## Release Date: November 26, 2025

## Summary
Fixed critical CPU/memory spike issue during Maven builds (like `mvn clean build`). The file watcher was triggering excessive reindexing operations that competed with Maven for system resources.

## Problem Description
When running `mvn clean build` or similar build commands:
1. File watcher would trigger for every `.java` file touched during compilation
2. Each trigger would calculate SHA-256 hash by reading the entire file
3. Multiple concurrent reindexing operations consumed excessive CPU and memory
4. System became unresponsive due to resource contention

## Solution Implemented

### New: IndexValidator (`server/src/index-validator.ts`)
- **On-demand validation**: Instead of continuous watching, check index freshness when tools are called
- **Fast mtime check**: Uses file modification time (fs.stat) instead of reading file content
- **Bulk change detection**: Skips auto-refresh if >100 files changed (suggests `index_project` instead)
- **Cooldown mechanism**: 5-second check cooldown, 10-second refresh cooldown
- **Batch processing**: Processes changed files in batches of 50

### Improved: FileSystemWatcher (`server/src/fs-watcher.ts`)
- **Heavy debouncing**: 30-second delay before processing (waits for build to complete)
- **Bulk change protection**: Clears queue and enters 1-minute cooldown if >50 files pending
- **mtime-based detection**: Quick check using modification time before expensive hash calculation
- **awaitWriteFinish**: Waits 2 seconds after last write for file stability

### Updated: Tool Handlers (`server/src/index.ts`)
Query tools now check index freshness on-demand:
- `find_symbol`
- `find_usages`
- `call_graph`
- `goto_definition`
- `search_text`
- `semantic_search`
- `analyze_impact`
- `explain_code`
- `test_coverage`
- `explore_class`
- `batch_query`

### Updated: Memory Index (`server/src/memory-index.ts`)
- Added `mtime` field to `FileInfo` interface for fast staleness detection
- Updated `addFile()` to accept optional mtime parameter

## Configuration
```typescript
// IndexValidator settings
CHECK_COOLDOWN_MS = 5000;        // Don't check more than once per 5s
REFRESH_COOLDOWN_MS = 10000;     // Don't refresh more than once per 10s
MAX_BATCH_SIZE = 50;             // Files per batch during refresh
BULK_CHANGE_THRESHOLD = 100;     // Skip if more than 100 files changed

// FileSystemWatcher settings
DEBOUNCE_MS = 30000;             // 30s debounce for changes
MAX_PENDING_CHANGES = 50;        // Skip if more than 50 pending
BULK_CHANGE_COOLDOWN_MS = 60000; // 1 minute cooldown after bulk detection
```

## User Impact
- **Normal editing**: Minimal change - tools now do quick staleness check on-demand
- **During builds**: System remains responsive - watcher backs off automatically
- **After builds**: First tool call will detect changes and offer to refresh (or suggest `index_project` for many changes)

## Files Changed
- NEW: `server/src/index-validator.ts`
- MODIFIED: `server/src/fs-watcher.ts`
- MODIFIED: `server/src/memory-index.ts`
- MODIFIED: `server/src/index.ts`
- MODIFIED: `server/src/tools/index_project.ts`

## Upgrade Notes
No user action required. The fix is automatic and backward compatible.

## Testing
- TypeScript build: ✅ Successful
- Manual testing: Run `mvn clean build` on a Java project with indexed files

## Related Issues
- Reported: System unresponsive during Maven builds
- Root cause: Aggressive file watcher + expensive hash calculations
