/**
 * Storage abstraction for Java index data
 * Enables multiple backend implementations (SQLite, file shards, etc.)
 * while maintaining zero-config deployment
 */

import { SymbolStub, Reference, CallGraphEdge, FileInfo } from '../memory-index.js';

export interface IndexStats {
  symbols: number;
  indexedFiles: number;
  allFiles: number;
  references: number;
  callGraphEdges: number;
  inheritanceRelations: number;
}

export interface StorageQueryOptions {
  limit?: number;
  offset?: number;
}

/**
 * Abstraction for index storage backend
 * Implementations: SqliteStorage (fast), FileShardStorage (fallback)
 */
export interface IIndexStorage {
  /**
   * Initialize storage (create tables, directories, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Check if storage exists and has data
   */
  exists(): Promise<boolean>;

  /**
   * Save a symbol
   */
  saveSymbol(symbol: SymbolStub): Promise<void>;

  /**
   * Save multiple symbols (batch operation)
   */
  saveSymbols(symbols: SymbolStub[]): Promise<void>;

  /**
   * Get symbol by FQN
   */
  getSymbol(fqn: string): Promise<SymbolStub | undefined>;

  /**
   * Find symbols by name or FQN (partial match)
   */
  findSymbols(nameOrFqn: string, options?: StorageQueryOptions): Promise<SymbolStub[]>;

  /**
   * Get all symbols (for semantic search) - with pagination
   */
  getAllSymbols(options?: StorageQueryOptions): Promise<SymbolStub[]>;

  /**
   * Delete symbol by FQN
   */
  deleteSymbol(fqn: string): Promise<void>;

  /**
   * Save a reference
   */
  saveReference(ref: Reference): Promise<void>;

  /**
   * Save multiple references (batch operation)
   */
  saveReferences(refs: Reference[]): Promise<void>;

  /**
   * Find all references to a symbol
   */
  findUsages(fqn: string): Promise<Reference[]>;

  /**
   * Delete all references in a file
   */
  deleteReferencesByFile(file: string): Promise<void>;

  /**
   * Save call graph edge
   */
  saveCallEdge(edge: CallGraphEdge, direction: 'forward' | 'reverse'): Promise<void>;

  /**
   * Save multiple call graph edges (batch operation)
   */
  saveCallEdges(edges: CallGraphEdge[], direction: 'forward' | 'reverse'): Promise<void>;

  /**
   * Get outbound calls (what this method calls)
   */
  getOutboundCalls(fqn: string): Promise<CallGraphEdge[]>;

  /**
   * Get inbound calls (who calls this method)
   */
  getInboundCalls(fqn: string): Promise<CallGraphEdge[]>;

  /**
   * Delete call graph edges for a file
   */
  deleteCallEdgesByFile(file: string): Promise<void>;

  /**
   * Save inheritance relationship
   */
  saveInheritance(child: string, parent: string): Promise<void>;

  /**
   * Save multiple inheritance relationships (batch)
   */
  saveInheritances(relationships: Array<{ child: string; parent: string }>): Promise<void>;

  /**
   * Get parent classes/interfaces
   */
  getParents(fqn: string): Promise<string[]>;

  /**
   * Get child classes/implementations
   */
  getChildren(fqn: string): Promise<string[]>;

  /**
   * Delete inheritance relationships for a class
   */
  deleteInheritance(fqn: string): Promise<void>;

  /**
   * Save file metadata
   */
  saveFile(file: FileInfo): Promise<void>;

  /**
   * Get file metadata
   */
  getFile(path: string): Promise<FileInfo | undefined>;

  /**
   * Get all indexed files
   */
  getAllFiles(): Promise<FileInfo[]>;

  /**
   * Delete file and all its data (symbols, references, etc.)
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Get storage statistics
   */
  getStats(): Promise<IndexStats>;

  /**
   * Clear all data
   */
  clear(): Promise<void>;

  /**
   * Close storage (cleanup resources)
   */
  close(): Promise<void>;

  /**
   * Begin transaction (for batch operations)
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit transaction
   */
  commitTransaction(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollbackTransaction(): Promise<void>;
}
