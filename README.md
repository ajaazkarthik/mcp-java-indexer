# MCP Java Indexer

A complete **LOCAL** Model Context Protocol (MCP) extension for VS Code that performs IntelliJ-style Java code indexing and call-graph analysis. **Zero-config database storage** for efficient memory usage on large projects.

## 🎯 Features

### Core Indexing
- **Full Java Code Indexing**: Parse .java files using JavaParser + SymbolSolver
- **Symbol Extraction**: Packages, classes, methods, fields, imports, extends, implements
- **Call Graph Analysis**: Outbound/inbound calls with polymorphism resolution
- **Reference Tracking**: Method calls, field accesses, object instantiations
- **Incremental Indexing**: File watcher with hash-based change detection
- **Fast Performance**: 10k-20k classes indexed in <40 seconds
- **Zero-Config Database**: SQLite storage via WebAssembly - works everywhere, no setup needed!
- **Memory Efficient**: Uses 90-99% less memory than file-based storage on large projects

### 🧠 AI-Friendly Tools
- **Code Explanation**: Natural language descriptions of classes/methods/fields
- **Semantic Search**: Find code by intent (e.g., "database save methods"), not just names
- **Impact Analysis**: Analyze what breaks when you change code, with risk scoring
- **Pattern Detection**: Automatically detect Builder, Factory, Repository, and 20+ patterns

### 🚀 Quality & Generation Tools (v1.4.0)
- **Test Coverage**: Analyze test coverage, identify gaps, suggest test names
- **Refactoring Suggestions**: Code health scoring, detect code smells, priority recommendations
- **Code Generation**: Generate Builder, Repository, Service, DTO, Test, and more patterns

👉 See [ADVANCED_TOOLS.md](ADVANCED_TOOLS.md) and [V1.4.0_COMPLETE.md](V1.4.0_COMPLETE.md) for details

## 📁 Architecture

```
mcp-java-indexer/
├── server/                    # Node.js MCP Server (TypeScript)
│   ├── src/
│   │   ├── index.ts          # Main server entry
│   │   ├── indexer-client.ts # Java process communication
│   │   ├── memory-index.ts   # In-memory indices
│   │   ├── persistence.ts    # JSON persistence
│   │   ├── fs-watcher.ts     # File watcher
│   │   └── tools/            # MCP tool implementations
│   │       ├── index_project.ts     # Index entire project
│   │       ├── reindex_file.ts      # Reindex single file
│   │       ├── find_symbol.ts       # Find class/method/field
│   │       ├── find_usages.ts       # Find all references
│   │       ├── call_graph.ts        # Analyze call graph
│   │       ├── goto_definition.ts   # Navigate to definition
│   │       ├── search_text.ts           # Text search in code
│   │       ├── explain_code.ts          # 🧠 Explain code in plain English
│   │       ├── semantic_search.ts       # 🧠 Search by intent/pattern
│   │       ├── analyze_impact.ts        # 🧠 Impact & risk analysis
│   │       ├── test_coverage.ts         # 🚀 Test coverage analysis
│   │       ├── refactoring_suggestions.ts # 🚀 Smart refactoring tips
│   │       └── code_generation.ts       # 🚀 Pattern-based generation
│   ├── package.json
│   └── tsconfig.json
│
├── java-indexer/             # Java Indexer (Maven)
│   ├── src/main/java/com/mcp/indexer/
│   │   ├── JavaIndexer.java
│   │   ├── ParserService.java
│   │   ├── StubModel.java
│   │   ├── ReferenceExtractor.java
│   │   ├── CallGraphBuilder.java
│   │   └── MessageProtocol.java
│   └── pom.xml
│
└── example-config/
    └── mcp.json              # VS Code MCP configuration
```

## 🚀 Installation

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Java** 8+ ([Download](https://adoptium.net/))
- **Maven** 3.6+ ([Download](https://maven.apache.org/download.cgi))
- **VS Code** with Copilot extension

### Step 1: Build Everything (One Command)

**Windows (Recommended)**:
```cmd
build.bat
```

**Or manually**:

Build Java Indexer:
```cmd
cd java-indexer
mvn clean package
cd ..
```

Build Node.js Server:
```cmd
cd server
npm install
npm run build
cd ..
```

This creates:
- `java-indexer/target/java-indexer-1.0.0.jar` (with all dependencies)
- `server/dist/index.js` (compiled TypeScript)

### Step 2: Configure VS Code

Add to your VS Code MCP configuration at:  
`%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json`

```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "D:\\workspace\\repo\\github-playground\\mcp-java-indexer\\server\\dist\\index.js"
      ]
    }
  }
}
```

**Important**: 
- Use **double backslashes** (`\\`) in the path
- Update the path to match your actual installation directory
- Create the file if it doesn't exist

### Step 3: Restart VS Code

Close and reopen VS Code completely to load the MCP server.

## 🎮 Usage

Open GitHub Copilot Chat in VS Code and use the following commands:

### 1. Index a Java Project

```
@java-indexer index_project with rootDir: "C:/path/to/java/project"
```

Optional source roots:
```
@java-indexer index_project with rootDir: "C:/path/to/java/project", sourceRoots: ["src/main/java", "src/test/java"]
```

**Output**:
```
✅ Indexed 1,234 Java files in 32.5s

📊 Statistics:
  • Symbols: 15,678
  • Files: 1,234
  • References: 45,890
  • Call Graph Edges: 12,345
  • Inheritance Relations: 567

💾 Index persisted to: C:/path/to/java/project/.mcp-index
👁️ File watcher enabled for incremental updates
```

### 2. Find Symbol Definition

```
@java-indexer find_symbol with name: "UserService"
```

or with fully qualified name:
```
@java-indexer find_symbol with name: "com.example.service.UserService"
```

**Output**:
```
**class**: `com.example.service.UserService`
📁 File: C:/project/src/main/java/com/example/service/UserService.java:15:1
📦 Package: com.example.service
🔧 Modifiers: public
⬆️ Extends: BaseService
🔌 Implements: IUserService, Serializable
```

### 3. Find All Usages

```
@java-indexer find_usages with fqn: "com.example.service.UserService.getUser(String)"
```

**Output**:
```
Found 12 usages of `com.example.service.UserService.getUser(String)` in 5 files:

📁 **UserController.java** (3 usages)
  📞 Line 45:12 - method_call from com.example.controller.UserController.handleRequest
  📞 Line 78:8 - method_call from com.example.controller.UserController.getUserById
  📞 Line 92:15 - method_call from com.example.controller.UserController.validateUser
```

### 4. Generate Call Graph

```
@java-indexer call_graph with fqn: "com.example.service.UserService.createUser(User)"
```

**Output**:
```
# Call Graph for `com.example.service.UserService.createUser(User)`

## 📤 Outbound Calls (4)
→ `com.example.repository.UserRepository.save(User)`
→ `com.example.util.Validator.validate(Object)`
→ `com.example.audit.AuditService.log(String)`

## 📥 Inbound Calls (2)
← `com.example.controller.UserController.register(User)`
← `com.example.batch.UserImporter.importUsers(List)`
```

### 5. Go to Definition

```
@java-indexer goto_definition with symbol: "UserService"
```

### 6. Search Text in Code

```
@java-indexer search_text with pattern: "TODO|FIXME", isRegex: true
```

### 7. Reindex Single File

```
@java-indexer reindex_file with filePath: "C:/project/src/main/java/com/example/User.java"
```

## 🔧 MCP Tools Reference

| Tool | Description | Parameters |
|------|-------------|------------|
| `index_project` | Scan and index all Java files in a project | `rootDir` (required), `sourceRoots` (optional) |
| `reindex_file` | Reparse and update a single file | `filePath` (required), `sourceRoots` (optional) |
| `find_symbol` | Find symbol by name or FQN | `name` (required) |
| `find_usages` | Find all references to a symbol | `fqn` (required) |
| `call_graph` | Get inbound/outbound call graph | `fqn` (required) |
| `goto_definition` | Get definition location | `symbol` (required) |
| `search_text` | Search text pattern in files | `pattern` (required), `isRegex`, `maxResults` |

## 📊 Performance

- **Indexing**: 10,000-20,000 Java classes in 30-40 seconds
- **Incremental Update**: Single file reindex in <200ms
- **Query Performance**: Call graph queries in <20ms
- **Memory Usage**: ~500MB for 20k classes
- **Index Size**: ~50MB JSON for 20k classes

## 🗂️ Index Storage

All indices are stored in `.mcp-index/` directory at the project root:

```
your-java-project/
├── .mcp-index/
│   └── index.json          # Serialized in-memory indices
├── src/
└── pom.xml
```

The index includes:
- **symbols**: All classes, methods, fields, constructors
- **files**: File metadata with hashes
- **references**: All method calls, field accesses, instantiations
- **callGraph**: Forward call graph (caller → callee)
- **reverseCallGraph**: Reverse call graph (callee → caller)
- **inheritance**: Class hierarchy relationships

## 🔄 Incremental Indexing

The file watcher automatically:
1. Detects `.java` file changes
2. Computes SHA-256 hash
3. Reindexes only if hash changed
4. Updates in-memory indices
5. Persists to disk

**Watched Changes**:
- ✅ File creation
- ✅ File modification
- ✅ File deletion

**Ignored Directories**:
- `node_modules/`
- `.git/`
- `target/`
- `build/`
- `.mcp-index/`

## 🐛 Troubleshooting

### MCP Server Not Starting

1. **Check Java installation**:
   ```powershell
   java -version
   ```
   Should show Java 11 or higher.

2. **Verify JAR exists**:
   ```powershell
   Test-Path "d:\workspace\repo\github-playground\mcp-java-indexer\java-indexer\target\java-indexer-1.0.0.jar"
   ```

3. **Check Node.js build**:
   ```powershell
   Test-Path "d:\workspace\repo\github-playground\mcp-java-indexer\server\dist\index.js"
   ```

### Indexing Fails

- Ensure Java files are valid and compilable
- Check source roots match your project structure
- Look for errors in VS Code MCP logs

### Performance Issues

- **Large projects**: Index in batches of 100 files (automatic)
- **Memory**: See [MEMORY_OPTIMIZATION.md](MEMORY_OPTIMIZATION.md) for comprehensive guide
  - Quick fix: Increase heap with `--max-old-space-size=8192`
  - Use `@java-indexer compact_index` after indexing
- **Disk I/O**: Use SSD for better performance

### Memory Issues (OOM/Crashes)

**For projects with 10,000+ Java files:**

👉 **Read the complete guide**: [MEMORY_OPTIMIZATION.md](MEMORY_OPTIMIZATION.md)

**Quick fixes:**
1. Increase heap size to 8GB in MCP config
2. Use `@java-indexer compact_index with aggressive: true` after indexing
3. Enable incremental indexing (don't force full rebuilds)
4. Use `--expose-gc` flag for garbage collection

**Example MCP config for large projects:**
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": [
        "--max-old-space-size=8192",
        "--expose-gc",
        "C:\\path\\to\\server\\dist\\index.js"
      ]
    }
  }
}
```

## 🏗️ Development

### Run in Development Mode

```powershell
# Terminal 1: Watch TypeScript compilation
cd server
npm run watch

# Terminal 2: Run server
npm run dev
```

### Debug Java Indexer

Add to Maven command:
```powershell
mvn package -X  # Verbose output
```

### Test Indexing Manually

```powershell
# Build Java indexer
cd java-indexer
mvn clean package

# Test via stdin/stdout
java -jar target/java-indexer-1.0.0.jar
# Send JSON request:
# {"id":1,"method":"indexFile","params":{"filePath":"C:/test/Example.java","sourceRoots":["C:/test"]}}
```

## 📝 Example Queries

### Find All Controllers
```
@java-indexer search_text with pattern: "@Controller|@RestController", isRegex: true
```

### Analyze Main Method
```
@java-indexer call_graph with fqn: "com.example.Application.main(String[])"
```

### Find Spring Beans
```
@java-indexer search_text with pattern: "@Bean|@Component|@Service", isRegex: true
```

## 🔐 Security

- **Local Only**: No network communication
- **No Database**: No persistent database server
- **File Access**: Only reads indexed Java project files
- **Sandboxed**: Runs in isolated Node.js and Java processes

## 📄 License

MIT License - Free for personal and commercial use.

## 🙏 Credits

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [JavaParser](https://github.com/javaparser/javaparser)
- [Chokidar](https://github.com/paulmillr/chokidar)
- [TypeScript](https://www.typescriptlang.org/)

---

**Happy Coding! 🚀**
