import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';
import { IndexerClient } from '../indexer-client.js';
import { Persistence } from '../persistence.js';
import * as path from 'path';
import * as fs from 'fs/promises';

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
  indexerClient: IndexerClient,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  const filePath = args.filePath as string;
  // Only use sourceRoots if explicitly provided; empty array reduces overhead
  const sourceRoots = (args.sourceRoots as string[]) || [];

  try {
    const startTime = Date.now();

    // Check if file exists in index
    const oldFileInfo = memoryIndex.getFile(filePath);

    // Remove old data
    if (oldFileInfo) {
      memoryIndex.removeFile(filePath);
    }

    // Reindex file - Skip full type resolution if sourceRoots not provided
    // This dramatically speeds up single file reindexing (43s -> <1s)
    const result = await indexerClient.indexFile(filePath, sourceRoots);
    signal?.throwIfAborted();

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
    const stats = await fs.stat(filePath);
    const mtime = typeof stats.mtimeMs === 'number' ? stats.mtimeMs : stats.mtime.getTime();
    memoryIndex.addFile(filePath, hash, symbolFqns, true, mtime);

    // Persist changes - use incremental save for massive performance improvement
    // FIX: Changed from full save() to saveFileIncremental() (14 min -> <10 sec)
    const persistence = new Persistence(memoryIndex.getIndexDir());
    
    // CRITICAL: Flush all pending writes to storage
    if ((memoryIndex as any).flush) {
      await (memoryIndex as any).flush();
    }
    
    // Use incremental save - only saves this file's data, not the entire 629K symbol index
    const fileInfo = {
      path: filePath,
      hash,
      lastIndexed: Date.now(),
      mtime,
      symbols: symbolFqns
    };
    await persistence.saveFileIncremental(filePath, result.symbols, result.references, fileInfo);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      content: [{
        type: 'text',
        text: `✅ Reindexed ${path.basename(filePath)} in ${elapsedTime}s

📊 Updated:
  • Symbols: ${result.symbols.length}
  • References: ${result.references.length}

Symbols found:
${result.symbols.map(s => `  • ${s.kind}: ${s.fqn}`).join('\n')}

${sourceRoots.length === 0 ? '💡 Tip: Provide sourceRoots for better type resolution (trades speed for accuracy)' : ''}`
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
