import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryIndex } from './memory-index.js';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class Persistence {
  private indexDir: string;
  private readonly CHUNK_SIZE = 5000; // Optimal chunk size from testing

  constructor(indexDir: string) {
    this.indexDir = indexDir;
  }

  // Ensure index directory exists
  async ensureIndexDir(): Promise<void> {
    try {
      await fs.mkdir(this.indexDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create index directory:', error);
    }
  }

  // Save index to disk with chunking and compression
  async save(memoryIndex: MemoryIndex): Promise<void> {
    await this.ensureIndexDir();

    const data = memoryIndex.toJSON();
    
    // Skip save if storage backend is enabled
    if (data && (data as any)._storageBackend) {
      console.error('⚠️  Skipping JSON persistence - storage backend handles it');
      return;
    }
    
    try {
      // Save metadata separately
      const metadata = {
        version: '1.0',
        timestamp: Date.now(),
        stats: {
          symbols: data.symbols?.length || 0,
          files: data.files?.length || 0,
          indexedFiles: data.indexedFiles?.length || 0,
          references: data.references?.length || 0,
          referencesByFile: data.referencesByFile?.length || 0,
          callGraph: data.callGraph?.length || 0,
          reverseCallGraph: data.reverseCallGraph?.length || 0,
          inheritance: data.inheritance?.length || 0,
          reverseInheritance: data.reverseInheritance?.length || 0
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

  // PERFORMANCE: Save array data in chunks WITHOUT compression for 3-5x faster I/O
  // Modern SSDs have plenty of bandwidth, compression CPU cost > I/O savings
  private async saveChunked(name: string, data: any[]): Promise<void> {
    const totalChunks = Math.ceil(data.length / this.CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, data.length);
      const chunk = data.slice(start, end);
      
      const chunkData = JSON.stringify(chunk);
      // Skip compression - raw I/O is faster on modern hardware
      
      const chunkPath = path.join(this.indexDir, `${name}_${i}.json`);
      await fs.writeFile(chunkPath, chunkData, 'utf-8');
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
      const data: any = {
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

  // PERFORMANCE: Load chunked array data WITHOUT decompression
  private async loadChunkedArray(name: string): Promise<any[]> {
    try {
      const chunksPath = path.join(this.indexDir, `${name}_chunks.txt`);
      const chunksContent = await fs.readFile(chunksPath, 'utf-8');
      const totalChunks = parseInt(chunksContent, 10);
      
      const result: any[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        // Try new uncompressed format first
        let chunkPath = path.join(this.indexDir, `${name}_${i}.json`);
        try {
          const content = await fs.readFile(chunkPath, 'utf-8');
          const chunk = JSON.parse(content);
          result.push(...chunk);
        } catch {
          // Fallback to old compressed format
          chunkPath = path.join(this.indexDir, `${name}_${i}.json.gz`);
          const compressed = await fs.readFile(chunkPath);
          const decompressed = await gunzip(compressed);
          const chunk = JSON.parse(decompressed.toString('utf-8'));
          result.push(...chunk);
        }
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
