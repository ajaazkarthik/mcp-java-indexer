# MCP Java Indexer - AI Coding Agent Instructions

## Project Overview

**mcp-java-indexer** is a Model Context Protocol (MCP) extension for VS Code that provides IntelliJ-style Java code analysis without any database. It features:
- Full Java AST parsing with symbol extraction (classes, methods, fields)
- Bidirectional call graph analysis with polymorphism resolution
- Reference tracking (method calls, field accesses, instantiations)
- Incremental indexing via file watcher with hash-based change detection
- JSON persistence for indexes (stored in `.mcp-index/` directory)

**Architecture**: Hybrid Node.js + Java system. TypeScript MCP server manages in-memory indices; spawned Java processes perform parsing via JavaParser + SymbolSolver.

---

## Critical Architecture Decisions

### 1. **Java Process Communication Pattern**
- **Why**: JavaParser/SymbolSolver are Java-only; Node.js is lightweight for MCP and file watching
- **How**: `IndexerClient` spawns persistent Java process, communicates via JSON lines over stdio
- **Key file**: `server/src/indexer-client.ts` - handles process spawn, message buffering, pending request queues
- **Critical detail**: Messages are JSON lines (one per line); buffer incomplete lines for multi-line responses
- **Error handling**: Java process failures are logged to stderr; always check process state before messaging

### 2. **In-Memory Index Structure** 
- **Why**: No database = zero setup, instant local development, portability
- **Indices used** (`MemoryIndex` class):
  - `symbols`: Map<FQN → SymbolStub> - all classes, methods, fields
  - `references`: Array of all cross-symbol references
  - `callGraph`: Map<callerFQN → CallGraphEdge[]> - outbound calls
  - `reverseCallGraph`: Map<calleeFQN → CallGraphEdge[]> - inbound calls
  - `inheritance`: Map<childFQN → [parentFQNs]> - class hierarchy
- **Key consideration**: Backward compatibility with both old (`extends`, `implements`) and new (`extendsClass`, `implementsInterfaces`) property names in SymbolStub

### 3. **Batch Indexing Strategy**
- **Why**: Prevents Java process memory exhaustion and improves responsiveness
- **How**: Split file list into batches (default 100 files); process sequentially via `indexerClient.indexFiles(batch, sourceRoots)`
- **Key file**: `server/src/tools/index_project.ts` lines ~60-80
- **Trade-off**: Sequential batches are slower than parallel but more reliable for large projects (10k+ files)

### 4. **Persistence with Chunking**
- **Why**: Large indices can exceed JSON parsing limits; chunking prevents OOM
- **Storage**: `.mcp-index/index.json` (plus chunked files for large datasets)
- **Compression**: Optional gzip for large result sets (see `Persistence.saveChunked()`)
- **Key file**: `server/src/persistence.ts` - handles chunked save/load with metadata tracking

---

## Key Developer Workflows

### Build Everything (Windows)
```powershell
.\build.ps1
```
**Does**: Checks prerequisites (Java 11+, Maven 3.6+, Node.js 18+), builds Java JAR with Maven, compiles TypeScript to `server/dist/`.

### Build Separately (if needed)
```powershell
# Java only
cd java-indexer; mvn clean package; cd ..

# TypeScript only
cd server; npm install; npm run build; cd ..
```

### Development Workflow (watch mode)
```powershell
# Terminal 1: TypeScript watcher
cd server; npm run watch

# Terminal 2: Run server manually for testing
npm run dev
```

### Test Manually
```powershell
# Index a test project
@java-indexer index_project with rootDir: "C:/path/to/project"

# Find a class
@java-indexer find_symbol with name: "YourClassName"

# Call graph analysis
@java-indexer call_graph with fqn: "com.example.YourClass.methodName(String)"
```

---

## Project-Specific Patterns & Conventions

### MCP Tool Implementation Pattern
Each tool has two parts:
1. **Tool descriptor** (exported as `<name>Tool: Tool`) - defines schema, description
2. **Handler function** (exported as `handle<Name>`) - implements logic, returns MCP response format

Example (`find_symbol.ts`):
```typescript
export const findSymbolTool: Tool = { name: 'find_symbol', ... };
export async function handleFindSymbol(args, memoryIndex) { ... }
```
**Applied to all tools**: `index_project.ts`, `find_usages.ts`, `call_graph.ts`, `search_text.ts`, etc.

### Symbol Lookup Convention
- **Exact FQN first**: `com.example.UserService`
- **Partial name fallback**: `UserService` matches any class with that simple name
- **Field access**: `ClassName.fieldName` splits on last dot to find class, then field
- Key method: `MemoryIndex.findSymbols(nameOrFqn: string): SymbolStub[]` (lines ~60-120)

### Error Handling Pattern
All tool handlers return:
- **Success**: `{ content: [{ type: 'text', text: '...' }] }`
- **Error**: `{ content: [{ type: 'text', text: '...' }], isError: true }`
- **Empty result**: Return text message; don't throw (better UX)

### File Watcher Integration
- Watches for `.java` file changes; triggers reindex on modification
- Ignores: `node_modules/`, `.git/`, `target/`, `build/`, `.mcp-index/`
- Uses hash comparison (SHA-256) to skip redundant parsing
- Key file: `server/src/fs-watcher.ts`

---

## Integration Points & Dependencies

### External Libraries
- **@modelcontextprotocol/sdk**: MCP server protocol (stdio transport)
- **JavaParser + SymbolSolver**: Java AST parsing and type resolution (Java dependencies)
- **Chokidar**: File watching (Node.js)
- **Glob**: File pattern matching for `.java` discovery
- **Gson**: Java JSON serialization (Maven dependency)

### Java ↔ TypeScript Message Contract
**Request format** (from TypeScript → Java):
```json
{ "id": 1, "method": "indexFiles", "params": { "filePaths": [...], "sourceRoots": [...] } }
```

**Response format** (Java → TypeScript):
```json
{ "id": 1, "result": [{ "file": "...", "symbols": [...], "references": [...] }] }
{ "id": 1, "error": "..." }  // On error
```
Key file: `java-indexer/src/main/java/com/mcp/indexer/MessageProtocol.java`

### Configuration
VS Code MCP config at: `%APPDATA%\Code\User\globalStorage\github.copilot-chat\mcp.json`
```json
{
  "mcpServers": {
    "java-indexer": {
      "command": "node",
      "args": ["C:\\path\\to\\server\\dist\\index.js"]
    }
  }
}
```

---

## Code Location Reference

| Pattern | File | Notes |
|---------|------|-------|
| MCP server entry | `server/src/index.ts` | Tool registration, request dispatcher |
| Index data structures | `server/src/memory-index.ts` | All `Map<>`/array indices, lookup methods |
| Java process spawn | `server/src/indexer-client.ts` | JSON message protocol with Java |
| Index project tool | `server/src/tools/index_project.ts` | Batch indexing loop, glob pattern |
| Persistence | `server/src/persistence.ts` | Save/load with chunking and compression |
| File watcher | `server/src/fs-watcher.ts` | Incremental reindexing on file change |
| Symbol lookup | `server/src/tools/find_symbol.ts` | Partial name + FQN matching |
| Call graph | `server/src/tools/call_graph.ts` | Bidirectional call graph traversal |
| Java parser | `java-indexer/src/.../ParserService.java` | JavaParser AST traversal, symbol extraction |
| Reference extraction | `java-indexer/src/.../ReferenceExtractor.java` | Identifies calls, field accesses, instantiations |
| Call graph building | `java-indexer/src/.../CallGraphBuilder.java` | Constructs forward/reverse call edges |

---

## Common Modifications & How-Tos

### Adding a New MCP Tool
1. Create `server/src/tools/my_tool.ts` with `myToolTool` descriptor and `handleMyTool` function
2. Import in `server/src/index.ts` and add to `ListToolsRequestSchema` array
3. Add case in `CallToolRequestSchema` switch statement
4. Return `{ content: [{ type: 'text', text: 'result' }] }` format

### Updating Index Data Structure
- Modify `MemoryIndex` class: add new Map/array field, implement getter/setter
- Update `toJSON()` method for persistence
- Update `Persistence.save()` and `Persistence.load()` for disk I/O
- Increment metadata version in `persistence.ts` for backward compatibility

### Improving Java Parser Performance
- Batch size tunable in `index_project.ts` (currently 100)
- Reduce source roots if possible (fewer TypeSolver paths = faster resolution)
- Skip test directories in glob pattern if not needed

### Adding New Reference Types
- Edit `java-indexer/ReferenceExtractor.java` to detect new pattern
- Add kind to reference (e.g., `'annotation_usage'`)
- Handle in tools like `find_usages.ts` when displaying results
