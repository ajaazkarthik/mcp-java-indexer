import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from './memory-index.js';
import { MemoryIndexWithStorage } from './memory-index-storage.js';
import { IndexerClient } from './indexer-client.js';
import { FileSystemWatcher } from './fs-watcher.js';
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
import { withTiming } from './utils/timing.js';

const server = new Server(
  {
    name: 'mcp-java-indexer',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Global state
// Storage backend enabled by default for better memory efficiency
// Set ENABLE_STORAGE=0 to use legacy in-memory index
const USE_STORAGE = process.env.ENABLE_STORAGE !== '0';
const memoryIndex: MemoryIndex = USE_STORAGE 
  ? (new MemoryIndexWithStorage() as any as MemoryIndex) // Type cast for compatibility
  : new MemoryIndex();

if (USE_STORAGE) {
  console.error('🚀 Storage backend enabled by default - using SQLite for memory efficiency');
} else {
  console.error('📦 Using legacy in-memory index (set ENABLE_STORAGE=1 to enable storage)');
}

const indexerClient = new IndexerClient();
let fsWatcher: FileSystemWatcher | null = null;

// Memory monitoring and cleanup
let maintenanceInterval: NodeJS.Timeout | null = null;

// Setup periodic maintenance (every 15 minutes for aggressive memory management)
function startMaintenanceSchedule(): void {
  if (maintenanceInterval) return;
  
  maintenanceInterval = setInterval(() => {
    console.error('Running periodic maintenance cleanup...');
    
    try {
      const beforeMem = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Skip cleanup if there are pending indexer requests (avoid interference)
      const clientStats = indexerClient.getMemoryStats();
      if (clientStats.pendingRequests > 0) {
        console.error(`Skipping maintenance cleanup: ${clientStats.pendingRequests} pending requests`);
        return;
      }
      
      // Cleanup orphaned data
      memoryIndex.performMaintenanceCleanup();
      
      // Force GC if available
      if (global.gc) {
        global.gc();
      }
      
      const afterMem = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Log memory stats
      const stats = memoryIndex.getStats();
      const memUsage = process.memoryUsage();
      
      console.error('Memory stats:', {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        symbols: stats.symbols,
        indexedFiles: stats.indexedFiles,
        allFiles: stats.allFiles,
        references: stats.references,
        pendingRequests: clientStats.pendingRequests,
        bufferSize: `${Math.round(clientStats.bufferSize / 1024)}KB`,
        cleanupFreed: `${(beforeMem - afterMem).toFixed(1)}MB`
      });
      
      // Warn if memory is high (reduced threshold to 2.5GB)
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      if (heapUsedMB > 2560) { // 2.5GB warning threshold
        console.error(`⚠️  WARNING: High memory usage (${Math.round(heapUsedMB)}MB). Consider restarting.`);
      }
      
      // CRITICAL: Force aggressive cleanup if approaching limit
      if (heapUsedMB > 4096) { // 4GB critical threshold
        console.error(`\ud83d\udea8 CRITICAL: Memory at ${Math.round(heapUsedMB)}MB - forcing aggressive cleanup`);
        memoryIndex.performMaintenanceCleanup(); // Second pass
        if (global.gc) {
          global.gc();
          global.gc();
          global.gc();
        }
      }
    } catch (error) {
      console.error('Maintenance cleanup error:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes (increased frequency)
  
  console.error('Maintenance schedule started (runs every 15 minutes)');
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

// List available tools
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
    compactIndexTool
  ];

  return { tools };
});

// Wrap all handlers with timing measurement
const timedHandlers = {
  index_project: withTiming(async (args: any, memIndex: MemoryIndex, client: IndexerClient, watcherSetter: (watcher: FileSystemWatcher) => void) => 
    handleIndexProject(args, memIndex, client, watcherSetter)),
  reindex_file: withTiming((args: any, memIndex: MemoryIndex, client: IndexerClient) => 
    handleReindexFile(args, memIndex, client)),
  find_symbol: withTiming((args: any, memIndex: MemoryIndex) => 
    handleFindSymbol(args, memIndex)),
  find_usages: withTiming((args: any, memIndex: MemoryIndex) => 
    handleFindUsages(args, memIndex)),
  call_graph: withTiming((args: any, memIndex: MemoryIndex) => 
    handleCallGraph(args, memIndex)),
  goto_definition: withTiming((args: any, memIndex: MemoryIndex) => 
    handleGotoDefinition(args, memIndex)),
  search_text: withTiming((args: any, memIndex: MemoryIndex) => 
    handleSearchText(args, memIndex)),
  analyze_impact: withTiming((args: any, memIndex: MemoryIndex) => 
    handleAnalyzeImpact(args, memIndex)),
  semantic_search: withTiming((args: any, memIndex: MemoryIndex) => 
    handleSemanticSearch(args, memIndex)),
  explain_code: withTiming((args: any, memIndex: MemoryIndex) => 
    handleExplainCode(args, memIndex)),
  test_coverage: withTiming((args: any, memIndex: MemoryIndex) => 
    handleTestCoverage(args, memIndex)),
  refactoring_suggestions: withTiming((args: any, memIndex: MemoryIndex) => 
    handleRefactoringSuggestions(args, memIndex)),
  code_generation: withTiming((args: any, memIndex: MemoryIndex) => 
    handleCodeGeneration(args, memIndex)),
  compact_index: withTiming((args: any, memIndex: MemoryIndex) => 
    handleCompactIndex(args, memIndex))
};

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'index_project':
        return await timedHandlers.index_project(args, memoryIndex, indexerClient, (watcher) => {
          fsWatcher = watcher;
        });

      case 'reindex_file':
        return await timedHandlers.reindex_file(args, memoryIndex, indexerClient);

      case 'find_symbol':
        return await timedHandlers.find_symbol(args, memoryIndex);

      case 'find_usages':
        return await timedHandlers.find_usages(args, memoryIndex);

      case 'call_graph':
        return await timedHandlers.call_graph(args, memoryIndex);

      case 'goto_definition':
        return await timedHandlers.goto_definition(args, memoryIndex);

      case 'search_text':
        return await timedHandlers.search_text(args, memoryIndex);

      case 'analyze_impact':
        return await timedHandlers.analyze_impact(args, memoryIndex);

      case 'semantic_search':
        return await timedHandlers.semantic_search(args, memoryIndex);

      case 'explain_code':
        return await timedHandlers.explain_code(args, memoryIndex);

      case 'test_coverage':
        return await timedHandlers.test_coverage(args, memoryIndex);

      case 'refactoring_suggestions':
        return await timedHandlers.refactoring_suggestions(args, memoryIndex);

      case 'code_generation':
        return await timedHandlers.code_generation(args, memoryIndex);

      case 'compact_index':
        return await timedHandlers.compact_index(args, memoryIndex);

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
