import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from './memory-index.js';
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
const memoryIndex = new MemoryIndex();
const indexerClient = new IndexerClient();
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
    codeGenerationTool
  ];

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'index_project':
        return await handleIndexProject(args, memoryIndex, indexerClient, (watcher) => {
          fsWatcher = watcher;
        });

      case 'reindex_file':
        return await handleReindexFile(args, memoryIndex, indexerClient);

      case 'find_symbol':
        return await handleFindSymbol(args, memoryIndex);

      case 'find_usages':
        return await handleFindUsages(args, memoryIndex);

      case 'call_graph':
        return await handleCallGraph(args, memoryIndex);

      case 'goto_definition':
        return await handleGotoDefinition(args, memoryIndex);

      case 'search_text':
        return await handleSearchText(args, memoryIndex);

      case 'analyze_impact':
        return await handleAnalyzeImpact(args, memoryIndex);

      case 'semantic_search':
        return await handleSemanticSearch(args, memoryIndex);

      case 'explain_code':
        return await handleExplainCode(args, memoryIndex);

      case 'test_coverage':
        return await handleTestCoverage(args, memoryIndex);

      case 'refactoring_suggestions':
        return await handleRefactoringSuggestions(args, memoryIndex);

      case 'code_generation':
        return await handleCodeGeneration(args, memoryIndex);

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
