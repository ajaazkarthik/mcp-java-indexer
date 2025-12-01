import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryIndex, Reference, FileInfo } from './memory-index.js';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { StorageFactory, StorageType } from './storage/storage-factory.js';
import { IIndexStorage } from './storage/index-storage.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Persistence class with automatic storage backend detection
 * 
 * Priority: SQLite (better-sqlite3) -> sql.js -> chunked gzip files (fallback)
 * 
 * This class maintains backward compatibility with the old JSON-based persistence
 * while using more efficient storage backends when available.
 */
export class Persistence {
  private indexDir: string;
  private readonly CHUNK_SIZE = 5000; // Save in chunks to avoid memory issues
  
  // Storage backend (lazily initialized)
  private storage: IIndexStorage | null = null;
  private storageType: StorageType | 'json' = 'json';
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
      this.storageType = StorageFactory.getDetectedType() || 'file-shard';
      this.storageInitialized = true;
      console.error(`✅ Persistence using ${this.storageType} storage backend`);
    } catch (error) {
      console.error('⚠️  Storage backend initialization failed, using JSON fallback:', error);
      this.storageType = 'json';
      this.storageInitialized = true;
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

  // Save index to disk - uses storage backend if available
  async save(memoryIndex: MemoryIndex): Promise<void> {
    await this.waitForStorage();
    await this.ensureIndexDir();

    const data = memoryIndex.toJSON();
    
    // If we have a storage backend, use it for efficient persistence
    if (this.storage && this.storageType !== 'json') {
      await this.saveToStorage(data);
      return;
    }
    
    // Fall back to JSON file persistence
    await this.saveToJsonFiles(data);
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
      if (data.callGraph && data.callGraph.length > 0) {
        const forwardEdges: any[] = [];
        for (const entry of data.callGraph) {
          forwardEdges.push(...entry[1]);
        }
        if (forwardEdges.length > 0) {
          await this.storage.saveCallEdges(forwardEdges, 'forward');
        }
      }
      if (data.reverseCallGraph && data.reverseCallGraph.length > 0) {
        const reverseEdges: any[] = [];
        for (const entry of data.reverseCallGraph) {
          reverseEdges.push(...entry[1]);
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
      
      // CRITICAL: Flush to disk immediately (sql.js keeps data in-memory until flushed)
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
      console.error('❌ Storage save failed, falling back to JSON:', error);
      // Fall back to JSON - data is already available
      await this.saveToJsonFiles(data);
    }
  }

  /**
   * Save to JSON files (original implementation)
   */
  private async saveToJsonFiles(data: any): Promise<void> {
    try {
      // Save metadata separately (includes projectRootDir for validation on load)
      const metadata = {
        version: '1.1', // Bumped version for projectRootDir support
        timestamp: Date.now(),
        projectRootDir: data.projectRootDir || '', // Store the project root
        stats: {
          symbols: data.symbols.length,
          files: data.files.length,
          indexedFiles: data.indexedFiles.length,
          references: data.references.length,
          referencesByFile: data.referencesByFile.length,
          callGraph: data.callGraph.length,
          reverseCallGraph: data.reverseCallGraph.length,
          inheritance: data.inheritance.length,
          reverseInheritance: data.reverseInheritance.length
        }
      };
      
      await fs.writeFile(
        path.join(this.indexDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );

      // Save large arrays in chunks with compression
      await this.saveChunked('symbols', data.symbols);
      await this.saveChunked('files', data.files);
      await this.saveChunked('references', data.references);
      await this.saveChunked('referencesByFile', data.referencesByFile);
      await this.saveChunked('callGraph', data.callGraph);
      await this.saveChunked('reverseCallGraph', data.reverseCallGraph);
      await this.saveChunked('inheritance', data.inheritance);
      await this.saveChunked('reverseInheritance', data.reverseInheritance);
      
      // Save indexedFiles as plain JSON (small)
      await fs.writeFile(
        path.join(this.indexDir, 'indexedFiles.json'),
        JSON.stringify(data.indexedFiles),
        'utf-8'
      );

      console.error('✅ Index saved successfully with compression');
    } catch (error) {
      console.error('Failed to save index:', error);
      throw error;
    }
  }

  // Save array data in chunks with compression
  private async saveChunked(name: string, data: any[]): Promise<void> {
    const totalChunks = Math.ceil(data.length / this.CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, data.length);
      const chunk = data.slice(start, end);
      
      const chunkData = JSON.stringify(chunk);
      const compressed = await gzip(chunkData);
      
      const chunkPath = path.join(this.indexDir, `${name}_${i}.json.gz`);
      await fs.writeFile(chunkPath, compressed);
    }
    
    // Save chunk count
    await fs.writeFile(
      path.join(this.indexDir, `${name}_chunks.txt`),
      totalChunks.toString(),
      'utf-8'
    );
  }

  // Load index from disk with chunking support
  async load(memoryIndex: MemoryIndex): Promise<boolean> {
    // Wait for storage to be ready
    await this.storageInitPromise;
    
    // Try loading from storage backend first
    if (this.storage) {
      try {
        const loaded = await this.loadFromStorage(memoryIndex);
        if (loaded) {
          console.error(`✅ Index loaded from ${this.storageType} storage`);
          return true;
        }
      } catch (error) {
        console.error('Storage load failed, falling back to JSON:', error);
      }
    }
    
    // Fall back to JSON files
    try {
      // Check if chunked format exists
      const metadataPath = path.join(this.indexDir, 'metadata.json');
      
      try {
        await fs.access(metadataPath);
        // New chunked format
        return await this.loadChunked(memoryIndex);
      } catch {
        // Try old format
        const oldPath = path.join(this.indexDir, 'index.json');
        try {
          await fs.access(oldPath);
          return await this.loadOldFormat(memoryIndex);
        } catch {
          return false;
        }
      }
    } catch (error) {
      console.error('Failed to load index:', error);
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
      for (const symbol of symbols) {
        if (symbol.kind === 'class' || symbol.kind === 'interface') {
          const parents: string[] = [];
          if ((symbol as any).extendsClass) parents.push((symbol as any).extendsClass);
          if ((symbol as any).implementsInterfaces) parents.push(...(symbol as any).implementsInterfaces);
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

  // Load old format index
  private async loadOldFormat(memoryIndex: MemoryIndex): Promise<boolean> {
    const filePath = path.join(this.indexDir, 'index.json');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      memoryIndex.fromJSON(data);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Load chunked format index
  private async loadChunked(memoryIndex: MemoryIndex): Promise<boolean> {
    try {
      // Load metadata first to get projectRootDir
      const metadataPath = path.join(this.indexDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      const data: any = {
        projectRootDir: metadata.projectRootDir || '', // Restore from metadata
        symbols: [],
        files: [],
        indexedFiles: [],
        references: [],
        callGraph: [],
        reverseCallGraph: [],
        inheritance: [],
        reverseInheritance: []
      };

      // Load each chunked array
      data.symbols = await this.loadChunkedArray('symbols');
      data.files = await this.loadChunkedArray('files');
      data.references = await this.loadChunkedArray('references');
      data.referencesByFile = await this.loadChunkedArray('referencesByFile');
      data.callGraph = await this.loadChunkedArray('callGraph');
      data.reverseCallGraph = await this.loadChunkedArray('reverseCallGraph');
      data.inheritance = await this.loadChunkedArray('inheritance');
      data.reverseInheritance = await this.loadChunkedArray('reverseInheritance');
      
      // Load indexedFiles
      const indexedFilesPath = path.join(this.indexDir, 'indexedFiles.json');
      const indexedFilesContent = await fs.readFile(indexedFilesPath, 'utf-8');
      data.indexedFiles = JSON.parse(indexedFilesContent);

      memoryIndex.fromJSON(data);
      return true;
    } catch (error) {
      console.error('Failed to load chunked index:', error);
      return false;
    }
  }

  // Load chunked array data
  private async loadChunkedArray(name: string): Promise<any[]> {
    try {
      const chunksPath = path.join(this.indexDir, `${name}_chunks.txt`);
      const chunksContent = await fs.readFile(chunksPath, 'utf-8');
      const totalChunks = parseInt(chunksContent, 10);
      
      const result: any[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(this.indexDir, `${name}_${i}.json.gz`);
        const compressed = await fs.readFile(chunkPath);
        const decompressed = await gunzip(compressed);
        const chunk = JSON.parse(decompressed.toString('utf-8'));
        result.push(...chunk);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to load ${name}:`, error);
      return [];
    }
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
   * Returns 'sqljs', 'better-sqlite3', 'file-shard', or 'json' (legacy)
   */
  getStorageType(): StorageType | 'json' {
    return this.storageType || 'json';
  }

  /**
   * Check if using a database storage backend (not file-based)
   */
  isUsingDatabaseStorage(): boolean {
    return this.storageType === 'sqljs' || this.storageType === 'better-sqlite3';
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
