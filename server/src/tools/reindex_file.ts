import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';
import { IndexerClient } from '../indexer-client.js';
import { Persistence } from '../persistence.js';
import * as path from 'path';

export const reindexFileTool: Tool = {
  name: 'reindex_file',
  description: 'Reparse and update index for a single Java file. Use when a file has been modified.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Absolute path to the Java file to reindex'
      },
      sourceRoots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of source root directories for type resolution'
      }
    },
    required: ['filePath']
  }
};

export async function handleReindexFile(
  args: any,
  memoryIndex: MemoryIndex,
  indexerClient: IndexerClient
) {
  const filePath = args.filePath as string;
  const sourceRoots = (args.sourceRoots as string[]) || [];

  try {
    const startTime = Date.now();

    // Check if file exists in index
    const oldFileInfo = memoryIndex.getFile(filePath);

    // Remove old data
    if (oldFileInfo) {
      memoryIndex.removeFile(filePath);
    }

    // Reindex file
    const result = await indexerClient.indexFile(filePath, sourceRoots);

    if (result.error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to reindex file: ${result.error}`
        }],
        isError: true
      };
    }

    // Add new data
    const symbolFqns: string[] = [];
    for (const symbol of result.symbols) {
      memoryIndex.addSymbol(symbol);
      symbolFqns.push(symbol.fqn);
    }

    for (const ref of result.references) {
      memoryIndex.addReference(ref);
    }

    const hash = await MemoryIndex.calculateFileHash(filePath);
    memoryIndex.addFile(filePath, hash, symbolFqns);

    // Persist changes
    const persistence = new Persistence(memoryIndex.getIndexDir());
    await persistence.save(memoryIndex);

    const elapsedTime = ((Date.now() - startTime)).toFixed(0);

    return {
      content: [{
        type: 'text',
        text: `✅ Reindexed ${path.basename(filePath)} in ${elapsedTime}ms

📊 Updated:
  • Symbols: ${result.symbols.length}
  • References: ${result.references.length}

Symbols found:
${result.symbols.map(s => `  • ${s.kind}: ${s.fqn}`).join('\n')}`
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to reindex file: ${errorMessage}`
      }],
      isError: true
    };
  }
}
