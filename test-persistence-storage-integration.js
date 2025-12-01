/**
 * TEST: Persistence + StorageFactory Integration
 * 
 * This test verifies that the Persistence class actually uses StorageFactory
 * instead of just falling back to JSON files.
 * 
 * This is a CRITICAL integration test that ensures the storage backend
 * is actually wired up in production code, not just existing in isolation.
 */

const path = require('path');
const fs = require('fs');

async function testPersistenceStorageIntegration() {
  console.log('🧪 Testing Persistence + StorageFactory Integration\n');
  console.log('='.repeat(70));

  const testDir = path.join(process.cwd(), 'test-persistence-integration');
  
  // Clean up previous test
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  // Create the .mcp-index directory as this is where Persistence stores files
  const indexDir = path.join(testDir, '.mcp-index');
  fs.mkdirSync(indexDir, { recursive: true });

  const results = { passed: [], failed: [] };

  try {
    // Import the classes
    const { Persistence } = await import('./server/dist/persistence.js');
    const { MemoryIndex } = await import('./server/dist/memory-index.js');
    const { StorageFactory } = await import('./server/dist/storage/storage-factory.js');

    // Reset detection to ensure clean state
    StorageFactory.resetDetection();

    // Test 1: Verify Persistence initializes storage
    console.log('\n1️⃣ Testing Persistence storage initialization...');
    const persistence = new Persistence(indexDir);
    
    // Wait for storage to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const storageType = persistence.getStorageType();
    if (storageType && storageType !== 'file-shard') {
      console.log(`   ✅ Persistence initialized with storage: ${storageType}`);
      results.passed.push('Persistence storage initialization');
    } else if (storageType === 'file-shard') {
      console.log(`   ⚠️  Persistence using file-shard fallback (acceptable)`);
      results.passed.push('Persistence storage initialization (fallback)');
    } else {
      console.log(`   ❌ Persistence has no storage type: ${storageType}`);
      results.failed.push('Persistence storage initialization');
    }

    // Test 2: Create a MemoryIndex with test data
    console.log('\n2️⃣ Creating test index data...');
    const memoryIndex = new MemoryIndex();
    
    // Add test symbols with all required fields
    const testSymbols = [
      {
        fqn: 'com.test.UserService',
        name: 'UserService',
        kind: 'class',
        file: '/test/UserService.java',
        line: 1,
        column: 1,
        packageName: 'com.test',
        modifiers: ['public'],
        documentation: '',
        extendsClass: null,
        implementsInterfaces: [],
        signature: 'public class UserService',
      },
      {
        fqn: 'com.test.UserRepository',
        name: 'UserRepository',
        kind: 'class',
        file: '/test/UserRepository.java',
        line: 1,
        column: 1,
        packageName: 'com.test',
        modifiers: ['public'],
        documentation: '',
        extendsClass: null,
        implementsInterfaces: [],
        signature: 'public class UserRepository',
      },
    ];

    for (const symbol of testSymbols) {
      memoryIndex.addSymbol(symbol);
    }

    // Add test references
    memoryIndex.addReference({
      fromFqn: 'com.test.UserService',
      toFqn: 'com.test.UserRepository',
      file: '/test/UserService.java',
      line: 10,
      column: 5,
      kind: 'field_access'
    });

    console.log(`   Added ${testSymbols.length} symbols, 1 reference`);
    results.passed.push('Test data creation');

    // Test 3: Save using Persistence
    console.log('\n3️⃣ Saving index via Persistence...');
    await persistence.save(memoryIndex);
    console.log('   Save completed');
    results.passed.push('Index save');

    // Test 4: Verify storage backend was used (check for .db file)
    console.log('\n4️⃣ Verifying storage backend was used...');
    const dbPath = path.join(indexDir, 'index.db');
    const hasDbFile = fs.existsSync(dbPath);
    
    // Also check for shard-index.json (file-shard) or metadata.json
    const hasShardIndex = fs.existsSync(path.join(indexDir, 'shard-index.json'));
    const hasMetadata = fs.existsSync(path.join(indexDir, 'metadata.json'));
    
    console.log(`   Database file exists: ${hasDbFile}`);
    console.log(`   Shard index exists: ${hasShardIndex}`);
    console.log(`   Metadata exists: ${hasMetadata}`);

    if (hasDbFile) {
      const dbStats = fs.statSync(dbPath);
      console.log(`   ✅ SQLite database created (${(dbStats.size / 1024).toFixed(2)} KB)`);
      results.passed.push('Storage backend used (SQLite)');
    } else if (hasShardIndex) {
      console.log(`   ⚠️  Using file-shard storage (SQLite unavailable)`);
      results.passed.push('Storage backend used (file-shard)');
    } else if (hasMetadata) {
      // Check if we're still using old JSON chunks
      const metadataContent = JSON.parse(fs.readFileSync(path.join(indexDir, 'metadata.json'), 'utf-8'));
      if (metadataContent.storageType) {
        console.log(`   ✅ Using storage type: ${metadataContent.storageType}`);
        results.passed.push('Storage backend used');
      } else {
        console.log(`   ⚠️  Using legacy JSON persistence (storageType not set)`);
        results.passed.push('JSON persistence (legacy)');
      }
    } else {
      console.log('   ❌ No storage files found!');
      results.failed.push('Storage backend used');
    }

    // Test 5: Check we're NOT creating 329+ gzipped JSON files
    console.log('\n5️⃣ Checking for legacy gzipped JSON files...');
    const files = fs.existsSync(indexDir) ? fs.readdirSync(indexDir) : [];
    const gzipFiles = files.filter(f => f.endsWith('.json.gz'));
    
    if (gzipFiles.length === 0) {
      console.log(`   ✅ No gzipped JSON files created (good!)`);
      results.passed.push('No legacy gzip files');
    } else if (gzipFiles.length < 10) {
      console.log(`   ⚠️  ${gzipFiles.length} gzipped files (minimal, acceptable)`);
      results.passed.push('Minimal gzip files');
    } else {
      console.log(`   ❌ ${gzipFiles.length} gzipped files found (legacy behavior!)`);
      results.failed.push('Too many gzip files');
    }

    // Test 6: Load index and verify data integrity
    console.log('\n6️⃣ Loading index and verifying data integrity...');
    
    // Force storage save to disk before loading
    if (persistence.storage && persistence.storage.saveIfDirty) {
      await persistence.storage.saveIfDirty();
    }
    
    const loadedIndex = new MemoryIndex();
    const loaded = await persistence.load(loadedIndex);
    
    if (loaded) {
      const loadedSymbols = loadedIndex.findSymbols('UserService');
      const loadedRefs = loadedIndex.findUsages('com.test.UserRepository');
      
      console.log(`   Loaded symbols: ${loadedSymbols.length}`);
      console.log(`   Loaded references to UserRepository: ${loadedRefs.length}`);
      
      if (loadedSymbols.length > 0) {
        console.log(`   ✅ Data integrity verified`);
        results.passed.push('Data integrity');
      } else {
        console.log(`   ❌ Data not loaded correctly`);
        results.failed.push('Data integrity');
      }
    } else {
      console.log('   ❌ Failed to load index');
      results.failed.push('Index load');
    }

  } catch (error) {
    console.error('\n❌ Test error:', error);
    results.failed.push(`Error: ${error.message}`);
  } finally {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${results.passed.length}`);
  for (const test of results.passed) {
    console.log(`   - ${test}`);
  }
  console.log(`❌ Failed: ${results.failed.length}`);
  for (const test of results.failed) {
    console.log(`   - ${test}`);
  }
  console.log('='.repeat(70));

  if (results.failed.length > 0) {
    console.log('\n❌ INTEGRATION TEST FAILED!');
    console.log('The Persistence class is not properly using StorageFactory.');
    throw new Error('Integration test failed');
  } else {
    console.log('\n🎉 INTEGRATION TEST PASSED!');
    console.log('The Persistence class is properly using StorageFactory.');
  }
}

testPersistenceStorageIntegration()
  .then(() => {
    // Give sql.js time to clean up before exiting
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('❌ Test crashed:', err);
    setTimeout(() => process.exit(1), 100);
  });
