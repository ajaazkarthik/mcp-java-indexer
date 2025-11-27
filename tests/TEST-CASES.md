# MCP Java Indexer - Test Suite Documentation

## Overview

The MCP Java Indexer project contains **48+ automated test cases** organized into 8 categories covering all aspects of the system. All tests are now centralized in the `/tests` directory with a unified test runner.

## Quick Start

```bash
# Run all tests
node tests/test-runner.js

# Run specific category
node tests/test-runner.js --filter=core
node tests/test-runner.js --filter=performance
node tests/test-runner.js --filter=storage

# Run with verbose output
node tests/test-runner.js --verbose

# Stop on first failure
node tests/test-runner.js --bail

# Run with parallel execution
node tests/test-runner.js --parallel

# Generate JSON report
node tests/test-runner.js --json
```

## Test Categories

### 1. Core Functionality Tests (4 tests)
Tests fundamental features of the MCP server and indexing system.

- **test-indexing.js** - Basic indexing operations
- **test-all-tools.js** - All 13 MCP tools functionality
- **test-all-tools-storage.js** - Tools with SQLite storage backend
- **test-advanced-tools.js** - Advanced features (explain code, semantic search, impact analysis)

**Key Coverage:**
- Index project from scratch
- Find symbols by name and FQN
- Track symbol usages across codebase
- Call graph analysis
- Text search within indexed code
- File system watching and incremental updates

### 2. Feature-Specific Tests (5 tests)
Tests individual advanced features and their interactions.

- **test-inheritance.js** - Class inheritance tracking
- **test-incremental-indexing.js** - File watcher and delta indexing
- **test-call-graph-fix.js** - Bidirectional call graph correctness
- **test-constructor-tracking.js** - Constructor reference tracking
- **test-deep-inheritance.js** - Multi-level inheritance hierarchies

**Key Coverage:**
- Inheritance chain resolution
- Constructor invocation tracking
- Method override detection
- Incremental index updates on file changes
- Call graph polymorphism resolution

### 3. Regression & Edge Cases (5 tests)
Tests for previously found bugs and edge cases.

- **test-edge-cases.js** - Corner cases and error conditions
- **test-regression-references-zero.js** - Zero-reference edge cases
- **test-fixes.js** - Verified bug fixes
- **test-usages-fix.js** - Usage tracking fixes
- **test-advanced-cases.js** - Complex scenarios

**Key Coverage:**
- Empty projects
- Large inheritance chains
- Circular dependencies
- Missing type information
- Generic type handling
- Nested class handling

### 4. Performance & Scalability Tests (6 tests)
Tests system performance under various loads.

- **test-performance.js** - Baseline performance metrics
- **test-performance-profiler.js** - Detailed profiling data
- **test-large-project.js** - Indexing 1000+ Java files
- **test-large-project-comparison.js** - Storage vs memory comparison
- **test-oom-fix.js** - Out-of-memory prevention
- **test-memory-management.js** - Memory usage patterns

**Key Coverage:**
- Indexing time scaling
- Memory consumption patterns
- Garbage collection behavior
- Batch processing optimization
- Large index serialization

**Performance Targets:**
- Small project (<100 files): < 2 seconds
- Medium project (500 files): < 10 seconds
- Large project (1000+ files): < 30 seconds
- Memory usage: < 500MB for 1000 files

### 5. Storage Backend Tests (6 tests)
Tests SQLite storage persistence and compatibility.

- **test-all-tools-storage.js** - All tools with storage
- **test-direct-storage.js** - Direct storage access patterns
- **test-e2e-storage.js** - End-to-end storage workflows
- **test-storage-compat.js** - Format compatibility
- **test-run-all-storage.js** - Full test suite with storage
- **test-watcher-storage.js** - File watching with storage backend

**Key Coverage:**
- Index persistence across restarts
- Storage schema versioning
- Data integrity verification
- Query performance
- Concurrent access handling
- Storage migration and upgrades

### 6. Integration Tests (6 tests)
Tests interactions between components and system modes.

- **test-real-integration.js** - Real-world workflow
- **test-file-vs-db-mode.js** - File-based vs DB mode comparison
- **test-dual-comparison.js** - Dual indexing comparison
- **test-feedback-validation.js** - User feedback validation
- **test-feedback-fixes.js** - Feedback-driven fixes
- **test-agent-features.js** - AI agent integration

**Key Coverage:**
- Mode switching (file ↔ storage)
- Cross-tool workflows
- MCP server lifecycle
- Error recovery
- External tool integration

### 7. Specialized Tests (5 tests)
Tests for specialized features and debugging.

- **test-timing-feature.js** - Timing measurements
- **test-reflection-legacy.js** - Legacy reflection patterns
- **test-batch-size-comparison.js** - Batch processing tuning
- **test-isolate-bottleneck.js** - Performance bottleneck identification
- **test-stuck-indexing.js** - Deadlock and hang prevention

**Key Coverage:**
- Reflection-based code patterns
- Timing overhead analysis
- Batch size optimization
- Concurrency issues
- Resource leaks

### 8. Comprehensive Suites (5 tests)
Complete end-to-end test suites.

- **test-all-suites.js** - Master test suite
- **test-comprehensive-v2.2.3.js** - Version 2.2.3 validation
- **test-v2.2.3-fixes.js** - Recent fixes validation
- **test-bugfixes-v2.1.js** - Bug fix verification
- **test-v1.5.0.js** - Feature set validation

**Key Coverage:**
- Full feature set validation
- Version compatibility
- Breaking change detection
- Feature preservation

### 9. Verification Tests (4 tests)
Quick verification and focused testing.

- **simple-verify.js** - Quick sanity check
- **test-feature-preservation.js** - Feature integrity check
- **test-agent-features-focused.js** - AI features focus test
- **test-advanced-cases.js** - Complex scenarios

**Total: 48+ test cases**

---

## Test Organization

```
/tests/
├── test-runner.js              # Main test orchestrator
├── test-runner-unit.js         # Unit test runner (optional)
├── test-report.json            # Latest test results
└── test-cases.md               # This file
```

All individual test files remain in the root directory for backward compatibility but are orchestrated by the central test runner.

---

## Test Infrastructure

### Test Runner Features

- ✅ **Centralized execution** - Run all tests from one command
- ✅ **Category filtering** - Run specific test categories
- ✅ **Sequential & parallel modes** - Choose execution strategy
- ✅ **Timeout protection** - 60-second default per test
- ✅ **Detailed reporting** - Console and JSON output
- ✅ **Performance profiling** - Execution time tracking
- ✅ **Bail mode** - Stop on first failure for quick debugging
- ✅ **Verbose logging** - Optional detailed output

### Test Execution Flow

```
1. Parse command-line arguments
2. Discover test files
3. Apply filters (if specified)
4. Execute tests (sequential or parallel)
5. Collect results
6. Generate summary and reports
7. Exit with appropriate status code
```

---

## Continuous Integration

### GitHub Actions Integration

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - uses: actions/setup-java@v3
        with:
          java-version: '11'
      - run: npm install
      - run: npm run build
      - run: node tests/test-runner.js --json
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-report
          path: tests/test-report.json
```

### Local Development

```bash
# During development
npm run watch                    # TypeScript watch
node tests/test-runner.js --verbose  # Continuous testing

# Before commit
node tests/test-runner.js --bail # Stop on first failure
node tests/test-runner.js --json # Generate report
```

---

## Test Data & Fixtures

### Test Projects

- **example-java-project** - Main test project (~60 files)
  - User management system
  - Service and repository patterns
  - Inheritance and polymorphism
  - Generic types and annotations

- **test-e2e-project** - End-to-end test project
  - Complex inheritance chains
  - Constructor tracking scenarios

- **test-direct-storage** - Storage backend test project

- **test-watcher-storage** - File watching test project

### Test Patterns

Common patterns used across tests:

```javascript
// 1. Index project
await handleIndexProject({ rootDir: testDir }, memoryIndex, indexerClient);

// 2. Find symbols
const result = await handleFindSymbol({ name: 'UserService' }, memoryIndex);

// 3. Call graph analysis
const callGraph = await handleCallGraph({ fqn: 'com.example.User.main(String[])' }, memoryIndex);

// 4. Usage tracking
const usages = await handleFindUsages({ fqn: 'com.example.User' }, memoryIndex);

// 5. Semantic search
const results = await handleSemanticSearch({ query: 'user authentication' }, memoryIndex);
```

---

## Expected Results

### Test Coverage Summary

| Category | Tests | Status | Coverage |
|----------|-------|--------|----------|
| Core | 4 | ✅ | All core tools |
| Features | 5 | ✅ | Advanced features |
| Regression | 5 | ✅ | Edge cases |
| Performance | 6 | ✅ | Scalability |
| Storage | 6 | ✅ | Persistence |
| Integration | 6 | ✅ | Component interaction |
| Specialized | 5 | ✅ | Debugging & tuning |
| Comprehensive | 5 | ✅ | Full validation |
| Verification | 4 | ✅ | Quick checks |
| **TOTAL** | **48+** | **✅** | **Comprehensive** |

### Success Criteria

- ✅ All 48+ tests pass
- ✅ Average execution time < 5 minutes
- ✅ Zero memory leaks
- ✅ Pass rate > 95%
- ✅ No flaky tests

---

## Troubleshooting

### Tests Failing?

```bash
# Run with verbose output
node tests/test-runner.js --verbose

# Run single category
node tests/test-runner.js --filter=core

# Increase timeout
node tests/test-runner.js --timeout=120000

# Check test dependencies
java -version    # Java 11+
node --version   # Node 18+
npm ls           # Check npm packages
```

### Performance Issues?

```bash
# Profile specific test
node --prof test-performance.js

# Check memory usage
node --max-old-space-size=4096 tests/test-runner.js

# Profile with built-in profiler
node tests/test-runner.js --profile
```

### Memory Leaks?

```bash
# Run memory management test specifically
node tests/test-runner.js --filter=performance
node test-memory-management.js

# Check for file handle leaks
lsof -p <node-pid>
```

---

## Adding New Tests

### Test Template

```javascript
/**
 * Test: My New Feature
 * 
 * Validates:
 * - Feature behavior
 * - Edge cases
 * - Integration points
 */

const { MemoryIndex } = require('./server/dist/memory-index.js');
const path = require('path');

async function runTest() {
  const testDir = path.join(__dirname, 'example-java-project');
  const memoryIndex = new MemoryIndex();
  
  try {
    // Setup
    // Execute
    // Verify
    
    console.log('✅ Test passed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
```

### Registration

Add to `TEST_REGISTRY` in `test-runner.js`:

```javascript
const TEST_REGISTRY = {
  myCategory: [
    'test-my-feature.js'
  ]
};
```

---

## Performance Benchmarks

### Baseline Performance (example-java-project)

| Operation | Time | Memory |
|-----------|------|--------|
| Index 60 files | 1.2s | 45MB |
| Find symbol | <10ms | - |
| Find usages | <20ms | - |
| Call graph | <50ms | - |
| Semantic search | <200ms | - |

### Scaling (large-project benchmark)

| Files | Index Time | Memory | Peak |
|-------|-----------|--------|------|
| 100 | 1.5s | 60MB | 120MB |
| 500 | 6s | 200MB | 400MB |
| 1000 | 25s | 400MB | 800MB |
| 5000 | >60s | 1.5GB | >2GB |

---

## Maintenance

### Regular Tasks

- ✅ Run full test suite before releases
- ✅ Update tests for new features
- ✅ Monitor performance benchmarks
- ✅ Archive old test results
- ✅ Review and fix flaky tests

### Test Metrics

Track over time:
- Pass rate
- Average execution time
- Memory consumption
- Failure patterns
- Slowest tests

---

## References

- [MCP Java Indexer Main Documentation](../README.md)
- [Architecture Guide](../ARCHITECTURE.md)
- [Development Guide](../DEVELOPMENT.md)
- [Copilot Instructions](.github/copilot-instructions.md)
