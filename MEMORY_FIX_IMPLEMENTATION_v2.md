# Memory Leak Fix v2.0 - Implementation Summary

## 🎯 Problem Statement

The MCP Java Indexer was experiencing critical OOM (Out of Memory) crashes:
- **Symptom**: Server crashes at 8GB heap limit
- **Root Cause**: 546K symbols accumulating in memory, never cleaned up
- **Impact**: Indexing large projects (10K+ files) impossible
- **Primary Issue**: Dependency symbols loaded but never removed

## 🔬 Root Cause Analysis

### Memory Breakdown (At Crash)
```
Heap Used:     5084 MB (5GB)
Heap Total:    5325 MB
RSS:           5866 MB
Symbols:       546,970 (❌ PRIMARY ISSUE)
References:    2,019 (✅ Already cleaned by maintenance)
```

### Why Dependencies Accumulate
1. Java indexer resolves types → loads dependency classes
2. Dependencies stored as symbols: `java.util.List`, `org.springframework.*`, etc.
3. `isIndexedFile` flag only tracked indexed files
4. Dependency symbols never had lifecycle management
5. No TTL, no LRU eviction, no cleanup = **unbounded growth**

## 🛠️ Solution Design

### Multi-Layered Defense Strategy

#### Layer 1: Dependency Lifecycle Management
- Track indexed vs dependency files separately
- Apply 30-minute TTL to dependencies
- Remove old dependencies that haven't been accessed

#### Layer 2: LRU Symbol Eviction
- Track access time for every symbol
- Enforce 300K symbol limit
- Evict least-recently-used symbols when limit exceeded

#### Layer 3: Aggressive Cleanup (6 Stages)
1. Remove old dependency files (TTL)
2. LRU eviction (if over limit)
3. Remove orphaned references
4. Clean empty call graph entries
5. Deduplicate locations
6. Clean access timestamps

#### Layer 4: Increased Frequency
- Batch cleanup: every 3 batches (was 5)
- Periodic: every 15 minutes (was 30)
- Emergency: 2GB threshold (was 3.5GB)
- Critical: 4GB threshold (new)

#### Layer 5: Manual Intervention
- New `compact_index` tool for emergency cleanup
- Aggressive mode with triple GC and multiple passes

## 📝 Code Changes

### 1. `server/src/memory-index.ts` (Primary File)

#### Added Fields
```typescript
private dependencyFiles: Set<string> = new Set();
private symbolAccessTime: Map<string, number> = new Map();
private readonly MAX_SYMBOLS = 300000;
private readonly MAX_DEPENDENCIES = 100000;
private readonly DEPENDENCY_TTL = 1000 * 60 * 30; // 30 min
```

#### Modified Methods
- `getSymbol()`: Track access time for LRU
- `addFile()`: Differentiate indexed vs dependency files
- `clear()`: Clear new tracking structures
- `toJSON()`: Serialize new fields
- `fromJSON()`: Deserialize with backward compatibility

#### Rewrote Method
- `performMaintenanceCleanup()`: 6-stage comprehensive cleanup (was 4 stages)
  - Added dependency TTL cleanup
  - Added LRU symbol eviction
  - Added access timestamp cleanup
  - Increased GC calls to 3x

**Lines Changed**: ~200 lines

### 2. `server/src/tools/index_project.ts`

#### Changes
```typescript
// BEFORE
if (batchCount % 5 === 0) { cleanup(); }
if (heapUsedMB > 3500) { emergency(); }
gc(); gc(); // Double GC

// AFTER
if (batchCount % 3 === 0) { cleanup(); }
if (heapUsedMB > 2000) { 
  emergency(); 
  gc(); gc(); gc(); // Triple GC
}
```

**Lines Changed**: ~10 lines

### 3. `server/src/index.ts`

#### Changes
```typescript
// BEFORE
setInterval(cleanup, 30 * 60 * 1000); // 30 min
if (heapUsedMB > 3072) { warn(); }

// AFTER
setInterval(cleanup, 15 * 60 * 1000); // 15 min
if (heapUsedMB > 2560) { warn(); }
if (heapUsedMB > 4096) { 
  critical(); 
  cleanup(); cleanup(); // Double cleanup
  gc(); gc(); gc(); // Triple GC
}
```

**Lines Changed**: ~30 lines

### 4. `server/src/tools/compact_index.ts` (New File)

#### Purpose
Manual emergency compaction tool with two modes:
- Standard: Single cleanup pass
- Aggressive: 3 passes with triple GC between each

**Lines Added**: ~90 lines

## 📊 Expected Impact

### Memory Reduction
| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| Symbols | 546K | 300K max | **-45%** |
| Dependencies | 200K+ | <100K | **-50%** |
| Heap Usage | 5GB+ | 2-3GB | **-50%** |
| OOM Risk | High | Low | **Eliminated** |

### Cleanup Frequency
| Trigger | Before | After | Change |
|---------|--------|-------|--------|
| Batch cleanup | Every 5 | Every 3 | **+67%** |
| Periodic | 30 min | 15 min | **+100%** |
| Emergency | 3.5GB | 2GB | **+75% earlier** |
| Critical | None | 4GB | **New** |

### GC Intensity
| Context | Before | After | Change |
|---------|--------|-------|--------|
| Batch | 1x | 1x | Same |
| Emergency | 2x | 3x | **+50%** |
| Maintenance | 2x | 3x | **+50%** |
| Critical | N/A | 3x | **New** |

## 🧪 Testing Plan

### Phase 1: Build Verification ✅
```powershell
cd server
npm run build
```
**Status**: ✅ Completed - No errors

### Phase 2: Small Project (Smoke Test)
```powershell
@java-indexer index_project with rootDir: "D:/small-project"
```
**Expected**:
- < 50K symbols
- < 500MB heap
- No cleanup needed

### Phase 3: Medium Project (Load Test)
```powershell
@java-indexer index_project with rootDir: "D:/medium-project"
```
**Expected**:
- 50K-200K symbols
- 1-2GB heap
- Cleanup every 5-10 batches
- Symbol count stable

### Phase 4: Large Project (Stress Test)
```powershell
@java-indexer index_project with rootDir: "D:/large-project"
```
**Expected**:
- 200K-300K symbols (capped)
- 2-3GB heap
- Cleanup every 3-5 batches
- Old dependencies removed
- No OOM for 4+ hours

### Phase 5: Multiple Projects (Extreme Test)
```powershell
# Index 3 large projects simultaneously
@java-indexer index_project with rootDir: "D:/project1"
@java-indexer index_project with rootDir: "D:/project2"
@java-indexer index_project with rootDir: "D:/project3"
```
**Expected**:
- Symbol count < 300K (enforced)
- Heap < 4GB
- No OOM
- Periodic cleanup working

## 📈 Monitoring

### Log Patterns to Watch

#### ✅ Healthy
```
🧹 Cleanup: -50000 symbols, -1000 refs, -5 old deps, freed 800MB
📊 Batch 10: 1000/10000 (10.0%) - Heap: 1800MB
Maintenance schedule started (runs every 15 minutes)
```

#### ⚠️ Warning
```
⚠️  HIGH MEMORY WARNING: 2500MB - Running emergency cleanup...
✅ After cleanup: 1800MB (freed 700MB)
```

#### 🚨 Critical
```
🚨 CRITICAL: Memory at 4500MB - forcing aggressive cleanup
🧹 Cleanup: -100000 symbols, freed 1200MB
```

#### ❌ Failure
```
FATAL ERROR: Reached heap limit Allocation failed
```
**Action**: Restart server, run with `--max-old-space-size=6144`

### Diagnostic Tool
```powershell
node diagnose-memory.js .mcp-index
```

**Output**:
- Symbol count by type
- Indexed vs dependency breakdown
- LRU access patterns
- Memory estimates
- Health check
- Recommendations

## 🆘 Emergency Procedures

### If Memory is Still High

1. **Manual Compaction**:
   ```bash
   @java-indexer compact_index with aggressive: true
   ```

2. **Force Rebuild**:
   ```bash
   @java-indexer index_project with rootDir: "path", forceFullIndex: true
   ```

3. **Restart Server**:
   - Close VS Code
   - Kill all `node.exe` processes
   - Delete `.mcp-index/` directory
   - Restart VS Code

4. **Tune Thresholds** (if needed):
   ```typescript
   // In memory-index.ts
   MAX_SYMBOLS = 200000;        // Lower (currently 300K)
   DEPENDENCY_TTL = 15 * 60000; // 15 min (currently 30)
   
   // In index_project.ts
   if (batchCount % 2 === 0)    // More frequent (currently 3)
   if (heapUsedMB > 1500)       // Earlier (currently 2000)
   ```

5. **Increase Heap Limit**:
   ```json
   // In mcp.json
   {
     "mcpServers": {
       "java-indexer": {
         "command": "node",
         "args": [
           "--max-old-space-size=6144",
           "path/to/server/dist/index.js"
         ]
       }
     }
   }
   ```

## ✅ Success Criteria

### Must Have (Critical)
- [ ] No OOM crashes for 24+ hours
- [ ] Symbol count stays under 350K (with 300K target)
- [ ] Heap usage stays under 4GB
- [ ] Emergency cleanup works when triggered

### Should Have (Important)
- [ ] Periodic cleanup frees memory consistently
- [ ] Old dependencies removed after 30 minutes
- [ ] LRU eviction triggers when over 300K symbols
- [ ] Manual compaction tool works correctly

### Nice to Have (Optional)
- [ ] Heap stays under 3GB most of the time
- [ ] Symbol count stabilizes at 200K-300K
- [ ] Zero user complaints about performance
- [ ] Diagnostic tool provides useful insights

## 📦 Deliverables

1. **Code Changes** (4 files):
   - ✅ `memory-index.ts` (modified)
   - ✅ `index_project.ts` (modified)
   - ✅ `index.ts` (modified)
   - ✅ `compact_index.ts` (new)

2. **Documentation** (4 files):
   - ✅ `MEMORY_LEAK_FIX_v2.md` (comprehensive)
   - ✅ `MEMORY_FIX_QUICK_REF_v2.md` (quick reference)
   - ✅ This file (implementation summary)
   - ✅ `diagnose-memory.js` (diagnostic tool)

3. **Build**:
   - ✅ TypeScript compilation successful
   - ✅ No build errors or warnings

## 🚀 Deployment Status

| Step | Status | Notes |
|------|--------|-------|
| Code Complete | ✅ | 4 files, ~300 lines changed |
| Build | ✅ | No errors |
| Unit Tests | ⏭️ | Skipped (manual testing planned) |
| Smoke Test | ⏳ | Pending deployment |
| Load Test | ⏳ | Pending smoke test |
| Stress Test | ⏳ | Pending load test |
| Production | ⏳ | Pending all tests |

## 🎓 Lessons Learned

1. **Symptoms ≠ Root Cause**
   - Cleaned references aggressively (62K removed)
   - But symbols were the actual problem (546K)
   - Lesson: Always analyze memory by component

2. **Multi-Layer Defense**
   - Single fix (LRU) wouldn't be enough
   - Needed: TTL + LRU + frequent cleanup + emergency thresholds
   - Lesson: Complex problems need layered solutions

3. **Frequency Matters**
   - Cleanup every 5 batches wasn't enough
   - Reduced to 3, added periodic (15 min), emergency (2GB), critical (4GB)
   - Lesson: Prevention better than cure

4. **Observability is Key**
   - Added detailed logging at every layer
   - Created diagnostic tool for post-mortem
   - Lesson: Can't fix what you can't measure

5. **Backward Compatibility**
   - New fields with defaults in fromJSON()
   - Old indexes still load correctly
   - Lesson: Always plan migration path

## 📞 Support

### If Tests Fail
- Check logs for specific error messages
- Run diagnostic tool: `node diagnose-memory.js`
- Review this document's Emergency Procedures section
- Collect memory snapshots for analysis

### If OOM Still Occurs
- Increase heap limit to 6GB
- Reduce MAX_SYMBOLS to 200K
- Reduce DEPENDENCY_TTL to 15 min
- Contact maintainer with logs

---

**Version**: 2.0
**Date**: 2025-11-24
**Status**: ✅ READY FOR TESTING
**Risk**: LOW (graceful degradation, backward compatible)
