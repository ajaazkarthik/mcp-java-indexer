# Testing Instructions - OOM Fix Verification

## ✅ Build Status
**All OOM fixes have been compiled successfully!**

## 🔧 Changes Verified

### 1. Extension (dist/extension.js)
- ✅ Heap limit increased to 8GB: `--max-old-space-size=8192`
- ✅ Manual GC enabled: `--expose-gc`

### 2. Server Index Tool (server/dist/tools/index_project.js)
- ✅ Batch size reduced to 100 files
- ✅ Aggressive memory cleanup after every batch
- ✅ Buffer clearing: `indexerClient.clearBuffer()`
- ✅ Maintenance cleanup every 5 batches
- ✅ Forced GC after every batch
- ✅ Emergency brake at 3.5GB heap usage
- ✅ Memory monitoring in progress logs

### 3. Memory Index (server/dist/memory-index.js)
- ✅ Reference deduplication implemented
- ✅ Enhanced maintenance cleanup with:
  - Orphaned reference removal
  - Call graph edge deduplication
  - Double GC for aggressive cleanup
  - Memory usage tracking

### 4. Indexer Client (server/dist/indexer-client.js)
- ✅ Buffer clearing method added

## 🧪 Testing Steps

### Step 1: Reload VS Code
```
Press: Ctrl+Shift+P → "Developer: Reload Window"
```
This will activate the updated extension with new memory settings.

### Step 2: Verify Extension Loaded
Open VS Code Output panel:
```
View → Output → Select "Java Indexer" from dropdown
```
Look for: `Java Indexer MCP extension is now active`

### Step 3: Test on Previous Failing Project
In Copilot Chat, run:
```
@java-indexer index_project with rootDir: "C:/path/to/your/large/project"
```

### Step 4: Monitor Progress
Watch for these log patterns in Output:
```
🔍 Indexing 5000 files in batches of 100...
⚡ Conservative batch size to prevent OOM
📊 Batch 1: 100/5000 (2.0%) - 1234 symbols - 50 files/s - Heap: 250/500MB
📊 Batch 2: 200/5000 (4.0%) - 2456 symbols - 48 files/s - Heap: 380/650MB
...
🧹 Cleanup: removed 123 orphaned refs, freed 45.2MB
...
📊 Batch 50: 5000/5000 (100.0%) - 125000 symbols - 52 files/s - Heap: 2800/3200MB
✅ Full index: 5000 files (180.5s)
```

## 🚨 What to Look For

### Success Indicators:
- ✅ Heap usage stays under 3.5GB
- ✅ Progress logs show cleanup every 5 batches
- ✅ Indexing completes without crash
- ✅ Memory freed message appears periodically

### Failure Indicators (if still happens):
- ❌ "FATAL ERROR: Reached heap limit"
- ❌ "Process exited with code 134"
- ❌ Heap usage exceeds 7GB
- ❌ No cleanup messages appear

## 📊 Expected Performance

| Project Size | Time | Peak Heap | Batches |
|--------------|------|-----------|---------|
| 1,000 files | 1-2 min | 500MB | 10 |
| 2,000 files | 3-5 min | 1.5GB | 20 |
| 5,000 files | 8-12 min | 2.5GB | 50 |
| 10,000 files | 15-25 min | 3.5GB | 100 |

## 🔍 Troubleshooting

### If OOM Still Occurs:

**Option 1: Increase Heap Limit Further**
Edit `dist/extension.js` line 53:
```javascript
'--max-old-space-size=12288',  // 12GB instead of 8GB
```

**Option 2: Reduce Batch Size Further**
Edit `server/dist/tools/index_project.js` line 126:
```javascript
const batchSize = 50;  // Was 100
```

**Option 3: Force Full Rebuild**
```
@java-indexer index_project with rootDir: "C:/path" forceFullIndex: true
```

## 📝 Reporting Issues

If OOM still occurs, please provide:
1. Project size (number of .java files)
2. Last log message before crash
3. Heap usage from last progress log
4. Operating system and available RAM

## 🎯 Next Steps After Verification

Once testing confirms the fix works:
1. ✅ Update version to 1.5.4
2. ✅ Update CHANGELOG.md
3. ✅ Create release notes
4. ✅ Publish to marketplace

---

**Fix Date**: November 24, 2025  
**Fixed By**: Critical OOM Analysis & Multi-Layer Memory Management
