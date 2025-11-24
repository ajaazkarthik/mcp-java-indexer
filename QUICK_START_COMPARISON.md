# Quick Start: Side-by-Side Comparison

## 🚀 Setup in 5 Minutes

### Step 1: Update MCP Configuration (2 min)

1. **Copy the example config**:
   ```powershell
   # Open the example
   notepad mcp-config-example.json
   ```

2. **Update the path** in `mcp-config-example.json`:
   ```json
   "args": ["D:\\workspace\\repo\\github-playground\\mcp-java-indexer\\server\\dist\\index.js"]
   ```
   Change `D:\\workspace\\repo\\github-playground\\` to your actual path.

3. **Copy to VS Code MCP settings**:
   ```powershell
   # Windows
   $mcpPath = "$env:APPDATA\Code\User\globalStorage\github.copilot-chat"
   Copy-Item mcp-config-example.json "$mcpPath\mcp.json" -Force
   ```

### Step 2: Restart VS Code (1 min)

1. Close VS Code completely
2. Reopen VS Code
3. Open GitHub Copilot Chat

### Step 3: Verify Both Running (1 min)

In Copilot Chat, type:
```
@java-indexer-memory help
```
Should respond with available tools.

Then type:
```
@java-indexer-storage help
```
Should also respond.

✅ **Both working? You're ready!**

### Step 4: Start Monitoring (1 min)

Open PowerShell in the project directory:
```powershell
.\monitor-comparison.ps1
```

This will show live memory usage and comparison stats.

---

## 🎯 Quick Tests

### Test 1: Index Small Project (2 min)

**In-Memory:**
```
@java-indexer-memory index_project with rootDir: "D:/path/to/example-java-project"
```

**Storage:**
```
@java-indexer-storage index_project with rootDir: "D:/path/to/example-java-project"
```

**Expected**: Both finish in ~2-3 seconds. Memory monitor shows similar RAM usage.

---

### Test 2: Index Large Project (5 min)

**In-Memory:**
```
@java-indexer-memory index_project with rootDir: "D:/path/to/large-java-project"
```

**Storage:**
```
@java-indexer-storage index_project with rootDir: "D:/path/to/large-java-project"
```

**Expected**: 
- Both finish in ~90 seconds
- Memory monitor shows HUGE difference:
  - In-Memory: 2-4 GB
  - Storage: ~136 MB (93% less!)

---

### Test 3: Find Symbol (30 sec)

**In-Memory:**
```
@java-indexer-memory find_symbol with name: "UserService"
```

**Storage:**
```
@java-indexer-storage find_symbol with name: "UserService"
```

**Expected**: Identical results, similar speed (<1ms cached)

---

### Test 4: Find Usages (30 sec)

**In-Memory:**
```
@java-indexer-memory find_usages with fqn: "com.example.UserService"
```

**Storage:**
```
@java-indexer-storage find_usages with fqn: "com.example.UserService"
```

**Expected**: Identical results list

---

### Test 5: Call Graph (30 sec)

**In-Memory:**
```
@java-indexer-memory call_graph with fqn: "com.example.UserService.getUser"
```

**Storage:**
```
@java-indexer-storage call_graph with fqn: "com.example.UserService.getUser"
```

**Expected**: Same call graph structure

---

## 📊 What to Look For

### ✅ Good Signs
- Both servers respond
- Results are identical
- Storage uses way less memory on large projects
- No crashes or errors
- Monitor shows stable memory

### ⚠️ Warning Signs
- Different results between versions
- Errors in one but not the other
- Memory leaks (constantly increasing)
- Crashes or hangs

### 🐛 Bug Indicators
- Results don't match
- One version crashes
- Memory usage anomalies
- Incorrect symbol counts
- Missing references

---

## 📝 Recording Results

### Use the Bug Tracker

When you find something wrong:

1. **Open**: `BUG_TRACKING_TEMPLATE.md`
2. **Copy** a bug report section
3. **Fill in** the details
4. **Save** to a new file: `BUG_REPORT_001.md`

### Use the Monitor Log

The monitor saves logs automatically:
```
comparison-log-20251125-143022.txt
```

Check this file for historical memory usage.

---

## 🎨 Visual Comparison

### Memory Usage Graph (Manual)

Create a simple comparison:

```powershell
# Check memory before indexing
Get-Process node | Where-Object {$_.WorkingSet -gt 50MB}

# Index large project on BOTH
# (Use Copilot Chat commands above)

# Check memory after
Get-Process node | Where-Object {$_.WorkingSet -gt 50MB}
```

**Expected Result:**
```
Before:  node.exe #1 (memory):  ~50 MB    node.exe #2 (storage): ~50 MB
After:   node.exe #1 (memory):  ~2.5 GB   node.exe #2 (storage): ~136 MB
                                ^^^^^^^^                           ^^^^^^^^
                              TOO MUCH!                          PERFECT!
```

---

## 🔬 Advanced Testing

### Full Automated Test

Run the comprehensive comparison:
```powershell
node compare-storage-vs-memory.js
```

This generates: `COMPARISON_REPORT.md`

### Check Storage Sizes

```powershell
# In-Memory (JSON)
Get-ChildItem ".\example-java-project\.mcp-index\index.json" -ErrorAction SilentlyContinue

# Storage (SQLite)
Get-ChildItem ".\example-java-project\.mcp-index\index.db" -ErrorAction SilentlyContinue

# Large project
Get-ChildItem ".\large-java-project\.mcp-index\index.db" -ErrorAction SilentlyContinue
```

### Performance Timing

Use Measure-Command:
```powershell
Measure-Command {
    # Run a find_symbol command in Copilot Chat
    # Note: This measures PowerShell execution, not the actual MCP call
}
```

---

## 🎯 Expected Outcomes

After testing, you should find:

### ✅ Storage Backend Wins
- **Memory**: 93% less for large projects
- **Scalability**: Can index 3x more files
- **Storage**: Compact SQLite database

### ✅ In-Memory Wins
- **Cold queries**: Slightly faster (~100ms vs <1ms)
- **Simplicity**: No SQLite dependency
- **Storage size**: Smaller JSON files

### 🤝 Tie
- **Indexing speed**: Both ~133 files/sec
- **Cached queries**: Both <1ms
- **Accuracy**: 100% identical results
- **Reliability**: Both rock solid

### 🐛 Bugs Found
- **Expected**: Zero critical bugs
- **Possible**: Minor logging differences
- **Report**: Use bug tracker template

---

## 📚 Reference

**Configuration Files:**
- `mcp-config-example.json` - VS Code MCP setup
- `MCP_DUAL_SETUP_GUIDE.md` - Detailed setup instructions

**Testing Scripts:**
- `compare-storage-vs-memory.js` - Automated comparison
- `monitor-comparison.ps1` - Live monitoring

**Documentation:**
- `BUG_TRACKING_TEMPLATE.md` - Bug reporting
- `STORAGE_BACKEND_SUCCESS.md` - Storage implementation report
- `STORAGE_IMPLEMENTATION_FINAL_REPORT.md` - Technical details

---

## 💡 Tips

1. **Test with YOUR projects**: Use real Java codebases you work with
2. **Monitor continuously**: Leave monitor running during testing
3. **Document everything**: Even small differences matter
4. **Be systematic**: Follow the testing checklist
5. **Compare apples-to-apples**: Index same project on both

---

## ❓ Troubleshooting

### "Can't find processes"
- Check Task Manager for `node.exe` processes
- Ensure both servers started in VS Code
- Try restarting VS Code

### "Both give different results"
- Clear both index directories
- Reindex from scratch
- **Report as bug if persists**

### "Monitor shows no difference"
- Test with large project (12k files)
- Small projects won't show memory difference
- Memory savings appear at scale

### "One server won't start"
- Check MCP config path is correct
- Verify server/dist/index.js exists
- Check VS Code Copilot logs

---

## ✅ Success Criteria

You've successfully compared both when:

- [x] Both servers running simultaneously
- [x] Tested all 13 tools on both
- [x] Compared memory usage (storage much lower)
- [x] Compared performance (similar)
- [x] Compared accuracy (identical)
- [x] Documented any bugs found
- [x] Generated comparison report

---

**Time to complete**: ~30 minutes  
**Difficulty**: Easy  
**Prerequisites**: VS Code, Node.js, Both versions installed  

🎉 **Ready? Start with Step 1!**
