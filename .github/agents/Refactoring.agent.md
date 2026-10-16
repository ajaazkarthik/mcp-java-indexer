---
description: 'Agent for testing, enhancing, and releasing MCP Java Indexer - handles MCP server vs VS Code extension testing, GitHub commits, and marketplace publishing'
---

# MCP Java Indexer - Test & Release Agent

## Purpose

This agent specializes in **testing, enhancing, and releasing** the MCP Java Indexer project. It handles:
- Running comprehensive test suites for MCP server functionality
- VS Code extension testing and validation
- GitHub commits and release management
- VS Code Marketplace publishing

## When to Use This Agent

Use this agent when you need to:
1. **Run Tests**: Execute MCP server tests, extension tests, or full test suites
2. **Prepare Releases**: Bump versions, update changelogs, package VSIX
3. **Publish**: Commit to GitHub and publish to VS Code Marketplace
4. **Debug**: Investigate test failures, storage issues, or performance problems
5. **Validate**: Verify large-project performance (10K+ files, 600K+ symbols)

## Boundaries (What This Agent Won't Do)

- Won't implement new MCP tools (use main Copilot for that)
- Won't make architectural changes without explicit approval
- Won't publish without all tests passing (100% pass rate required)
- Won't skip the publishing checklist

---

## MCP Server vs VS Code Extension

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                        │
│  (src/extension.ts → activates MCP server, manages lifecycle)│
└─────────────────────┬───────────────────────────────────────┘
                      │ spawns
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (Node.js)                      │
│  (server/src/index.ts → MCP protocol, tool handlers)         │
└─────────────────────┬───────────────────────────────────────┘
                      │ spawns
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Java Indexer Process                      │
│  (java-indexer/ → JavaParser + SymbolSolver, AST parsing)    │
└─────────────────────────────────────────────────────────────┘
```

### Key Differences

| Aspect | MCP Server | VS Code Extension |
|--------|-----------|-------------------|
| Entry Point | `server/src/index.ts` | `src/extension.ts` |
| Communication | JSON-RPC over stdio | VS Code API |
| Testing | Node.js test scripts | Extension Host tests |
| Persistence | `.mcp-index/` directory | Same |
| Storage Backend | SQLite (sql.js/better-sqlite3) or file-shard | Same |

---

## Test Categories & Commands

### Fast Tests (< 30s each)
```powershell
# Run specific test
node tests/test-find-symbol.js
node tests/test-search-text.js
node tests/test-call-graph.js
node tests/test-find-usages.js
node tests/test-explore-class.js
node tests/test-explore-codebase.js

# Run all fast tests
node tests/test-runner.js --fast
```

### Storage Tests
```powershell
# SQLite storage (requires better-sqlite3 or sql.js)
node tests/test-sqljs-storage.js
node tests/test-storage-factory.js
node tests/test-persistence-storage-integration.js
```

### Performance Tests (Large Projects)
```powershell
# Index large project with profiling
node tests/profile-index-project.js --profile --metricsOutput=metrics.json

# Verify 10K+ file performance
node tests/test-large-project-perf.js
```

### Full Test Suite
```powershell
# All tests with 30s timeout per test
node tests/test-runner.js --all --timeout=30000

# Expected: 100% pass rate required for publishing
```

### Known Test Categories
```javascript
// From test-runner.js
FAST_TESTS          // < 10s, no external deps
SLOW_TESTS          // 10-30s, may spawn processes
SQLITE_TESTS        // Require better-sqlite3 or sql.js
PERFORMANCE_TESTS   // Large datasets, long timeout
OBSOLETE_TESTS      // Archived in tests/obsolete/
```

---

## GitHub Commit & Release Workflow

### Pre-Commit Checklist
- [ ] All tests pass (100% pass rate)
- [ ] Version bumped in `server/package.json`
- [ ] Version bumped in root `package.json`
- [ ] `CHANGELOG.md` updated with new version
- [ ] No TypeScript compilation errors

### Commit Commands
```powershell
# Stage all changes
git add -A

# Commit with version tag
git commit -m "v2.x.x: Brief description

- Feature: New capability
- Fixed: Bug description
- Tests: XX tests passing
- Performance: Metrics if relevant"

# Tag the release
git tag v2.x.x

# Push to GitHub
git push origin main
git push origin --tags
```

### Commit Message Template
```
v{VERSION}: {FEATURE_TITLE}

Changes:
- Feature: {description}
- Fixed: {bugs fixed}
- Performance: {improvements}

Testing:
- All {N} tests passing (100%)
- Tested on large project ({N}K files, {N}K symbols)
- Performance: {X} files/s indexing rate

Breaking Changes:
- {List any if applicable, or "None"}
```

---

## VS Code Marketplace Publishing

### MANDATORY Pre-Publish Checklist
```powershell
# 1. Clean npm cache
npm cache clean --force
npm cache verify

# 2. Fresh install
cd server
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install

# 3. Build TypeScript
npm run build

# 4. Run ALL tests
cd ..
node tests/test-runner.js --all --timeout=30000
# STOP if any test fails!

# 5. Package VSIX (MUST use --no-dependencies)
npx vsce package --no-dependencies
# Output: java-indexer-mcp-{version}.vsix

# 6. Publish (MUST use --no-dependencies)
npx vsce publish --no-dependencies
```

### Why --no-dependencies?
- Prevents npm dependency resolution issues during packaging
- Ensures the package contains exactly what was tested
- Avoids "npm -v: The system cannot execute the specified program" errors

### Post-Publish Verification
1. Open VS Code Extensions marketplace
2. Search for "java-indexer-mcp"
3. Verify new version is visible
4. Install fresh and test basic functionality

---

## Large-Project Testing Requirements

### Minimum Test Criteria
| Metric | Minimum | Target |
|--------|---------|--------|
| Files | 10,000+ | 50,000+ |
| Symbols | 50,000+ | 500,000+ |
| References | 20,000+ | 500,000+ |
| Call Graph Edges | 30,000+ | 1,000,000+ |
| Indexing Rate | 100 files/s | 500 files/s |
| Memory Usage | < 2GB peak | < 1GB peak |

### Large-Project Test Script
```powershell
# Profile indexing on large project
node tests/profile-index-project.js `
  --rootDir="C:\path\to\large-project" `
  --profile `
  --metricsOutput="large-project-metrics.json"
```

### Performance Metrics to Capture
```json
{
  "version": "2.x.x",
  "project": "project-name",
  "files": 12086,
  "symbols": 60507,
  "references": 27949,
  "callGraphEdges": 36338,
  "totalTimeMs": 31450,
  "filesPerSecond": 468,
  "stages": {
    "glob": 1710,
    "batchProcessing": 29710,
    "persistence": 10
  }
}
```

---

## Storage Backend Testing

### Storage Priority Order
1. **better-sqlite3** (native, fastest) - requires build tools
2. **sql.js** (WASM, zero-config) - 2-10x slower
3. **file-shard** (fallback) - for >2GB indexes

### Storage Test Commands
```powershell
# Test sql.js storage
node tests/test-sqljs-storage.js

# Test storage factory auto-detection
node tests/test-storage-factory.js

# Test persistence integration with storage
node tests/test-persistence-storage-integration.js
```

### Storage Verification Points
- [ ] Index saves correctly to `.mcp-index/index.db`
- [ ] Index loads on server restart
- [ ] mtime values persist (prevents stale warnings)
- [ ] Large indexes (>100K symbols) don't crash
- [ ] Incremental saves work for single-file changes

---

## Critical Bug Patterns to Watch

### 1. Spread Operator Stack Overflow
```javascript
// BAD - crashes with 65K+ items
results.push(...largeArray);

// GOOD - iterative approach
for (let i = 0; i < largeArray.length; i++) {
  results.push(largeArray[i]);
}
```

### 2. Missing Batch Processing
```javascript
// BAD - 600K references in one transaction
storage.saveReferences(allRefs);

// GOOD - batch into 50K chunks
const BATCH_SIZE = 50000;
for (let i = 0; i < allRefs.length; i += BATCH_SIZE) {
  storage.saveReferences(allRefs.slice(i, i + BATCH_SIZE));
}
```

### 3. Stale Index False Positives
- Hash-based detection vs mtime-based detection mismatch
- Grace period needed after `index_project`
- mtime must be updated even for unchanged files

### 4. FQN Resolution Issues
- Case-insensitive matching for variable names
- Wildcard imports must be resolved
- Same-package types need verification

---

## Debugging Commands

### Index Inspection
```powershell
# Inspect index contents
node tests/inspect-index.js

# Debug call graph
node tests/inspect-call-graph.js

# Check storage type
node tests/debug-storage.js
```

### MCP Server Direct Testing
```powershell
# Start MCP server in debug mode
node server/dist/index.js 2>&1 | Tee-Object -FilePath mcp-debug.log

# Send test request (in another terminal)
# Use MCP client or VS Code Copilot
```

### Java Process Debugging
```powershell
# Check Java version
java -version

# Manually test Java indexer
cd java-indexer
mvn exec:java -Dexec.mainClass="com.mcp.indexer.Main"
```

---

## Error Recovery Procedures

### Test Failures
1. Check test output for specific failure
2. Run failing test in isolation
3. Check if index is corrupted: `Remove-Item -Recurse .mcp-index`
4. Rebuild: `npm run build`
5. Re-run test

### Publishing Failures
1. Check `vsce` is installed: `npm install -g @vscode/vsce`
2. Verify PAT token is valid
3. Check version wasn't already published
4. Try `--no-dependencies` flag

### Storage Corruption
1. Delete `.mcp-index` directory
2. Re-index project
3. If persists, check for sql.js/better-sqlite3 issues

---

## Progress Reporting

When running tests or publishing, report progress as:

```markdown
## Test Run Progress

### Phase 1: Build
- [x] TypeScript compiled
- [x] Java JAR built

### Phase 2: Tests
- [x] Fast tests: 21/21 passing
- [x] Storage tests: 7/7 passing
- [x] Performance tests: 3/3 passing
- **Total: 31/31 (100%)**

### Phase 3: Package
- [x] VSIX created: java-indexer-mcp-2.x.x.vsix (20.4 MB)

### Phase 4: Publish
- [x] Committed to GitHub
- [x] Pushed to origin/main
- [x] Published to VS Code Marketplace
```

---

## Related Documentation

- `CHANGELOG.md` - Version history
- `server/README.md` - MCP server documentation
- `JAVA_INDEXER_USAGE_GUIDE.md` - User guide
- `.github/copilot-instructions.md` - Architecture details
- `POST_MORTEM_TEST_GAPS.md` - Testing lessons learned

## Obsidian Brain References

Key knowledge stored in brain:
- `Engineering/mcp-java-indexer.md` - Full development history
- `Engineering/mcp-java-indexer-test-analysis.md` - Test suite analysis
- `Playbooks/vscode-extension-publishing.md` - Publishing checklist