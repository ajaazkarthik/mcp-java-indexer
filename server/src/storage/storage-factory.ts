/**
 * Storage factory - better-sqlite3 ONLY (no fallbacks)
 * 
 * Designed for large indexes up to 5GB+. sql.js and file-shard are disabled.
 * Requires native C++ build tools on Windows (VS Build Tools with C++ workload).
 */

import { IIndexStorage } from './index-storage.js';

export type StorageType = 'better-sqlite3';

export class StorageFactory {
  private static detectedType: StorageType | null = null;

  /**
   * Create storage instance - requires better-sqlite3
   */
  static async create(indexDir: string): Promise<IIndexStorage> {
    const type = await this.detectStorageType();
    
    if (type === 'better-sqlite3') {
      console.error('🚀 Using better-sqlite3 storage (native, optimal for 5GB+ indexes)');
      const { SqliteStorage } = await import('./sqlite-storage.js');
      const storage = new SqliteStorage(indexDir);
      await storage.initialize();
      return storage;
    }

    throw new Error('better-sqlite3 is required but not available. Install VS Build Tools with C++ workload, then: npm install better-sqlite3');
  }

  /**
   * Detect storage type (better-sqlite3 only, no fallbacks)
   */
  private static async detectStorageType(): Promise<StorageType> {
    if (this.detectedType) {
      return this.detectedType;
    }

    try {
      await import('better-sqlite3');
      this.detectedType = 'better-sqlite3';
      console.error('✅ better-sqlite3 available (native performance)');
      return 'better-sqlite3';
    } catch {
      console.error('❌ better-sqlite3 not available');
      throw new Error('better-sqlite3 is required. On Windows: install VS Build Tools with C++ workload, then npm install better-sqlite3');
    }
  }

  /**
   * Get detected storage type
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
