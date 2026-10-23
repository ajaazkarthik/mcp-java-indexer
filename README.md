# MCP Java Indexer

[![Version](https://img.shields.io/badge/version-3.2.0-blue)](https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-brightgreen)](https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp)

A complete **LOCAL** Model Context Protocol (MCP) extension for VS Code that provides IntelliJ-style Java code intelligence. **18 powerful tools**, zero-config database storage, and AI-friendly code analysis.

## 🎯 Features

### Core Indexing
- **Full Java Code Indexing**: Parse .java files using JavaParser + SymbolSolver
- **Symbol Extraction**: Packages, classes, methods, fields, imports, extends, implements
- **Call Graph Analysis**: Outbound/inbound calls with polymorphism resolution
- **Reference Tracking**: Method calls, field accesses, object instantiations
- **Incremental Indexing**: File watcher with hash-based change detection
- **Fast Performance**: 10k-20k classes indexed in <40 seconds
- **Zero-Config Database**: SQLite storage with native **better-sqlite3**, prepared statements and persistent on-disk indexes.
- **Memory Efficient**: Uses 90-99% less memory than file-based storage on large projects

### 🧠 AI-Friendly Tools
- **Code Explanation**: Natural language descriptions of classes/methods/fields
- **Semantic Search**: Find code by intent (e.g., "database save methods"), not just names
- **Impact Analysis**: Analyze what breaks when you change code, with risk scoring
- **Pattern Detection**: Automatically detect Builder, Factory, Repository, and 20+ patterns

### 🚀 Quality & Generation Tools
- **Test Coverage**: Analyze test coverage, identify gaps, suggest test names
- **Refactoring Suggestions**: Code health scoring, detect code smells, priority recommendations
- **Code Generation**: Generate Builder, Repository, Service, DTO, Test, and more patterns

### 🔍 Codebase Exploration (v2.5+)
- **Explore Codebase**: High-level overview of project structure, packages, and architecture
- **Explore Class**: Deep dive into any class with full context (implementation, dependencies, usages)
- **Batch Query**: Execute multiple queries efficiently in a single request
- **Scan Migration Candidates**: Analyze entire codebase for migration-ready classes with dependency scoring

👉 See [ADVANCED_TOOLS.md](ADVANCED_TOOLS.md) for detailed tool documentation

## 📁 Architecture

```
mcp-java-indexer/
├── server/                    # Node.js MCP Server (TypeScript)
│   ├── src/
│   │   ├── index.ts          # Main server entry (18 tools registered)
│   │   ├── indexer-client.ts # Java process communication
│   │   ├── storage.ts        # SQLite database storage
│   │   ├── memory-index.ts   # In-memory indices (fallback)
│   │   ├── persistence.ts    # JSON persistence (fallback)
│   │   ├── fs-watcher.ts     # File watcher
│   │   └── tools/            # MCP tool implementations
│   │       ├── index_project.ts          # Index entire project
│   │       ├── reindex_file.ts           # Reindex single file
│   │       ├── find_symbol.ts            # Find class/method/field
│   │       ├── find_usages.ts            # Find all references
│   │       ├── call_graph.ts             # Analyze call graph
│   │       ├── goto_definition.ts        # Navigate to definition
│   │       ├── search_text.ts            # Text search in code
│   │       ├── explain_code.ts           # 🧠 Explain code in plain English
│   │       ├── semantic_search.ts        # 🧠 Search by intent/pattern
│   │       ├── analyze_impact.ts         # 🧠 Impact & risk analysis
│   │       ├── test_coverage.ts          # 🚀 Test coverage analysis
│   │       ├── refactoring_suggestions.ts # 🚀 Smart refactoring tips
│   │       ├── code_generation.ts        # 🚀 Pattern-based generation
│   │       ├── explore_codebase.ts       # 🔍 High-level project overview
│   │       ├── explore_class.ts          # 🔍 Deep class exploration
│   │       ├── batch_query.ts            # 🔍 Efficient batch queries
│   │       ├── scan_migration_candidates.ts # 🔍 Migration analysis
│   │       └── compact_index.ts          # Memory optimization
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

### Option 1: Install from VS Code Marketplace (Recommended) ⚡

**Just install and use - no build required!**

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"Java Indexer MCP"**
4. Click **Install**
5. Restart VS Code
6. Done! Start using with `@java-indexer` in Copilot Chat

[![Install from Marketplace](https://img.shields.io/badge/Install-VS%20Code%20Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp)

---

### Option 2: Build from Source (For Development)

<details>
<summary>Click to expand build instructions</summary>

#### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Java** 8+ ([Download](https://adoptium.net/))
- **Maven** 3.6+ ([Download](https://maven.apache.org/download.cgi))
- **VS Code** with Copilot extension

#### Step 1: Build Everything (One Command)

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

#### Step 2: Configure VS Code

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

#### Step 3: Restart VS Code

Close and reopen VS Code completely to load the MCP server.

</details>

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

### 8. Explore Codebase (v2.5+)

Get a high-level overview of your project structure:
```
@java-indexer explore_codebase with rootDir: "C:/path/to/java/project"
```

**Output**: Package hierarchy, class counts, architecture patterns detected.

### 9. Explore Class (v2.5+)

Deep dive into any class with full context:
```
@java-indexer explore_class with className: "UserService"
```

**Output**: Implementation details, dependencies, who uses it, and related classes.

### 10. Scan Migration Candidates (v2.7+)

Analyze which classes are safe to migrate:
```
@java-indexer scan_migration_candidates with rootDir: "C:/path/to/project", blockedPatterns: ["com.legacy", "org.thirdparty"]
```

**Output**: Classes ranked by migration readiness with dependency scoring.

## 🔧 MCP Tools Reference (18 Tools)

### Core Indexing Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `index_project` | Scan and index all Java files in a project | `rootDir` (required), `sourceRoots` (optional) |
| `reindex_file` | Reparse and update a single file | `filePath` (required) |
| `compact_index` | Optimize memory usage | `aggressive` (optional) |

### Navigation & Search Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `find_symbol` | Find symbol by name or FQN | `name` (required) |
| `find_usages` | Find all references to a symbol | `fqn` (required) |
| `call_graph` | Get inbound/outbound call graph | `fqn` (required) |
| `goto_definition` | Get definition location | `symbol` (required) |
| `search_text` | Search text pattern in files | `pattern` (required), `isRegex`, `maxResults` |
| `semantic_search` | Search by intent/meaning | `query` (required), `limit` |

### AI-Friendly Analysis Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `explain_code` | Natural language code explanation | `symbol` (required), `detail` |
| `analyze_impact` | Impact & risk analysis for changes | `fqn` (required), `depth` |
| `test_coverage` | Analyze test coverage and gaps | `package` or `class` (required) |
| `refactoring_suggestions` | Code health scoring and tips | `target` (required) |

### Codebase Exploration Tools (v2.5+)
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `explore_codebase` | High-level project overview | `rootDir` (required) |
| `explore_class` | Deep dive into a class | `className` (required) |
| `batch_query` | Execute multiple queries at once | `queries` (required) |
| `scan_migration_candidates` | Analyze migration readiness | `rootDir`, `blockedPatterns` |

### Code Generation Tool
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `code_generation` | Generate code patterns | `type` (builder/repository/service/dto/test), `target` |

## 📊 Performance

- **Indexing**: 10,000-20,000 Java classes in 30-40 seconds
- **Incremental Update**: Single file reindex in <200ms
- **Query Performance**: Call graph queries in <20ms
- **Memory Usage**: Query symbols/references/edges directly from SQLite rather than hydrating the full index at startup (profile under your real workload).
- **Index Size**: ~30-50MB database for 20k classes


### Native SQLite configuration and refresh control

The MCP server uses **better-sqlite3** exclusively. Install dependencies under
`server/` with `npm ci`. On Windows, a compatible native prebuilt binary
or Visual Studio C++ Build Tools may be required. There is no sql.js
fallback. The database lives at `<project>/.mcp-index/index.db`.

SQLite schema upgrades run automatically when the index is opened. The startup
log estimates how many indexes require building or verification. For an explicit
upgrade check, use `compact_index(migrate: true)`; this runs the SQLite
migration before normal compaction and leaves the 18-tool API intact.

Set `INDEX_VALIDATOR_DISABLED=true` in the MCP server's environment to
disable on-demand automatic index validation/refresh. The file watcher is a
separate mechanism; disable it separately if a fully manual indexing
workflow is required. For manual updates use `index_project` or
`reindex_file`.

For release verification, run `cd server && npm ci && npm run release:gate`.
CI additionally runs the `BENCH_10K=1` one-file delta performance fixture.
Treat benchmark values as test-host measurements, not production SLAs.

## 3.2 performance and memory notes

The **idle/query Node heap** stays small because `Persistence.load()` hydrates file metadata only and MCP query tools read symbols/references via prepared SQLite statements. However, **peak memory while `index_project` runs still scales with project size**: indexing still accumulates the full symbol/reference corpus in `MemoryIndex` before persisting. Future work should stream index batches directly to SQLite. Run `cd server && npm run release:gate` for 50,000-symbol / 200,000-reference behavioral measurements; those CI fixture numbers are not production SLAs.

## 🗂️ Index Storage

Indexes are stored in `.mcp-index/` directory at the project root:

```
your-java-project/
├── .mcp-index/
│   ├── index.db           # SQLite database (primary)
│   └── index.json         # JSON fallback (if DB unavailable)
├── src/
└── pom.xml
```

**Storage backend**:
- **SQLite (required)**: Native `better-sqlite3`; no WebAssembly/sql.js fallback.
- **File-based (Fallback)**: JSON persistence with optional compression

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

- **Local Only**: No network communication, all processing stays on your machine
- **Zero-Config Database**: Embedded native `better-sqlite3` - no external database server
- **File Access**: Only reads/writes in the indexed project directory
- **Sandboxed**: Runs in isolated Node.js and Java processes

## 📄 License

MIT License - Free for personal and commercial use.

## 🙏 Credits

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [JavaParser](https://github.com/javaparser/javaparser) - Java AST parsing
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - native SQLite binding
- [Chokidar](https://github.com/paulmillr/chokidar) - File watching
- [TypeScript](https://www.typescriptlang.org/)

---

**Version 2.7.1** | [Changelog](CHANGELOG.md) | [Issues](https://github.com/ubanishathanvenkatesan/mcp-java-indexer/issues)

**Happy Coding! 🚀**
