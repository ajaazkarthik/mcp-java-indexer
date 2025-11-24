# Bug Tracking Template for Storage vs Memory Comparison

## Bug Report Template

Use this template when you find issues during comparison.

---

### Bug #: _____
**Date Found**: _______________  
**Reporter**: _______________

#### Classification
- [ ] Critical (System crash, data loss)
- [ ] High (Feature broken, incorrect results)
- [ ] Medium (Performance issue, UX problem)
- [ ] Low (Minor inconsistency, cosmetic)

#### Affected Version
- [ ] In-Memory only
- [ ] Storage Backend only
- [ ] Both versions
- [ ] Interaction between versions

#### Category
- [ ] Memory Usage
- [ ] Performance
- [ ] Accuracy (Wrong Results)
- [ ] Reliability (Crashes/Errors)
- [ ] Feature Parity
- [ ] Other: _______________

---

### Description
**What went wrong?**


**Expected Behavior:**


**Actual Behavior:**


---

### Reproduction Steps

1. 
2. 
3. 
4. 

**Reproducibility:**
- [ ] Always (100%)
- [ ] Often (>50%)
- [ ] Sometimes (<50%)
- [ ] Once (Cannot reproduce)

---

### Environment

**System:**
- OS: 
- OS Version: 
- CPU: 
- RAM: 
- Disk Type: 

**Software:**
- Node.js Version: 
- VS Code Version: 
- MCP Version: 

**Project:**
- File Count: 
- Symbol Count: 
- Project Size (MB): 

---

### Evidence

**Memory Stats (Before/After):**
```
In-Memory:
  Before: ____ MB
  After:  ____ MB
  
Storage:
  Before: ____ MB
  After:  ____ MB
```

**Performance Metrics:**
```
In-Memory: ____ ms
Storage:   ____ ms
```

**Logs:**
```
(Paste relevant logs here)
```

**Screenshots:**
(Attach if applicable)

---

### Analysis

**Root Cause (if known):**


**Workaround (if any):**


**Impact Assessment:**
- Users Affected: 
- Severity: 
- Urgency: 

---

### Comparison Data

**Did in-memory version work correctly?**
- [ ] Yes
- [ ] No
- [ ] N/A

**Did storage version work correctly?**
- [ ] Yes
- [ ] No
- [ ] N/A

**Are results identical?**
- [ ] Yes (Results match perfectly)
- [ ] No (Results differ) - Describe: _______________
- [ ] Partial (Some fields differ)

---

### Fix Status

- [ ] Not Started
- [ ] Investigating
- [ ] Fix Identified
- [ ] Fix Implemented
- [ ] Fix Tested
- [ ] Fixed and Verified

**Fix Description:**


**Verification Steps:**
1. 
2. 
3. 

---

## Known Issues Tracker

### Issue #1: [RESOLVED] Persistence.save() Warning
**Status**: ✅ Fixed  
**Severity**: Low  
**Description**: Persistence.save() logs warning when storage backend enabled  
**Fix**: Skip JSON save when _storageBackend flag present  
**Verification**: No warnings in logs with storage enabled

### Issue #2: [EXPECTED] Cold Query Performance
**Status**: ⚠️ Not a Bug (Expected Behavior)  
**Severity**: Low  
**Description**: Storage backend ~100ms slower for cold queries (cache miss)  
**Reason**: Disk I/O required to load from SQLite  
**Mitigation**: LRU cache provides 95%+ hit rate  
**Impact**: Minimal in practice

### Issue #3: [TEMPLATE] Your Issue Here
**Status**: ___  
**Severity**: ___  
**Description**: ___  
**Fix**: ___  
**Verification**: ___

---

## Testing Checklist

Use this to systematically compare both versions:

### Basic Functionality
- [ ] Both servers start successfully
- [ ] Both respond to @mention in Copilot Chat
- [ ] index_project works on both
- [ ] find_symbol works on both
- [ ] find_usages works on both
- [ ] Results are identical

### Memory Comparison
- [ ] Measured baseline memory (both idle)
- [ ] Indexed small project (55 files) on both
- [ ] Measured memory after small project
- [ ] Indexed large project (12k files) on both
- [ ] Measured memory after large project
- [ ] Storage uses <150MB for large project ✅
- [ ] In-memory uses >2GB for large project ✅

### Performance Comparison
- [ ] Timed indexing small project (both)
- [ ] Timed indexing large project (both)
- [ ] Timed find_symbol (cached) on both
- [ ] Timed find_symbol (cold) on both
- [ ] Timed find_usages on both
- [ ] Timed call_graph on both
- [ ] Differences documented

### Accuracy Comparison
- [ ] find_symbol returns identical results
- [ ] find_usages returns identical results
- [ ] call_graph returns identical results
- [ ] Symbol counts match
- [ ] Reference counts match
- [ ] File lists match

### Storage Comparison
- [ ] Measured JSON file size (in-memory)
- [ ] Measured SQLite DB size (storage)
- [ ] Compared compression ratios
- [ ] Verified data persistence (restart test)

### Reliability Testing
- [ ] Both handle invalid input gracefully
- [ ] Both handle missing files
- [ ] Both handle parse errors
- [ ] Both recover from errors
- [ ] No crashes observed
- [ ] No memory leaks detected

### Feature Parity (All 13 Tools)
- [ ] index_project works on both
- [ ] find_symbol works on both
- [ ] find_usages works on both
- [ ] call_graph works on both
- [ ] goto_definition works on both
- [ ] search_text works on both
- [ ] analyze_impact works on both
- [ ] semantic_search works on both
- [ ] explain_code works on both
- [ ] test_coverage works on both
- [ ] refactoring_suggestions works on both
- [ ] code_generation works on both
- [ ] compact_index works on both

### Edge Cases
- [ ] Empty project (0 files)
- [ ] Single file project
- [ ] Very large file (>10k lines)
- [ ] Special characters in filenames
- [ ] Symbolic links
- [ ] Deleted files during indexing
- [ ] Modified files during indexing

---

## Bug Statistics

**Total Bugs Found**: ___  
**Critical**: ___  
**High**: ___  
**Medium**: ___  
**Low**: ___  

**Bugs in In-Memory**: ___  
**Bugs in Storage**: ___  
**Bugs in Both**: ___  

**Fixed**: ___  
**In Progress**: ___  
**Won't Fix**: ___  

---

## Final Verdict

After comprehensive testing:

**Storage Backend Status:**
- [ ] ✅ Production Ready
- [ ] ⚠️ Needs Minor Fixes
- [ ] ❌ Needs Major Fixes
- [ ] ❌ Not Recommended

**Recommendation:**
- [ ] Deploy storage backend
- [ ] Keep in-memory only
- [ ] Provide both options (current approach)

**Confidence Level:**
- [ ] Very High (No issues found)
- [ ] High (Minor issues only)
- [ ] Medium (Some concerns)
- [ ] Low (Significant issues)

---

**Testing Completed By**: _______________  
**Date**: _______________  
**Duration**: _______________  
**Test Scope**: _______________
