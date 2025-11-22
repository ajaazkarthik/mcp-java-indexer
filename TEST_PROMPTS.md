# MCP Testing Prompts for GitHub Copilot Chat

Use these prompts in GitHub Copilot Chat to test all 7 MCP tools systematically.

## Setup
1. Open Spring PetClinic project: `D:\workspace\test-java-projects\spring-petclinic`
2. Open GitHub Copilot Chat
3. Run each test prompt below

---

## Test 1: Index Project
**Prompt:**
```
@workspace Use the java-indexer MCP server to index this entire Java project. 
Tell me how many files were indexed and how long it took.
```

**Expected:**
- Indexing starts
- Progress shown
- Reports ~47 Java files indexed
- Creates `.mcp-index/` directory
- No errors

**Verify:**
```powershell
Test-Path "D:\workspace\test-java-projects\spring-petclinic\.mcp-index"
```

---

## Test 2: Find Symbol - Class
**Prompt:**
```
@workspace Use java-indexer to find the class "PetClinicApplication". 
Show me its full package name and file location.
```

**Expected:**
- Finds: `org.springframework.samples.petclinic.PetClinicApplication`
- File: `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
- Line number provided

---

## Test 3: Find Symbol - Method
**Prompt:**
```
@workspace Use java-indexer to find all methods named "findAll" in this project. 
List each one with its class name and signature.
```

**Expected:**
- Multiple results from different repository classes
- Each result shows: Class name, method signature, file location

---

## Test 4: Find Symbol - Field
**Prompt:**
```
@workspace Use java-indexer to find all fields named "firstName" in the codebase.
```

**Expected:**
- Finds field in Owner class or similar
- Shows type, class name, location

---

## Test 5: Find Usages - Class
**Prompt:**
```
@workspace Use java-indexer to find all usages of the "Owner" class. 
Show me where it's imported, instantiated, or used as a parameter.
```

**Expected:**
- Multiple usage locations
- Includes: imports, variable declarations, method parameters, returns
- File paths and line numbers

---

## Test 6: Find Usages - Method
**Prompt:**
```
@workspace Use java-indexer to find all places where the method "save" is called 
in this project.
```

**Expected:**
- All call sites for save() method
- Shows context (calling method/class)
- File locations

---

## Test 7: Go to Definition - Class
**Prompt:**
```
@workspace Use java-indexer to show me the definition location of the 
"OwnerRepository" interface.
```

**Expected:**
- Single definition location
- Exact file path and line number
- Interface declaration details

---

## Test 8: Go to Definition - Method
**Prompt:**
```
@workspace Use java-indexer to find where the method "addVisit" is defined.
```

**Expected:**
- Definition in Pet class (or similar)
- File and line number
- Method signature

---

## Test 9: Call Graph Analysis
**Prompt:**
```
@workspace Use java-indexer to analyze the call graph for the "findPetTypes" 
method. Show me what methods it calls and what methods call it.
```

**Expected:**
- Caller methods listed
- Callee methods listed
- Call hierarchy visible

---

## Test 10: Search Text
**Prompt:**
```
@workspace Use java-indexer to search for all occurrences of "@Entity" 
annotation in the Java files.
```

**Expected:**
- All entity classes found
- File locations with context
- Line numbers

---

## Test 11: Search Text - String Pattern
**Prompt:**
```
@workspace Use java-indexer to search for the text "Spring Boot" anywhere 
in the Java comments or strings.
```

**Expected:**
- Matches in comments, strings
- File locations
- Context lines shown

---

## Test 12: Reindex File
**Steps:**
1. Open `src/main/java/org/springframework/samples/petclinic/owner/Owner.java`
2. Add a new method:
```java
public String getFullName() {
    return this.firstName + " " + this.lastName;
}
```
3. Save the file

**Prompt:**
```
@workspace Use java-indexer to reindex the Owner.java file I just modified. 
Then find the new method "getFullName" to verify it's indexed.
```

**Expected:**
- File reindexed successfully
- New method "getFullName" is found
- No full project reindex needed

---

## Test 13: Complex Search
**Prompt:**
```
@workspace Use java-indexer to:
1. Find all classes that extend "BaseEntity"
2. For each class, find how many methods it has
3. Show me the most complex class (most methods)
```

**Expected:**
- Multiple classes extending BaseEntity
- Method counts for each
- Analysis works correctly

---

## Test 14: Cross-Reference
**Prompt:**
```
@workspace Use java-indexer to:
1. Find the "Pet" class
2. Find all usages of the Pet class
3. For the main usages, show me their call graphs
```

**Expected:**
- Pet class found
- Usage locations found
- Call graph analysis works
- Results are interconnected

---

## Test 15: Error Handling - Non-Existent Symbol
**Prompt:**
```
@workspace Use java-indexer to find a class named "NonExistentClass12345".
```

**Expected:**
- Graceful response (not found)
- No crash or error
- Clear message

---

## Test 16: Performance Test
**Prompt:**
```
@workspace Use java-indexer to:
1. Find all methods containing "find" in their name
2. For each method, show where it's called
3. Time how long this takes
```

**Expected:**
- Results returned quickly (<5 seconds)
- No timeout
- Complete results

---

## Test 17: VS Code Commands

**Test each command from Command Palette (Ctrl+Shift+P):**
1. `Java Indexer: Index Project`
2. `Java Indexer: Find Symbol`
3. `Java Indexer: Find Usages`
4. `Java Indexer: Show Call Graph`

**Expected:**
- All commands available
- Execute without errors
- Provide appropriate UI feedback

---

## Test 18: Extension Output Logs

**Check Output Panel:**
1. View → Output
2. Select "Java Indexer MCP" from dropdown

**Expected:**
- Clear, readable logs
- Indexing progress shown
- No ERROR messages
- Timestamps present

---

## Test 19: Settings Verification

**Check Settings:**
1. File → Preferences → Settings
2. Search: "Java Indexer"

**Expected Settings:**
- `javaIndexer.autoIndex` (boolean, default: true)
- `javaIndexer.sourceRoots` (array)
- `javaIndexer.excludePatterns` (array)
- `javaIndexer.indexTimeout` (number)

---

## Test 20: Persistence Test

**Steps:**
1. Close VS Code completely
2. Reopen Spring PetClinic project
3. Immediately try searching for a symbol

**Prompt:**
```
@workspace Use java-indexer to find the "Owner" class. 
Did it need to reindex or was the previous index preserved?
```

**Expected:**
- Index preserved
- Instant results (no reindexing)
- Fast response

---

## Quick Validation Commands

Run these in PowerShell after testing:

```powershell
# Check index was created
Test-Path "D:\workspace\test-java-projects\spring-petclinic\.mcp-index"

# Check index size
Get-ChildItem "D:\workspace\test-java-projects\spring-petclinic\.mcp-index" -Recurse | Measure-Object -Property Length -Sum

# Check extension is still running
code --list-extensions | Select-String "java-indexer"

# Check for Java processes (indexer JAR)
Get-Process -Name "java" -ErrorAction SilentlyContinue
```

---

## Success Criteria

- ✅ All 20 tests pass
- ✅ No crashes or freezes
- ✅ Fast response times (<5s per operation)
- ✅ Accurate results
- ✅ Clear error messages
- ✅ Index persists across sessions
- ✅ Extension logs are clean

---

## If Issues Found

Document in TEST_CHECKLIST.md:
- Exact test that failed
- Error message (if any)
- Expected vs actual behavior
- Steps to reproduce
- Screenshots if relevant
