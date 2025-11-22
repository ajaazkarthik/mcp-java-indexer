# Java Indexer MCP Extension - Test Checklist

## Test Project
- **Project**: Spring PetClinic (https://github.com/spring-projects/spring-petclinic)
- **Location**: `D:\workspace\test-java-projects\spring-petclinic`
- **Java Files**: ~50-100+ classes
- **Complexity**: Real-world Spring Boot application

## Pre-Test Setup

### ✅ Extension Installation
- [x] Extension installed: `ubanishathanvenkatesan.java-indexer-mcp`
- [x] VS Code reloaded
- [x] MCP server not manually configured (extension should auto-register)
- [x] Test project opened in new window

## Phase 1: Extension Activation

### Test 1: Extension Loads
- [ ] Check VS Code Output panel for "Java Indexer MCP" channel
- [ ] Verify no errors in extension activation
- [ ] Check that extension status shows "Active"

**How to check:**
1. Open Command Palette (Ctrl+Shift+P)
2. Type "Developer: Show Running Extensions"
3. Find "Java Indexer MCP" - should show as activated

### Test 2: MCP Server Auto-Registration
- [ ] Open GitHub Copilot Chat
- [ ] Check if MCP servers are available
- [ ] Verify "java-indexer" appears in MCP server list

**Expected behavior:**
- Extension should automatically register the MCP server
- No manual configuration in `mcp.json` needed

## Phase 2: Core Functionality Tests

### Tool 1: index_project
**Purpose**: Index all Java files in the project

**Test Steps:**
1. Open Copilot Chat
2. Ask: "Use java-indexer to index this project"
3. Wait for indexing to complete

**Expected Results:**
- [ ] Indexing starts successfully
- [ ] Progress updates shown
- [ ] Completes without errors
- [ ] Reports number of files indexed
- [ ] Index stored in `.mcp-index/` directory

**Validation:**
```powershell
Test-Path "D:\workspace\test-java-projects\spring-petclinic\.mcp-index"
Get-ChildItem "D:\workspace\test-java-projects\spring-petclinic\.mcp-index" -Recurse
```

### Tool 2: find_symbol
**Purpose**: Search for classes, methods, fields by name

**Test Cases:**

#### Test 2a: Find a Class
- [ ] Ask: "Find the class PetClinicApplication"
- [ ] Should return: Package, file path, line number
- [ ] Verify the file exists at reported location

#### Test 2b: Find a Method
- [ ] Ask: "Find the method addOwner"
- [ ] Should return: Class name, method signature, location
- [ ] Multiple results if method exists in multiple classes

#### Test 2c: Find a Field
- [ ] Ask: "Find the field firstName"
- [ ] Should return: Class containing the field, type, location

**Expected Results:**
- [ ] Accurate results with file paths
- [ ] Line numbers are correct
- [ ] Handles multiple matches
- [ ] Returns empty if symbol not found

### Tool 3: find_usages
**Purpose**: Find all references to a symbol

**Test Cases:**

#### Test 3a: Find Usages of a Class
- [ ] Ask: "Find all usages of the Owner class"
- [ ] Should return: All files/lines where Owner is used
- [ ] Includes imports, instantiations, method parameters

#### Test 3b: Find Usages of a Method
- [ ] Ask: "Find all places where findAll is called"
- [ ] Should return: All call sites with context

**Expected Results:**
- [ ] Complete list of references
- [ ] Includes file path and line number
- [ ] Shows code context for each usage
- [ ] No false positives

### Tool 4: call_graph (goto_definition equivalent)
**Purpose**: Navigate to symbol definition

**Test Cases:**

#### Test 4a: Go to Class Definition
- [ ] Ask: "Show me the definition of OwnerRepository"
- [ ] Should return: Exact file and line number
- [ ] Can be opened directly

#### Test 4b: Go to Method Definition
- [ ] Ask: "Where is the method savePet defined?"
- [ ] Should return: Class, file, line number

**Expected Results:**
- [ ] Single, accurate definition location
- [ ] Works for classes, interfaces, methods
- [ ] Handles inheritance correctly

### Tool 5: search_text
**Purpose**: Full-text search across Java files

**Test Cases:**

#### Test 5a: Search for String
- [ ] Ask: "Search for 'Spring Boot' in the codebase"
- [ ] Should return: All files containing the text
- [ ] Shows matching lines with context

#### Test 5b: Search for Pattern
- [ ] Ask: "Search for '@Entity' annotation"
- [ ] Should return: All entity classes

**Expected Results:**
- [ ] Fast text search
- [ ] Accurate results with context
- [ ] Handles special characters
- [ ] Returns reasonable number of results

### Tool 6: goto_definition
**Purpose**: Navigate to definition (alternative to call_graph)

**Test Steps:**
- [ ] Ask: "Go to definition of PetType"
- [ ] Should return: File path and line number
- [ ] Definition is accurate

**Expected Results:**
- [ ] Single definition location
- [ ] Works for all symbol types
- [ ] Fast response time

### Tool 7: reindex_file
**Purpose**: Re-index a specific file after changes

**Test Steps:**
1. [ ] Modify a Java file (e.g., add a new method)
2. [ ] Ask: "Reindex the file Owner.java"
3. [ ] Ask: "Find the new method I just added"

**Expected Results:**
- [ ] File reindexed successfully
- [ ] New symbols immediately searchable
- [ ] No need to reindex entire project

## Phase 3: Performance Tests

### Test 8: Large Project Handling
- [ ] Indexing completes in reasonable time (<5 minutes)
- [ ] Memory usage stays under 1GB
- [ ] No crashes or freezes during indexing

### Test 9: Search Performance
- [ ] Searches return results in <2 seconds
- [ ] No lag when searching large codebase
- [ ] Multiple searches don't slow down

### Test 10: File Watching
- [ ] Create a new Java file
- [ ] Verify it's automatically indexed (if auto-index enabled)
- [ ] Modify an existing file
- [ ] Verify index updates automatically

## Phase 4: Error Handling

### Test 11: Invalid Inputs
- [ ] Search for non-existent symbol - should return empty gracefully
- [ ] Index empty directory - should handle gracefully
- [ ] Invalid file path - should show clear error message

### Test 12: JAR Execution
- [ ] Check that `java-indexer-1.0.0.jar` is being used
- [ ] Verify JAR is found at correct path
- [ ] Check logs for JAR execution errors

**Validation:**
Look for log entries containing:
- Path to JAR file
- Java process started
- No "JAR not found" errors

### Test 13: Edge Cases
- [ ] Test with no Java files in workspace
- [ ] Test with very large files (>10000 lines)
- [ ] Test with syntax errors in Java files
- [ ] Test with non-standard package structures

## Phase 5: Integration Tests

### Test 14: VS Code Commands
- [ ] Open Command Palette
- [ ] Run: "Java Indexer: Index Project"
- [ ] Run: "Java Indexer: Find Symbol"
- [ ] Run: "Java Indexer: Find Usages"
- [ ] Run: "Java Indexer: Show Call Graph"

**Expected Results:**
- [ ] All commands are registered
- [ ] Commands execute without errors
- [ ] UI responses are appropriate

### Test 15: Configuration
- [ ] Open Settings: "Java Indexer"
- [ ] Verify all settings are present:
  - `javaIndexer.autoIndex`
  - `javaIndexer.sourceRoots`
  - `javaIndexer.excludePatterns`
  - `javaIndexer.indexTimeout`
- [ ] Modify settings and verify they take effect

### Test 16: Extension Logs
- [ ] Open Output panel
- [ ] Select "Java Indexer MCP" channel
- [ ] Verify logs are readable and informative
- [ ] Check for any ERROR or WARN messages

## Phase 6: Cross-Feature Tests

### Test 17: End-to-End Workflow
1. [ ] Index project
2. [ ] Find a class (e.g., Owner)
3. [ ] Find all usages of that class
4. [ ] Navigate to one usage location
5. [ ] Search for related text patterns
6. [ ] Reindex a modified file

**Expected Results:**
- [ ] Smooth workflow with no interruptions
- [ ] All tools work together cohesively
- [ ] Results are consistent across tools

### Test 18: Multiple Projects
- [ ] Open another Java project in a different window
- [ ] Verify extension works independently in both
- [ ] Indexes are kept separate

## Phase 7: Cleanup & Verification

### Test 19: Index Persistence
- [ ] Close VS Code
- [ ] Reopen project
- [ ] Verify index is preserved (no re-indexing needed)
- [ ] Searches work immediately

### Test 20: Uninstallation
- [ ] Note down extension files/directories created
- [ ] Uninstall extension
- [ ] Verify no leftover processes
- [ ] Verify .mcp-index can be cleaned up

## Test Results Summary

### ✅ Passed Tests: ___/20

### ❌ Failed Tests: ___/20

### 🔄 Skipped Tests: ___/20

## Critical Issues Found

| Issue # | Description | Severity | Tool Affected |
|---------|-------------|----------|---------------|
| 1       |             | High/Med/Low |             |

## Performance Metrics

- **Indexing Time**: _____ seconds for _____ Java files
- **Search Response Time**: _____ ms average
- **Memory Usage Peak**: _____ MB
- **Extension Load Time**: _____ seconds

## Recommendations

- [ ] Ready for cross-machine testing
- [ ] Ready for beta release
- [ ] Ready for stable release
- [ ] Needs fixes before publishing

## Notes

(Add any additional observations, bugs, or suggestions here)
