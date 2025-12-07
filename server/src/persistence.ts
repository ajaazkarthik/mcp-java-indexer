import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryIndex, Reference, FileInfo, SymbolStub } from './memory-index.js';
import { StorageFactory, StorageType } from './storage/storage-factory.js';
import { IIndexStorage } from './storage/index-storage.js';

/**
 * Persistence class with automatic storage backend detection
 * 
 * Priority: SQLite (better-sqlite3 only)
 *
 * NOTE: sql.js and file-shard fallbacks are disabled. better-sqlite3 is required to
 * support very large indexes (5GB+) reliably.
 */
export class Persistence {
  private indexDir: string;
  
  // Storage backend (lazily initialized)
  private storage: IIndexStorage | null = null;
  private storageType: StorageType = 'better-sqlite3'; // Single supported backend
  private storageInitialized = false;
  private storageInitPromise: Promise<void> | null = null;

  constructor(indexDir: string) {
    this.indexDir = indexDir;
    // Start storage initialization in background
    this.storageInitPromise = this.initializeStorage();
  }

  /**
   * Initialize the best available storage backend
   */
  private async initializeStorage(): Promise<void> {
    if (this.storageInitialized) return;
    
    try {
      this.storage = await StorageFactory.create(this.indexDir);
      const detectedType = StorageFactory.getDetectedType();
      if (!detectedType) {
        throw new Error('No storage backend available. Please install better-sqlite3: npm install better-sqlite3');
      }
      this.storageType = detectedType;
      this.storageInitialized = true;
      console.error(`✅ Persistence using ${this.storageType} storage backend`);
    } catch (error) {
      console.error('❌ Storage backend initialization failed:', error);
      throw new Error(`Storage backend required but not available: ${error}`);
    }
  }

  /**
   * Wait for storage to be ready
   */
  private async waitForStorage(): Promise<void> {
    if (this.storageInitPromise) {
      await this.storageInitPromise;
    }
  }

  // Ensure index directory exists
  async ensureIndexDir(): Promise<void> {
    try {
      await fs.mkdir(this.indexDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create index directory:', error);
    }
  }

  // Save index to disk - uses database storage backend (required)
  async save(memoryIndex: MemoryIndex): Promise<void> {
    await this.waitForStorage();
    await this.ensureIndexDir();

    const data = memoryIndex.toJSON();
    
    if (!this.storage) {
      throw new Error('Storage not initialized. Please install better-sqlite3: npm install better-sqlite3');
    }
    
    await this.saveToStorage(data);
  }

  /**
   * Save to storage backend (SQLite or file shards)
   * Each save method handles its own transactions internally
   */
  private async saveToStorage(data: any): Promise<void> {
    if (!this.storage) return;
    
    const startTime = Date.now();
    console.error(`💾 Saving to ${this.storageType} storage...`);
    
    try {
      // Clear existing data first
      await this.storage.clear();
      
      // data.symbols is [[fqn, stub], ...] from Map.entries()
      // Convert to [stub, ...] for storage
      if (data.symbols && data.symbols.length > 0) {
        const symbolsToSave = data.symbols.map((entry: [string, any]) => entry[1]);
        await this.storage.saveSymbols(symbolsToSave);
      }
      
      // Save references in batches (handles own transaction)
      if (data.references && data.references.length > 0) {
        await this.storage.saveReferences(data.references);
      }
      
      // Save call graph edges (handles own transaction)
      // FIX: Use iterative push instead of spread operator to prevent stack overflow with 1.5M+ edges
      if (data.callGraph && data.callGraph.length > 0) {
        const forwardEdges: any[] = [];
        for (const entry of data.callGraph) {
          const edges = entry[1];
          for (let i = 0; i < edges.length; i++) {
            forwardEdges.push(edges[i]);
          }
        }
        if (forwardEdges.length > 0) {
          await this.storage.saveCallEdges(forwardEdges, 'forward');
        }
      }
      // FIX: Use iterative push instead of spread operator to prevent stack overflow with 1.5M+ edges
      if (data.reverseCallGraph && data.reverseCallGraph.length > 0) {
        const reverseEdges: any[] = [];
        for (const entry of data.reverseCallGraph) {
          const edges = entry[1];
          for (let i = 0; i < edges.length; i++) {
            reverseEdges.push(edges[i]);
          }
        }
        if (reverseEdges.length > 0) {
          await this.storage.saveCallEdges(reverseEdges, 'reverse');
        }
      }
      
      // Save inheritance (handles own transaction)
      if (data.inheritance && data.inheritance.length > 0) {
        const relationships: Array<{ child: string; parent: string }> = [];
        for (const [child, parents] of data.inheritance) {
          for (const parent of parents) {
            relationships.push({ child, parent });
          }
        }
        if (relationships.length > 0) {
          await this.storage.saveInheritances(relationships);
        }
      }
      
      // Save files - data.files is [[path, info], ...] from Map.entries()
      if (data.files && data.files.length > 0) {
        for (const entry of data.files) {
          await this.storage.saveFile(entry[1]); // entry[1] is the FileInfo
        }
      }
      
      // Flush to disk immediately (noop for better-sqlite3 but required by interface)
      await this.storage.flush();
      
      // Also save metadata JSON for compatibility
      const metadata = {
        version: '2.0', // Version 2.0 uses storage backend
        timestamp: Date.now(),
        projectRootDir: data.projectRootDir || '',
        storageType: this.storageType,
        stats: {
          symbols: data.symbols?.length || 0,
          files: data.files?.length || 0,
          indexedFiles: data.indexedFiles?.length || 0,
          references: data.references?.length || 0
        }
      };
      
      await fs.writeFile(
        path.join(this.indexDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      
      const duration = Date.now() - startTime;
      console.error(`✅ Index saved to ${this.storageType} storage (${duration}ms)`);
      
    } catch (error) {
      console.error('❌ Storage save failed:', error);
      // Database storage is required - rethrow the error
      throw new Error(`Failed to save index to ${this.storageType} storage: ${error}`);
    }
  }

  /**
   * Save only a single file's data incrementally (for reindex_file operations)
   * This is MUCH faster than full save() - only saves the changed file's symbols, references, etc.
   * 
   * @param filePath - Path to the file that was reindexed
   * @param symbols - New symbols from the file
   * @param references - New references from the file
   * @param fileInfo - File metadata (hash, mtime, etc.)
   */
  async saveFileIncremental(
    filePath: string,
    symbols: SymbolStub[],
    references: Reference[],
    fileInfo: FileInfo
  ): Promise<void> {
    await this.waitForStorage();
    
    if (!this.storage) {
      throw new Error('Storage not initialized. Please install better-sqlite3.');
    }
    
    const startTime = Date.now();
    console.error(`💾 Incremental save for ${filePath}...`);
    
    try {
      // Delete old data for this file first
      await this.storage.deleteFile(filePath);
      
      // Save new symbols
      if (symbols.length > 0) {
        await this.storage.saveSymbols(symbols);
      }
      
      // Save new references
      if (references.length > 0) {
        await this.storage.saveReferences(references);
      }
      
      // Save file metadata
      await this.storage.saveFile(fileInfo);
      
      // Flush to ensure data is persisted
      await this.storage.flush();
      
      const duration = Date.now() - startTime;
      console.error(`✅ Incremental save complete: ${symbols.length} symbols, ${references.length} refs (${duration}ms)`);
      
    } catch (error) {
      console.error('❌ Incremental save failed:', error);
      throw new Error(`Failed incremental save for ${filePath}: ${error}`);
    }
  }

  /**
   * @deprecated JSON file storage is disabled. Database storage is required.
   * This method is kept for reference only and will be removed in a future version.
   */
  private async saveToJsonFiles(_data: any): Promise<void> {
    throw new Error('JSON storage is disabled. Database storage (better-sqlite3) is required.');
  }

  /**
   * @deprecated JSON chunked storage is disabled. Database storage is required.
   */
  private async saveChunked(_name: string, _data: any[]): Promise<void> {
    throw new Error('JSON storage is disabled. Database storage is required.');
  }

  // Load index from disk - uses database storage backend (required)
  async load(memoryIndex: MemoryIndex): Promise<boolean> {
    // Wait for storage to be ready
    await this.storageInitPromise;
    
    if (!this.storage) {
      console.error('❌ Storage not initialized');
      return false;
    }
    
    try {
      const loaded = await this.loadFromStorage(memoryIndex);
      if (loaded) {
        console.error(`✅ Index loaded from ${this.storageType} storage`);
        return true;
      }
      return false; // Empty storage
    } catch (error) {
      console.error('❌ Failed to load from database storage:', error);
      return false;
    }
  }

  /**
   * Load index from storage backend (SQLite)
   */
  private async loadFromStorage(memoryIndex: MemoryIndex): Promise<boolean> {
    if (!this.storage) return false;
    
    try {
      // Check if storage has data
      const stats = await this.storage.getStats();
      if (stats.symbols === 0) {
        return false; // Empty storage
      }
      
      // Load all data from storage
      const symbols = await this.storage.getAllSymbols();
      const references = await this.storage.getAllReferences();
      const callGraph = await this.storage.getAllCallGraphEdges();
      const files = await this.storage.getAllFiles();
      
      // Convert to MemoryIndex format - symbols and files need to be [key, value] pairs for Map constructor
      const data: any = {
        projectRootDir: '',
        symbols: symbols.map(s => [s.fqn, s]),  // Convert to [fqn, stub] pairs for Map
        files: files.map(f => [f.path, f]),     // Convert to [path, info] pairs for Map
        indexedFiles: files.map((f: FileInfo) => f.path),
        references: references,
        referencesByFile: this.groupReferencesByFile(references),
        callGraph: this.convertCallGraphToArray(callGraph, 'outbound'),
        reverseCallGraph: this.convertCallGraphToArray(callGraph, 'inbound'),
        inheritance: [],
        reverseInheritance: []
      };
      
      // Load inheritance from symbols
      // FIX: Use iterative push instead of spread operator to prevent stack overflow
      for (const symbol of symbols) {
        if (symbol.kind === 'class' || symbol.kind === 'interface') {
          const parents: string[] = [];
          if ((symbol as any).extendsClass) parents.push((symbol as any).extendsClass);
          if ((symbol as any).implementsInterfaces) {
            const interfaces = (symbol as any).implementsInterfaces;
            for (let i = 0; i < interfaces.length; i++) {
              parents.push(interfaces[i]);
            }
          }
          if (parents.length > 0) {
            data.inheritance.push([symbol.fqn, parents]);
            // Build reverse inheritance
            for (const parent of parents) {
              const existing = data.reverseInheritance.find((r: any) => r[0] === parent);
              if (existing) {
                existing[1].push(symbol.fqn);
              } else {
                data.reverseInheritance.push([parent, [symbol.fqn]]);
              }
            }
          }
        }
      }
      
      memoryIndex.fromJSON(data);
      return true;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      return false;
    }
  }

  /**
   * Group references by file for MemoryIndex format
   */
  private groupReferencesByFile(references: Reference[]): [string, Reference[]][] {
    const byFile = new Map<string, Reference[]>();
    for (const ref of references) {
      const existing = byFile.get(ref.file);
      if (existing) {
        existing.push(ref);
      } else {
        byFile.set(ref.file, [ref]);
      }
    }
    return Array.from(byFile.entries());
  }

  /**
   * Convert call graph edges to MemoryIndex array format
   */
  private convertCallGraphToArray(edges: any[], direction: 'inbound' | 'outbound'): [string, any[]][] {
    const byMethod = new Map<string, any[]>();
    for (const edge of edges) {
      const key = direction === 'outbound' ? edge.callerFqn : edge.calleeFqn;
      const existing = byMethod.get(key);
      if (existing) {
        existing.push(edge);
      } else {
        byMethod.set(key, [edge]);
      }
    }
    return Array.from(byMethod.entries());
  }

  /**
   * @deprecated JSON file storage is disabled. Database storage is required.
   */
  private async loadOldFormat(_memoryIndex: MemoryIndex): Promise<boolean> {
    console.error('❌ JSON storage is disabled. Please re-index with database storage.');
    return false;
  }

  /**
   * @deprecated JSON chunked storage is disabled. Database storage is required.
   */
  private async loadChunked(_memoryIndex: MemoryIndex): Promise<boolean> {
    console.error('❌ JSON chunked storage is disabled. Please re-index with database storage.');
    return false;
  }

  /**
   * @deprecated JSON chunked storage is disabled. Database storage is required.
   */
  private async loadChunkedArray(_name: string): Promise<any[]> {
    return [];
  }

  // Check if index exists
  async exists(): Promise<boolean> {
    // Check for new format
    const metadataPath = path.join(this.indexDir, 'metadata.json');
    try {
      await fs.access(metadataPath);
      return true;
    } catch {
      // Check for old format
      const oldPath = path.join(this.indexDir, 'index.json');
      try {
        await fs.access(oldPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  // Get index metadata (timestamp, stats, etc.) for freshness indicator
  async getMetadata(): Promise<{ timestamp: number; version: string; stats: any } | null> {
    const metadataPath = path.join(this.indexDir, 'metadata.json');
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get the current storage type being used
   * Returns 'better-sqlite3'
   */
  getStorageType(): StorageType {
    return this.storageType;
  }

  /**
   * Check if using a database storage backend (not file-based)
   */
  isUsingDatabaseStorage(): boolean {
    return this.storageType === 'better-sqlite3';
  }

  // Clear index
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.indexDir);
      for (const file of files) {
        await fs.unlink(path.join(this.indexDir, file));
      }
    } catch {
      // Directory doesn't exist, ignore
    }
  }
}
