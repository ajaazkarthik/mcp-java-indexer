# Phase 1 Testing Guide - Quick Start

## What You Have Now

✅ **Extension Installed**: `ubanishathanvenkatesan.java-indexer-mcp@1.0.0`
✅ **Test Project Ready**: Spring PetClinic (47 Java classes)
✅ **All Build Artifacts**: JAR (6 MB), MCP Server, Extension compiled
✅ **Zero Config**: Extension auto-registers, no manual setup needed

## Testing Location

📁 **Extension Code**: `D:\workspace\repo\github-playground\mcp-java-indexer\`
📁 **Test Project**: `D:\workspace\test-java-projects\spring-petclinic\`
📁 **Test Files**: 
   - `TEST_CHECKLIST.md` - Comprehensive 20-test checklist
   - `TEST_PROMPTS.md` - Copy-paste prompts for Copilot Chat
   - `validate-extension.ps1` - Status validation script

## Quick Start (5 Minutes)

### Step 1: Verify Extension (30 seconds)
```powershell
cd "D:\workspace\repo\github-playground\mcp-java-indexer"
.\validate-extension.ps1
```
Expected: All checks pass ✅

### Step 2: Open Test Project (30 seconds)
VS Code should already have opened: `D:\workspace\test-java-projects\spring-petclinic`

If not:
```powershell
code -n "D:\workspace\test-java-projects\spring-petclinic"
```

### Step 3: Verify Extension Activated (1 minute)
1. Press `Ctrl+Shift+P`
2. Type: `Developer: Show Running Extensions`
3. Find: `Java Indexer MCP` - should show **Activated**

### Step 4: Quick Smoke Test (2 minutes)
Open GitHub Copilot Chat and try:

```
@workspace Use java-indexer to index this project
```

Expected output:
- "Indexing started..."
- Progress updates
- "Indexed ~47 Java files"
- No errors

### Step 5: Test a Few Tools (2 minutes)
```
@workspace Use java-indexer to find the class "Owner"
```

```
@workspace Use java-indexer to find all usages of the Owner class
```

If these work → ✅ **Extension is working!**

## Full Testing (30-60 Minutes)

### Option A: Systematic Testing
Follow `TEST_CHECKLIST.md` - all 20 tests with detailed validation

### Option B: Guided Testing
Use `TEST_PROMPTS.md` - copy-paste each prompt into Copilot Chat

### Option C: Exploratory Testing
Play around freely, try edge cases, break things!

## What to Look For

### ✅ Good Signs
- Indexing completes without errors
- Search results are accurate
- Fast response times (<5 seconds)
- Extension logs show no errors
- VS Code doesn't freeze or crash
- Index persists after closing/reopening

### ❌ Red Flags
- Indexing hangs or crashes
- "JAR not found" errors
- Search returns wrong results
- Extension doesn't activate
- High memory usage (>1GB)
- Slowness or lag

## Common Issues & Fixes

### Issue: Extension not showing in MCP servers
**Fix**: 
1. Reload VS Code window (Ctrl+Shift+P → "Reload Window")
2. Check Output panel for activation errors
3. Verify extension is enabled in Extensions panel

### Issue: "JAR not found" error
**Fix**: Check JAR exists:
```powershell
Test-Path "D:\workspace\repo\github-playground\mcp-java-indexer\java-indexer\target\java-indexer-1.0.0.jar"
```

### Issue: Indexing fails
**Fix**: 
1. Check Java is installed: `java -version`
2. Check extension logs (Output → Java Indexer MCP)
3. Try manual command: `Java Indexer: Index Project`

### Issue: Can't find MCP tools in Copilot
**Fix**: 
1. Make sure Copilot Chat is open (not inline chat)
2. Use `@workspace` prefix
3. Explicitly mention "java-indexer" or "Use java-indexer to..."

## Testing on Another Computer

### Method 1: Copy VSIX File
1. Copy `java-indexer-mcp-1.0.0.vsix` (13 MB) to other computer
2. Install: `code --install-extension java-indexer-mcp-1.0.0.vsix`
3. Clone test project or use any Java project
4. Test following the same steps

### Method 2: Share via Cloud
```powershell
# Option A: OneDrive
Copy-Item "java-indexer-mcp-1.0.0.vsix" "$env:OneDrive\Extensions\"

# Option B: Google Drive (if mapped)
Copy-Item "java-indexer-mcp-1.0.0.vsix" "G:\My Drive\Extensions\"
```

## Test Project Details

**Spring PetClinic** is perfect because it:
- ✅ Has 47 Java classes (good size for testing)
- ✅ Uses Spring Boot (real-world framework)
- ✅ Has inheritance, interfaces, annotations
- ✅ Multiple packages and layers
- ✅ Well-structured code
- ✅ Active, maintained project

**Key classes to test:**
- `PetClinicApplication` - Main class
- `Owner`, `Pet`, `Vet` - Domain entities
- `OwnerRepository`, `PetRepository` - Interfaces
- `OwnerController` - REST controller

## After Testing

### If All Tests Pass ✅
1. ✅ Fill out results in `TEST_CHECKLIST.md`
2. ✅ Copy VSIX to another computer for Phase 2
3. ✅ Consider adding an icon before publishing
4. ✅ Prepare for beta/pre-release publish

### If Tests Fail ❌
1. Document issues in `TEST_CHECKLIST.md`
2. Note severity: Critical/High/Medium/Low
3. Create GitHub issues for tracking
4. Fix issues before cross-machine testing
5. Re-test after fixes

## Publishing Decision Tree

```
All 20 tests pass? 
├─ Yes → Test on another computer (Phase 2)
│         ├─ Other computer works? 
│         │   ├─ Yes → Ready for beta release
│         │   └─ No → Fix cross-platform issues
│         └─ 
└─ No → Fix failing tests, re-test
```

## Next Steps After Phase 1

1. **Phase 1 Complete** (Local Testing) ✅
   ↓
2. **Phase 2**: Cross-machine testing
   - Copy VSIX to another computer
   - Test on different OS if possible
   - Verify on fresh VS Code install
   ↓
3. **Phase 3**: Beta Release
   - Publish as pre-release: `vsce publish --no-dependencies --pre-release`
   - Share with 2-3 beta testers
   - Gather feedback
   ↓
4. **Phase 4**: Stable Release
   - Add icon (optional but recommended)
   - Update version to 1.0.0
   - Publish stable: `vsce publish --no-dependencies`
   - Announce on GitHub, Twitter, etc.

## Time Estimates

- ⚡ **Quick Smoke Test**: 5 minutes
- 🔍 **Basic Testing** (10 tests): 15 minutes
- ✅ **Full Testing** (all 20): 30-60 minutes
- 🖥️ **Cross-Machine Test**: 20 minutes
- 📦 **Beta Release Prep**: 30 minutes

## Need Help?

- 📖 **Full checklist**: See `TEST_CHECKLIST.md`
- 💬 **Test prompts**: See `TEST_PROMPTS.md`
- 🔍 **Status check**: Run `.\validate-extension.ps1`
- 📝 **Extension logs**: Output → Java Indexer MCP
- 🐛 **Issues**: Check VS Code Developer Tools (Help → Toggle Developer Tools)

---

## Ready to Start Testing?

1. ✅ Extension installed and activated
2. ✅ Test project open in VS Code
3. ✅ Copilot Chat ready
4. ✅ Test documents available

**→ Open `TEST_PROMPTS.md` and start with Test 1!**
