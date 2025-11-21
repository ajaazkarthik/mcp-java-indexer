import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { glob } from 'glob';
import * as path from 'path';
import { MemoryIndex } from '../memory-index.js';
import { IndexerClient } from '../indexer-client.js';
import { Persistence } from '../persistence.js';
import { FileSystemWatcher } from '../fs-watcher.js';

export const indexProjectTool: Tool = {
  name: 'index_project',
  description: 'Recursively scan and index all .java files in a project directory. Builds full in-memory index with symbols, call graphs, and references. Persists to .mcp-index/',
  inputSchema: {
    type: 'object',
    properties: {
      rootDir: {
        type: 'string',
        description: 'Root directory of the Java project to index'
      },
      sourceRoots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of source root directories (relative to rootDir) for better type resolution. Defaults to ["src/main/java", "src"]'
      }
    },
    required: ['rootDir']
  }
};

export async function handleIndexProject(
  args: any,
  memoryIndex: MemoryIndex,
  indexerClient: IndexerClient,
  setWatcher: (watcher: FileSystemWatcher) => void
) {
  const rootDir = args.rootDir as string;
  const sourceRoots = (args.sourceRoots as string[]) || ['src/main/java', 'src'];

  try {
    const startTime = Date.now();

    // Clear existing index
    memoryIndex.clear();
    memoryIndex.setIndexDir(rootDir);

    // Start Java indexer process
    await indexerClient.start();

    // Find all Java files
    const pattern = path.join(rootDir, '**/*.java').replace(/\\/g, '/');
    const javaFiles = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });

    if (javaFiles.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No Java files found in ${rootDir}`
        }]
      };
    }

    // Convert source roots to absolute paths
    const absoluteSourceRoots = sourceRoots.map(sr => path.join(rootDir, sr).replace(/\\/g, '/'));

    // Index files in batches
    const batchSize = 50;
    let totalSymbols = 0;
    let totalReferences = 0;

    for (let i = 0; i < javaFiles.length; i += batchSize) {
      const batch = javaFiles.slice(i, Math.min(i + batchSize, javaFiles.length));
      
      const results = await indexerClient.indexFiles(batch, absoluteSourceRoots);

      for (const result of results) {
        if (result.error) {
          console.error(`Error indexing ${result.file}: ${result.error}`);
          continue;
        }

        const symbolFqns: string[] = [];
        
        for (const symbol of result.symbols) {
          memoryIndex.addSymbol(symbol);
          symbolFqns.push(symbol.fqn);
          totalSymbols++;
        }

        for (const ref of result.references) {
          memoryIndex.addReference(ref);
          totalReferences++;
        }

        const hash = await MemoryIndex.calculateFileHash(result.file);
        memoryIndex.addFile(result.file, hash, symbolFqns);
      }

      console.error(`Indexed ${Math.min(i + batchSize, javaFiles.length)}/${javaFiles.length} files...`);
    }

    // Persist index
    const persistence = new Persistence(memoryIndex.getIndexDir());
    await persistence.save(memoryIndex);

    // Start file watcher
    const watcher = new FileSystemWatcher(rootDir, absoluteSourceRoots, memoryIndex, indexerClient, persistence);
    watcher.start();
    setWatcher(watcher);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const stats = memoryIndex.getStats();

    return {
      content: [{
        type: 'text',
        text: `✅ Indexed ${javaFiles.length} Java files in ${elapsedTime}s

📊 Statistics:
  • Symbols: ${stats.symbols}
  • Files: ${stats.files}
  • References: ${stats.references}
  • Call Graph Edges: ${stats.callGraphEdges}
  • Inheritance Relations: ${stats.inheritanceRelations}

💾 Index persisted to: ${memoryIndex.getIndexDir()}
👁️ File watcher enabled for incremental updates`
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to index project: ${errorMessage}`
      }],
      isError: true
    };
  }
}
