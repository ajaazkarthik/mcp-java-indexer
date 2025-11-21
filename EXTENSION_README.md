# Java Indexer MCP

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

IntelliJ-style Java code indexing and call-graph analysis for VS Code with **no database**. Powered by JavaParser + SymbolSolver, runs 100% locally.

## ✨ Features

- **🔍 Full Java Indexing**: Parse and index all Java files in a project
- **📍 Symbol Search**: Find classes, methods, fields by name or FQN
- **🔗 Find Usages**: Locate all references to any symbol
- **📞 Call Graph Analysis**: Understand what calls what, with polymorphism support
- **⚡ Incremental Indexing**: Auto-reindex only changed files
- **💾 No Database**: Pure in-memory with JSON persistence
- **🚀 Fast**: Index 20k classes in ~55 seconds
- **🔒 Local & Private**: All analysis runs on your machine

## 🚀 Quick Start

### 1. Install Extension

Install **Java Indexer MCP** from VS Code Marketplace (search for `java-indexer-mcp`)

### 2. Prerequisites

- **Java 8+** ([Download](https://adoptium.net/))
- **Maven 3.6+** ([Download](https://maven.apache.org/download.cgi))

Check installation:
```bash
java -version
mvn -version
```

### 3. Use in Copilot Chat

Open **Copilot Chat** and type:

```
@java-indexer index_project with rootDir: "C:/path/to/java/project"
```

That's it! The extension handles everything.

## 📚 Usage Examples

### Index a Project

```
@java-indexer index_project with rootDir: "C:/my-spring-app", sourceRoots: ["src/main/java"]
```

**Output**:
```
✅ Indexed 1,234 Java files in 32.5s

📊 Statistics:
  • Symbols: 15,678
  • Files: 1,234
  • References: 45,890
  • Call Graph Edges: 12,345
```

### Find a Symbol

```
@java-indexer find_symbol with name: "UserService"
```

Returns: File location, package, modifiers, extends/implements

### Find All Usages

```
@java-indexer find_usages with fqn: "com.example.UserService.createUser(User)"
```

Returns: All 12 locations where this method is called

### Analyze Call Graph

```
@java-indexer call_graph with fqn: "com.example.UserService.createUser(User)"
```

Returns: What it calls + who calls it + polymorphic calls

### Search Code

```
@java-indexer search_text with pattern: "TODO|FIXME", isRegex: true
```

### Reindex Single File

```
@java-indexer reindex_file with filePath: "C:/project/User.java"
```

## 🛠️ Tools Reference

| Tool | Purpose | Parameters |
|------|---------|------------|
| `index_project` | Index entire project | `rootDir` (required), `sourceRoots` |
| `find_symbol` | Find symbol definition | `name` (required) |
| `find_usages` | Find all references | `fqn` (required) |
| `call_graph` | Analyze method calls | `fqn` (required) |
| `goto_definition` | Go to definition | `symbol` (required) |
| `reindex_file` | Reindex single file | `filePath` (required) |
| `search_text` | Search in code | `pattern` (required), `isRegex`, `maxResults` |

## ⚙️ Settings

Configure in VS Code settings (`settings.json`):

```json
{
  "javaIndexer.autoIndex": true,
  "javaIndexer.sourceRoots": ["src/main/java", "src"],
  "javaIndexer.excludePatterns": ["**/target/**", "**/build/**"],
  "javaIndexer.indexTimeout": 300000
}
```

## 📊 Performance

| Operation | Time |
|-----------|------|
| Index 5k classes | ~18s |
| Index 20k classes | ~55s |
| Symbol lookup | <10ms |
| Call graph query | <20ms |
| Text search | ~50ms |

## 🏗️ Architecture

```
┌─────────────────┐
│  VS Code        │
│  Copilot Chat   │
└────────┬────────┘
         │ @java-indexer
         ▼
┌─────────────────┐
│  Node.js MCP    │
│  Server         │
└────────┬────────┘
         │ JSON-over-stdio
         ▼
┌─────────────────┐
│  Java Process   │
│  (JavaParser)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  .mcp-index/    │
│  index.json     │
└─────────────────┘
```

## 🔒 Privacy & Security

- ✅ **100% Local** - No network calls
- ✅ **No Database** - Only JSON files
- ✅ **Open Source** - View the code
- ✅ **Sandboxed** - Isolated processes

## 🐛 Troubleshooting

### MCP Server not showing

1. **Restart VS Code completely** (close all windows)
2. Check settings:
   - View → Output → "MCP Servers"
   - Look for `java-indexer` in MCP server list

### Indexing slow

- Use specific `sourceRoots` to skip test code
- Exclude `target/` and `build/` directories

### "Cannot find Java"

- Install Java 8+: https://adoptium.net/
- Verify: `java -version`

### "Cannot find Maven"

- Install Maven: https://maven.apache.org/download.cgi
- Verify: `mvn -version`

## 📖 Documentation

- [Full README](https://github.com/yourusername/java-indexer-mcp)
- [Quick Start Guide](https://github.com/yourusername/java-indexer-mcp#quick-start)
- [API Reference](https://github.com/yourusername/java-indexer-mcp#tools-reference)

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📄 License

MIT License - Free for personal and commercial use

## 🙏 Credits

Built with:
- [JavaParser](https://github.com/javaparser/javaparser)
- [VS Code MCP SDK](https://github.com/modelcontextprotocol/sdk)
- [Chokidar](https://github.com/paulmillr/chokidar)

---

**Enjoying Java Indexer MCP?** ⭐ Star us on [GitHub](https://github.com/yourusername/java-indexer-mcp)!

For issues and feature requests: [GitHub Issues](https://github.com/yourusername/java-indexer-mcp/issues)
