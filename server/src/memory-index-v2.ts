/**
 * Hybrid Memory Index with Storage Backend
 * Acts as lightweight cache over persistent storage (SQLite or file shards)
 * Dramatically reduces memory usage for large projects
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IIndexStorage } from './storage/index-storage.js';
import { StorageFactory } from './storage/storage-factory.js';

export interface SymbolStub {
  fqn: string;
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'record' | 'method' | 'field' | 'constructor';
  file: string;
  line: number;
  column: number;
  packageName: string;
  modifiers: string[];
  signature?: string;
  extends?: string;
  extendsClass?: string;
  implements?: string[];
  implementsInterfaces?: string[];
  declaringClass?: string;
}

export interface Reference {
  fromFqn: string;
  toFqn: string;
  file: string;
  line: number;
  column: number;
  kind: 'method_call' | 'field_access' | 'instantiation' | 'inheritance' | 'type_reference';
}

export interface FileInfo {
  path: string;
  hash: string;
  lastIndexed: number;
  mtime?: number;
  symbols: string[];
}

export interface CallGraphEdge {
  caller: string;
  callee: string;
  locations: Array<{ file: string; line: number; column: number }>;
}

export class MemoryIndexV2 {
  private storage: IIndexStorage | null = null;
  private indexDir: string = '';
  
  // Lightweight cache (LRU-style, limited size)
  private symbolCache: Map<string, SymbolStub> = new Map();
  private readonly MAX_SYMBOL_CACHE = 5000;
  
  // Track indexed files (small metadata only)
  private indexedFiles: Set<string> = new Set();

  constructor() {}

  /**
   * Initialize with storage backend
   */
  async initialize(indexDir: string): Promise<void> {
    this.indexDir = path.join(indexDir, '.mcp-index');
    this.storage = await StorageFactory.create(this.indexDir);
    
    // Load indexed files list
    const files = await this.storage.getAllFiles();
    this.indexedFiles = new Set(files.map(f => f.path));
  }

  setIndexDir(dir: string): void {
    this.indexDir = path.join(dir, '.mcp-index');
  }

  getIndexDir(): string {
    return this.indexDir;
  }

  private ensureStorage(): IIndexStorage {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  /**
   * Add symbol - writes to storage immediately
   */
  async addSymbol(stub: SymbolStub): Promise<void> {
    const storage = this.ensureStorage();
    await storage.saveSymbol(stub);
    
    // Update cache
    this.symbolCache.set(stub.fqn, stub);
    if (this.symbolCache.size > this.MAX_SYMBOL_CACHE) {
      const firstKey = this.symbolCache.keys().next().value;
      if (firstKey) {
        this.symbolCache.delete(firstKey);
      }
    }

    // Track inheritance for classes/interfaces/enums
    if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') {
      const extendsClass = stub.extends || stub.extendsClass;
      if (extendsClass) {
        await storage.saveInheritance(stub.fqn, extendsClass);
      }
      const implementsInterfaces = stub.implements || stub.implementsInterfaces;
      if (implementsInterfaces) {
        for (const iface of implementsInterfaces) {
          await storage.saveInheritance(stub.fqn, iface);
        }
      }
    }
  }

  /**
   * Add symbols in batch (more efficient)
   */
  async addSymbols(stubs: SymbolStub[]): Promise<void> {
    const storage = this.ensureStorage();
    
    await storage.beginTransaction();
    try {
      await storage.saveSymbols(stubs);
      
      // Track inheritance
      const inheritances: Array<{ child: string; parent: string }> = [];
      for (const stub of stubs) {
        if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') {
          const extendsClass = stub.extends || stub.extendsClass;
          if (extendsClass) {
            inheritances.push({ child: stub.fqn, parent: extendsClass });
          }
          const implementsInterfaces = stub.implements || stub.implementsInterfaces;
          if (implementsInterfaces) {
            for (const iface of implementsInterfaces) {
              inheritances.push({ child: stub.fqn, parent: iface });
            }
          }
        }
        
        // Update cache
        this.symbolCache.set(stub.fqn, stub);
      }
      
      if (inheritances.length > 0) {
        await storage.saveInheritances(inheritances);
      }
      
      await storage.commitTransaction();
    } catch (error) {
      await storage.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Get symbol - uses cache, falls back to storage
   */
  async getSymbol(fqn: string): Promise<SymbolStub | undefined> {
    // Check cache first
    if (this.symbolCache.has(fqn)) {
      return this.symbolCache.get(fqn);
    }

    // Query storage
    const storage = this.ensureStorage();
    const symbol = await storage.getSymbol(fqn);
    
    if (symbol) {
      this.symbolCache.set(fqn, symbol);
    }
    
    return symbol;
  }

  /**
   * Get all symbols (for semantic search) - paginated
   */
  async getAllSymbols(limit?: number, offset?: number): Promise<Map<string, SymbolStub>> {
    const storage = this.ensureStorage();
    const symbols = await storage.getAllSymbols({ limit, offset });
    
    const map = new Map<string, SymbolStub>();
    for (const symbol of symbols) {
      map.set(symbol.fqn, symbol);
    }
    
    return map;
  }

  /**
   * Find symbols by name (partial match)
   */
  async findSymbols(nameOrFqn: string): Promise<SymbolStub[]> {
    const storage = this.ensureStorage();
    let results = await storage.findSymbols(nameOrFqn);

    // If not found and it looks like a field access, try hierarchy search
    if (results.length === 0 && nameOrFqn.includes('.')) {
      const parts = nameOrFqn.split('.');
      const fieldName = parts[parts.length - 1];
      const className = parts.slice(0, -1).join('.');
      
      const fieldInHierarchy = await this.findFieldInHierarchy(className, fieldName);
      if (fieldInHierarchy) {
        results = [fieldInHierarchy];
      }
    }

    return results;
  }

  /**
   * Find field in class hierarchy
   */
  private async findFieldInHierarchy(className: string, fieldName: string): Promise<SymbolStub | undefined> {
    const storage = this.ensureStorage();
    
    // Resolve class name
    const classSymbols = await storage.findSymbols(className);
    const classSymbol = classSymbols.find(s => 
      s.kind === 'class' || s.kind === 'interface' || s.kind === 'enum'
    );
    
    if (!classSymbol) return undefined;

    // BFS through hierarchy
    const queue = [classSymbol.fqn];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentClass = queue.shift()!;
      if (visited.has(currentClass)) continue;
      visited.add(currentClass);

      // Look for field
      const fieldFqn = currentClass + '.' + fieldName;
      const field = await storage.getSymbol(fieldFqn);
      if (field && field.kind === 'field') {
        return field;
      }

      // Traverse hierarchy
      const parents = await storage.getParents(currentClass);
      queue.push(...parents);
    }

    return undefined;
  }

  /**
   * Add reference - writes to storage immediately
   */
  async addReference(ref: Reference): Promise<void> {
    const storage = this.ensureStorage();
    await storage.saveReference(ref);

    // Build call graph for method calls and instantiations
    if (ref.kind === 'method_call' || ref.kind === 'instantiation') {
      const edge: CallGraphEdge = {
        caller: ref.fromFqn,
        callee: ref.toFqn,
        locations: [{ file: ref.file, line: ref.line, column: ref.column }]
      };
      
      await storage.saveCallEdge(edge, 'forward');
      await storage.saveCallEdge(edge, 'reverse');
    }
  }

  /**
   * Add references in batch (more efficient)
   */
  async addReferences(refs: Reference[]): Promise<void> {
    const storage = this.ensureStorage();
    
    await storage.beginTransaction();
    try {
      await storage.saveReferences(refs);
      
      // Build call graph edges
      const forwardEdges: CallGraphEdge[] = [];
      const reverseEdges: CallGraphEdge[] = [];
      
      for (const ref of refs) {
        if (ref.kind === 'method_call' || ref.kind === 'instantiation') {
          const edge: CallGraphEdge = {
            caller: ref.fromFqn,
            callee: ref.toFqn,
            locations: [{ file: ref.file, line: ref.line, column: ref.column }]
          };
          
          forwardEdges.push(edge);
          reverseEdges.push(edge);
        }
      }
      
      if (forwardEdges.length > 0) {
        await storage.saveCallEdges(forwardEdges, 'forward');
        await storage.saveCallEdges(reverseEdges, 'reverse');
      }
      
      await storage.commitTransaction();
    } catch (error) {
      await storage.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Find all usages of a symbol
   */
  async findUsages(fqn: string): Promise<Reference[]> {
    const storage = this.ensureStorage();
    return await storage.findUsages(fqn);
  }

  /**
   * Find all references FROM a class (what this class uses)
   * This catches same-package dependencies that don't need explicit imports
   */
  async findReferencesFromClass(classFqn: string): Promise<Reference[]> {
    const storage = this.ensureStorage();
    return await storage.findReferencesFromClass(classFqn);
  }

  /**
   * Get outbound calls (what this method calls)
   */
  async getOutboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    const storage = this.ensureStorage();
    return await storage.getOutboundCalls(fqn);
  }

  /**
   * Get inbound calls (who calls this method)
   */
  async getInboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    const storage = this.ensureStorage();
    return await storage.getInboundCalls(fqn);
  }

  /**
   * Get parent classes/interfaces
   */
  async getParents(fqn: string): Promise<string[]> {
    const storage = this.ensureStorage();
    return await storage.getParents(fqn);
  }

  /**
   * Get child classes/implementations
   */
  async getChildren(fqn: string): Promise<string[]> {
    const storage = this.ensureStorage();
    return await storage.getChildren(fqn);
  }

  /**
   * Add file metadata
   */
  async addFile(filePath: string, hash: string, symbols: string[], isIndexedFile: boolean = true, mtime?: number): Promise<void> {
    const storage = this.ensureStorage();
    
    const fileInfo: FileInfo = {
      path: filePath,
      hash,
      lastIndexed: Date.now(),
      mtime: typeof mtime === 'number' ? mtime : Date.now(),
      symbols
    };
    
    await storage.saveFile(fileInfo);
    
    if (isIndexedFile) {
      this.indexedFiles.add(filePath);
    }
  }

  /**
   * Get file metadata
   */
  async getFile(filePath: string): Promise<FileInfo | undefined> {
    const storage = this.ensureStorage();
    return await storage.getFile(filePath);
  }

  /**
   * Get all files
   */
  async getAllFiles(): Promise<FileInfo[]> {
    const storage = this.ensureStorage();
    return await storage.getAllFiles();
  }

  /**
   * Remove file and its data
   */
  async removeFile(filePath: string): Promise<void> {
    const storage = this.ensureStorage();
    await storage.deleteFile(filePath);
    this.indexedFiles.delete(filePath);
  }

  /**
   * Calculate file hash
   */
  static async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if file needs reindexing
   */
  async needsReindex(filePath: string): Promise<boolean> {
    const fileInfo = await this.getFile(filePath);
    if (!fileInfo) return true;

    try {
      const currentHash = await MemoryIndexV2.calculateFileHash(filePath);
      return currentHash !== fileInfo.hash;
    } catch {
      return true;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const storage = this.ensureStorage();
    const stats = await storage.getStats();
    
    return {
      symbols: stats.symbols,
      indexedFiles: this.indexedFiles.size,
      allFiles: stats.allFiles,
      references: stats.references,
      callGraphEdges: stats.callGraphEdges,
      inheritanceRelations: stats.inheritanceRelations
    };
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    const storage = this.ensureStorage();
    await storage.clear();
    this.symbolCache.clear();
    this.indexedFiles.clear();
  }

  /**
   * Maintenance cleanup (no-op for storage-backed index)
   */
  performMaintenanceCleanup(): void {
    // With storage backend, we don't need in-memory cleanup
    // Storage handles its own memory efficiently
    console.error('💾 Storage-backed index - maintenance cleanup not needed');
  }

  /**
   * Close storage (cleanup)
   */
  async close(): Promise<void> {
    if (this.storage) {
      await this.storage.close();
    }
  }

  // Legacy compatibility methods (for migration)
  
  toJSON() {
    throw new Error('toJSON() not supported in storage-backed index. Data is persisted automatically.');
  }

  fromJSON(data: any): void {
    throw new Error('fromJSON() not supported in storage-backed index. Use initialize() instead.');
  }
}
