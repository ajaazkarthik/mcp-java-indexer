# Test Suite - Quick Start Guide

> **TL;DR**: All 48+ tests are now centralized. Run `node tests/test-runner.js` to execute everything!

## 📋 What's Here

This directory contains:
- `test-runner.js` - Main test orchestrator (run all tests)
- `test-index.js` - Complete test registry and documentation
- `test-utils.js` - Helper commands and utilities
- `TEST-CASES.md` - Comprehensive test documentation

## 🚀 Getting Started

### Run All Tests
```bash
node tests/test-runner.js
```

### Run Specific Category
```bash
# Core functionality
node tests/test-runner.js --filter=core

# Performance tests
node tests/test-runner.js --filter=performance

# Storage backend tests
node tests/test-runner.js --filter=storage

# Available categories: core, features, regression, performance, 
#                      storage, integration, specialized, comprehensive, verification
```

### Debugging Options
```bash
# Verbose output
node tests/test-runner.js --verbose

# Stop on first failure
node tests/test-runner.js --bail

# Increase timeout
node tests/test-runner.js --timeout=120000

# Parallel execution
node tests/test-runner.js --parallel

# Generate JSON report
node tests/test-runner.js --json
```

### View All Tests
```bash
node tests/test-index.js
```

## 📊 Test Statistics

- **Total Test Files**: 48+
- **Total Test Cases**: 50+
- **Categories**: 9
- **Status**: ✅ All organized and ready to run

### Breakdown by Category

| Category | Files | Focus |
|----------|-------|-------|
| **Core** | 4 | Essential MCP tools |
| **Features** | 5 | Advanced capabilities |
| **Regression** | 5 | Bug fixes & edge cases |
| **Performance** | 6 | Scalability & optimization |
| **Storage** | 6 | SQLite persistence |
| **Integration** | 6 | Component interaction |
| **Specialized** | 5 | Debugging & tuning |
| **Comprehensive** | 5 | Full validation |
| **Verification** | 4 | Quick checks |

## 🔧 Integration with package.json

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test": "node tests/test-runner.js",
    "test:quick": "node simple-verify.js",
    "test:verbose": "node tests/test-runner.js --verbose",
    "test:bail": "node tests/test-runner.js --bail",
    "test:core": "node tests/test-runner.js --filter=core",
    "test:storage": "node tests/test-runner.js --filter=storage",
    "test:json": "node tests/test-runner.js --json",
    "test:list": "node tests/test-index.js"
  }
}
```

Then run tests with npm:
```bash
npm test                    # Run all tests
npm run test:quick          # Quick sanity check
npm run test:verbose        # With detailed output
npm run test:storage        # Storage backend only
```

## 📖 Test Categories Explained

### ✅ Core (4 tests)
Essential MCP tools and basic functionality

### ✅ Features (5 tests)
Advanced features like inheritance, incremental indexing, call graphs

### ✅ Regression (5 tests)
Previously found bugs, edge cases, error handling

### ✅ Performance (6 tests)
Scalability tests up to 1000+ files, memory profiling

### ✅ Storage (6 tests)
SQLite persistence, data integrity, query performance

### ✅ Integration (6 tests)
Real-world workflows, component interaction

### ✅ Specialized (5 tests)
Performance profiling, timing, bottleneck identification

### ✅ Comprehensive (5 tests)
Full feature set validation, version compatibility

### ✅ Verification (4 tests)
Quick verification, feature checks

## 📊 Test Execution Output Example

```
╔══════════════════════════════════════════════════════════════╗
║  MCP Java Indexer - Comprehensive Test Runner v1.0           ║
║  Tests: Core, Features, Performance, Integration, Storage    ║
╚══════════════════════════════════════════════════════════════╝

Found 48 tests

═══════════════════════════════════════════════════════════════
  Running Tests Sequentially
═══════════════════════════════════════════════════════════════

  ✓ test-indexing
  ✓ test-all-tools
  ✓ test-all-tools-storage
  ✓ test-advanced-tools
  ... (44 more tests)

═══════════════════════════════════════════════════════════════
  Test Summary
═══════════════════════════════════════════════════════════════

Total Tests:  48
Passed:       48
Failed:       0
Pass Rate:    100.0%
Duration:     245.32s
```

## 🔍 Common Tasks

### Run tests before committing
```bash
node tests/test-runner.js --bail
```

### Find slow tests
```bash
node tests/test-runner.js --verbose
# Sorts by execution time
```

### Generate report for CI/CD
```bash
node tests/test-runner.js --json
# Creates tests/test-report.json
```

### Debug a specific test
```bash
node test-all-tools.js
```

## ⚙️ Configuration

### Timeout
Default: 60 seconds per test
```bash
node tests/test-runner.js --timeout=120000  # 2 minutes
```

### Environment Variables

```bash
# Enable storage backend for tests
ENABLE_STORAGE=1 node tests/test-runner.js --filter=storage

# Verbose Java output
DEBUG=* node tests/test-runner.js

# Memory profiling
NODE_OPTIONS="--max-old-space-size=4096" node tests/test-runner.js
```

## 📝 Test Report

After running tests with `--json`:

```bash
cat tests/test-report.json
```

Report includes:
- Timestamp
- Overall pass rate
- Individual test results
- Execution times
- Error details

## 🐛 Troubleshooting

### Tests timeout?
```bash
node tests/test-runner.js --timeout=180000
```

### Java not found?
```bash
java -version          # Check Java 11+
echo $JAVA_HOME
```

### Out of memory?
```bash
NODE_OPTIONS="--max-old-space-size=4096" node tests/test-runner.js
```

### Single test fails?
```bash
node tests/test-runner.js --verbose --filter=core
node test-specific-name.js  # Run individual test
```

## 🚦 CI/CD Integration

### GitHub Actions
```yaml
- name: Run tests
  run: node tests/test-runner.js --json
  
- name: Upload report
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: tests/test-report.json
```

### GitLab CI
```yaml
test:
  script:
    - node tests/test-runner.js --json
  artifacts:
    reports:
      junit: tests/test-report.json
```

## 📚 Documentation

- [Detailed Test Documentation](./TEST-CASES.md)
- [Test Index with All Cases](./test-index.js) 
- [Main README](../README.md)
- [Architecture Guide](../ARCHITECTURE.md)

## 🎯 Next Steps

1. ✅ Review [TEST-CASES.md](./TEST-CASES.md) for comprehensive test list
2. ✅ Run `node tests/test-runner.js` to execute all tests
3. ✅ Check [test-index.js](./test-index.js) for complete registry
4. ✅ Add scripts from `test-utils.js` to `package.json`

## 💡 Tips

- Run `test:quick` before every commit
- Run full suite before releases
- Check `test-report.json` for performance trends
- Monitor slowest tests over time
- Update tests when adding new features

---

**Last Updated**: 2025-11-27  
**Test Files**: 48+  
**Test Cases**: 50+  
**Status**: ✅ Ready for CI/CD Integration
