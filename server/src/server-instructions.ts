/**
 * Server Instructions for AI Agents
 * 
 * These instructions help AI agents understand how to effectively use
 * the MCP Java Indexer tools for code analysis and navigation.
 */

export const serverInstructions = `
# MCP Java Indexer - AI Agent Guide

A powerful Java code analysis server providing IntelliJ-style indexing, call graphs, and semantic search.

## 🚀 Quick Start Workflow

1. **Index First**: Always start with \`index_project\` to build the code index
2. **Search/Find**: Use \`find_symbol\` or \`semantic_search\` to locate code
3. **Analyze**: Use \`call_graph\`, \`find_usages\`, \`analyze_impact\` for deep analysis
4. **Understand**: Use \`explain_code\` for natural language explanations

## 📝 FQN (Fully Qualified Name) Format

Java symbols are identified by their fully qualified names:

| Symbol Type | Format | Example |
|-------------|--------|---------|
| Package | \`com.example\` | \`com.example.service\` |
| Class | \`package.ClassName\` | \`com.example.UserService\` |
| Method | \`package.Class.method(ParamTypes)\` | \`com.example.UserService.save(User)\` |
| Field | \`package.Class.fieldName\` | \`com.example.UserService.repository\` |
| Constructor | \`package.Class.<init>(ParamTypes)\` | \`com.example.User.<init>(String)\` |

**Tips:**
- Use simple names for broad searches: \`UserService\`, \`save\`
- Use full FQN for exact matches: \`com.example.service.UserService\`
- Method signatures include parameter types in parentheses

## 🔄 Common Agent Workflows

### Understanding a Class
\`\`\`
1. find_symbol(name: "ClassName") → Get location and structure
2. explain_code(fqn: "com.example.ClassName") → Natural language explanation
3. call_graph(fqn: "com.example.ClassName.mainMethod") → See dependencies
\`\`\`

### Safe Refactoring
\`\`\`
1. find_symbol(name: "MethodToRefactor") → Find the symbol
2. analyze_impact(fqn: "full.fqn.here") → Assess risk and dependencies
3. find_usages(fqn: "full.fqn.here") → Find all callers to update
4. refactoring_suggestions(fqn: "full.fqn.here") → Get improvement suggestions
\`\`\`

### Finding Related Code
\`\`\`
1. semantic_search(query: "database save operations") → Find by intent
2. find_usages(fqn: "found.symbol.fqn") → Trace usage patterns
3. call_graph(fqn: "found.symbol.fqn") → See call relationships
\`\`\`

### Debugging/Tracing
\`\`\`
1. call_graph(fqn: "problematic.method") → See what it calls (outbound)
2. call_graph(fqn: "problematic.method") → See what calls it (inbound)
3. find_usages(fqn: "relevant.symbol") → Find all references
\`\`\`

## 🛠️ Tool Categories

### Read-Only Analysis Tools (Safe)
- \`find_symbol\` - Locate symbol definitions
- \`find_usages\` - Find all references to a symbol
- \`call_graph\` - Analyze method call relationships
- \`goto_definition\` - Navigate to symbol definition
- \`search_text\` - Grep-style text search
- \`semantic_search\` - Intent-based code search
- \`explain_code\` - Natural language code explanation
- \`analyze_impact\` - Change impact assessment
- \`test_coverage\` - Test coverage analysis
- \`refactoring_suggestions\` - Code improvement suggestions
- \`code_generation\` - Generate boilerplate code

### Index Management Tools
- \`index_project\` - Build/rebuild project index (idempotent)
- \`reindex_file\` - Update single file in index (idempotent)
- \`compact_index\` - Clean up and optimize index memory

## ⚡ Performance Tips

1. **Index once, query many**: \`index_project\` only needs to run once per session
2. **Use incremental updates**: \`reindex_file\` for single file changes
3. **Start specific**: Use FQN over simple names when known
4. **Batch when possible**: Plan multiple queries before executing

## 🎯 Best Practices for Agents

1. **Always verify FQN**: Use \`find_symbol\` to confirm exact FQN before other tools
2. **Check impact before changes**: Use \`analyze_impact\` before suggesting modifications
3. **Understand context**: Use \`explain_code\` to understand unfamiliar code
4. **Follow patterns**: Use \`semantic_search\` to find similar implementations
5. **Validate existence**: If a tool returns "symbol not found", try \`find_symbol\` with partial name
`;
