# Testing Performance Improvements - Quick Guide

## Quick Test Commands

### 1. Clean Previous Index
```powershell
Remove-Item -Recurse -Force <your-project>\.mcp-index -ErrorAction SilentlyContinue
```

### 2. Index and Time
```powershell
Measure-Command {
  @java-indexer index_project with rootDir: "C:/path/to/your/project"
}
```

### 3. Check Results
Look for:
- Total time (in PowerShell output)
- Symbol count
- Inheritance relations count
- No timeout errors

## Expected Performance

### Small Projects (< 100 files)
- **Time**: 1-3 seconds
- **Batch**: 1 batch
- **Logs**: Minimal

### Medium Projects (100-1,000 files)
- **Time**: 10-60 seconds
- **Batches**: 1-5 batches
- **Logs**: Progress every 5 batches

### Large Projects (1,000-10,000 files)
- **Time**: 1-5 minutes
- **Batches**: 5-50 batches
- **Logs**: Progress updates visible

### Very Large Projects (10,000+ files)
- **Time**: 5-15 minutes (depending on complexity)
- **Batches**: 50-80 batches
- **Logs**: Regular progress updates
- **Timeout**: 10 minutes per batch (should not timeout)

## What to Verify

### Functional Correctness
```
✅ Symbols: [count] - Should match number of classes/methods/fields
✅ Inheritance Relations: [count] - Should be reasonable (typically 5-20% of classes)
✅ References: [count] - Should be proportional to symbols
✅ Call Graph Edges: [count] - Should show method call relationships
```

### Performance Metrics
```
✅ Total time: Should be reasonable for project size
✅ No timeout errors
✅ Progress updates visible (every 5 batches)
✅ Memory usage reasonable (check Task Manager)
```

### Index Persistence
```
✅ .mcp-index/ directory created
✅ Contains compressed .json.gz files
✅ metadata.json shows correct stats
✅ File watcher enabled for incremental updates
```

## Troubleshooting

### Timeout Errors
- **Issue**: "Request timeout after 10 minutes"
- **Solution**: Your batches are too slow. Possible causes:
  - Very complex Java files with deep inheritance
  - Slow disk I/O
  - Insufficient RAM causing swapping
  - Try reducing batch size back to 100

### Out of Memory
- **Issue**: Java process crashes with OutOfMemoryError
- **Solution**: Increase Java heap size:
  ```powershell
  # Edit server/src/indexer-client.ts
  # Change spawn line to:
  spawn('java', ['-Xmx4g', '-jar', javaIndexerJar])
  ```

### Slow Performance
- **Issue**: Much slower than expected
- **Possible Causes**:
  - Many source roots (slow type resolution)
  - Complex dependency graph
  - Slow disk (HDD vs SSD)
- **Solutions**:
  - Reduce source roots to only main code directories
  - Skip test directories if not needed
  - Move project to SSD

### Incorrect Inheritance Count
- **Issue**: Inheritance Relations: 0
- **Solution**: This was fixed in v1. Make sure you have latest code.
- **Verify**: Check that classes with `extends` or `implements` are tracked

## Optimization Tips

### For Fastest Indexing
1. Use SSD for project directory
2. Close unnecessary applications (free RAM)
3. Minimize source roots (only include src/main/java)
4. Skip test directories if not needed:
   ```
   @java-indexer index_project with rootDir: "C:/path/to/project", sourceRoots: ["src/main/java"]
   ```

### For Large Projects
1. Run during off-hours (less system load)
2. Ensure sufficient RAM (8GB minimum, 16GB recommended)
3. Monitor with Task Manager to ensure no swapping
4. First run will be slowest (no cache)

### For CI/CD Pipelines
1. Cache `.mcp-index/` directory between runs
2. Only reindex on Java file changes
3. Use incremental indexing (file watcher) in development

## Benchmarking

### Record Your Results
Create a file `benchmark.txt`:
```
Project: [name]
Files: [count]
Symbols: [count]
Time: [seconds]
Date: [date]
Version: v2.0
```

### Compare with Previous Version
- **v1.0** (before optimization): ~11 minutes for 16k files
- **v2.0** (after optimization): ~7-8 minutes for 16k files (expected)

### Share Results
If testing on a large project, consider sharing results:
- Project size (number of .java files)
- Total time
- Any issues encountered
- System specs (CPU, RAM, disk type)

This helps verify the performance improvements!

## Performance Verification Script

Save as `test-my-project.ps1`:
```powershell
$projectPath = "C:\path\to\your\project"
$indexPath = "$projectPath\.mcp-index"

Write-Host "🧪 Testing MCP Java Indexer Performance" -ForegroundColor Cyan
Write-Host ""

# Clean previous index
Write-Host "Cleaning previous index..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $indexPath -ErrorAction SilentlyContinue

# Count Java files
$javaFiles = (Get-ChildItem -Path $projectPath -Filter "*.java" -Recurse).Count
Write-Host "📁 Found $javaFiles Java files" -ForegroundColor Green
Write-Host ""

# Start indexing
Write-Host "⏱️ Starting index..." -ForegroundColor Yellow
$startTime = Get-Date

# (Run @java-indexer manually here in Copilot Chat)

Write-Host ""
Write-Host "After indexing completes, check:" -ForegroundColor Cyan
Write-Host "  ✓ Total time displayed" -ForegroundColor Gray
Write-Host "  ✓ Symbol count matches expectations" -ForegroundColor Gray
Write-Host "  ✓ Inheritance relations > 0" -ForegroundColor Gray
Write-Host "  ✓ No timeout errors" -ForegroundColor Gray
Write-Host "  ✓ Index directory created: $indexPath" -ForegroundColor Gray
```

## Expected Output Format

```
✅ Indexed 16000 Java files in 480.5s

📊 Statistics:
  • Symbols: 128000
  • Indexed Files: 16000
  • All Files (including dependencies): 16000
  • References: 256000
  • Call Graph Edges: 64000
  • Inheritance Relations: 2400

💾 Index persisted to: C:\project\.mcp-index
👁️ File watcher enabled for incremental updates
```

## Success Criteria

✅ **Time**: Under 10 minutes for 16k files (was 11+ minutes)
✅ **No Errors**: No timeout or memory errors
✅ **Correctness**: Inheritance relations > 0 (typically 15% of classes)
✅ **Completeness**: All Java files indexed
✅ **Persistence**: Index saved successfully
✅ **Watching**: File watcher enabled

---

**Ready to test?** Start with a medium-sized project (1k-5k files) first, then scale up to your 16k+ file project!
