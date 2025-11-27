# Java Indexer Usage Analysis & Best Practices

**Status**: v2.3.1 (November 26, 2025)  
**Same-Package Dependency Detection**: ✅ FIXED AND VERIFIED

---

## Executive Summary

The Java Indexer now **correctly detects same-package dependencies** that don't require explicit imports in Java. The false positive issue where classes showed "0 external dependencies" has been resolved.

**Verified Examples**:
- ✅ `CommonUtils` → `XMLUtils`, `AtuQueryGeneratorFrMappingFile` (detected)
- ✅ `AtuFileUtil` → `AtuFileHelper.createTempFile()` (detected)
- ✅ `AtuExportData` → `MiscUtil` (detected)

---

## What Was Fixed (v2.3.1)

### Problem
`explore_class` reported **"0 external dependencies"** for classes that use same-package classes without explicit imports:
```java
package com.atune.util;

// No import needed for same-package class
public class CommonUtils {
    public void process() {
        XMLUtils.parse(...);  // Same package - no import required
        FileHelper.load(...);  // Same package - no import required
    }
}
```

### Root Cause
- `explore_class` only checked call graph (method_call references)
- Missed type_reference, instantiation, and field_access references
- Simple class names (e.g., `XMLUtils`) weren't resolved to FQNs

### Solution
1. **Added `findReferencesFromClass()`** in `MemoryIndex`
   - Returns ALL references from a class (all kinds: method_call, type_reference, instantiation, field_access)
   
2. **Enhanced dependency detection** in `explore_class`
   - Checks ALL reference types, not just call graph
   - Resolves simple names to FQNs using same-package context
   - Filters out false positives (primitives, variables, `this`, `super`)

3. **FQN Resolution** with `resolveToFqn()`
   - For FQNs with dots: validates class exists in index
   - For simple names: looks up in index, prefers same-package match
   - Returns null for non-class names (filters variables like `savedUser`)

---

## Current Capabilities

### ✅ What Java Indexer Does Well

| Feature | Use Case | Example |
|---------|----------|---------|
| **explore_class** | Quick class overview with dependencies | `explore_class(className: "CommonUtils")` |
| **Usage patterns** | Find how many places use a class | "Total usages: 42, Unique dependents: 8" |
| **Inheritance hierarchy** | See parent/child classes | Shows extends, implements, subclasses |
| **Same-package deps** | Detect classes used without imports | `XMLUtils`, `FileHelper`, `MiscUtil` |
| **Call graph** | Method call analysis | Inbound/outbound calls |

### ⚠️ Known Limitations

1. **Stale Index Warnings**
   - During builds (e.g., `mvn clean compile`), you may see "Index may be stale: Too many changes detected"
   - **Mitigation**: Heavy debouncing (30s), bulk change detection (>50 files), cooldown (1 min)
   - **Action**: Warnings are informational; run `index_project` after build completes

2. **External Dependencies**
   - Only shows dependencies on classes **in the indexed project**
   - External JARs (e.g., `java.util.HashMap`) are not tracked
   - **Workaround**: Use grep/PowerShell for full import analysis

3. **Compile-Time Validation**
   - Indexer parses AST but doesn't compile
   - **Final verification**: Always test compile before committing

---

## Recommended Workflow

### Phase 1: Discovery (Use Java Indexer)
```bash
# 1. Index the project
@java-indexer index_project with rootDir: "C:/path/to/project"

# 2. Explore a class to see structure + dependencies
@java-indexer explore_class with className: "CommonUtils"
```

**Output** (now accurate):
```
## 📤 Dependencies (Outbound)
- `com.atune.util.XMLUtils` (method_call, type_reference)
- `com.atune.util.FileHelper` (method_call)
- `com.atune.business.MiscUtil` (method_call)

## 📊 Quick Stats
- Total usages: 15
- Unique dependents: 8
- Unique dependencies: 3
```

### Phase 2: Verification (Use Grep/PowerShell)
```powershell
# Verify imports and actual usage
Get-ChildItem -Recurse -Filter *.java | Select-String "import com.atune.business|services"

# Check if class is actually used
Select-String -Path *.java -Pattern "XMLUtils\."
```

### Phase 3: Validation (Compile)
```powershell
# Final check - compile to ensure no missing dependencies
mvn clean compile
```

---

## When to Use Java Indexer vs Other Tools

| Task | Tool | Why |
|------|------|-----|
| "What does this class depend on?" | `explore_class` | Fast, comprehensive, now accurate for same-package |
| "Who uses this class?" | `explore_class` | Shows dependents + usage count |
| "What's the call chain?" | `call_graph` | Method-level call analysis |
| "Verify all imports" | Grep/PowerShell | Catches external JARs, string patterns |
| "Is it safe to delete?" | Both | Indexer for usage count, grep for verification |
| "Will it compile?" | `mvn compile` | Only true validation |

---

## Best Practices

### ✅ DO Use Java Indexer For:
1. **Initial discovery** - Get a quick overview of class structure
2. **Identifying candidates** - Find low-usage classes for refactoring
3. **Understanding inheritance** - See parent/child relationships
4. **Same-package analysis** - Now works correctly!

### ⚠️ ALWAYS Follow Up With:
1. **Grep verification** - Check actual import statements
2. **Compile testing** - Final safety check (10 min per compile)
3. **Manual review** - Indexer guides, human verifies

### ❌ DON'T Rely Solely On:
1. "0 dependencies" claims (though now fixed for same-package)
2. Index during active builds (wait for debounce to settle)
3. External JAR tracking (not supported)

---

## Stale Index Handling

### During Maven Build
```
⚠️ Index may be stale: Too many changes detected (>100 files)
💡 Run index_project after build completes
```

**What's Happening**:
- File watcher detects bulk changes
- Auto-refresh skipped to prevent CPU/memory spike
- Index is frozen until manual reindex

**Action**:
```bash
# Wait for build to complete, then:
@java-indexer index_project with rootDir: "C:/path/to/project"
```

### Why Not Auto-Reindex?
- Maven touches 100s of files rapidly
- SHA-256 hashing (reads entire files) = CPU/memory spike
- 30s debounce + cooldown prevents system unresponsiveness

---

## Technical Implementation

### How Same-Package Detection Works

**Before (v2.3.0 and earlier)**:
```typescript
// Only checked call graph
const calls = memoryIndex.getOutboundCalls(methodFqn);
// Missed: type_reference, instantiation, field_access
```

**After (v2.3.1)**:
```typescript
// 1. Check call graph
const calls = memoryIndex.getOutboundCalls(methodFqn);

// 2. Check ALL references from the class
const allRefs = memoryIndex.findReferencesFromClass(classFqn);
allRefs.forEach(ref => {
  // Handles: method_call, type_reference, instantiation, field_access
  addDep(resolveToFqn(ref.toFqn), ref.kind);
});
```

### FQN Resolution Algorithm
```typescript
function resolveToFqn(name: string): string | null {
  // 1. Skip primitives, keywords
  if (isPrimitive(name) || isKeyword(name)) return null;
  
  // 2. Already FQN? (has dots)
  if (name.includes('.')) {
    // Validate class exists
    const matches = index.findSymbols(name).filter(isClass);
    return matches.length > 0 ? name : null;
  }
  
  // 3. Simple name - resolve to FQN
  const matches = index.findSymbols(name).filter(isClass);
  
  // Prefer same-package match
  const samePackage = matches.find(s => s.packageName === currentPackage);
  if (samePackage) return samePackage.fqn;
  
  // Fall back to any match
  return matches.length > 0 ? matches[0].fqn : null;
}
```

---

## Publication Status

**Version**: v2.3.1  
**Published**: November 26, 2025  
**Marketplace**: https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp

**Changes in v2.3.1**:
- ✅ Fixed same-package dependency detection
- ✅ Added `findReferencesFromClass()` to MemoryIndex
- ✅ Enhanced `explore_class` with ALL reference types
- ✅ FQN resolution with same-package preference
- ✅ File watcher CPU/memory spike fix (30s debounce, bulk change detection)

---

## Testing & Validation

**Test Project**: `test-same-package/`
- Classes: CommonUtils, XMLUtils, FileHelper, MiscUtil, DataService
- All same-package dependencies detected correctly

**Automated Tests**: 12/13 passing (1 pre-existing failure unrelated to this fix)

**User Validation**: Confirmed on real-world codebase
- CommonUtils → XMLUtils ✅
- AtuFileUtil → AtuFileHelper ✅
- AtuExportData → MiscUtil ✅

---

## Future Improvements

### Short-Term (Consider for v2.4.0)
- [ ] External JAR dependency tracking (requires classpath analysis)
- [ ] Incremental reindex on file save (low-priority files)
- [ ] Cache FQN resolution results

### Long-Term
- [ ] Integration with Maven/Gradle for classpath resolution
- [ ] Real-time compile error detection
- [ ] Dependency graph visualization

---

## Feedback Summary

**From User Session (November 26, 2025)**:

> "Why I wasn't using Java Indexer more often:
> - False positives on dependencies (0 deps claims were wrong) ✅ **NOW FIXED**
> - Stale index warnings during builds ⚠️ **MITIGATED** (debounce + cooldown)
> 
> When it IS useful:
> - explore_class for quick class overview ✅
> - Usage patterns (Total usages/Unique dependents) ✅
> - Finding candidates for refactoring ✅
> 
> Better approach:
> 1. Use Java Indexer to identify candidates
> 2. Verify with grep/PowerShell
> 3. Test compile frequently"

**Status**: Workflow validated and documented in this guide.

---

## Quick Reference

### Discovery Commands
```bash
# Index project
@java-indexer index_project with rootDir: "C:/path/to/project"

# Explore class (now shows same-package deps!)
@java-indexer explore_class with className: "CommonUtils"

# Find usages
@java-indexer find_usages with fqn: "com.atune.util.CommonUtils"

# Call graph
@java-indexer call_graph with fqn: "com.atune.util.CommonUtils.processData(String)"
```

### Verification Commands
```powershell
# Check imports
Get-ChildItem -Recurse -Filter *.java | Select-String "import com.atune"

# Find usage patterns
Select-String -Path *.java -Pattern "CommonUtils\."

# Compile test
mvn clean compile
```

---

**Last Updated**: November 26, 2025  
**Maintained By**: MCP Java Indexer Team
