/**
 * sql.js storage backend - DISABLED
 * 
 * This stub exists for historical imports only.
 * better-sqlite3 is the only supported storage backend.
 * This class will throw if instantiated or used.
 */

import { IIndexStorage, IndexStats, StorageQueryOptions } from './index-storage.js';
import { SymbolStub, Reference, CallGraphEdge, FileInfo } from '../memory-index.js';

export class SqljsStorage implements IIndexStorage {
  constructor(_indexDir: string) {}

  private fail(): never {
    throw new Error('SqljsStorage is disabled. Use better-sqlite3 backend instead. Install with: npm install better-sqlite3');
  }

  async initialize(): Promise<void> { this.fail(); }
  async exists(): Promise<boolean> { return this.fail(); }
  async saveSymbol(_symbol: SymbolStub): Promise<void> { this.fail(); }
  async saveSymbols(_symbols: SymbolStub[]): Promise<void> { this.fail(); }
  async getSymbol(_fqn: string): Promise<SymbolStub | undefined> { return this.fail(); }
  async findSymbols(_nameOrFqn: string, _options?: StorageQueryOptions): Promise<SymbolStub[]> { return this.fail(); }
  async getAllSymbols(_options?: StorageQueryOptions): Promise<SymbolStub[]> { return this.fail(); }
  async deleteSymbol(_fqn: string): Promise<void> { this.fail(); }
  async saveReference(_ref: Reference): Promise<void> { this.fail(); }
  async saveReferences(_refs: Reference[]): Promise<void> { this.fail(); }
  async getAllReferences(_options?: StorageQueryOptions): Promise<Reference[]> { return this.fail(); }
  async findUsages(_fqn: string): Promise<Reference[]> { return this.fail(); }
  async findReferencesFromClass(_classFqn: string): Promise<Reference[]> { return this.fail(); }
  async deleteReferencesByFile(_file: string): Promise<void> { this.fail(); }
  async saveCallEdge(_edge: CallGraphEdge, _direction: 'forward' | 'reverse'): Promise<void> { this.fail(); }
  async saveCallEdges(_edges: CallGraphEdge[], _direction: 'forward' | 'reverse'): Promise<void> { this.fail(); }
  async getAllCallGraphEdges(_options?: StorageQueryOptions): Promise<CallGraphEdge[]> { return this.fail(); }
  async getOutboundCalls(_fqn: string): Promise<CallGraphEdge[]> { return this.fail(); }
  async getInboundCalls(_fqn: string): Promise<CallGraphEdge[]> { return this.fail(); }
  async deleteCallEdgesByFile(_file: string): Promise<void> { this.fail(); }
  async saveInheritance(_child: string, _parent: string): Promise<void> { this.fail(); }
  async saveInheritances(_relationships: Array<{ child: string; parent: string }>): Promise<void> { this.fail(); }
  async getParents(_fqn: string): Promise<string[]> { return this.fail(); }
  async getChildren(_fqn: string): Promise<string[]> { return this.fail(); }
  async deleteInheritance(_fqn: string): Promise<void> { this.fail(); }
  async saveFile(_file: FileInfo): Promise<void> { this.fail(); }
  async getFile(_path: string): Promise<FileInfo | undefined> { return this.fail(); }
  async getAllFiles(): Promise<FileInfo[]> { return this.fail(); }
  async deleteFile(_path: string): Promise<void> { this.fail(); }
  async getStats(): Promise<IndexStats> { return this.fail(); }
  async clear(): Promise<void> { this.fail(); }
  async flush(): Promise<void> { /* noop - stub */ }
  async close(): Promise<void> { /* noop - stub */ }
  async beginTransaction(): Promise<void> { this.fail(); }
  async commitTransaction(): Promise<void> { this.fail(); }
  async rollbackTransaction(): Promise<void> { this.fail(); }
}
