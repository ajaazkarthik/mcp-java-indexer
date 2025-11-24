# Changelog v2.2.0 - Performance Timing Feature

**Release Date**: November 24, 2025

## 🎯 New Feature: Execution Time Measurement

All MCP tools now include execution time in their output, providing visibility into performance and helping identify slow operations.

### What's New

- **⏱️ Timing Information**: Every tool now reports how long it took to execute
- **Smart Formatting**: 
  - Fast operations (< 1s): Shown in milliseconds (e.g., `42ms`)
  - Longer operations (≥ 1s): Shown in seconds (e.g., `2.35s`)
- **Non-Intrusive**: Timing appears at the end of output without disrupting existing functionality

### Affected Tools

All 14 MCP tools now include timing:
1. `index_project` - Shows indexing duration
2. `reindex_file` - Shows reindexing time
3. `find_symbol` - Shows symbol search time
4. `find_usages` - Shows usage search time
5. `call_graph` - Shows call graph analysis time
6. `goto_definition` - Shows definition lookup time
7. `search_text` - Shows text search time
8. `analyze_impact` - Shows impact analysis time
9. `semantic_search` - Shows semantic search time
10. `explain_code` - Shows code explanation time
11. `test_coverage` - Shows coverage analysis time
12. `refactoring_suggestions` - Shows refactoring analysis time
13. `code_generation` - Shows code generation time
14. `compact_index` - Shows index compaction time

### Example Output

Before:
```
Found 1 symbol matching "UserService":

**class**: `com.example.UserService`
📁 File: src/main/java/com/example/UserService.java:5:1
📦 Package: com.example
```

After:
```
Found 1 symbol matching "UserService":

**class**: `com.example.UserService`
📁 File: src/main/java/com/example/UserService.java:5:1
📦 Package: com.example

⏱️ **Time taken**: 3ms
```

### Implementation Details

- **Utility Module**: New `timing.ts` utility provides `withTiming()` wrapper
- **Zero Overhead**: Timing measurement uses `Date.now()` with minimal performance impact
- **Backward Compatible**: All existing functionality preserved, timing is purely additive
- **Comprehensive Testing**: 17 new tests validate timing across all tools

### Testing

New test suite: `test-timing-feature.js`
- ✅ All 17 tests passing
- ✅ Validates timing presence on all tools
- ✅ Confirms proper formatting (ms vs s)
- ✅ Ensures backward compatibility
- ✅ Tests error responses include timing

Existing test suites still passing:
- ✅ OOM Fix Tests: 10/10 passed
- ✅ Feature Preservation Tests: 26/26 passed

### Benefits

1. **Performance Monitoring**: Quickly identify slow operations
2. **Debugging**: Diagnose performance issues in indexing or searches
3. **User Feedback**: Clear indication of operation completion time
4. **Profiling**: Data for optimizing tool performance

### Technical Changes

**New Files**:
- `server/src/utils/timing.ts` - Timing utility module
- `test-timing-feature.js` - Comprehensive timing test suite

**Modified Files**:
- `server/src/index.ts` - Wrapped all tool handlers with timing
- All tool outputs now include timing footer

### Upgrade Notes

No configuration changes needed. The feature is automatically enabled in v2.2.0.

### Version Compatibility

- Minimum VS Code: `^1.95.0`
- Node.js: `>=18.0.0`
- Java: `11+` (unchanged)

---

## Previous Versions

See [CHANGELOG.md](./CHANGELOG.md) for previous release notes.
