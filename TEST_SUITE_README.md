# Test Suite Documentation

This project includes comprehensive test suites to ensure all features are preserved during optimization and refactoring.

## Test Suites

### 1. Feature Preservation Tests (`test-feature-preservation.js`)
**Purpose:** Prevent accidental feature removal during performance optimization  
**Tests:** 26 critical feature tests  
**Run:** `npm run test:features`

#### Features Tested:

##### Enum Features (3 tests)
- ✅ Enum symbols extraction
- ✅ Enum constants extraction (ACTIVE, INACTIVE, PENDING)
- ✅ Enum method extraction

##### Modifier Extraction (8 tests)
- ✅ `public` modifier
- ✅ `private` modifier
- ✅ `protected` modifier
- ✅ `static` modifier
- ✅ `final` modifier
- ✅ `volatile` modifier
- ✅ `synchronized` modifier
- ✅ `abstract` modifier

##### Signature Extraction (4 tests)
- ✅ Method signatures (return type + parameters)
- ✅ Field signatures (type + name)
- ✅ Constructor signatures
- ✅ Multiple constructor overloads

##### Symbol Extraction (6 tests)
- ✅ Class symbols
- ✅ Interface symbols
- ✅ Enum symbols
- ✅ Method symbols
- ✅ Field symbols
- ✅ Constructor symbols

##### Advanced Features (5 tests)
- ✅ Inheritance tracking (extends)
- ✅ Inheritance tracking (implements)
- ✅ Call graph generation
- ✅ Reference tracking
- ✅ Incremental indexing
- ✅ Override method detection

### 2. Large Project Tests (`test-large-project.js`)
**Purpose:** Validate performance and functionality on large codebases  
**Project Size:** 12,086+ Java files  
**Tests:** 15 comprehensive integration tests  
**Run:** `npm run test:large`

#### Tests Included:
1. ✅ Index project (12k+ files)
2. ✅ Find symbol - Component class lookup
3. ✅ Goto definition - Component source mapping
4. ✅ Goto definition - MegaApplication mapping
5. ✅ Find usages - Package service references
6. ✅ Call graph - Service streamMetrics
7. ✅ Search text - Telemetry keyword sweep
8. ✅ Reindex file - Component005_010 incremental
9. ✅ Analyze impact - MegaApplication fan-out
10. ✅ Semantic search - Aggregator services
11. ✅ Semantic search - Component topology intent
12. ✅ Explain code - PackageService deep dive
13. ✅ Test coverage - PackageService005
14. ✅ Refactoring suggestions - PackageService005
15. ✅ Code generation - Telemetry builder scaffold

## Running Tests

### Run All Tests
```bash
npm run test:all
```

### Run Feature Tests Only
```bash
npm run test:features
```

### Run Large Project Tests Only
```bash
npm run test:large
```

### Run Individual Test File
```bash
node test-feature-preservation.js
node test-large-project.js
```

## Test Results Format

### Feature Preservation Tests
```
Feature Preservation Test Suite
======================================================================

[1] Setup - Index test project
  ✓ PASS (1089ms)

[2] CRITICAL: Enum constants are extracted
  ✓ PASS (14ms)

...

Total Tests: 26
Passed: 26
Failed: 0
Pass Rate: 100.0%

✅ ALL FEATURES PRESERVED!
```

### Large Project Tests
```
Large Project MCP Test Suite
======================================================================

[1] index_project - Large synthetic Maven project
  ✓ PASS (52762ms)

...

Total Tests: 15
Passed: 15
Failed: 0
Pass Rate: 100.0%
```

## Understanding Test Failures

### Critical Feature Failure
If a feature preservation test fails with message like:
```
❌ FEATURE REMOVED: Enum constant ACTIVE not found - enum constants extraction is broken!
```

**Action Required:**
1. **DO NOT IGNORE** - This indicates a critical feature was removed
2. Check recent code changes in `ParserService.java` or related files
3. Restore the feature immediately
4. Re-run tests to verify restoration

### Common Failure Scenarios

#### Enum Constants Missing
**Symptom:** Test "Enum constants are extracted" fails  
**Cause:** Enum constant extraction loop was commented out or removed  
**Fix:** Restore enum constant extraction in `extractEnumSymbol()` method

#### Modifiers Missing
**Symptom:** Modifier tests (public, private, etc.) fail  
**Cause:** Modifier extraction was replaced with empty list  
**Fix:** Restore `.stream().map().collect()` pattern for modifiers

#### Signatures Missing
**Symptom:** Signature tests fail  
**Cause:** Signature building was replaced with empty string  
**Fix:** Restore signature construction logic

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Feature Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - uses: actions/setup-java@v2
        with:
          java-version: '11'
      - run: npm install
      - run: npm run compile
      - run: npm run test:features
      - run: npm run test:large
```

## Test Development Guidelines

### Adding New Feature Tests

When adding a new feature to the indexer:

1. **Create Test Case**
   ```javascript
   await this.runTest('CRITICAL: New feature works', async () => {
     const result = await this.callTool('tool_name', { args });
     const text = result.content[0]?.text || '';
     
     if (!text.includes('expected_output')) {
       throw new Error('❌ FEATURE REMOVED: Feature description');
     }
   });
   ```

2. **Add to Feature List**
   - Update this README with the new test
   - Document what the test validates
   - Include expected behavior

3. **Run Before Commit**
   ```bash
   npm run test:all
   ```

### Test Naming Convention

- Use `CRITICAL:` prefix for features that must never be removed
- Use descriptive names: "Enum constants are extracted" not "Test 1"
- Include what's being tested in the name

### Assertion Patterns

**Good:**
```javascript
if (!text.includes('ACTIVE') && !text.includes('Status')) {
  throw new Error('❌ FEATURE REMOVED: Enum constant not found');
}
```

**Bad:**
```javascript
if (!text) {
  throw new Error('Failed');
}
```

## Performance Benchmarks

### Feature Test Suite
- **Expected Time:** 1-2 seconds
- **Setup Time:** ~1 second (project creation + indexing)
- **Per Test:** 1-50ms

### Large Project Test Suite
- **Expected Time:** 52-72 seconds
- **Indexing:** 48-55 seconds
- **Remaining Tests:** 4-17 seconds

### Performance Regression Detection

If indexing time increases by >20% from baseline (72s), investigate:
1. Check if features were unintentionally restored incorrectly
2. Review recent changes to batching logic
3. Verify TypeSolver is still disabled
4. Check for added complexity in AST traversal

## Troubleshooting

### Test Timeout
**Error:** `Request timeout after 60s`  
**Solution:** Increase timeout in test file or check for infinite loops

### Server Not Starting
**Error:** `Server failed to start`  
**Solution:** 
- Verify Java JAR is built: `mvn clean package`
- Verify TypeScript is compiled: `npm run compile`
- Check for port conflicts

### Index Directory Lock
**Error:** `Cannot delete .mcp-index`  
**Solution:** Close VS Code, delete manually, restart tests

### False Positives
If tests pass but features are missing:
- Verify test assertions are strict enough
- Check test is using correct FQN
- Ensure test project has required code patterns

## Maintenance

### Regular Test Review
- **Monthly:** Review test coverage for new features
- **Before Release:** Run full test suite 3 times
- **After Optimization:** Always run feature tests

### Test Updates Required When:
- Adding new indexer tools
- Changing symbol extraction logic
- Modifying data structures
- Updating JavaParser version

## Success Criteria

### Feature Tests
- ✅ All 26 tests must pass
- ✅ 100% pass rate required
- ✅ No "FEATURE REMOVED" errors

### Large Project Tests
- ✅ All 15 tests must pass
- ✅ Indexing completes in <90 seconds
- ✅ All tools return valid results

## Support

If tests fail unexpectedly:
1. Check recent commits for changes
2. Review PERFORMANCE_OPTIMIZATION_REPORT.md
3. Run tests individually to isolate issue
4. Check server logs for errors

## Version History

### v1.5.1
- Initial test suite creation
- 26 feature preservation tests
- 15 large project integration tests
- Performance baseline: 52-55s for 12k files

---

**Remember:** These tests exist to prevent accidental feature removal during optimization. If a test fails, restore the feature—don't modify the test to pass!
