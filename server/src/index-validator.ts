import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { MemoryIndex } from './memory-index.js';
import { IndexerClient } from './indexer-client.js';
import { Persistence } from './persistence.js';

export interface StaleCheckResult {
  isStale: boolean;
  changedFiles: string[];
  deletedFiles: string[];
  newFiles: string[];
  checkDuration: number;
}

export interface RefreshResult {
  refreshed: boolean;
  filesUpdated: number;
  filesDeleted: number;
  filesAdded: number;
  duration: number;
  skipped: boolean;
  reason?: string;
}

/**
 * IndexValidator - On-demand index staleness checking
 * 
 * Instead of continuous file watching (which causes CPU/memory spikes during
 * builds like `mvn clean build`), this class provides lazy validation:
 * 
 * 1. Uses file mtime (modification time) for fast staleness detection
 * 2. Only calculates hash when actually reindexing
 * 3. Batches reindex operations to prevent overwhelming the system
 * 4. Includes cooldown to prevent too-frequent checks
 */
export class IndexValidator {
  private lastCheckTime: number = 0;
  private lastRefreshTime: number = 0;
  private isRefreshing: boolean = false;
  private rootDir: string = '';
  private sourceRoots: string[] = [];
  
  // Configuration
  private readonly CHECK_COOLDOWN_MS = 5000; // Don't check more than once per 5s
  private readonly REFRESH_COOLDOWN_MS = 10000; // Don't refresh more than once per 10s
  private readonly MAX_BATCH_SIZE = 50; // Max files to reindex in one batch
  private readonly BULK_CHANGE_THRESHOLD = 100; // If more files changed, suggest full reindex
  
  constructor() {}

  /**
   * Configure the validator with project root and source roots
   */
  configure(rootDir: string, sourceRoots: string[]): void {
    this.rootDir = rootDir;
    this.sourceRoots = sourceRoots;
  }

  /**
   * Check if the index is stale by comparing file mtimes
   * This is FAST - uses fs.stat() instead of reading file content
   */
  async checkStaleness(memoryIndex: MemoryIndex): Promise<StaleCheckResult> {
    const startTime = Date.now();
    const result: StaleCheckResult = {
      isStale: false,
      changedFiles: [],
      deletedFiles: [],
      newFiles: [],
      checkDuration: 0
    };

    // Cooldown check
    if (Date.now() - this.lastCheckTime < this.CHECK_COOLDOWN_MS) {
      result.checkDuration = Date.now() - startTime;
      return result; // Return not stale if checked recently
    }

    this.lastCheckTime = Date.now();

    if (!this.rootDir) {
      result.checkDuration = Date.now() - startTime;
      return result;
    }

    try {
      // Get all currently indexed files
      const indexedFiles = memoryIndex.getAllFiles();
      const indexedFileMap = new Map(indexedFiles.map(f => [f.path, f]));

      // Find all current Java files on disk
      const pattern = path.join(this.rootDir, '**/*.java').replace(/\\/g, '/');
      const currentFiles = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
      });

      const currentFileSet = new Set(currentFiles);

      // Check for deleted files
      for (const indexedFile of indexedFiles) {
        if (!currentFileSet.has(indexedFile.path)) {
          result.deletedFiles.push(indexedFile.path);
        }
      }

      // Check for new and changed files using mtime
      const mtimeChecks = currentFiles.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const currentMtime = stats.mtimeMs;
          
          const indexedFile = indexedFileMap.get(filePath);
          if (!indexedFile) {
            // New file
            return { type: 'new' as const, path: filePath };
          }
          
          // Check if mtime differs (file was modified)
          const indexedMtime = indexedFile.mtime || indexedFile.lastIndexed;
          if (currentMtime > indexedMtime) {
            return { type: 'changed' as const, path: filePath };
          }
          
          return null;
        } catch {
          // File might have been deleted between glob and stat
          return null;
        }
      });

      const mtimeResults = await Promise.all(mtimeChecks);
      
      for (const mtimeResult of mtimeResults) {
        if (mtimeResult) {
          if (mtimeResult.type === 'new') {
            result.newFiles.push(mtimeResult.path);
          } else if (mtimeResult.type === 'changed') {
            result.changedFiles.push(mtimeResult.path);
          }
        }
      }

      result.isStale = result.changedFiles.length > 0 || 
                       result.deletedFiles.length > 0 || 
                       result.newFiles.length > 0;

      result.checkDuration = Date.now() - startTime;
      
      if (result.isStale) {
        console.error(`[IndexValidator] Staleness check: ${result.changedFiles.length} changed, ${result.newFiles.length} new, ${result.deletedFiles.length} deleted (${result.checkDuration}ms)`);
      }

      return result;
    } catch (error) {
      console.error('[IndexValidator] Error checking staleness:', error);
      result.checkDuration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Refresh the index by reindexing changed files
   * Includes protection against bulk changes (like during mvn clean build)
   */
  async refreshIndex(
    staleResult: StaleCheckResult,
    memoryIndex: MemoryIndex,
    indexerClient: IndexerClient,
    persistence: Persistence
  ): Promise<RefreshResult> {
    const startTime = Date.now();
    const result: RefreshResult = {
      refreshed: false,
      filesUpdated: 0,
      filesDeleted: 0,
      filesAdded: 0,
      duration: 0,
      skipped: false
    };

    // If already refreshing, skip
    if (this.isRefreshing) {
      result.skipped = true;
      result.reason = 'Refresh already in progress';
      result.duration = Date.now() - startTime;
      return result;
    }

    // Cooldown check
    if (Date.now() - this.lastRefreshTime < this.REFRESH_COOLDOWN_MS) {
      result.skipped = true;
      result.reason = 'Refresh cooldown active';
      result.duration = Date.now() - startTime;
      return result;
    }

    // Check for bulk changes (like mvn clean build)
    const totalChanges = staleResult.changedFiles.length + 
                         staleResult.newFiles.length + 
                         staleResult.deletedFiles.length;
    
    if (totalChanges > this.BULK_CHANGE_THRESHOLD) {
      result.skipped = true;
      result.reason = `Too many changes detected (${totalChanges}). Please run index_project to rebuild.`;
      result.duration = Date.now() - startTime;
      console.error(`[IndexValidator] Bulk change detected: ${totalChanges} files. Skipping auto-refresh.`);
      return result;
    }

    this.isRefreshing = true;
    this.lastRefreshTime = Date.now();

    try {
      // Handle deleted files first
      for (const deletedPath of staleResult.deletedFiles) {
        memoryIndex.removeFile(deletedPath);
        result.filesDeleted++;
      }

      // Combine changed and new files for reindexing
      const filesToReindex = [...staleResult.changedFiles, ...staleResult.newFiles];
      
      if (filesToReindex.length > 0) {
        // Ensure indexer client is started
        try {
          await indexerClient.start();
        } catch {
          // Already started, ignore
        }

        const absoluteSourceRoots = this.sourceRoots.map(sr => 
          path.join(this.rootDir, sr).replace(/\\/g, '/')
        );

        // Process in batches
        for (let i = 0; i < filesToReindex.length; i += this.MAX_BATCH_SIZE) {
          const batch = filesToReindex.slice(i, Math.min(i + this.MAX_BATCH_SIZE, filesToReindex.length));
          
          try {
            const results = await indexerClient.indexFiles(batch, absoluteSourceRoots);
            
            for (const indexResult of results) {
              if (indexResult.error) {
                console.error(`[IndexValidator] Error indexing ${indexResult.file}: ${indexResult.error}`);
                continue;
              }

              // Remove old data if this is a changed file
              if (staleResult.changedFiles.includes(indexResult.file)) {
                memoryIndex.removeFile(indexResult.file);
              }

              // Add new data
              const symbolFqns: string[] = [];
              for (const symbol of indexResult.symbols) {
                memoryIndex.addSymbol(symbol);
                symbolFqns.push(symbol.fqn);
              }

              for (const ref of indexResult.references) {
                memoryIndex.addReference(ref);
              }

              // Get current mtime and hash
              const stats = await fs.stat(indexResult.file);
              const hash = await MemoryIndex.calculateFileHash(indexResult.file);
              memoryIndex.addFile(indexResult.file, hash, symbolFqns, true, stats.mtimeMs);

              if (staleResult.newFiles.includes(indexResult.file)) {
                result.filesAdded++;
              } else {
                result.filesUpdated++;
              }
            }
          } catch (error) {
            console.error(`[IndexValidator] Batch indexing error:`, error);
          }
        }

        // Persist changes
        try {
          await persistence.save(memoryIndex);
        } catch (error) {
          console.error('[IndexValidator] Failed to persist index:', error);
        }
      }

      result.refreshed = true;
      result.duration = Date.now() - startTime;
      
      console.error(`[IndexValidator] Refresh complete: ${result.filesUpdated} updated, ${result.filesAdded} added, ${result.filesDeleted} deleted (${result.duration}ms)`);

      return result;
    } catch (error) {
      console.error('[IndexValidator] Refresh error:', error);
      result.duration = Date.now() - startTime;
      return result;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Quick check and refresh if needed
   * This is the main entry point for tool handlers
   */
  async ensureFresh(
    memoryIndex: MemoryIndex,
    indexerClient: IndexerClient,
    persistence: Persistence
  ): Promise<{ wasStale: boolean; refreshResult?: RefreshResult }> {
    const staleResult = await this.checkStaleness(memoryIndex);
    
    if (!staleResult.isStale) {
      return { wasStale: false };
    }

    const refreshResult = await this.refreshIndex(staleResult, memoryIndex, indexerClient, persistence);
    
    return { wasStale: true, refreshResult };
  }

  /**
   * Force a staleness check, ignoring cooldown
   */
  async forceCheck(memoryIndex: MemoryIndex): Promise<StaleCheckResult> {
    this.lastCheckTime = 0; // Reset cooldown
    return this.checkStaleness(memoryIndex);
  }

  /**
   * Reset all cooldowns (useful after explicit index_project call)
   */
  resetCooldowns(): void {
    this.lastCheckTime = 0;
    this.lastRefreshTime = 0;
  }
}

// Singleton instance
let validatorInstance: IndexValidator | null = null;

export function getIndexValidator(): IndexValidator {
  if (!validatorInstance) {
    validatorInstance = new IndexValidator();
  }
  return validatorInstance;
}
