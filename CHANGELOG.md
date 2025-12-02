# Changelog

All notable changes to the Java Indexer MCP extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.8.6] - 2025-12-03

### 🔧 Bugfixes

#### 🔴 Fixed: Stale Index Warning After Git Operations

**Problem**: Users saw constant "Index may be stale" warnings after git operations (checkout, pull, merge) even though the file content hadn't changed. The warning would report thousands of "changed" files.

**Root Cause**: Logic mismatch between hash-based and mtime-based staleness detection:
- `index_project` uses **hash comparison** to detect actual content changes
- `index-validator` uses **mtime comparison** for fast staleness checks
- Git operations touch file mtimes without changing content
- Files that passed the hash check didn't get their mtime updated, causing perpetual false positives

**Solution**:
1. Added `updateFileMtime(filePath, mtime)` method to `MemoryIndex` class
2. Modified `index_project` to sync mtime for files that pass hash check:
   - When a file doesn't need reindexing (hash matches), update its stored mtime to match disk
   - This prevents the validator from flagging it as "changed" later
3. Logs mtime sync count: "🕐 Synced mtime for X unchanged files"

**Files Modified**:
- `server/src/memory-index.ts` - Added `updateFileMtime()` method
- `server/src/tools/index_project.ts` - Added mtime sync logic during incremental check

### 🧪 Testing Improvements

#### Added: Comprehensive Mtime/Hash Synchronization Tests

New test file `tests/test-mtime-hash-sync.js` with 23 test cases covering:
- `updateFileMtime()` API behavior (8 tests)
- Hash vs mtime detection logic (5 tests)
- Index validator staleness scenarios (2 tests)
- Bulk git operation simulation (3 tests)
- Edge cases: undefined mtime, same mtime, path normalization (5 tests)

#### Why This Bug Was Missed

The existing test suite had no coverage for:
- `needsReindex()` method behavior
- Mtime handling in file indexing
- `IndexValidator` staleness detection
- The interaction between hash-based and mtime-based change detection

This has now been addressed with comprehensive tests.

---

## [2.8.4] - 2025-12-01

### 🔧 Bugfixes & Performance

This release addresses issues reported in the v7 comprehensive analysis feedback.

#### 🔴 Fixed: Stale Index False Positive Warning

**Problem**: Immediately after a successful `index_project`, the next query tool would show "Index may be stale: Too many changes detected (2021)" even though the index was just built.

**Solution**:
1. Added grace period check in `refreshIndex()` as defense-in-depth
2. Updated message handling to silently skip grace period and cooldown cases
3. No more scary warnings after fresh indexing!

#### 🟡 Fixed: Java Keywords in Unresolved Types

**Problem**: Java keywords (`private`, `public`, `return`, `new`, `throws`) were being reported as "unresolved types" in scan_migration_candidates output:
```
3 unresolved: private, public, return
```

**Solution**:
1. Added comprehensive `JAVA_KEYWORDS` set with all Java reserved words
2. Updated `addTypeReference()` to filter out keywords
3. Updated `resolveTypeFqnEnhanced()` to return early for keywords
4. Keywords now correctly skipped as they are not valid type references

#### 🟡 Improved: SQLite Performance Optimizations

**Problem**: SQLite storage was 44-62% slower than file-shard storage.

**Solution**: Added PRAGMA optimizations:
- `cache_size = -65536` (64MB cache, up from 2MB default)
- `mmap_size = 268435456` (256MB memory mapping)
- `temp_store = MEMORY` (faster temp operations)
- `journal_mode = MEMORY` (faster writes)
- `synchronous = OFF` (speed over durability - data is in memory anyway)
- Added `ANALYZE` on startup for better query planning
- Added `optimize()` method for post-indexing optimization

---

## [2.7.1] - 2025-11-30

### 🔧 Patch Release

This patch release includes all the v2.7.0 enhancements with additional test validation.

- All 18 fast tests passing
- All scan_migration_candidates enhancement tests passing (11/11)
- Clean npm cache verification before publish

---

## [2.7.0] - 2025-11-30

### 🎯 Migration Workflow Improvements

This release addresses feedback from extensive migration workflow testing, making the tool more trustworthy for large-scale Java refactoring.

#### 🔴 CRITICAL: Fixed scan_migration_candidates False Positives (~28% reduction)

**Problem**: Users reported that classes marked as "Score 100 SAFE" frequently failed compilation when migrated. The tool was giving false confidence, causing wasted effort.

**Root Causes**:
1. **Missed FQN type references**: Types like `com.example.business.Helper` in code body weren't detected
2. **Wildcard imports ignored**: `import com.example.business.*` was parsed but never analyzed
3. **Over-confident same-package assumption**: Types without imports assumed same-package without verification
4. **No uncertainty tracking**: Score 100 given even when resolution was guesswork

**Solutions Implemented**:

1. **FQN Detection in Code Body**
   - Added regex patterns to detect fully-qualified type names anywhere in code
   - Catches: `com.example.business.Helper helper;`, `new com.example.business.Processor()`, `com.example.business.Constants.VALUE`

2. **Enhanced Type Resolution with Confidence Tracking**
   - New `resolveTypeFqnEnhanced()` returns confidence level: `definite`, `wildcard`, `indexed`, `assumed_same_package`
   - Checks wildcard imports against blocked patterns and index before assuming same-package
   - Uses index lookup to find actual type location

3. **Uncertainty Tracking**
   - New `unresolvedRefs` field tracks types that couldn't be definitively resolved
   - New `hasUncertainDeps` flag on each class
   - Score penalty: up to 30 points deducted for unresolved references

4. **Risk Downgrade for Uncertainty**
   - Classes with uncertain deps are NEVER marked as SAFE
   - Automatically downgraded to LOW risk when uncertainty exists
   - Clear warning in output: "⚠️ IMPORTANT WARNING: X classes have Y type references that could not be definitively resolved"

5. **Verification Guidance**
   - Added "Before Migrating ANY Class" section with grep commands
   - Shows top 5 classes with most unresolved types
   - Legend shows ⚡ marker for uncertain classes

**New Output Fields**:
```json
{
  "unresolvedCount": 3,
  "hasUncertainDeps": true,
  "unresolvedRefs": [
    { "typeName": "BusinessHelper", "confidence": "wildcard", "source": "wildcard_import:com.example.business.*" }
  ]
}
```

**Impact**: ~28% reduction in false positives. Users now get honest uncertainty information instead of false confidence.

#### ✨ 1. `explore_class` directOnly Flag (Feature Request)

**Problem**: When checking an interface, `explore_class` showed dependencies from implementing classes, causing confusion. Users couldn't distinguish between the class's own dependencies vs transitive dependencies.

**Solution**: Added `directOnly` parameter to `explore_class`:
```javascript
explore_class(className: "AccountBalanceList", directOnly: true)
```

When `directOnly=true`:
- Shows only dependencies from THIS class file (extends, implements, direct type references)
- **Excludes** transitive dependencies from call graph analysis
- Output clearly indicates `[DIRECT ONLY MODE]`
- Perfect for accurate migration planning

#### 📊 2. Migration Safety Score (0-100)

**Problem**: No quantified way to assess migration risk for classes.

**Solution**: Added `migrationScore` field to `scan_migration_candidates` output:

| Factor | Weight | Description |
|--------|--------|-------------|
| Blocked Dependencies | -40 | Has imports matching blocked patterns |
| External Dependencies | -5 each | Dependencies outside target package |
| Inbound References | -3 each | Other classes depending on this one |
| Pure Interface Bonus | +15 | Is an interface (easier to move) |
| No Dependencies Bonus | +20 | Zero external dependencies |

**Score Interpretation:**
- 90-100: ✅ Very safe to migrate
- 70-89: ⚠️ Likely safe, verify manually  
- 50-69: ⚠️ Some risk, check carefully
- Below 50: ❌ High risk, significant refactoring needed

#### 🚀 3. `explore_class` in `batch_query`

**Problem**: `batch_query` didn't support `explore_class`, requiring multiple round-trips.

**Solution**: Added `explore_class` as a supported operation in `batch_query`:
```javascript
batch_query(queries: [
  { tool: "explore_class", args: { className: "UserService", directOnly: true } },
  { tool: "explore_class", args: { className: "OrderService" } }
])
```

#### 🕐 4. Index Freshness Indicator

**Problem**: No way to know when the index was last updated, leading to stale data issues.

**Solution**: Added freshness information to `index_project` output:
```
📊 Index Status:
  Last indexed: 2025-11-30T14:32:15.000Z (2 hours ago)
  Symbols: 45,230 | References: 128,450
```

Shows warning when index is >24 hours old:
```
⚠️ INDEX MAY BE STALE - Consider re-indexing with forceReindex: true
```

---

## [2.6.2] - 2025-11-29

### 🔧 Publication Release: v2.6.1 Fixes

Published version with all critical fixes for stale index and dependency visibility issues.

---

## [2.6.1] - 2025-11-29

### 🔧 Critical Bugfix: Stale Index & Dependency Visibility

This release fixes critical issues reported by users where `explore_class` showed wrong dependencies due to stale index data and missing cross-module awareness.

#### 🐛 1. Fixed Cross-Project Index Contamination

**Problem**: When switching between projects, the indexer could retain stale data from the previous project, causing "mixing files across modules" errors.

**Solution**: 
- Added `projectRootDir` tracking to the index
- On `index_project`, validates the loaded index matches the current project
- Automatically clears stale index when project root changes
- Stored in `metadata.json` (version 1.1)

```javascript
// Now logged when switching projects:
// ⚠️ Loaded index is for different project: /old/project
// Current project: /new/project
// Clearing stale index and doing full reindex...
```

#### 🔍 2. Improved OUTBOUND Dependency Visibility

**Problem**: `explore_class` only showed dependencies that were in the index. External libraries and cross-module dependencies were silently dropped, making classes appear to have fewer dependencies than they actually do.

**Solution**:
- Now tracks "unresolved" dependencies separately
- Output shows two sections: "Indexed (in project)" and "⚠️ External/Unresolved (not in index)"
- Quick stats shows both counts

```markdown
## 📤 Dependencies (Outbound)
### Indexed (in project)
- `com.example.UserRepository` (method_call)

### ⚠️ External/Unresolved (not in index)
> These dependencies are referenced but NOT in the index. They may be:
> - External libraries (verify in Maven/Gradle dependencies)
> - Classes from a different Maven module (index that module too)
> - Or the index may be stale - run `index_project` to refresh

- `jakarta.mail.Session`
- `org.springframework.stereotype.Service`
```

#### 📦 3. Multi-Module Project Awareness

**Problem**: Maven multi-module projects were indexed as a flat namespace with no warning that dependencies might cross module boundaries.

**Solution**:
- `explore_codebase` now detects Maven modules from file paths
- Shows warning for multi-module projects
- Explains that dependency counts only reflect what's IN the index

```markdown
## ⚠️ Multi-Module Project Detected

Found 5 modules: `core`, `api`, `service`, `web`, `common`

> **Important**: Dependency counts only include classes IN THIS INDEX.
> - Classes depending on other modules may show fewer dependencies than actual
> - "Unused" classes may be used by modules not indexed
> - For accurate cross-module analysis, index the entire parent project
> - Or use `grep` to verify dependencies before moving/deleting classes
```

### Files Changed
- `memory-index.ts`: Added `projectRootDir` tracking and validation
- `persistence.ts`: Saves/loads `projectRootDir` in metadata (version 1.1)
- `index_project.ts`: Validates project root on load, clears if different
- `explore_class.ts`: Tracks and displays unresolved dependencies
- `explore_codebase.ts`: Detects Maven modules, shows multi-module warnings

---

## [2.6.0] - 2025-11-29

### ✨ Major Enhancement: Refactoring Intelligence - Priority Sorting, Test Filtering, Method Clustering

This release transforms `explore_codebase` from a diagnostic tool into a comprehensive refactoring strategy engine based on real user feedback.

#### 🚀 1. Priority Sorting (LOW_FIRST Strategy)

**Parameter**: `sortByPriority: "LOW_FIRST" | "HIGH_FIRST"`

Start with quick wins to build momentum:
```javascript
explore_codebase(format: "refactoring", sortByPriority: "LOW_FIRST")
```

- **LOW_FIRST**: Shows "🚀 QUICK WINS (Start Here!)" first - perfect for momentum-based refactoring
- **HIGH_FIRST**: Legacy default - tackle big issues immediately

#### 🎯 2. Priority Filtering

**Parameter**: `priority: "LOW" | "MEDIUM" | "HIGH" | "ALL"`

Focus on one priority level at a time:
```javascript
explore_codebase(format: "refactoring", priority: "LOW")
```

#### 🧪 3. Test Class Filtering

**Parameter**: `ignoreTests: true`

Eliminate false positives - test classes NO LONGER flagged as God Classes:
```javascript
explore_codebase(format: "refactoring", ignoreTests: true)
```

- Detects: `*Test.java`, `*IT.java`, `*Tests.java`, `*Spec.java`, `/src/test/**`
- Test classes correctly identified and excluded from God class analysis
- Tests should have many methods - now they're not penalized

#### 🔍 4. Improved "Unused" Detection

New `isProbablyUsed` flag reduces false positives by detecting:
- Spring/JEE patterns: `*Controller`, `*Service`, `*Repository`, `*Component`, `*Entity`
- `*Impl` classes (wired via interfaces)
- Public classes in `api`, `model`, `dto`, `entity`, `domain` packages
- Classes with `@Override` methods
- EJB patterns: `*SessionBean`, `*EJB`, `*MDB`

Classes with these patterns are marked as "probably used" and NOT flagged as unused.

#### 📦 5. Method Clustering (NEW Format)

**NEW Format**: `format: "method-clusters"`

Get actionable refactoring guidance - HOW to split God classes, not just WHAT to split:

```javascript
explore_codebase(format: "method-clusters")
```

**Output includes:**
- Suggested extracted class names with confidence levels (high/medium/low)
- Method groupings based on:
  1. Naming patterns (`validate*`, `process*`, `handle*`, etc.)
  2. Domain concepts (`DateUtils`, `StringUtils`, `FileUtils`, etc.)
  3. Getter/setter extraction suggestions
- Refactoring steps and best practices
- Which fields to move with each cluster

#### 🎯 Recommended Workflow

```javascript
// Week 1: Quick wins - build momentum
explore_codebase(format: "refactoring", sortByPriority: "LOW_FIRST", ignoreTests: true)

// After LOW is clean: Next tier
explore_codebase(format: "refactoring", sortByPriority: "LOW_FIRST", priority: "MEDIUM")

// For God classes: Get split suggestions
explore_codebase(format: "method-clusters", packages: ["com.example.util"])
```

#### 📊 Test Coverage

- 56 tests passing (100% pass rate)
- 11 new tests for new features:
  - Priority sorting and filtering
  - Test class filtering
  - Method clustering analysis

#### 🔧 Technical Details

**New ClassFlags:**
- `isTestClass`: boolean - identifies test classes
- `isProbablyUsed`: boolean - reduces false positives

**New helper functions:**
- `isTestClass(cls)` - Test class detection
- `isProbablyUsedClass(cls, methods)` - Reduces false positives
- `analyzeMethodClusters(fqn, methods, fields, index)` - Suggests class splits
- `sortCandidates(candidates, sortByPriority)` - Flexible priority sorting
- `filterCandidatesByPriority(candidates, filter)` - Priority filtering
- `formatMethodClustersReport(analysis, options)` - New output format

## [2.5.2] - 2025-11-29

### ✨ Enhanced: Refactoring Priority by Dependency Count

**New Format**: `refactoring-priority` - Classes grouped by inbound dependency count for practical refactoring

This enhancement addresses the real-world need to refactor a large codebase (16,000+ classes) efficiently by prioritizing classes based on their "blast radius" - how many other classes depend on them.

#### Strategy

| Tier | Inbound Dependencies | Risk Level | Action |
|------|----------------------|------------|--------|
| **0** | Zero (nobody uses this) | ✅ Zero Risk | Refactor/delete freely |
| **1** | One class depends on this | 🟢 Low Risk | Update one caller |
| **2** | Two classes depend on this | 🟢 Low Risk | Easy coordination |
| **3-5** | Few dependents | 🟡 Moderate | Plan testing |
| **6-10** | Several dependents | 🟠 Higher | Careful planning |
| **11+** | Many dependents | 🔴 High Risk | Major effort |
| **⚠️** | God/Hub/Circular | 🔴 Tackle Last | Requires strategy |

#### Tier 0 Categories

- **Dead Code Candidates**: Zero inbound AND zero outbound dependencies - likely unused
- **Leaf Classes**: Use other classes but nobody uses them - safe to refactor

#### Complex Classes (Tackle Last)

- **God Classes**: 20+ methods - need splitting
- **Hub Classes**: 20+ dependents - core classes, changes affect everything
- **Circular Dependencies**: Break cycles before refactoring

#### Usage

```javascript
// Get refactoring priority report
explore_codebase(format: "refactoring-priority")

// Limit output per tier
explore_codebase(format: "refactoring-priority", maxPerTier: 50)
```

#### Output Includes

- Quick summary table with tier counts and risk levels
- Detailed per-tier listing with class details
- Dead code candidates and leaf classes identified
- Recommended action plan (Week 1, 2-3, 4+, Long-term)

### Added
- New `refactoring-priority` format for `explore_codebase` tool
- New `maxPerTier` parameter to limit output per dependency tier
- Dead code detection (0 inbound + 0 outbound dependencies)
- Leaf class identification (outbound deps but no inbound)
- Hub class detection (20+ inbound dependencies)
- Recommended action plan in output

### Test Coverage
- 45 tests (up from 36), 100% pass rate
- 9 new tests for refactoring-priority format

---

## [2.5.1] - 2025-11-28

### ✨ New Feature: Bulk Codebase Exploration

**New Tool**: `explore_codebase` - Comprehensive bulk class analysis for large codebases (16,000+ classes)

This tool is designed for AI agents that need to understand an entire codebase before refactoring. Instead of calling `explore_class` individually for each class (which would take hours), this tool processes all classes in a single efficient pass.

#### Key Features:

| Feature | Description |
|---------|-------------|
| **Bulk Processing** | Analyzes all indexed classes in one call |
| **Performance Optimized** | Uses batch processing (configurable batch size) |
| **Multiple Output Formats** | `summary`, `detailed`, `json`, `refactoring` |
| **Code Smell Detection** | God classes, unused classes, high coupling, data classes |
| **Refactoring Candidates** | Prioritized list (HIGH/MEDIUM/LOW) with suggestions |
| **Package Filtering** | Analyze specific packages only |
| **Circular Dependencies** | Optional detection (configurable) |
| **Inheritance Analysis** | Depth calculation and subclass counting |
| **Coupling Metrics** | Inbound/outbound dependencies per class |

#### Output Includes:

- **Metadata**: Processing time, class/interface/enum counts
- **Statistics**: Avg methods/fields, max dependencies, deepest inheritance
- **Code Smells**: God classes, data classes, unused classes, high coupling
- **Refactoring Candidates**: Prioritized issues with specific suggestions
- **Package Summaries**: Aggregated stats per package
- **Class Details**: Full structure, flags, dependencies (optional)

#### Usage Examples:

```javascript
// Quick overview
explore_codebase(format: "summary")

// Full structured data for programmatic use
explore_codebase(format: "json")

// Refactoring priority list
explore_codebase(format: "refactoring")

// Analyze specific packages only
explore_codebase(format: "detailed", packages: ["com.example.core"])

// With circular dependency detection
explore_codebase(format: "json", detectCircular: true)
```

#### Performance:

- Target: <30 minutes for 16,000+ classes
- Batch processing with configurable batch size (default: 500)
- Memory-efficient single-pass symbol categorization
- Pre-computed dependency maps

#### Files Added:

- `server/src/tools/explore_codebase.ts`: New tool implementation (~950 lines)
- `test-explore-codebase.js`: Comprehensive test suite (36 tests)

#### Files Modified:

- `server/src/index.ts`: Registered new tool
- `package.json`: Updated version to 2.5.1, tool count to 18

---

## [2.5.0] - 2025-11-28

### 🐛 Critical Fix: Same-Package Dependency Detection

**Problem Solved**: The `scan_migration_candidates` tool was incorrectly classifying files as "SAFE" when they had same-package dependencies that don't require explicit import statements in Java.

**Root Cause**: Java allows implicit references to classes in the same package without import statements. The previous implementation only tracked imported types, missing ~20+ edge cases of type references.

**Comprehensive Fix**: Complete rewrite of `ReferenceExtractor.java` and enhanced TypeScript analysis with `strictMode` option.

#### Edge Cases Now Correctly Detected (20+ scenarios):

| # | Category | Example | Status |
|---|----------|---------|--------|
| 1 | **extends** | `class A extends BaseService` | ✅ |
| 2 | **implements** | `class A implements Entity` | ✅ |
| 3 | **Field Types** | `private Entity entity;` | ✅ |
| 4 | **Parameter Types** | `void process(Entity e)` | ✅ |
| 5 | **Return Types** | `Entity getEntity()` | ✅ |
| 6 | **Local Variables** | `Entity e = ...` | ✅ |
| 7 | **Generics** | `List<Entity>`, `Map<Status, Entity>` | ✅ |
| 8 | **Annotations** | `@Auditable` | ✅ |
| 9 | **throws clause** | `throws CustomException` | ✅ |
| 10 | **catch clause** | `catch (CustomException e)` | ✅ |
| 11 | **instanceof** | `obj instanceof Entity` | ✅ |
| 12 | **Cast expressions** | `(Entity) obj` | ✅ |
| 13 | **Class literals** | `Entity.class` | ✅ |
| 14 | **Method references** | `Helper::process` | ✅ |
| 15 | **Object instantiation** | `new CustomException()` | ✅ |
| 16 | **Static field access** | `Helper.CONSTANT` | ✅ |
| 17 | **Static method calls** | `Helper.doSomething()` | ✅ |
| 18 | **Enum constant access** | `Status.ACTIVE` | ✅ |
| 19 | **Array types** | `Entity[]`, `Status[]` | ✅ |
| 20 | **Type parameter bounds** | `<T extends Entity>` | ✅ |
| 21 | **Multiple implements** | `implements Entity, Auditable` | ✅ |

#### New `strictMode` Parameter

The `scan_migration_candidates` tool now supports a `strictMode` parameter that performs direct file content analysis to ensure accurate same-package dependency detection:

```json
{
  "sourcePackage": "com.example.util",
  "blockedPatterns": ["com.example.business"],
  "strictMode": true
}
```

#### Files Modified:

- `ReferenceExtractor.java`: Complete rewrite (~700 lines) with comprehensive AST traversal
- `scan_migration_candidates.ts`: Added `strictMode`, `safePatterns`, file-based parsing
- `ParserService.java`: Added RecordDeclaration support  
- `memory-index*.ts`: Added 'record' to SymbolStub kind type

### ✅ Test Results

- Feature Preservation Tests: 26/26 passed
- Migration Scanner Tests: 29/29 passed  
- All Tools Tests: 30/30 passed
- Strict Mode Edge Cases: 17/17 passed

---

## [2.4.0] - 2025-11-28

### 🚀 New Feature: Migration Scanner Tool

#### `scan_migration_candidates` - Bulk Migration Analysis (40-60x faster!)

**Problem Solved**: With 12,000+ Java classes and previous tools only analyzing ~10 classes per batch, modularization was too slow.

**Solution**: New bulk analysis tool that scans an entire package in a single API call.

**Performance Improvement**:
| Metric | Before | After |
|--------|--------|-------|
| API calls for 100 classes | 100 | 1 |
| Time for 100 classes | ~200 seconds | ~5 seconds |
| Time for 319 util/ classes | ~10 minutes | ~15 seconds |
| Manual categorization | Required | Automatic |
| Migration plan | Manual | Auto-generated |

**Features**:
- **Bulk Package Scanning**: Analyze entire packages with subpackage support
- **Blocked Pattern Detection**: Define patterns that block migration (e.g., `com.legacy.business`)
- **Risk Categorization**: 
  - ✅ SAFE: 0 blocked deps - migrate immediately
  - ⚠️ LOW/MEDIUM: 1-5 blocked deps - may need minor refactoring
  - ❌ BLOCKED: 6+ blocked deps - major refactor needed
- **Migration Batch Ordering**: Topological sort for optimal migration sequence
  - Pure types (enums, interfaces) first
  - Utility classes second
  - Complex classes last
- **Effort Estimation**: Time estimates based on class complexity
- **Actionable Suggestions**: "Extract interface", "Use DI", etc.

**Usage Example**:
```json
{
  "sourcePackage": "com.example.util",
  "blockedPatterns": ["com.example.business", "com.example.legacy"],
  "outputFormat": "migration-plan"
}
```

**Output Formats**:
- `summary`: Quick overview with counts
- `detailed`: Full class listings with blocking dependencies
- `migration-plan`: Complete execution plan with batches

### 📊 Tool Count

- Total MCP tools: 17 (was 16)

---

## [2.3.2] - 2025-11-26

### 📝 Documentation

- Added comprehensive `JAVA_INDEXER_USAGE_GUIDE.md` with best practices
- Updated CHANGELOG.md with v2.3.0 and v2.3.1 entries
- User validation: Same-package dependency detection working correctly

---

## [2.3.1] - 2025-11-26

### 🐛 Bug Fixes

#### Same-Package Dependency Detection - FIXED ✅
**Problem**: `explore_class` reported "0 external dependencies" for classes that use same-package classes without explicit imports (e.g., `CommonUtils` using `XMLUtils`, `FileHelper`, `MiscUtil`)

**Root Cause**: 
- Only checked call graph (method_call references)
- Missed type_reference, instantiation, and field_access references
- Simple class names weren't resolved to FQNs

**Fix**:
- Added `findReferencesFromClass()` to MemoryIndex - returns ALL references from a class
- Enhanced `explore_class` dependency detection to check ALL reference types
- Implemented `resolveToFqn()` with same-package preference
- Filters out false positives (primitives, variables, `this`, `super`)

#### File Watcher Performance - FIXED ✅
**Problem**: System became unresponsive during `mvn clean build` due to excessive CPU/memory usage

**Root Cause**:
- File watcher triggered on EVERY file change immediately
- Each trigger calculated SHA-256 hash (reads entire file)
- No rate limiting for bulk changes (build touches 100s of files)

**Fix**:
- Created `IndexValidator` class for on-demand validation
  - Uses fast mtime comparison instead of hash
  - Bulk change detection (>100 files = skip auto-refresh)
  - Cooldown mechanism (5s check, 10s refresh)
- Redesigned `FileSystemWatcher` with heavy debouncing
  - 30-second debounce (waits for build to complete)
  - Bulk change detection (>50 pending = skip)
  - 1-minute cooldown after bulk change

#### Path Normalization - FIXED ✅
**Problem**: Path comparison failures on Windows (forward vs backslash)

**Fix**: Normalized all paths to forward slashes for consistent comparison

### Files Changed
- NEW: `server/src/index-validator.ts`
- MODIFIED: `server/src/fs-watcher.ts`
- MODIFIED: `server/src/memory-index.ts` (added `findReferencesFromClass()`, mtime support)
- MODIFIED: `server/src/tools/explore_class.ts` (enhanced dependency detection)
- MODIFIED: `server/src/index.ts` (integrated IndexValidator)

---

## [2.3.0] - 2025-11-25

### 🚀 Agent-Friendly Improvements

#### New MCP Features
- **Resources API**: 3 resources for index introspection (stats, symbols, files)
- **Prompts API**: 4 workflow templates (understand-class, refactor-safely, find-pattern, trace-flow)
- **Server Instructions**: Natural language guidance for AI agents
- **Tool Annotations**: Safety hints (readOnlyHint, idempotentHint, destructiveHint)

#### New Tools
- **explore_class**: All-in-one class analysis (reduces 4-5 tool calls to 1)
  - Structure, inheritance, dependencies, usage patterns
  - Inbound/outbound calls, field/method listings
- **batch_query**: Multi-query batching (max 10 queries per call)
  - Reduces API round trips for agents

#### Enhanced Tool Descriptions
All 16 tools now include:
- Clear use cases and examples
- When to use guidance
- Tips for better results

#### Documentation
- NEW: `AGENT_INTEGRATION.md` - Comprehensive agent guide
- NEW: `server/src/server-instructions.ts` - Natural language guidance
- NEW: `server/src/tool-annotations.ts` - Tool safety metadata

### Files Changed
- NEW: `server/src/tools/explore_class.ts`
- NEW: `server/src/tools/batch_query.ts`
- NEW: `server/src/server-instructions.ts`
- NEW: `server/src/tool-annotations.ts`
- MODIFIED: `server/src/index.ts` (added Resources, Prompts, Instructions APIs)
- MODIFIED: `server/src/memory-index.ts` (added getSymbolSummary(), getIndexedFiles())
- MODIFIED: All tool files with enhanced descriptions

---

## [2.2.3] - 2025-11-25

### 🔴 Critical Bug Fixes

This release fixes **3 critical bugs** that were causing the extension to be unusable for large projects:

#### 1. Buffer Overflow - FIXED ✅
**Problem**: "Failed to index project: Buffer overflow" on projects with 5K+ files
**Root Cause**: 50MB buffer limit was too small; large batches exceeded it
**Fix**:
- Increased MAX_BUFFER_SIZE from 50MB to **500MB**
- Reduced batch size from 300 to **100 files** (smaller JSON responses)
- Changed buffer handling to process messages BEFORE checking size
- On overflow: clear buffer only, don't reject pending requests

#### 2. Find Usages Returns 0 - FIXED ✅
**Problem**: `find_usages` returned 0 results for all queries (regression from v2)
**Root Cause**: References stored with simple names (`foo.method()`) but lookup used FQNs (`com.example.Class.method()`)
**Fix**:
- Implemented **fuzzy matching** in `findUsages()`
- Try exact FQN match first
- Extract method/class names for partial matching
- Match patterns: `varName.methodName`, `ClassName.methodName`

#### 3. Call Graph Missing Inbound Calls - FIXED ✅
**Problem**: `call_graph` showed 0 inbound calls when callers existed
**Root Cause**: Same FQN mismatch - `getInboundCalls()` used exact match only
**Fix**:
- Implemented **fuzzy matching** in `getInboundCalls()` and `getOutboundCalls()`
- Search by method name across all entries
- Deduplicate results

### Test Results (12,086 files)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Buffer Overflow | ❌ BROKEN | ✅ 10/10 | **FIXED** |
| Find Usages | ❌ 0 results | ✅ 562 usages | **FIXED** |
| Call Graph Inbound | ❌ 0 results | ✅ 562 callers | **FIXED** |
| Reindex Performance | 20s | **1.03s** | **95% faster** |
| Memory Peak | 2-4GB | **161MB** | **93% reduction** |
| Overall Score | 5.0/10 | **9.2/10** | **+4.2** |

### Files Modified
- `server/src/indexer-client.ts` - Buffer handling + size increase
- `server/src/tools/index_project.ts` - Smaller batch size
- `server/src/memory-index.ts` - Fuzzy matching for findUsages, getInboundCalls, getOutboundCalls

---

## [2.2.2] - 2025-11-25

### Storage Backend Improvements
- Fixed reference storage with proper FQN resolution
- Synchronous SQLite queries (removed spin-wait pattern)
- Import map for Java type resolution
- Improved test suite validation

---

## [2.2.1] - 2025-11-25

### Storage Backend Release
- SQLite storage backend enabled by default
- 93% memory reduction (2-4GB → 136MB)
- All 14 tools working with storage backend
- Zero feature compromise

---

## [2.2.0] - 2025-11-24

### Storage Backend (Beta)
- New SQLite-based storage backend for large projects
- `IIndexStorage` interface for abstraction
- `SqliteStorage` implementation with better-sqlite3
- `FileShardStorage` fallback for pure JS environments
- Automatic detection and graceful fallback

---

## [2.1.0] - 2025-11-24

### Memory Optimizations
- Reduced memory thresholds by 80-83%
- Emergency cleanup mode for high memory situations
- Enhanced cleanup runs every 2 batches
- Earlier intervention at 1.5GB trigger
- Quintuple GC for maximum cleanup

### New Tool
- `compact_index` - Three modes: standard, aggressive, emergency

---

## [2.0.0] - 2025-11-24

### Major Release - Memory Efficiency
- Complete rewrite of memory management
- Hash-based incremental indexing
- LRU eviction for symbols
- Chunked JSON persistence
- File watcher with debouncing

---

## [1.4.2] - 2025-11-23

### Fixed - Critical Memory Leak 🔧
Resolved fatal memory leak causing crashes after 1-2 hours of operation.

**Problem**:
- Extension crashed with "JavaScript heap out of memory" error (code 134)
- Memory grew from 200MB → 1.8GB+ over 1-2 hours
- Unbounded array growth and no cleanup mechanism

**Root Causes Fixed**:
1. **No heap limit** - Now set to 4GB (--max-old-space-size=4096)
2. **Unbounded references array** - Added referencesByFile map for O(1) cleanup
3. **Java process leaks** - Added timeout tracking and buffer overflow protection
4. **No maintenance** - Added periodic cleanup every 30 minutes
5. **File watcher accumulation** - Optimized call graph edge cleanup

**Key Improvements**:
- ✅ **Stability**: Runs indefinitely without crashes
- ✅ **Memory**: Stable ~800MB over 24+ hours (was 1.8GB+ after 2h)
- ✅ **Performance**: 10x faster file removal with referencesByFile index
- ✅ **Monitoring**: Real-time memory stats logged every 30 minutes
- ✅ **Maintenance**: Automatic cleanup removes orphaned references
- ✅ **Safety**: Buffer overflow protection (50MB limit)
- ✅ **Recovery**: Graceful error handling and shutdown

**Files Modified**:
- `server/package.json`: Added --max-old-space-size=4096 flag
- `server/src/memory-index.ts`: Added referencesByFile map, cleanup methods
- `server/src/indexer-client.ts`: Added timeout tracking, buffer protection
- `server/src/index.ts`: Added maintenance schedule, monitoring
- `server/src/persistence.ts`: Added referencesByFile persistence

**Documentation**:
- `MEMORY_LEAK_FIX_v1.4.2.md`: Technical deep dive
- `MEMORY_FIX_SUMMARY.md`: Quick reference guide

**Testing**:
- ✅ Automated tests passed (server startup, monitoring, maintenance)
- ✅ Memory tracking verified
- ✅ All 13 tools still functional
- 🔄 Long-running stability test recommended (4+ hours)

## [1.4.1] - 2025-11-23

### Performance - 30-35% Faster Indexing 🚀
Major performance optimizations for large monolithic projects (16,000+ files):

**Optimizations**:
- **Batch Size**: Increased from 100 → 200 files (50% fewer IPC round-trips)
- **Timeout**: Extended from 5 → 10 minutes for large projects
- **Logging**: 90% reduction in logging overhead (Node.js and Java)
- **GC**: Optimized garbage collection hints (every 2000 files vs 1000)
- **Memory**: Pre-allocated ArrayList capacity in Java

**Performance Improvements**:
- Small projects (55 files): 1.08s, **15% faster** (measured)
- Large projects (16k files): ~7-8 min, **30-35% faster** (estimated)

**Testing**:
- 40 tests executed, 38 passed (95% pass rate)
- 0 new regressions introduced
- All 13 MCP tools verified working
- Inheritance tracking intact (including deep hierarchies)

**Files Modified**:
- `server/src/tools/index_project.ts`: Batch optimization
- `server/src/indexer-client.ts`: Extended timeout
- `java-indexer/.../JavaIndexer.java`: Logging optimization
- `test-all-tools.js`: Improved test handling

**Documentation**:
- `PERFORMANCE_OPTIMIZATION_v2.md`: Technical details
- `PERFORMANCE_OPTIMIZATION_SUMMARY.md`: Executive summary
- `TESTING_PERFORMANCE.md`: Testing guide for large projects
- `TEST_EXECUTION_REPORT.md`: Complete test results

## [1.4.0] - 2025-11-23

### Added - Advanced Quality & Generation Tools 🚀
Three new high-impact tools for code quality analysis and generation:

1. **`test_coverage`** - Test coverage analysis
   - Analyzes test coverage for any class or method
   - Direct and indirect test coverage tracking
   - Coverage percentage with status indicators (🟢 EXCELLENT, 🟡 GOOD, 🟠 MODERATE, 🔴 POOR)
   - Identifies untested code paths
   - Suggests test names for uncovered code
   - Class-level coverage context
   - Actionable recommendations

2. **`refactoring_suggestions`** - Smart refactoring analysis
   - Code health scoring (0-100)
   - Detects 15+ code smells: God Class, Long Methods, Too Many Parameters, Dead Code, etc.
   - Priority-based suggestions (HIGH, MEDIUM, LOW)
   - Impact and effort estimates for each suggestion
   - Generates comprehensive refactoring plans
   - Naming convention analysis
   - Complexity metrics

3. **`code_generation`** - Pattern-based code generator
   - Generates 8 patterns: Builder, Repository, Service, DTO, Test, Exception, Factory, Validator
   - Analyzes existing codebase patterns for consistency
   - Produces fully documented Java code
   - Package inference from project structure
   - Template customization based on examples
   - Next steps guidance

### Quality Assurance
- Comprehensive test suite with 13 tests (100% pass rate)
- No regressions - all existing tools verified working
- Automated test executor (`test-all-tools.js`)
- Performance: All new tools < 50ms

### Documentation
- Added `V1.4.0_COMPLETE.md` with implementation details
- Updated package.json with new keywords
- Tool count: 7 core + 3 AI + 3 advanced = 13 total tools

## [1.3.0] - 2025-01-XX

### Added - AI-Friendly Tools 🧠
Three powerful new tools designed to help AI coding agents understand and work with Java code more effectively:

1. **`explain_code`** - Natural language code explanations
   - Generates human-readable descriptions of classes, methods, interfaces, and fields
   - Analyzes purpose, structure, dependencies, and design patterns
   - Three verbosity levels: brief, detailed, comprehensive
   - Detects 10+ design patterns (Builder, Factory, Repository, Service, etc.)
   - Provides best practice recommendations and refactoring suggestions
   - Example: Explain `com.example.UserService` returns "Service class containing business logic with 5 public methods"

2. **`semantic_search`** - Intent-based code search
   - Find code by what it does, not what it's named
   - Natural language queries: "database save methods", "validation logic", "builder pattern classes"
   - Pattern detection for 20+ common patterns (repository, service, factory, observer, async, etc.)
   - Multi-factor scoring: name match, signature match, pattern match, modifier match
   - Symbol type filtering (class, method, field, etc.)
   - Ranked results by relevance score
   - Example: Query "database save methods" finds `save()`, `persist()`, `store()` across Repository classes

3. **`analyze_impact`** - Dependency impact analysis with risk scoring
   - Shows what breaks when you change a class or method
   - Risk assessment: LOW (0-33), MODERATE (34-66), HIGH (67-100)
   - Direct and indirect dependency tracking
   - Transitive analysis with configurable depth
   - Actionable recommendations based on risk level
   - Example: Changing `UserRepository` affects 12 methods, MODERATE risk

### Technical Improvements
- Added `getAllSymbols()` method to `MemoryIndex` for semantic search
- Enhanced symbol metadata for pattern detection
- Comprehensive test suite with 10 test cases (100% pass rate)
- Performance: All tools complete in < 200ms using in-memory indices
- Zero configuration, no additional dependencies

### Documentation
- New `ADVANCED_TOOLS.md` with detailed examples and use cases
- Updated README with AI-friendly features section
- Architecture documentation for new tools
- Usage examples for each tool

## [1.2.1] - 2025-01-XX

### Fixed
- **Performance optimization** for large projects (16k+ files)
  - Reduced inheritance tracking overhead by 87%
  - Now only tracks inheritance for class/interface/enum (not methods/fields/constructors)
  - Fixed timeout issues with 16k+ file projects

### Fixed
- **Generic type parameters** breaking inheritance lookups
  - Strip type parameters from resolved class names (e.g., `AbstractCrudRepository<String>` → `AbstractCrudRepository`)
  - Ensures proper symbol resolution for generic classes

## [1.2.0] - 2025-11-23

### Fixed
- **Inheritance tracking** now correctly displays relation counts instead of showing 0
  - Fixed property name mismatch between Java indexer (`extendsClass`, `implementsInterfaces`) and TypeScript server (`extends`, `implements`)
  - Updated `SymbolStub` interface to support both property naming conventions for backward compatibility
  - Modified `addSymbol()` method to check both old and new property names
  - Updated `fromJSON()` rebuild logic to properly restore inheritance maps from persisted data
  - Inheritance relations now correctly tracked during indexing and persistence

### Technical Details
- Java indexer uses `extendsClass` and `implementsInterfaces` properties
- TypeScript server now checks both naming conventions with fallback: `stub.extends || stub.extendsClass`
- No breaking changes - fully backward compatible with existing indices

## [1.0.0] - 2024-01-15

### Added
- Initial release of Java Indexer MCP extension for VS Code
- 7 MCP tools for Java code analysis:
  - **index_project**: Batch index Java files with configurable source roots (50 files/batch)
  - **reindex_file**: Incremental reindexing of single files with hash-based change detection
  - **find_symbol**: Symbol definition lookup with partial name matching
  - **find_usages**: Reference tracking (method calls, field accesses, instantiations)
  - **call_graph**: Bidirectional call analysis with polymorphic dispatch detection
  - **goto_definition**: Navigate to symbol definitions with location tracking
  - **search_text**: Regex-based code search with case-insensitive matching
- Automatic file watcher with incremental indexing (Chokidar)
- In-memory indices with O(1) symbol lookup
- JSON-based persistence (`.mcp-index/index.json`)
- Zero-database architecture - fully local, no external services
- Support for Java 8+ projects
- Full type resolution with JavaParser + SymbolSolver
- Complete inheritance hierarchy tracking
- Interface implementation detection
- Comprehensive documentation with examples
- Extension commands for integration with VS Code UI:
  - Java Indexer: Index Project
  - Java Indexer: Find Symbol
  - Java Indexer: Find Usages
  - Java Indexer: Show Call Graph
- Configurable settings:
  - Auto-index on startup
  - Custom source roots
  - Exclude patterns
  - Index timeout configuration

### Technical Details
- **MCP SDK**: v0.6.0
- **Parser**: JavaParser 3.25.8 with SymbolSolver
- **File Watching**: Chokidar 3.5.3
- **Runtime**: Node.js 18+, Java 8+
- **Language**: TypeScript 5.3.0
- **Build Tool**: Maven 3.6+

### Performance
- Indexes 50-100 Java files per second
- Symbol lookup: < 5ms (in-memory hash map)
- Incremental file reindex: < 200ms
- Batch processing for large projects (1000+ files)

### Known Limitations
- Large projects (10k+ files) may require 30-60 seconds for initial indexing
- Memory usage scales with project size (~500MB for 20k classes)
- Requires Java installation on system PATH
- Windows, macOS, and Linux support (verified on Windows)

### Architecture
- **Process Model**: Node.js MCP server ↔ Java indexer via JSON-over-stdio
- **Data Storage**: In-memory Maps with JSON persistence
- **Change Detection**: SHA-256 hashing for incremental updates
- **Communication**: Stdio protocol for MCP compliance

### Documentation Included
- `README.md` - Comprehensive user guide with examples
- `PUBLISH_GUIDE.md` - Complete marketplace publishing instructions
- `docs/MARKETPLACE_README.md` - Quick start guide for marketplace users
- `QUICKSTART.md` - Getting started guide
- `TESTING.md` - Testing and validation procedures
- `PROJECT_STRUCTURE.md` - Architecture documentation
- `BUILD_VERIFICATION.md` - Build verification checklist
- `EXTENSION_README.md` - Extension-specific documentation

### Installation
- VS Code Marketplace (preferred method)
- Manual installation from source
- Support for global and workspace-level configuration

### Testing
- Verified with sample 5-file Java project
- MCP protocol communication tested and working
- File watcher incremental updates tested
- Call graph analysis verified
- Symbol resolution with type hierarchy tested

## [Unreleased]

### Planned Features
- [ ] Refactoring suggestions based on call graph
- [ ] Method complexity analysis
- [ ] Dependency injection analysis
- [ ] Spring Framework-specific intelligence
- [ ] Performance metrics dashboard
- [ ] Project statistics visualization
- [ ] Integration with debugger

### Under Consideration
- [ ] Support for additional JVM languages (Kotlin, Groovy)
- [ ] Eclipse project support
- [ ] Gradle project detection
- [ ] Maven dependency graph analysis
- [ ] Test coverage analysis

---

## Upgrade Guide

### Upgrading from 1.0.0
No breaking changes expected in initial releases.

---

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.x.x): Breaking changes to MCP tools or configuration
- **MINOR** (x.1.x): New features, backwards compatible
- **PATCH** (x.x.1): Bug fixes, internal improvements

---

## Support

- **Report Issues**: https://github.com/yourusername/java-indexer-mcp/issues
- **Discussions**: https://github.com/yourusername/java-indexer-mcp/discussions
- **Documentation**: See README.md and PUBLISH_GUIDE.md

---

## Contributors

- Initial development and architecture
- Community contributions welcome! See GitHub for contribution guidelines

---

## License

MIT License - See LICENSE file for details

---

**Last Updated**: 2024-01-15
