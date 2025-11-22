# Testing Guide for Critical Fixes

## Quick Test Commands

### 1. Rebuild Everything
```powershell
# Build Java indexer
cd java-indexer
mvn clean package

# Build TypeScript server
cd ../server
npm run build

# Package extension (optional)
cd ..
npm run package
```

### 2. Test File Count Accuracy
Index a small project and verify counts:

**Expected Output**:
```
✅ Indexed 5 Java files in 2s

📊 Statistics:
  • Symbols: 150
  • Indexed Files: 5              ← Should match files you indexed
  • All Files (including dependencies): 20   ← May be higher (includes java.lang.*, etc.)
  • References: 500
```

### 3. Test Large Project (30,000 files)
```powershell
# Index a large codebase
# Should complete without "Invalid string length" error
```

**What to verify**:
- ✅ No "Invalid string length" error
- ✅ Progress updates every batch
- ✅ Index files saved as `.mcp-index/*.json.gz` (compressed chunks)
- ✅ Metadata file exists: `.mcp-index/metadata.json`

### 4. Test Multi-Project Isolation
```powershell
# Index project A
java-indexer index-project --rootDir C:\projects\projectA

# Index project B
java-indexer index-project --rootDir C:\projects\projectB
```

**What to verify**:
- ✅ `C:\projects\projectA\.mcp-index\` exists
- ✅ `C:\projects\projectB\.mcp-index\` exists
- ✅ Each has separate index files
- ✅ Statistics are correct for each project

### 5. Verify Chunked Persistence

Check the index directory structure:
```powershell
ls .mcp-index\
```

**Expected files**:
```
metadata.json           # Quick stats
indexedFiles.json       # List of indexed files
symbols_0.json.gz       # Compressed chunk 0
symbols_1.json.gz       # Compressed chunk 1
symbols_chunks.txt      # Number of chunks
files_0.json.gz
files_chunks.txt
references_0.json.gz
references_chunks.txt
callGraph_0.json.gz
callGraph_chunks.txt
... (etc)
```

### 6. Test Backward Compatibility

If you have an old `index.json` file:
```powershell
# Copy old index.json to .mcp-index/
# Run indexer
# Should load successfully and convert to new format on next save
```

### 7. Performance Benchmarks

For a project with N files:

| Files | Expected Time | Memory Usage |
|-------|--------------|--------------|
| 100 | < 10s | < 100MB |
| 1,000 | < 60s | < 500MB |
| 10,000 | < 10min | < 2GB |
| 30,000 | < 30min | < 4GB |

### 8. Check for Memory Leaks

For large projects (10k+ files):
```powershell
# Monitor memory during indexing
# Should stay relatively stable
# Should not grow unbounded
```

## Common Issues & Solutions

### Issue: "Invalid string length"
**Solution**: ✅ Fixed! Uses chunked persistence now.

### Issue: Wrong file count
**Solution**: ✅ Fixed! Shows "Indexed Files" vs "All Files" separately.

### Issue: Index saved to wrong directory
**Solution**: ✅ Fixed! Each project gets its own `.mcp-index/`.

### Issue: Timeout on large batches
**Solution**: ✅ Fixed! Timeout increased to 5 minutes.

## Development Testing

### Unit Test Structure (Future)
```typescript
describe('MemoryIndex', () => {
  it('tracks indexed files separately', () => {
    // Test indexedFiles set
  });
  
  it('returns correct stats', () => {
    // Verify indexedFiles vs allFiles
  });
});

describe('Persistence', () => {
  it('saves in chunks', () => {
    // Test chunked save
  });
  
  it('loads chunked format', () => {
    // Test chunked load
  });
  
  it('loads old format', () => {
    // Test backward compatibility
  });
});
```

## Monitoring During Indexing

Watch for these console messages:
```
🔍 Indexing 1000 files in batches of 100...
📊 Progress: 100/1000 (10.0%) - 5000 symbols, 15000 refs
📊 Progress: 200/1000 (20.0%) - 10000 symbols, 30000 refs
...
💾 Persisting index to disk...
✅ Index persisted successfully
```

## Validation Checklist

After indexing, verify:
- [ ] Indexed files count matches actual files indexed
- [ ] All files count >= indexed files count
- [ ] Index directory is in correct project location
- [ ] Index files are compressed (`.json.gz`)
- [ ] Metadata file exists and is readable
- [ ] No "Invalid string length" errors
- [ ] File watcher is active
- [ ] Can search symbols successfully
- [ ] Can find usages successfully
- [ ] Call graph works correctly

## Report Issues

If you encounter problems:
1. Check console output for error messages
2. Verify index directory permissions
3. Check available memory
4. Look at `.mcp-index/metadata.json` for stats
5. Report with:
   - Number of files
   - Error message
   - System memory
   - Index directory size
