# Agent Memory for mcp-java-indexer

This directory contains the agent's memory files for tracking progress and context across sessions.

## Project Status
- **Version**: 2.1.0
- **Type**: VS Code MCP Extension for Java Code Intelligence
- **Status**: Active Development

## Key Information
- **Main Language**: TypeScript (Node.js) + Java (Parser)
- **Architecture**: Hybrid - TypeScript MCP server + spawned Java processes
- **Build Command**: `.\build.ps1` (builds both Java JAR and TypeScript)
- **Extension Location**: `./dist/extension.js`
- **Java Parser**: `./java-indexer/target/mcp-java-indexer-1.0-SNAPSHOT-jar-with-dependencies.jar`

## Common Tasks
1. **Build**: Run `.\build.ps1` to compile everything
2. **Index Project**: Use `@java-indexer index_project` with rootDir parameter
3. **Find Symbol**: Use `@java-indexer find_symbol` with name parameter
4. **Call Graph**: Use `@java-indexer call_graph` with fqn parameter

## Known Issues & Recent Fixes
- Memory leak fixes implemented in v1.4.2, v2.0
- Performance optimizations for large projects
- Incremental indexing with file watcher
- Call graph polymorphism resolution

## Important Files
- `server/src/index.ts` - MCP server entry point
- `server/src/memory-index.ts` - In-memory index structures
- `server/src/indexer-client.ts` - Java process communication
- `java-indexer/src/main/java/` - Java parser implementation
