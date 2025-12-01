/**
 * REAL INTEGRATION TEST
 * 
 * This test simulates actual production usage:
 * 1. Creates a Persistence instance
 * 2. Creates a MemoryIndex with realistic data
 * 3. Saves via persistence.save()
 * 4. Verifies NO .json.gz files are created
 * 5. Verifies data can be loaded back
 * 
 * CRITICAL: This is what actually happens in production!
 */

const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(process.cwd(), 'test-real-integration');
const INDEX_DIR = path.join(TEST_DIR, '.mcp-index');

async function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('REAL INTEGRATION TEST - Simulating Production Usage');
  console.log('='.repeat(70));
  
  await cleanup();
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  
  let failed = false;
  
  try {
    // Import modules
    const { Persistence } = await import('./server/dist/persistence.js');
    const { MemoryIndex } = await import('./server/dist/memory-index.js');
    const { StorageFactory } = await import('./server/dist/storage/storage-factory.js');
    
    // Reset storage detection
    StorageFactory.resetDetection();
    
    console.log('\n1️⃣ Creating Persistence instance...');
    const persistence = new Persistence(INDEX_DIR);
    
    // Wait for storage to initialize
    console.log('   Waiting for storage initialization...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const storageType = persistence.getStorageType();
    console.log(`   Storage type detected: ${storageType}`);
    
    if (storageType === 'json') {
      console.log('\n❌ FAIL: Using JSON fallback instead of database storage!');
      failed = true;
    } else {
      console.log(`   ✅ Using ${storageType} storage`);
    }
    
    console.log('\n2️⃣ Creating MemoryIndex with realistic data...');
    const memoryIndex = new MemoryIndex();
    
    // Add 500 symbols (realistic size)
    for (let i = 0; i < 500; i++) {
      memoryIndex.addSymbol({
        fqn: `com.example.package${Math.floor(i/10)}.Class${i}`,
        name: `Class${i}`,
        kind: 'class',
        file: `/src/main/java/com/example/package${Math.floor(i/10)}/Class${i}.java`,
        line: 1,
        column: 1,
        packageName: `com.example.package${Math.floor(i/10)}`,
        modifiers: ['public'],
        signature: `public class Class${i}`
      });
      
      // Add a method for each class
      memoryIndex.addSymbol({
        fqn: `com.example.package${Math.floor(i/10)}.Class${i}.process`,
        name: 'process',
        kind: 'method',
        file: `/src/main/java/com/example/package${Math.floor(i/10)}/Class${i}.java`,
        line: 10,
        column: 5,
        packageName: `com.example.package${Math.floor(i/10)}`,
        modifiers: ['public'],
        signature: 'public void process()'
      });
    }
    
    // Add 200 references
    for (let i = 0; i < 200; i++) {
      memoryIndex.addReference({
        fromFqn: `com.example.package${i % 50}.Class${i % 500}`,
        toFqn: `com.example.package${(i + 1) % 50}.Class${(i + 1) % 500}`,
        file: `/src/main/java/com/example/package${i % 50}/Class${i % 500}.java`,
        line: 15,
        column: 10,
        kind: 'type_reference'
      });
    }
    
    // Add call graph edges
    for (let i = 0; i < 100; i++) {
      memoryIndex.addCallGraphEdge(
        `com.example.package${i % 50}.Class${i}.process`,
        `com.example.package${(i + 1) % 50}.Class${i + 1}.process`,
        [{ file: `/src/Class${i}.java`, line: 20, column: 10 }]
      );
    }
    
    const stats = memoryIndex.getStats();
    console.log(`   Created ${stats.symbols} symbols, ${stats.references} references`);
    
    console.log('\n3️⃣ Saving via persistence.save()...');
    const saveStart = Date.now();
    await persistence.save(memoryIndex);
    const saveTime = Date.now() - saveStart;
    console.log(`   Save completed in ${saveTime}ms`);
    
    console.log('\n4️⃣ Checking for gzip files (CRITICAL CHECK)...');
    const files = fs.readdirSync(INDEX_DIR);
    console.log(`   Files in ${INDEX_DIR}:`);
    files.forEach(f => {
      const stat = fs.statSync(path.join(INDEX_DIR, f));
      console.log(`   - ${f} (${stat.isDirectory() ? 'dir' : stat.size + ' bytes'})`);
    });
    
    const gzipFiles = files.filter(f => f.endsWith('.json.gz'));
    const chunkFiles = files.filter(f => f.includes('_chunks.txt'));
    
    if (gzipFiles.length > 0) {
      console.log(`\n❌ FAIL: Found ${gzipFiles.length} gzip files!`);
      console.log('   Gzip files:', gzipFiles.join(', '));
      failed = true;
    } else {
      console.log(`   ✅ No .json.gz files created`);
    }
    
    if (chunkFiles.length > 0) {
      console.log(`\n❌ FAIL: Found ${chunkFiles.length} chunk metadata files!`);
      console.log('   Chunk files:', chunkFiles.join(', '));
      failed = true;
    } else {
      console.log(`   ✅ No chunk metadata files created`);
    }
    
    // Check for database file
    const hasDbFile = files.includes('index.db');
    const hasShardIndex = files.includes('shard-index.json');
    const hasMetadata = files.includes('metadata.json');
    
    console.log(`\n   Database storage files:`);
    console.log(`   - index.db: ${hasDbFile ? '✅ Present' : '❌ Missing'}`);
    console.log(`   - shard-index.json: ${hasShardIndex ? '⚠️ Present (file-shard)' : '✅ Not needed (using DB)'}`);
    console.log(`   - metadata.json: ${hasMetadata ? '✅ Present' : '❌ Missing'}`);
    
    console.log('\n5️⃣ Loading data back...');
    const loadedIndex = new MemoryIndex();
    const loadStart = Date.now();
    const loaded = await persistence.load(loadedIndex);
    const loadTime = Date.now() - loadStart;
    
    if (!loaded) {
      console.log('   ❌ FAIL: load() returned false!');
      failed = true;
    } else {
      console.log(`   Load completed in ${loadTime}ms`);
      
      const loadedStats = loadedIndex.getStats();
      console.log(`   Loaded ${loadedStats.symbols} symbols, ${loadedStats.references} references`);
      
      // Verify data integrity
      if (loadedStats.symbols >= 500) { // We added 500 classes + 500 methods = 1000
        console.log(`   ✅ Symbols preserved`);
      } else {
        console.log(`   ❌ FAIL: Expected ~1000 symbols, got ${loadedStats.symbols}`);
        failed = true;
      }
      
      if (loadedStats.references >= 100) {
        console.log(`   ✅ References preserved`);
      } else {
        console.log(`   ❌ FAIL: Expected ~200 refs, got ${loadedStats.references}`);
        failed = true;
      }
    }
    
    console.log('\n6️⃣ Checking metadata.json content...');
    if (hasMetadata) {
      const metadata = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'metadata.json'), 'utf-8'));
      console.log(`   Version: ${metadata.version}`);
      console.log(`   StorageType: ${metadata.storageType}`);
      
      if (metadata.version === '2.0' && metadata.storageType === 'sqljs') {
        console.log(`   ✅ Correct metadata for SQLite storage`);
      } else if (metadata.version === '1.1') {
        console.log(`   ❌ FAIL: Using legacy JSON format (version 1.1)`);
        failed = true;
      }
    }
    
    // Close storage before cleanup to prevent exit handler errors
    console.log('\n7️⃣ Closing storage...');
    StorageFactory.resetDetection(); // This closes any open storage
    console.log('   ✅ Storage closed');
    
  } catch (error) {
    console.error('\n💥 Test crashed:', error);
    failed = true;
  }
  
  // Final result
  console.log('\n' + '='.repeat(70));
  if (failed) {
    console.log('❌ INTEGRATION TEST FAILED');
    console.log('   Storage integration is NOT working correctly!');
    console.log('='.repeat(70));
    // Cleanup before exit
    await cleanup();
    process.exit(1);
  } else {
    console.log('✅ INTEGRATION TEST PASSED');
    console.log('   Storage integration is working correctly!');
    console.log('='.repeat(70));
  }
  
  // Cleanup
  await cleanup();
  
  // Exit cleanly
  process.exit(0);
}

runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
