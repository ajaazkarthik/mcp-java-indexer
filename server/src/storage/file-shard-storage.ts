/**
 * File-shard based storage implementation (fallback when SQLite unavailable)
 * Uses JSON files for persistence with on-demand loading to minimize memory usage
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { IIndexStorage, IndexStats, StorageQueryOptions } from './index-storage.js';
import { SymbolStub, Reference, CallGraphEdge, FileInfo } from '../memory-index.js';

interface ShardIndex {
  symbols: Map<string, string>; // FQN -> shard file name
  files: Map<string, FileInfo>;
}

export class FileShardStorage implements IIndexStorage {
  private readonly indexDir: string;
  private readonly shardsDir: string;
  private shardIndex: ShardIndex;
  private currentShard = 0;
  private readonly SYMBOLS_PER_SHARD = 1000;

  // In-memory caches (LRU-style, limited size)
  private symbolCache: Map<string, SymbolStub> = new Map();
  private readonly MAX_CACHE_SIZE = 5000;

  constructor(indexDir: string) {
    this.indexDir = indexDir;
    this.shardsDir = path.join(indexDir, 'shards');
    this.shardIndex = {
      symbols: new Map(),
      files: new Map()
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.shardsDir, { recursive: true });
    await this.loadShardIndex();
    console.error('✅ File shard storage initialized at', this.indexDir);
  }

  private async loadShardIndex(): Promise<void> {
    const indexPath = path.join(this.indexDir, 'shard-index.json');
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const data = JSON.parse(content);
      
      const fileEntries: Array<[string, FileInfo]> = [];
      for (const entry of data.files || []) {
        const [filePath, info] = entry as [string, FileInfo];
        const normalizedInfo: FileInfo = {
          ...info,
          mtime: typeof info.mtime === 'number' ? info.mtime : info.lastIndexed
        };
        fileEntries.push([filePath, normalizedInfo]);
      }

      this.shardIndex = {
        symbols: new Map(data.symbols || []),
        files: new Map(fileEntries)
      };
      
      this.currentShard = data.currentShard || 0;
    } catch {
      // New index
      this.shardIndex = {
        symbols: new Map(),
        files: new Map()
      };
      this.currentShard = 0;
    }
  }

  private async saveShardIndex(): Promise<void> {
    const indexPath = path.join(this.indexDir, 'shard-index.json');
    
    const data = {
      symbols: Array.from(this.shardIndex.symbols.entries()),
      files: Array.from(this.shardIndex.files.entries()),
      currentShard: this.currentShard
    };
    
    await fs.writeFile(indexPath, JSON.stringify(data), 'utf-8');
  }

  async exists(): Promise<boolean> {
    const indexPath = path.join(this.indexDir, 'shard-index.json');
    try {
      await fs.access(indexPath);
      return true;
    } catch {
      return false;
    }
  }

  private getShardPath(shardName: string, type: 'symbols' | 'refs' | 'calls' | 'inheritance'): string {
    return path.join(this.shardsDir, `${type}_${shardName}.json`);
  }

  private async loadShard(shardName: string, type: 'symbols' | 'refs' | 'calls' | 'inheritance'): Promise<any[]> {
    const shardPath = this.getShardPath(shardName, type);
    
    try {
      const content = await fs.readFile(shardPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async saveShard(shardName: string, type: 'symbols' | 'refs' | 'calls' | 'inheritance', data: any[]): Promise<void> {
    const shardPath = this.getShardPath(shardName, type);
    await fs.writeFile(shardPath, JSON.stringify(data), 'utf-8');
  }

  async saveSymbol(symbol: SymbolStub): Promise<void> {
    // Determine shard for this symbol
    let shardName = this.shardIndex.symbols.get(symbol.fqn);
    
    if (!shardName) {
      // Assign to current shard
      shardName = `shard_${this.currentShard}`;
      this.shardIndex.symbols.set(symbol.fqn, shardName);
      
      // Check if we need a new shard
      const shardSymbols = Array.from(this.shardIndex.symbols.values()).filter(s => s === shardName);
      if (shardSymbols.length >= this.SYMBOLS_PER_SHARD) {
        this.currentShard++;
      }
    }

    // Load shard, update, save
    const shard = await this.loadShard(shardName, 'symbols');
    const index = shard.findIndex((s: SymbolStub) => s.fqn === symbol.fqn);
    
    if (index >= 0) {
      shard[index] = symbol;
    } else {
      shard.push(symbol);
    }
    
    await this.saveShard(shardName, 'symbols', shard);
    
    // Update cache
    this.symbolCache.set(symbol.fqn, symbol);
    if (this.symbolCache.size > this.MAX_CACHE_SIZE) {
      // Simple FIFO eviction
      const firstKey = this.symbolCache.keys().next().value;
      if (firstKey) {
        this.symbolCache.delete(firstKey);
      }
    }

    await this.saveShardIndex();
  }

  async saveSymbols(symbols: SymbolStub[]): Promise<void> {
    // Group symbols by shard
    const shardGroups = new Map<string, SymbolStub[]>();
    
    for (const symbol of symbols) {
      let shardName = this.shardIndex.symbols.get(symbol.fqn);
      
      if (!shardName) {
        shardName = `shard_${this.currentShard}`;
        this.shardIndex.symbols.set(symbol.fqn, shardName);
        
        const shardSymbols = Array.from(this.shardIndex.symbols.values()).filter(s => s === shardName);
        if (shardSymbols.length >= this.SYMBOLS_PER_SHARD) {
          this.currentShard++;
        }
      }
      
      if (!shardGroups.has(shardName)) {
        shardGroups.set(shardName, []);
      }
      shardGroups.get(shardName)!.push(symbol);
    }

    // Save each shard
    for (const [shardName, syms] of shardGroups) {
      const shard = await this.loadShard(shardName, 'symbols');
      
      for (const symbol of syms) {
        const index = shard.findIndex((s: SymbolStub) => s.fqn === symbol.fqn);
        if (index >= 0) {
          shard[index] = symbol;
        } else {
          shard.push(symbol);
        }
        
        this.symbolCache.set(symbol.fqn, symbol);
      }
      
      await this.saveShard(shardName, 'symbols', shard);
    }

    await this.saveShardIndex();
  }

  async getSymbol(fqn: string): Promise<SymbolStub | undefined> {
    // Check cache first
    if (this.symbolCache.has(fqn)) {
      return this.symbolCache.get(fqn);
    }

    const shardName = this.shardIndex.symbols.get(fqn);
    if (!shardName) return undefined;

    const shard = await this.loadShard(shardName, 'symbols');
    const symbol = shard.find((s: SymbolStub) => s.fqn === fqn);
    
    if (symbol) {
      this.symbolCache.set(fqn, symbol);
    }
    
    return symbol;
  }

  async findSymbols(nameOrFqn: string, options?: StorageQueryOptions): Promise<SymbolStub[]> {
    // Try exact match first
    const exact = await this.getSymbol(nameOrFqn);
    if (exact) return [exact];

    // Partial search - need to scan all shards
    const results: SymbolStub[] = [];
    const lowerQuery = nameOrFqn.toLowerCase();
    const limit = options?.limit || 100;

    // Get all unique shard names
    const shardNames = new Set(this.shardIndex.symbols.values());
    
    for (const shardName of shardNames) {
      if (results.length >= limit) break;
      
      const shard = await this.loadShard(shardName, 'symbols');
      
      for (const symbol of shard) {
        if (results.length >= limit) break;
        
        if (symbol.name.toLowerCase().includes(lowerQuery) ||
            symbol.fqn.toLowerCase().includes(lowerQuery)) {
          results.push(symbol);
        }
      }
    }

    return results;
  }

  async getAllSymbols(options?: StorageQueryOptions): Promise<SymbolStub[]> {
    const limit = options?.limit || 10000;
    const offset = options?.offset || 0;
    const results: SymbolStub[] = [];

    const shardNames = new Set(this.shardIndex.symbols.values());
    let count = 0;

    for (const shardName of shardNames) {
      if (results.length >= limit) break;
      
      const shard = await this.loadShard(shardName, 'symbols');
      
      for (const symbol of shard) {
        if (count < offset) {
          count++;
          continue;
        }
        
        if (results.length >= limit) break;
        results.push(symbol);
        count++;
      }
    }

    return results;
  }

  async deleteSymbol(fqn: string): Promise<void> {
    const shardName = this.shardIndex.symbols.get(fqn);
    if (!shardName) return;

    const shard = await this.loadShard(shardName, 'symbols');
    const filtered = shard.filter((s: SymbolStub) => s.fqn !== fqn);
    
    await this.saveShard(shardName, 'symbols', filtered);
    this.shardIndex.symbols.delete(fqn);
    this.symbolCache.delete(fqn);
    
    await this.saveShardIndex();
  }

  async saveReference(ref: Reference): Promise<void> {
    // Store references by file for efficient cleanup
    const fileName = path.basename(ref.file);
    const shard = await this.loadShard(fileName, 'refs');
    
    // Check for duplicate
    const exists = shard.some((r: Reference) =>
      r.fromFqn === ref.fromFqn &&
      r.toFqn === ref.toFqn &&
      r.file === ref.file &&
      r.line === ref.line &&
      r.column === ref.column &&
      r.kind === ref.kind
    );
    
    if (!exists) {
      shard.push(ref);
      await this.saveShard(fileName, 'refs', shard);
    }
  }

  async saveReferences(refs: Reference[]): Promise<void> {
    // Group by file
    const fileGroups = new Map<string, Reference[]>();
    
    for (const ref of refs) {
      const fileName = path.basename(ref.file);
      if (!fileGroups.has(fileName)) {
        fileGroups.set(fileName, []);
      }
      fileGroups.get(fileName)!.push(ref);
    }

    // Save each file's references
    for (const [fileName, fileRefs] of fileGroups) {
      const shard = await this.loadShard(fileName, 'refs');
      
      for (const ref of fileRefs) {
        const exists = shard.some((r: Reference) =>
          r.fromFqn === ref.fromFqn &&
          r.toFqn === ref.toFqn &&
          r.file === ref.file &&
          r.line === ref.line &&
          r.column === ref.column &&
          r.kind === ref.kind
        );
        
        if (!exists) {
          shard.push(ref);
        }
      }
      
      await this.saveShard(fileName, 'refs', shard);
    }
  }

  async findUsages(fqn: string): Promise<Reference[]> {
    const simpleName = fqn.split('.').pop() || fqn;
    const results: Reference[] = [];

    // Scan all reference shards
    const files = await fs.readdir(this.shardsDir);
    const refFiles = files.filter(f => f.startsWith('refs_'));

    for (const file of refFiles) {
      const shardName = file.replace('refs_', '').replace('.json', '');
      const shard = await this.loadShard(shardName, 'refs');
      
      for (const ref of shard) {
        if (ref.toFqn === fqn ||
            ref.toFqn === simpleName ||
            ref.toFqn.startsWith(fqn + '.') ||
            (simpleName !== fqn && ref.toFqn.endsWith('.' + simpleName))) {
          results.push(ref);
        }
      }
    }

    return results;
  }

  async findReferencesFromClass(classFqn: string): Promise<Reference[]> {
    const results: Reference[] = [];

    // Scan all reference shards
    const files = await fs.readdir(this.shardsDir);
    const refFiles = files.filter(f => f.startsWith('refs_'));

    for (const file of refFiles) {
      const shardName = file.replace('refs_', '').replace('.json', '');
      const shard = await this.loadShard(shardName, 'refs');
      
      for (const ref of shard) {
        // Match if fromFqn is exactly the class, or starts with class. (methods/fields)
        // or starts with class( (constructors)
        if (ref.fromFqn === classFqn ||
            ref.fromFqn.startsWith(classFqn + '.') ||
            ref.fromFqn.startsWith(classFqn + '(')) {
          results.push(ref);
        }
      }
    }

    return results;
  }

  async deleteReferencesByFile(file: string): Promise<void> {
    const fileName = path.basename(file);
    const shardPath = this.getShardPath(fileName, 'refs');
    
    try {
      await fs.unlink(shardPath);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  async getAllReferences(options?: StorageQueryOptions): Promise<Reference[]> {
    // Load all reference shards
    const refsDir = path.join(this.shardsDir, 'refs');
    const results: Reference[] = [];
    
    try {
      const files = await fs.readdir(refsDir);
      let count = 0;
      const limit = options?.limit || Infinity;
      const offset = options?.offset || 0;
      let skipped = 0;
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(refsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const refs: Reference[] = JSON.parse(content);
        
        for (const ref of refs) {
          if (skipped < offset) {
            skipped++;
            continue;
          }
          if (count >= limit) break;
          results.push(ref);
          count++;
        }
        
        if (count >= limit) break;
      }
    } catch {
      // refs dir doesn't exist
    }
    
    return results;
  }

  async getAllCallGraphEdges(options?: StorageQueryOptions): Promise<CallGraphEdge[]> {
    // Load all forward call graph shards
    const callsDir = path.join(this.shardsDir, 'calls');
    const results: CallGraphEdge[] = [];
    
    try {
      const files = await fs.readdir(callsDir);
      let count = 0;
      const limit = options?.limit || Infinity;
      const offset = options?.offset || 0;
      let skipped = 0;
      
      for (const file of files) {
        // Only read forward shards to avoid duplicates
        if (!file.startsWith('forward_') || !file.endsWith('.json')) continue;
        
        const filePath = path.join(callsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const edges: CallGraphEdge[] = JSON.parse(content);
        
        for (const edge of edges) {
          if (skipped < offset) {
            skipped++;
            continue;
          }
          if (count >= limit) break;
          results.push(edge);
          count++;
        }
        
        if (count >= limit) break;
      }
    } catch {
      // calls dir doesn't exist
    }
    
    return results;
  }

  async saveCallEdge(edge: CallGraphEdge, direction: 'forward' | 'reverse'): Promise<void> {
    const key = direction === 'forward' ? edge.caller : edge.callee;
    const shardName = `${direction}_${key}`;
    
    const shard = await this.loadShard(shardName, 'calls');
    const index = shard.findIndex((e: CallGraphEdge) => e.caller === edge.caller && e.callee === edge.callee);
    
    if (index >= 0) {
      shard[index] = edge;
    } else {
      shard.push(edge);
    }
    
    await this.saveShard(shardName, 'calls', shard);
  }

  async saveCallEdges(edges: CallGraphEdge[], direction: 'forward' | 'reverse'): Promise<void> {
    const shardGroups = new Map<string, CallGraphEdge[]>();
    
    for (const edge of edges) {
      const key = direction === 'forward' ? edge.caller : edge.callee;
      const shardName = `${direction}_${key}`;
      
      if (!shardGroups.has(shardName)) {
        shardGroups.set(shardName, []);
      }
      shardGroups.get(shardName)!.push(edge);
    }

    for (const [shardName, edgeList] of shardGroups) {
      const shard = await this.loadShard(shardName, 'calls');
      
      for (const edge of edgeList) {
        const index = shard.findIndex((e: CallGraphEdge) => e.caller === edge.caller && e.callee === edge.callee);
        if (index >= 0) {
          shard[index] = edge;
        } else {
          shard.push(edge);
        }
      }
      
      await this.saveShard(shardName, 'calls', shard);
    }
  }

  async getOutboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    const shardName = `forward_${fqn}`;
    return await this.loadShard(shardName, 'calls');
  }

  async getInboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    const shardName = `reverse_${fqn}`;
    const exact = await this.loadShard(shardName, 'calls');
    
    // Fuzzy matching would require scanning all reverse call shards
    // For performance, just return exact matches
    return exact;
  }

  async deleteCallEdgesByFile(file: string): Promise<void> {
    // This is expensive - need to scan all call shards
    // For file shard storage, we'll skip this optimization
  }

  async saveInheritance(child: string, parent: string): Promise<void> {
    const shardName = `inheritance_${child}`;
    const shard = await this.loadShard(shardName, 'inheritance');
    
    if (!shard.includes(parent)) {
      shard.push(parent);
      await this.saveShard(shardName, 'inheritance', shard);
    }
  }

  async saveInheritances(relationships: Array<{ child: string; parent: string }>): Promise<void> {
    const shardGroups = new Map<string, string[]>();
    
    for (const rel of relationships) {
      const shardName = `inheritance_${rel.child}`;
      if (!shardGroups.has(shardName)) {
        shardGroups.set(shardName, []);
      }
      shardGroups.get(shardName)!.push(rel.parent);
    }

    for (const [shardName, parents] of shardGroups) {
      const shard = await this.loadShard(shardName, 'inheritance');
      
      for (const parent of parents) {
        if (!shard.includes(parent)) {
          shard.push(parent);
        }
      }
      
      await this.saveShard(shardName, 'inheritance', shard);
    }
  }

  async getParents(fqn: string): Promise<string[]> {
    const shardName = `inheritance_${fqn}`;
    return await this.loadShard(shardName, 'inheritance');
  }

  async getChildren(fqn: string): Promise<string[]> {
    // Would need reverse index - expensive with file shards
    // For now, return empty array
    return [];
  }

  async deleteInheritance(fqn: string): Promise<void> {
    const shardName = `inheritance_${fqn}`;
    const shardPath = this.getShardPath(shardName, 'inheritance');
    
    try {
      await fs.unlink(shardPath);
    } catch {
      // Doesn't exist, that's fine
    }
  }

  async saveFile(file: FileInfo): Promise<void> {
    const normalizedFile: FileInfo = {
      ...file,
      mtime: typeof file.mtime === 'number' ? file.mtime : file.lastIndexed
    };
    this.shardIndex.files.set(file.path, normalizedFile);
    await this.saveShardIndex();
  }

  async getFile(filePath: string): Promise<FileInfo | undefined> {
    const info = this.shardIndex.files.get(filePath);
    if (!info) return undefined;
    if (typeof info.mtime !== 'number') {
      info.mtime = info.lastIndexed;
    }
    return info;
  }

  async getAllFiles(): Promise<FileInfo[]> {
    return Array.from(this.shardIndex.files.values()).map(info => {
      if (typeof info.mtime !== 'number') {
        info.mtime = info.lastIndexed;
      }
      return info;
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    this.shardIndex.files.delete(filePath);
    
    // Delete references for this file
    await this.deleteReferencesByFile(filePath);
    
    await this.saveShardIndex();
  }

  async getStats(): Promise<IndexStats> {
    return {
      symbols: this.shardIndex.symbols.size,
      indexedFiles: Array.from(this.shardIndex.files.values()).length,
      allFiles: this.shardIndex.files.size,
      references: 0, // Would need to scan all ref shards
      callGraphEdges: 0, // Would need to scan all call shards
      inheritanceRelations: 0 // Would need to scan all inheritance shards
    };
  }

  async clear(): Promise<void> {
    // Delete all shard files
    try {
      const files = await fs.readdir(this.shardsDir);
      for (const file of files) {
        await fs.unlink(path.join(this.shardsDir, file));
      }
    } catch {
      // Directory doesn't exist, that's fine
    }

    // Clear index
    this.shardIndex = {
      symbols: new Map(),
      files: new Map()
    };
    this.currentShard = 0;
    this.symbolCache.clear();

    await this.saveShardIndex();
  }

  async flush(): Promise<void> {
    // Ensure shard index is saved
    await this.saveShardIndex();
  }

  async close(): Promise<void> {
    // Save any pending shard index
    await this.saveShardIndex();
  }

  async beginTransaction(): Promise<void> {
    // No transaction support for file shards
  }

  async commitTransaction(): Promise<void> {
    // No transaction support for file shards
  }

  async rollbackTransaction(): Promise<void> {
    // No transaction support for file shards
  }
}
