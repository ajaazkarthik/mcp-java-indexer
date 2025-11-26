import chokidar from 'chokidar';
import * as fs from 'fs/promises';
import { MemoryIndex } from './memory-index.js';
import { IndexerClient } from './indexer-client.js';
import { Persistence } from './persistence.js';

/**
 * FileSystemWatcher - Optional file watcher with heavy debouncing
 * 
 * IMPORTANT: This watcher is designed to be NON-AGGRESSIVE to prevent
 * CPU/memory spikes during builds (like `mvn clean build`).
 * 
 * Features:
 * - Heavy debouncing (30 seconds) to batch changes
 * - Uses mtime (fast) instead of hash for initial change detection
 * - Maximum pending changes threshold to skip bulk operations
 * - Can be disabled entirely (recommended for large projects)
 * 
 * For most use cases, the IndexValidator's on-demand checking is preferred.
 */
export class FileSystemWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private memoryIndex: MemoryIndex;
  private indexerClient: IndexerClient;
  private persistence: Persistence;
  private rootDir: string;
  private sourceRoots: string[];
  
  // Pending changes for batch processing
  private pendingChanges: Set<string> = new Set();
  private pendingDeletes: Set<string> = new Set();
  
  // Debounce timers
  private debounceTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  
  // Processing state
  private isProcessing: boolean = false;
  private enabled: boolean = true;
  
  // Configuration - HEAVY debouncing to prevent build interference
  private readonly DEBOUNCE_MS = 30000; // 30 seconds - wait for build to complete
  private readonly PERSIST_DEBOUNCE_MS = 10000; // 10 seconds for persistence
  private readonly MAX_PENDING_CHANGES = 50; // Skip if too many changes (likely a build)
  private readonly BULK_CHANGE_COOLDOWN_MS = 60000; // 1 minute cooldown after bulk change detection

  private lastBulkChangeDetected: number = 0;

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

  /**
   * Start watching for file changes
   * Note: Watching is optional - IndexValidator handles on-demand checking
   */
  start(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch('**/*.java', {
      cwd: this.rootDir,
      ignored: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**'],
      persistent: true,
      ignoreInitial: true,
      // Additional stability settings
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s after last write
        pollInterval: 500
      },
      // Don't follow symlinks to avoid loops
      followSymlinks: false
    });

    this.watcher
      .on('add', (path) => this.queueChange(path))
      .on('change', (path) => this.queueChange(path))
      .on('unlink', (path) => this.queueDelete(path));

    console.error(`[FileWatcher] Started for ${this.rootDir} (30s debounce, max ${this.MAX_PENDING_CHANGES} pending)`);
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.error('[FileWatcher] Stopped');
    }
  }

  /**
   * Temporarily disable the watcher (useful during known bulk operations)
   */
  disable(): void {
    this.enabled = false;
    console.error('[FileWatcher] Disabled');
  }

  /**
   * Re-enable the watcher
   */
  enable(): void {
    this.enabled = true;
    console.error('[FileWatcher] Enabled');
  }

  /**
   * Queue a file change for batch processing
   */
  private queueChange(relativePath: string): void {
    if (!this.enabled) return;

    const fullPath = `${this.rootDir}/${relativePath}`.replace(/\\/g, '/');
    
    // Remove from deletes if it was there (file recreated)
    this.pendingDeletes.delete(fullPath);
    
    // Add to pending changes
    this.pendingChanges.add(fullPath);
    
    // Check for bulk changes
    this.checkBulkChanges();
    
    // Schedule debounced processing
    this.scheduleProcessing();
  }

  /**
   * Queue a file deletion for batch processing
   */
  private queueDelete(relativePath: string): void {
    if (!this.enabled) return;

    const fullPath = `${this.rootDir}/${relativePath}`.replace(/\\/g, '/');
    
    // Remove from changes if it was there
    this.pendingChanges.delete(fullPath);
    
    // Add to pending deletes
    this.pendingDeletes.add(fullPath);
    
    // Check for bulk changes
    this.checkBulkChanges();
    
    // Schedule debounced processing
    this.scheduleProcessing();
  }

  /**
   * Check if we're seeing bulk changes (like a build)
   * If so, clear pending and wait for things to settle
   */
  private checkBulkChanges(): void {
    const totalPending = this.pendingChanges.size + this.pendingDeletes.size;
    
    if (totalPending > this.MAX_PENDING_CHANGES) {
      console.error(`[FileWatcher] Bulk change detected (${totalPending} pending). Clearing queue and waiting...`);
      
      // Clear pending changes
      this.pendingChanges.clear();
      this.pendingDeletes.clear();
      
      // Record bulk change time
      this.lastBulkChangeDetected = Date.now();
      
      // Clear debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    }
  }

  /**
   * Schedule debounced processing of pending changes
   */
  private scheduleProcessing(): void {
    // Check cooldown after bulk change
    if (Date.now() - this.lastBulkChangeDetected < this.BULK_CHANGE_COOLDOWN_MS) {
      // Still in cooldown after bulk change, don't schedule
      return;
    }

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new timer with heavy debounce
    this.debounceTimer = setTimeout(() => {
      this.processChanges();
    }, this.DEBOUNCE_MS);
  }

  /**
   * Process all pending changes
   */
  private async processChanges(): Promise<void> {
    if (this.isProcessing) {
      // Already processing, reschedule
      this.scheduleProcessing();
      return;
    }

    // Check cooldown again
    if (Date.now() - this.lastBulkChangeDetected < this.BULK_CHANGE_COOLDOWN_MS) {
      return;
    }

    const changesToProcess = new Set(this.pendingChanges);
    const deletesToProcess = new Set(this.pendingDeletes);

    // Clear pending
    this.pendingChanges.clear();
    this.pendingDeletes.clear();

    const totalToProcess = changesToProcess.size + deletesToProcess.size;
    if (totalToProcess === 0) {
      return;
    }

    // Final check for bulk changes
    if (totalToProcess > this.MAX_PENDING_CHANGES) {
      console.error(`[FileWatcher] Too many changes (${totalToProcess}). Use index_project to rebuild.`);
      return;
    }

    this.isProcessing = true;
    console.error(`[FileWatcher] Processing ${changesToProcess.size} changes, ${deletesToProcess.size} deletes`);

    try {
      // Process deletes first
      for (const deletedPath of deletesToProcess) {
        this.memoryIndex.removeFile(deletedPath);
        console.error(`[FileWatcher] Removed: ${deletedPath}`);
      }

      // Process changes (with mtime check)
      const filesToReindex: string[] = [];
      
      for (const changedPath of changesToProcess) {
        try {
          const stats = await fs.stat(changedPath);
          const currentMtime = stats.mtimeMs;
          
          const fileInfo = this.memoryIndex.getFile(changedPath);
          if (!fileInfo) {
            // New file
            filesToReindex.push(changedPath);
          } else if (currentMtime > (fileInfo.mtime || fileInfo.lastIndexed)) {
            // Actually changed
            filesToReindex.push(changedPath);
          }
          // else: mtime unchanged, skip
        } catch {
          // File doesn't exist or can't be read, skip
        }
      }

      if (filesToReindex.length === 0) {
        console.error('[FileWatcher] No files actually changed (mtime check)');
        return;
      }

      console.error(`[FileWatcher] Reindexing ${filesToReindex.length} files...`);

      // Reindex in batch
      const absoluteSourceRoots = this.sourceRoots.map(sr => 
        `${this.rootDir}/${sr}`.replace(/\\/g, '/')
      );

      const results = await this.indexerClient.indexFiles(filesToReindex, absoluteSourceRoots);

      for (const result of results) {
        if (result.error) {
          console.error(`[FileWatcher] Error indexing ${result.file}: ${result.error}`);
          continue;
        }

        // Remove old data
        this.memoryIndex.removeFile(result.file);

        // Add new data
        const symbolFqns: string[] = [];
        for (const symbol of result.symbols) {
          this.memoryIndex.addSymbol(symbol);
          symbolFqns.push(symbol.fqn);
        }

        for (const ref of result.references) {
          this.memoryIndex.addReference(ref);
        }

        // Get current mtime and hash
        try {
          const stats = await fs.stat(result.file);
          const hash = await MemoryIndex.calculateFileHash(result.file);
          this.memoryIndex.addFile(result.file, hash, symbolFqns, true, stats.mtimeMs);
        } catch {
          // File disappeared, skip
        }
      }

      // Schedule persistence
      this.schedulePersist();

      console.error(`[FileWatcher] Reindexed ${results.length} files`);
    } catch (error) {
      console.error('[FileWatcher] Error processing changes:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Schedule debounced persistence
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(async () => {
      try {
        console.error('[FileWatcher] Persisting index...');
        await this.persistence.save(this.memoryIndex);
        console.error('[FileWatcher] Index persisted');
      } catch (error) {
        console.error('[FileWatcher] Failed to persist:', error);
      }
      this.persistTimer = null;
    }, this.PERSIST_DEBOUNCE_MS);
  }
}
