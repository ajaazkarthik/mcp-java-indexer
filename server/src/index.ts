import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from './memory-index.js';
import { IndexerClient } from './indexer-client.js';
import { FileSystemWatcher } from './fs-watcher.js';
import { getIndexValidator } from './index-validator.js';
import { Persistence } from './persistence.js';
import { serverInstructions } from './server-instructions.js';
import { annotateTools } from './tool-annotations.js';
import { indexProjectTool, handleIndexProject } from './tools/index_project.js';
import { reindexFileTool, handleReindexFile } from './tools/reindex_file.js';
import { findSymbolTool, handleFindSymbol } from './tools/find_symbol.js';
import { findUsagesTool, handleFindUsages } from './tools/find_usages.js';
import { callGraphTool, handleCallGraph } from './tools/call_graph.js';
import { gotoDefinitionTool, handleGotoDefinition } from './tools/goto_definition.js';
import { searchTextTool, handleSearchText } from './tools/search_text.js';
import { analyzeImpactTool, handleAnalyzeImpact } from './tools/analyze_impact.js';
import { semanticSearchTool, handleSemanticSearch } from './tools/semantic_search.js';
import { explainCodeTool, handleExplainCode } from './tools/explain_code.js';
import { testCoverageTool, handleTestCoverage } from './tools/test_coverage.js';
import { refactoringSuggestionsTool, handleRefactoringSuggestions } from './tools/refactoring_suggestions.js';
import { codeGenerationTool, handleCodeGeneration } from './tools/code_generation.js';
import { compactIndexTool, handleCompactIndex } from './tools/compact_index.js';
import { exploreClassTool, handleExploreClass } from './tools/explore_class.js';
import { batchQueryTool, handleBatchQuery } from './tools/batch_query.js';
import { scanMigrationCandidatesTool, handleScanMigrationCandidates } from './tools/scan_migration_candidates.js';
import { exploreCodebaseTool, handleExploreCodebase } from './tools/explore_codebase.js';

const server = new Server(
  {
    name: 'mcp-java-indexer',
    version: '2.6.3',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Global state
const memoryIndex = new MemoryIndex();
const indexerClient = new IndexerClient();
const indexValidator = getIndexValidator();
let persistence: Persistence | null = null;
let fsWatcher: FileSystemWatcher | null = null;

// Memory monitoring and cleanup
let maintenanceInterval: NodeJS.Timeout | null = null;

// Setup periodic maintenance (every 30 minutes)
function startMaintenanceSchedule(): void {
  if (maintenanceInterval) return;
  
  maintenanceInterval = setInterval(() => {
    console.error('Running periodic maintenance cleanup...');
    
    try {
      // Cleanup orphaned data
      memoryIndex.performMaintenanceCleanup();
      
      // Log memory stats
      const stats = memoryIndex.getStats();
      const clientStats = indexerClient.getMemoryStats();
      const memUsage = process.memoryUsage();
      
      console.error('Memory stats:', {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        symbols: stats.symbols,
        references: stats.references,
        pendingRequests: clientStats.pendingRequests,
        bufferSize: `${Math.round(clientStats.bufferSize / 1024)}KB`
      });
      
      // Warn if memory is high
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      if (heapUsedMB > 3072) { // 3GB warning threshold
        console.error(`⚠️  WARNING: High memory usage (${Math.round(heapUsedMB)}MB). Consider restarting.`);
      }
    } catch (error) {
      console.error('Maintenance cleanup error:', error);
    }
  }, 30 * 60 * 1000); // 30 minutes
  
  console.error('Maintenance schedule started (runs every 30 minutes)');
}

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully...');
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  if (fsWatcher) fsWatcher.stop();
  await indexerClient.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully...');
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  if (fsWatcher) fsWatcher.stop();
  await indexerClient.stop();
  process.exit(0);
});

// List available tools with annotations
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    indexProjectTool,
    reindexFileTool,
    findSymbolTool,
    findUsagesTool,
    callGraphTool,
    gotoDefinitionTool,
    searchTextTool,
    analyzeImpactTool,
    semanticSearchTool,
    explainCodeTool,
    testCoverageTool,
    refactoringSuggestionsTool,
    codeGenerationTool,
    compactIndexTool,
    exploreClassTool,
    batchQueryTool,
    scanMigrationCandidatesTool,
    exploreCodebaseTool
  ];

  // Add tool annotations for agent safety hints
  return { tools: annotateTools(tools) };
});

// List available resources (index data)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const stats = memoryIndex.getStats();
  
  return {
    resources: [
      {
        uri: 'java-index://stats',
        name: 'Index Statistics',
        description: 'Current state of the Java code index',
        mimeType: 'application/json'
      },
      {
        uri: 'java-index://symbols',
        name: 'Indexed Symbols',
        description: `All ${stats.symbols} indexed Java symbols (classes, methods, fields)`,
        mimeType: 'application/json'
      },
      {
        uri: 'java-index://files',
        name: 'Indexed Files',
        description: `All ${stats.files} indexed Java files`,
        mimeType: 'application/json'
      }
    ]
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const stats = memoryIndex.getStats();

  switch (uri) {
    case 'java-index://stats':
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            symbols: stats.symbols,
            files: stats.files,
            references: stats.references,
            callGraphEdges: stats.callGraphEdges,
            inheritanceRelations: stats.inheritanceRelations,
            indexedAt: new Date().toISOString()
          }, null, 2)
        }]
      };
    
    case 'java-index://symbols':
      // Return summary of symbols by kind
      const symbolSummary = memoryIndex.getSymbolSummary();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(symbolSummary, null, 2)
        }]
      };
    
    case 'java-index://files':
      // Return list of indexed files
      const files = memoryIndex.getIndexedFiles();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            count: files.length,
            files: files.slice(0, 100), // Limit to first 100
            truncated: files.length > 100
          }, null, 2)
        }]
      };
    
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// List available prompts (reusable workflows)
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'understand-class',
        description: 'Deep dive into a Java class: structure, dependencies, usage patterns',
        arguments: [
          { name: 'className', description: 'Class name or FQN to analyze', required: true }
        ]
      },
      {
        name: 'refactor-safely',
        description: 'Analyze a symbol for safe refactoring: impact, usages, risk assessment',
        arguments: [
          { name: 'symbolFqn', description: 'FQN of symbol to refactor', required: true }
        ]
      },
      {
        name: 'find-pattern',
        description: 'Find code following a specific pattern or intent',
        arguments: [
          { name: 'pattern', description: 'Pattern description (e.g., "repository save methods")', required: true }
        ]
      },
      {
        name: 'trace-flow',
        description: 'Trace data/control flow through a method',
        arguments: [
          { name: 'methodFqn', description: 'FQN of method to trace', required: true }
        ]
      }
    ]
  };
});

// Get prompt content
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'understand-class':
      return {
        description: `Analyze the Java class: ${args?.className}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to understand the Java class "${args?.className}". Please:

1. First, use find_symbol to locate the class
2. Use explain_code to get a natural language explanation
3. Use call_graph on key methods to understand dependencies
4. Summarize: purpose, key methods, dependencies, usage patterns

Start by finding the class.`
            }
          }
        ]
      };
    
    case 'refactor-safely':
      return {
        description: `Safe refactoring analysis for: ${args?.symbolFqn}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to refactor "${args?.symbolFqn}" safely. Please:

1. Use find_symbol to verify the symbol exists and get its details
2. Use analyze_impact to assess the risk and dependencies
3. Use find_usages to find all places that need updating
4. Use refactoring_suggestions to get improvement recommendations
5. Provide a safe refactoring plan with steps and risks

Start by finding the symbol.`
            }
          }
        ]
      };
    
    case 'find-pattern':
      return {
        description: `Find code matching pattern: ${args?.pattern}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I'm looking for code that: "${args?.pattern}". Please:

1. Use semantic_search to find relevant symbols
2. For the top results, use explain_code to understand them
3. Show examples of how they're used (find_usages)
4. Summarize the common patterns found

Start with semantic search.`
            }
          }
        ]
      };
    
    case 'trace-flow':
      return {
        description: `Trace flow through: ${args?.methodFqn}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to trace the flow through "${args?.methodFqn}". Please:

1. Use find_symbol to locate and understand the method
2. Use call_graph to see what it calls (outbound)
3. Use call_graph to see what calls it (inbound)
4. For key called methods, explain their purpose
5. Create a flow diagram or summary of the execution path

Start by finding the method.`
            }
          }
        ]
      };
    
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Helper function for on-demand index validation (query tools only)
  const ensureFreshIndex = async (): Promise<string | null> => {
    if (!persistence) return null;
    
    try {
      const result = await indexValidator.ensureFresh(memoryIndex, indexerClient, persistence);
      if (result.wasStale && result.refreshResult && !result.refreshResult.skipped) {
        const r = result.refreshResult;
        return `🔄 Auto-refreshed index: ${r.filesUpdated} updated, ${r.filesAdded} added, ${r.filesDeleted} deleted (${r.duration}ms)\n\n`;
      } else if (result.wasStale && result.refreshResult?.skipped) {
        return `⚠️ Index may be stale: ${result.refreshResult.reason}\n\n`;
      }
    } catch (error) {
      console.error('[ensureFreshIndex] Error:', error);
    }
    return null;
  };

  try {
    switch (name) {
      case 'index_project':
        const indexResult = await handleIndexProject(args, memoryIndex, indexerClient, (watcher, newPersistence) => {
          fsWatcher = watcher;
          persistence = newPersistence;
          // Configure the validator with project info
          const rootDir = args?.rootDir as string;
          const sourceRoots = (args?.sourceRoots as string[]) || ['src/main/java', 'src'];
          indexValidator.configure(rootDir, sourceRoots);
          indexValidator.resetCooldowns();
        });
        return indexResult;

      case 'reindex_file':
        return await handleReindexFile(args, memoryIndex, indexerClient);

      case 'find_symbol': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleFindSymbol(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'find_usages': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleFindUsages(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'call_graph': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleCallGraph(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'goto_definition': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleGotoDefinition(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'search_text': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleSearchText(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'analyze_impact': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleAnalyzeImpact(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'semantic_search': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleSemanticSearch(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'explain_code': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleExplainCode(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'test_coverage': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleTestCoverage(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'refactoring_suggestions':
        return await handleRefactoringSuggestions(args, memoryIndex);

      case 'code_generation':
        return await handleCodeGeneration(args, memoryIndex);

      case 'compact_index':
        return await handleCompactIndex(args, memoryIndex);

      case 'explore_class': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleExploreClass(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'batch_query': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleBatchQuery(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'scan_migration_candidates': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleScanMigrationCandidates(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      case 'explore_codebase': {
        const refreshMsg = await ensureFreshIndex();
        const result = await handleExploreCodebase(args, memoryIndex);
        if (refreshMsg && result.content?.[0]?.type === 'text') {
          result.content[0].text = refreshMsg + result.content[0].text;
        }
        return result;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Java Indexer server running on stdio');
  
  // Start maintenance schedule after server is running
  startMaintenanceSchedule();
  
  // Log initial memory
  const memUsage = process.memoryUsage();
  console.error('Initial memory:', {
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
