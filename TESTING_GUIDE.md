# Testing & Performance Guide

## Quick Start: Run All Tests

### Regression Test (Critical - Must Pass)
```powershell
node test-regression-references-zero.js
```
**Purpose**: Catches the critical bug where storage backend returns 0 for references/call graph.  
**Expected**: ✅ ALL REGRESSION TESTS PASSED  
**If fails**: Check `memory-index-storage.ts` getStats() and addReference() methods.

### Performance Profiling
```powershell
node test-performance-profiler.js
```
**Purpose**: Deep analysis of indexing bottlenecks.  
**Output**: Parse time, storage time, maintenance time, throughput, bottleneck %.

### File vs DB Comparison
```powershell
node test-file-vs-db-mode.js
```
**Purpose**: Verify both storage modes work correctly.  
**Expected**: Both modes show references > 0.

---

## Test Suite Overview

| Test File | Purpose | Run Time | Critical |
|-----------|---------|----------|----------|
| `test-regression-references-zero.js` | Catch zero references bug | ~8s | ✅ YES |
| `test-performance-profiler.js` | Profile bottlenecks | ~15s | No |
| `test-file-vs-db-mode.js` | Compare storage modes | ~12s | Yes |
| `test-large-db-mode.js` | Large project validation | 5-8 min | No |
| `quick-test-references.js` | Quick smoke test | ~3s | No |

---

## Test Coverage

### ✅ What's Tested

1. **Data Correctness**
   - References are extracted (not 0)
   - Call graph edges are created (not 0)
   - Inheritance relations are tracked (not 0)
   - FILE MODE and DB MODE match (~10% tolerance)

2. **Performance**
   - Parse time measurement
   - Storage overhead calculation
   - Maintenance overhead tracking
   - Throughput (files/sec, symbols/sec)

3. **Stability**
   - Memory usage tracking
   - Large project handling (12k files)
   - Error handling

### ⚠️ What's NOT Tested

1. **Accuracy**
   - Whether the correct references are extracted
   - Call graph correctness (just count > 0)
   - Type resolution accuracy

2. **Edge Cases**
   - Empty files
   - Parse errors
   - Corrupted index files

3. **Concurrency**
   - Multiple indexing operations
   - Race conditions in storage

---

## Running Tests During Development

### After Code Changes
```powershell
# 1. Rebuild
cd server; npm run build; cd ..

# 2. Run regression test (MUST PASS)
node test-regression-references-zero.js

# 3. If adding performance changes, profile
node test-performance-profiler.js
```

### Before Git Commit
```powershell
# Run all critical tests
node test-regression-references-zero.js
node test-file-vs-db-mode.js
```

### Before Release
```powershell
# Full test suite
node test-regression-references-zero.js
node test-file-vs-db-mode.js
node test-large-db-mode.js
```

---

## Understanding Test Results

### Regression Test Output
```
✅ Testing: Example Project (Small)
📁 Testing FILE MODE (In-Memory + JSON)
   Time: 3.85s
   Symbols: 324
   References: 290      ← Must be > 0 ✅
   Call Graph: 70       ← Must be > 0 ✅
   Inheritance: 33      ← Must be > 0 ✅
   ✅ References OK
   ✅ Call Graph OK

💾 Testing DB MODE (SQLite Storage)
   Time: 4.39s
   Symbols: 324
   References: 290      ← Must be > 0 ✅
   Call Graph: 79       ← Must be > 0 ✅
   Inheritance: 42      ← Must be > 0 ✅
   ✅ References OK
   ✅ Call Graph OK

⏱️ Performance Analysis
   ✅ Performance acceptable

📊 Data Consistency
   References diff: 0 (0.0%)    ← Should be < 10%
   ✅ Data consistent between modes
```

### Performance Profiler Output
```
🎯 Bottleneck Analysis:
   Java Parser: 99.8%    ← Normal (parsing is expensive)
   Storage:     0.1%     ← Normal (should be < 5%)
   Maintenance: 0.0%     ← Normal (should be < 10%)

📈 Throughput:
   29.7 files/sec        ← Baseline: ~30 files/sec for small projects
   323 symbols/sec
```

**Normal values**:
- Java Parser: 95-100% (expected bottleneck)
- Storage: 0-5% (FILE mode), 0-10% (DB mode)
- Maintenance: 0-5%
- Throughput: 30-120 files/sec (varies by project complexity)

**Abnormal values** (investigate):
- Storage > 20%: Write queue issues, disk bottleneck
- Maintenance > 15%: Cleanup frequency too high
- Throughput < 20 files/sec: Java parser issues

---

## Current Performance Baselines

### Small Project (55 files, example-java-project)
- **FILE MODE**: 3.85s (324 symbols, 290 refs)
- **DB MODE**: 4.39s (324 symbols, 290 refs)
- **Overhead**: ~14% (acceptable)

### Large Project (12,000 files)
- **DB MODE**: ~350s (optimized from 484s)
- **Throughput**: 34 files/sec
- **Memory**: 60-100MB heap

---

## Troubleshooting

### Test Fails: "DB MODE has 0 references"
**Root cause**: getStats() returning cache.size instead of actual counts  
**Fix**: Check `memory-index-storage.ts`:
```typescript
// WRONG:
return { references: this.referenceCache.size };

// CORRECT:
return { references: this.referenceCount };
```

### Test Fails: "Performance overhead too high"
**Root cause**: Storage writes or maintenance taking too long  
**Check**:
1. Bottleneck analysis output
2. Write queue batch size
3. Maintenance frequency

### Test Hangs
**Root cause**: Java process not responding or deadlock  
**Fix**:
1. Kill Java process: `Get-Process java | Stop-Process -Force`
2. Check `.mcp-index` directory for locks
3. Restart test

---

## Adding New Tests

### Template for New Test
```javascript
#!/usr/bin/env node
const path = require('path');

async function testMyFeature() {
  console.log('Testing: My Feature');
  
  const { MemoryIndex } = require('./server/dist/memory-index.js');
  const memoryIndex = new MemoryIndex();
  
  // ... test logic ...
  
  const stats = memoryIndex.getStats();
  
  // Critical assertions
  if (stats.references === 0) {
    console.error('❌ FAIL: Zero references');
    process.exit(1);
  }
  
  console.log('✅ PASS');
  process.exit(0);
}

testMyFeature().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
```

### Add to CI/CD
```yaml
# .github/workflows/test.yml
- name: Run regression tests
  run: node test-regression-references-zero.js
```

---

## Performance Tuning Guide

### Current Settings (v1.5.5)
```typescript
// server/src/tools/index_project.ts
const batchSize = 300;           // Files per batch
maintenance: every 5 batches;    // Cleanup frequency
memoryThreshold: 1500MB;         // Emergency brake
```

### Tuning for Speed (risky)
```typescript
const batchSize = 500;           // +30% speed, +50% memory
maintenance: every 10 batches;   // +5% speed
```

### Tuning for Stability (slower)
```typescript
const batchSize = 100;           // -20% speed, safer
maintenance: every 2 batches;    // More GC
```

### Trade-off Matrix
| Setting | Speed | Memory | Stability |
|---------|-------|--------|-----------|
| Batch size 100 | Slow | Low | High |
| Batch size 300 | Medium | Medium | Medium |
| Batch size 500 | Fast | High | Low |

---

## Questions?

- **Why is DB mode ~14% slower?** Flush operation at the end (~1.2s). Trade-off for persistence.
- **Why 99% Java parser time?** Parsing AST is expensive. Can't be optimized without accuracy loss.
- **Can we run tests in parallel?** No, they share `.mcp-index` directory.
- **Why no accuracy tests?** Complex to implement, requires ground truth data.

---

## Summary

✅ **Must-run test**: `test-regression-references-zero.js`  
✅ **Performance tracking**: `test-performance-profiler.js`  
✅ **Current baseline**: 55 files in 4s, 12k files in 350s  
✅ **Bottleneck**: Java parser (99%), not fixable without architecture change
