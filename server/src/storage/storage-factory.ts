/**
 * Storage factory - auto-detects best available storage backend
 * Tries SQLite first (fast), falls back to file shards if needed
 */

import { IIndexStorage } from './index-storage.js';
import { SqliteStorage } from './sqlite-storage.js';
import { FileShardStorage } from './file-shard-storage.js';

export type StorageType = 'sqlite' | 'file-shard';

export class StorageFactory {
  private static detectedType: StorageType | null = null;

  /**
   * Create storage instance - auto-detects best available backend
   */
  static async create(indexDir: string): Promise<IIndexStorage> {
    const type = await this.detectStorageType();
    
    if (type === 'sqlite') {
      console.error('🚀 Using SQLite storage (high performance)');
      const storage = new SqliteStorage(indexDir);
      await storage.initialize();
      return storage;
    } else {
      console.error('📁 Using file shard storage (fallback mode)');
      const storage = new FileShardStorage(indexDir);
      await storage.initialize();
      return storage;
    }
  }

  /**
   * Detect which storage type to use
   * Caches result to avoid repeated detection
   */
  private static async detectStorageType(): Promise<StorageType> {
    if (this.detectedType) {
      return this.detectedType;
    }

    // Try to load better-sqlite3
    try {
      await import('better-sqlite3');
      this.detectedType = 'sqlite';
      return 'sqlite';
    } catch (error) {
      console.error('⚠️  better-sqlite3 not available, using file shard fallback');
      console.error('   (To enable SQLite: npm install better-sqlite3)');
      this.detectedType = 'file-shard';
      return 'file-shard';
    }
  }

  /**
   * Get detected storage type (for debugging)
   */
  static getDetectedType(): StorageType | null {
    return this.detectedType;
  }
}
