# Manual Test Guide for v1.5.0

This guide provides step-by-step manual testing instructions to validate the v1.5.0 improvements.

## Prerequisites

1. **Build the project**:
   ```powershell
   .\build.ps1
   ```

2. **Ensure test project exists**:
   - `example-java-project/src/` should contain sample Java files
   - If not, any Java project can be used for testing

3. **Configure MCP server** in VS Code (if testing through Copilot):
   - Add to `%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json`

---

## Test Suite 1: Symbol Resolution (Critical)

### Test 1.1: Simple Class Name Resolution
**Before v1.5.0**: ❌ Symbol not found  
**After v1.5.0**: ✅ Should resolve automatically

**Steps**:
1. Index a project:
   ```
   @java-indexer index_project with rootDir: "d:/path/to/java/project"
   ```

2. Try to find usages with simple name:
   ```
   @java-indexer find_usages with fqn: "UserService"
   ```

**Expected Result**:
- ✅ Should show: "Resolved to: com.example.service.UserService" or similar
- ✅ Should list usages or say "No usages found" with explanation
- ❌ Should NOT say "Symbol not found" unless class truly doesn't exist

**Pass Criteria**: Tool resolves simple name automatically

---

### Test 1.2: Partial Name Matching
**Steps**:
1. Search with partial name:
   ```
   @java-indexer find_symbol with name: "User"
   ```

**Expected Result**:
- ✅ Should find: UserService, UserRepository, UserDTO, User class, etc.
- ✅ Should list multiple matches with locations
- ✅ Each result should show file and line number

**Pass Criteria**: Multiple relevant matches found

---

### Test 1.3: Method Without Parameters
**Before v1.5.0**: ❌ Requires exact signature like `save(User, String, Integer)`  
**After v1.5.0**: ✅ Works with just `save`

**Steps**:
1. Try call graph with simple method name:
   ```
   @java-indexer call_graph with fqn: "UserService.save"
   ```

**Expected Result**:
- ✅ Should resolve to correct method even without parameters
- ✅ Should show inbound/outbound calls
- ✅ If multiple `save` methods exist, should pick best match or show alternatives

**Pass Criteria**: Method resolved without exact parameter types

---

### Test 1.4: Case-Insensitive Search
**Steps**:
1. Search with wrong case:
   ```
   @java-indexer find_symbol with name: "userservice"
   ```

**Expected Result**:
- ✅ Should find "UserService" class
- ✅ Should mention "Case-insensitive match" in confidence reasoning

**Pass Criteria**: Finds symbols regardless of case

---

### Test 1.5: Ambiguous Match Handling
**Steps**:
1. Use very generic term:
   ```
   @java-indexer find_usages with fqn: "Service"
   ```

**Expected Result**:
- ✅ Should show message like "⚠️ Ambiguous match. Using: com.example.UserService"
- ✅ Should list 3-5 alternatives: "Other possibilities: 1. OrderService, 2. PaymentService..."
- ✅ Should still proceed with best match

**Pass Criteria**: Provides alternatives for ambiguous queries

---

## Test Suite 2: Semantic Search (Critical)

### Test 2.1: Hibernate Pattern Detection
**Before v1.5.0**: ❌ Returns random factory methods  
**After v1.5.0**: ✅ Returns Hibernate-specific code

**Steps**:
1. Search for Hibernate session creation:
   ```
   @java-indexer semantic_search with query: "methods that create Hibernate sessions"
   ```

**Expected Result**:
- ✅ Top results should include:
  - Methods with "session" in name
  - Methods returning SessionFactory
  - Methods with Hibernate in package/imports
- ✅ Should show "Relevance Score: XX%" for each result
- ✅ Should say "Framework Detected: Hibernate" in header
- ❌ Should NOT return unrelated web service or factory methods

**Pass Criteria**: >80% of top 5 results are Hibernate-related

---

### Test 2.2: Spring Repository Pattern
**Steps**:
1. Search for Spring repositories:
   ```
   @java-indexer semantic_search with query: "Spring repository save methods"
   ```

**Expected Result**:
- ✅ Should find methods in classes ending with "Repository"
- ✅ Should find methods with @Repository annotation
- ✅ Should prioritize methods named "save", "persist", "insert"
- ✅ Should show "Framework Detected: Spring" or similar

**Pass Criteria**: Results are Spring/JPA repository methods, not random save methods

---

### Test 2.3: Intent-Based Search
**Steps**:
1. Search by operation intent:
   ```
   @java-indexer semantic_search with query: "methods that delete from database"
   ```

**Expected Result**:
- ✅ Should find methods with "delete", "remove" in name
- ✅ Should prioritize database-related classes (DAO, Repository, Service)
- ✅ Should show "Intent Detected: data deletion" or similar
- ✅ Results should have high relevance scores (>70%)

**Pass Criteria**: Understands "delete" intent and finds relevant database methods

---

### Test 2.4: Transaction Management Search
**Steps**:
1. Search for transaction code:
   ```
   @java-indexer semantic_search with query: "transaction management methods"
   ```

**Expected Result**:
- ✅ Should find methods with @Transactional annotation
- ✅ Should find methods with "transaction", "commit", "rollback" in name
- ✅ Should find methods that use TransactionManager
- ✅ Should explain "Intent Detected: transaction management"

**Pass Criteria**: Finds actual transaction-handling code

---

### Test 2.5: Empty Results Guidance
**Steps**:
1. Search for nonsense:
   ```
   @java-indexer semantic_search with query: "xyzabc123nonexistent"
   ```

**Expected Result**:
- ✅ Should say "No relevant results found"
- ✅ Should provide **Tips** section with suggestions like:
  - "Try more general terms"
  - "Use technology names (Hibernate, Spring)"
  - "Describe behavior (save, find, delete)"
- ❌ Should NOT just say "No results" with no guidance

**Pass Criteria**: Helpful guidance provided when no matches

---

## Test Suite 3: Framework Detection

### Test 3.1: Spring Annotation Detection
**Steps**:
1. Index project with Spring code
2. Search for annotations:
   ```
   @java-indexer search_text with pattern: "@Autowired", isRegex: false
   ```

**Expected Result**:
- ✅ Should find @Autowired usages
- ✅ Should show file locations

**Pass Criteria**: Annotations are indexed and searchable

---

### Test 3.2: Improved Dependency Detection
**Before v1.5.0**: Misses autowired field dependencies  
**After v1.5.0**: Should detect more dependencies

**Steps**:
1. Find a Spring service/repository class
2. Run impact analysis:
   ```
   @java-indexer analyze_impact with symbolFqn: "UserRepository"
   ```

**Expected Result**:
- ✅ Should show dependencies from classes that autowire it
- ✅ Direct Usages count should be > 0 if class is used
- ✅ Should explain what "0 references" means (if applicable):
  - "Could mean: unused, framework-mediated, reflection, tests, external"

**Pass Criteria**: More dependencies detected than v1.4.x (hard to verify without baseline)

---

### Test 3.3: Zero References Explanation
**Steps**:
1. Find an interface or abstract class
2. Check usages:
   ```
   @java-indexer find_usages with fqn: "SomeInterface"
   ```

**Expected Result** (if 0 usages found):
- ✅ Should say "No usages found for: SomeInterface"
- ✅ Should explain: "This could mean:"
  - "The symbol is defined but never used"
  - "It's called through reflection or frameworks"
  - "It's used in non-indexed files (e.g., tests, external dependencies)"

**Pass Criteria**: Provides context for "0 references" instead of bare message

---

## Test Suite 4: Tool Integration

### Test 4.1: find_usages with Simple Names
**Steps**:
1. Use simple class name:
   ```
   @java-indexer find_usages with fqn: "String"
   ```

**Expected Result**:
- ✅ Should work (might say "no usages" for JDK classes)
- ❌ Should NOT give "Symbol not found" error

**Pass Criteria**: Accepts simple names without FQN

---

### Test 4.2: call_graph with Simple Names
**Steps**:
1. Use simple method reference:
   ```
   @java-indexer call_graph with fqn: "UserService.save"
   ```

**Expected Result**:
- ✅ Should show call graph (inbound/outbound calls)
- ✅ Should resolve automatically or show alternatives
- ❌ Should NOT require exact parameter types

**Pass Criteria**: Call graph works with simple method names

---

### Test 4.3: Error Messages Are Helpful
**Steps**:
1. Try to find non-existent symbol:
   ```
   @java-indexer find_usages with fqn: "CompletelyFakeClassXYZ"
   ```

**Expected Result**:
- ✅ Should say something like:
  - "Symbol not found: CompletelyFakeClassXYZ"
  - "Tip: Use find_symbol to search, or provide more context (e.g., package name)"
- ❌ Should NOT just say "Symbol not found" with no help

**Pass Criteria**: Error messages guide user to next steps

---

### Test 4.4: goto_definition Resolution
**Steps**:
1. Try goto with partial name:
   ```
   @java-indexer goto_definition with symbol: "User"
   ```

**Expected Result**:
- ✅ Should find definition (possibly multiple if "User" matches many classes)
- ✅ Should show file, line, column

**Pass Criteria**: Works with fuzzy matching

---

## Test Suite 5: Regression Tests

### Test 5.1: Indexing Still Works
**Steps**:
1. Index a real Java project:
   ```
   @java-indexer index_project with rootDir: "d:/your/java/project"
   ```

**Expected Result**:
- ✅ Should complete without errors
- ✅ Should report: "Indexed X files, extracted Y symbols"
- ✅ Should persist index to `.mcp-index/` directory

**Pass Criteria**: Indexing completes successfully

---

### Test 5.2: Text Search Still Works
**Steps**:
1. Search for common keyword:
   ```
   @java-indexer search_text with pattern: "public class", isRegex: false
   ```

**Expected Result**:
- ✅ Should find multiple matches
- ✅ Should show file locations and line numbers

**Pass Criteria**: Text search unchanged from v1.4.x

---

### Test 5.3: Basic find_symbol Works
**Steps**:
1. Search for a known class:
   ```
   @java-indexer find_symbol with name: "ArrayList"
   ```

**Expected Result**:
- ✅ Should find symbol (might be in JDK or project)
- ✅ Should show location

**Pass Criteria**: Basic functionality preserved

---

## Success Criteria Summary

### Critical (Must Pass)
- ✅ Symbol resolution works with simple names (Tests 1.1, 4.1, 4.2)
- ✅ Semantic search returns relevant results >80% (Tests 2.1, 2.2, 2.3)
- ✅ Error messages are helpful (Tests 4.3, 3.3)
- ✅ Indexing still works (Test 5.1)

### Important (Should Pass)
- ✅ Partial name matching (Test 1.2)
- ✅ Method resolution without params (Test 1.3)
- ✅ Framework detection (Tests 2.1, 2.2, 3.1)
- ✅ Ambiguous match handling (Test 1.5)

### Nice to Have (May Pass)
- ✅ Case-insensitive search (Test 1.4)
- ✅ Zero references explanation (Test 3.3)
- ✅ Semantic search guidance (Test 2.5)

---

## Rating the Results

**Pass Rate Calculation**:
- Count passed tests / total tests
- **>90%**: 🎉 Excellent! Production ready
- **75-89%**: ⚠️ Good, minor issues
- **50-74%**: ⚠️ Needs work
- **<50%**: ❌ Critical issues

**Expected v1.5.0 Performance**:
- Symbol Resolution: 5/5 tests (100%)
- Semantic Search: 5/5 tests (100%)
- Framework Detection: 3/3 tests (100%)
- Tool Integration: 4/4 tests (100%)
- Regression: 3/3 tests (100%)

**Total Expected**: 20/20 (100%) - All critical features working

---

## Reporting Issues

If any test fails, record:
1. **Test Name**: Which test failed
2. **Expected**: What should happen
3. **Actual**: What actually happened
4. **Environment**: JDK version, project size, frameworks used

Example:
```
Test: 2.1 Hibernate Pattern Detection
Expected: Top results should be Hibernate-related
Actual: Returned random factory methods (ObjectFactory.createWebService)
Environment: JDK 11, 5000 files, Spring Boot 2.7 + Hibernate 5.6
```

---

## Quick Smoke Test (5 minutes)

If you only have 5 minutes, run these critical tests:

1. **Index a project**: `index_project`
2. **Simple name resolution**: `find_usages with fqn: "YourClassName"`
3. **Semantic search**: `semantic_search with query: "Hibernate session methods"`
4. **Check error message**: `find_usages with fqn: "NonExistent"`

If all 4 work correctly, v1.5.0 is good to go! ✅
