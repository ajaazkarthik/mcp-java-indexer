# Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. Build Everything

Open PowerShell in the project root and run:

```powershell
.\build.ps1
```

This will:
- ✅ Check prerequisites (Java, Maven, Node.js)
- ✅ Build Java indexer JAR
- ✅ Install Node.js dependencies
- ✅ Compile TypeScript

### 2. Configure VS Code

Open (or create) your MCP config file:

**Windows**: `%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json`

**Mac/Linux**: `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/mcp.json`

Add this configuration (update the path to match your installation):

```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "D:\\workspace\\repo\\github-playground\\mcp-java-indexer\\server\\dist\\index.js"
      ],
      "env": {}
    }
  }
}
```

### 3. Restart VS Code

Close and reopen VS Code completely.

### 4. Test It

Open Copilot Chat and try:

```
@java-indexer index_project with rootDir: "C:/path/to/your/java/project"
```

Replace the path with your actual Java project directory.

---

## 📖 Example Usage

### Index a Spring Boot Project

```
@java-indexer index_project with rootDir: "C:/projects/spring-boot-app", sourceRoots: ["src/main/java"]
```

### Find a Class

```
@java-indexer find_symbol with name: "UserController"
```

### See Who Calls a Method

```
@java-indexer find_usages with fqn: "com.example.UserService.createUser(User)"
```

### Analyze Method Calls

```
@java-indexer call_graph with fqn: "com.example.UserService.createUser(User)"
```

### Search for TODOs

```
@java-indexer search_text with pattern: "TODO", isRegex: false
```

### Find All @RestController Classes

```
@java-indexer search_text with pattern: "@RestController", isRegex: false
```

---

## 🔍 How It Works

1. **Indexing**: JavaParser analyzes your Java files and extracts:
   - Classes, interfaces, enums
   - Methods and constructors
   - Fields
   - Method calls and references
   - Inheritance relationships

2. **Storage**: Everything is stored in-memory as TypeScript Maps and persisted to `.mcp-index/index.json`

3. **File Watching**: Chokidar watches for file changes and automatically reindexes

4. **Queries**: Fast lookups using in-memory indices (no database!)

---

## 📊 What Gets Indexed

✅ **Symbols**
- Classes, interfaces, enums
- Methods (with parameters)
- Constructors
- Fields
- Package declarations

✅ **References**
- Method calls
- Field accesses
- Object instantiations (`new X()`)
- Inheritance (extends/implements)
- Type references

✅ **Call Graph**
- Outbound calls (what this method calls)
- Inbound calls (who calls this method)
- Polymorphic calls (via inheritance)

---

## ⚡ Performance Tips

### For Large Projects (>10k files)

1. **Index with specific source roots**:
   ```
   @java-indexer index_project with rootDir: "C:/project", sourceRoots: ["src/main/java"]
   ```

2. **Exclude test code** (faster indexing):
   Only index production code, skip tests

3. **Use SSD storage** for better I/O performance

### Memory Usage

- Small project (1k classes): ~50MB
- Medium project (5k classes): ~200MB
- Large project (20k classes): ~500MB

---

## 🐛 Troubleshooting

### "Java not found"
Install Java 11+: https://adoptium.net/

### "Maven not found"
Install Maven: https://maven.apache.org/download.cgi

### "Node.js not found"
Install Node.js 18+: https://nodejs.org/

### "MCP server not responding"
1. Check VS Code Output panel → "MCP Servers"
2. Look for Java indexer errors
3. Verify paths in mcp.json are correct

### "Index is slow"
- Use specific source roots
- Ensure Java files are valid
- Check disk I/O (use SSD)

---

## 🎓 Advanced Usage

### Custom Source Roots

If your project has unusual structure:

```
@java-indexer index_project with rootDir: "C:/project", sourceRoots: ["custom/src", "generated/src"]
```

### Reindex Single File

After making changes to a file:

```
@java-indexer reindex_file with filePath: "C:/project/src/main/java/com/example/User.java"
```

### Regex Search

Search with patterns:

```
@java-indexer search_text with pattern: "public static void.*main", isRegex: true
```

### Limit Results

For large result sets:

```
@java-indexer search_text with pattern: "import", maxResults: 20
```

---

## 🔒 Privacy & Security

- ✅ **100% Local** - No network calls
- ✅ **No Database** - Only JSON files
- ✅ **File Access** - Only reads your Java files
- ✅ **Open Source** - Inspect the code yourself

---

## 📚 Learn More

See [README.md](README.md) for complete documentation.

---

**Need help? Check the logs in VS Code Output → "MCP Servers"**
