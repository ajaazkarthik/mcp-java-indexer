/**
 * Migration Adapter: Wraps MemoryIndexV2 to provide backward compatibility
 * with the original MemoryIndex interface while using storage backend
 * 
 * This allows gradual migration without breaking existing code
 */

import { MemoryIndexV2, SymbolStub, Reference, CallGraphEdge, FileInfo } from './memory-index-v2.js';

export class MemoryIndexAdapter {
  private indexV2: MemoryIndexV2;
  private indexDir: string = '';
  private initialized = false;

  constructor() {
    this.indexV2 = new MemoryIndexV2();
  }

  /**
   * Set index directory (must be called before use)
   */
  setIndexDir(dir: string): void {
    this.indexDir = dir;
    this.indexV2.setIndexDir(dir);
  }

  getIndexDir(): string {
    return this.indexV2.getIndexDir();
  }

  /**
   * Lazy initialization - called automatically on first use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.indexDir) {
      await this.indexV2.initialize(this.indexDir);
      this.initialized = true;
    }
  }

  /**
   * Add symbol (synchronous wrapper around async operation)
   * Queues operation and resolves in background
   */
  addSymbol(stub: SymbolStub): void {
    this.ensureInitialized().then(() => {
      return this.indexV2.addSymbol(stub);
    }).catch(err => {
      console.error('Error adding symbol:', err);
    });
  }

  /**
   * Get symbol (synchronous - uses cache)
   */
  getSymbol(fqn: string): SymbolStub | undefined {
    // This is tricky - original is sync, new is async
    // For now, throw error to force async migration
    throw new Error('getSymbol() is now async. Use await getSymbolAsync(fqn) instead.');
  }

  /**
   * Async version of getSymbol
   */
  async getSymbolAsync(fqn: string): Promise<SymbolStub | undefined> {
    await this.ensureInitialized();
    return await this.indexV2.getSymbol(fqn);
  }

  /**
   * Get all symbols (for semantic search)
   */
  getAllSymbols(): Map<string, SymbolStub> {
    throw new Error('getAllSymbols() is now async. Use await getAllSymbolsAsync() instead.');
  }

  /**
   * Async version of getAllSymbols
   */
  async getAllSymbolsAsync(): Promise<Map<string, SymbolStub>> {
    await this.ensureInitialized();
    return await this.indexV2.getAllSymbols();
  }

  /**
   * Find symbols by name
   */
  findSymbols(nameOrFqn: string): SymbolStub[] {
    throw new Error('findSymbols() is now async. Use await findSymbolsAsync(nameOrFqn) instead.');
  }

  /**
   * Async version of findSymbols
   */
  async findSymbolsAsync(nameOrFqn: string): Promise<SymbolStub[]> {
    await this.ensureInitialized();
    return await this.indexV2.findSymbols(nameOrFqn);
  }

  /**
   * Add reference
   */
  addReference(ref: Reference): void {
    this.ensureInitialized().then(() => {
      return this.indexV2.addReference(ref);
    }).catch(err => {
      console.error('Error adding reference:', err);
    });
  }

  /**
   * Find usages
   */
  findUsages(fqn: string): Reference[] {
    throw new Error('findUsages() is now async. Use await findUsagesAsync(fqn) instead.');
  }

  /**
   * Async version of findUsages
   */
  async findUsagesAsync(fqn: string): Promise<Reference[]> {
    await this.ensureInitialized();
    return await this.indexV2.findUsages(fqn);
  }

  /**
   * Find all references FROM a class (what this class uses)
   */
  findReferencesFromClass(classFqn: string): Reference[] {
    throw new Error('findReferencesFromClass() is now async. Use await findReferencesFromClassAsync(classFqn) instead.');
  }

  /**
   * Async version of findReferencesFromClass
   */
  async findReferencesFromClassAsync(classFqn: string): Promise<Reference[]> {
    await this.ensureInitialized();
    return await this.indexV2.findReferencesFromClass(classFqn);
  }

  /**
   * Get outbound calls
   */
  getOutboundCalls(fqn: string): CallGraphEdge[] {
    throw new Error('getOutboundCalls() is now async. Use await getOutboundCallsAsync(fqn) instead.');
  }

  /**
   * Async version
   */
  async getOutboundCallsAsync(fqn: string): Promise<CallGraphEdge[]> {
    await this.ensureInitialized();
    return await this.indexV2.getOutboundCalls(fqn);
  }

  /**
   * Get inbound calls
   */
  getInboundCalls(fqn: string): CallGraphEdge[] {
    throw new Error('getInboundCalls() is now async. Use await getInboundCallsAsync(fqn) instead.');
  }

  /**
   * Async version
   */
  async getInboundCallsAsync(fqn: string): Promise<CallGraphEdge[]> {
    await this.ensureInitialized();
    return await this.indexV2.getInboundCalls(fqn);
  }

  /**
   * Get parents
   */
  getParents(fqn: string): string[] {
    throw new Error('getParents() is now async. Use await getParentsAsync(fqn) instead.');
  }

  /**
   * Async version
   */
  async getParentsAsync(fqn: string): Promise<string[]> {
    await this.ensureInitialized();
    return await this.indexV2.getParents(fqn);
  }

  /**
   * Get children
   */
  getChildren(fqn: string): string[] {
    throw new Error('getChildren() is now async. Use await getChildrenAsync(fqn) instead.');
  }

  /**
   * Async version
   */
  async getChildrenAsync(fqn: string): Promise<string[]> {
    await this.ensureInitialized();
    return await this.indexV2.getChildren(fqn);
  }

  /**
   * Add file
   */
  addFile(filePath: string, hash: string, symbols: string[], isIndexedFile: boolean = true): void {
    this.ensureInitialized().then(() => {
      return this.indexV2.addFile(filePath, hash, symbols, isIndexedFile);
    }).catch(err => {
      console.error('Error adding file:', err);
    });
  }

  /**
   * Get file
   */
  getFile(filePath: string): FileInfo | undefined {
    throw new Error('getFile() is now async. Use await getFileAsync(filePath) instead.');
  }

  /**
   * Async version
   */
  async getFileAsync(filePath: string): Promise<FileInfo | undefined> {
    await this.ensureInitialized();
    return await this.indexV2.getFile(filePath);
  }

  /**
   * Get all files
   */
  getAllFiles(): FileInfo[] {
    throw new Error('getAllFiles() is now async. Use await getAllFilesAsync() instead.');
  }

  /**
   * Async version
   */
  async getAllFilesAsync(): Promise<FileInfo[]> {
    await this.ensureInitialized();
    return await this.indexV2.getAllFiles();
  }

  /**
   * Remove file
   */
  removeFile(filePath: string): void {
    this.ensureInitialized().then(() => {
      return this.indexV2.removeFile(filePath);
    }).catch(err => {
      console.error('Error removing file:', err);
    });
  }

  /**
   * Calculate file hash (static)
   */
  static async calculateFileHash(filePath: string): Promise<string> {
    return MemoryIndexV2.calculateFileHash(filePath);
  }

  /**
   * Check if needs reindex
   */
  async needsReindex(filePath: string): Promise<boolean> {
    await this.ensureInitialized();
    return await this.indexV2.needsReindex(filePath);
  }

  /**
   * Get stats
   */
  getStats() {
    throw new Error('getStats() is now async. Use await getStatsAsync() instead.');
  }

  /**
   * Async version
   */
  async getStatsAsync() {
    await this.ensureInitialized();
    return await this.indexV2.getStats();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.ensureInitialized().then(() => {
      return this.indexV2.clear();
    }).catch(err => {
      console.error('Error clearing index:', err);
    });
  }

  /**
   * Async version
   */
  async clearAsync(): Promise<void> {
    await this.ensureInitialized();
    return await this.indexV2.clear();
  }

  /**
   * Maintenance cleanup (no-op for storage backend)
   */
  performMaintenanceCleanup(): void {
    this.indexV2.performMaintenanceCleanup();
  }

  /**
   * Persistence methods (legacy compatibility)
   */
  toJSON() {
    return this.indexV2.toJSON();
  }

  fromJSON(data: any): void {
    return this.indexV2.fromJSON(data);
  }

  /**
   * Close storage
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await this.indexV2.close();
    }
  }

  /**
   * Get underlying V2 index (for direct access)
   */
  getV2(): MemoryIndexV2 {
    return this.indexV2;
  }
}
