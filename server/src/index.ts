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

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    indexProjectTool,
    reindexFileTool,
    findSymbolTool,
    findUsagesTool,
    callGraphTool,
    gotoDefinitionTool,
    searchTextTool
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
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
