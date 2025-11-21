import chokidar from 'chokidar';
import { MemoryIndex } from './memory-index.js';
import { IndexerClient } from './indexer-client.js';
import { Persistence } from './persistence.js';

export class FileSystemWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private memoryIndex: MemoryIndex;
  private indexerClient: IndexerClient;
  private persistence: Persistence;
  private rootDir: string;
  private sourceRoots: string[];

  constructor(
    rootDir: string,
    sourceRoots: string[],
    memoryIndex: MemoryIndex,
    indexerClient: IndexerClient,
    persistence: Persistence
  ) {
    this.rootDir = rootDir;
    this.sourceRoots = sourceRoots;
    this.memoryIndex = memoryIndex;
    this.indexerClient = indexerClient;
    this.persistence = persistence;
  }

  // Start watching
  start(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch('**/*.java', {
      cwd: this.rootDir,
      ignored: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**'],
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', (path) => this.handleFileChange(path))
      .on('change', (path) => this.handleFileChange(path))
      .on('unlink', (path) => this.handleFileDelete(path));

    console.error(`File watcher started for ${this.rootDir}`);
  }

  // Stop watching
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.error('File watcher stopped');
    }
  }

  // Handle file change
  private async handleFileChange(relativePath: string): Promise<void> {
    const fullPath = `${this.rootDir}/${relativePath}`.replace(/\\/g, '/');
    
    try {
      // Check if file needs reindexing
      const needsReindex = await this.memoryIndex.needsReindex(fullPath);
      if (!needsReindex) {
        return;
      }

      console.error(`Reindexing changed file: ${fullPath}`);

      // Remove old data
      this.memoryIndex.removeFile(fullPath);

      // Reindex file
      const result = await this.indexerClient.indexFile(fullPath, this.sourceRoots);

      if (result.error) {
        console.error(`Failed to reindex ${fullPath}: ${result.error}`);
        return;
      }

      // Add new data
      const symbolFqns: string[] = [];
      for (const symbol of result.symbols) {
        this.memoryIndex.addSymbol(symbol);
        symbolFqns.push(symbol.fqn);
      }

      for (const ref of result.references) {
        this.memoryIndex.addReference(ref);
      }

      const hash = await MemoryIndex.calculateFileHash(fullPath);
      this.memoryIndex.addFile(fullPath, hash, symbolFqns);

      // Persist changes
      await this.persistence.save(this.memoryIndex);

      console.error(`Reindexed ${fullPath}: ${result.symbols.length} symbols, ${result.references.length} references`);
    } catch (error) {
      console.error(`Error reindexing ${fullPath}:`, error);
    }
  }

  // Handle file deletion
  private async handleFileDelete(relativePath: string): Promise<void> {
    const fullPath = `${this.rootDir}/${relativePath}`.replace(/\\/g, '/');
    
    try {
      console.error(`Removing deleted file from index: ${fullPath}`);
      
      this.memoryIndex.removeFile(fullPath);
      await this.persistence.save(this.memoryIndex);
      
      console.error(`Removed ${fullPath} from index`);
    } catch (error) {
      console.error(`Error removing ${fullPath}:`, error);
    }
  }
}
