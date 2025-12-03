/**
 * Storage factory - auto-detects best available storage backend
 * Priority: better-sqlite3 (fastest) -> sql.js (zero-config)
 * 
 * NOTE: File shard storage is DISABLED. Only database backends are supported.
 * To re-enable file storage, uncomment the file-shard fallback code below.
 */

import { IIndexStorage } from './index-storage.js';
// File shard storage is disabled - uncomment to re-enable
// import { FileShardStorage } from './file-shard-storage.js';

export type StorageType = 'better-sqlite3' | 'sqljs';
// To re-enable file storage, change to: export type StorageType = 'better-sqlite3' | 'sqljs' | 'file-shard';

export class StorageFactory {
  private static detectedType: StorageType | null = null;

  /**
   * Create storage instance - auto-detects best available backend
   * Priority:
   * 1. better-sqlite3 (native, fastest) - requires C++ compilation
   * 2. sql.js (WebAssembly, zero-config) - works everywhere, slightly slower
   * 
   * NOTE: File shard storage is DISABLED. Database backend is required.
   */
  static async create(indexDir: string): Promise<IIndexStorage> {
    const type = await this.detectStorageType();
    
    if (type === 'better-sqlite3') {
      console.error('🚀 Using better-sqlite3 storage (native, fastest)');
      const { SqliteStorage } = await import('./sqlite-storage.js');
      const storage = new SqliteStorage(indexDir);
      await storage.initialize();
      return storage;
    } else if (type === 'sqljs') {
      console.error('🔷 Using sql.js storage (WebAssembly, zero-config)');
      const { SqlJsStorage } = await import('./sqljs-storage.js');
      const storage = new SqlJsStorage(indexDir);
      await storage.initialize();
      return storage;
    } else {
      // File shard storage is disabled - throw error instead
      throw new Error('No database backend available. Please install sql.js: npm install sql.js');
      
      // To re-enable file storage, uncomment the following:
      // console.error('📁 Using file shard storage (fallback mode)');
      // const storage = new FileShardStorage(indexDir);
      // await storage.initialize();
      // return storage;
    }
  }

  /**
   * Detect which storage type to use
   * Caches result to avoid repeated detection
   * 
   * NOTE: File shard fallback is DISABLED. Will throw if no DB available.
   */
  private static async detectStorageType(): Promise<StorageType> {
    if (this.detectedType) {
      return this.detectedType;
    }

    // Try better-sqlite3 first (native, fastest)
    try {
      await import('better-sqlite3');
      this.detectedType = 'better-sqlite3';
      console.error('✅ better-sqlite3 available (native performance)');
      return 'better-sqlite3';
    } catch (error) {
      // better-sqlite3 not available - this is expected and fine
    }

    // Try sql.js (WebAssembly, zero-config)
    try {
      await import('sql.js');
      this.detectedType = 'sqljs';
      console.error('✅ sql.js available (zero-config WebAssembly)');
      return 'sqljs';
    } catch (error) {
      console.error('❌ sql.js not available');
    }

    // File shard fallback is DISABLED - throw error
    throw new Error('No database backend available. Please install sql.js: npm install sql.js');
    
    // To re-enable file storage, uncomment the following:
    // console.error('⚠️  sql.js not available, using file shard fallback');
    // this.detectedType = 'file-shard';
    // return 'file-shard';
  }

  /**
   * Get detected storage type (for debugging)
   */
  static getDetectedType(): StorageType | null {
    return this.detectedType;
  }

  /**
   * Reset detection (for testing)
   */
  static resetDetection(): void {
    this.detectedType = null;
  }
}
