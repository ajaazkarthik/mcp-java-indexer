import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { MemoryIndex } from './memory-index.js';
import { IndexerClient } from './indexer-client.js';
import { Persistence } from './persistence.js';
import { normalizePath, normalizeAbsolutePath } from './utils/path-utils.js';

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
  private lastIndexTime: number = 0; // When index_project last completed
  private isRefreshing: boolean = false;
  private rootDir: string = '';
  private sourceRoots: string[] = [];
  
  // Configuration
  private readonly CHECK_COOLDOWN_MS = 5000; // Don't check more than once per 5s
  private readonly REFRESH_COOLDOWN_MS = 10000; // Don't refresh more than once per 10s
  private readonly MAX_BATCH_SIZE: number = (() => {
    const env = process.env.MCP_MAX_BATCH_SIZE || process.env.INDEXER_MAX_BATCH_SIZE;
    const defaultVal = 500; // Increase default batch size
    const parsed = env ? parseInt(env, 10) : defaultVal;
    return Math.max(1, isNaN(parsed) ? defaultVal : parsed);
  })(); // Max files to reindex in one batch
  private readonly BULK_CHANGE_THRESHOLD = 100; // If more files changed, suggest full reindex
  private readonly POST_INDEX_GRACE_PERIOD_MS = 30000; // 30s grace period after index_project
  private readonly MTIME_TOLERANCE_MS = 2000; // 2s tolerance for mtime comparison (filesystem precision)
  
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

    // Grace period after index_project - skip stale checks entirely
    // This prevents false positives right after a fresh full index
    if (this.lastIndexTime > 0 && Date.now() - this.lastIndexTime < this.POST_INDEX_GRACE_PERIOD_MS) {
      result.checkDuration = Date.now() - startTime;
      return result; // Within grace period, assume fresh
    }

    this.lastCheckTime = Date.now();

    if (!this.rootDir) {
      result.checkDuration = Date.now() - startTime;
      return result;
    }

    try {
      // Get all currently indexed files
      const indexedFiles = memoryIndex.getAllFiles();
      // Use shared normalizePath for consistent comparison (handles Windows case sensitivity)
      const indexedFileMap = new Map(indexedFiles.map(f => [normalizePath(f.path), f]));

      // Find all current Java files on disk
      const pattern = normalizePath(path.join(this.rootDir, '**/*.java'));
      const currentFiles = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
      });

      // Normalize glob results for consistent comparison (handles Windows case sensitivity)
      const normalizedCurrentFiles = currentFiles.map(normalizeAbsolutePath);
      const currentFileSet = new Set(normalizedCurrentFiles);

      // Check for deleted files
      for (const indexedFile of indexedFiles) {
        const normalizedPath = normalizePath(indexedFile.path);
        if (!currentFileSet.has(normalizedPath)) {
          result.deletedFiles.push(indexedFile.path);
        }
      }

      // Check for new and changed files using mtime
      const mtimeChecks = normalizedCurrentFiles.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const currentMtime = stats.mtimeMs;
          
          const indexedFile = indexedFileMap.get(filePath);
          if (!indexedFile) {
            // New file
            return { type: 'new' as const, path: filePath };
          }
          
          // Check if mtime differs (file was modified)
          // Use tolerance to avoid false positives from filesystem precision issues
          const indexedMtime = indexedFile.mtime || indexedFile.lastIndexed;
          if (currentMtime > indexedMtime + this.MTIME_TOLERANCE_MS) {
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

    // DEFENSIVE CHECK: Don't report bulk changes if we're within grace period
    // This provides defense-in-depth in case checkStaleness() didn't catch it
    if (this.lastIndexTime > 0 && Date.now() - this.lastIndexTime < this.POST_INDEX_GRACE_PERIOD_MS) {
      result.skipped = true;
      result.reason = 'Within grace period after recent index';
      result.duration = Date.now() - startTime;
      console.error(`[IndexValidator] Skipping refresh - within ${this.POST_INDEX_GRACE_PERIOD_MS}ms grace period after index_project`);
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
          normalizeAbsolutePath(path.join(this.rootDir, sr))
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
   * Reset all cooldowns and mark index as fresh (after index_project)
   * This starts a grace period where stale checks are skipped
   */
  resetCooldowns(): void {
    this.lastCheckTime = 0;
    this.lastRefreshTime = 0;
    this.lastIndexTime = Date.now(); // Start grace period
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
