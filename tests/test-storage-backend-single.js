#!/usr/bin/env node

/**
 * Verifies:
 * 1. Only better-sqlite3 backend is available (no sql.js/file-shard fallback)
 * 2. SqljsStorage and FileShardStorage throw errors if instantiated
 * 3. Storage operations work correctly with better-sqlite3
 */

const fs = require('fs/promises');
const path = require('path');
const os = require('os');

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-index-test-'));
  const indexDir = path.join(tmpDir, '.mcp-index');

  const { StorageFactory } = await import('../server/dist/storage/storage-factory.js');
  const { SqljsStorage } = await import('../server/dist/storage/sqljs-storage.js');
  const { FileShardStorage } = await import('../server/dist/storage/file-shard-storage.js');

  // Reset detection to avoid cached value from previous tests
  StorageFactory.resetDetection();

  let storage;
  try {
    // Test 1: StorageFactory creates better-sqlite3 instance
    storage = await StorageFactory.create(indexDir);

    const detected = StorageFactory.getDetectedType();
    if (detected !== 'better-sqlite3') {
      throw new Error(`Expected detected type better-sqlite3, got ${detected}`);
    }

    if (!storage || storage.constructor.name !== 'SqliteStorage') {
      throw new Error(`Expected SqliteStorage instance, got ${storage?.constructor?.name}`);
    }

    console.log('✅ Storage factory selects better-sqlite3 and returns SqliteStorage');

    // Test 2: Verify SqljsStorage is disabled
    const sqljsStorage = new SqljsStorage(indexDir);
    try {
      await sqljsStorage.initialize();
      throw new Error('SqljsStorage should have thrown but did not');
    } catch (e) {
      if (!e.message.includes('disabled')) {
        throw new Error(`SqljsStorage should throw disabled error, got: ${e.message}`);
      }
      console.log('✅ SqljsStorage throws disabled error');
    }

    // Test 3: Verify FileShardStorage is disabled
    const fileShardStorage = new FileShardStorage(indexDir);
    try {
      await fileShardStorage.initialize();
      throw new Error('FileShardStorage should have thrown but did not');
    } catch (e) {
      if (!e.message.includes('disabled')) {
        throw new Error(`FileShardStorage should throw disabled error, got: ${e.message}`);
      }
      console.log('✅ FileShardStorage throws disabled error');
    }

    // Test 4: Verify basic storage operations work
    await storage.saveSymbol({
      fqn: 'com.test.TestClass',
      name: 'TestClass',
      kind: 'class',
      file: '/test/TestClass.java',
      line: 1,
      column: 0,
      packageName: 'com.test'
    });

    const symbol = await storage.getSymbol('com.test.TestClass');
    if (!symbol || symbol.name !== 'TestClass') {
      throw new Error('Failed to save/retrieve symbol');
    }
    console.log('✅ better-sqlite3 storage operations work correctly');

    // Test 5: Verify stats
    const stats = await storage.getStats();
    if (stats.symbols !== 1) {
      throw new Error(`Expected 1 symbol in stats, got ${stats.symbols}`);
    }
    console.log('✅ Storage stats work correctly');

    console.log('\n✅ All backend enforcement tests passed!');
  } finally {
    try {
      if (storage) {
        await storage.clear();
        await storage.close();
      }
    } catch (e) {
      // ignore cleanup errors
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('❌ test-storage-backend-single failed:', err.message || err);
  process.exitCode = 1;
});
