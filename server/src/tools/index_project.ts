import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MemoryIndex } from '../memory-index.js';
import { IndexerClient } from '../indexer-client.js';
import { Persistence } from '../persistence.js';
import { FileSystemWatcher } from '../fs-watcher.js';
import { normalizeAbsolutePath, normalizePath } from '../utils/path-utils.js';

class Profiler {
  private readonly enabled: boolean;
  private readonly marks: { label: string; time: number }[] = [];

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.mark('start');
    }
  }

  mark(label: string) {
    if (!this.enabled) {
      return;
    }
    this.marks.push({ label, time: Date.now() });
  }

  getSummary(): { text: string; breakdown: { from: string; to: string; seconds: number }[] } | null {
    if (!this.enabled || this.marks.length < 2) {
      return null;
    }

    const breakdown: { from: string; to: string; seconds: number }[] = [];
    for (let i = 1; i < this.marks.length; i++) {
      const prev = this.marks[i - 1];
      const curr = this.marks[i];
      breakdown.push({
        from: prev.label,
        to: curr.label,
        seconds: parseFloat(((curr.time - prev.time) / 1000).toFixed(2))
      });
    }

    const totalSeconds = parseFloat(
      ((this.marks[this.marks.length - 1].time - this.marks[0].time) / 1000).toFixed(2)
    );
    const lines = breakdown
      .map(step => `  • ${step.from} → ${step.to}: ${step.seconds}s`)
      .join('\n');

    const text = `\n⏱️ Profiling Summary:\n${lines}\n  • Total: ${totalSeconds}s`;
    return { text, breakdown };
  }
}

export const indexProjectTool: Tool = {
  name: 'index_project',
  description: `Build/update the Java code index for a project directory. **Must be called first before any other tool.**

**How it works:**
1. Scans for all .java files in the directory (recursively)
2. Parses each file to extract symbols, references, and call relationships
3. Saves index to .mcp-index/ for persistence across sessions
4. Sets up file watcher for automatic incremental updates

**Performance:**
- 10,000+ files indexed in ~60 seconds
- Incremental updates only reindex changed files
- Index persisted between sessions

**Use cases:**
- First action when working with a new codebase
- After pulling major code changes
- When index appears stale or incomplete

**Tips:**
- Don't call multiple times in same session (incremental updates are automatic)
- Use forceFullIndex=true only if index seems corrupted
- Set profile=true to capture detailed stage timings
- Set metricsOutputPath="relative/or/absolute/path.json" to persist run metrics`,
  inputSchema: {
    type: 'object',
    properties: {
      rootDir: {
        type: 'string',
        description: 'Absolute path to Java project root (e.g., "C:/projects/my-app" or "/home/user/projects/my-app")'
      },
      sourceRoots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Source directories relative to rootDir (e.g., ["src/main/java"]). Auto-detected if not specified.'
      },
      forceFullIndex: {
        type: 'boolean',
        description: 'Force complete rebuild instead of incremental. Only use if index is corrupted. Default: false'
      },
      profile: {
        type: 'boolean',
        description: 'Enable detailed profiling logs for this run. Default: false'
      },
      metricsOutputPath: {
        type: 'string',
        description: 'Optional file path (absolute or relative to rootDir) to write JSON metrics for this run'
      }
    },
    required: ['rootDir']
  }
};

export async function handleIndexProject(
  args: any,
  memoryIndex: MemoryIndex,
  indexerClient: IndexerClient,
  setWatcher: (watcher: FileSystemWatcher, persistence: Persistence) => void
) {
  // Normalize rootDir to use forward slashes consistently (critical for Windows)
  // Use normalizeAbsolutePath to resolve to absolute path AND handle case sensitivity
  const rootDir = normalizeAbsolutePath(args.rootDir as string);
  const sourceRoots = (args.sourceRoots as string[]) || ['src/main/java', 'src'];
  const forceFullIndex = (args.forceFullIndex as boolean) || false;
  const profileEnabled = Boolean(args.profile);
  const profiler = new Profiler(profileEnabled);
  const metricsOutputPathRaw = args.metricsOutputPath as string | undefined;
  const metricsOutputPath = metricsOutputPathRaw
    ? normalizeAbsolutePath(
        path.isAbsolute(metricsOutputPathRaw)
          ? metricsOutputPathRaw
          : path.join(rootDir, metricsOutputPathRaw)
      )
    : undefined;

  if (profileEnabled) {
    console.error('⏱️ Profiling enabled for index_project run');
  }

  try {
    const startTime = Date.now();
    profiler.mark('init');

    // Diagnostic logging for debugging incremental index issues
    console.error(`\n📍 [index_project] Called with:`);
    console.error(`   rootDir: ${rootDir}`);
    console.error(`   forceFullIndex: ${forceFullIndex}`);
    console.error(`   Current memoryIndex stats: ${JSON.stringify(memoryIndex.getStats())}`);

    // Set index directory first
    memoryIndex.setIndexDir(rootDir);
    const indexDirPath = memoryIndex.getIndexDir();
    console.error(`   Index directory: ${indexDirPath}`);

    // Try to load existing index
    const persistence = new Persistence(indexDirPath);
    let loadedExisting = false;
    
    // Check if index directory exists
    const indexExists = await persistence.exists();
    console.error(`   Index exists on disk: ${indexExists}`);
    
    if (!forceFullIndex) {
      try {
        const loaded = await persistence.load(memoryIndex);
        if (loaded) {
          // CRITICAL: Validate the loaded index is for THIS project
          // Prevents cross-project contamination when switching between projects
          const loadedRootDir = memoryIndex.getProjectRootDir();
          if (loadedRootDir && loadedRootDir !== rootDir) {
            console.error(`⚠️  Loaded index is for different project: ${loadedRootDir}`);
            console.error(`   Current project: ${rootDir}`);
            console.error(`   Clearing stale index and doing full reindex...`);
            memoryIndex.clear();
            memoryIndex.setIndexDir(rootDir);
            loadedExisting = false;
          } else {
            loadedExisting = true;
            const stats = memoryIndex.getStats();
            console.error(`✅ Loaded existing index from disk`);
            console.error(`   Loaded ${stats.symbols} symbols, ${stats.files} files`);
          }
        } else {
          console.error(`⚠️  persistence.load() returned false - no valid index found`);
        }
      } catch (error) {
        console.error(`⚠️  Could not load existing index, will do full reindex: ${error}`);
      }
    } else {
      console.error(`🔄 forceFullIndex=true, skipping persistence load`);
    }

    if (!loadedExisting) {
      // Clear for full index
      console.error(`🔄 Starting fresh index (loadedExisting=false)`);
      memoryIndex.clear();
      memoryIndex.setIndexDir(rootDir);
    }

    profiler.mark('persistence_ready');

    // Start Java indexer process
    await indexerClient.start();

    // Find all Java files and normalize paths for consistent comparison
    // Use normalizePath on glob results for Windows case-insensitivity
    const pattern = normalizePath(path.join(rootDir, '**/*.java'));
    const javaFilesRaw = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    // Normalize all paths - critical for Windows case-insensitive comparison
    const javaFiles = javaFilesRaw.map(normalizeAbsolutePath);

    profiler.mark('glob_complete');

    if (javaFiles.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No Java files found in ${rootDir}`
        }]
      };
    }

    // Convert source roots to absolute paths (normalized for case sensitivity)
    const absoluteSourceRoots = sourceRoots.map(sr => normalizeAbsolutePath(path.join(rootDir, sr)));

    // Determine which files need indexing
    let filesToIndex: string[] = [];
    
    if (loadedExisting) {
      // Incremental: only index changed or new files
      console.error(`🔍 Checking for changes in ${javaFiles.length} files...`);
      
      let mtimeSyncCount = 0;
      for (const file of javaFiles) {
        const needsReindex = await memoryIndex.needsReindex(file);
        if (needsReindex) {
          filesToIndex.push(file);
        } else {
          // FIX: Sync mtime for files that pass hash check but have newer mtime
          // This prevents false positives in index-validator after git operations
          // (git checkout/pull/merge touch file mtime but don't change content)
          try {
            const stats = await fs.stat(file);
            if (memoryIndex.updateFileMtime(file, stats.mtimeMs)) {
              mtimeSyncCount++;
            }
          } catch {
            // File might have been deleted, ignore
          }
        }
      }
      if (mtimeSyncCount > 0) {
        console.error(`🕐 Synced mtime for ${mtimeSyncCount} unchanged files`);
      }
      
      // Remove files that no longer exist
      const indexedFiles = memoryIndex.getAllFiles();
      // Create normalized set for comparison
      const currentFileSet = new Set(javaFiles.map(normalizePath));
      const deletedFiles = indexedFiles.filter(f => !currentFileSet.has(normalizePath(f.path)));
      
      for (const deletedFile of deletedFiles) {
        console.error(`🗑️  Removing deleted file: ${deletedFile.path}`);
        memoryIndex.removeFile(deletedFile.path);
      }
      
      if (filesToIndex.length === 0 && deletedFiles.length === 0) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const stats = memoryIndex.getStats();
        
        // Get metadata for freshness info
        const metadata = await persistence.getMetadata();
        let freshnessInfo = '';
        if (metadata && metadata.timestamp) {
          const lastIndexed = new Date(metadata.timestamp);
          const ageMs = Date.now() - metadata.timestamp;
          const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
          const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
          freshnessInfo = `\n🕐 Index Freshness:
  • Last indexed: ${lastIndexed.toLocaleString()}
  • Age: ${ageHours > 0 ? ageHours + 'h ' : ''}${ageMinutes}m ago`;
        }
        
        // Still start file watcher
        const watcher = new FileSystemWatcher(rootDir, absoluteSourceRoots, memoryIndex, indexerClient, persistence);
        watcher.start();
        setWatcher(watcher, persistence);
        
        return {
          content: [{
            type: 'text',
            text: `✅ Index is up-to-date (completed in ${elapsedTime}s)

📊 Statistics:
  • Symbols: ${stats.symbols}
  • Indexed Files: ${stats.indexedFiles}
  • All Files (including dependencies): ${stats.allFiles}
  • References: ${stats.references}
  • Call Graph Edges: ${stats.callGraphEdges}
  • Inheritance Relations: ${stats.inheritanceRelations}
${freshnessInfo}
💾 Index location: ${memoryIndex.getIndexDir()}
👁️ File watcher enabled for incremental updates`
          }]
        };
      }
      
      console.error(`📝 Found ${filesToIndex.length} changed/new files, ${deletedFiles.length} deleted files`);
    } else {
      // Full index
      filesToIndex = javaFiles;
    }

    profiler.mark('change_detection_complete');

    // Conservative batch sizing to prevent OOM and buffer overflow
    // 100 files = safer for large projects, prevents JSON response buffer overflow
    const batchSize = 300; // Reduced for stability - prevents buffer overflow on large projects
    let totalSymbols = 0;
    let totalReferences = 0;
    let processedFiles = 0;
    let errorCount = 0;
    let batchCount = 0;
    const batchMetrics: { batch: number; files: number; seconds: number }[] = [];

    console.error(`\n🔍 ${loadedExisting ? 'Incrementally indexing' : 'Indexing'} ${filesToIndex.length} files in batches of ${batchSize}...`);
    console.error(`⚡ Optimized batch size for performance and stability`);

    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, Math.min(i + batchSize, filesToIndex.length));
      batchCount++;
      const batchStartTime = Date.now();
      
      const results = await indexerClient.indexFiles(batch, absoluteSourceRoots);

      for (const result of results) {
        if (result.error) {
          console.error(`⚠️  Error indexing ${result.file}: ${result.error}`);
          errorCount++;
          continue;
        }

        // If incremental, remove old data first
        if (loadedExisting) {
          memoryIndex.removeFile(result.file);
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

        // Get file hash and mtime for staleness detection
        const hash = await MemoryIndex.calculateFileHash(result.file);
        let mtime: number | undefined;
        try {
          const stats = await fs.stat(result.file);
          mtime = stats.mtimeMs;
        } catch {
          mtime = Date.now();
        }
        memoryIndex.addFile(result.file, hash, symbolFqns, true, mtime);
        processedFiles++;
      }

      // CRITICAL: Aggressive memory cleanup after EVERY batch to prevent OOM
      // Clear references to batch results to allow GC
      const progress = Math.min(i + batchSize, filesToIndex.length);
      const percentage = ((progress / filesToIndex.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (progress / parseFloat(elapsed)).toFixed(0);
      
      // Run maintenance cleanup every 5 batches (optimized for performance)
      if (batchCount % 5 === 0) {
        memoryIndex.performMaintenanceCleanup();
      }
      
      // Force GC after every batch (critical for large projects)
      if (global.gc) {
        global.gc();
        global.gc(); // Double GC
      }
      
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      console.error(`📊 Batch ${batchCount}: ${progress}/${filesToIndex.length} (${percentage}%) - ${totalSymbols} symbols - ${rate} files/s - Heap: ${heapUsedMB}/${heapTotalMB}MB`);

      if (profileEnabled) {
        batchMetrics.push({
          batch: batchCount,
          files: batch.length,
          seconds: parseFloat(((Date.now() - batchStartTime) / 1000).toFixed(2))
        });
      }
      
      // Emergency brake: REDUCED threshold from 2GB to 1.5GB for earlier intervention
      if (heapUsedMB > 1500) {
        console.error(`⚠️  HIGH MEMORY WARNING: ${heapUsedMB}MB - Running emergency cleanup...`);
        memoryIndex.performMaintenanceCleanup();
        if (global.gc) {
          for (let g = 0; g < 5; g++) {
            global.gc();
          }
        }
        
        // Log stats after cleanup
        const afterCleanup = process.memoryUsage();
        const afterMB = Math.round(afterCleanup.heapUsed / 1024 / 1024);
        console.error(`✅ After emergency cleanup: ${afterMB}MB (freed ${heapUsedMB - afterMB}MB)`);
        
        // If still high, throw error to prevent crash
        if (afterMB > 3500) {
          console.error(`🚨 CRITICAL: Memory usage still too high (${afterMB}MB). Consider restarting or reducing project scope.`);
        }
      }
    }

    if (errorCount > 0) {
      console.error(`\n⚠️  ${errorCount} files failed to index`);
    }

    // Persist index (only if we made changes)
    if (filesToIndex.length > 0) {
      console.error(`\n💾 Persisting index to disk...`);
      
      // CRITICAL: Flush all pending writes to storage before marking complete
      if ((memoryIndex as any).flush) {
        console.error(`   ⏳ Flushing to storage...`);
        await (memoryIndex as any).flush();
      }
      
      await persistence.save(memoryIndex);
      // Release newly indexed symbols, references, and graph edges after commit.
      // Continue with only file metadata and persisted statistics in RAM.
      await persistence.load(memoryIndex);
      console.error(`✅ Index persisted successfully (query data kept in SQLite)`);
    }

    profiler.mark('persistence_saved');

    // Start file watcher
    const watcher = new FileSystemWatcher(rootDir, absoluteSourceRoots, memoryIndex, indexerClient, persistence);
    watcher.start();
    setWatcher(watcher, persistence);

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const stats = memoryIndex.getStats();

    profiler.mark('watcher_started');
    profiler.mark('done');

    const indexMode = loadedExisting ? 
      (filesToIndex.length > 0 ? `Incremental update: ${filesToIndex.length} changed` : 'Up-to-date') :
      `Full index: ${javaFiles.length} files`;
    
    // Get freshness info
    const now = new Date();
    const freshnessInfo = `\n🕐 Index Freshness:
  • Just indexed: ${now.toLocaleString()}
  • Status: ✅ Fresh`;

    // Collect profiling summary
    const profilingSummary = profiler.getSummary();

    // Build metrics object
    const metrics: Record<string, any> = {
      rootDir,
      timestamp: new Date().toISOString(),
      incremental: loadedExisting,
      elapsedSeconds: parseFloat(elapsedTime),
      discoveredJavaFiles: javaFiles.length,
      filesIndexed: filesToIndex.length,
      processedFiles,
      batchSize,
      batchCount,
      errors: errorCount,
      totals: {
        symbols: stats.symbols,
        indexedFiles: stats.indexedFiles,
        allFiles: stats.allFiles,
        references: stats.references,
        callGraphEdges: stats.callGraphEdges,
        inheritanceRelations: stats.inheritanceRelations
      }
    };

    if (profileEnabled && profilingSummary) {
      metrics.profiling = {
        steps: profilingSummary.breakdown,
        batches: batchMetrics
      };
    }

    // Write metrics JSON if path provided
    if (metricsOutputPath) {
      try {
        await fs.mkdir(path.dirname(metricsOutputPath), { recursive: true });
        await fs.writeFile(metricsOutputPath, JSON.stringify(metrics, null, 2), 'utf8');
        console.error(`📄 Metrics written to ${metricsOutputPath}`);
      } catch (writeError) {
        console.error(`⚠️ Failed to write metrics file: ${writeError}`);
      }
    }

    const profilingText = profilingSummary ? `${profilingSummary.text}\n` : '';

    return {
      content: [{
        type: 'text',
        text: `✅ ${indexMode} (${elapsedTime}s)

📊 Statistics:
  • Symbols: ${stats.symbols}
  • Indexed Files: ${stats.indexedFiles}
  • All Files (including dependencies): ${stats.allFiles}
  • References: ${stats.references}
  • Call Graph Edges: ${stats.callGraphEdges}
  • Inheritance Relations: ${stats.inheritanceRelations}
${freshnessInfo}
💾 Index location: ${memoryIndex.getIndexDir()}
👁️ File watcher enabled for incremental updates
${profilingText}
${loadedExisting ? '💡 Tip: Use forceFullIndex=true to force a complete rebuild' : ''}`
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
